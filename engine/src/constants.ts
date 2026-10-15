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

/** Phase 3: sessions and fatigue. */
export const SESSION_GAP_MS = 30 * 60 * 1000;
export const SESSION_HISTORY = 30;
/** Fatigue compares against the average of the first this-many rounds of a session... */
export const FATIGUE_BASELINE_ROUNDS = 2;
/** ...using the average of the last this-many rounds, once the session has at least FATIGUE_MIN_ROUNDS. */
export const FATIGUE_RECENT_ROUNDS = 2;
export const FATIGUE_MIN_ROUNDS = 4;
export const FATIGUE_WPM_DROP = 0.88;
export const FATIGUE_ACCURACY_DROP = 0.04;
export const RECOVER_WPM = 0.95;
export const RECOVER_ACCURACY_DROP = 0.02;
/** While fatigued: rounds are this much easier, and stats from them count this much. */
export const FATIGUE_EASE = 0.15;
export const TIRED_WEIGHT = 0.5;

/** Phase 3: hesitation. A press is a hesitation when its interval exceeds max(HESITATION_MIN_MS, HESITATION_FACTOR x the key's average). */
export const HESITATION_MIN_MS = 350;
export const HESITATION_FACTOR = 2.2;
/** The key needs this many timed samples before hesitations are judged. */
export const HESITATION_MIN_SAMPLES = 5;
/** Score bonus = min(HESITATION_SCORE_CAP, rate x HESITATION_SCORE_SCALE), once there are CONFIDENT_SAMPLES judgments. */
export const HESITATION_SCORE_SCALE = 4;
export const HESITATION_SCORE_CAP = 1;
/** A key is "hesitant" in detail views above this rate. */
export const HESITANT_RATE = 0.15;

/** Phase 3: error bias (moving average weight) and how much it boosts drills. */
export const BIAS_WEIGHT = 0.2;
export const DOUBLE_BIAS_MIN = 0.15;
export const CONFUSION_MIN = 3;
export const CONFUSION_BONUS = 0.5;
export const MAX_MISSED_WORDS = 200;

/** Phase 3: spaced repetition. */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30] as const;
export const DAY_MS = 24 * 60 * 60 * 1000;
/** A missed item comes back this many rounds later in the same session. */
export const REVIEW_SESSION_GAP = 2;
/** Keys and pairs with weakness at or above this (and REVIEW_MIN_SAMPLES this round) join the schedule. */
export const REVIEW_WEAKNESS = 1;
export const REVIEW_MIN_SAMPLES = 3;
export const REVIEW_PAIR_MIN_SAMPLES = 2;
/** Due keys and pairs get this score bonus; up to REVIEW_WORDS due words go into each batch. */
export const REVIEW_BONUS = 1;
export const REVIEW_WORDS = 3;

/** Phase 3: warm-up. */
export const WARMUP_SECONDS = 20;
export const WARMUP_KEYS = 3;
export const WARMUP_PAIRS = 2;
export const WARMUP_BONUS = 2;

/** Phase 3: rhythm. Stalls are intervals over STALL_FACTOR x the round's median. */
export const RHYTHM_MIN_INTERVALS = 5;
export const STALL_FACTOR = 2;

/** Phase 3: touch grip and drift. */
export const GRIP_MIN_SAMPLES = 20;
export const GRIP_TWO_RATIO = 0.9;
export const GRIP_ONE_RATIO = 1.1;
export const DRIFT_MIN_TAPS = 10;
export const DRIFT_THRESHOLD = 0.22;
export const DRIFT_BONUS = 0.5;

/** Phase 3: made-up words. Phonotactics come from the first PHONOTACTIC_WORDS words of the pack. */
export const PHONOTACTIC_WORDS = 5000;
export const PHONOTACTIC_TOP = 40;
export const MADE_UP_MAX_SYLLABLES = 3;
export const MADE_UP_LONG_MAX = 8;
export const DEFAULT_MADE_UP_CAP = 0.8;

/** Phase 4: arcade. Arcade keystrokes count this much toward stats. */
export const ARCADE_WEIGHT = 0.5;
export const WORDS_PER_LEVEL = 10;
export const BOSS_EVERY = 5;
/** Seconds for a word to fall the whole way at level 1, and the fastest it gets. */
export const FALL_SECONDS_START = 9;
export const FALL_SECONDS_MIN = 2.5;
/** Seconds between new words at level 1, and the shortest gap. */
export const SPAWN_SECONDS_START = 2.4;
export const SPAWN_SECONDS_MIN = 0.7;
/** Each level multiplies fall and spawn times by this (falling words; survival climbs faster). */
export const FALLING_SPEEDUP = 0.92;
export const SURVIVAL_SPEEDUP = 0.88;
export const MAX_ON_SCREEN = 6;
/** On touch, words fall this much slower (times are divided by it). */
export const TOUCH_SPEED_FACTOR = 0.75;
export const START_LIVES = 3;
/** Three errors in a row cost a life. */
export const ERROR_RUN_FOR_LIFE = 3;
export const HEALTH_PER_ERROR = 0.05;
export const HEALTH_PER_LANDED = 0.2;
export const HEALTH_PER_CLEAN_WORD = 0.02;
export const BOSS_HP = 10;
export const BOSS_SECONDS = 60;
export const BOSS_FALL_SECONDS = 12;
export const BOSS_PHASE2_SPEED = 1.5;
export const BOSS_HEAL_PER_ERROR = 0.5;
export const BOSS_DEFEAT_BONUS = 500;
export const BOSS_MIN_LENGTH = 5;
export const POWERUP_EVERY = 8;
export const POWERUP_MIN_LENGTH = 4;
export const SLOW_SECONDS = 5;
export const SLOW_FACTOR = 0.5;
export const DOUBLE_SECONDS = 8;
export const POINTS_PER_CHAR = 10;
export const COMBO_STEP = 5;
export const COMBO_BONUS = 0.5;
export const COMBO_MAX_MULTIPLIER = 4;
export const WEAK_WORD_BONUS = 0.5;
export const WEAK_KEYS_FOR_BONUS = 3;
export const MAX_SCORES = 10;
export const ARCADE_MAX_WORD_LENGTH = 10;

