let lastFocusedEl  = null;
let stopTyping     = false;
let pausedTyping   = false;

// ---------------------------------------------------------------------------
// Background-relay timer — routes sleeps through the persistent background
// script whose setTimeout is never throttled, so typing keeps full speed
// even when this tab is in the background.
// ---------------------------------------------------------------------------
let _timers  = new Map();
let _timerId = 0;

// ---------------------------------------------------------------------------
// Blur-pause — auto-pauses when the target element loses focus so characters
// are never typed into nowhere.
//
// Two listeners are used together:
//   1. document mousedown (capture) — fires the instant the user clicks
//      anywhere outside the target, before the browser even moves focus.
//      This gives an immediate response in complex editors like Google Slides
//      where the blur event on the element fires late.
//   2. element blur — catches focus loss from keyboard navigation (Tab key),
//      clicking the browser address bar, or any non-mouse focus change.
// ---------------------------------------------------------------------------
let _blurTarget          = null;
let _mousedownHandler    = null;
let _pointerdownHandler  = null;
let _blurFallbackHandler = null;

function doPause() {
  if (!stopTyping && !pausedTyping) {
    pausedTyping = true;
    browser.runtime.sendMessage({ action: "auto-paused" }).catch(() => {});
  }
}

function attachBlurPause(el) {
  detachBlurPause();
  _blurTarget = el;

  // mousedown + pointerdown (capture): fires the instant the user clicks
  // anywhere outside the target.  Both events are registered because some
  // editors (e.g. Google Slides) call stopImmediatePropagation on mousedown
  // but not on pointerdown, or vice-versa.
  const outsideClick = (e) => {
    if (_blurTarget && !_blurTarget.contains(e.target)) doPause();
  };
  _mousedownHandler   = outsideClick;
  _pointerdownHandler = outsideClick;
  document.addEventListener("mousedown",   _mousedownHandler,   true);
  document.addEventListener("pointerdown", _pointerdownHandler, true);

  // Fallback: catches Tab key, address bar clicks, programmatic focus changes
  _blurFallbackHandler = () => doPause();
  el.addEventListener("blur", _blurFallbackHandler);
}

function detachBlurPause() {
  if (_mousedownHandler)   document.removeEventListener("mousedown",   _mousedownHandler,   true);
  if (_pointerdownHandler) document.removeEventListener("pointerdown", _pointerdownHandler, true);
  if (_blurTarget && _blurFallbackHandler) {
    _blurTarget.removeEventListener("blur", _blurFallbackHandler);
  }
  _blurTarget          = null;
  _mousedownHandler    = null;
  _pointerdownHandler  = null;
  _blurFallbackHandler = null;
}

// Cross-frame mousedown detection — every frame reports its mousedowns to the
// background script.  If typing is happening in a *different* frame (e.g. a
// Google Slides canvas iframe) the background will relay an external-mousedown
// to the typing frame so it can auto-pause.  The background ignores these
// reports when no typing session is active, so overhead is minimal.
document.addEventListener("mousedown", () => {
  browser.runtime.sendMessage({ action: "frame-mousedown" }).catch(() => {});
}, true);

// Track focus so we always know the last-used field in this frame
document.addEventListener("focusin", (e) => {
  const el = e.target;
  if (isTypable(el) || el.isContentEditable) {
    lastFocusedEl = el;
    notifySidebar(el);
    browser.runtime.sendMessage({ action: "frame-focused" }).catch(() => {});
  }
}, true);

document.addEventListener("blur", (e) => {
  const el = e.target;
  if (isTypable(el) || el.isContentEditable) lastFocusedEl = el;
}, true);

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "stop") {
    stopTyping   = true;
    pausedTyping = false; // unblock any pause-wait so stop is detected
    return false;
  }
  if (message.action === "pause") {
    pausedTyping = true;
    return false;
  }
  if (message.action === "resume") {
    pausedTyping = false;
    // Re-focus the target element so the activeElement check in checkStop()
    // doesn't immediately re-pause after the user clicks Resume
    if (_blurTarget) _blurTarget.focus();
    return false;
  }
  // Background detected a mousedown in a different frame — pause immediately
  if (message.action === "external-mousedown") {
    doPause();
    return false;
  }

  // Timer ping-back from background relay
  if (message.action === "timer-fire") {
    const resolve = _timers.get(message.id);
    if (resolve) { _timers.delete(message.id); resolve(); }
    return false;
  }

  if (message.action !== "type") return false;

  const active = document.activeElement;
  const el =
    (lastFocusedEl && (isTypable(lastFocusedEl) || lastFocusedEl.isContentEditable))
      ? lastFocusedEl
      : (isTypable(active) || active?.isContentEditable) ? active : null;

  if (!el) return false;

  stopTyping   = false;
  pausedTyping = false;
  _timers.clear(); // discard any stale callbacks from a previous session
  _timerId = 0;
  el.focus();
  attachBlurPause(el);
  browser.runtime.sendMessage({ action: "typing-started" }).catch(() => {});

  const opts = {
    naturalPauses: message.naturalPauses,
    pauseEvery:    message.pauseEvery,
    pauseDuration: message.pauseDuration,
    varyTimes:     message.varyTimes,
    punctPauses:   message.punctPauses,
    varSpeed:      message.varSpeed,
    mistakes:      message.mistakes,
    mistakePause:  message.mistakePause,
    mistakeRate:   message.mistakeRate,
  };

  typeText(el, message.text, message.delay, opts)
    .then((stopped) => {
      detachBlurPause();
      browser.runtime.sendMessage({ action: "typing-stopped" }).catch(() => {});
      sendResponse({ success: true, stopped });
      browser.runtime.sendMessage({ action: "typing-complete", stopped }).catch(() => {});
    })
    .catch((err) => {
      detachBlurPause();
      browser.runtime.sendMessage({ action: "typing-stopped" }).catch(() => {});
      sendResponse({ success: false, error: err.message });
      browser.runtime.sendMessage({ action: "typing-complete", stopped: true, error: err.message }).catch(() => {});
    });

  return true;
});

