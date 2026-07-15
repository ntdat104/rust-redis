use crate::error::{AppError, AppResult};
use crate::models::*;
use crate::redis_client::RedisConn;
use crate::state::{AppState, ConnEntry};
use crate::{redis_client, store};
use futures_util::StreamExt;
use tauri::{AppHandle, Emitter, State};

/// Run `$body` against the concrete connection bound to `$c`, dispatching over
/// the standalone/cluster variants (both implement `ConnectionLike`).
macro_rules! on {
    ($conn:expr, |$c:ident| $body:expr) => {
        match $conn {
            RedisConn::Standalone($c) => $body,
            RedisConn::Cluster($c) => $body,
        }
    };
}

/// Clone the live connection for `id` and run `$body` against it.
macro_rules! with_conn {
    ($state:expr, $id:expr, |$c:ident| $body:expr) => {{
        let mut __c = conn_for($state, $id).await?;
        on!(&mut __c, |$c| $body)
    }};
}

/// Clone the multiplexed/cluster connection for an open connection so we never
/// hold the state lock across an `await`. Clones are cheap (shared handles).
async fn conn_for(state: &State<'_, AppState>, id: &str) -> AppResult<RedisConn> {
    let map = state.conns.lock().await;
    map.get(id)
        .map(|c| c.conn.clone())
        .ok_or_else(|| AppError::NotConnected(id.to_string()))
}

// ----------------------------------------------------------------------------
// Connection profiles (persisted)
// ----------------------------------------------------------------------------

#[tauri::command]
pub fn list_connections(app: AppHandle) -> AppResult<Vec<ConnectionProfile>> {
    store::load(&app)
}

#[tauri::command]
pub fn save_connection(
    app: AppHandle,
    mut profile: ConnectionProfile,
) -> AppResult<ConnectionProfile> {
    let mut profiles = store::load(&app)?;
    if profile.id.is_empty() {
        profile.id = uuid::Uuid::new_v4().to_string();
    }
    if let Some(existing) = profiles.iter_mut().find(|p| p.id == profile.id) {
        *existing = profile.clone();
    } else {
        profiles.push(profile.clone());
    }
    store::save_all(&app, &profiles)?;
    Ok(profile)
}

#[tauri::command]
pub fn delete_connection(app: AppHandle, id: String) -> AppResult<()> {
    let mut profiles = store::load(&app)?;
    profiles.retain(|p| p.id != id);
    store::save_all(&app, &profiles)
}

#[tauri::command]
pub async fn test_connection(profile: ConnectionProfile) -> AppResult<String> {
    match profile.mode.as_str() {
        "cluster" => {
            let mut conn = redis_client::build_cluster(&profile).await?;
            redis_client::server_version(&mut conn).await
        }
        "sentinel" => {
            let (host, port) = redis_client::resolve_sentinel_master(&profile).await?;
            let mut master = profile.clone();
            master.host = host;
            master.port = port;
            redis_client::probe(&master).await
        }
        _ => redis_client::probe(&profile).await,
    }
}

// ----------------------------------------------------------------------------
// Live connection lifecycle
// ----------------------------------------------------------------------------

async fn summarize(
    id: String,
    conn: &mut RedisConn,
    db: i64,
    profile: &ConnectionProfile,
) -> AppResult<ConnectionSummary> {
    let version = on!(&mut *conn, |c| redis_client::server_version(c).await)
        .unwrap_or_default();

    let (database_count, databases) = if profile.mode == "cluster" {
        // Cluster exposes a single logical database.
        let size: i64 = on!(&mut *conn, |c| redis::cmd("DBSIZE").query_async(c).await)
            .unwrap_or(0);
        (1, vec![DatabaseInfo { index: 0, keys: size }])
    } else {
        on!(&mut *conn, |c| redis_client::databases(c).await)?
    };

    Ok(ConnectionSummary {
        id,
        current_db: db,
        database_count,
        databases,
        server_version: version,
    })
}

