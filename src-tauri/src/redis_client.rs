use crate::error::{AppError, AppResult};
use crate::models::*;
use redis::aio::ConnectionManager;
use redis::cluster_async::ClusterConnection;
use redis::{AsyncCommands, ConnectionAddr, ConnectionInfo, ProtocolVersion, RedisConnectionInfo};

/// Maximum number of collection elements fetched for a key's detail view.
/// Protects the UI (and memory) from multi-million element keys.
const MAX_ELEMENTS: isize = 1000;

/// A live connection — either a standalone/sentinel multiplexed manager or a
/// cluster-aware connection. Both implement `ConnectionLike`, so all operation
/// helpers below are generic over `impl ConnectionLike`.
#[derive(Clone)]
pub enum RedisConn {
    Standalone(ConnectionManager),
    Cluster(ClusterConnection),
}

/// Build a raw `Client` from a profile targeting a specific database.
/// Used both for the multiplexed manager and for dedicated Pub/Sub connections.
pub fn build_client(profile: &ConnectionProfile, db: i64) -> AppResult<redis::Client> {
    let addr = if profile.use_tls {
        ConnectionAddr::TcpTls {
            host: profile.host.clone(),
            port: profile.port,
            insecure: false,
            tls_params: None,
        }
    } else {
        ConnectionAddr::Tcp(profile.host.clone(), profile.port)
    };

    let conn_info = ConnectionInfo {
        addr,
        redis: RedisConnectionInfo {
            db,
            username: profile.username.clone().filter(|s| !s.is_empty()),
            password: profile.password.clone().filter(|s| !s.is_empty()),
            protocol: ProtocolVersion::RESP2,
        },
    };

    Ok(redis::Client::open(conn_info)?)
}

/// Build a `ConnectionManager` from a profile targeting a specific database.
/// A `ConnectionManager` multiplexes a single reconnecting connection, so we
/// build a fresh one whenever the selected database changes.
pub async fn build_manager(
    profile: &ConnectionProfile,
    db: i64,
) -> AppResult<ConnectionManager> {
    let client = build_client(profile, db)?;
    let manager = ConnectionManager::new(client).await?;
    Ok(manager)
}

/// Build a cluster-aware connection from the profile's seed nodes.
pub async fn build_cluster(profile: &ConnectionProfile) -> AppResult<ClusterConnection> {
    let scheme = if profile.use_tls { "rediss" } else { "redis" };
    let nodes: Vec<String> = profile
        .nodes
        .iter()
        .map(|n| n.trim())
        .filter(|n| !n.is_empty())
        .map(|n| format!("{scheme}://{n}"))
        .collect();
    if nodes.is_empty() {
        return Err(AppError::Other(
            "cluster mode requires at least one seed node".into(),
        ));
    }
    let mut builder = redis::cluster::ClusterClientBuilder::new(nodes);
    if let Some(u) = profile.username.clone().filter(|s| !s.is_empty()) {
        builder = builder.username(u);
    }
    if let Some(p) = profile.password.clone().filter(|s| !s.is_empty()) {
        builder = builder.password(p);
    }
    let client = builder.build()?;
    Ok(client.get_async_connection().await?)
}

/// Ask the configured sentinels for the current master's address.
pub async fn resolve_sentinel_master(profile: &ConnectionProfile) -> AppResult<(String, u16)> {
    let master = profile.sentinel_master.clone().unwrap_or_default();
    if master.trim().is_empty() {
        return Err(AppError::Other(
            "sentinel mode requires a master group name".into(),
        ));
    }
    for node in &profile.nodes {
        let node = node.trim();
        if node.is_empty() {
            continue;
        }
        let Ok(client) = redis::Client::open(format!("redis://{node}")) else {
            continue;
        };
        let Ok(mut conn) = client.get_multiplexed_async_connection().await else {
            continue;
        };
        let res: Result<Vec<String>, _> = redis::cmd("SENTINEL")
            .arg("get-master-addr-by-name")
            .arg(&master)
            .query_async(&mut conn)
            .await;
        if let Ok(v) = res {
            if v.len() == 2 {
                if let Ok(port) = v[1].parse::<u16>() {
                    return Ok((v[0].clone(), port));
                }
            }
        }
    }
    Err(AppError::Other(format!(
        "could not resolve master '{master}' from any sentinel"
    )))
}

