const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { speedDelays, normalizeTypingBehavior } = globalThis.TextToWriteConfig;

let selectedSpeed = "medium";

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
// Settings persistence — writes all user-controlled inputs + session/target/
// progress state to the Rust-backed store (mirrors the extension's
// browser.storage.local schema).
// ---------------------------------------------------------------------------
let _lastSessionState = "idle";
let _lastStatusMsg = "";
let _lastStatusType = "";
let _lastTargetDesc = "";
let _lastTargetReady = false;

function buildSettings() {
  return {
    textInput:      document.getElementById("text-input").value,
    selectedSpeed,
    varSpeed:       document.getElementById("var-speed").checked,
    naturalPauses:  naturalPausesCheckbox.checked,
    pauseEvery:     parseInt(document.getElementById("pause-every").value, 10) || 7,
    pauseDuration:  parseInt(document.getElementById("pause-duration").value, 10) || 10,
    punctPauses:    document.getElementById("punct-pauses").checked,
    varyTimes:      document.getElementById("vary-times").checked,
    wordDifficulty: document.getElementById("word-difficulty").checked,
    makeMistakes:   mistakesCheckbox.checked,
    mistakePause:   parseInt(document.getElementById("mistake-pause").value, 10) || 5,
    mistakeRate:    parseInt(document.getElementById("mistake-rate").value, 10) || 10,
    paragraphPause: document.getElementById("paragraph-pause").checked,
    selfInterrupt:  document.getElementById("self-interrupt").checked,
    quickCorrections: document.getElementById("quick-corrections").checked,
    startDelay:     parseInt(document.getElementById("start-delay").value, 10) || 3,
    activeMode:     _activeMode,
    activePersonality: _activePersonality || "",
    sessionState:   _lastSessionState,
    statusMsg:      _lastStatusMsg,
    statusType:     _lastStatusType,
    targetDesc:     _lastTargetDesc,
    targetReady:    _lastTargetReady,
    totalWords:     _totalWords,
    wordsTyped:     _wordsTyped,
  };
}

function saveSettings() {
  if (isInitializing) return;
  invoke("save_settings", { settings: buildSettings() }).catch(() => {});
}

// Speed selector
document.querySelectorAll(".speed-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".speed-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedSpeed = btn.dataset.speed;
    clearActivePersonality();
    saveSettings();
  });
});

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

  selectedSpeed = preset.selectedSpeed;
  document.querySelectorAll(".speed-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.speed === selectedSpeed);
  });

  document.getElementById("var-speed").checked       = preset.varSpeed;
  document.getElementById("word-difficulty").checked = preset.wordDifficulty;

  naturalPausesCheckbox.checked = preset.naturalPauses;
  document.getElementById("pause-every").value     = preset.pauseEvery;
  document.getElementById("pause-duration").value  = preset.pauseDuration;
  document.getElementById("punct-pauses").checked  = preset.punctPauses;
  document.getElementById("vary-times").checked    = preset.varyTimes;
  document.getElementById("paragraph-pause").checked = preset.paragraphPause;
  naturalPausesRow.classList.toggle("expanded", preset.naturalPauses);
  naturalPausesCollapsible.classList.toggle("expanded", preset.naturalPauses);

  mistakesCheckbox.checked = preset.makeMistakes;
  document.getElementById("mistake-pause").value = preset.mistakePause;
  document.getElementById("mistake-rate").value  = preset.mistakeRate;
  document.getElementById("self-interrupt").checked   = preset.selfInterrupt;
  document.getElementById("quick-corrections").checked = preset.quickCorrections;
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
document.getElementById("start-delay").addEventListener("input", () => {
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

function setSessionState(state) {
  sessionState = state;
  if (state === "idle") {
    startBtn.textContent = "Type it";
    startBtn.classList.remove("pause-mode", "countdown-mode");
    startBtn.disabled = false;
    stopBtn.classList.remove("visible");
  } else if (state === "countdown") {
    startBtn.textContent = String(parseInt(document.getElementById("start-delay").value, 10) || 3);
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
  // Persist — treat "countdown" as "idle" so reopening the window mid-countdown
  // doesn't leave it stuck in an unrecoverable state.
  _lastSessionState = state === "countdown" ? "idle" : state;
  saveSettings();
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
      startBtn.textContent = String(count);
      timeoutId = setTimeout(tick, 1000);
    };

    timeoutId = setTimeout(tick, 1000);
  });
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

  const startDelay = parseInt(document.getElementById("start-delay").value, 10) || 3;
  const cancelled = await runCountdown(startDelay);
  if (cancelled || sessionState === "idle") return; // Stop was pressed during countdown

  if (_totalWords > 0) updateProgress(0, _totalWords, false);
  setSessionState("typing");
  saveSettings();
  setStatus("Typing…");

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

  const delay = speedDelays[selectedSpeed];

  try {
    await invoke("start_typing", {
      text,
      delay,
      behavior: {
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
        selfInterrupt: document.getElementById("self-interrupt").checked,
        quickCorrections: document.getElementById("quick-corrections").checked,
      },
    });
  } catch (err) {
    if (sessionState !== "idle") {
      setSessionState("idle");
      setStatus(typeof err === "string" ? err : "Could not start typing.", "error");
    }
  }
}

