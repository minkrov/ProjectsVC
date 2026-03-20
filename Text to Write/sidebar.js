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

    const naturalPauses = naturalPausesCheckbox.checked;
    const pauseEvery = Math.max(1, parseInt(document.getElementById("pause-every").value) || 7);
    const pauseDuration = Math.max(1, parseInt(document.getElementById("pause-duration").value) || 10);
    const varyTimes = document.getElementById("vary-times").checked;

    const result = await browser.tabs.sendMessage(tab.id, {
      action: "type",
      text,
      delay,
      naturalPauses,
      pauseEvery: pauseEvery * 1000,
      pauseDuration: pauseDuration * 1000,
      varyTimes,
    });

    if (result && result.success) {
      setStatus(result.stopped ? "Stopped." : "Done.", result.stopped ? "" : "success");
    } else {
      setStatus(result?.error || "No focused field found.", "error");
    }
  } catch (err) {
    // No frame responded — nothing was clicked on the page
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
    browser.tabs.sendMessage(tab.id, { action: "stop" }).catch(() => {});
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
