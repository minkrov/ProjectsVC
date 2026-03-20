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

    const result = await browser.tabs.sendMessage(tab.id, {
      action: "type",
      text,
      delay,
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
