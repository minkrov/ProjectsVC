(() => {
  const speedDelays = Object.freeze({
    slow: 120,
    medium: 45,
    fast: 12,
  });

  const behaviorStorageKeys = Object.freeze([
    "naturalPauses",
    "pauseEvery",
    "pauseDuration",
    "varyTimes",
    "punctPauses",
    "varSpeed",
    "wordDifficulty",
    "makeMistakes",
    "mistakePause",
    "mistakeRate",
  ]);

  const easyWords = new Set([
    "a", "an", "and", "as", "at", "be", "but", "by", "do", "for", "go",
    "he", "her", "his", "i", "if", "in", "is", "it", "me", "my", "no",
    "not", "of", "on", "or", "so", "the", "to", "up", "us", "we", "you",
  ]);

  const qwertyNeighbors = Object.freeze({
    a: "sqwz", b: "vghn", c: "xdfv", d: "serfcx", e: "wsdr", f: "drtgvc",
    g: "ftyhbv", h: "gyujnb", i: "ujko", j: "huikmnb", k: "jiolm", l: "kop",
    m: "njk", n: "bhjm", o: "iklp", p: "ol", q: "wa", r: "edft",
    s: "awedxz", t: "rfgy", u: "yhji", v: "cfgb", w: "qase", x: "zsdc",
    y: "tghu", z: "asx",
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

  function wordDifficultyMultiplier(token) {
    const word = cleanWord(token);
    if (!word) return 1;
    if (word.length <= 3 || easyWords.has(word)) return 0.96;

    let score = 0;
    if (word.length >= 6) score += Math.min(0.42, (word.length - 5) * 0.05);
    if (/[jqxz]/.test(word)) score += 0.1;
    if (/[kvwy]/.test(word)) score += 0.05;
    if (/[bcdfghjklmnpqrstvwxyz]{3,}/.test(word)) score += 0.08;
    if (word.length >= 5 && isVowelScarce(word)) score += 0.08;
    if (/['-]/.test(token)) score += 0.04;

    return Math.min(1.6, 1 + score);
  }

  function adjustedMistakeRate(baseRate = 0, token, baseDelay) {
    const word = cleanWord(token);
    if (!word) return 0;

    let multiplier = 1;
    const difficulty = wordDifficultyMultiplier(token);
    if (word.length <= 4 || easyWords.has(word)) multiplier -= 0.25;
    if (word.length >= 7) multiplier += 0.2;
    if (word.length >= 11) multiplier += 0.2;
    multiplier += Math.max(0, difficulty - 1) * 1.4;

    if (baseDelay <= speedDelays.fast) multiplier += 0.25;
    else if (baseDelay >= speedDelays.slow) multiplier -= 0.15;

    const min = baseRate * 0.45;
    const max = Math.min(0.75, baseRate * 2.4);
    return clamp(baseRate * multiplier, min, max);
  }

  function generateMistake(word) {
    const roll = Math.random();
    const typo =
      roll < 0.45 ? adjacentKeyMistake(word) :
      roll < 0.7 ? missingLetterMistake(word) :
      roll < 0.9 ? transposeMistake(word) :
      doubleLetterMistake(word);
    return typo && typo !== word ? typo : adjacentKeyMistake(word) || doubleLetterMistake(word);
  }

  function adjacentKeyMistake(word) {
    const candidates = letterIndexes(word).filter((index) => qwertyNeighbors[word[index].toLowerCase()]);
    if (candidates.length === 0) return "";
    const pos = candidates[randomInt(0, candidates.length - 1)];
    const key = word[pos].toLowerCase();
    const neighbors = qwertyNeighbors[key];
    const wrong = neighbors[randomInt(0, neighbors.length - 1)];
    const replacement = /[A-Z]/.test(word[pos]) ? wrong.toUpperCase() : wrong;
    return word.slice(0, pos) + replacement + word.slice(pos + 1);
  }

  function missingLetterMistake(word) {
    const candidates = letterIndexes(word).filter((index) => index > 0 && index < word.length - 1);
    if (word.length < 4 || candidates.length === 0) return "";
    const pos = candidates[randomInt(0, candidates.length - 1)];
    return word.slice(0, pos) + word.slice(pos + 1);
  }

  function transposeMistake(word) {
    const candidates = [];
    for (let i = 1; i < word.length - 1; i++) {
      if (/[a-z]/i.test(word[i]) && /[a-z]/i.test(word[i + 1]) && word[i] !== word[i + 1]) {
        candidates.push(i);
      }
    }
    if (candidates.length === 0) return "";
    const pos = candidates[randomInt(0, candidates.length - 1)];
    return word.slice(0, pos) + word[pos + 1] + word[pos] + word.slice(pos + 2);
  }

  function doubleLetterMistake(word) {
    const candidates = letterIndexes(word);
    if (candidates.length === 0) return word;
    const pos = candidates[randomInt(0, candidates.length - 1)];
    return word.slice(0, pos) + word[pos] + word.slice(pos);
  }

  function letterIndexes(word) {
    const indexes = [];
    for (let i = 0; i < word.length; i++) {
      if (/[a-z]/i.test(word[i])) indexes.push(i);
    }
    return indexes;
  }

  function cleanWord(token) {
    const word = String(token || "").toLowerCase().replace(/[^a-z']/g, "");
    return /[a-z]/.test(word) ? word : "";
  }

  function isVowelScarce(word) {
    const letters = word.replace(/[^a-z]/g, "");
    if (letters.length === 0) return false;
    const vowelCount = (letters.match(/[aeiou]/g) || []).length;
    return vowelCount / letters.length < 0.28;
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // Characters that require holding Shift — these take a touch longer because
  // of the extra finger movement involved.
  const SHIFT_SYMBOLS = new Set(['!','@','#','$','%','^','&','*','(',')','_','+','{','}','|',':','"','<','>','?','~']);
  function requiresShift(ch) {
    return /[A-Z]/.test(ch) || SHIFT_SYMBOLS.has(ch);
  }

  // Scales the small "thinking pause" windows below relative to the chosen
  // typing speed, so Fast doesn't get the same multi-second hesitations as
  // Slow (and vice versa) — only timings the user hasn't explicitly configured
  // in seconds are scaled.
  function pauseScale(delay) {
    return clamp(delay / speedDelays.medium, 0.35, 1.3);
  }

  globalThis.TextToWriteConfig = Object.freeze({
    speedDelays,
    behaviorStorageKeys,
    normalizeTypingBehavior,
    wordDifficultyMultiplier,
    adjustedMistakeRate,
    generateMistake,
    qwertyNeighbors,
    requiresShift,
    pauseScale,
  });
})();
