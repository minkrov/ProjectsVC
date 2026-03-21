const speedDelays = { slow: 120, medium: 45, fast: 12 };
let selectedSpeed = "medium";

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

// Wire up all other inputs so every change is immediately persisted
document.getElementById("text-input").addEventListener("input", saveSettings);
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

const startBtn = document.getElementById("start-btn");
const stopBtn  = document.getElementById("stop-btn");

function setSessionState(state) {
  sessionState = state;
  if (state === "idle") {
    startBtn.textContent = "Type it";
    startBtn.classList.remove("pause-mode");
    startBtn.disabled = false;
    stopBtn.classList.remove("visible");
  } else if (state === "typing") {
    startBtn.textContent = "Pause";
    startBtn.classList.add("pause-mode");
    startBtn.disabled = false;
    stopBtn.classList.add("visible");
  } else if (state === "paused") {
    startBtn.textContent = "Resume";
    startBtn.classList.remove("pause-mode"); // back to green
    startBtn.disabled = false;
    stopBtn.classList.add("visible");
  }
  // Persist so the next sidebar open sees the correct state
  browser.storage.local.set({ sessionState: state }).catch(() => {});
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
  if (!text) { setStatus("Enter some text first.", "error"); return; }

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
        setStatus(result.stopped ? "Stopped." : "Done.", result.stopped ? "" : "success");
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
  setSessionState("idle");
  setStatus("Stopped.");
  browser.runtime.sendMessage({ action: "relay-to-frame", payload: { action: "stop" } }).catch(() => {});
});

// Listen for messages from content scripts and background
browser.runtime.onMessage.addListener((msg) => {
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
      setStatus(
        msg.error   ? msg.error :
        msg.stopped ? "Stopped." : "Done.",
        msg.error   ? "error" :
        msg.stopped ? "" : "success"
      );
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
  if (saved.sessionState === "typing") {
    sessionState = "typing";
    startBtn.textContent = "Pause";
    startBtn.classList.add("pause-mode");
    stopBtn.classList.add("visible");
  } else if (saved.sessionState === "paused") {
    sessionState = "paused";
    startBtn.textContent = "Resume";
    startBtn.classList.remove("pause-mode");
    stopBtn.classList.add("visible");
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
