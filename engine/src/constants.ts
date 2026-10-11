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
export const MAX_WORD_LENGTH = 8;
/** Only the most common matching words are considered. */
export const MAX_POOL = 2000;
/** With fewer real words than this available, made-up words fill in. */
export const FULL_POOL = 60;
export const MAX_MADE_UP_SHARE = 0.8;
export const BASE_WORD_WEIGHT = 0.2;
/** Word weight is multiplied by 1 / (1 + rank / RANK_SCALE), favoring common words. */
export const RANK_SCALE = 3000;
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
