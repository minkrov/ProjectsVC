const { speedDelays, normalizeTypingBehavior } = globalThis.TextToWriteConfig;
let selectedSpeed = "medium";
const speedButtons = [...document.querySelectorAll(".speed-btn")];

// ---------------------------------------------------------------------------
// Personalities — named bundles of the settings below. Selecting one fills in
// the Custom panel's controls so the user can see (and further tweak) exactly
// what was applied.
// ---------------------------------------------------------------------------
const PERSONALITIES = {
  casual: {
    selectedSpeed: "fast",
    varSpeed: true,
    wordDifficulty: false,
    naturalPauses: true,
    pauseEvery: 12,
    pauseDuration: 4,
    punctPauses: false,
    varyTimes: true,
    paragraphPause: false,
    makeMistakes: true,
    mistakePause: 3,
    mistakeRate: 14,
    selfInterrupt: false,
    quickCorrections: true,
  },
  focused: {
    selectedSpeed: "medium",
    varSpeed: false,
    wordDifficulty: true,
    naturalPauses: true,
    pauseEvery: 8,
    pauseDuration: 8,
    punctPauses: true,
    varyTimes: true,
    paragraphPause: true,
    makeMistakes: true,
    mistakePause: 5,
    mistakeRate: 9,
    selfInterrupt: true,
    quickCorrections: true,
  },
  careful: {
    selectedSpeed: "slow",
    varSpeed: false,
    wordDifficulty: true,
    naturalPauses: true,
    pauseEvery: 6,
    pauseDuration: 12,
    punctPauses: true,
    varyTimes: true,
    paragraphPause: true,
    makeMistakes: true,
    mistakePause: 6,
    mistakeRate: 6,
    selfInterrupt: true,
    quickCorrections: false,
  },
  distracted: {
    selectedSpeed: "medium",
    varSpeed: true,
    wordDifficulty: false,
    naturalPauses: true,
    pauseEvery: 5,
    pauseDuration: 15,
    punctPauses: true,
    varyTimes: true,
    paragraphPause: true,
    makeMistakes: true,
    mistakePause: 7,
    mistakeRate: 11,
    selfInterrupt: true,
    quickCorrections: true,
  },
};

let _activeMode = "custom";        // "custom" | "personalities"
let _activePersonality = null;     // key into PERSONALITIES, or null
let _applyingPersonality = false;  // suppresses _activePersonality reset while applying a preset

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------
let _totalWords = 0;
let _wordsTyped = 0;

function countWords(text) {
  return (text.match(/[a-zA-Z']+/g) || []).length;
}

function updateProgress(wordsTyped, total, finished) {
  const section = document.getElementById("progress-section");
  const fill    = document.getElementById("progress-bar-fill");
  const label   = document.getElementById("progress-label");
  section.classList.add("visible");
  const pct = total > 0 ? Math.min(100, (wordsTyped / total) * 100) : 0;
  fill.style.width = pct + "%";
  if (finished) {
    fill.classList.add("finished");
    label.classList.add("finished");
    label.textContent = `Finished · ${total} word${total !== 1 ? "s" : ""}`;
  } else {
    fill.classList.remove("finished");
    label.classList.remove("finished");
    label.textContent = `${wordsTyped} / ${total} word${total !== 1 ? "s" : ""}`;
  }
}

function resetProgress() {
  const section = document.getElementById("progress-section");
  const fill    = document.getElementById("progress-bar-fill");
  const label   = document.getElementById("progress-label");
  section.classList.remove("visible");
  fill.style.width = "0%";
  fill.classList.remove("finished");
  label.classList.remove("finished");
  label.textContent = "";
}

// Prevent saveSettings() from writing during the startup restore pass
let isInitializing = true;

// ---------------------------------------------------------------------------
// Settings persistence — writes all user-controlled inputs to storage
// ---------------------------------------------------------------------------
function saveSettings() {
  if (isInitializing) return;
  chrome.storage.local.set({
    textInput:     document.getElementById("text-input").value,
    selectedSpeed,
    varSpeed:      document.getElementById("var-speed").checked,
    naturalPauses: naturalPausesCheckbox.checked,
    pauseEvery:    document.getElementById("pause-every").value,
    pauseDuration: document.getElementById("pause-duration").value,
    punctPauses:   document.getElementById("punct-pauses").checked,
    varyTimes:     document.getElementById("vary-times").checked,
    wordDifficulty: document.getElementById("word-difficulty").checked,
    makeMistakes:  mistakesCheckbox.checked,
    mistakePause:  document.getElementById("mistake-pause").value,
    mistakeRate:   document.getElementById("mistake-rate").value,
    paragraphPause: document.getElementById("paragraph-pause").checked,
    selfInterrupt:  document.getElementById("self-interrupt").checked,
    quickCorrections: quickCorrectionsCheckbox.checked,
    startDelay: startDelayInput.value,
    activeMode: _activeMode,
    activePersonality: _activePersonality || "",
  }).catch(() => {});
}

function setActiveSpeed(speed) {
  selectedSpeed = speed;
  speedButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.speed === speed);
  });
}

