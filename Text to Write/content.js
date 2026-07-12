let lastFocusedEl  = null;
let stopTyping     = false;
let pausedTyping   = false;
let isTypingActive = false;

// offsetParent throttle — querying offsetParent forces a layout reflow, so we
// cache the result and only re-measure every 500 ms instead of every character.
let _offsetParentCheckedAt = 0;
let _offsetParentWasNull   = false;

// typing-progress throttle — limits how often progress messages are sent to
// the sidebar so the message queue doesn't flood on fast/long typing sessions.
let _lastProgressSent = 0;

// ---------------------------------------------------------------------------
// Background-relay timer — routes sleeps through the persistent background
// script whose setTimeout is never throttled, so typing keeps full speed
// even when this tab is in the background.
// ---------------------------------------------------------------------------
let _timers  = new Map();
let _timerId = 0;
let _activeDelay = 0; // updated when typing starts or when speed changes during a pause

// ---------------------------------------------------------------------------
// Blur-pause — auto-pauses when the target element genuinely loses focus.
//
// contentEditable (Google Docs, Slides canvas, rich editors):
//   No blur / mousedown / selection event listeners are attached.  Any of those
//   signals can fire transiently during normal editor activity (spell-check
//   panel, autocomplete, format toolbar) and — even with a debounce — keeping
//   typing running while the cursor is displaced scrambles the output.
//   Auto-pause only triggers from the definitive DOM checks in checkStop()
//   (element removed from DOM, contenteditable turned off, element hidden).
//   All other pausing is manual (Pause / Stop button) or cross-frame (below).
//
// textarea / input:
//   mousedown + pointerdown (capture) and element blur are all debounced
//   through schedulePause() — a 350 ms re-check drops transient signals and
//   only fires doPause() if focus is still genuinely gone.
//
// Cross-frame (Google Slides):
//   The background-relayed external-mousedown signal remains immediate —
//   clicking a completely different iframe is always intentional.
// ---------------------------------------------------------------------------
let _blurTarget          = null;
let _mousedownHandler    = null;
let _pointerdownHandler  = null;
let _blurFallbackHandler = null;
let _pauseDebounceTimer  = null;

function doPause() {
  if (!stopTyping && !pausedTyping) {
    pausedTyping = true;
    browser.runtime.sendMessage({ action: "auto-paused" }).catch(() => {});
  }
}

// Schedule a pause after 350 ms, re-checking focus at that point.
// If the typing loop calls cancelScheduledPause() before the timer fires
// (because focus was restored), the pause is silently dropped.
function schedulePause() {
  if (_pauseDebounceTimer !== null) return; // already pending
  _pauseDebounceTimer = setTimeout(() => {
    _pauseDebounceTimer = null;
    if (!_blurTarget || stopTyping || pausedTyping) return;
    const el  = _blurTarget;
    const sel = el.isContentEditable ? window.getSelection() : null;
    const stillLost =
      !el.isConnected ||
      (el.isContentEditable === false) ||
      (el.offsetParent === null && el.tagName !== "BODY") ||
      (!el.isContentEditable && document.activeElement !== el) ||
      (sel !== null && (
        sel.rangeCount === 0 ||
        !el.contains(sel.getRangeAt(0).commonAncestorContainer)
      ));
    if (stillLost) doPause();
  }, 350);
}

function cancelScheduledPause() {
  if (_pauseDebounceTimer !== null) {
    clearTimeout(_pauseDebounceTimer);
    _pauseDebounceTimer = null;
  }
}

function attachBlurPause(el) {
  detachBlurPause();
  _blurTarget = el;

  if (!el.isContentEditable) {
    // Plain textarea / input: mousedown + blur detection (both debounced).
    const outsideClick = (e) => {
      if (_blurTarget && !_blurTarget.contains(e.target)) schedulePause();
    };
    _mousedownHandler   = outsideClick;
    _pointerdownHandler = outsideClick;
    document.addEventListener("mousedown",   _mousedownHandler,   true);
    document.addEventListener("pointerdown", _pointerdownHandler, true);

    _blurFallbackHandler = () => schedulePause();
    el.addEventListener("blur", _blurFallbackHandler);
  }
  // contentEditable: no event listeners at all.
  // Spell-check panels, autocomplete, format toolbars — any Google Docs UI
  // activity can fire blur/mousedown and temporarily shift the selection.
  // Reacting to those events (even with a debounce) keeps typing running while
  // the cursor is in the wrong place, scrambling the output.
  // Instead: only the definitive DOM checks in checkStop() trigger auto-pause
  // (element removed, contenteditable turned off, element hidden).
  // Everything else is handled by the manual Pause / Stop buttons, or by the
  // cross-frame external-mousedown signal for Google Slides.
}