/// Ping a server without keeping the connection. Returns the server version.
pub async fn probe(profile: &ConnectionProfile) -> AppResult<String> {
    let mut conn = build_manager(profile, profile.db).await?;
    let _: String = redis::cmd("PING").query_async(&mut conn).await?;
    Ok(server_version(&mut conn).await.unwrap_or_default())
}

/// Extract the redis_version field from `INFO server`.
pub async fn server_version(conn: &mut (impl redis::aio::ConnectionLike + Send)) -> AppResult<String> {
    let info: String = redis::cmd("INFO").arg("server").query_async(conn).await?;
    for line in info.lines() {
        if let Some(rest) = line.strip_prefix("redis_version:") {
            return Ok(rest.trim().to_string());
        }
    }
    Ok(String::new())
}

/// Return the configured number of databases and their key counts.
pub async fn databases(conn: &mut (impl redis::aio::ConnectionLike + Send)) -> AppResult<(i64, Vec<DatabaseInfo>)> {
    // CONFIG GET databases -> ["databases", "16"]
    let count: i64 = match redis::cmd("CONFIG")
        .arg("GET")
        .arg("databases")
        .query_async::<Vec<String>>(conn)
        .await
    {
        Ok(pair) if pair.len() == 2 => pair[1].parse().unwrap_or(16),
        _ => 16,
    };

    let keyspace: String = redis::cmd("INFO").arg("keyspace").query_async(conn).await?;
    let mut infos = Vec::new();
    for i in 0..count {
        let prefix = format!("db{i}:");
        let keys = keyspace
            .lines()
            .find(|l| l.starts_with(&prefix))
            .and_then(|l| l.split("keys=").nth(1))
            .and_then(|s| s.split(',').next())
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(0);
        infos.push(DatabaseInfo { index: i, keys });
    }
    Ok((count, infos))
}

/// Parse `CLUSTER NODES` into structured node info.
pub async fn cluster_nodes(
    conn: &mut (impl redis::aio::ConnectionLike + Send),
) -> AppResult<Vec<ClusterNode>> {
    let raw: String = redis::cmd("CLUSTER").arg("NODES").query_async(conn).await?;
    let mut nodes = Vec::new();
    for line in raw.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 8 {
            continue;
        }
        let flags = parts[2].to_string();
        let role = if flags.contains("master") {
            "master"
        } else {
            "replica"
        }
        .to_string();
        nodes.push(ClusterNode {
            id: parts[0].to_string(),
            addr: parts[1].split('@').next().unwrap_or(parts[1]).to_string(),
            role,
            flags,
            master_id: (parts[3] != "-").then(|| parts[3].to_string()),
            slots: if parts.len() > 8 {
                parts[8..].join(" ")
            } else {
                String::new()
            },
            connected: parts[7] == "connected",
        });
    }
    Ok(nodes)
}

/// One SCAN iteration, enriching each key with its type via a pipeline.
pub async fn scan(
    conn: &mut (impl redis::aio::ConnectionLike + Send),
    pattern: &str,
    cursor: &str,
    count: u32,
) -> AppResult<ScanResult> {
    let (next, keys): (String, Vec<String>) = redis::cmd("SCAN")
        .arg(cursor)
        .arg("MATCH")
        .arg(pattern)
        .arg("COUNT")
        .arg(count)
        .query_async(conn)
        .await?;

    let key_infos = if keys.is_empty() {
        Vec::new()
    } else {
        let mut pipe = redis::pipe();
        for k in &keys {
            pipe.cmd("TYPE").arg(k);
        }
        let types: Vec<String> = pipe.query_async(conn).await?;
        keys.into_iter()
            .zip(types)
            .map(|(key, key_type)| KeyInfo { key, key_type })
            .collect()
    };

    Ok(ScanResult {
        cursor: next,
        keys: key_infos,
    })
}