// ---------------------------------------------------------------------------
// Custom / Personalities mode toggle
// ---------------------------------------------------------------------------
const customPanel        = document.getElementById("custom-panel");
const personalitiesPanel = document.getElementById("personalities-panel");

function setMode(mode) {
  _activeMode = mode;
  document.querySelectorAll(".mode-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });
  customPanel.style.display        = mode === "custom" ? "" : "none";
  personalitiesPanel.style.display = mode === "personalities" ? "" : "none";
  saveSettings();
}

document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

// Clears the active-personality highlight whenever the user manually edits a
// custom setting, so the UI never claims a personality is active when the
// underlying values no longer match it.
function clearActivePersonality() {
  if (_applyingPersonality || _activePersonality === null) return;
  _activePersonality = null;
  updatePersonalityCardsUI();
}

function updatePersonalityCardsUI() {
  document.querySelectorAll(".personality-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.personality === _activePersonality);
  });
}

// Applies a named personality preset to all Custom-panel controls, then
// persists and refreshes accordions so the result is immediately visible.
function applyPersonality(key) {
  const preset = PERSONALITIES[key];
  if (!preset) return;

  _applyingPersonality = true;

  setActiveSpeed(preset.selectedSpeed);

  document.getElementById("var-speed").checked = preset.varSpeed;
  document.getElementById("word-difficulty").checked = preset.wordDifficulty;

  naturalPausesCheckbox.checked = preset.naturalPauses;
  document.getElementById("pause-every").value = preset.pauseEvery;
  document.getElementById("pause-duration").value = preset.pauseDuration;
  document.getElementById("punct-pauses").checked = preset.punctPauses;
  document.getElementById("vary-times").checked = preset.varyTimes;
  document.getElementById("paragraph-pause").checked = preset.paragraphPause;
  naturalPausesRow.classList.toggle("expanded", preset.naturalPauses);
  naturalPausesCollapsible.classList.toggle("expanded", preset.naturalPauses);

  mistakesCheckbox.checked = preset.makeMistakes;
  document.getElementById("mistake-pause").value = preset.mistakePause;
  document.getElementById("mistake-rate").value = preset.mistakeRate;
  document.getElementById("self-interrupt").checked = preset.selfInterrupt;
  quickCorrectionsCheckbox.checked = preset.quickCorrections;
  mistakesRow.classList.toggle("expanded", preset.makeMistakes);
  mistakeCollapsible.classList.toggle("expanded", preset.makeMistakes);

  _activePersonality = key;
  updatePersonalityCardsUI();
  saveSettings();

  _applyingPersonality = false;
}

document.querySelectorAll(".personality-card").forEach((card) => {
  card.addEventListener("click", () => applyPersonality(card.dataset.personality));
});

// Speed selector
document.querySelectorAll(".speed-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    setActiveSpeed(btn.dataset.speed);
    clearActivePersonality();
    saveSettings();
  });
});

// Natural pauses accordion
const naturalPausesCheckbox    = document.getElementById("natural-pauses");
const naturalPausesRow         = document.getElementById("natural-pauses-row");
const naturalPausesCollapsible = document.getElementById("natural-pauses-collapsible");

naturalPausesRow.addEventListener("click", (e) => {
  if (e.target !== naturalPausesCheckbox) naturalPausesCheckbox.checked = !naturalPausesCheckbox.checked;
  updateNaturalPausesPanel();
});
naturalPausesCheckbox.addEventListener("change", updateNaturalPausesPanel);

function updateNaturalPausesPanel() {
  const on = naturalPausesCheckbox.checked;
  naturalPausesRow.classList.toggle("expanded", on);
  naturalPausesCollapsible.classList.toggle("expanded", on);
  clearActivePersonality();
  saveSettings();
}