#[tauri::command]
pub async fn open_connection(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<ConnectionSummary> {
    let profile = store::load(&app)?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| AppError::ProfileNotFound(id.clone()))?;

    // Build the connection and the "effective" profile (for sentinel, this is
    // the resolved master address, so later db-switches reconnect correctly).
    let mut cluster_conns: Vec<(String, redis::aio::ConnectionManager)> = Vec::new();
    let mut tunnel: Option<crate::ssh_tunnel::SshTunnel> = None;

    let (conn, effective, db) = match profile.mode.as_str() {
        "cluster" => {
            let cconn = redis_client::build_cluster(&profile).await?;
            // Build one plain connection per master for cluster-wide SCAN.
            let mut probe = cconn.clone();
            let nodes = redis_client::cluster_nodes(&mut probe).await.unwrap_or_default();
            for n in nodes.iter().filter(|n| n.role == "master") {
                if let Some((h, p)) = split_host_port(&n.addr) {
                    let mut np = profile.clone();
                    np.host = h;
                    np.port = p;
                    if let Ok(m) = redis_client::build_manager(&np, 0).await {
                        cluster_conns.push((n.addr.clone(), m));
                    }
                }
            }
            (RedisConn::Cluster(cconn), profile.clone(), 0)
        }
        "sentinel" => {
            let (host, port) = redis_client::resolve_sentinel_master(&profile).await?;
            let mut eff = profile.clone();
            eff.host = host;
            eff.port = port;
            let manager = redis_client::build_manager(&eff, profile.db).await?;
            (RedisConn::Standalone(manager), eff, profile.db)
        }
        _ if profile.use_ssh => {
            // Tunnel to the Redis host through SSH, then connect locally.
            let t = crate::ssh_tunnel::open(&profile, &profile.host, profile.port).await?;
            let mut eff = profile.clone();
            eff.host = "127.0.0.1".into();
            eff.port = t.local_port;
            eff.use_tls = false; // the SSH tunnel already encrypts the traffic
            let manager = redis_client::build_manager(&eff, profile.db).await?;
            tunnel = Some(t);
            (RedisConn::Standalone(manager), eff, profile.db)
        }
        _ => (
            RedisConn::Standalone(redis_client::build_manager(&profile, profile.db).await?),
            profile.clone(),
            profile.db,
        ),
    };

    let mut probe = conn.clone();
    let summary = summarize(id.clone(), &mut probe, db, &effective).await?;

    state.conns.lock().await.insert(
        id,
        ConnEntry {
            conn,
            db,
            profile: effective,
            cluster_conns,
            tunnel,
        },
    );
    Ok(summary)
}

/// Split "host:port" (keeping IPv6-safe on the last colon).
fn split_host_port(addr: &str) -> Option<(String, u16)> {
    addr.rsplit_once(':')
        .and_then(|(h, p)| p.parse::<u16>().ok().map(|p| (h.to_string(), p)))
}

#[tauri::command]
pub async fn close_connection(state: State<'_, AppState>, id: String) -> AppResult<()> {
    if let Some(handle) = state.pubsub.lock().await.remove(&id) {
        handle.abort();
    }
    state.conns.lock().await.remove(&id);
    Ok(())
}

#[tauri::command]
pub async fn select_database(
    state: State<'_, AppState>,
    id: String,
    db: i64,
) -> AppResult<ConnectionSummary> {
    let profile = {
        let map = state.conns.lock().await;
        map.get(&id)
            .map(|c| c.profile.clone())
            .ok_or_else(|| AppError::NotConnected(id.clone()))?
    };

    if profile.mode == "cluster" {
        return Err(AppError::Other(
            "database selection is not available in cluster mode".into(),
        ));
    }

    // `profile` here is the effective profile (already points at the tunnel's
    // local port for SSH, or the resolved master for sentinel).
    let manager = redis_client::build_manager(&profile, db).await?;
    let mut conn = RedisConn::Standalone(manager);
    let summary = summarize(id.clone(), &mut conn, db, &profile).await?;

    // Update in place so the SSH tunnel / cluster connections are preserved.
    let mut map = state.conns.lock().await;
    if let Some(entry) = map.get_mut(&id) {
        entry.conn = conn;
        entry.db = db;
    }
    Ok(summary)
}

#[tauri::command]
pub async fn db_size(state: State<'_, AppState>, id: String) -> AppResult<i64> {
    with_conn!(&state, &id, |c| {
        let n: i64 = redis::cmd("DBSIZE").query_async(c).await?;
        Ok(n)
    })
}

