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

const els = {
  textInput: document.getElementById("text-input"),
  progressSection: document.getElementById("progress-section"),
  progressFill: document.getElementById("progress-bar-fill"),
  progressLabel: document.getElementById("progress-label"),
  status: document.getElementById("status"),
  targetValue: document.getElementById("target-value"),
  targetBox: document.getElementById("target-box"),
  startBtn: document.getElementById("start-btn"),
  stopBtn: document.getElementById("stop-btn"),
  varSpeed: document.getElementById("var-speed"),
  wordDifficulty: document.getElementById("word-difficulty"),
  pauseEvery: document.getElementById("pause-every"),
  pauseDuration: document.getElementById("pause-duration"),
  punctPauses: document.getElementById("punct-pauses"),
  varyTimes: document.getElementById("vary-times"),
  mistakePause: document.getElementById("mistake-pause"),
  mistakeRate: document.getElementById("mistake-rate"),
  paragraphPause: document.getElementById("paragraph-pause"),
  selfInterrupt:  document.getElementById("self-interrupt"),
  quickCorrections: document.getElementById("quick-corrections"),
  startDelay: document.getElementById("start-delay"),
};

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------
let _totalWords = 0;
let _wordsTyped = 0;

function countWords(text) {
  return (text.match(/[a-zA-Z']+/g) || []).length;
}

function updateProgress(wordsTyped, total, finished) {
  els.progressSection.classList.add("visible");
  const pct = total > 0 ? Math.min(100, (wordsTyped / total) * 100) : 0;
  els.progressFill.style.width = pct + "%";
  if (finished) {
    els.progressFill.classList.add("finished");
    els.progressLabel.classList.add("finished");
    els.progressLabel.textContent = `Finished · ${total} word${total !== 1 ? "s" : ""}`;
  } else {
    els.progressFill.classList.remove("finished");
    els.progressLabel.classList.remove("finished");
    els.progressLabel.textContent = `${wordsTyped} / ${total} word${total !== 1 ? "s" : ""}`;
  }
}

function resetProgress() {
  els.progressSection.classList.remove("visible");
  els.progressFill.style.width = "0%";
  els.progressFill.classList.remove("finished");
  els.progressLabel.classList.remove("finished");
  els.progressLabel.textContent = "";
}

function persistProgressState(totalWords, wordsTyped) {
  chrome.storage.local.set({ totalWords, wordsTyped }).catch(() => {});
}

function clearProgressState() {
  _totalWords = 0;
  _wordsTyped = 0;
  resetProgress();
  persistProgressState(0, 0);
}

// Prevent saveSettings() from writing during the startup restore pass
let isInitializing = true;

// ---------------------------------------------------------------------------
// Settings persistence — writes all user-controlled inputs to storage
// ---------------------------------------------------------------------------
function saveSettings() {
  if (isInitializing) return;
  chrome.storage.local.set({
    textInput: els.textInput.value,
    selectedSpeed,
    varSpeed: els.varSpeed.checked,
    naturalPauses: naturalPausesCheckbox.checked,
    pauseEvery: els.pauseEvery.value,
    pauseDuration: els.pauseDuration.value,
    punctPauses: els.punctPauses.checked,
    varyTimes: els.varyTimes.checked,
    wordDifficulty: els.wordDifficulty.checked,
    makeMistakes:  mistakesCheckbox.checked,
    mistakePause: els.mistakePause.value,
    mistakeRate: els.mistakeRate.value,
    paragraphPause: els.paragraphPause.checked,
    selfInterrupt:  els.selfInterrupt.checked,
    quickCorrections: els.quickCorrections.checked,
    startDelay: els.startDelay.value,
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

  els.varSpeed.checked       = preset.varSpeed;
  els.wordDifficulty.checked = preset.wordDifficulty;

  naturalPausesCheckbox.checked = preset.naturalPauses;
  els.pauseEvery.value     = preset.pauseEvery;
  els.pauseDuration.value  = preset.pauseDuration;
  els.punctPauses.checked  = preset.punctPauses;
  els.varyTimes.checked    = preset.varyTimes;
  els.paragraphPause.checked = preset.paragraphPause;
  applyNaturalPausesSection(preset.naturalPauses);

  mistakesCheckbox.checked = preset.makeMistakes;
  els.mistakePause.value = preset.mistakePause;
  els.mistakeRate.value  = preset.mistakeRate;
  els.selfInterrupt.checked   = preset.selfInterrupt;
  els.quickCorrections.checked = preset.quickCorrections;
  applyMistakesSection(preset.makeMistakes);

  _activePersonality = key;
  updatePersonalityCardsUI();
  saveSettings();

  _applyingPersonality = false;
}

document.querySelectorAll(".personality-card").forEach((card) => {
  card.addEventListener("click", () => applyPersonality(card.dataset.personality));
});

function setExpandableSection({ row, panel }, expanded) {
  row.classList.toggle("expanded", expanded);
  panel.classList.toggle("expanded", expanded);
}

function bindExpandableSection({ checkbox, row, panel }, onToggle) {
  row.addEventListener("click", (event) => {
    if (event.target !== checkbox) checkbox.checked = !checkbox.checked;
    onToggle();
  });
  checkbox.addEventListener("change", onToggle);
  return (expanded) => setExpandableSection({ row, panel }, expanded);
}

// Speed selector
speedButtons.forEach((btn) => {
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
const applyNaturalPausesSection = bindExpandableSection(
  {
    checkbox: naturalPausesCheckbox,
    row: naturalPausesRow,
    panel: naturalPausesCollapsible,
  },
  updateNaturalPausesPanel
);

function updateNaturalPausesPanel() {
  const on = naturalPausesCheckbox.checked;
  applyNaturalPausesSection(on);
  clearActivePersonality();
  saveSettings();
}

// Spelling mistakes accordion
const mistakesCheckbox   = document.getElementById("make-mistakes");
const mistakesRow        = document.getElementById("mistakes-row");
const mistakeCollapsible = document.getElementById("mistake-collapsible");
const applyMistakesSection = bindExpandableSection(
  {
    checkbox: mistakesCheckbox,
    row: mistakesRow,
    panel: mistakeCollapsible,
  },
  updateMistakePanel
);

function updateMistakePanel() {
  const on = mistakesCheckbox.checked;
  applyMistakesSection(on);
  clearActivePersonality();
  saveSettings();
}

// Wire up all other inputs so every change is immediately persisted.
// The main text box is debounced — pasting or typing a long essay would
// otherwise trigger a storage write on every single keystroke.
let _saveTextTimeout = null;
els.textInput.addEventListener("input", () => {
  if (isInitializing) return;
  clearTimeout(_saveTextTimeout);
  _saveTextTimeout = setTimeout(saveSettings, 500);
});
[els.pauseEvery, els.pauseDuration, els.mistakePause, els.mistakeRate].forEach((input) => {
  input.addEventListener("input", () => {
    if (isInitializing) return;
    clearActivePersonality();
    saveSettings();
  });
});
els.startDelay.addEventListener("input", () => {
  if (isInitializing) return;
  saveSettings();
});
[els.varSpeed, els.wordDifficulty, els.punctPauses, els.varyTimes,
 els.paragraphPause, els.selfInterrupt, els.quickCorrections].forEach((input) => {
  input.addEventListener("change", () => {
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

function applySessionControls(state) {
  if (state === "idle") {
    els.startBtn.textContent = "Type it";
    els.startBtn.classList.remove("pause-mode", "countdown-mode");
    els.startBtn.disabled = false;
    els.stopBtn.classList.remove("visible");
    return;
  }

  if (state === "countdown") {
    els.startBtn.textContent = String(parseInt(els.startDelay.value, 10) || 3);
    els.startBtn.classList.remove("pause-mode");
    els.startBtn.classList.add("countdown-mode");
    els.startBtn.disabled = true;
    els.stopBtn.classList.add("visible");
    return;
  }

  if (state === "typing") {
    els.startBtn.textContent = "Pause";
    els.startBtn.classList.remove("countdown-mode");
    els.startBtn.classList.add("pause-mode");
    els.startBtn.disabled = false;
    els.stopBtn.classList.add("visible");
    return;
  }

  els.startBtn.textContent = "Resume";
  els.startBtn.classList.remove("pause-mode", "countdown-mode");
  els.startBtn.disabled = false;
  els.stopBtn.classList.add("visible");
}

function setSessionState(state) {
  sessionState = state;
  applySessionControls(state);
  // Persist — treat "countdown" as "idle" so reopening the sidebar mid-countdown
  // doesn't leave it stuck in an unrecoverable state.
  chrome.storage.local.set({
    sessionState: state === "countdown" ? "idle" : state,
  }).catch(() => {});
}

// Returns a Promise that resolves false when the countdown finishes naturally,
// or true if the user pressed Stop while it was running.
function runCountdown(startCount) {
  return new Promise((resolve) => {
    let count = startCount;
    let timeoutId;

    _cancelCountdown = () => {
      clearTimeout(timeoutId);
      _cancelCountdown = null;
      resolve(true); // cancelled
    };

    const tick = () => {
      count--;
      if (count <= 0) {
        _cancelCountdown = null;
        resolve(false); // finished naturally
        return;
      }
      els.startBtn.textContent = String(count);
      timeoutId = setTimeout(tick, 1000);
    };

    timeoutId = setTimeout(tick, 1000);
  });
}

// Route a message to the frame that last had focus
async function sendToActiveFrame(tabId, msg) {
  const { frameId } = await chrome.runtime.sendMessage({ action: "get-focused-frame", tabId });
  const opts = (frameId != null) ? { frameId } : {};
  return chrome.tabs.sendMessage(tabId, msg, opts);
}

function getTypingRequest(text) {
  const behavior = normalizeTypingBehavior({
    naturalPauses: naturalPausesCheckbox.checked,
    pauseEvery: els.pauseEvery.value,
    pauseDuration: els.pauseDuration.value,
    varyTimes: els.varyTimes.checked,
    punctPauses: els.punctPauses.checked,
    varSpeed: els.varSpeed.checked,
    wordDifficulty: els.wordDifficulty.checked,
    makeMistakes: mistakesCheckbox.checked,
    mistakePause: els.mistakePause.value,
    mistakeRate: els.mistakeRate.value,
  });

  return {
    action: "type",
    text,
    delay: speedDelays[selectedSpeed],
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
    paragraphPause: els.paragraphPause.checked,
    wordHesitation: true,
    sentenceStart:  true,
    selfInterrupt:  els.selfInterrupt.checked,
    quickCorrections: els.quickCorrections.checked,
  };
}

els.startBtn.addEventListener("click", () => {
  if      (sessionState === "idle")   beginTyping();
  else if (sessionState === "typing") doPause();
  else if (sessionState === "paused") doResume();
});

async function beginTyping() {
  const text = els.textInput.value;
  if (!text.trim()) { setStatus("Enter some text first.", "error"); return; }
  const wordCount = countWords(text);

  _totalWords = wordCount;
  _wordsTyped = 0;
  resetProgress();

  setSessionState("countdown");
  setStatus("Starting…");

  const startDelay = parseInt(els.startDelay.value, 10) || 3;
  const cancelled = await runCountdown(startDelay);
  if (cancelled || sessionState === "idle") return; // Stop was pressed during countdown

  if (_totalWords > 0) updateProgress(0, _totalWords, false);
  setSessionState("typing");
  persistProgressState(_totalWords, 0);
  setStatus("Typing…");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Ensure content script is running in all frames. This is a no-op on pages
    // where it's already running (guard in content.js prevents double-execution),
    // and injects it on pages loaded before the extension was installed.
    // If injection fails (chrome:// pages, PDFs, etc.) we continue — the
    // background's frame-scan fallback will still find any focused element.
    chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["typing-options.js", "content.js"],
    }).catch(() => {});

    const result = await sendToActiveFrame(tab.id, getTypingRequest(text));

    // Only update UI if the session wasn't already cancelled by the stop button
    if (sessionState !== "idle") {
      setSessionState("idle");
      if (result?.success) {
        if (!result.stopped) {
          if (_totalWords > 0) updateProgress(_totalWords, _totalWords, true);
          setStatus("Done.", "success");
        } else {
          setStatus("Stopped.");
          clearProgressState();
        }
      } else if (result == null) {
        // Chrome resolves chrome.tabs.sendMessage with undefined when no frame
        // called sendResponse — meaning no frame had a focused typable element.
        setStatus("No field targeted. Click a text field on the page first.", "error");
        clearProgressState();
      } else {
        setStatus(result?.error || "Something went wrong.", "error");
        clearProgressState();
      }
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
      clearProgressState();
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

els.stopBtn.addEventListener("click", () => {
  if (sessionState === "countdown" && _cancelCountdown) {
    _cancelCountdown();
    setSessionState("idle");
    setStatus("Stopped.");
    clearProgressState();
    return;
  }
  setSessionState("idle");
  setStatus("Stopped.");
  clearProgressState();
  chrome.runtime.sendMessage({ action: "relay-to-frame", payload: { action: "stop" } }).catch(() => {});
});

// Listen for messages from content scripts and background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "typing-progress") {
    _wordsTyped = msg.wordsTyped;
    if (_totalWords > 0) {
      updateProgress(_wordsTyped, _totalWords, false);
      persistProgressState(_totalWords, _wordsTyped);
    }
  }

  if (msg.action === "targetUpdate") {
    els.targetValue.textContent = msg.description;
    els.targetBox.className = "target-box ready";
    // Persist so the target is shown correctly when sidebar is reopened
    chrome.storage.local.set({ targetDesc: msg.description, targetReady: true }).catch(() => {});
  }

  // Target element lost focus — auto-pause so characters aren't typed into nowhere
  if (msg.action === "auto-paused") {
    if (sessionState === "typing") {
      setSessionState("paused");
      setStatus("Paused — click Resume to continue.");
    }
  }

  // Typing finished naturally — update UI regardless of which sidebar instance
  // is open (handles the case where the sidebar was closed and reopened mid-session)
  if (msg.action === "typing-complete") {
    if (sessionState !== "idle") {
      setSessionState("idle");
      if (!msg.stopped && !msg.error) {
        if (_totalWords > 0) updateProgress(_totalWords, _totalWords, true);
        setStatus("Done.", "success");
        persistProgressState(_totalWords, _totalWords);
      } else {
        setStatus(
          msg.error ? msg.error : "Stopped.",
          msg.error ? "error" : ""
        );
        clearProgressState();
      }
    }
  }
});

function setStatus(msg, type = "") {
  els.status.textContent = msg;
  els.status.className = type;
  // Persist status alongside session state
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
    "paragraphPause", "selfInterrupt", "quickCorrections",
    "startDelay", "activeMode", "activePersonality",
    // Session state
    "sessionState", "statusMsg", "statusType",
    // Target field
    "targetDesc", "targetReady",
    // Progress
    "totalWords", "wordsTyped",
  ]).catch(() => ({}));

  // --- Restore settings ---
  if (saved.textInput !== undefined)
    els.textInput.value = saved.textInput;

  if (saved.selectedSpeed) {
    setActiveSpeed(saved.selectedSpeed);
  }

  if (saved.varSpeed !== undefined)
    els.varSpeed.checked = saved.varSpeed;
  if (saved.wordDifficulty !== undefined)
    els.wordDifficulty.checked = saved.wordDifficulty;

  if (saved.naturalPauses !== undefined) {
    naturalPausesCheckbox.checked = saved.naturalPauses;
    applyNaturalPausesSection(saved.naturalPauses);
  }

  if (saved.pauseEvery     !== undefined) els.pauseEvery.value = saved.pauseEvery;
  if (saved.pauseDuration  !== undefined) els.pauseDuration.value = saved.pauseDuration;
  if (saved.punctPauses    !== undefined) els.punctPauses.checked = saved.punctPauses;
  if (saved.varyTimes      !== undefined) els.varyTimes.checked = saved.varyTimes;

  if (saved.makeMistakes !== undefined) {
    mistakesCheckbox.checked = saved.makeMistakes;
    applyMistakesSection(saved.makeMistakes);
  }

  if (saved.mistakePause !== undefined) els.mistakePause.value = saved.mistakePause;
  if (saved.mistakeRate  !== undefined) els.mistakeRate.value = saved.mistakeRate;

  if (saved.paragraphPause !== undefined) els.paragraphPause.checked = saved.paragraphPause;
  if (saved.selfInterrupt  !== undefined) els.selfInterrupt.checked  = saved.selfInterrupt;
  if (saved.quickCorrections !== undefined) els.quickCorrections.checked = saved.quickCorrections;
  if (saved.startDelay !== undefined) els.startDelay.value = saved.startDelay;

  if (saved.activePersonality && PERSONALITIES[saved.activePersonality]) {
    _activePersonality = saved.activePersonality;
    updatePersonalityCardsUI();
  }
  setMode(saved.activeMode === "personalities" ? "personalities" : "custom");

  // --- Restore session state (UI only — the content script is already running) ---
  // Verify with the content script that typing is actually still active before
  // restoring a non-idle state. If the session finished while the sidebar was
  // closed, the stored state will be stale and we must reset to idle.
  if (saved.sessionState === "typing" || saved.sessionState === "paused") {
    const liveState = await chrome.runtime.sendMessage({ action: "query-typing-state" })
      .catch(() => ({ active: false }));

    if (liveState.active) {
      // Content script confirms typing is still running — restore the UI.
      const state = liveState.paused ? "paused" : saved.sessionState;
      sessionState = state;
      if (saved.totalWords) {
        _totalWords = saved.totalWords;
        _wordsTyped = saved.wordsTyped || 0;
        updateProgress(_wordsTyped, _totalWords, false);
      }
      applySessionControls(state);
    } else {
      // Typing already finished — clear the stale state so next reopen is clean.
      chrome.storage.local.set({ sessionState: "idle", statusMsg: "", statusType: "", totalWords: 0, wordsTyped: 0 }).catch(() => {});
      saved.statusMsg = ""; // suppress the stale "Typing…" message below
    }
  }

  if (saved.statusMsg) {
    els.status.textContent = saved.statusMsg;
    els.status.className = saved.statusType || "";
  }

  // --- Restore target field ---
  if (saved.targetDesc) {
    els.targetValue.textContent = saved.targetDesc;
    els.targetBox.className = saved.targetReady ? "target-box ready" : "target-box none";
  }

  // Inject content script into the active tab so it works on already-open tabs
  // (Chrome only auto-injects declarative content scripts into pages loaded
  // after the extension is installed — existing open tabs need this).
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id) {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id, allFrames: true },
        files: ["typing-options.js", "content.js"],
      });
    }
  } catch (_) {
    // Silently ignore: chrome:// pages, PDFs, etc. disallow injection
  }

  // Unlock saving — from here on every user interaction is immediately persisted
  isInitializing = false;
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('no-transition')));
})();
