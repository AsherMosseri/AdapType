// Every tuning number in the engine lives here, so the spec and the ports can
// refer to one list.

/** Gaps longer than this are pauses, not typing speed. */
export const MAX_INTERVAL_MS = 2000;
/** Moving averages use weight max(MIN_AVG_WEIGHT, 1/n): a plain average for the first 10 samples, then recent-weighted. */
export const MIN_AVG_WEIGHT = 0.1;

/** Letters unlocked at the start. */
export const START_LETTERS = 6;
/** Rounds of history kept per key. */
export const KEY_HISTORY_ROUNDS = 5;
/** Mastery looks at this many recent rounds that included the key. */
export const MASTERY_ROUNDS = 3;
/** ...and needs at least this many samples across them. */
export const MASTERY_MIN_SAMPLES = 10;

/** Weakness scoring caps and weights. */
export const SPEED_SCORE_CAP = 2;
export const ERROR_SCORE_SCALE = 10;
export const ERROR_SCORE_CAP = 3;
/** Keys with fewer samples than this get an "unknown" bonus. */
export const CONFIDENT_SAMPLES = 5;
/** Extra score for the newest unlocked letter until it's mastered. */
export const FOCUS_BONUS = 1;

/** Round generation. */
export const MIN_WORD_LENGTH = 2;
/** Longest word in calibration rounds. Practice rounds use the difficulty curve's max length. */
export const MAX_WORD_LENGTH = 8;
/** With fewer real words than this available, made-up words fill in. */
export const FULL_POOL = 60;
export const MAX_MADE_UP_SHARE = 0.8;
export const BASE_WORD_WEIGHT = 0.2;
export const MADE_UP_MIN_LENGTH = 3;
export const MADE_UP_MAX_LENGTH = 6;
export const MADE_UP_ATTEMPTS = 20;
/** Chance a made-up word puts two consonants in a row. */
export const CONSONANT_CLUSTER_CHANCE = 0.25;

/** Calibration. */
export const CALIBRATION_WORD_POOL = 500;
export const SILENT_CALIBRATION_ROUNDS = 2;
export const TEST_OUT_MIN_SAMPLES = 5;
export const TEST_OUT_MIN_TIMED = 3;

/** Saved history sizes. */
export const MAX_ROUNDS_KEPT = 100;
export const MAX_TAPS_PER_KEY = 50;
/** Results compare against the average of this many recent rounds. */
export const RECENT_ROUNDS = 10;

export const VOWELS = "aeiouy";
export const LETTERS = "abcdefghijklmnopqrstuvwxyz";

export const UNLOCK_ORDERS = {
  /** Most common letters in English first. */
  frequency: "etaoinshrdlcumwfgypbvkjxqz",
  /** Home row, then top row, then bottom row; most common first within a row. */
  homeRow: "asdfjklhgeriotuwypqncmvbxz",
} as const;

/** Phase 2: modifiers. */
export const MODIFIER_IDS = ["caps", "punct", "numbers", "symbols", "accents", "extra"] as const;
/** Modifiers unlock in these stages once every letter is mastered. */
export const MODIFIER_STAGES = [["caps"], ["punct"], ["numbers"], ["symbols"], ["accents", "extra", "shortcuts"]] as const;
/** [min, max] share of words that get a modifier, per level. */
export const LEVEL_RANGES = {
  low: [0.03, 0.1],
  medium: [0.06, 0.25],
  high: [0.12, 0.5],
  auto: [0.03, 0.5],
} as const;
/** At most this share of words gets any modifier: when the rates add up to more, all are scaled down. */
export const MAX_DECORATED_SHARE = 0.5;
/** Position inside the range: this much from weakness, the rest from difficulty. */
export const MODIFIER_WEAKNESS_WEIGHT = 0.7;
/** Modifier keys (Shift, Option, layer switches) take longer, so their goal interval is this much longer. */
export const MODIFIER_TIME_SLACK = 1.5;
/** Left-hand letters on QWERTY; uppercase versions should use the right Shift. */
export const LEFT_HAND_LETTERS = "qwertasdfgzxcvb";
/** Modifiers appear in only some words, so mastery uses their running stats: at least this many samples... */
export const MODIFIER_MASTERY_SAMPLES = 15;
/** ...of which at least this many timed. */
export const MODIFIER_MASTERY_TIMED = 5;

/** Phase 2: difficulty curve. */
export const DIFFICULTY_START = 0.3;
export const DIFFICULTY_STEP = 0.05;
export const DIFFICULTY_ROUNDS = 3;
/** Raise difficulty at or above this share of the goal speed (with accuracy on target). */
export const DIFFICULTY_UP_RATIO = 0.95;
/** Lower it below this share of the goal speed, or with accuracy this far below target. */
export const DIFFICULTY_DOWN_RATIO = 0.8;
export const DIFFICULTY_ACCURACY_SLACK = 0.03;

/** Phase 2: explanations. Keys and pairs at or above these scores are named as a focus. */
export const FOCUS_KEY_MIN_SCORE = 0.3;
export const FOCUS_PAIR_MIN_SCORE = 0.5;

/** Phase 2: shortcut drill. */
export const SHORTCUT_TARGET_MS = 1500;
export const SHORTCUT_MAX_MS = 10000;
export const SHORTCUT_DRILL_LENGTH = 12;
