let lastFocusedEl = null;
let stopTyping = false;

document.addEventListener("focusin", (e) => {
  const el = e.target;
  if (isTypable(el) || el.isContentEditable) {
    lastFocusedEl = el;
    notifySidebar(el);
    // Tell the background this frame is now the active one.
    // The background uses this to route "type" to exactly one frame,
    // preventing the double-typing bug when multiple iframes exist.
    browser.runtime.sendMessage({ action: "frame-focused" }).catch(() => {});
  }
}, true);

document.addEventListener("blur", (e) => {
  const el = e.target;
  if (isTypable(el) || el.isContentEditable) {
    lastFocusedEl = el;
  }
}, true);

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "stop") {
    stopTyping = true;
    return false;
  }

  if (message.action !== "type") return false;

  const active = document.activeElement;
  const el =
    (lastFocusedEl && (isTypable(lastFocusedEl) || lastFocusedEl.isContentEditable))
      ? lastFocusedEl
      : (isTypable(active) || active?.isContentEditable)
        ? active
        : null;

  if (!el) return false;

  stopTyping = false;
  el.focus();

  const opts = {
    naturalPauses: message.naturalPauses,
    pauseEvery:    message.pauseEvery,
    pauseDuration: message.pauseDuration,
    varyTimes:     message.varyTimes,
    mistakes:      message.mistakes,
    mistakePause:  message.mistakePause,
    mistakeRate:   message.mistakeRate,
  };

  typeText(el, message.text, message.delay, opts)
    .then((stopped) => sendResponse({ success: true, stopped }))
    .catch((err)    => sendResponse({ success: false, error: err.message }));

  return true;
});

// ---------------------------------------------------------------------------
// Core typing loop
// ---------------------------------------------------------------------------

async function typeText(el, text, delay, opts) {
  // Split into alternating word / non-word tokens so we can apply mistakes
  // only to real words while still typing spaces/punctuation normally.
  const tokens = text.match(/[a-zA-Z']+|[^a-zA-Z']+/g) || [];

  let elapsed = 0;
  let timeUntilPause = opts.naturalPauses
    ? applyVariance(opts.pauseEvery, opts.varyTimes)
    : Infinity;

  for (const token of tokens) {
    if (stopTyping) return true;

    const isWord = /^[a-zA-Z']{3,}$/.test(token); // only mistake words of 3+ chars
    const doMistake = opts.mistakes && isWord && Math.random() < opts.mistakeRate;

    if (doMistake) {
      const misspelled = generateMistake(token);

      // Type the wrong version
      for (const char of misspelled) {
        if (stopTyping) return true;
        await typeCharacter(el, char);
        const d = delay + jitter(delay * 0.3);
        await sleep(d);
        elapsed += d;
      }

      // Pause — "noticing" the mistake
      if (await interruptibleSleep(applyVariance(opts.mistakePause, opts.varyTimes))) return true;

      // Delete the misspelled word, one backspace per character
      for (let i = 0; i < misspelled.length; i++) {
        if (stopTyping) return true;
        await typeBackspace(el);
        await sleep(delay + jitter(delay * 0.3));
      }

      // Pause — "thinking" before retyping
      if (await interruptibleSleep(applyVariance(opts.mistakePause, opts.varyTimes))) return true;

      // Retype correctly
      for (const char of token) {
        if (stopTyping) return true;
        await typeCharacter(el, char);
        const d = delay + jitter(delay * 0.3);
        await sleep(d);
        elapsed += d;
      }
    } else {
      // Normal typing
      for (const char of token) {
        if (stopTyping) return true;

        // Natural pause — fire at token boundaries only (between words)
        if (opts.naturalPauses && elapsed >= timeUntilPause) {
          if (await interruptibleSleep(applyVariance(opts.pauseDuration, opts.varyTimes))) return true;
          elapsed = 0;
          timeUntilPause = applyVariance(opts.pauseEvery, opts.varyTimes);
        }

        await typeCharacter(el, char);
        const d = delay + jitter(delay * 0.3);
        await sleep(d);
        elapsed += d;
      }
    }
  }

  return false;
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
    // Swap one character for an adjacent key
    const pos = 1 + Math.floor(Math.random() * (word.length - 1));
    const key = word[pos].toLowerCase();
    const neighbors = qwertyNeighbors[key];
    if (!neighbors) return doubleLetter(word); // fallback
    const wrong = neighbors[Math.floor(Math.random() * neighbors.length)];
    const replacement = /[A-Z]/.test(word[pos]) ? wrong.toUpperCase() : wrong;
    return word.slice(0, pos) + replacement + word.slice(pos + 1);
  }

  if (type === 1) {
    // Transpose two adjacent letters
    const pos = Math.floor(Math.random() * (word.length - 1));
    return word.slice(0, pos) + word[pos + 1] + word[pos] + word.slice(pos + 2);
  }

  // Double a letter
  return doubleLetter(word);
}

function doubleLetter(word) {
  const pos = Math.floor(Math.random() * word.length);
  return word.slice(0, pos) + word[pos] + word.slice(pos);
}

// ---------------------------------------------------------------------------
// Backspace simulation
// ---------------------------------------------------------------------------

function typeBackspace(el) {
  return new Promise((resolve) => {
    el.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Backspace", code: "Backspace", keyCode: 8, which: 8,
      bubbles: true, cancelable: true,
    }));

    if (el.isContentEditable) {
      deleteLastCharContentEditable(el);
    } else {
      deleteLastCharInput(el);
    }

    el.dispatchEvent(new InputEvent("input", {
      inputType: "deleteContentBackward",
      bubbles: true, cancelable: false,
    }));

    el.dispatchEvent(new KeyboardEvent("keyup", {
      key: "Backspace", code: "Backspace", keyCode: 8, which: 8,
      bubbles: true, cancelable: true,
    }));

    resolve();
  });
}

function deleteLastCharInput(el) {
  const start = el.selectionStart;
  const end   = el.selectionEnd;
  if (start === 0 && end === 0) return;
  const value = el.value;
  const nativeSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
  const newVal = value.slice(0, start - 1) + value.slice(end);
  if (nativeSetter) {
    nativeSetter.call(el, newVal);
  } else {
    el.value = newVal;
  }
  el.selectionStart = start - 1;
  el.selectionEnd   = start - 1;
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
  const tag      = el.tagName.toLowerCase();
  const typeAttr = el.type ? ` [${el.type}]` : "";
  const hint     = el.placeholder || el.name || el.id || el.getAttribute("aria-label") || "";
  browser.runtime.sendMessage({
    action: "targetUpdate",
    description: `${tag}${typeAttr}${hint ? " — " + hint : ""}`,
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
  const end   = el.selectionEnd;
  const value = el.value;
  const nativeSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value.slice(0, start) + char + value.slice(end));
  } else {
    el.value = value.slice(0, start) + char + value.slice(end);
  }
  el.selectionStart = start + 1;
  el.selectionEnd   = start + 1;
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

function applyVariance(ms, vary) {
  if (!vary) return ms;
  const sign        = Math.random() < 0.5 ? 1 : -1;
  const varianceMs  = (1 + Math.random() * 2) * 1000;
  return Math.max(1000, ms + sign * varianceMs);
}

async function interruptibleSleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (stopTyping) return true;
    await sleep(Math.min(100, end - Date.now()));
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(maxMs) {
  return Math.random() * maxMs - maxMs / 2;
}