// ---------------------------------------------------------------------------
// Core typing loop
// ---------------------------------------------------------------------------
async function typeText(el, text, delay, opts) {
  const tokens = text.match(/[a-zA-Z']+|[^a-zA-Z']+/g) || [];

  // Natural pause tracking
  let elapsed        = 0;
  let timeUntilPause = opts.naturalPauses
    ? applyVariance(opts.pauseEvery, opts.varyTimes)
    : Infinity;

  // Punctuation pause tracking
  let punctCount          = 0;
  let nextPunctThreshold  = randomInt(3, 5);

  // Variable speed tracking
  let speedMult            = 1.0;
  let charsUntilSpeedShift = randomInt(20, 50);

  for (const token of tokens) {
    if (await checkStop()) return true;

    const isWord    = /^[a-zA-Z']{3,}$/.test(token);
    const doMistake = opts.mistakes && isWord && Math.random() < opts.mistakeRate;

    if (doMistake) {
      const misspelled = generateMistake(token);

      // Type the wrong version
      for (const char of misspelled) {
        if (await checkStop()) return true;
        await typeCharacter(el, char);
        if (await typeSleep(charDelay(delay, speedMult, opts.varSpeed))) return true;
        ({ speedMult, charsUntilSpeedShift } = tickSpeed(speedMult, charsUntilSpeedShift, opts.varSpeed));
      }

      // Pause — "noticing" the mistake
      if (await interruptibleSleep(applyVariance(opts.mistakePause, opts.varyTimes))) return true;

      // Backspace the wrong word
      for (let i = 0; i < misspelled.length; i++) {
        if (await checkStop()) return true;
        await typeBackspace(el);
        if (await typeSleep(delay + jitter(delay * 0.3))) return true;
      }

      // Pause — "thinking" before retyping
      if (await interruptibleSleep(applyVariance(opts.mistakePause, opts.varyTimes))) return true;

      // Retype correctly
      for (const char of token) {
        if (await checkStop()) return true;
        await typeCharacter(el, char);
        if (await typeSleep(charDelay(delay, speedMult, opts.varSpeed))) return true;
        ({ speedMult, charsUntilSpeedShift } = tickSpeed(speedMult, charsUntilSpeedShift, opts.varSpeed));
      }

    } else {
      for (const char of token) {
        if (await checkStop()) return true;

        // Natural pause — check at each character
        if (opts.naturalPauses && elapsed >= timeUntilPause) {
          if (await interruptibleSleep(applyVariance(opts.pauseDuration, opts.varyTimes))) return true;
          elapsed = 0;
          timeUntilPause = applyVariance(opts.pauseEvery, opts.varyTimes);
        }

        await typeCharacter(el, char);

        // Punctuation pause — after typing a punctuation char
        if (opts.punctPauses && '.,:;!?'.includes(char)) {
          punctCount++;
          if (punctCount >= nextPunctThreshold) {
            if (await interruptibleSleep(randomBetween(1000, 2000))) return true;
            punctCount = 0;
            nextPunctThreshold = randomInt(3, 5);
          }
        }

        const d = charDelay(delay, speedMult, opts.varSpeed);
        if (await typeSleep(d)) return true;
        elapsed += d;
        ({ speedMult, charsUntilSpeedShift } = tickSpeed(speedMult, charsUntilSpeedShift, opts.varSpeed));
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Speed helpers
// ---------------------------------------------------------------------------
function charDelay(base, mult, varSpeed) {
  const effective = varSpeed ? base * mult : base;
  return effective + jitter(effective * 0.3);
}

function tickSpeed(mult, countdown, varSpeed) {
  if (!varSpeed) return { speedMult: mult, charsUntilSpeedShift: countdown };
  const next = countdown - 1;
  if (next <= 0) {
    return {
      speedMult: 0.6 + Math.random() * 0.9, // 0.6× (faster) to 1.5× (slower)
      charsUntilSpeedShift: randomInt(20, 50),
    };
  }
  return { speedMult: mult, charsUntilSpeedShift: next };
}

// ---------------------------------------------------------------------------
// Mistake generator — realistic QWERTY typos
// ---------------------------------------------------------------------------
const qwertyNeighbors = {
  a:'sqwz', b:'vghn', c:'xdfv', d:'serfcx', e:'wsdr', f:'drtgvc',
  g:'ftyhbv', h:'gyujnb', i:'ujko', j:'huikmnb', k:'jiolm', l:'kop',
  m:'njk', n:'bhjm', o:'iklp', p:'ol', q:'wa', r:'edft',
  s:'awedxz', t:'rfgy', u:'yhji', v:'cfgb', w:'qase', x:'zsdc',
  y:'tghu', z:'asx',
};

function generateMistake(word) {
  const type = Math.floor(Math.random() * 3);
  if (type === 0) {
    const pos       = 1 + Math.floor(Math.random() * (word.length - 1));
    const key       = word[pos].toLowerCase();
    const neighbors = qwertyNeighbors[key];
    if (!neighbors) return doubleLetter(word);
    const wrong       = neighbors[Math.floor(Math.random() * neighbors.length)];
    const replacement = /[A-Z]/.test(word[pos]) ? wrong.toUpperCase() : wrong;
    return word.slice(0, pos) + replacement + word.slice(pos + 1);
  }
  if (type === 1) {
    const pos = Math.floor(Math.random() * (word.length - 1));
    return word.slice(0, pos) + word[pos + 1] + word[pos] + word.slice(pos + 2);
  }
  return doubleLetter(word);
}

function doubleLetter(word) {
  const pos = Math.floor(Math.random() * word.length);
  return word.slice(0, pos) + word[pos] + word.slice(pos);
}

// ---------------------------------------------------------------------------
// Pause / stop / sleep utilities
// ---------------------------------------------------------------------------

// Wait while paused; return true if stopped.
// Three independent signals detect that the target lost focus — whichever
// fires first wins, covering standard editors, iframes, and Google Slides.
async function checkStop() {
  if (_blurTarget && !pausedTyping && !stopTyping) {
    const el  = _blurTarget;
    const sel = el.isContentEditable ? window.getSelection() : null;

    const lostFocus =
      // 1. Element removed from the DOM
      !el.isConnected ||
      // 2. Element or an ancestor had contenteditable turned off
      (el.isContentEditable === false) ||
      // 3. Element is not rendered (display:none / visibility:hidden)
      el.offsetParent === null && el.tagName !== "BODY" ||
      // 4. Browser moved activeElement away (standard editors, textareas)
      document.activeElement !== el ||
      // 5. Selection was cleared entirely
      (sel !== null && sel.rangeCount === 0) ||
      // 6. Selection moved outside the target — stronger than rangeCount alone.
      //    Even if Slides keeps a selection, it may anchor outside the
      //    contentEditable when exiting text-edit mode.
      (sel !== null && sel.rangeCount > 0 &&
        !el.contains(sel.getRangeAt(0).commonAncestorContainer));

    if (lostFocus) doPause();
  }
  while (pausedTyping) {
    if (stopTyping) return true;
    await sleep(50);
  }
  return stopTyping;
}

// Short sleep between characters — checks for pause/stop
async function typeSleep(ms) {
  if (await checkStop()) return true;
  await sleep(ms);
  return false;
}

// Longer interruptible sleep (natural/mistake pauses)
// Exits early on resume so the typing loop continues immediately
async function interruptibleSleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (stopTyping) return true;
    if (pausedTyping) {
      while (pausedTyping && !stopTyping) await sleep(50);
      if (stopTyping) return true;
      return false; // resume — exit sleep early, continue typing
    }
    await sleep(Math.min(100, end - Date.now()));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Character insertion
// ---------------------------------------------------------------------------
function typeNewline(el) {
  return new Promise((resolve) => {
    el.dispatchEvent(new KeyboardEvent("keydown",  { key: "Enter", code: "Enter", keyCode: 13, charCode: 0,  which: 13, bubbles: true, cancelable: true }));
    el.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", code: "Enter", keyCode: 13, charCode: 13, which: 13, bubbles: true, cancelable: true }));

    if (el.isContentEditable) {
      // execCommand is the reliable way to insert a paragraph break in rich
      // editors (Google Docs, Slides, etc.). Falls back to a <br> if unavailable.
      if (!document.execCommand("insertParagraph")) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const br = document.createElement("br");
          range.insertNode(br);
          range.setStartAfter(br);
          range.setEndAfter(br);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    } else {
      insertAtCursor(el, "\n");
    }

    el.dispatchEvent(new InputEvent("input", { data: null, inputType: "insertParagraph", bubbles: true, cancelable: false }));
    el.dispatchEvent(new KeyboardEvent("keyup",    { key: "Enter", code: "Enter", keyCode: 13, charCode: 0,  which: 13, bubbles: true, cancelable: true }));
    resolve();
  });
}

function typeCharacter(el, char) {
  if (char === "\n" || char === "\r") return typeNewline(el);
  return new Promise((resolve) => {
    const keyCode = char.charCodeAt(0);

    el.dispatchEvent(new KeyboardEvent("keydown", {
      key: char, code: `Key${char.toUpperCase()}`,
      keyCode, charCode: 0, which: keyCode, bubbles: true, cancelable: true,
    }));
    el.dispatchEvent(new KeyboardEvent("keypress", {
      key: char, code: `Key${char.toUpperCase()}`,
      keyCode, charCode: keyCode, which: keyCode, bubbles: true, cancelable: true,
    }));

    if (el.isContentEditable) {
      insertIntoContentEditable(el, char);
    } else {
      insertAtCursor(el, char);
    }

    el.dispatchEvent(new InputEvent("input", {
      data: char, inputType: "insertText", bubbles: true, cancelable: false,
    }));
    el.dispatchEvent(new KeyboardEvent("keyup", {
      key: char, code: `Key${char.toUpperCase()}`,
      keyCode, charCode: 0, which: keyCode, bubbles: true, cancelable: true,
    }));

    resolve();
  });
}

function insertAtCursor(el, char) {
  const start = el.selectionStart;
  const end   = el.selectionEnd;
  const nativeSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
  const newVal = el.value.slice(0, start) + char + el.value.slice(end);
  if (nativeSetter) nativeSetter.call(el, newVal); else el.value = newVal;
  el.selectionStart = el.selectionEnd = start + 1;
}

function insertIntoContentEditable(el, char) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(char);
  range.insertNode(node);
  range.setStartAfter(node);
  range.setEndAfter(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

// ---------------------------------------------------------------------------
// Backspace simulation
// ---------------------------------------------------------------------------
function typeBackspace(el) {
  return new Promise((resolve) => {
    el.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Backspace", code: "Backspace", keyCode: 8, which: 8, bubbles: true, cancelable: true,
    }));

    if (el.isContentEditable) {
      deleteLastCharContentEditable(el);
    } else {
      deleteLastCharInput(el);
    }

    el.dispatchEvent(new InputEvent("input", {
      inputType: "deleteContentBackward", bubbles: true, cancelable: false,
    }));
    el.dispatchEvent(new KeyboardEvent("keyup", {
      key: "Backspace", code: "Backspace", keyCode: 8, which: 8, bubbles: true, cancelable: true,
    }));

    resolve();
  });
}

function deleteLastCharInput(el) {
  const start = el.selectionStart;
  const end   = el.selectionEnd;
  if (start === 0 && end === 0) return;
  const nativeSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
  const newVal = el.value.slice(0, start - 1) + el.value.slice(end);
  if (nativeSetter) nativeSetter.call(el, newVal); else el.value = newVal;
  el.selectionStart = el.selectionEnd = start - 1;
}

function deleteLastCharContentEditable(el) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (range.startOffset > 0) {
    range.setStart(range.startContainer, range.startOffset - 1);
    range.deleteContents();
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
function notifySidebar(el) {
  const tag  = el.tagName.toLowerCase();
  const type = el.type ? ` [${el.type}]` : "";
  const hint = el.placeholder || el.name || el.id || el.getAttribute("aria-label") || "";
  browser.runtime.sendMessage({
    action: "targetUpdate",
    description: `${tag}${type}${hint ? " — " + hint : ""}`,
  }).catch(() => {});
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

function applyVariance(ms, vary) {
  if (!vary) return ms;
  const sign = Math.random() < 0.5 ? 1 : -1;
  return Math.max(1000, ms + sign * (1 + Math.random() * 2) * 1000);
}

function randomBetween(min, max) { return Math.random() * (max - min) + min; }
function randomInt(min, max)     { return Math.floor(randomBetween(min, max + 1)); }
function sleep(ms) {
  return new Promise((resolve) => {
    const id = _timerId++;
    _timers.set(id, resolve);
    browser.runtime.sendMessage({ action: "timer-request", id, ms }).catch(() => {
      // Background unreachable — fall back to regular setTimeout
      _timers.delete(id);
      setTimeout(resolve, ms);
    });
  });
}
function jitter(maxMs)           { return Math.random() * maxMs - maxMs / 2; }
