use serde::{Deserialize, Serialize};

/// A saved connection profile. Persisted to disk (without touching the live
/// connection) so the user's servers survive app restarts.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub db: i64,
    #[serde(default)]
    pub use_tls: bool,
    /// "standalone" (default), "cluster", or "sentinel".
    #[serde(default = "default_mode")]
    pub mode: String,
    /// Seed nodes ("host:port") for cluster mode, or sentinel addresses for
    /// sentinel mode.
    #[serde(default)]
    pub nodes: Vec<String>,
    /// Master group name for sentinel mode.
    #[serde(default)]
    pub sentinel_master: Option<String>,

    // --- SSH tunnel (standalone mode) ---
    #[serde(default)]
    pub use_ssh: bool,
    #[serde(default)]
    pub ssh_host: Option<String>,
    #[serde(default)]
    pub ssh_port: Option<u16>,
    #[serde(default)]
    pub ssh_user: Option<String>,
    #[serde(default)]
    pub ssh_password: Option<String>,
    /// PEM-encoded private key contents (optional; alternative to password auth).
    #[serde(default)]
    pub ssh_private_key: Option<String>,
    #[serde(default)]
    pub ssh_passphrase: Option<String>,
}

fn default_mode() -> String {
    "standalone".to_string()
}

/// Lightweight key entry returned when scanning the keyspace.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyInfo {
    pub key: String,
    #[serde(rename = "type")]
    pub key_type: String,
}

/// Result of a single SCAN iteration.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    /// Cursor to pass to the next SCAN call. "0" means the scan is complete.
    pub cursor: String,
    pub keys: Vec<KeyInfo>,
}

/// A hash field/value pair.
#[derive(Debug, Clone, Serialize)]
pub struct HashField {
    pub field: String,
    pub value: String,
}

/// A sorted-set member with its score.
#[derive(Debug, Clone, Serialize)]
pub struct ZSetMember {
    pub member: String,
    pub score: f64,
}

/// A single stream entry (ID + its field/value pairs).
#[derive(Debug, Clone, Serialize)]
pub struct StreamEntry {
    pub id: String,
    pub fields: Vec<HashField>,
}

/// Typed value payload for a key, serialized as a discriminated union so the
/// frontend can switch on `type`.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum RedisValue {
    String { value: String },
    List { items: Vec<String> },
    Set { members: Vec<String> },
    Hash { fields: Vec<HashField> },
    Zset { members: Vec<ZSetMember> },
    Stream { length: i64, entries: Vec<StreamEntry> },
    None,
}

/// Full detail of a single key, returned when the user selects it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyDetail {
    pub key: String,
    #[serde(rename = "type")]
    pub key_type: String,
    /// TTL in seconds. -1 = no expiry, -2 = key does not exist.
    pub ttl: i64,
    /// Number of elements (length/cardinality), or byte length for strings.
    pub size: i64,
    /// Approximate memory footprint in bytes (MEMORY USAGE), if supported.
    pub memory: Option<i64>,
    pub value: RedisValue,
}

/// A single database slot plus its key count (from the keyspace section).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    pub index: i64,
    pub keys: i64,
}

/// A named section of the `INFO` output (e.g. "Memory", "Clients").
#[derive(Debug, Clone, Serialize)]
pub struct InfoSection {
    pub name: String,
    pub entries: Vec<InfoEntry>,
}

#[derive(Debug, Clone, Serialize)]
pub struct InfoEntry {
    pub key: String,
    pub value: String,
}

/// One entry from `SLOWLOG GET`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlowLogEntry {
    pub id: i64,
    /// Unix timestamp (seconds) when the command was logged.
    pub timestamp: i64,
    /// Execution time in microseconds.
    pub duration_us: i64,
    pub command: String,
    pub client_addr: String,
    pub client_name: String,
}

/// A Pub/Sub message pushed to the frontend via a Tauri event.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PubSubMessage {
    pub connection_id: String,
    pub channel: String,
    /// The matched pattern, if this arrived via a pattern subscription.
    pub pattern: Option<String>,
    pub payload: String,
}

/// A node in a Redis Cluster (parsed from `CLUSTER NODES`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClusterNode {
    pub id: String,
    pub addr: String,
    /// "master" or "replica".
    pub role: String,
    pub flags: String,
    pub master_id: Option<String>,
    /// Hash slot ranges served, e.g. "0-5460".
    pub slots: String,
    pub connected: bool,
}

/// Summary returned right after opening a connection.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionSummary {
    pub id: String,
    pub current_db: i64,
    pub database_count: i64,
    pub databases: Vec<DatabaseInfo>,
    pub server_version: String,
}
