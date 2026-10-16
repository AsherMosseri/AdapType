// Shared data types. These are the shapes the engine spec describes and that
// the Swift and Kotlin ports mirror.
import type { LayoutId } from "./layouts";

export type InputProfile = "physical" | "touch";
export type UnlockOrder = "frequency" | "homeRow";
/** backspace: fix errors yourself. block: wrong keys don't advance. skip: errors stay, keep going. */
export type ErrorMode = "backspace" | "block" | "skip";
export type RoundType =
  | { kind: "words"; count: number }
  | { kind: "timed"; seconds: number }
  | { kind: "endless" };

export interface Goal {
  wpm: number;
  /** 0..1, e.g. 0.95 */
  accuracy: number;
}

/** Where a tap landed relative to the key's center, in key widths and heights. */
export interface TapPoint {
  dx: number;
  dy: number;
}

export interface TypingEvent {
  kind: "char" | "backspace";
  /** The character produced, for kind "char". */
  char?: string;
  /** Milliseconds, from any monotonic clock. */
  t: number;
  /** Touch only: where the tap landed on the key. */
  tap?: TapPoint;
  /** Physical only: which Shift key was held, if any. */
  shift?: "left" | "right";
  /** Touch only: true if the character needed a switch to the number or symbol layer. */
  layer?: boolean;
}

export interface KeystrokeRecord {
  /** Position in the target text. */
  index: number;
  expected: string;
  actual: string;
  t: number;
  correct: boolean;
  /** True for the first keystroke ever made at this position. */
  first: boolean;
  /**
   * Milliseconds since the previous keystroke, only when that keystroke was a
   * correct first attempt at the previous position and the gap is at most
   * MAX_INTERVAL_MS. Otherwise null.
   */
  interval: number | null;
  tap?: TapPoint;
  shift?: "left" | "right";
  layer?: boolean;
}

/** Running statistics for one key or one letter pair. */
export interface StatEntry {
  /** Number of first-attempt samples. */
  n: number;
  /** Number of samples that had a usable interval. */
  timedN: number;
  /** Moving average of the interval, in ms. */
  msAvg: number;
  /** Moving average of errors (1 = error, 0 = correct). */
  errAvg: number;
}

/** How one key did in one round. Kept per key for mastery checks. */
export interface KeyRoundEntry {
  n: number;
  correct: number;
  msTotal: number;
  msN: number;
}

export interface RoundSummary {
  /** Wall-clock time the round ended (ms since epoch). */
  at: number;
  wpm: number;
  accuracy: number;
  durationMs: number;
  chars: number;
  corrections: number;
  calibration: boolean;
  /** Phase 3: rhythm consistency 0..1, or null with too few timed keystrokes. */
  consistency?: number | null;
  /** Phase 3: first-attempt errors (corrections / firstErrors is the self-correction rate). */
  firstErrors?: number;
  /** Phase 3: a warm-up round. */
  warmup?: boolean;
}

export type CalibrationStatus =
  /** Not decided yet (first launch). */
  | "none"
  /** Took the test. */
  | "done"
  /** Skipped the test: the first rounds use all letters and calibrate silently. */
  | "silent";

export type ModifierId = "caps" | "punct" | "numbers" | "symbols" | "accents" | "extra";
/** Everything that unlocks after the letters: the modifiers plus the shortcut drill. */
export type UnlockableId = ModifierId | "shortcuts";
/** Frequency level: a range of the share of words that get the modifier. */
export type ModifierLevel = "low" | "medium" | "high" | "auto";
/** unlock: on once unlocked. on: on now (unlocked early). off: never. */
export type ModifierMode = "unlock" | "on" | "off";

export interface ModifierSettings {
  modes: Record<UnlockableId, ModifierMode>;
  levels: Record<ModifierId, ModifierLevel>;
  /** first: capitalize first letters. any: capitalize a random letter. */
  caps: "first" | "any";
  /** sentence: sentences with capitals and periods. random: any punctuation on any word. */
  punct: "sentence" | "random";
}

/** Which special characters the player's device can type. */
export interface Platform {
  /** Extra characters available (already filtered for the OS or touch layout and the curated/full setting). */
  extra: readonly string[];
  /** Whether accented letters can be typed. */
  accents: boolean;
}

