//! Human-like typing engine — a port of the extension's `typing-options.js`
//! (timing/mistake math) and `content.js` (`typeText` loop) to Rust.
//!
//! Differences from the extension:
//! - "typing a character" calls into [`crate::keystroke`] (CGEvent) instead
//!   of dispatching DOM events.
//! - Sleeps use `tokio::time::sleep` directly — no background-timer relay is
//!   needed because this runs in a native process, not a throttled tab.
//! - Pause/stop is driven by a shared [`SessionState`] instead of module-level
//!   `let` flags, and focus-loss auto-pause is detected by a separate poll
//!   task in `commands.rs` using [`crate::accessibility`].

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use rand::rngs::SmallRng;
use rand::{Rng, SeedableRng};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::accessibility::FocusedElement;
use crate::keystroke;

pub const SPEED_SLOW: f64 = 120.0;
pub const SPEED_MEDIUM: f64 = 45.0;
pub const SPEED_FAST: f64 = 12.0;

const EASY_WORDS: &[&str] = &[
    "a", "an", "and", "as", "at", "be", "but", "by", "do", "for", "go", "he", "her", "his", "i",
    "if", "in", "is", "it", "me", "my", "no", "not", "of", "on", "or", "so", "the", "to", "up",
    "us", "we", "you",
];

// ---------------------------------------------------------------------------
// Session state — shared between Tauri commands and the typing task
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionStatus {
    Idle,
    Typing,
    Paused,
    Stopped,
}

pub struct SessionState {
    pub status: SessionStatus,
    pub active_delay: f64,
    pub generation: u64,
    pub target: Option<FocusedElement>,
}

impl Default for SessionState {
    fn default() -> Self {
        Self {
            status: SessionStatus::Idle,
            active_delay: SPEED_MEDIUM,
            generation: 0,
            target: None,
        }
    }
}

pub type SharedState = Arc<Mutex<SessionState>>;

// ---------------------------------------------------------------------------
// Behavior config sent from the frontend (mirrors normalizeTypingBehavior)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypingBehavior {
    pub natural_pauses: bool,
    pub pause_every: f64,    // ms
    pub pause_duration: f64, // ms
    pub vary_times: bool,
    pub punct_pauses: bool,
    pub var_speed: bool,
    pub word_difficulty: bool,
    pub mistakes: bool,
    pub mistake_pause: f64, // ms
    pub mistake_rate: f64,  // fraction 0..1
    pub paragraph_pause: bool,
    pub self_interrupt: bool,
    pub quick_corrections: bool,
}

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    words_typed: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetPayload {
    pub description: String,
    pub ready: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CompletePayload {
    stopped: bool,
    error: Option<String>,
}

// ---------------------------------------------------------------------------
// Word-difficulty / mistake math (port of typing-options.js)
// ---------------------------------------------------------------------------

fn clean_word(token: &str) -> String {
    let lowered = token.to_lowercase();
    let cleaned: String = lowered
        .chars()
        .filter(|c| c.is_ascii_lowercase() || *c == '\'')
        .collect();
    if cleaned.chars().any(|c| c.is_ascii_lowercase()) {
        cleaned
    } else {
        String::new()
    }
}

fn has_consonant_run(word: &str, run_len: usize) -> bool {
    const CONSONANTS: &str = "bcdfghjklmnpqrstvwxyz";
    let mut run = 0;
    for c in word.chars() {
        if CONSONANTS.contains(c) {
            run += 1;
            if run >= run_len {
                return true;
            }
        } else {
            run = 0;
        }
    }
    false
}

fn is_vowel_scarce(word: &str) -> bool {
    let letters: Vec<char> = word.chars().filter(|c| c.is_ascii_alphabetic()).collect();
    if letters.is_empty() {
        return false;
    }
    let vowels = letters.iter().filter(|c| "aeiou".contains(**c)).count();
    (vowels as f64 / letters.len() as f64) < 0.28
}

pub fn word_difficulty_multiplier(token: &str) -> f64 {
    let word = clean_word(token);
    if word.is_empty() {
        return 1.0;
    }
    let len = word.chars().count();
    if len <= 3 || EASY_WORDS.contains(&word.as_str()) {
        return 0.96;
    }

    let mut score = 0.0;
    if len >= 6 {
        score += ((len as f64 - 5.0) * 0.05).min(0.42);
    }
    if word.chars().any(|c| "jqxz".contains(c)) {
        score += 0.1;
    }
    if word.chars().any(|c| "kvwy".contains(c)) {
        score += 0.05;
    }
    if has_consonant_run(&word, 3) {
        score += 0.08;
    }
    if len >= 5 && is_vowel_scarce(&word) {
        score += 0.08;
    }
    if token.contains('\'') || token.contains('-') {
        score += 0.04;
    }

    (1.0 + score).min(1.6)
}

fn adjusted_mistake_rate(base_rate: f64, token: &str, base_delay: f64) -> f64 {
    let word = clean_word(token);
    if word.is_empty() {
        return 0.0;
    }

    let mut multiplier = 1.0;
    let difficulty = word_difficulty_multiplier(token);
    let len = word.chars().count();
    if len <= 4 || EASY_WORDS.contains(&word.as_str()) {
        multiplier -= 0.25;
    }
    if len >= 7 {
        multiplier += 0.2;
    }
    if len >= 11 {
        multiplier += 0.2;
    }
    multiplier += (difficulty - 1.0).max(0.0) * 1.4;

    if base_delay <= SPEED_FAST {
        multiplier += 0.25;
    } else if base_delay >= SPEED_SLOW {
        multiplier -= 0.15;
    }

    let min = base_rate * 0.45;
    let max = (0.75_f64).min(base_rate * 2.4);
    (base_rate * multiplier).clamp(min, max)
}

fn qwerty_neighbors(c: char) -> Option<&'static str> {
    match c {
        'a' => Some("sqwz"),
        'b' => Some("vghn"),
        'c' => Some("xdfv"),
        'd' => Some("serfcx"),
        'e' => Some("wsdr"),
        'f' => Some("drtgvc"),
        'g' => Some("ftyhbv"),
        'h' => Some("gyujnb"),
        'i' => Some("ujko"),
        'j' => Some("huikmnb"),
        'k' => Some("jiolm"),
        'l' => Some("kop"),
        'm' => Some("njk"),
        'n' => Some("bhjm"),
        'o' => Some("iklp"),
        'p' => Some("ol"),
        'q' => Some("wa"),
        'r' => Some("edft"),
        's' => Some("awedxz"),
        't' => Some("rfgy"),
        'u' => Some("yhji"),
        'v' => Some("cfgb"),
        'w' => Some("qase"),
        'x' => Some("zsdc"),
        'y' => Some("tghu"),
        'z' => Some("asx"),
        _ => None,
    }
}

