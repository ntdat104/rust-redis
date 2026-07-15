use crate::models::ConnectionProfile;
use crate::redis_client::RedisConn;
use crate::ssh_tunnel::SshTunnel;
use redis::aio::ConnectionManager;
use std::collections::HashMap;
use tokio::sync::Mutex;

/// A live, open connection to a Redis server (standalone, sentinel or cluster).
pub struct ConnEntry {
    pub conn: RedisConn,
    pub profile: ConnectionProfile,
    pub db: i64,
    /// Per-master connections used for cluster-wide SCAN (empty otherwise).
    pub cluster_conns: Vec<(String, ConnectionManager)>,
    /// Keeps the SSH tunnel alive for this connection (dropped with the entry).
    #[allow(dead_code)]
    pub tunnel: Option<SshTunnel>,
}

/// Shared application state managed by Tauri. Holds every open connection,
/// keyed by its profile id, plus any running Pub/Sub listener tasks.
#[derive(Default)]
pub struct AppState {
    pub conns: Mutex<HashMap<String, ConnEntry>>,
    pub pubsub: Mutex<HashMap<String, tokio::task::JoinHandle<()>>>,
}
