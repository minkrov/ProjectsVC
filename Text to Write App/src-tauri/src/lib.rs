mod accessibility;
mod commands;
mod keystroke;
mod settings;
mod typing_engine;

use std::sync::{Arc, Mutex};

use typing_engine::SharedState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared_state: SharedState = Arc::new(Mutex::new(commands::initial_state()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::default().build())
        .manage(shared_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::query_typing_state,
            commands::start_typing,
            commands::pause_typing,
            commands::resume_typing,
            commands::stop_typing,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
