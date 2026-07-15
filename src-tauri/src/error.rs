use serde::{Serialize, Serializer};

/// Application-wide error type. Converted to a plain string when crossing the
/// Tauri IPC boundary so the frontend receives a readable message.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("redis error: {0}")]
    Redis(#[from] redis::RedisError),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("connection '{0}' is not open")]
    NotConnected(String),

    #[error("connection profile '{0}' not found")]
    ProfileNotFound(String),

    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_str())
    }
}

pub type AppResult<T> = Result<T, AppError>;
