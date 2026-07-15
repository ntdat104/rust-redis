use crate::error::{AppError, AppResult};
use crate::models::ConnectionProfile;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Path to the JSON file holding saved connection profiles.
fn store_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::Other(format!("cannot resolve config dir: {e}")))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("connections.json"))
}

/// Load all saved profiles (empty list if the file does not exist yet).
pub fn load(app: &AppHandle) -> AppResult<Vec<ConnectionProfile>> {
    let path = store_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = std::fs::read_to_string(path)?;
    if data.trim().is_empty() {
        return Ok(Vec::new());
    }
    Ok(serde_json::from_str(&data)?)
}

/// Persist the full set of profiles, replacing the file contents.
pub fn save_all(app: &AppHandle, profiles: &[ConnectionProfile]) -> AppResult<()> {
    let path = store_path(app)?;
    let data = serde_json::to_string_pretty(profiles)?;
    std::fs::write(path, data)?;
    Ok(())
}
