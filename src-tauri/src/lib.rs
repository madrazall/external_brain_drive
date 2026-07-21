mod backup;
mod commands;
mod db;
mod entity;
mod error;
mod state;
mod workspace;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::workspace_create,
            commands::workspace_open,
            commands::workspace_current,
            commands::workspace_list_recent,
            commands::backup_create,
            commands::backup_list,
            commands::backup_restore,
            commands::entity_create,
            commands::entity_update,
            commands::entity_get,
            commands::entity_list,
            commands::entity_search,
            commands::entity_link,
            commands::entity_unlink,
            commands::entity_context,
            commands::entity_badges,
            commands::project_list_entities,
        ])
        .run(tauri::generate_context!())
        .expect("error while running External Brain Drive");
}