/// Scan an entire cluster by walking each master node in turn. The cursor is a
/// composite "nodeIndex:nodeCursor"; "0" starts from the first node and "0" is
/// returned once every node has been fully scanned.
pub async fn cluster_scan(
    nodes: &mut [(String, ConnectionManager)],
    pattern: &str,
    cursor: &str,
    count: u32,
) -> AppResult<ScanResult> {
    if nodes.is_empty() {
        return Ok(ScanResult {
            cursor: "0".into(),
            keys: vec![],
        });
    }
    let (idx, node_cursor) = parse_composite_cursor(cursor);
    if idx >= nodes.len() {
        return Ok(ScanResult {
            cursor: "0".into(),
            keys: vec![],
        });
    }
    let (_, conn) = &mut nodes[idx];
    let res = scan(conn, pattern, &node_cursor, count).await?;
    let next = if res.cursor == "0" {
        let n = idx + 1;
        if n >= nodes.len() {
            "0".to_string()
        } else {
            format!("{n}:0")
        }
    } else {
        format!("{idx}:{}", res.cursor)
    };
    Ok(ScanResult {
        cursor: next,
        keys: res.keys,
    })
}

fn parse_composite_cursor(cursor: &str) -> (usize, String) {
    if cursor.is_empty() || cursor == "0" {
        return (0, "0".to_string());
    }
    match cursor.split_once(':') {
        Some((i, c)) => (i.parse().unwrap_or(0), c.to_string()),
        None => (0, cursor.to_string()),
    }
}

/// Fetch full detail (type, ttl, size and typed value) for a single key.
pub async fn key_detail(conn: &mut (impl redis::aio::ConnectionLike + Send), key: &str) -> AppResult<KeyDetail> {
    let key_type: String = redis::cmd("TYPE").arg(key).query_async(conn).await?;
    let ttl: i64 = conn.ttl(key).await?;

    let (value, size) = match key_type.as_str() {
        "string" => {
            let v: Option<String> = conn.get(key).await?;
            let v = v.unwrap_or_default();
            let len = v.len() as i64;
            (RedisValue::String { value: v }, len)
        }
        "list" => {
            let len: i64 = conn.llen(key).await?;
            let items: Vec<String> = conn.lrange(key, 0, MAX_ELEMENTS - 1).await?;
            (RedisValue::List { items }, len)
        }
        "set" => {
            let len: i64 = conn.scard(key).await?;
            let members: Vec<String> = conn.smembers(key).await?;
            (RedisValue::Set { members }, len)
        }
        "hash" => {
            let len: i64 = conn.hlen(key).await?;
            let map: Vec<(String, String)> = conn.hgetall(key).await?;
            let fields = map
                .into_iter()
                .map(|(field, value)| HashField { field, value })
                .collect();
            (RedisValue::Hash { fields }, len)
        }
        "zset" => {
            let len: i64 = conn.zcard(key).await?;
            let raw: Vec<(String, f64)> = conn
                .zrange_withscores(key, 0, MAX_ELEMENTS - 1)
                .await?;
            let members = raw
                .into_iter()
                .map(|(member, score)| ZSetMember { member, score })
                .collect();
            (RedisValue::Zset { members }, len)
        }
        "stream" => {
            let len: i64 = redis::cmd("XLEN").arg(key).query_async(conn).await.unwrap_or(0);
            let entries = stream_entries(conn, key, MAX_ELEMENTS).await.unwrap_or_default();
            (RedisValue::Stream { length: len, entries }, len)
        }
        _ => (RedisValue::None, 0),
    };

    // MEMORY USAGE is best-effort (not available on very old servers).
    let memory: Option<i64> = redis::cmd("MEMORY")
        .arg("USAGE")
        .arg(key)
        .query_async(conn)
        .await
        .ok()
        .flatten();

    Ok(KeyDetail {
        key: key.to_string(),
        key_type,
        ttl,
        size,
        memory,
        value,
    })
}