// Spelling mistakes accordion
const mistakesCheckbox   = document.getElementById("make-mistakes");
const mistakesRow        = document.getElementById("mistakes-row");
const mistakeCollapsible = document.getElementById("mistake-collapsible");

mistakesRow.addEventListener("click", (e) => {
  if (e.target !== mistakesCheckbox) mistakesCheckbox.checked = !mistakesCheckbox.checked;
  updateMistakePanel();
});
mistakesCheckbox.addEventListener("change", updateMistakePanel);

function updateMistakePanel() {
  const on = mistakesCheckbox.checked;
  mistakesRow.classList.toggle("expanded", on);
  mistakeCollapsible.classList.toggle("expanded", on);
  clearActivePersonality();
  saveSettings();
}

const quickCorrectionsCheckbox = document.getElementById("quick-corrections");
const startDelayInput = document.getElementById("start-delay");

// Wire up all other inputs so every change is immediately persisted.
// The main text box is debounced — pasting or typing a long essay would
// otherwise trigger a storage write on every single keystroke.
let _saveTextTimeout = null;
document.getElementById("text-input").addEventListener("input", () => {
  if (isInitializing) return;
  clearTimeout(_saveTextTimeout);
  _saveTextTimeout = setTimeout(saveSettings, 500);
});
["pause-every", "pause-duration", "mistake-pause", "mistake-rate"].forEach((id) => {
  document.getElementById(id).addEventListener("input", () => {
    if (isInitializing) return;
    clearActivePersonality();
    saveSettings();
  });
});
startDelayInput.addEventListener("input", () => {
  if (isInitializing) return;
  saveSettings();
});
["var-speed", "word-difficulty", "punct-pauses", "vary-times",
 "paragraph-pause", "self-interrupt", "quick-corrections"].forEach((id) => {
  document.getElementById(id).addEventListener("change", () => {
    if (isInitializing) return;
    clearActivePersonality();
    saveSettings();
  });
});

// ---------------------------------------------------------------------------
// Session state machine  — idle | typing | paused
// ---------------------------------------------------------------------------
let sessionState = "idle";
let _cancelCountdown = null; // set while a countdown is running

const startBtn = document.getElementById("start-btn");
const stopBtn  = document.getElementById("stop-btn");
const windowCloseBtn = document.getElementById("window-close");

if (windowCloseBtn) {
  windowCloseBtn.addEventListener("click", () => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ source: "text-to-write-overlay", action: "close-overlay" }, "*");
    } else {
      window.close();
    }
  });
}

function setSessionState(state) {
  sessionState = state;
  if (state === "idle") {
    startBtn.textContent = "Type it";
    startBtn.classList.remove("pause-mode", "countdown-mode");
    startBtn.disabled = false;
    stopBtn.classList.remove("visible");
  } else if (state === "countdown") {
    startBtn.textContent = String(parseInt(startDelayInput.value, 10) || 3);
    startBtn.classList.remove("pause-mode");
    startBtn.classList.add("countdown-mode");
    startBtn.disabled = true;
    stopBtn.classList.add("visible");
  } else if (state === "typing") {
    startBtn.textContent = "Pause";
    startBtn.classList.remove("countdown-mode");
    startBtn.classList.add("pause-mode");
    startBtn.disabled = false;
    stopBtn.classList.add("visible");
  } else if (state === "paused") {
    startBtn.textContent = "Resume";
    startBtn.classList.remove("pause-mode", "countdown-mode");
    startBtn.disabled = false;
    stopBtn.classList.add("visible");
  }
  // Persist — treat "countdown" as "idle" so reopening the popup mid-countdown
  // doesn't leave it stuck in an unrecoverable state.
  chrome.storage.local.set({
    sessionState: state === "countdown" ? "idle" : state,
  }).catch(() => {});
}

// Returns a Promise that resolves false when the countdown finishes naturally,
// or true if the user pressed Stop while it was running.
function runCountdown(startAt = Date.now() + 3000) {
  return new Promise((resolve) => {
    let timeoutId;

    _cancelCountdown = () => {
      clearTimeout(timeoutId);
      _cancelCountdown = null;
      resolve(true); // cancelled
    };

    const tick = () => {
      const msLeft = startAt - Date.now();
      if (msLeft <= 0) {
        _cancelCountdown = null;
        resolve(false); // finished naturally
        return;
      }
      startBtn.textContent = String(Math.max(1, Math.ceil(msLeft / 1000)));
      timeoutId = setTimeout(tick, Math.min(250, msLeft));
    };

    tick();
  });
}

