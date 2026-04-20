const { speedDelays, normalizeTypingBehavior } = globalThis.TextToWriteConfig;
let selectedSpeed = "medium";
const speedButtons = [...document.querySelectorAll(".speed-btn")];

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
  }).catch(() => {});
}

function setActiveSpeed(speed) {
  selectedSpeed = speed;
  speedButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.speed === speed);
  });
}

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
  input.addEventListener("input", saveSettings);
});
[els.varSpeed, els.wordDifficulty, els.punctPauses, els.varyTimes].forEach((input) => {
  input.addEventListener("change", saveSettings);
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
    els.startBtn.textContent = "3";
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
function runCountdown() {
  return new Promise((resolve) => {
    let count = 3;
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
  };
}

els.startBtn.addEventListener("click", () => {
  if      (sessionState === "idle")   beginTyping();
  else if (sessionState === "typing") doPause();
  else if (sessionState === "paused") doResume();
});

async function beginTyping() {
  const text = els.textInput.value;
  const wordCount = countWords(text);
  if (!text || wordCount === 0) { setStatus("Enter some text first.", "error"); return; }

  _totalWords = wordCount;
  _wordsTyped = 0;
  resetProgress();

  setSessionState("countdown");
  setStatus("Starting…");

  const cancelled = await runCountdown();
  if (cancelled || sessionState === "idle") return; // Stop was pressed during countdown

  updateProgress(0, _totalWords, false);
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
          updateProgress(_totalWords, _totalWords, true);
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
  chrome.runtime.sendMessage({ action: "relay-to-frame", payload: { action: "resume" } }).catch(() => {});
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
    updateProgress(_wordsTyped, _totalWords, false);
    persistProgressState(_totalWords, _wordsTyped);
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
        updateProgress(_totalWords, _totalWords, true);
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
  const saved = await chrome.storage.local.get([
    // Settings
    "textInput", "selectedSpeed", "varSpeed", "wordDifficulty",
    "naturalPauses", "pauseEvery", "pauseDuration", "punctPauses", "varyTimes",
    "makeMistakes", "mistakePause", "mistakeRate",
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
})();
