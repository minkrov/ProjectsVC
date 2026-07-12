//! Tauri commands exposed to the frontend.

use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::accessibility;
use crate::settings::{self, Settings};
use crate::typing_engine::{
    run_typing_session, SessionState, SessionStatus, SharedState, TargetPayload, TypingBehavior,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypingStateInfo {
    pub active: bool,
    pub paused: bool,
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<Settings, String> {
    settings::load(&app)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    settings::save(&app, &settings)
}

#[tauri::command]
pub fn query_typing_state(state: State<'_, SharedState>) -> TypingStateInfo {
    let s = state.lock().unwrap();
    match s.status {
        SessionStatus::Typing => TypingStateInfo { active: true, paused: false },
        SessionStatus::Paused => TypingStateInfo { active: true, paused: true },
        _ => TypingStateInfo { active: false, paused: false },
    }
}

#[tauri::command]
pub fn pause_typing(state: State<'_, SharedState>) {
    let mut s = state.lock().unwrap();
    if s.status == SessionStatus::Typing {
        s.status = SessionStatus::Paused;
    }
}

#[tauri::command]
pub fn resume_typing(state: State<'_, SharedState>, delay: Option<f64>) {
    let mut s = state.lock().unwrap();
    if s.status == SessionStatus::Paused {
        s.status = SessionStatus::Typing;
        if let Some(delay) = delay {
            s.active_delay = delay;
        }
    }
}

#[tauri::command]
pub fn stop_typing(state: State<'_, SharedState>) {
    let mut s = state.lock().unwrap();
    s.status = SessionStatus::Stopped;
    s.generation += 1;
    s.target = None;
}

#[tauri::command]
pub async fn start_typing(
    app: AppHandle,
    state: State<'_, SharedState>,
    text: String,
    delay: f64,
    behavior: TypingBehavior,
) -> Result<(), String> {
    if !accessibility::is_trusted() {
        return Err(
            "Accessibility permission required. Open System Settings → Privacy & Security → Accessibility and enable Text to Write.".to_string(),
        );
    }

    let target = accessibility::get_focused_element();
    let target_desc = target
        .as_ref()
        .map(|t| t.description())
        .unwrap_or_else(|| "No field focused — click into a text field first".to_string());
    let target_ready = target.is_some();

    let generation = {
        let mut s = state.lock().unwrap();
        s.generation += 1;
        s.status = SessionStatus::Typing;
        s.active_delay = delay;
        s.target = target;
        s.generation
    };

    let _ = app.emit(
        "target-update",
        TargetPayload { description: target_desc, ready: target_ready },
    );

    let shared: SharedState = state.inner().clone();
    let poll_app = app.clone();
    let poll_state = shared.clone();
    tokio::spawn(focus_poll(poll_app, poll_state, generation));

    let run_app = app.clone();
    let run_state = shared.clone();
    tokio::spawn(run_typing_session(run_app, run_state, text, behavior, generation));

    Ok(())
}

/// Periodically checks whether the system-wide focused element is still the
/// one captured at session start. If it changes while typing is active,
/// auto-pauses the session — mirrors the extension's `doPause()`/`schedulePause()`.
async fn focus_poll(app: AppHandle, state: SharedState, generation: u64) {
    loop {
        tokio::time::sleep(Duration::from_millis(400)).await;

        let mut s = state.lock().unwrap();
        if s.generation != generation {
            return;
        }
        if matches!(s.status, SessionStatus::Idle | SessionStatus::Stopped) {
            return;
        }
        if s.status != SessionStatus::Typing {
            continue;
        }

        // If we never had a known target field (e.g. typing started without
        // a focused element), there's nothing meaningful to compare against —
        // don't auto-pause just because the system now reports some focus.
        let current = accessibility::get_focused_element();
        let changed = match (&s.target, &current) {
            (Some(a), Some(b)) => a != b,
            _ => false,
        };

        if changed {
            s.status = SessionStatus::Paused;
            drop(s);
            let _ = app.emit("auto-paused", ());
        }
    }
}

pub fn initial_state() -> SessionState {
    SessionState::default()
}