// Route a message to the frame that last had focus
async function sendToActiveFrame(tabId, msg) {
  const { frameId } = await chrome.runtime.sendMessage({ action: "get-focused-frame", tabId });
  const opts = (frameId != null) ? { frameId } : {};
  return chrome.tabs.sendMessage(tabId, msg, opts);
}

async function getTargetTabId() {
  const target = await chrome.runtime.sendMessage({ action: "get-target-tab" }).catch(() => null);
  return target?.tabId ?? null;
}

startBtn.addEventListener("click", () => {
  if      (sessionState === "idle")   beginTyping();
  else if (sessionState === "typing") doPause();
  else if (sessionState === "paused") doResume();
});

async function beginTyping() {
  const text = document.getElementById("text-input").value;
  if (!text.trim()) { setStatus("Enter some text first.", "error"); return; }
  const wordCount = countWords(text);

  _totalWords = wordCount;
  _wordsTyped = 0;
  resetProgress();

  setSessionState("countdown");
  setStatus("Starting…");

  try {
    const tabId = await getTargetTabId();
    if (tabId == null) {
      setSessionState("idle");
      setStatus("Click a text field in Arc first, then try again.", "error");
      return;
    }

    chrome.storage.local.set({ totalWords: _totalWords }).catch(() => {});

    const behavior = normalizeTypingBehavior({
      naturalPauses: naturalPausesCheckbox.checked,
      pauseEvery: document.getElementById("pause-every").value,
      pauseDuration: document.getElementById("pause-duration").value,
      varyTimes: document.getElementById("vary-times").checked,
      punctPauses: document.getElementById("punct-pauses").checked,
      varSpeed: document.getElementById("var-speed").checked,
      wordDifficulty: document.getElementById("word-difficulty").checked,
      makeMistakes: mistakesCheckbox.checked,
      mistakePause: document.getElementById("mistake-pause").value,
      mistakeRate: document.getElementById("mistake-rate").value,
    });

    const payload = {
      action: "type",
      text,
      delay:         speedDelays[selectedSpeed],
      naturalPauses: behavior.naturalPauses,
      pauseEvery: behavior.pauseEveryMs,
      pauseDuration: behavior.pauseDurationMs,
      varyTimes: behavior.varyTimes,
      punctPauses: behavior.punctPauses,
      varSpeed: behavior.varSpeed,
      wordDifficulty: behavior.wordDifficulty,
      mistakes: behavior.mistakes,
      mistakePause: behavior.mistakePauseMs,
      mistakeRate: behavior.mistakeRateFraction,
      paragraphPause: document.getElementById("paragraph-pause").checked,
      wordHesitation: true,
      sentenceStart:  true,
      selfInterrupt:  document.getElementById("self-interrupt").checked,
      quickCorrections: quickCorrectionsCheckbox.checked,
    };

    const startDelay = parseInt(startDelayInput.value, 10) || 3;
    const startAt = Date.now() + startDelay * 1000;
    await chrome.runtime.sendMessage({
      action: "schedule-typing-start",
      tabId,
      startAt,
      payload,
    });

    const cancelled = await runCountdown(startAt);
    if (cancelled || sessionState === "idle") return;

    if (sessionState === "countdown") {
      if (_totalWords > 0) updateProgress(0, _totalWords, false);
      setSessionState("typing");
      chrome.storage.local.set({ totalWords: _totalWords }).catch(() => {});
      setStatus("Typing…");
    }
  } catch (err) {
    if (sessionState !== "idle") {
      setSessionState("idle");
      const m = err?.message || "";
      if (
        m.includes("no listener") ||
        m.includes("receiving end") ||
        m.includes("message port") ||
        m.includes("Could not establish connection")
      ) {
        setStatus("No field targeted. Click a text field on the page first.", "error");
      } else {
        setStatus("Could not reach the page. Try reloading it.", "error");
      }
    }
  }
}

async function doPause() {
  setSessionState("paused");
  setStatus("Paused.");
  chrome.runtime.sendMessage({ action: "relay-to-frame", payload: { action: "pause" } }).catch(() => {});
}