// -------- write operations --------

pub async fn set_string(conn: &mut (impl redis::aio::ConnectionLike + Send), key: &str, value: &str) -> AppResult<()> {
    conn.set::<_, _, ()>(key, value).await?;
    Ok(())
}

pub async fn delete_key(conn: &mut (impl redis::aio::ConnectionLike + Send), key: &str) -> AppResult<bool> {
    let removed: i64 = conn.del(key).await?;
    Ok(removed > 0)
}

pub async fn rename_key(conn: &mut (impl redis::aio::ConnectionLike + Send), from: &str, to: &str) -> AppResult<()> {
    redis::cmd("RENAME")
        .arg(from)
        .arg(to)
        .query_async::<()>(conn)
        .await?;
    Ok(())
}

/// Set TTL in seconds. A value <= 0 removes the expiry (PERSIST).
pub async fn set_ttl(conn: &mut (impl redis::aio::ConnectionLike + Send), key: &str, ttl: i64) -> AppResult<()> {
    if ttl <= 0 {
        conn.persist::<_, ()>(key).await?;
    } else {
        conn.expire::<_, ()>(key, ttl).await?;
    }
    Ok(())
}

pub async fn hash_set(
    conn: &mut (impl redis::aio::ConnectionLike + Send),
    key: &str,
    field: &str,
    value: &str,
) -> AppResult<()> {
    conn.hset::<_, _, _, ()>(key, field, value).await?;
    Ok(())
}

pub async fn hash_del(conn: &mut (impl redis::aio::ConnectionLike + Send), key: &str, field: &str) -> AppResult<()> {
    conn.hdel::<_, _, ()>(key, field).await?;
    Ok(())
}

pub async fn list_push(
    conn: &mut (impl redis::aio::ConnectionLike + Send),
    key: &str,
    value: &str,
    left: bool,
) -> AppResult<()> {
    if left {
        conn.lpush::<_, _, ()>(key, value).await?;
    } else {
        conn.rpush::<_, _, ()>(key, value).await?;
    }
    Ok(())
}

pub async fn list_set(
    conn: &mut (impl redis::aio::ConnectionLike + Send),
    key: &str,
    index: isize,
    value: &str,
) -> AppResult<()> {
    conn.lset::<_, _, ()>(key, index, value).await?;
    Ok(())
}

/// Remove the element at `index` from a list. Redis has no direct op, so we
/// mark it with a unique sentinel via LSET, then LREM that sentinel.
pub async fn list_delete(
    conn: &mut (impl redis::aio::ConnectionLike + Send),
    key: &str,
    index: isize,
) -> AppResult<()> {
    let sentinel = format!("__rr_del__{}", uuid::Uuid::new_v4());
    conn.lset::<_, _, ()>(key, index, &sentinel).await?;
    redis::cmd("LREM")
        .arg(key)
        .arg(1)
        .arg(&sentinel)
        .query_async::<i64>(conn)
        .await?;
    Ok(())
}

pub async fn set_add(conn: &mut (impl redis::aio::ConnectionLike + Send), key: &str, member: &str) -> AppResult<()> {
    conn.sadd::<_, _, ()>(key, member).await?;
    Ok(())
}

pub async fn set_remove(conn: &mut (impl redis::aio::ConnectionLike + Send), key: &str, member: &str) -> AppResult<()> {
    conn.srem::<_, _, ()>(key, member).await?;
    Ok(())
}