fn letter_indexes(word: &[char]) -> Vec<usize> {
    word.iter()
        .enumerate()
        .filter(|(_, c)| c.is_ascii_alphabetic())
        .map(|(i, _)| i)
        .collect()
}

fn adjacent_key_mistake(word: &[char], rng: &mut SmallRng) -> Option<String> {
    let candidates: Vec<usize> = letter_indexes(word)
        .into_iter()
        .filter(|&i| qwerty_neighbors(word[i].to_ascii_lowercase()).is_some())
        .collect();
    if candidates.is_empty() {
        return None;
    }
    let pos = candidates[rng.gen_range(0..candidates.len())];
    let key = word[pos].to_ascii_lowercase();
    let neighbors: Vec<char> = qwerty_neighbors(key).unwrap().chars().collect();
    let wrong = neighbors[rng.gen_range(0..neighbors.len())];
    let replacement = if word[pos].is_ascii_uppercase() {
        wrong.to_ascii_uppercase()
    } else {
        wrong
    };
    let mut out = word.to_vec();
    out[pos] = replacement;
    Some(out.into_iter().collect())
}

fn missing_letter_mistake(word: &[char], rng: &mut SmallRng) -> Option<String> {
    if word.len() < 4 {
        return None;
    }
    let candidates: Vec<usize> = letter_indexes(word)
        .into_iter()
        .filter(|&i| i > 0 && i < word.len() - 1)
        .collect();
    if candidates.is_empty() {
        return None;
    }
    let pos = candidates[rng.gen_range(0..candidates.len())];
    let mut out = word.to_vec();
    out.remove(pos);
    Some(out.into_iter().collect())
}

fn transpose_mistake(word: &[char], rng: &mut SmallRng) -> Option<String> {
    let mut candidates = Vec::new();
    if word.len() >= 2 {
        for i in 1..word.len() - 1 {
            if word[i].is_ascii_alphabetic() && word[i + 1].is_ascii_alphabetic() && word[i] != word[i + 1] {
                candidates.push(i);
            }
        }
    }
    if candidates.is_empty() {
        return None;
    }
    let pos = candidates[rng.gen_range(0..candidates.len())];
    let mut out = word.to_vec();
    out.swap(pos, pos + 1);
    Some(out.into_iter().collect())
}

fn double_letter_mistake(word: &[char], rng: &mut SmallRng) -> String {
    let candidates = letter_indexes(word);
    if candidates.is_empty() {
        return word.iter().collect();
    }
    let pos = candidates[rng.gen_range(0..candidates.len())];
    let mut out = word.to_vec();
    out.insert(pos, word[pos]);
    out.into_iter().collect()
}

