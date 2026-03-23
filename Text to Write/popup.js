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

    // Read saved behavior settings from storage (shared with sidebar)
    const saved = await browser.storage.local.get([
      "naturalPauses", "pauseEvery", "pauseDuration", "varyTimes",
      "punctPauses", "varSpeed", "makeMistakes", "mistakePause", "mistakeRate",
    ]).catch(() => ({}));

    const naturalPauses = saved.naturalPauses ?? false;
    const pauseEvery    = Math.max(1, parseInt(saved.pauseEvery)    || 7);
    const pauseDuration = Math.max(1, parseInt(saved.pauseDuration) || 10);
    const varyTimes     = saved.varyTimes    ?? false;
    const punctPauses   = saved.punctPauses  ?? false;
    const varSpeed      = saved.varSpeed     ?? false;
    const mistakes      = saved.makeMistakes ?? false;
    const mistakePause  = Math.max(1, parseInt(saved.mistakePause) || 5);
    const mistakeRate   = Math.max(1, Math.min(50, parseInt(saved.mistakeRate) || 10));

    const result = await browser.tabs.sendMessage(tab.id, {
      action: "type",
      text,
      delay,
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

    if (result && result.success) {
      setStatus(result.stopped ? "Stopped." : "Done.", result.stopped ? "" : "success");
    } else {
      setStatus(result?.error || "No focused field found.", "error");
    }
  } catch (err) {
    setStatus("Could not reach the page. Try reloading it.", "error");
  }

  startBtn.disabled = false;
  stopBtn.classList.remove("visible");
});

stopBtn.addEventListener("click", async () => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    await browser.tabs.sendMessage(tab.id, { action: "stop" });
  } catch (_) {}
  stopBtn.classList.remove("visible");
  startBtn.disabled = false;
  setStatus("Stopped.");
});

function setStatus(msg, type = "") {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = type;
}