pub async fn zset_add(
    conn: &mut (impl redis::aio::ConnectionLike + Send),
    key: &str,
    member: &str,
    score: f64,
) -> AppResult<()> {
    conn.zadd::<_, _, _, ()>(key, member, score).await?;
    Ok(())
}

pub async fn zset_remove(conn: &mut (impl redis::aio::ConnectionLike + Send), key: &str, member: &str) -> AppResult<()> {
    conn.zrem::<_, _, ()>(key, member).await?;
    Ok(())
}

/// Create a new empty-ish key of the requested type with an initial element.
pub async fn create_key(
    conn: &mut (impl redis::aio::ConnectionLike + Send),
    key: &str,
    key_type: &str,
) -> AppResult<()> {
    let exists: bool = conn.exists(key).await?;
    if exists {
        return Err(AppError::Other(format!("key '{key}' already exists")));
    }
    match key_type {
        "string" => set_string(conn, key, "").await?,
        "list" => list_push(conn, key, "new item", false).await?,
        "set" => set_add(conn, key, "new member").await?,
        "hash" => hash_set(conn, key, "field", "value").await?,
        "zset" => zset_add(conn, key, "member", 0.0).await?,
        other => return Err(AppError::Other(format!("unsupported type '{other}'"))),
    }
    Ok(())
}

// -------- diagnostics & advanced types --------

/// Parse `INFO` output into ordered named sections.
pub async fn server_info(conn: &mut (impl redis::aio::ConnectionLike + Send)) -> AppResult<Vec<InfoSection>> {
    let raw: String = redis::cmd("INFO").query_async(conn).await?;
    let mut sections: Vec<InfoSection> = Vec::new();
    for line in raw.lines() {
        let line = line.trim_end_matches('\r');
        if line.is_empty() {
            continue;
        }
        if let Some(name) = line.strip_prefix("# ") {
            sections.push(InfoSection {
                name: name.trim().to_string(),
                entries: Vec::new(),
            });
        } else if let Some((k, v)) = line.split_once(':') {
            if let Some(section) = sections.last_mut() {
                section.entries.push(InfoEntry {
                    key: k.to_string(),
                    value: v.to_string(),
                });
            }
        }
    }
    Ok(sections)
}

/// Fetch the slow log (most recent first).
pub async fn slowlog(conn: &mut (impl redis::aio::ConnectionLike + Send), count: i64) -> AppResult<Vec<SlowLogEntry>> {
    let val: redis::Value = redis::cmd("SLOWLOG")
        .arg("GET")
        .arg(count)
        .query_async(conn)
        .await?;
    let redis::Value::Array(items) = val else {
        return Ok(Vec::new());
    };
    let mut out = Vec::new();
    for item in items {
        let redis::Value::Array(f) = item else { continue };
        let command = match f.get(3) {
            Some(redis::Value::Array(parts)) => parts
                .iter()
                .map(as_string)
                .collect::<Vec<_>>()
                .join(" "),
            _ => String::new(),
        };
        out.push(SlowLogEntry {
            id: f.first().map(as_i64).unwrap_or(0),
            timestamp: f.get(1).map(as_i64).unwrap_or(0),
            duration_us: f.get(2).map(as_i64).unwrap_or(0),
            command,
            client_addr: f.get(4).map(as_string).unwrap_or_default(),
            client_name: f.get(5).map(as_string).unwrap_or_default(),
        });
    }
    Ok(out)
}

pub async fn slowlog_reset(conn: &mut (impl redis::aio::ConnectionLike + Send)) -> AppResult<()> {
    redis::cmd("SLOWLOG")
        .arg("RESET")
        .query_async::<()>(conn)
        .await?;
    Ok(())
}