async function doPause() {
  setSessionState("paused");
  setStatus("Paused.");
  invoke("pause_typing").catch(() => {});
}

async function doResume() {
  setSessionState("typing");
  setStatus("Typing…");
  invoke("resume_typing", { delay: speedDelays[selectedSpeed] }).catch(() => {});
}

stopBtn.addEventListener("click", () => {
  if (sessionState === "countdown" && _cancelCountdown) {
    _cancelCountdown();
    setSessionState("idle");
    setStatus("Stopped.");
    resetProgress();
    return;
  }
  setSessionState("idle");
  setStatus("Stopped.");
  resetProgress();
  invoke("stop_typing").catch(() => {});
});

// ---------------------------------------------------------------------------
// Listen for events from the Rust typing engine
// ---------------------------------------------------------------------------
listen("typing-progress", (event) => {
  _wordsTyped = event.payload.wordsTyped;
  if (_totalWords > 0) {
    updateProgress(_wordsTyped, _totalWords, false);
    saveSettings();
  }
});

listen("target-update", (event) => {
  _lastTargetDesc = event.payload.description;
  _lastTargetReady = event.payload.ready;
  document.getElementById("target-value").textContent = _lastTargetDesc;
  document.getElementById("target-box").className =
    _lastTargetReady ? "target-box ready" : "target-box none";
  saveSettings();
});

// Target element lost focus — auto-pause so characters aren't typed into nowhere
listen("auto-paused", () => {
  if (sessionState === "typing") {
    setSessionState("paused");
    setStatus("Paused — click Resume to continue.");
  }
});

// Typing finished naturally
listen("typing-complete", (event) => {
  const msg = event.payload;
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
});

function setStatus(msg, type = "") {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = type;
  _lastStatusMsg = msg;
  _lastStatusType = type;
  saveSettings();
}

// ---------------------------------------------------------------------------
// Startup: restore all state from storage
// ---------------------------------------------------------------------------
(async function init() {
  document.body.classList.add('no-transition');
  const saved = await invoke("get_settings").catch(() => null) || {};

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
  if (saved.quickCorrections !== undefined) document.getElementById("quick-corrections").checked = saved.quickCorrections;
  if (saved.startDelay !== undefined) document.getElementById("start-delay").value = saved.startDelay;

  if (saved.activePersonality && PERSONALITIES[saved.activePersonality]) {
    _activePersonality = saved.activePersonality;
    updatePersonalityCardsUI();
  }
  setMode(saved.activeMode === "personalities" ? "personalities" : "custom");

  _lastTargetDesc  = saved.targetDesc || "";
  _lastTargetReady = !!saved.targetReady;
  _lastStatusMsg   = saved.statusMsg || "";
  _lastStatusType  = saved.statusType || "";

  // --- Restore session state (UI only — the Rust engine is already running) ---
  // Verify that typing is actually still active before restoring a non-idle
  // state. If the session finished while the window was closed, the stored
  // state will be stale and we must reset to idle.
  if (saved.sessionState === "typing" || saved.sessionState === "paused") {
    const liveState = await invoke("query_typing_state").catch(() => ({ active: false, paused: false }));

    if (liveState.active) {
      const state = liveState.paused ? "paused" : saved.sessionState;
      sessionState = state;
      _lastSessionState = state;
      if (saved.totalWords) {
        _totalWords = saved.totalWords;
        _wordsTyped = saved.wordsTyped || 0;
        if (_totalWords > 0) updateProgress(_wordsTyped, _totalWords, false);
      }
      if (state === "typing") {
        startBtn.textContent = "Pause";
        startBtn.classList.add("pause-mode");
        stopBtn.classList.add("visible");
      } else {
        startBtn.textContent = "Resume";
        startBtn.classList.remove("pause-mode");
        stopBtn.classList.add("visible");
      }
    } else {
      // Typing already finished — clear the stale state so next reopen is clean.
      _lastSessionState = "idle";
      _lastStatusMsg = "";
      _lastStatusType = "";
      _totalWords = 0;
      _wordsTyped = 0;
      saved.statusMsg = ""; // suppress the stale "Typing…" message below
    }
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

  // Unlock saving — from here on every user interaction is immediately persisted
  isInitializing = false;
  // Re-enable CSS transitions now that all state has been silently restored
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('no-transition')));
})();