export interface ExtraChar {
  place: string;
  curated: number;
  name: string;
  close?: string;
  mac?: string;
  windowsIntl?: string;
  altCode?: string;
}

export interface CharacterData {
  punctuation: readonly string[];
  symbols: readonly string[];
  accents: Record<string, { mac?: string; windowsIntl?: string; altCode?: string }>;
  extra: Record<string, ExtraChar>;
  loanwords: readonly string[];
}

export type Grip = "one" | "two";
export type ErrorType = "swap" | "missed-double" | "double" | "skipped" | "neighbor" | "case" | "other";
export type BiasType = "swap" | "double" | "neighbor";

/** A key, letter pair or word on the spaced-repetition schedule. */
export interface ReviewItem {
  kind: "key" | "pair" | "word";
  target: string;
  /** Index into REVIEW_INTERVALS_DAYS. */
  step: number;
  /** When it's next due across days (ms since epoch). */
  due: number;
  /** Session round after which it's due again within the session, or null. */
  sessionRound: number | null;
  lapses: number;
}

export interface SessionState {
  id: number;
  startedAt: number;
  lastAt: number;
  /** Rounds completed in this session. */
  rounds: number;
  /** WPM and accuracy of each round this session (most recent last, capped). */
  history: { wpm: number; accuracy: number }[];
  /** Average of the first rounds, the yardstick for fatigue. */
  baseline: { wpm: number; accuracy: number } | null;
  fatigued: boolean;
  /** Touch only: the grip picked for this session. */
  grip: Grip | null;
  warmupDone: boolean;
  /** Touch: interval sums for keys typed with the same thumb vs alternating thumbs. */
  gripSignal: { sameMs: number; sameN: number; crossMs: number; crossN: number };
}

export type ArcadeMode = "falling" | "survival" | "ghost" | "rival";
export type LivesMode = "lives" | "health" | "hardcore";
export type PowerUpKind = "slow" | "clear" | "shield" | "double";

export interface ScoreEntry {
  score: number;
  level: number;
  words: number;
  wpm: number;
  accuracy: number;
  at: number;
  /** Survival: which lives setting the game used. */
  lives?: LivesMode;
}

export interface Nemesis {
  key: string;
  name: string;
  since: number;
}

export interface DefeatedNemesis extends Nemesis {
  defeatedAt: number;
}

/** Your best run on a ghost-race text: when each character was typed, in ms from the first keystroke. */
export interface GhostRun {
  target: string;
  times: number[];
  wpm: number;
  at: number;
}

export interface ArcadeState {
  scores: Partial<Record<ArcadeMode, ScoreEntry[]>>;
  ghost: GhostRun | null;
  nemesis: Nemesis | null;
  hall: DefeatedNemesis[];
  games: number;
}

/** Phase 7: badges earned (id → when) and the counters behind them. */
export interface AchievementState {
  earned: Record<string, number>;
  counters: Record<string, number>;
  /** Progress from before achievements existed has been counted (spec 38). */
  backfilled: boolean;
}

/** Phase 7: the numbers and symbols course. */
export interface CourseState {
  /** Per-round results for course keys, from course rounds and drills (like keyHistory). */
  history: Record<string, KeyRoundEntry[]>;
  /** Course keys that reached mastery, in order. Mastery is permanent. */
  mastered: string[];
  /** The whole path is done. */
  finished: boolean;
}

