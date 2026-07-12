//! System-wide synthetic keystroke injection via CGEvent (macOS).
//!
//! Printable characters (including emoji / non-BMP) are sent as a "blank"
//! key event (virtual keycode 0) carrying a Unicode string payload —
//! this is layout-independent and avoids needing a full QWERTY keycode
//! table for every character. Backspace and Return are sent as their real
//! virtual keycodes so editors treat them as edit commands, not text.

use core_graphics::event::{CGEvent, CGEventTapLocation};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

const VK_DELETE: u16 = 51;
const VK_RETURN: u16 = 36;

fn source() -> Result<CGEventSource, String> {
    CGEventSource::new(CGEventSourceStateID::HIDSystemState)
        .map_err(|_| "Failed to create CGEventSource. Is Accessibility access granted?".to_string())
}

fn post(event: CGEvent) {
    event.post(CGEventTapLocation::HID);
}

/// Type a single character (handles multi-codepoint graphemes too, e.g. emoji).
pub fn type_char(ch: char) -> Result<(), String> {
    let src = source()?;
    let mut buf = [0u16; 2];
    let utf16 = ch.encode_utf16(&mut buf);

    let down = CGEvent::new_keyboard_event(src.clone(), 0, true)
        .map_err(|_| "Failed to create key-down event".to_string())?;
    down.set_string_from_utf16_unchecked(utf16);
    post(down);

    let up = CGEvent::new_keyboard_event(src, 0, false)
        .map_err(|_| "Failed to create key-up event".to_string())?;
    up.set_string_from_utf16_unchecked(utf16);
    post(up);

    Ok(())
}

/// Press the Delete/Backspace key once.
pub fn backspace() -> Result<(), String> {
    press_key(VK_DELETE)
}

/// Press the Return/Enter key once.
pub fn press_enter() -> Result<(), String> {
    press_key(VK_RETURN)
}

fn press_key(keycode: u16) -> Result<(), String> {
    let src = source()?;
    let down = CGEvent::new_keyboard_event(src.clone(), keycode, true)
        .map_err(|_| "Failed to create key-down event".to_string())?;
    post(down);
    let up = CGEvent::new_keyboard_event(src, keycode, false)
        .map_err(|_| "Failed to create key-up event".to_string())?;
    post(up);
    Ok(())
}
