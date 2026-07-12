// Shared constants/helpers used by app.js to build the payload sent to the
// Rust `start_typing` command. The actual timing/mistake math now lives in
// `src-tauri/src/typing_engine.rs` since typing happens in Rust.
(() => {
  const speedDelays = Object.freeze({
    slow: 120,
    medium: 45,
    fast: 12,
  });

  function parseIntegerWithinRange(value, fallback, { min = 1, max = Number.POSITIVE_INFINITY } = {}) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  function normalizeTypingBehavior(raw = {}) {
    const naturalPauses = raw.naturalPauses ?? false;
    const pauseEvery = parseIntegerWithinRange(raw.pauseEvery, 7);
    const pauseDuration = parseIntegerWithinRange(raw.pauseDuration, 10);
    const varyTimes = raw.varyTimes ?? false;
    const punctPauses = raw.punctPauses ?? false;
    const varSpeed = raw.varSpeed ?? false;
    const wordDifficulty = raw.wordDifficulty ?? false;
    const mistakes = raw.makeMistakes ?? raw.mistakes ?? false;
    const mistakePause = parseIntegerWithinRange(raw.mistakePause, 5);
    const mistakeRate = parseIntegerWithinRange(raw.mistakeRate, 10, { min: 1, max: 50 });

    return {
      naturalPauses,
      pauseEvery,
      pauseDuration,
      varyTimes,
      punctPauses,
      varSpeed,
      wordDifficulty,
      mistakes,
      mistakePause,
      mistakeRate,
      pauseEveryMs: pauseEvery * 1000,
      pauseDurationMs: pauseDuration * 1000,
      mistakePauseMs: mistakePause * 1000,
      mistakeRateFraction: mistakeRate / 100,
    };
  }

  globalThis.TextToWriteConfig = Object.freeze({
    speedDelays,
    normalizeTypingBehavior,
  });
})();
