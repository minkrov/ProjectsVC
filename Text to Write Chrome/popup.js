const { speedDelays, behaviorStorageKeys, normalizeTypingBehavior } = globalThis.TextToWriteConfig;

let selectedSpeed = "medium";
const speedButtons = [...document.querySelectorAll(".speed-btn")];
const els = {
  textInput: document.getElementById("text-input"),
  startBtn: document.getElementById("start-btn"),
  stopBtn: document.getElementById("stop-btn"),
  status: document.getElementById("status"),
};

function setActiveSpeed(speed) {
  selectedSpeed = speed;
  speedButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.speed === speed);
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Speed selector
speedButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setActiveSpeed(btn.dataset.speed);
  });
});

els.startBtn.addEventListener("click", async () => {
  const text = els.textInput.value;

  if (!text) {
    setStatus("Enter some text first.", "error");
    return;
  }

  els.startBtn.disabled = true;
  els.stopBtn.classList.add("visible");
  setStatus("Typing…");

  try {
    const tab = await getActiveTab();

    // Read saved behavior settings from storage (shared with sidebar)
    const saved = await chrome.storage.local.get(behaviorStorageKeys).catch(() => ({}));
    const behavior = normalizeTypingBehavior(saved);

    const result = await chrome.tabs.sendMessage(tab.id, {
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
    });

    if (result && result.success) {
      setStatus(result.stopped ? "Stopped." : "Done.", result.stopped ? "" : "success");
    } else {
      setStatus(result?.error || "No focused field found.", "error");
    }
  } catch (err) {
    setStatus("Could not reach the page. Try reloading it.", "error");
  }

  els.startBtn.disabled = false;
  els.stopBtn.classList.remove("visible");
});

els.stopBtn.addEventListener("click", async () => {
  try {
    const tab = await getActiveTab();
    await chrome.tabs.sendMessage(tab.id, { action: "stop" });
  } catch (_) {}
  els.stopBtn.classList.remove("visible");
  els.startBtn.disabled = false;
  setStatus("Stopped.");
});

function setStatus(msg, type = "") {
  els.status.textContent = msg;
  els.status.className = type;
}