fn generate_mistake(word: &str, rng: &mut SmallRng) -> String {
    let chars: Vec<char> = word.chars().collect();
    let roll: f64 = rng.gen();
    let typo = if roll < 0.45 {
        adjacent_key_mistake(&chars, rng)
    } else if roll < 0.7 {
        missing_letter_mistake(&chars, rng)
    } else if roll < 0.9 {
        transpose_mistake(&chars, rng)
    } else {
        Some(double_letter_mistake(&chars, rng))
    };

    match typo {
        Some(t) if t != word => t,
        _ => adjacent_key_mistake(&chars, rng).unwrap_or_else(|| double_letter_mistake(&chars, rng)),
    }
}

// ---------------------------------------------------------------------------
// Speed / variance helpers
// ---------------------------------------------------------------------------

fn jitter(max_ms: f64, rng: &mut SmallRng) -> f64 {
    rng.gen::<f64>() * max_ms - max_ms / 2.0
}

/// Characters that require holding Shift — these take a touch longer because
/// of the extra finger movement involved.
fn requires_shift(ch: char) -> bool {
    ch.is_ascii_uppercase()
        || matches!(
            ch,
            '!' | '@' | '#' | '$' | '%' | '^' | '&' | '*' | '(' | ')' | '_' | '+' | '{' | '}' | '|' | ':' | '"' | '<' | '>' | '?' | '~'
        )
}

fn char_delay(base: f64, mult: f64, var_speed: bool, word_mult: f64, ch: char, rng: &mut SmallRng) -> f64 {
    let effective = (if var_speed { base * mult } else { base }) * word_mult;
    let shift_extra = if requires_shift(ch) {
        effective * (0.12 + rng.gen::<f64>() * 0.1)
    } else {
        0.0
    };
    (effective + shift_extra + jitter(effective * 0.3, rng)).max(0.0)
}

/// Scales the small "thinking pause" windows below relative to the chosen
/// typing speed, so Fast doesn't get the same multi-second hesitations as
/// Slow (and vice versa) — only timings the user hasn't explicitly configured
/// in seconds are scaled.
fn pause_scale(delay: f64) -> f64 {
    (delay / SPEED_MEDIUM).clamp(0.35, 1.3)
}

/// Occasionally inserts a brief extra pause between characters so typing
/// happens in short natural bursts rather than a perfectly even rhythm.
/// Returns `(stopped, extra_ms)`.
async fn maybe_burst_pause(
    counter: &mut i64,
    scale: f64,
    state: &SharedState,
    generation: u64,
    rng: &mut SmallRng,
) -> (bool, f64) {
    *counter -= 1;
    if *counter > 0 {
        return (false, 0.0);
    }
    *counter = random_int(rng, 3, 8);
    let extra = (random_between(rng, 40.0, 150.0) * scale).max(0.0);
    let stopped = type_sleep(extra, state, generation).await;
    (stopped, extra)
}

fn tick_speed(mult: f64, countdown: i64, var_speed: bool, rng: &mut SmallRng) -> (f64, i64) {
    if !var_speed {
        return (mult, countdown);
    }
    let next = countdown - 1;
    if next <= 0 {
        (0.6 + rng.gen::<f64>() * 0.9, rng.gen_range(20..=50))
    } else {
        (mult, next)
    }
}

fn apply_variance(ms: f64, vary: bool, rng: &mut SmallRng) -> f64 {
    if !vary {
        return ms;
    }
    let sign = if rng.gen::<f64>() < 0.5 { 1.0 } else { -1.0 };
    let delta = (1.0 + rng.gen::<f64>() * 2.0) * 1000.0;
    (ms * 0.25).round().max(ms + sign * delta)
}

fn random_between(rng: &mut SmallRng, min: f64, max: f64) -> f64 {
    rng.gen::<f64>() * (max - min) + min
}

fn random_int(rng: &mut SmallRng, min: i64, max: i64) -> i64 {
    random_between(rng, min as f64, (max + 1) as f64).floor() as i64
}

// ---------------------------------------------------------------------------
// Tokenizer — splits into runs of [a-zA-Z'] vs everything else, matching the
// extension's `/[a-zA-Z']+|[^a-zA-Z']+/g`.
// ---------------------------------------------------------------------------

