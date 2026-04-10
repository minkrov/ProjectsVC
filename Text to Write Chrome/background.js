// Make clicking the toolbar button open/toggle the side panel automatically.
// setPanelBehavior is available in Chrome 116+.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// Track which frame (by frameId) was most recently focused, per tab.
// This lets the sidebar send "type" to exactly one frame, preventing
// the double-typing bug when multiple iframes have content scripts.
const lastFocusedFrame = new Map(); // tabId -> frameId
let lastFocusedTabId   = null;
let lastFocusedFrameId = null;

// Pending background timer relay IDs, tracked per tab so they can be
// cancelled if the page navigates or typing stops before they fire.
const pendingTimers = new Map(); // tabId -> Set<timeoutId>

// Track the frame that is currently running a typing session so that
// mousedown events from OTHER frames (e.g. Google Slides toolbar or slide
// panel, which live in a different iframe than the text-box canvas) can be
// relayed as an "external-mousedown" signal to trigger auto-pause.
let typingTabId   = null;
let typingFrameId = null;

// ---------------------------------------------------------------------------
// chrome.storage.session persistence — survives service worker restarts
//
// Chrome MV3 service workers are killed after ~30 s of inactivity.  Any
// in-memory variables (lastFocusedFrame, typingTabId, etc.) are wiped on
// restart.  chrome.storage.session persists for the browser session and is
// restored here on every service worker wake-up, so frame-tracking state
// is never silently lost.
// ---------------------------------------------------------------------------
function persistState() {
  chrome.storage.session.set({
    sw_lastFocusedTabId:    lastFocusedTabId,
    sw_lastFocusedFrameId:  lastFocusedFrameId,
    sw_lastFocusedFrameMap: [...lastFocusedFrame], // Map → serialisable array
    sw_typingTabId:         typingTabId,
    sw_typingFrameId:       typingFrameId,
  }).catch(() => {});
}

// Restore on service worker wake-up.  Stored as a named promise (_stateReady)
// so that message handlers which read persisted state can await it before
// acting.  chrome.storage.session.get() is an IPC call and resolves
// asynchronously — message dispatch can race ahead of the .then() callback if
// we don't explicitly gate on this promise.  Handlers that only write state
// (frame-focused, typing-started, timer-request) don't need to wait; only the
// three read-heavy handlers below do.
const _stateReady = chrome.storage.session.get([
  'sw_lastFocusedTabId', 'sw_lastFocusedFrameId', 'sw_lastFocusedFrameMap',
  'sw_typingTabId', 'sw_typingFrameId',
]).then((data) => {
  if (data.sw_lastFocusedTabId   != null) lastFocusedTabId   = data.sw_lastFocusedTabId;
  if (data.sw_lastFocusedFrameId != null) lastFocusedFrameId = data.sw_lastFocusedFrameId;
  if (Array.isArray(data.sw_lastFocusedFrameMap)) {
    for (const [k, v] of data.sw_lastFocusedFrameMap) lastFocusedFrame.set(k, v);
  }
  if (data.sw_typingTabId   != null) typingTabId   = data.sw_typingTabId;
  if (data.sw_typingFrameId != null) typingFrameId = data.sw_typingFrameId;
}).catch(() => {});

function clearPendingTimers(tabId) {
  const set = pendingTimers.get(tabId);
  if (set) { set.forEach(clearTimeout); pendingTimers.delete(tabId); }
}

