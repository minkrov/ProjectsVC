// Clicking the toolbar button toggles the sidebar
browser.browserAction.onClicked.addListener(() => {
  browser.sidebarAction.toggle();
});

// Track which frame (by frameId) was most recently focused, per tab.
// This lets the sidebar send "type" to exactly one frame, preventing
// the double-typing bug when multiple iframes have content scripts.
const lastFocusedFrame = new Map(); // tabId -> frameId
let lastFocusedTabId   = null;
let lastFocusedFrameId = null;

// Pending background timer relay IDs, tracked per tab so they can be
// cancelled if the page navigates or typing stops before they fire.
const pendingTimers = new Map(); // tabId -> Set<timeoutId>

function clearPendingTimers(tabId) {
  const set = pendingTimers.get(tabId);
  if (set) { set.forEach(clearTimeout); pendingTimers.delete(tabId); }
}

// Track the frame that is currently running a typing session so that
// mousedown events from OTHER frames (e.g. Google Slides toolbar or slide
// panel, which live in a different iframe than the text-box canvas) can be
// relayed as an "external-mousedown" signal to trigger auto-pause.
let typingTabId   = null;
let typingFrameId = null;

browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === "frame-focused" && sender.tab) {
    lastFocusedTabId   = sender.tab.id;
    lastFocusedFrameId = sender.frameId;
    lastFocusedFrame.set(sender.tab.id, sender.frameId);
    return;
  }

  if (msg.action === "get-focused-frame") {
    const frameId = lastFocusedFrame.get(msg.tabId);
    return Promise.resolve({ frameId: frameId ?? null });
  }

  // Timer relay — content script asks us to wait ms then ping it back.
  // Background setTimeout is never throttled, unlike content-script timers
  // in background tabs, so typing stays at full speed when the tab is hidden.
  if (msg.action === "timer-request" && sender.tab) {
    const tabId   = sender.tab.id;
    const frameId = sender.frameId;
    const timeoutId = setTimeout(() => {
      const set = pendingTimers.get(tabId);
      if (set) set.delete(timeoutId);
      browser.tabs.sendMessage(tabId, { action: "timer-fire", id: msg.id }, { frameId }).catch(() => {});
    }, msg.ms);
    if (!pendingTimers.has(tabId)) pendingTimers.set(tabId, new Set());
    pendingTimers.get(tabId).add(timeoutId);
    return;
  }

  // Content script tells us a typing session just started or ended so we know
  // which frame to relay external-mousedown events to.
  if (msg.action === "typing-started" && sender.tab) {
    typingTabId   = sender.tab.id;
    typingFrameId = sender.frameId;
    return;
  }
  if (msg.action === "typing-stopped") {
    if (sender.tab) clearPendingTimers(sender.tab.id);
    typingTabId   = null;
    typingFrameId = null;
    return;
  }

  // Any frame that sees a mousedown reports it here.  If it came from a
  // different frame than where typing is happening (e.g. user clicked the
  // Slides toolbar or slide panel while a text-box in the canvas iframe is
  // being typed into) relay a pause signal to the typing frame immediately.
  if (msg.action === "frame-mousedown" && sender.tab && typingTabId != null) {
    if (sender.tab.id === typingTabId && sender.frameId !== typingFrameId) {
      browser.tabs.sendMessage(
        typingTabId,
        { action: "external-mousedown" },
        { frameId: typingFrameId }
      ).catch(() => {});
    }
    return;
  }

  // Sidebar on init queries whether typing is actually still running in the
  // typing frame, so it can correct stale session state after a reopen.
  if (msg.action === "query-typing-state") {
    if (typingTabId == null) {
      return Promise.resolve({ active: false });
    }
    return browser.tabs.sendMessage(
      typingTabId,
      { action: "get-typing-state" },
      { frameId: typingFrameId }
    ).catch(() => {
      // Content script didn't respond — it likely crashed. Clear the stale
      // typing frame so external-mousedown relays stop targeting a dead frame.
      typingTabId   = null;
      typingFrameId = null;
      return { active: false };
    });
  }

  // Relay a control message (pause / resume / stop) directly to the last
  // focused frame — more reliable than the sidebar doing its own tab query.
  if (msg.action === "relay-to-frame") {
    if (lastFocusedTabId != null && lastFocusedFrameId != null) {
      browser.tabs.sendMessage(
        lastFocusedTabId,
        msg.payload,
        { frameId: lastFocusedFrameId }
      ).catch(() => {});
    }
    return Promise.resolve({ ok: true });
  }
});

// Clean up when a tab is closed
browser.tabs.onRemoved.addListener((tabId) => {
  lastFocusedFrame.delete(tabId);
  clearPendingTimers(tabId);
});