function detachBlurPause() {
  cancelScheduledPause();
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
    if (message.delay !== undefined) _activeDelay = message.delay;
    pausedTyping = false;
    cancelScheduledPause(); // drop any pending auto-pause from before the break
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

  // Sidebar querying whether a typing session is actually running in this frame
  if (message.action === "get-typing-state") {
    sendResponse({ active: isTypingActive, paused: pausedTyping });
    return false;
  }

  if (message.action !== "type") return false;

  const active = document.activeElement;
  const el =
    (lastFocusedEl && (isTypable(lastFocusedEl) || lastFocusedEl.isContentEditable))
      ? lastFocusedEl
      : (isTypable(active) || active?.isContentEditable) ? active : null;

  if (!el) return false;

  // Reject readonly or disabled plain inputs — typing silently fails on these.
  if (!el.isContentEditable && (el.readOnly || el.disabled)) {
    sendResponse({ success: false, error: "That field is read-only or disabled." });
    return true;
  }

  stopTyping   = false;
  pausedTyping = false;
  _activeDelay = message.delay;
  cancelScheduledPause();
  _timers.clear(); // discard any stale callbacks from a previous session
  // _timerId is intentionally NOT reset — monotonically increasing IDs prevent
  // stale background timers from a previous session colliding with new ones.
  _offsetParentCheckedAt = 0; // reset offsetParent cache for new session
  _lastProgressSent      = 0; // reset progress throttle for new session
  el.focus();
  attachBlurPause(el);
  browser.runtime.sendMessage({ action: "typing-started" }).catch(() => {});
  isTypingActive = true;

  const opts = {
    naturalPauses: message.naturalPauses,
    pauseEvery:    message.pauseEvery,
    pauseDuration: message.pauseDuration,
    varyTimes:     message.varyTimes,
    punctPauses:   message.punctPauses,
    varSpeed:      message.varSpeed,
    wordDifficulty: message.wordDifficulty,
    mistakes:      message.mistakes,
    mistakePause:  message.mistakePause,
    mistakeRate:   message.mistakeRate,
    paragraphPause: message.paragraphPause,
    wordHesitation: message.wordHesitation,
    sentenceStart:  message.sentenceStart,
    selfInterrupt:  message.selfInterrupt,
    quickCorrections: message.quickCorrections,
  };

  typeText(el, message.text, message.delay, opts)
    .then((stopped) => {
      isTypingActive = false;
      detachBlurPause();
      browser.runtime.sendMessage({ action: "typing-stopped" }).catch(() => {});
      sendResponse({ success: true, stopped });
      browser.runtime.sendMessage({ action: "typing-complete", stopped }).catch(() => {});
    })
    .catch((err) => {
      isTypingActive = false;
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
  const typingConfig = globalThis.TextToWriteConfig;
  const tokens = text.match(/[a-zA-Z']+|[^a-zA-Z']+/g) || [];
  let wordsTyped = 0;

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

  // Burst-typing rhythm: a short extra pause every few characters, at every
  // speed, so even Fast mode doesn't feel like a metronome.
  const burst = { counter: randomInt(3, 8) };

  // Pending "dropped letter" — set when a character is skipped and caught
  // a beat later (see quick-corrections below).
  let pendingDrop = null;

  // Sentence / paragraph state
  let afterSentenceEnd = true;  // true at text start = sentence-start slowdown for first word
  let afterNewline     = false; // true after a non-word token that contains \n

  for (const token of tokens) {
    delay = _activeDelay; // pick up any speed change made during a pause
    if (await checkStop()) return true;

    const pScale = typingConfig.pauseScale(delay);

    const isWordToken = /^[a-zA-Z']/.test(token); // for progress counting
    const isWord      = /^[a-zA-Z']{3,}$/.test(token); // for mistake generation
    const wordMult    = opts.wordDifficulty ? typingConfig.wordDifficultyMultiplier(token) : 1;
    const mistakeRate = typingConfig.adjustedMistakeRate(opts.mistakeRate, token, delay);
    const doMistake   = opts.mistakes && isWord && Math.random() < mistakeRate;

    // Paragraph hesitation — before first word after a newline
    if (isWordToken && afterNewline && opts.paragraphPause) {
      if (await interruptibleSleep(randomBetween(1000 * pScale, 3000 * pScale))) return true;
    }

    // Word hesitation — before rare/long words
    if (isWordToken && opts.wordHesitation && typingConfig.wordDifficultyMultiplier(token) >= 1.2) {
      if (await interruptibleSleep(randomBetween(500 * pScale, 2500 * pScale))) return true;
    }

    // Sentence-start slowdown multiplier
    const sentenceMult = (afterSentenceEnd && isWordToken && opts.sentenceStart)
      ? (1.7 + Math.random() * 0.3) : 1.0;

    // Self-interrupt: eligible words only, not already a typo word
    const doSelfInterrupt = opts.selfInterrupt && isWordToken && isWord
      && token.length >= 4 && !doMistake && Math.random() < 0.015;

    if (doMistake) {
      const misspelled = generateMistake(token);

      // Type the wrong version
      for (const char of misspelled) {
        if (await checkStop()) return true;
        await typeCharacter(el, char);
        const d = charDelay(delay, speedMult, opts.varSpeed, wordMult, char);
        if (await typeSleep(d)) return true;
        elapsed += d;
        ({ speedMult, charsUntilSpeedShift } = tickSpeed(speedMult, charsUntilSpeedShift, opts.varSpeed));
        const burstExtra = await maybeBurstPause(burst, pScale);
        if (burstExtra === null) return true;
        elapsed += burstExtra;
      }

      // Pause — "noticing" the mistake
      if (await interruptibleSleep(applyVariance(opts.mistakePause, opts.varyTimes))) return true;

      // Backspace the wrong word
      for (let i = 0; i < misspelled.length; i++) {
        if (await checkStop()) return true;
        await typeBackspace(el);
        const d = delay + jitter(delay * 0.3);
        if (await typeSleep(d)) return true;
        elapsed += d;
      }

      // Pause — "thinking" before retyping
      if (await interruptibleSleep(applyVariance(opts.mistakePause, opts.varyTimes))) return true;

      // Retype correctly
      for (const char of token) {
        if (await checkStop()) return true;
        await typeCharacter(el, char);
        const d = charDelay(delay, speedMult, opts.varSpeed, wordMult, char);
        if (await typeSleep(d)) return true;
        elapsed += d;
        ({ speedMult, charsUntilSpeedShift } = tickSpeed(speedMult, charsUntilSpeedShift, opts.varSpeed));
        const burstExtra = await maybeBurstPause(burst, pScale);
        if (burstExtra === null) return true;
        elapsed += burstExtra;
      }

      wordsTyped++;
      const _now1 = Date.now();
      if (_now1 - _lastProgressSent >= 300) {
        _lastProgressSent = _now1;
        browser.runtime.sendMessage({ action: "typing-progress", wordsTyped }).catch(() => {});
      }

    } else {
      let charIndex = 0;
      const charsCount = token.length;
      for (const char of token) {
        if (char === '\r') continue; // CR is a no-op — avoids double newlines on CRLF text
        if (await checkStop()) return true;

        // Natural pause — check at each character
        if (opts.naturalPauses && elapsed >= timeUntilPause) {
          if (await interruptibleSleep(applyVariance(opts.pauseDuration, opts.varyTimes))) return true;
          elapsed = 0;
          timeUntilPause = applyVariance(opts.pauseEvery, opts.varyTimes);
        }

        // Capitalization slip — first char of first word after sentence end
        const doCapSlip = opts.mistakes && afterSentenceEnd && charIndex === 0
          && isWordToken && /[A-Z]/.test(char) && Math.random() < 0.12;

        // Quick self-corrections: small typos that get caught and fixed
        // almost instantly, the way a fast typist would.
        const quickEligible = opts.mistakes && opts.quickCorrections && !doCapSlip && /[a-zA-Z]/.test(char);

        const doDropCatch = pendingDrop !== null;

        const doDropNow = !doDropCatch && quickEligible
          && charIndex + 1 < charsCount && Math.random() < 0.012;

        const doInstantFix = !doDropCatch && !doDropNow && quickEligible
          && charIndex > 0 && typingConfig.qwertyNeighbors[char.toLowerCase()] && Math.random() < 0.02;

        const doStuckShift = !doDropCatch && !doDropNow && !doInstantFix && quickEligible
          && charIndex > 0 && /[a-z]/.test(char) && Math.random() < 0.012;

        if (doCapSlip) {
          await typeCharacter(el, char.toLowerCase());
          const dSlip = charDelay(delay * sentenceMult, speedMult, opts.varSpeed, wordMult, char.toLowerCase());
          if (await typeSleep(dSlip)) return true;
          elapsed += dSlip;
          ({ speedMult, charsUntilSpeedShift } = tickSpeed(speedMult, charsUntilSpeedShift, opts.varSpeed));

          if (await interruptibleSleep(randomBetween(200 * pScale, 600 * pScale))) return true;
          await typeBackspace(el);
          const dBs = charDelay(delay, speedMult, opts.varSpeed, wordMult, ' ');
          if (await typeSleep(dBs)) return true;
          elapsed += dBs;

          await typeCharacter(el, char);
          const dCap = charDelay(delay * sentenceMult, speedMult, opts.varSpeed, wordMult, char);
          if (await typeSleep(dCap)) return true;
          ({ speedMult, charsUntilSpeedShift } = tickSpeed(speedMult, charsUntilSpeedShift, opts.varSpeed));
          elapsed += dCap;

          const burstExtra = await maybeBurstPause(burst, pScale);
          if (burstExtra === null) return true;
          elapsed += burstExtra;
        } else if (doDropCatch) {
          // Catch-up from a dropped letter one character ago: type this
          // character normally, then a beat later notice the gap, backspace,
          // and retype the missed letter + this one.
          const missed = pendingDrop;
          pendingDrop = null;

          await typeCharacter(el, char);
          const d = charDelay(delay * sentenceMult, speedMult, opts.varSpeed, wordMult, char);
          if (await typeSleep(d)) return true;
          elapsed += d;
          ({ speedMult, charsUntilSpeedShift } = tickSpeed(speedMult, charsUntilSpeedShift, opts.varSpeed));

          if (await interruptibleSleep(randomBetween(150, 400) * pScale)) return true;
          await typeBackspace(el);
          const dBs = charDelay(delay, speedMult, opts.varSpeed, wordMult, ' ');
          if (await typeSleep(dBs)) return true;
          elapsed += dBs;

          await typeCharacter(el, missed);
          const dMissed = charDelay(delay, speedMult, opts.varSpeed, wordMult, missed);
          if (await typeSleep(dMissed)) return true;
          elapsed += dMissed;

          await typeCharacter(el, char);
          const dRedo = charDelay(delay, speedMult, opts.varSpeed, wordMult, char);
          if (await typeSleep(dRedo)) return true;
          elapsed += dRedo;

          const burstExtra = await maybeBurstPause(burst, pScale);
          if (burstExtra === null) return true;
          elapsed += burstExtra;
        } else if (doDropNow) {
          // Skip this letter entirely for now — it gets typed when the gap
          // is "noticed" on the next character.
          pendingDrop = char;
        } else if (doInstantFix) {
          // Hit an adjacent key, notice immediately, fix it.
          const lower = char.toLowerCase();
          const neighbors = typingConfig.qwertyNeighbors[lower];
          const wrongLower = neighbors[randomInt(0, neighbors.length - 1)];
          const wrong = /[A-Z]/.test(char) ? wrongLower.toUpperCase() : wrongLower;

          await typeCharacter(el, wrong);
          const dWrong = charDelay(delay * sentenceMult, speedMult, opts.varSpeed, wordMult, wrong);
          if (await typeSleep(dWrong)) return true;
          elapsed += dWrong;

          if (await interruptibleSleep(randomBetween(80, 220) * pScale)) return true;
          await typeBackspace(el);
          const dBs = charDelay(delay, speedMult, opts.varSpeed, wordMult, ' ');
          if (await typeSleep(dBs)) return true;
          elapsed += dBs;

          await typeCharacter(el, char);
          const d = charDelay(delay * sentenceMult, speedMult, opts.varSpeed, wordMult, char);
          if (await typeSleep(d)) return true;
          elapsed += d;
          ({ speedMult, charsUntilSpeedShift } = tickSpeed(speedMult, charsUntilSpeedShift, opts.varSpeed));

          const burstExtra = await maybeBurstPause(burst, pScale);
          if (burstExtra === null) return true;
          elapsed += burstExtra;
        } else if (doStuckShift) {
          // Shift "sticks" for one extra letter, notice immediately, fix it.
          const upper = char.toUpperCase();

          await typeCharacter(el, upper);
          const dUp = charDelay(delay * sentenceMult, speedMult, opts.varSpeed, wordMult, upper);
          if (await typeSleep(dUp)) return true;
          elapsed += dUp;

          if (await interruptibleSleep(randomBetween(100, 300) * pScale)) return true;
          await typeBackspace(el);
          const dBs = charDelay(delay, speedMult, opts.varSpeed, wordMult, ' ');
          if (await typeSleep(dBs)) return true;
          elapsed += dBs;

          await typeCharacter(el, char);
          const d = charDelay(delay * sentenceMult, speedMult, opts.varSpeed, wordMult, char);
          if (await typeSleep(d)) return true;
          elapsed += d;
          ({ speedMult, charsUntilSpeedShift } = tickSpeed(speedMult, charsUntilSpeedShift, opts.varSpeed));

          const burstExtra = await maybeBurstPause(burst, pScale);
          if (burstExtra === null) return true;
          elapsed += burstExtra;
        } else {
          await typeCharacter(el, char);

          // Double-letter slip
          const doDoubleSlip = opts.mistakes && /[a-zA-Z]/.test(char) && Math.random() < 0.015;

          const d = charDelay(delay * sentenceMult, speedMult, opts.varSpeed, wordMult, char);
          if (await typeSleep(d)) return true;
          elapsed += d;
          ({ speedMult, charsUntilSpeedShift } = tickSpeed(speedMult, charsUntilSpeedShift, opts.varSpeed));

          if (doDoubleSlip) {
            await typeCharacter(el, char);
            if (await interruptibleSleep(randomBetween(100, 350) * pScale)) return true;
            await typeBackspace(el);
            if (await typeSleep(charDelay(delay, speedMult, opts.varSpeed, wordMult, ' '))) return true;
          }

          const burstExtra = await maybeBurstPause(burst, pScale);
          if (burstExtra === null) return true;
          elapsed += burstExtra;
        }

        // Punctuation pause — after typing a punctuation char
        if (opts.punctPauses && '.,:;!?'.includes(char)) {
          punctCount++;
          if (punctCount >= nextPunctThreshold) {
            if (await interruptibleSleep(randomBetween(1000 * pScale, 2000 * pScale))) return true;
            punctCount = 0;
            nextPunctThreshold = randomInt(3, 5);
          }
        }

        charIndex++;
      }

      // Self-interrupt block — after char loop
      if (doSelfInterrupt) {
        if (await interruptibleSleep(randomBetween(400 * pScale, 1200 * pScale))) return true;
        const wordChars = [...token];
        for (let i = 0; i < wordChars.length; i++) {
          if (await checkStop()) return true;
          await typeBackspace(el);
          const d = charDelay(delay * 0.85, 1.0, false, 1.0, ' ');
          if (await typeSleep(d)) return true;
          elapsed += d;
        }
        if (await interruptibleSleep(randomBetween(300 * pScale, 800 * pScale))) return true;
        for (const ch of token) {
          if (await checkStop()) return true;
          await typeCharacter(el, ch);
          const d = charDelay(delay, speedMult, opts.varSpeed, wordMult, ch);
          if (await typeSleep(d)) return true;
          elapsed += d;
          ({ speedMult, charsUntilSpeedShift } = tickSpeed(speedMult, charsUntilSpeedShift, opts.varSpeed));
        }
      }

      if (isWordToken) {
        wordsTyped++;
        const _now2 = Date.now();
        if (_now2 - _lastProgressSent >= 300) {
          _lastProgressSent = _now2;
          browser.runtime.sendMessage({ action: "typing-progress", wordsTyped }).catch(() => {});
        }
      }
    }

    // Update sentence/paragraph state for next token
    if (isWordToken) {
      afterSentenceEnd = false;
      afterNewline     = false;
    } else {
      afterSentenceEnd = /[.!?]/.test(token) || token.includes('\n');
      afterNewline     = token.includes('\n');
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Speed helpers
// ---------------------------------------------------------------------------
function charDelay(base, mult, varSpeed, wordMult = 1, ch = ' ') {
  const effective = (varSpeed ? base * mult : base) * wordMult;
  const shiftExtra = globalThis.TextToWriteConfig.requiresShift(ch)
    ? effective * (0.12 + Math.random() * 0.1)
    : 0;
  return Math.max(0, effective + shiftExtra + jitter(effective * 0.3));
}

// Burst-typing rhythm: every few characters, add a short extra pause (scaled
// by typing speed) so the cadence isn't perfectly metronomic. Returns the
// extra ms elapsed (0 if no pause this call), or null if typing was stopped.
async function maybeBurstPause(burst, scale) {
  burst.counter--;
  if (burst.counter > 0) return 0;
  burst.counter = randomInt(3, 8);
  const extra = Math.max(0, randomBetween(40, 150) * scale);
  if (await typeSleep(extra)) return null;
  return extra;
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
function generateMistake(word) {
  return globalThis.TextToWriteConfig.generateMistake(word);
}

// ---------------------------------------------------------------------------
// Pause / stop / sleep utilities
// ---------------------------------------------------------------------------

// Wait while paused; return true if stopped.
// For contentEditable: only definitive DOM loss triggers auto-pause (element
// removed, CE turned off, hidden). No blur/selection checks — those fire
// during normal Google Docs UI activity (spell-check panel, autocomplete) and
// would corrupt the output by letting typing continue while the cursor is
// temporarily displaced.
// For textarea/input: activeElement departure is also a definitive signal.
async function checkStop() {
  if (_blurTarget && !pausedTyping && !stopTyping) {
    const el = _blurTarget;

    // offsetParent triggers a layout reflow — throttle to once per 500 ms.
    const now = Date.now();
    if (now - _offsetParentCheckedAt >= 500) {
      _offsetParentWasNull   = (el.offsetParent === null && el.tagName !== "BODY");
      _offsetParentCheckedAt = now;
    }

    const definiteLoss =
      !el.isConnected ||
      (el.isContentEditable === false) ||
      _offsetParentWasNull ||
      (!el.isContentEditable && document.activeElement !== el);

    if (definiteLoss) {
      cancelScheduledPause();
      doPause();
    } else {
      cancelScheduledPause();
    }
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
      // NOTE: execCommand('insertParagraph') fires its own `input` event, so we
      // only dispatch `input` manually when falling back to DOM manipulation.
      const paragraphInserted = document.execCommand("insertParagraph");
      if (!paragraphInserted) {
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
        el.dispatchEvent(new InputEvent("input", { data: null, inputType: "insertParagraph", bubbles: true, cancelable: false }));
      }
    } else {
      insertAtCursor(el, "\n");
      el.dispatchEvent(new InputEvent("input", { data: null, inputType: "insertParagraph", bubbles: true, cancelable: false }));
    }
    el.dispatchEvent(new KeyboardEvent("keyup",    { key: "Enter", code: "Enter", keyCode: 13, charCode: 0,  which: 13, bubbles: true, cancelable: true }));
    resolve();
  });
}

function typeCharacter(el, char) {
  if (char === "\n" || char === "\r") return typeNewline(el);
  return new Promise((resolve) => {
    // Emoji / non-BMP characters (surrogate pairs, char.length > 1) have no
    // keyboard key.  Real emoji entry via an emoji picker fires ZERO keyboard
    // events — only an `input` event.  Firing keydown/keypress with made-up
    // keyCodes causes editors to insert placeholder glyphs or lone surrogates
    // before our own insertion runs, producing garbage output.
    const isEmoji = char.length > 1;

    if (isEmoji) {
      emojiInsert(el, char);
    } else {
      const charCode = char.charCodeAt(0);

      // keyCode must reflect the PHYSICAL key, not the character's Unicode
      // value.  charCodes 33–46 overlap with navigation keyCodes:
      //   33=PageUp  34=PageDown  35=End  36=Home
      //   37=←  38=↑  39=→  40=↓  46=Delete
      // Sending keydown with keyCode:38 for '&' makes Google Docs treat it as
      // Up Arrow — moving the cursor before our character lands, scrambling
      // the entire output.  Only letters (A-Z/a-z) and digits (0-9) have a
      // safe 1:1 charCode↔keyCode mapping; everything else gets 0 so no
      // navigation action fires.
      const keyCode = (charCode >= 48 && charCode <= 57)               ? charCode           // 0–9
                    : (charCode >= 65 && charCode <= 90)               ? charCode           // A–Z
                    : (charCode >= 97 && charCode <= 122)              ? charCode - 32      // a–z
                    : 0;                                                                    // everything else
      const codeStr = `Key${char.toUpperCase()}`;

      el.dispatchEvent(new KeyboardEvent("keydown", {
        key: char, code: codeStr,
        keyCode, charCode: 0, which: keyCode, bubbles: true, cancelable: true,
      }));
      el.dispatchEvent(new KeyboardEvent("keypress", {
        key: char, code: codeStr,
        keyCode: charCode, charCode, which: charCode, bubbles: true, cancelable: true,
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
        key: char, code: codeStr,
        keyCode, charCode: 0, which: keyCode, bubbles: true, cancelable: true,
      }));
    }

    resolve();
  });
}

// ---------------------------------------------------------------------------
// Emoji insertion — four cascading strategies, cleanest first
// ---------------------------------------------------------------------------
function emojiInsert(el, char) {
  if (!el.isContentEditable) {
    // Plain <textarea> / <input>: direct value manipulation always handles
    // Unicode correctly without any keyboard-event interference.
    insertAtCursor(el, char);
    el.dispatchEvent(new InputEvent("input", {
      data: char, inputType: "insertText", bubbles: true, cancelable: false,
    }));
    return;
  }

  // Strategy 1 — beforeinput
  // Modern editors (ProseMirror, Slate, Lexical) intercept `beforeinput` with
  // inputType "insertText" and call preventDefault() once they've handled it
  // themselves via their own (correct) Unicode-aware insertion path.
  const bi = new InputEvent("beforeinput", {
    inputType: "insertText", data: char,
    bubbles: true, cancelable: true,
  });
  el.dispatchEvent(bi);
  if (bi.defaultPrevented) {
    // Editor already inserted the emoji — just fire `input` to notify listeners.
    el.dispatchEvent(new InputEvent("input", {
      data: char, inputType: "insertText", bubbles: true, cancelable: false,
    }));
    return;
  }

  // Strategy 2 — execCommand('insertHTML')
  // Takes a different Firefox code path than 'insertText', which avoids the
  // Firefox bug where insertText only inserts the high UTF-16 surrogate for
  // non-BMP characters.  The emoji is valid HTML text content, so no escaping
  // is needed; the browser inserts it as a plain text node via its HTML parser.
  if (document.execCommand("insertHTML", false, char)) {
    el.dispatchEvent(new InputEvent("input", {
      data: char, inputType: "insertText", bubbles: true, cancelable: false,
    }));
    return;
  }

  // Strategy 3 — direct DOM insertion via Selection / Range
  // No keyboard events are in flight at this point so the selection is clean.
  // createTextNode correctly stores the full surrogate pair as a DOM text node.
  insertIntoContentEditable(el, char);
  el.dispatchEvent(new InputEvent("input", {
    data: char, inputType: "insertText", bubbles: true, cancelable: false,
  }));
}

function insertAtCursor(el, char) {
  const start = el.selectionStart;
  const end   = el.selectionEnd;
  const nativeSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
  const newVal = el.value.slice(0, start) + char + el.value.slice(end);
  if (nativeSetter) nativeSetter.call(el, newVal); else el.value = newVal;
  // Use char.length (not 1) so emoji/surrogate-pair chars advance the cursor correctly
  el.selectionStart = el.selectionEnd = start + char.length;
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
  // Determine delete width: emoji/surrogate pairs are 2 code units; BMP chars are 1
  const prevChar    = [...el.value.slice(0, start)].slice(-1)[0] || "";
  const deleteCount = prevChar.length;
  const nativeSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
  const newVal = el.value.slice(0, start - deleteCount) + el.value.slice(end);
  if (nativeSetter) nativeSetter.call(el, newVal); else el.value = newVal;
  el.selectionStart = el.selectionEnd = start - deleteCount;
}

function deleteLastCharContentEditable(el) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range     = selection.getRangeAt(0);
  const offset    = range.startOffset;
  if (offset > 0) {
    // Determine delete width: emoji/surrogate pairs are 2 code units; BMP chars are 1
    const text        = range.startContainer.textContent || "";
    const prevChar    = [...text.slice(0, offset)].slice(-1)[0] || "";
    const deleteCount = prevChar.length;
    range.setStart(range.startContainer, offset - deleteCount);
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
  const sign  = Math.random() < 0.5 ? 1 : -1;
  const delta = (1 + Math.random() * 2) * 1000;
  return Math.max(Math.round(ms * 0.25), ms + sign * delta);
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