/** Phase 4: races. */
export const RIVAL_AHEAD = 1.05;
export const RUBBER_BAND_CHARS = 15;
export const RUBBER_BAND_STRENGTH = 0.3;
/** Before this many seconds, "just ahead" paces off your recent average instead of your live speed. */
export const RIVAL_WARMUP_SECONDS = 3;
export const RACE_WORDS = 30;

/** Phase 4: nemesis. */
export const NEMESIS_MIN_SAMPLES = 20;
export const NEMESIS_MIN_WEAKNESS = 1;
export const NEMESIS_DEFEAT_WEAKNESS = 0.3;

/** Phase 5: key creatures. Stages need this many first-attempt samples. */
export const CREATURE_BABY_SAMPLES = 15;
export const CREATURE_GROWN_SAMPLES = 40;
/** Grown: weakness at most this (the same bar as defeating a nemesis). */
export const CREATURE_GROWN_WEAKNESS = 0.3;
export const CREATURE_LEGENDARY_SAMPLES = 150;
/** Legendary: average time at most this share of the goal time, and error rate at most CREATURE_LEGENDARY_ERRORS. */
export const CREATURE_LEGENDARY_SPEED = 0.8;
export const CREATURE_LEGENDARY_ERRORS = 0.02;
/** Health: full at weakness CREATURE_GROWN_WEAKNESS or less, zero skill at CREATURE_SICK_WEAKNESS. */
export const CREATURE_SICK_WEAKNESS = 2;
/** Health: no decay for this many days without practice, then down to CREATURE_MIN_RECENCY over CREATURE_DECAY_DAYS more. */
export const CREATURE_GRACE_DAYS = 7;
export const CREATURE_DECAY_DAYS = 30;
export const CREATURE_MIN_RECENCY = 0.5;
export const CREATURE_MIN_HEALTH = 0.05;

/** Phase 5: forecasts. */
export const KEY_DAYS_KEPT = 30;
/** Only data from the last this-many days counts. */
export const FORECAST_WINDOW_DAYS = 30;
/** Fewer days with data than this: no forecast. */
export const FORECAST_MIN_DAYS = 3;
/** A single estimate needs this many days with data and a slope error at most FORECAST_ESTIMATE_SPREAD of the slope. */
export const FORECAST_ESTIMATE_DAYS = 7;
export const FORECAST_ESTIMATE_SPREAD = 0.35;
/** Forecasts further out than this are shown as none. */
export const FORECAST_MAX_DAYS = 365;
/** A key's day counts toward a forecast with at least this many timed samples. */
export const FORECAST_KEY_MIN_TIMED = 3;

/** Phase 5: replays. */
export const REPLAYS_RECENT = 5;
export const REPLAYS_BEST = 3;

/** Phase 5: daily challenge. */
export const DAILY_WORDS = 30;
/** Words are drawn from this many of the most common words in the pack. */
export const DAILY_POOL = 3000;
export const DAILY_MIN_LENGTH = 2;
export const DAILY_MAX_LENGTH = 10;
export const DAILY_SENTENCE_MIN = 5;
export const DAILY_SENTENCE_MAX = 9;
export const DAILY_COMMA_CHANCE = 0.12;
export const DAILY_KEPT = 400;

/** Phase 5: fingerprint card traits. */
export const TRAIT_STEADY = 0.55;
export const TRAIT_BURSTY = 0.4;
export const TRAIT_PRECISE = 0.97;
export const TRAIT_DARING = 0.9;
export const TRAIT_FIXER = 0.8;
export const TRAIT_PRESSES_ON = 0.3;
export const FINGERPRINT_MIN_SAMPLES = 20;

/** Phase 6: your own words. Words kept from pasted text, and their length range. */
export const CUSTOM_MAX_WORDS = 5000;
export const CUSTOM_MIN_LENGTH = 2;
export const CUSTOM_MAX_LENGTH = 20;

/** Phase 6: passages (code and quotes). Recently typed passages sit out for this many picks. */
export const PASSAGE_RECENT = 8;
/** A non-letter character's score in a passage is its weakness (against the modifier goal), capped here. */
export const PASSAGE_CHAR_CAP = 2;
export const PASSAGE_BASE_WEIGHT = 0.2;