async function doResume() {
  setSessionState("typing");
  setStatus("Typing…");
  chrome.runtime.sendMessage({ action: "relay-to-frame", payload: { action: "resume", delay: speedDelays[selectedSpeed] } }).catch(() => {});
}

stopBtn.addEventListener("click", () => {
  if (sessionState === "countdown" && _cancelCountdown) {
    _cancelCountdown();
    chrome.runtime.sendMessage({ action: "cancel-pending-start" }).catch(() => {});
    setSessionState("idle");
    setStatus("Stopped.");
    resetProgress();
    return;
  }
  setSessionState("idle");
  setStatus("Stopped.");
  resetProgress();
  chrome.runtime.sendMessage({ action: "relay-to-frame", payload: { action: "stop" } }).catch(() => {});
});

// Listen for messages from content scripts and background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "typing-progress") {
    _wordsTyped = msg.wordsTyped;
    if (_totalWords > 0) {
      updateProgress(_wordsTyped, _totalWords, false);
      chrome.storage.local.set({ wordsTyped: _wordsTyped }).catch(() => {});
    }
  }

  if (msg.action === "targetUpdate") {
    document.getElementById("target-value").textContent = msg.description;
    document.getElementById("target-box").className = "target-box ready";
    // Persist so the target is shown correctly when popup is reopened
    chrome.storage.local.set({ targetDesc: msg.description, targetReady: true }).catch(() => {});
  }

  // Target element lost focus — auto-pause so characters aren't typed into nowhere
  if (msg.action === "auto-paused") {
    if (sessionState === "typing") {
      setSessionState("paused");
      setStatus("Paused — click Resume to continue.");
    }
  }

  // Typing finished naturally — update UI regardless of which popup instance
  // is open (handles the case where the popup was closed and reopened mid-session)
  if (msg.action === "typing-complete") {
    if (sessionState !== "idle") {
      setSessionState("idle");
      if (!msg.stopped && !msg.error) {
        if (_totalWords > 0) updateProgress(_totalWords, _totalWords, true);
        setStatus("Done.", "success");
      } else {
        setStatus(
          msg.error ? msg.error : "Stopped.",
          msg.error ? "error" : ""
        );
      }
    }
  }
});