#[tauri::command]
pub async fn cluster_nodes(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Vec<ClusterNode>> {
    with_conn!(&state, &id, |c| redis_client::cluster_nodes(c).await)
}

// ----------------------------------------------------------------------------
// Keyspace browsing
// ----------------------------------------------------------------------------

#[tauri::command]
pub async fn scan_keys(
    state: State<'_, AppState>,
    id: String,
    pattern: String,
    cursor: String,
    count: u32,
) -> AppResult<ScanResult> {
    // Cluster connections have per-master handles → scan the whole cluster.
    let cluster = {
        let map = state.conns.lock().await;
        let entry = map
            .get(&id)
            .ok_or_else(|| AppError::NotConnected(id.clone()))?;
        entry.cluster_conns.clone()
    };
    if !cluster.is_empty() {
        let mut nodes = cluster;
        return redis_client::cluster_scan(&mut nodes, &pattern, &cursor, count).await;
    }
    with_conn!(&state, &id, |c| redis_client::scan(c, &pattern, &cursor, count).await)
}

#[tauri::command]
pub async fn get_key_detail(
    state: State<'_, AppState>,
    id: String,
    key: String,
) -> AppResult<KeyDetail> {
    with_conn!(&state, &id, |c| redis_client::key_detail(c, &key).await)
}

// ----------------------------------------------------------------------------
// Key write operations
// ----------------------------------------------------------------------------

#[tauri::command]
pub async fn set_string_value(
    state: State<'_, AppState>,
    id: String,
    key: String,
    value: String,
) -> AppResult<()> {
    with_conn!(&state, &id, |c| redis_client::set_string(c, &key, &value).await)
}

#[tauri::command]
pub async fn delete_key(state: State<'_, AppState>, id: String, key: String) -> AppResult<bool> {
    with_conn!(&state, &id, |c| redis_client::delete_key(c, &key).await)
}

#[tauri::command]
pub async fn rename_key(
    state: State<'_, AppState>,
    id: String,
    from: String,
    to: String,
) -> AppResult<()> {
    with_conn!(&state, &id, |c| redis_client::rename_key(c, &from, &to).await)
}

#[tauri::command]
pub async fn set_key_ttl(
    state: State<'_, AppState>,
    id: String,
    key: String,
    ttl: i64,
) -> AppResult<()> {
    with_conn!(&state, &id, |c| redis_client::set_ttl(c, &key, ttl).await)
}

#[tauri::command]
pub async fn create_key(
    state: State<'_, AppState>,
    id: String,
    key: String,
    key_type: String,
) -> AppResult<()> {
    with_conn!(&state, &id, |c| redis_client::create_key(c, &key, &key_type).await)
}

#[tauri::command]
pub async fn hash_set_field(
    state: State<'_, AppState>,
    id: String,
    key: String,
    field: String,
    value: String,
) -> AppResult<()> {
    with_conn!(&state, &id, |c| redis_client::hash_set(c, &key, &field, &value).await)
}

#[tauri::command]
pub async fn hash_delete_field(
    state: State<'_, AppState>,
    id: String,
    key: String,
    field: String,
) -> AppResult<()> {
    with_conn!(&state, &id, |c| redis_client::hash_del(c, &key, &field).await)
}

#[tauri::command]
pub async fn list_push_value(
    state: State<'_, AppState>,
    id: String,
    key: String,
    value: String,
    left: bool,
) -> AppResult<()> {
    with_conn!(&state, &id, |c| redis_client::list_push(c, &key, &value, left).await)
}

#[tauri::command]
pub async fn list_set_value(
    state: State<'_, AppState>,
    id: String,
    key: String,
    index: isize,
    value: String,
) -> AppResult<()> {
    with_conn!(&state, &id, |c| redis_client::list_set(c, &key, index, &value).await)
}

#[tauri::command]
pub async fn list_delete_index(
    state: State<'_, AppState>,
    id: String,
    key: String,
    index: isize,
) -> AppResult<()> {
    with_conn!(&state, &id, |c| redis_client::list_delete(c, &key, index).await)
}

#[tauri::command]
pub async fn set_add_member(
    state: State<'_, AppState>,
    id: String,
    key: String,
    member: String,
) -> AppResult<()> {
    with_conn!(&state, &id, |c| redis_client::set_add(c, &key, &member).await)
}

#[tauri::command]
pub async fn set_remove_member(
    state: State<'_, AppState>,
    id: String,
    key: String,
    member: String,
) -> AppResult<()> {
    with_conn!(&state, &id, |c| redis_client::set_remove(c, &key, &member).await)
}

#[tauri::command]
pub async fn zset_add_member(
    state: State<'_, AppState>,
    id: String,
    key: String,
    member: String,
    score: f64,
) -> AppResult<()> {
    with_conn!(&state, &id, |c| redis_client::zset_add(c, &key, &member, score).await)
}

#[tauri::command]
pub async fn zset_remove_member(
    state: State<'_, AppState>,
    id: String,
    key: String,
    member: String,
) -> AppResult<()> {
    with_conn!(&state, &id, |c| redis_client::zset_remove(c, &key, &member).await)
}

// ----------------------------------------------------------------------------
// Diagnostics
// ----------------------------------------------------------------------------

#[tauri::command]
pub async fn server_info(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Vec<InfoSection>> {
    with_conn!(&state, &id, |c| redis_client::server_info(c).await)
}

#[tauri::command]
pub async fn slow_log(
    state: State<'_, AppState>,
    id: String,
    count: i64,
) -> AppResult<Vec<SlowLogEntry>> {
    with_conn!(&state, &id, |c| redis_client::slowlog(c, count).await)
}

#[tauri::command]
pub async fn slow_log_reset(state: State<'_, AppState>, id: String) -> AppResult<()> {
    with_conn!(&state, &id, |c| redis_client::slowlog_reset(c).await)
}

// ----------------------------------------------------------------------------
// Pub/Sub — a dedicated connection streams messages to the frontend via the
// "pubsub-message" Tauri event.
// ----------------------------------------------------------------------------

#[tauri::command]
pub async fn pubsub_subscribe(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    channels: Vec<String>,
    patterns: Vec<String>,
) -> AppResult<()> {
    let (profile, db) = {
        let map = state.conns.lock().await;
        let entry = map
            .get(&id)
            .ok_or_else(|| AppError::NotConnected(id.clone()))?;
        (entry.profile.clone(), entry.db)
    };

    // A Pub/Sub listener needs a plain (non-cluster) connection to one node.
    let client = if profile.mode == "cluster" {
        let node = profile
            .nodes
            .first()
            .cloned()
            .ok_or_else(|| AppError::Other("no cluster node for pub/sub".into()))?;
        let (host, port) = node
            .rsplit_once(':')
            .and_then(|(h, p)| p.parse::<u16>().ok().map(|p| (h.to_string(), p)))
            .ok_or_else(|| AppError::Other(format!("invalid node address '{node}'")))?;
        let mut np = profile.clone();
        np.host = host;
        np.port = port;
        redis_client::build_client(&np, 0)?
    } else {
        redis_client::build_client(&profile, db)?
    };

    if let Some(handle) = state.pubsub.lock().await.remove(&id) {
        handle.abort();
    }

    let conn_id = id.clone();
    let app_handle = app.clone();

    let task = tokio::spawn(async move {
        let mut pubsub = match client.get_async_pubsub().await {
            Ok(p) => p,
            Err(e) => {
                let _ = app_handle.emit("pubsub-error", e.to_string());
                return;
            }
        };
        for ch in &channels {
            let _ = pubsub.subscribe(ch).await;
        }
        for p in &patterns {
            let _ = pubsub.psubscribe(p).await;
        }
        let mut stream = pubsub.into_on_message();
        while let Some(msg) = stream.next().await {
            let message = PubSubMessage {
                connection_id: conn_id.clone(),
                channel: msg.get_channel_name().to_string(),
                pattern: msg.get_pattern::<String>().ok(),
                payload: msg.get_payload().unwrap_or_default(),
            };
            let _ = app_handle.emit("pubsub-message", message);
        }
    });

    state.pubsub.lock().await.insert(id, task);
    Ok(())
}

#[tauri::command]
pub async fn pubsub_unsubscribe(state: State<'_, AppState>, id: String) -> AppResult<()> {
    if let Some(handle) = state.pubsub.lock().await.remove(&id) {
        handle.abort();
    }
    Ok(())
}

// ----------------------------------------------------------------------------
// CLI
// ----------------------------------------------------------------------------

#[tauri::command]
pub async fn run_command(
    state: State<'_, AppState>,
    id: String,
    command: String,
) -> AppResult<String> {
    with_conn!(&state, &id, |c| redis_client::raw_command(c, &command).await)
}
