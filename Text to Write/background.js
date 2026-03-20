// Clicking the toolbar button toggles the sidebar
browser.browserAction.onClicked.addListener(() => {
  browser.sidebarAction.toggle();
});

// Track which frame (by frameId) was most recently focused, per tab.
// This lets the sidebar send "type" to exactly one frame, preventing
// the double-typing bug when multiple iframes have content scripts.
const lastFocusedFrame = new Map(); // tabId -> frameId

browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === "frame-focused" && sender.tab) {
    lastFocusedFrame.set(sender.tab.id, sender.frameId);
    return;
  }

  if (msg.action === "get-focused-frame") {
    const frameId = lastFocusedFrame.get(msg.tabId);
    return Promise.resolve({ frameId: frameId ?? null });
  }
});

// Clean up when a tab is closed
browser.tabs.onRemoved.addListener((tabId) => {
  lastFocusedFrame.delete(tabId);
});
