let lastFocusedEl = null;
let stopTyping = false;

// Save when a typable element gains focus in this frame
document.addEventListener("focusin", (e) => {
  const el = e.target;
  if (isTypable(el) || el.isContentEditable) {
    lastFocusedEl = el;
    notifySidebar(el);
  }
}, true);

// Also save when it loses focus — fires at the exact moment the user clicks
// "Type it" in the sidebar, so we never lose the reference
document.addEventListener("blur", (e) => {
  const el = e.target;
  if (isTypable(el) || el.isContentEditable) {
    lastFocusedEl = el;
  }
}, true);

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "stop") {
    stopTyping = true;
    return false; // no response needed
  }

  if (message.action !== "type") return false;

  // Resolve target in this frame only
  const active = document.activeElement;
  const el =
    (lastFocusedEl && (isTypable(lastFocusedEl) || lastFocusedEl.isContentEditable))
      ? lastFocusedEl
      : (isTypable(active) || active?.isContentEditable)
        ? active
        : null;

  // If this frame has no target, return false so other frames (e.g. the
  // Google Docs iframe) get a chance to handle the message instead
  if (!el) return false;

  stopTyping = false;
  el.focus();

  typeText(el, message.text, message.delay, message.naturalPauses, message.pauseEvery, message.pauseDuration, message.varyTimes)
    .then((stopped) => sendResponse({ success: true, stopped }))
    .catch((err) => sendResponse({ success: false, error: err.message }));

  return true; // keep channel open for async response
});

function notifySidebar(el) {
  const tag = el.tagName.toLowerCase();
  const typeAttr = el.type ? ` [${el.type}]` : "";
  const hint = el.placeholder || el.name || el.id || el.getAttribute("aria-label") || "";
  browser.runtime.sendMessage({
    action: "targetUpdate",
    description: `${tag}${typeAttr}${hint ? " — " + hint : ""}`,
  }).catch(() => {}); // sidebar may not be open yet
}

function isTypable(el) {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea") return true;
  if (tag === "input") {
    const type = (el.type || "text").toLowerCase();
    return ["text", "search", "email", "url", "tel", "password", "number", ""].includes(type);
  }
  return false;
}

async function typeText(el, text, delay, naturalPauses, pauseEvery, pauseDuration, varyTimes) {
  let timeUntilPause = naturalPauses ? applyVariance(pauseEvery, varyTimes) : Infinity;
  let elapsed = 0;

  for (const char of text) {
    if (stopTyping) return true;

    if (naturalPauses && elapsed >= timeUntilPause) {
      const actualDuration = applyVariance(pauseDuration, varyTimes);
      const stopped = await interruptibleSleep(actualDuration);
      if (stopped) return true;
      elapsed = 0;
      // Pick a fresh interval for the next pause
      timeUntilPause = applyVariance(pauseEvery, varyTimes);
    }

    await typeCharacter(el, char);
    const charDelay = delay + jitter(delay * 0.3);
    await sleep(charDelay);
    elapsed += charDelay;
  }
  return false;
}

// Adds or subtracts 1–3 seconds randomly when vary is enabled
function applyVariance(ms, vary) {
  if (!vary) return ms;
  const sign = Math.random() < 0.5 ? 1 : -1;
  const varianceMs = (1 + Math.random() * 2) * 1000; // 1000–3000 ms
  return Math.max(1000, ms + sign * varianceMs);
}

// Sleeps for `ms` but wakes up every 100ms to check if stop was requested
async function interruptibleSleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (stopTyping) return true;
    await sleep(Math.min(100, end - Date.now()));
  }
  return false;
}


function typeCharacter(el, char) {
  return new Promise((resolve) => {
    const keyCode = char.charCodeAt(0);

    el.dispatchEvent(new KeyboardEvent("keydown", {
      key: char, code: `Key${char.toUpperCase()}`,
      keyCode, charCode: 0, which: keyCode,
      bubbles: true, cancelable: true,
    }));

    el.dispatchEvent(new KeyboardEvent("keypress", {
      key: char, code: `Key${char.toUpperCase()}`,
      keyCode, charCode: keyCode, which: keyCode,
      bubbles: true, cancelable: true,
    }));

    if (el.isContentEditable) {
      insertIntoContentEditable(el, char);
    } else {
      insertAtCursor(el, char);
    }

    el.dispatchEvent(new InputEvent("input", {
      data: char, inputType: "insertText",
      bubbles: true, cancelable: false,
    }));

    el.dispatchEvent(new KeyboardEvent("keyup", {
      key: char, code: `Key${char.toUpperCase()}`,
      keyCode, charCode: 0, which: keyCode,
      bubbles: true, cancelable: true,
    }));

    resolve();
  });
}

function insertAtCursor(el, char) {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const value = el.value;
  const nativeSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value.slice(0, start) + char + value.slice(end));
  } else {
    el.value = value.slice(0, start) + char + value.slice(end);
  }
  el.selectionStart = start + 1;
  el.selectionEnd = start + 1;
}

function insertIntoContentEditable(el, char) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(char);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.setEndAfter(textNode);
  selection.removeAllRanges();
  selection.addRange(range);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(maxMs) {
  return Math.random() * maxMs - maxMs / 2;
}