/// Fetch stream entries newest-first via XREVRANGE.
pub async fn stream_entries(
    conn: &mut (impl redis::aio::ConnectionLike + Send),
    key: &str,
    count: isize,
) -> AppResult<Vec<StreamEntry>> {
    let val: redis::Value = redis::cmd("XREVRANGE")
        .arg(key)
        .arg("+")
        .arg("-")
        .arg("COUNT")
        .arg(count)
        .query_async(conn)
        .await?;
    let redis::Value::Array(items) = val else {
        return Ok(Vec::new());
    };
    let mut out = Vec::new();
    for item in items {
        let redis::Value::Array(pair) = item else { continue };
        let id = pair.first().map(as_string).unwrap_or_default();
        let mut fields = Vec::new();
        if let Some(redis::Value::Array(kv)) = pair.get(1) {
            let mut i = 0;
            while i + 1 < kv.len() {
                fields.push(HashField {
                    field: as_string(&kv[i]),
                    value: as_string(&kv[i + 1]),
                });
                i += 2;
            }
        }
        out.push(StreamEntry { id, fields });
    }
    Ok(out)
}

/// Coerce a redis value to i64 (handles integers and numeric bulk strings).
fn as_i64(v: &redis::Value) -> i64 {
    match v {
        redis::Value::Int(i) => *i,
        redis::Value::BulkString(b) => String::from_utf8_lossy(b).trim().parse().unwrap_or(0),
        redis::Value::SimpleString(s) => s.trim().parse().unwrap_or(0),
        _ => 0,
    }
}

/// Coerce a redis value to a display string.
fn as_string(v: &redis::Value) -> String {
    match v {
        redis::Value::BulkString(b) => String::from_utf8_lossy(b).into_owned(),
        redis::Value::SimpleString(s) => s.clone(),
        redis::Value::Int(i) => i.to_string(),
        redis::Value::Double(d) => d.to_string(),
        redis::Value::Nil => String::new(),
        other => format!("{other:?}"),
    }
}

/// Run a raw command (space-split) — powers a minimal CLI. Returns the reply
/// rendered to a human-readable string.
pub async fn raw_command(conn: &mut (impl redis::aio::ConnectionLike + Send), input: &str) -> AppResult<String> {
    let parts = split_args(input);
    if parts.is_empty() {
        return Ok(String::new());
    }
    let mut cmd = redis::cmd(&parts[0]);
    for arg in &parts[1..] {
        cmd.arg(arg);
    }
    let value: redis::Value = cmd.query_async(conn).await?;
    Ok(render_value(&value))
}



/// Split a command line honoring single and double quotes.
fn split_args(input: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    for c in input.trim().chars() {
        match quote {
            Some(q) if c == q => quote = None,
            Some(_) => cur.push(c),
            None if c == '\'' || c == '"' => quote = Some(c),
            None if c.is_whitespace() => {
                if !cur.is_empty() {
                    args.push(std::mem::take(&mut cur));
                }
            }
            None => cur.push(c),
        }
    }
    if !cur.is_empty() {
        args.push(cur);
    }
    args
}

/// Render a redis reply into a readable multi-line string for the CLI.
/// Only the long-stable `Value` variants are matched explicitly; anything else
/// falls back to a debug representation so this stays version-robust.
fn render_value(value: &redis::Value) -> String {
    match value {
        redis::Value::Nil => "(nil)".to_string(),
        redis::Value::Int(i) => format!("(integer) {i}"),
        redis::Value::SimpleString(s) => s.clone(),
        redis::Value::Okay => "OK".to_string(),
        redis::Value::BulkString(bytes) => String::from_utf8_lossy(bytes).into_owned(),
        redis::Value::Array(items) => items
            .iter()
            .enumerate()
            .map(|(i, v)| format!("{}) {}", i + 1, render_value(v)))
            .collect::<Vec<_>>()
            .join("\n"),
        redis::Value::Map(pairs) => pairs
            .iter()
            .map(|(k, v)| format!("{} => {}", render_value(k), render_value(v)))
            .collect::<Vec<_>>()
            .join("\n"),
        redis::Value::Double(d) => d.to_string(),
        other => format!("{other:?}"),
    }
}