function setStatus(msg, type = "") {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = type;
  chrome.storage.local.set({ statusMsg: msg, statusType: type }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Startup: restore all state from storage
// ---------------------------------------------------------------------------
(async function init() {
  document.body.classList.add('no-transition');
  const saved = await chrome.storage.local.get([
    // Settings
    "textInput", "selectedSpeed", "varSpeed", "wordDifficulty",
    "naturalPauses", "pauseEvery", "pauseDuration", "punctPauses", "varyTimes",
    "makeMistakes", "mistakePause", "mistakeRate",
    "paragraphPause", "selfInterrupt",
    "quickCorrections", "startDelay", "activeMode", "activePersonality",
    // Session state
    "sessionState", "statusMsg", "statusType",
    // Target field
    "targetDesc", "targetReady",
    // Progress
    "totalWords", "wordsTyped",
  ]).catch(() => ({}));

  // --- Restore settings ---
  if (saved.textInput !== undefined)
    document.getElementById("text-input").value = saved.textInput;

  if (saved.selectedSpeed) {
    selectedSpeed = saved.selectedSpeed;
    document.querySelectorAll(".speed-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.speed === selectedSpeed);
    });
  }

  if (saved.varSpeed !== undefined)
    document.getElementById("var-speed").checked = saved.varSpeed;
  if (saved.wordDifficulty !== undefined)
    document.getElementById("word-difficulty").checked = saved.wordDifficulty;

  if (saved.naturalPauses !== undefined) {
    naturalPausesCheckbox.checked = saved.naturalPauses;
    const on = saved.naturalPauses;
    naturalPausesRow.classList.toggle("expanded", on);
    naturalPausesCollapsible.classList.toggle("expanded", on);
  }

  if (saved.pauseEvery     !== undefined) document.getElementById("pause-every").value     = saved.pauseEvery;
  if (saved.pauseDuration  !== undefined) document.getElementById("pause-duration").value  = saved.pauseDuration;
  if (saved.punctPauses    !== undefined) document.getElementById("punct-pauses").checked  = saved.punctPauses;
  if (saved.varyTimes      !== undefined) document.getElementById("vary-times").checked    = saved.varyTimes;

  if (saved.makeMistakes !== undefined) {
    mistakesCheckbox.checked = saved.makeMistakes;
    const on = saved.makeMistakes;
    mistakesRow.classList.toggle("expanded", on);
    mistakeCollapsible.classList.toggle("expanded", on);
  }

  if (saved.mistakePause !== undefined) document.getElementById("mistake-pause").value = saved.mistakePause;
  if (saved.mistakeRate  !== undefined) document.getElementById("mistake-rate").value  = saved.mistakeRate;

  if (saved.paragraphPause !== undefined) document.getElementById("paragraph-pause").checked = saved.paragraphPause;
  if (saved.selfInterrupt  !== undefined) document.getElementById("self-interrupt").checked  = saved.selfInterrupt;
  if (saved.quickCorrections !== undefined) quickCorrectionsCheckbox.checked = saved.quickCorrections;
  if (saved.startDelay !== undefined) startDelayInput.value = saved.startDelay;

  if (saved.activePersonality && PERSONALITIES[saved.activePersonality]) {
    _activePersonality = saved.activePersonality;
    updatePersonalityCardsUI();
  }
  setMode(saved.activeMode === "personalities" ? "personalities" : "custom");

  // --- Restore session state (UI only — the content script is already running) ---
  // Always ask the live runtime first. The Arc overlay can be closed while a
  // countdown or typing session continues in the background, so saved UI state
  // may still say "idle" even though typing is already active.
  const liveState = await chrome.runtime.sendMessage({ action: "query-typing-state" })
    .catch(() => ({ active: false }));

  if (saved.totalWords) {
    _totalWords = saved.totalWords;
    _wordsTyped = saved.wordsTyped || 0;
  }

  if (liveState.active) {
    const state = liveState.paused ? "paused" : "typing";
    sessionState = state;
    if (_totalWords > 0) {
      updateProgress(_wordsTyped, _totalWords, false);
    }
    if (state === "typing") {
      startBtn.textContent = "Pause";
      startBtn.classList.add("pause-mode");
      stopBtn.classList.add("visible");
      saved.statusMsg = "Typing…";
      saved.statusType = "";
    } else {
      startBtn.textContent = "Resume";
      startBtn.classList.remove("pause-mode");
      stopBtn.classList.add("visible");
      saved.statusMsg = "Paused.";
      saved.statusType = "";
    }
  } else if (liveState.countdown && liveState.startAt) {
    setSessionState("countdown");
    setStatus("Starting…");
    runCountdown(liveState.startAt).then((cancelled) => {
      if (!cancelled && sessionState === "countdown") {
        if (_totalWords > 0) updateProgress(0, _totalWords, false);
        setSessionState("typing");
        setStatus("Typing…");
      }
    });
  } else if (saved.sessionState === "typing" || saved.sessionState === "paused") {
    chrome.storage.local.set({ sessionState: "idle", statusMsg: "", statusType: "", totalWords: 0 }).catch(() => {});
    saved.statusMsg = "";
    saved.statusType = "";
  } else if (["Starting…", "Typing…", "Paused.", "Paused — click Resume to continue."].includes(saved.statusMsg)) {
    // The Arc overlay can be closed while a run continues or finishes. If
    // nothing is live anymore, clear transient status text so reopen doesn't
    // show stale "Typing…" / "Starting…" UI from an older session.
    chrome.storage.local.set({ statusMsg: "", statusType: "" }).catch(() => {});
    saved.statusMsg = "";
    saved.statusType = "";
  }

  if (saved.statusMsg) {
    const el = document.getElementById("status");
    el.textContent = saved.statusMsg;
    el.className   = saved.statusType || "";
  }

  // --- Restore target field ---
  if (saved.targetDesc) {
    document.getElementById("target-value").textContent = saved.targetDesc;
    document.getElementById("target-box").className =
      saved.targetReady ? "target-box ready" : "target-box none";
  }

  // Inject content script into the active tab so it works on already-open tabs
  // (Chrome only auto-injects declarative content scripts into pages loaded
  // after the extension is installed — existing open tabs need this).
  try {
    const tabId = await getTargetTabId();
    if (tabId != null) {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ["typing-options.js", "content.js"],
      });
    }
  } catch (_) {
    // Silently ignore: chrome:// pages, PDFs, etc. disallow injection
  }

  isInitializing = false;
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('no-transition')));
})();