export interface ProfileState {
  version: 9;
  profile: InputProfile;
  goal: Goal | null;
  calibration: CalibrationStatus;
  silentRoundsLeft: number;
  unlockOrder: UnlockOrder;
  /** Unlocked letters, in the order they were unlocked. */
  unlocked: string[];
  /** Letters that have reached mastery at least once. Mastery is permanent. */
  mastered: string[];
  keys: Record<string, StatEntry>;
  pairs: Record<string, StatEntry>;
  keyHistory: Record<string, KeyRoundEntry[]>;
  rounds: RoundSummary[];
  roundCounter: number;
  seed: number;
  /** Touch only: recent tap positions per key. */
  taps: Record<string, TapPoint[]>;
  /** 0..1. Rises when you're at your goal, falls when you're struggling. */
  difficulty: number;
  /** Modifiers and the shortcut drill unlocked so far, in order. */
  modsUnlocked: UnlockableId[];
  /** Modifiers that have reached mastery. */
  modsMastered: ModifierId[];
  /** Phase 3. Spaced-repetition schedule, keyed "key:o", "pair:th", "word:because". */
  reviews: Record<string, ReviewItem>;
  /** Hesitation rate per key (errAvg = share of presses that were hesitations). */
  hesitations: Record<string, StatEntry>;
  /** Error type counts per expected key. */
  errorCounts: Record<string, Partial<Record<ErrorType, number>>>;
  /** What was typed instead, per expected key. */
  typos: Record<string, Record<string, number>>;
  /** Neighbor-key confusions, keyed by the two letters in alphabetical order ("rt"). */
  confusions: Record<string, number>;
  /** Recent share of errors that are swaps, double-letter slips and neighbor hits. */
  errorBias: Record<BiasType, number>;
  /** Real words with a first-attempt error, and how often. */
  missedWords: Record<string, number>;
  session: SessionState | null;
  /** Physical only: answer to "Do you touch-type?", null until asked. */
  touchTyping: boolean | null;
  /** Touch only: key stats and taps per grip. */
  gripKeys: Partial<Record<Grip, Record<string, StatEntry>>>;
  gripTaps: Partial<Record<Grip, Record<string, TapPoint[]>>>;
  /** Phase 4: high scores, the ghost run, the nemesis and the hall of defeated. */
  arcade: ArcadeState;
  /** Phase 5: per-key results by day, newest last, for forecasts and creature health. */
  keyDays: Record<string, DayEntry[]>;
  /** Phase 5: the highest stage each key's creature has reached. */
  creatures: Record<string, CreatureRecord>;
  /** Phase 5: recent runs and personal bests, for slow-motion replay. */
  replays: ReplayStore;
  /** Phase 5: daily challenge results by date (YYYY-MM-DD); only the first attempt is kept. */
  daily: Record<string, DailyResult>;
  /** Phase 6: passages (code and quotes) typed lately, newest last, so they don't repeat right away. */
  recentPassages: string[];
  /** Phase 6: the keyboard layout these stats belong to (each layout keeps its own profile). */
  layout: LayoutId;
  /** Phase 7: badges and their counters. */
  achievements: AchievementState;
  /** Phase 7: the numbers and symbols course. */
  course: CourseState;
}

/**
 * One key's results on one day: [day, samples, correct, msTotal, msN], where
 * day = floor(ms since epoch / DAY_MS). Stored as a tuple to keep saves small.
 */
export type DayEntry = [day: number, n: number, correct: number, msTotal: number, msN: number];

/** 0 egg, 1 baby, 2 grown, 3 legendary. */
export type CreatureStage = 0 | 1 | 2 | 3;

export interface CreatureRecord {
  stage: CreatureStage;
  /** When it reached that stage. */
  at: number;
}

/** A recorded run: every keystroke as [ms after the first keystroke, character or "\b" for backspace]. */
export interface ReplayRun {
  at: number;
  target: string;
  errorMode: ErrorMode;
  /** Recorded with block mode's catching up (spec 2.1). Older block-mode runs replay without it. */
  catchUp?: boolean;
  events: [number, string][];
  wpm: number;
  accuracy: number;
  source: "practice" | "daily";
}

export interface ReplayStore {
  /** Newest last. */
  recent: ReplayRun[];
  /** Best first, by wpm x accuracy. */
  best: ReplayRun[];
}

export interface DailyResult {
  wpm: number;
  accuracy: number;
  at: number;
  /** One letter per word: g clean, y corrected, r left wrong. */
  marks: string;
}

export interface RoundWord {
  text: string;
  madeUp: boolean;
}

export interface WordPack {
  /** Words, most common first. A word's index is its rank. */
  words: readonly string[];
  /** Pack id and version; the daily challenge's text depends on both. */
  id?: string;
  version?: number;
}

export interface Blocklist {
  words: readonly string[];
  roots: readonly string[];
}
