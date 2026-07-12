//! Settings persistence — JSON file via tauri-plugin-store, mirroring the
//! key set the extension stored in `browser.storage.local`.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "settings.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub text_input: String,
    pub selected_speed: String,
    pub var_speed: bool,
    pub word_difficulty: bool,
    pub natural_pauses: bool,
    pub pause_every: i64,
    pub pause_duration: i64,
    pub punct_pauses: bool,
    pub vary_times: bool,
    pub make_mistakes: bool,
    pub mistake_pause: i64,
    pub mistake_rate: i64,
    pub paragraph_pause: bool,
    pub self_interrupt: bool,
    pub quick_corrections: bool,
    pub start_delay: i64,
    pub active_mode: String,
    pub active_personality: String,
    pub session_state: String,
    pub status_msg: String,
    pub status_type: String,
    pub target_desc: String,
    pub target_ready: bool,
    pub total_words: i64,
    pub words_typed: i64,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            text_input: String::new(),
            selected_speed: "medium".to_string(),
            var_speed: false,
            word_difficulty: false,
            natural_pauses: true,
            pause_every: 7,
            pause_duration: 10,
            punct_pauses: false,
            vary_times: false,
            make_mistakes: false,
            mistake_pause: 5,
            mistake_rate: 10,
            paragraph_pause: false,
            self_interrupt: false,
            quick_corrections: false,
            start_delay: 3,
            active_mode: "custom".to_string(),
            active_personality: String::new(),
            session_state: "idle".to_string(),
            status_msg: String::new(),
            status_type: String::new(),
            target_desc: String::new(),
            target_ready: false,
            total_words: 0,
            words_typed: 0,
        }
    }
}

pub fn load(app: &AppHandle) -> Result<Settings, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    match store.get("settings") {
        Some(value) => Ok(serde_json::from_value(value).unwrap_or_default()),
        None => Ok(Settings::default()),
    }
}

pub fn save(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value: Value = json!(settings);
    store.set("settings", value);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}
