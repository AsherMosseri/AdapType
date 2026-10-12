// Shared data types. These are the shapes the engine spec describes and that
// the Swift and Kotlin ports mirror.

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
}

export type CalibrationStatus =
  /** Not decided yet (first launch). */
  | "none"
  /** Took the test. */
  | "done"
  /** Skipped the test: the first rounds use all letters and calibrate silently. */
  | "silent";

export interface ProfileState {
  version: 1;
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
}

export interface RoundWord {
  text: string;
  madeUp: boolean;
}

export interface WordPack {
  /** Words, most common first. A word's index is its rank. */
  words: readonly string[];
}

export interface Blocklist {
  words: readonly string[];
  roots: readonly string[];
}
