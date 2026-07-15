mod commands;
mod error;
mod models;
mod redis_client;
mod ssh_tunnel;
mod state;
mod store;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            // profiles
            commands::list_connections,
            commands::save_connection,
            commands::delete_connection,
            commands::test_connection,
            // lifecycle
            commands::open_connection,
            commands::close_connection,
            commands::select_database,
            commands::db_size,
            commands::cluster_nodes,
            // browsing
            commands::scan_keys,
            commands::get_key_detail,
            // writes
            commands::set_string_value,
            commands::delete_key,
            commands::rename_key,
            commands::set_key_ttl,
            commands::create_key,
            commands::hash_set_field,
            commands::hash_delete_field,
            commands::list_push_value,
            commands::list_set_value,
            commands::list_delete_index,
            commands::set_add_member,
            commands::set_remove_member,
            commands::zset_add_member,
            commands::zset_remove_member,
            // diagnostics
            commands::server_info,
            commands::slow_log,
            commands::slow_log_reset,
            // pub/sub
            commands::pubsub_subscribe,
            commands::pubsub_unsubscribe,
            // cli
            commands::run_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
