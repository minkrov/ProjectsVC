const speedDelays = { slow: 120, medium: 45, fast: 12 };
let selectedSpeed = "medium";

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
  browser.storage.local.set({
    textInput:     document.getElementById("text-input").value,
    selectedSpeed,
    varSpeed:      document.getElementById("var-speed").checked,
    naturalPauses: naturalPausesCheckbox.checked,
    pauseEvery:    document.getElementById("pause-every").value,
    pauseDuration: document.getElementById("pause-duration").value,
    punctPauses:   document.getElementById("punct-pauses").checked,
    varyTimes:     document.getElementById("vary-times").checked,
    makeMistakes:  mistakesCheckbox.checked,
    mistakePause:  document.getElementById("mistake-pause").value,
    mistakeRate:   document.getElementById("mistake-rate").value,
  }).catch(() => {});
}

// Speed selector
document.querySelectorAll(".speed-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".speed-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedSpeed = btn.dataset.speed;
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
  document.getElementById(id).addEventListener("input", saveSettings);
});
["var-speed", "punct-pauses", "vary-times"].forEach((id) => {
  document.getElementById(id).addEventListener("change", saveSettings);
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
    startBtn.textContent = "3";
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
  // Persist — treat "countdown" as "idle" so reopening the sidebar mid-countdown
  // doesn't leave it stuck in an unrecoverable state.
  browser.storage.local.set({
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
      startBtn.textContent = String(count);
      timeoutId = setTimeout(tick, 1000);
    };

    timeoutId = setTimeout(tick, 1000);
  });
}

// Route a message to the frame that last had focus
async function sendToActiveFrame(tabId, msg) {
  const { frameId } = await browser.runtime.sendMessage({ action: "get-focused-frame", tabId });
  const opts = (frameId != null) ? { frameId } : {};
  return browser.tabs.sendMessage(tabId, msg, opts);
}

startBtn.addEventListener("click", () => {
  if      (sessionState === "idle")   beginTyping();
  else if (sessionState === "typing") doPause();
  else if (sessionState === "paused") doResume();
});

async function beginTyping() {
  const text = document.getElementById("text-input").value;
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
  setStatus("Typing…");

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

    const naturalPauses = naturalPausesCheckbox.checked;
    const pauseEvery    = Math.max(1, parseInt(document.getElementById("pause-every").value)    || 7);
    const pauseDuration = Math.max(1, parseInt(document.getElementById("pause-duration").value) || 10);
    const varyTimes     = document.getElementById("vary-times").checked;
    const punctPauses   = document.getElementById("punct-pauses").checked;
    const varSpeed      = document.getElementById("var-speed").checked;
    const mistakes      = mistakesCheckbox.checked;
    const mistakePause  = Math.max(1, parseInt(document.getElementById("mistake-pause").value)  || 5);
    const mistakeRate   = Math.max(1, Math.min(50, parseInt(document.getElementById("mistake-rate").value) || 10));

    const result = await sendToActiveFrame(tab.id, {
      action: "type",
      text,
      delay:         speedDelays[selectedSpeed],
      naturalPauses,
      pauseEvery:    pauseEvery * 1000,
      pauseDuration: pauseDuration * 1000,
      varyTimes,
      punctPauses,
      varSpeed,
      mistakes,
      mistakePause:  mistakePause * 1000,
      mistakeRate:   mistakeRate / 100,
    });

    // Only update UI if the session wasn't already cancelled by the stop button
    if (sessionState !== "idle") {
      setSessionState("idle");
      if (result?.success) {
        if (!result.stopped) {
          updateProgress(_totalWords, _totalWords, true);
          setStatus("Done.", "success");
        } else {
          setStatus("Stopped.");
        }
      } else {
        setStatus(result?.error || "Something went wrong.", "error");
      }
    }
  } catch (err) {
    if (sessionState !== "idle") {
      setSessionState("idle");
      if (err?.message?.includes("no listener") || err?.message?.includes("receiving end")) {
        setStatus("No field targeted. Click a field on the page first.", "error");
      } else {
        setStatus("Could not reach the page. Try reloading it.", "error");
      }
    }
  }
}

async function doPause() {
  setSessionState("paused");
  setStatus("Paused.");
  browser.runtime.sendMessage({ action: "relay-to-frame", payload: { action: "pause" } }).catch(() => {});
}

async function doResume() {
  setSessionState("typing");
  setStatus("Typing…");
  browser.runtime.sendMessage({ action: "relay-to-frame", payload: { action: "resume" } }).catch(() => {});
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
  browser.runtime.sendMessage({ action: "relay-to-frame", payload: { action: "stop" } }).catch(() => {});
});

// Listen for messages from content scripts and background
browser.runtime.onMessage.addListener((msg) => {
  if (msg.action === "typing-progress") {
    _wordsTyped = msg.wordsTyped;
    updateProgress(_wordsTyped, _totalWords, false);
  }

  if (msg.action === "targetUpdate") {
    document.getElementById("target-value").textContent = msg.description;
    document.getElementById("target-box").className = "target-box ready";
    // Persist so the target is shown correctly when sidebar is reopened
    browser.storage.local.set({ targetDesc: msg.description, targetReady: true }).catch(() => {});
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
  // Persist status alongside session state
  browser.storage.local.set({ statusMsg: msg, statusType: type }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Startup: restore all state from storage
// ---------------------------------------------------------------------------
(async function init() {
  const saved = await browser.storage.local.get([
    // Settings
    "textInput", "selectedSpeed", "varSpeed",
    "naturalPauses", "pauseEvery", "pauseDuration", "punctPauses", "varyTimes",
    "makeMistakes", "mistakePause", "mistakeRate",
    // Session state
    "sessionState", "statusMsg", "statusType",
    // Target field
    "targetDesc", "targetReady",
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

  // --- Restore session state (UI only — the content script is already running) ---
  // Verify with the content script that typing is actually still active before
  // restoring a non-idle state. If the session finished while the sidebar was
  // closed, the stored state will be stale and we must reset to idle.
  if (saved.sessionState === "typing" || saved.sessionState === "paused") {
    const liveState = await browser.runtime.sendMessage({ action: "query-typing-state" })
      .catch(() => ({ active: false }));

    if (liveState.active) {
      // Content script confirms typing is still running — restore the UI.
      const state = liveState.paused ? "paused" : saved.sessionState;
      sessionState = state;
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
      browser.storage.local.set({ sessionState: "idle", statusMsg: "", statusType: "" }).catch(() => {});
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
})();