fn tokenize(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut current_is_word: Option<bool> = None;

    for c in text.chars() {
        let is_word_char = c.is_ascii_alphabetic() || c == '\'';
        match current_is_word {
            Some(w) if w == is_word_char => current.push(c),
            _ => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
                current.push(c);
                current_is_word = Some(is_word_char);
            }
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

fn is_word_token(token: &str) -> bool {
    token
        .chars()
        .next()
        .map(|c| c.is_ascii_alphabetic() || c == '\'')
        .unwrap_or(false)
}

fn is_mistake_eligible(token: &str) -> bool {
    let chars: Vec<char> = token.chars().collect();
    chars.len() >= 3 && chars.iter().all(|c| c.is_ascii_alphabetic() || *c == '\'')
}

// ---------------------------------------------------------------------------
// Pause / stop control
// ---------------------------------------------------------------------------

/// Returns true if the session has been stopped (or superseded by a newer
/// session). Blocks (polling) while paused.
async fn check_stop(state: &SharedState, generation: u64) -> bool {
    loop {
        let status = {
            let s = state.lock().unwrap();
            if s.generation != generation {
                return true;
            }
            s.status
        };
        match status {
            SessionStatus::Stopped | SessionStatus::Idle => return true,
            SessionStatus::Typing => return false,
            SessionStatus::Paused => {
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        }
    }
}

/// Sleep for `ms`, checking for stop first. Returns true if stopped.
async fn type_sleep(ms: f64, state: &SharedState, generation: u64) -> bool {
    if check_stop(state, generation).await {
        return true;
    }
    tokio::time::sleep(Duration::from_millis(ms.max(0.0) as u64)).await;
    false
}

/// Longer interruptible sleep (natural/mistake pauses). Exits early if the
/// session is resumed mid-sleep, matching the extension's behaviour. Returns
/// true if stopped.
async fn interruptible_sleep(ms: f64, state: &SharedState, generation: u64) -> bool {
    let end = Instant::now() + Duration::from_millis(ms.max(0.0) as u64);
    loop {
        let status = {
            let s = state.lock().unwrap();
            if s.generation != generation {
                return true;
            }
            s.status
        };
        match status {
            SessionStatus::Stopped | SessionStatus::Idle => return true,
            SessionStatus::Paused => {
                // Wait until resumed (or stopped), then return early — typing
                // continues immediately rather than finishing the old sleep.
                loop {
                    tokio::time::sleep(Duration::from_millis(50)).await;
                    let s = state.lock().unwrap();
                    if s.generation != generation || matches!(s.status, SessionStatus::Stopped | SessionStatus::Idle) {
                        return true;
                    }
                    if !matches!(s.status, SessionStatus::Paused) {
                        break;
                    }
                }
                return false;
            }
            SessionStatus::Typing => {
                let now = Instant::now();
                if now >= end {
                    return false;
                }
                let chunk = (end - now).min(Duration::from_millis(100));
                tokio::time::sleep(chunk).await;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Main typing loop — port of content.js's typeText()
// ---------------------------------------------------------------------------

pub async fn run_typing_session(
    app: AppHandle,
    state: SharedState,
    text: String,
    behavior: TypingBehavior,
    generation: u64,
) {
    let mut rng = SmallRng::from_entropy();
    let tokens = tokenize(&text);

    let mut words_typed: usize = 0;
    let mut last_progress_sent = Instant::now() - Duration::from_secs(1);

    let mut elapsed: f64 = 0.0;
    let mut time_until_pause: f64 = if behavior.natural_pauses {
        apply_variance(behavior.pause_every, behavior.vary_times, &mut rng)
    } else {
        f64::INFINITY
    };

    let mut punct_count: i64 = 0;
    let mut next_punct_threshold = random_int(&mut rng, 3, 5);

    let mut speed_mult: f64 = 1.0;
    let mut chars_until_speed_shift = random_int(&mut rng, 20, 50);

    // Burst-typing rhythm: a short extra pause every few characters, at every
    // speed, so even Fast mode doesn't feel like a metronome.
    let mut chars_until_burst_pause = random_int(&mut rng, 3, 8);

    // Pending "dropped letter" — set when a character is skipped and caught
    // a beat later (see quick_corrections below).
    let mut pending_drop: Option<char> = None;

    let mut after_sentence_end = true;
    let mut after_newline = false;

    let mut stopped = false;
    let mut error: Option<String> = None;

    'outer: for token in &tokens {
        let delay = { state.lock().unwrap().active_delay };
        let p_scale = pause_scale(delay);
        if check_stop(&state, generation).await {
            stopped = true;
            break;
        }

        let word_token = is_word_token(token);
        let mistake_eligible = is_mistake_eligible(token);
        let word_mult = if behavior.word_difficulty {
            word_difficulty_multiplier(token)
        } else {
            1.0
        };
        let mistake_rate = adjusted_mistake_rate(behavior.mistake_rate, token, delay);
        let do_mistake = behavior.mistakes && mistake_eligible && rng.gen::<f64>() < mistake_rate;

        // Paragraph hesitation
        if word_token && after_newline && behavior.paragraph_pause {
            if interruptible_sleep(random_between(&mut rng, 1000.0 * p_scale, 3000.0 * p_scale), &state, generation).await {
                stopped = true;
                break;
            }
        }

        // Word hesitation (always enabled, like the extension's wordHesitation:true)
        if word_token && word_difficulty_multiplier(token) >= 1.2 {
            if interruptible_sleep(random_between(&mut rng, 500.0 * p_scale, 2500.0 * p_scale), &state, generation).await {
                stopped = true;
                break;
            }
        }

        // Sentence-start slowdown
        let sentence_mult = if after_sentence_end && word_token {
            1.7 + rng.gen::<f64>() * 0.3
        } else {
            1.0
        };

        // Self-interrupt eligibility
        let chars_count = token.chars().count();
        let do_self_interrupt = behavior.self_interrupt
            && word_token
            && mistake_eligible
            && chars_count >= 4
            && !do_mistake
            && rng.gen::<f64>() < 0.015;

        if do_mistake {
            let misspelled = generate_mistake(token, &mut rng);

            for ch in misspelled.chars() {
                if check_stop(&state, generation).await {
                    stopped = true;
                    break 'outer;
                }
                if let Err(e) = keystroke::type_char(ch) {
                    error = Some(e);
                    stopped = true;
                    break 'outer;
                }
                let d = char_delay(delay, speed_mult, behavior.var_speed, word_mult, ch, &mut rng);
                if type_sleep(d, &state, generation).await {
                    stopped = true;
                    break 'outer;
                }
                elapsed += d;
                let r = tick_speed(speed_mult, chars_until_speed_shift, behavior.var_speed, &mut rng);
                speed_mult = r.0;
                chars_until_speed_shift = r.1;
                let (b_stopped, b_extra) = maybe_burst_pause(&mut chars_until_burst_pause, p_scale, &state, generation, &mut rng).await;
                if b_stopped {
                    stopped = true;
                    break 'outer;
                }
                elapsed += b_extra;
            }

            if interruptible_sleep(apply_variance(behavior.mistake_pause, behavior.vary_times, &mut rng), &state, generation).await {
                stopped = true;
                break;
            }

            for _ in misspelled.chars() {
                if check_stop(&state, generation).await {
                    stopped = true;
                    break 'outer;
                }
                if let Err(e) = keystroke::backspace() {
                    error = Some(e);
                    stopped = true;
                    break 'outer;
                }
                let d = delay + jitter(delay * 0.3, &mut rng);
                if type_sleep(d, &state, generation).await {
                    stopped = true;
                    break 'outer;
                }
                elapsed += d;
            }

            if interruptible_sleep(apply_variance(behavior.mistake_pause, behavior.vary_times, &mut rng), &state, generation).await {
                stopped = true;
                break;
            }

            for ch in token.chars() {
                if check_stop(&state, generation).await {
                    stopped = true;
                    break 'outer;
                }
                if let Err(e) = keystroke::type_char(ch) {
                    error = Some(e);
                    stopped = true;
                    break 'outer;
                }
                let d = char_delay(delay, speed_mult, behavior.var_speed, word_mult, ch, &mut rng);
                if type_sleep(d, &state, generation).await {
                    stopped = true;
                    break 'outer;
                }
                elapsed += d;
                let r = tick_speed(speed_mult, chars_until_speed_shift, behavior.var_speed, &mut rng);
                speed_mult = r.0;
                chars_until_speed_shift = r.1;
                let (b_stopped, b_extra) = maybe_burst_pause(&mut chars_until_burst_pause, p_scale, &state, generation, &mut rng).await;
                if b_stopped {
                    stopped = true;
                    break 'outer;
                }
                elapsed += b_extra;
            }

            words_typed += 1;
            maybe_emit_progress(&app, &state, generation, &mut last_progress_sent, words_typed);
        } else {
            let mut char_index = 0usize;
            for ch in token.chars() {
                // Treat CR as a no-op so CRLF line endings don't press Enter twice.
                if ch == '\r' {
                    continue;
                }

                if check_stop(&state, generation).await {
                    stopped = true;
                    break 'outer;
                }

                // Natural pause check
                if behavior.natural_pauses && elapsed >= time_until_pause {
                    if interruptible_sleep(apply_variance(behavior.pause_duration, behavior.vary_times, &mut rng), &state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    elapsed = 0.0;
                    time_until_pause = apply_variance(behavior.pause_every, behavior.vary_times, &mut rng);
                }

                let do_cap_slip = behavior.mistakes
                    && after_sentence_end
                    && char_index == 0
                    && word_token
                    && ch.is_ascii_uppercase()
                    && rng.gen::<f64>() < 0.12;

                // Quick self-corrections: small typos that get caught and
                // fixed almost instantly, the way a fast typist would.
                let quick_eligible = behavior.mistakes
                    && behavior.quick_corrections
                    && !do_cap_slip
                    && ch.is_ascii_alphabetic();

                let do_drop_catch = pending_drop.is_some();

                let do_drop_now = !do_drop_catch
                    && quick_eligible
                    && char_index + 1 < chars_count
                    && rng.gen::<f64>() < 0.012;

                let do_instant_fix = !do_drop_catch
                    && !do_drop_now
                    && quick_eligible
                    && char_index > 0
                    && qwerty_neighbors(ch.to_ascii_lowercase()).is_some()
                    && rng.gen::<f64>() < 0.02;

                let do_stuck_shift = !do_drop_catch
                    && !do_drop_now
                    && !do_instant_fix
                    && quick_eligible
                    && char_index > 0
                    && ch.is_ascii_lowercase()
                    && rng.gen::<f64>() < 0.012;

                if do_cap_slip {
                    if let Err(e) = keystroke::type_char(ch.to_ascii_lowercase()) {
                        error = Some(e);
                        stopped = true;
                        break 'outer;
                    }
                    let d_slip = char_delay(delay * sentence_mult, speed_mult, behavior.var_speed, word_mult, ch.to_ascii_lowercase(), &mut rng);
                    if type_sleep(d_slip, &state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    elapsed += d_slip;
                    let r = tick_speed(speed_mult, chars_until_speed_shift, behavior.var_speed, &mut rng);
                    speed_mult = r.0;
                    chars_until_speed_shift = r.1;

                    if interruptible_sleep(random_between(&mut rng, 200.0 * p_scale, 600.0 * p_scale), &state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    if let Err(e) = keystroke::backspace() {
                        error = Some(e);
                        stopped = true;
                        break 'outer;
                    }
                    let d_bs = char_delay(delay, speed_mult, behavior.var_speed, word_mult, ' ', &mut rng);
                    if type_sleep(d_bs, &state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    elapsed += d_bs;
                    if let Err(e) = keystroke::type_char(ch) {
                        error = Some(e);
                        stopped = true;
                        break 'outer;
                    }
                    let d_cap = char_delay(delay * sentence_mult, speed_mult, behavior.var_speed, word_mult, ch, &mut rng);
                    if type_sleep(d_cap, &state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    let r = tick_speed(speed_mult, chars_until_speed_shift, behavior.var_speed, &mut rng);
                    speed_mult = r.0;
                    chars_until_speed_shift = r.1;
                    elapsed += d_cap;
                    let (b_stopped, b_extra) = maybe_burst_pause(&mut chars_until_burst_pause, p_scale, &state, generation, &mut rng).await;
                    if b_stopped {
                        stopped = true;
                        break 'outer;
                    }
                    elapsed += b_extra;
                } else if do_drop_catch {
                    // Catch-up from a dropped letter one character ago: type
                    // this character normally, then a beat later notice the
                    // gap, backspace, and retype the missed letter + this one.
                    let missed = pending_drop.take().unwrap();

                    if let Err(e) = keystroke::type_char(ch) {
                        error = Some(e);
                        stopped = true;
                        break 'outer;
                    }
                    let d = char_delay(delay * sentence_mult, speed_mult, behavior.var_speed, word_mult, ch, &mut rng);
                    if type_sleep(d, &state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    elapsed += d;
                    let r = tick_speed(speed_mult, chars_until_speed_shift, behavior.var_speed, &mut rng);
                    speed_mult = r.0;
                    chars_until_speed_shift = r.1;

                    if interruptible_sleep(random_between(&mut rng, 150.0, 400.0) * p_scale, &state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    if let Err(e) = keystroke::backspace() {
                        error = Some(e);
                        stopped = true;
                        break 'outer;
                    }
                    let d_bs = char_delay(delay, speed_mult, behavior.var_speed, word_mult, ' ', &mut rng);
                    if type_sleep(d_bs, &state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    elapsed += d_bs;

                    if let Err(e) = keystroke::type_char(missed) {
                        error = Some(e);
                        stopped = true;
                        break 'outer;
                    }
                    let d_missed = char_delay(delay, speed_mult, behavior.var_speed, word_mult, missed, &mut rng);
                    if type_sleep(d_missed, &state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    elapsed += d_missed;

                    if let Err(e) = keystroke::type_char(ch) {
                        error = Some(e);
                        stopped = true;
                        break 'outer;
                    }
                    let d_redo = char_delay(delay, speed_mult, behavior.var_speed, word_mult, ch, &mut rng);
                    if type_sleep(d_redo, &state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    elapsed += d_redo;

                    let (b_stopped, b_extra) = maybe_burst_pause(&mut chars_until_burst_pause, p_scale, &state, generation, &mut rng).await;
                    if b_stopped {
                        stopped = true;
                        break 'outer;
                    }
                    elapsed += b_extra;
                } else if do_drop_now {
                    // Skip this letter entirely for now — it gets typed when
                    // the gap is "noticed" on the next character.
                    pending_drop = Some(ch);
                } else if do_instant_fix {
                    // Hit an adjacent key, notice immediately, fix it.
                    let lower = ch.to_ascii_lowercase();
                    let neighbors: Vec<char> = qwerty_neighbors(lower).unwrap().chars().collect();
                    let wrong_lower = neighbors[rng.gen_range(0..neighbors.len())];
                    let wrong = if ch.is_ascii_uppercase() { wrong_lower.to_ascii_uppercase() } else { wrong_lower };

                    if let Err(e) = keystroke::type_char(wrong) {
                        error = Some(e);
                        stopped = true;
                        break 'outer;
                    }
                    let d_wrong = char_delay(delay * sentence_mult, speed_mult, behavior.var_speed, word_mult, wrong, &mut rng);
                    if type_sleep(d_wrong, &state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    elapsed += d_wrong;

                    if interruptible_sleep(random_between(&mut rng, 80.0, 220.0) * p_scale, &state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    if let Err(e) = keystroke::backspace() {
                        error = Some(e);
                        stopped = true;
                        break 'outer;
                    }
                    let d_bs = char_delay(delay, speed_mult, behavior.var_speed, word_mult, ' ', &mut rng);
                    if type_sleep(d_bs, &state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    elapsed += d_bs;

                    if let Err(e) = keystroke::type_char(ch) {
                        error = Some(e);
                        stopped = true;
                        break 'outer;
                    }
                    let d = char_delay(delay * sentence_mult, speed_mult, behavior.var_speed, word_mult, ch, &mut rng);
                    if type_sleep(d, &state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    elapsed += d;
                    let r = tick_speed(speed_mult, chars_until_speed_shift, behavior.var_speed, &mut rng);
                    speed_mult = r.0;
                    chars_until_speed_shift = r.1;

                    let (b_stopped, b_extra) = maybe_burst_pause(&mut chars_until_burst_pause, p_scale, &state, generation, &mut rng).await;
                    if b_stopped {
                        stopped = true;
                        break 'outer;
                    }
                    elapsed += b_extra;
                } else if do_stuck_shift {
                    // Shift "sticks" for one extra letter, notice immediately, fix it.
                    let upper = ch.to_ascii_uppercase();

                    if let Err(e) = keystroke::type_char(upper) {
                        error = Some(e);
                        stopped = true;
                        break 'outer;
                    }
                    let d_up = char_delay(delay * sentence_mult, speed_mult, behavior.var_speed, word_mult, upper, &mut rng);
                    if type_sleep(d_up, &state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    elapsed += d_up;

                    if interruptible_sleep(random_between(&mut rng, 100.0, 300.0) * p_scale, &state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    if let Err(e) = keystroke::backspace() {
                        error = Some(e);
                        stopped = true;
                        break 'outer;
                    }
                    let d_bs = char_delay(delay, speed_mult, behavior.var_speed, word_mult, ' ', &mut rng);
                    if type_sleep(d_bs, &state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    elapsed += d_bs;

                    if let Err(e) = keystroke::type_char(ch) {
                        error = Some(e);
                        stopped = true;
                        break 'outer;
                    }
                    let d = char_delay(delay * sentence_mult, speed_mult, behavior.var_speed, word_mult, ch, &mut rng);
                    if type_sleep(d, &state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    elapsed += d;
                    let r = tick_speed(speed_mult, chars_until_speed_shift, behavior.var_speed, &mut rng);
                    speed_mult = r.0;
                    chars_until_speed_shift = r.1;

                    let (b_stopped, b_extra) = maybe_burst_pause(&mut chars_until_burst_pause, p_scale, &state, generation, &mut rng).await;
                    if b_stopped {
                        stopped = true;
                        break 'outer;
                    }
                    elapsed += b_extra;
                } else {
                    if ch == '\n' {
                        if let Err(e) = keystroke::press_enter() {
                            error = Some(e);
                            stopped = true;
                            break 'outer;
                        }
                    } else if let Err(e) = keystroke::type_char(ch) {
                        error = Some(e);
                        stopped = true;
                        break 'outer;
                    }

                    let do_double_slip = behavior.mistakes && ch.is_ascii_alphabetic() && rng.gen::<f64>() < 0.015;

                    let d = char_delay(delay * sentence_mult, speed_mult, behavior.var_speed, word_mult, ch, &mut rng);
                    if type_sleep(d, &state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    elapsed += d;
                    let r = tick_speed(speed_mult, chars_until_speed_shift, behavior.var_speed, &mut rng);
                    speed_mult = r.0;
                    chars_until_speed_shift = r.1;

                    if do_double_slip {
                        if let Err(e) = keystroke::type_char(ch) {
                            error = Some(e);
                            stopped = true;
                            break 'outer;
                        }
                        if interruptible_sleep(random_between(&mut rng, 100.0, 350.0) * p_scale, &state, generation).await {
                            stopped = true;
                            break 'outer;
                        }
                        if let Err(e) = keystroke::backspace() {
                            error = Some(e);
                            stopped = true;
                            break 'outer;
                        }
                        if type_sleep(char_delay(delay, speed_mult, behavior.var_speed, word_mult, ' ', &mut rng), &state, generation).await {
                            stopped = true;
                            break 'outer;
                        }
                    }

                    let (b_stopped, b_extra) = maybe_burst_pause(&mut chars_until_burst_pause, p_scale, &state, generation, &mut rng).await;
                    if b_stopped {
                        stopped = true;
                        break 'outer;
                    }
                    elapsed += b_extra;
                }

                // Punctuation pause
                if behavior.punct_pauses && ".,:;!?".contains(ch) {
                    punct_count += 1;
                    if punct_count >= next_punct_threshold {
                        if interruptible_sleep(random_between(&mut rng, 1000.0 * p_scale, 2000.0 * p_scale), &state, generation).await {
                            stopped = true;
                            break 'outer;
                        }
                        punct_count = 0;
                        next_punct_threshold = random_int(&mut rng, 3, 5);
                    }
                }

                char_index += 1;
            }

            // Self-interrupt: finish word, delete it, retype
            if do_self_interrupt {
                if interruptible_sleep(random_between(&mut rng, 400.0 * p_scale, 1200.0 * p_scale), &state, generation).await {
                    stopped = true;
                    break;
                }
                for _ in token.chars() {
                    if check_stop(&state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    if let Err(e) = keystroke::backspace() {
                        error = Some(e);
                        stopped = true;
                        break 'outer;
                    }
                    let d = char_delay(delay * 0.85, 1.0, false, 1.0, ' ', &mut rng);
                    if type_sleep(d, &state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    elapsed += d;
                }
                if interruptible_sleep(random_between(&mut rng, 300.0 * p_scale, 800.0 * p_scale), &state, generation).await {
                    stopped = true;
                    break;
                }
                for ch in token.chars() {
                    if check_stop(&state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    if let Err(e) = keystroke::type_char(ch) {
                        error = Some(e);
                        stopped = true;
                        break 'outer;
                    }
                    let d = char_delay(delay, speed_mult, behavior.var_speed, word_mult, ch, &mut rng);
                    if type_sleep(d, &state, generation).await {
                        stopped = true;
                        break 'outer;
                    }
                    elapsed += d;
                    let r = tick_speed(speed_mult, chars_until_speed_shift, behavior.var_speed, &mut rng);
                    speed_mult = r.0;
                    chars_until_speed_shift = r.1;
                }
            }

            if word_token {
                words_typed += 1;
                maybe_emit_progress(&app, &state, generation, &mut last_progress_sent, words_typed);
            }
        }

        if word_token {
            after_sentence_end = false;
            after_newline = false;
        } else {
            after_sentence_end = token.contains(['.', '!', '?']) || token.contains('\n');
            after_newline = token.contains('\n');
        }
    }

    // Final state transition — only touch shared state (and notify the
    // frontend) if this session is still the current one. Otherwise a newer
    // session has already taken over, and a stale "typing-complete" here
    // would incorrectly reset the UI back to idle mid-session.
    let is_current = {
        let mut s = state.lock().unwrap();
        let current = s.generation == generation;
        if current {
            s.status = SessionStatus::Idle;
            s.target = None;
        }
        current
    };

    if is_current {
        let _ = app.emit(
            "typing-progress",
            ProgressPayload { words_typed },
        );
        let _ = app.emit(
            "typing-complete",
            CompletePayload { stopped, error },
        );
    }
}

fn maybe_emit_progress(
    app: &AppHandle,
    state: &SharedState,
    generation: u64,
    last_sent: &mut Instant,
    words_typed: usize,
) {
    let now = Instant::now();
    if now.duration_since(*last_sent) >= Duration::from_millis(300) {
        *last_sent = now;
        if state.lock().unwrap().generation == generation {
            let _ = app.emit("typing-progress", ProgressPayload { words_typed });
        }
    }
}