// Chrome MV3: message listeners must use sendResponse (not return a Promise)
// for async responses. Return true to keep the channel open while async work
// completes; return false (or nothing) for synchronous / fire-and-forget cases.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "frame-focused" && sender.tab) {
    lastFocusedTabId   = sender.tab.id;
    lastFocusedFrameId = sender.frameId;
    lastFocusedFrame.set(sender.tab.id, sender.frameId);
    persistState(); // survive service worker restart
    return false;
  }

  if (msg.action === "get-focused-frame") {
    _stateReady.then(async () => {
      let frameId = lastFocusedFrame.get(msg.tabId) ?? null;

      // Fallback: if no frame was tracked yet (e.g. extension just installed,
      // or the focus event arrived before content script was running), scan every
      // frame in the tab and find the first one that has a focused typable element.
      // This is what makes Google Docs' about:blank iframe discoverable even when
      // the user hasn't re-clicked since the extension was loaded.
      if (frameId == null) {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: msg.tabId, allFrames: true },
            func: () => {
              const el  = document.activeElement;
              const tag = el ? el.tagName.toLowerCase() : "";
              const typableInput =
                tag === "textarea" ||
                (tag === "input" &&
                  ["text", "search", "email", "url", "tel", "password", "number", ""]
                    .includes((el.type || "text").toLowerCase()));
              return (
                typableInput ||
                !!(el && el.isContentEditable) ||
                !!(document.body && document.body.isContentEditable)
              );
            },
          });
          const hit = results.find((r) => r.result === true);
          if (hit != null) {
            frameId = hit.frameId;
            // Cache so the next call doesn't need to scan
            lastFocusedFrame.set(msg.tabId, frameId);
            lastFocusedTabId   = msg.tabId;
            lastFocusedFrameId = frameId;
            persistState();
          }
        } catch (_) {
          // Scan failed (chrome:// page, no host permissions, etc.) — return null
        }
      }

      sendResponse({ frameId });
    });
    return true; // async — keep channel open until sendResponse fires
  }

  // Timer relay — content script asks us to wait ms then ping it back.
  // Service-worker setTimeout is never throttled, unlike content-script timers
  // in background tabs, so typing stays at full speed when the tab is hidden.
  if (msg.action === "timer-request" && sender.tab) {
    const tabId   = sender.tab.id;
    const frameId = sender.frameId;
    const timeoutId = setTimeout(() => {
      const set = pendingTimers.get(tabId);
      if (set) set.delete(timeoutId);
      chrome.tabs.sendMessage(tabId, { action: "timer-fire", id: msg.id }, { frameId }).catch(() => {});
    }, msg.ms);
    if (!pendingTimers.has(tabId)) pendingTimers.set(tabId, new Set());
    pendingTimers.get(tabId).add(timeoutId);
    return false;
  }

  // Content script tells us a typing session just started or ended so we know
  // which frame to relay external-mousedown events to.
  if (msg.action === "typing-started" && sender.tab) {
    typingTabId   = sender.tab.id;
    typingFrameId = sender.frameId;
    persistState();
    // Tell every frame in this tab to start reporting mousedowns so cross-frame
    // clicks (e.g. clicking the Slides toolbar while typing in the canvas iframe)
    // can be detected.  Only active during a session — no idle service worker churn.
    chrome.tabs.sendMessage(sender.tab.id, { action: "enable-mousedown-tracking" }).catch(() => {});
    return false;
  }
  if (msg.action === "typing-stopped") {
    const stoppedTabId = sender.tab ? sender.tab.id : typingTabId;
    if (sender.tab) clearPendingTimers(sender.tab.id);
    typingTabId   = null;
    typingFrameId = null;
    persistState();
    // Tell every frame to stop reporting mousedowns — no need to wake the
    // service worker on every click now that no session is running.
    if (stoppedTabId != null) {
      chrome.tabs.sendMessage(stoppedTabId, { action: "disable-mousedown-tracking" }).catch(() => {});
    }
    return false;
  }

  // Any frame that sees a mousedown reports it here.  If it came from a
  // different frame than where typing is happening (e.g. user clicked the
  // Slides toolbar or slide panel while a text-box in the canvas iframe is
  // being typed into) relay a pause signal to the typing frame immediately.
  if (msg.action === "frame-mousedown" && sender.tab && typingTabId != null) {
    if (sender.tab.id === typingTabId && sender.frameId !== typingFrameId) {
      chrome.tabs.sendMessage(
        typingTabId,
        { action: "external-mousedown" },
        { frameId: typingFrameId }
      ).catch(() => {});
    }
    return false;
  }

  // Sidebar on init queries whether typing is actually still running in the
  // typing frame, so it can correct stale session state after a reopen.
  if (msg.action === "query-typing-state") {
    // Await state restoration before reading typingTabId — without this gate,
    // a service-worker restart during a pause could cause this handler to see
    // typingTabId = null before the session storage IPC resolves, incorrectly
    // reporting "not typing" and leaving the sidebar stuck in idle while the
    // content script is still paused.
    _stateReady.then(() => {
      if (typingTabId == null) {
        sendResponse({ active: false });
        return;
      }
      chrome.tabs.sendMessage(
        typingTabId,
        { action: "get-typing-state" },
        { frameId: typingFrameId }
      ).then((response) => {
        sendResponse(response || { active: false });
      }).catch(() => {
        // Content script didn't respond — it likely crashed. Clear the stale
        // typing frame so external-mousedown relays stop targeting a dead frame.
        typingTabId   = null;
        typingFrameId = null;
        persistState();
        sendResponse({ active: false });
      });
    });
    return true; // keep channel open for async sendResponse
  }

  // Relay a control message (pause / resume / stop) directly to the last
  // focused frame — more reliable than the sidebar doing its own tab query.
  if (msg.action === "relay-to-frame") {
    _stateReady.then(() => {
      if (lastFocusedTabId != null && lastFocusedFrameId != null) {
        chrome.tabs.sendMessage(
          lastFocusedTabId,
          msg.payload,
          { frameId: lastFocusedFrameId }
        ).catch(() => {});
      }
      sendResponse({ ok: true });
    });
    return true; // async — keep channel open until sendResponse fires
  }
});

// Clean up when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  lastFocusedFrame.delete(tabId);
  if (lastFocusedTabId === tabId) {
    lastFocusedTabId  = null;
    lastFocusedFrameId = null;
  }
  if (typingTabId === tabId) {
    typingTabId   = null;
    typingFrameId = null;
  }
  clearPendingTimers(tabId);
  persistState();
});
