//! System-wide focus tracking via the macOS Accessibility (AX) API.
//!
//! Replaces the extension's DOM focus/blur tracking: instead of listening
//! for `focusin`/`blur` on a specific page, we poll the OS-wide focused
//! UI element (`AXUIElementCreateSystemWide` -> `AXFocusedUIElement`) and
//! compare it (via `CFEqual`) to the element that was focused when typing
//! started. If it changes, the target field lost focus and typing should
//! auto-pause — mirroring `doPause()`/`schedulePause()` in `content.js`.

use accessibility_sys::{
    kAXErrorSuccess, kAXFocusedUIElementAttribute, kAXPlaceholderValueAttribute,
    kAXRoleAttribute, kAXTitleAttribute, kAXValueAttribute, AXIsProcessTrusted,
    AXUIElementCopyAttributeValue, AXUIElementCreateSystemWide, AXUIElementRef,
};
use core_foundation::base::TCFType;
use core_foundation::string::{CFString, CFStringRef};
use core_foundation_sys::base::{CFEqual, CFRelease, CFTypeRef};

/// An owned, retained reference to a focused AXUIElement.
pub struct FocusedElement {
    element: AXUIElementRef,
}

unsafe impl Send for FocusedElement {}
unsafe impl Sync for FocusedElement {}

impl Drop for FocusedElement {
    fn drop(&mut self) {
        unsafe { CFRelease(self.element as CFTypeRef) }
    }
}

impl FocusedElement {
    pub fn description(&self) -> String {
        describe_element(self.element)
    }
}

impl PartialEq for FocusedElement {
    fn eq(&self, other: &Self) -> bool {
        unsafe { CFEqual(self.element as CFTypeRef, other.element as CFTypeRef) != 0 }
    }
}

/// Whether this process has been granted Accessibility (Privacy & Security) access.
pub fn is_trusted() -> bool {
    unsafe { AXIsProcessTrusted() }
}

/// Returns the system-wide focused UI element, if any.
pub fn get_focused_element() -> Option<FocusedElement> {
    unsafe {
        let system_wide = AXUIElementCreateSystemWide();
        if system_wide.is_null() {
            return None;
        }
        let attr = CFString::new(kAXFocusedUIElementAttribute);
        let mut value: CFTypeRef = std::ptr::null();
        let err = AXUIElementCopyAttributeValue(
            system_wide,
            attr.as_concrete_TypeRef(),
            &mut value as *mut CFTypeRef,
        );
        CFRelease(system_wide as CFTypeRef);

        if err != kAXErrorSuccess || value.is_null() {
            return None;
        }

        Some(FocusedElement {
            element: value as AXUIElementRef,
        })
    }
}

fn copy_string_attribute(element: AXUIElementRef, attr_name: &str) -> Option<String> {
    unsafe {
        let attr = CFString::new(attr_name);
        let mut value: CFTypeRef = std::ptr::null();
        let err = AXUIElementCopyAttributeValue(
            element,
            attr.as_concrete_TypeRef(),
            &mut value as *mut CFTypeRef,
        );
        if err != kAXErrorSuccess || value.is_null() {
            return None;
        }
        let cf_string = CFString::wrap_under_create_rule(value as CFStringRef);
        Some(cf_string.to_string())
    }
}

/// Build a short human-readable description of the focused element, e.g.
/// `AXTextField — "Search…"` — analogous to the extension's `notifySidebar`.
fn describe_element(element: AXUIElementRef) -> String {
    let role = copy_string_attribute(element, kAXRoleAttribute).unwrap_or_else(|| "Field".to_string());

    let hint = copy_string_attribute(element, kAXPlaceholderValueAttribute)
        .filter(|s| !s.trim().is_empty())
        .or_else(|| copy_string_attribute(element, kAXTitleAttribute).filter(|s| !s.trim().is_empty()))
        .or_else(|| copy_string_attribute(element, kAXValueAttribute).filter(|s| !s.trim().is_empty()));

    match hint {
        Some(h) => {
            let trimmed: String = h.chars().take(60).collect::<String>().replace('\n', " ");
            format!("{role} — {trimmed}")
        }
        None => role,
    }
}
