const speedDelays = {
  slow: 120,
  medium: 45,
  fast: 12,
};

let selectedSpeed = "medium";

// Speed selector
document.querySelectorAll(".speed-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".speed-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedSpeed = btn.dataset.speed;
  });
});

// Toggle pause fields enabled/disabled with the checkbox
const naturalPausesCheckbox = document.getElementById("natural-pauses");
const pauseFields = document.getElementById("pause-fields");

naturalPausesCheckbox.addEventListener("change", () => {
  pauseFields.classList.toggle("disabled", !naturalPausesCheckbox.checked);
});

const mistakesCheckbox   = document.getElementById("make-mistakes");
const mistakesRow        = document.getElementById("mistakes-row");
const mistakeCollapsible = document.getElementById("mistake-collapsible");

// Clicking anywhere on the row toggles the checkbox
mistakesRow.addEventListener("click", (e) => {
  // Let the checkbox handle its own click normally; intercept clicks on the row itself
  if (e.target !== mistakesCheckbox) {
    mistakesCheckbox.checked = !mistakesCheckbox.checked;
  }
  updateMistakePanel();
});

// Also handle direct checkbox changes (keyboard, etc.)
mistakesCheckbox.addEventListener("change", updateMistakePanel);

function updateMistakePanel() {
  const on = mistakesCheckbox.checked;
  mistakesRow.classList.toggle("expanded", on);
  mistakeCollapsible.classList.toggle("expanded", on);
}

const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");

startBtn.addEventListener("click", async () => {
  const text = document.getElementById("text-input").value;

  if (!text) {
    setStatus("Enter some text first.", "error");
    return;
  }

  startBtn.disabled = true;
  stopBtn.classList.add("visible");
  setStatus("Typing…");

  const delay = speedDelays[selectedSpeed];

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

    // Ask the background which frame was most recently focused.
    // This prevents the double-typing bug where multiple iframes each
    // have their own content script instance with lastFocusedEl set.
    const { frameId } = await browser.runtime.sendMessage({
      action: "get-focused-frame",
      tabId: tab.id,
    });

    const naturalPauses = naturalPausesCheckbox.checked;
    const pauseEvery = Math.max(1, parseInt(document.getElementById("pause-every").value) || 7);
    const pauseDuration = Math.max(1, parseInt(document.getElementById("pause-duration").value) || 10);
    const varyTimes = document.getElementById("vary-times").checked;
    const mistakes = mistakesCheckbox.checked;
    const mistakePause = Math.max(1, parseInt(document.getElementById("mistake-pause").value) || 5);
    const mistakeRate = Math.max(1, Math.min(50, parseInt(document.getElementById("mistake-rate").value) || 10));

    const msg = {
      action: "type",
      text,
      delay,
      naturalPauses,
      pauseEvery:    pauseEvery * 1000,
      pauseDuration: pauseDuration * 1000,
      varyTimes,
      mistakes,
      mistakePause:  mistakePause * 1000,
      mistakeRate:   mistakeRate / 100,
    };

    // Send to the exact frame that last had focus, or broadcast if unknown
    const sendOpts = (frameId != null) ? { frameId } : {};
    const result = await browser.tabs.sendMessage(tab.id, msg, sendOpts);

    if (result && result.success) {
      setStatus(result.stopped ? "Stopped." : "Done.", result.stopped ? "" : "success");
    } else {
      setStatus(result?.error || "No focused field found.", "error");
    }
  } catch (err) {
    if (err?.message?.includes("no listener") || err?.message?.includes("receiving end")) {
      setStatus("No field targeted. Click somewhere on the page first.", "error");
    } else {
      setStatus("Could not reach the page. Try reloading it.", "error");
    }
  }

  startBtn.disabled = false;
  stopBtn.classList.remove("visible");
});

stopBtn.addEventListener("click", async () => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const { frameId } = await browser.runtime.sendMessage({ action: "get-focused-frame", tabId: tab.id });
    const sendOpts = (frameId != null) ? { frameId } : {};
    browser.tabs.sendMessage(tab.id, { action: "stop" }, sendOpts).catch(() => {});
  } catch (_) {}
  stopBtn.classList.remove("visible");
  startBtn.disabled = false;
  setStatus("Stopped.");
});

// Listen for target updates from the content script
browser.runtime.onMessage.addListener((msg) => {
  if (msg.action === "targetUpdate") {
    const box = document.getElementById("target-box");
    const val = document.getElementById("target-value");
    val.textContent = msg.description;
    box.className = "target-box ready";
  }
});

function setStatus(msg, type = "") {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = type;
}
