import {
  MASTERY_MIN_SAMPLES,
  MASTERY_ROUNDS,
  MAX_ROUNDS_KEPT,
  MAX_TAPS_PER_KEY,
  RECENT_ROUNDS,
  SILENT_CALIBRATION_ROUNDS,
  START_LETTERS,
  TEST_OUT_MIN_SAMPLES,
  TEST_OUT_MIN_TIMED,
  UNLOCK_ORDERS,
} from "./constants";
import { calibrationWords, generateWords } from "./generate";
import { deriveSeed, Rng } from "./rng";
import { computeScores } from "./scoring";
import { appendHistory, applyRecords, isLetter } from "./stats";
import { wpmToMs, type TypingRound } from "./typing";
import type {
  Blocklist,
  Goal,
  InputProfile,
  KeyRoundEntry,
  ProfileState,
  RoundSummary,
  RoundWord,
  UnlockOrder,
  WordPack,
} from "./types";

/** Placeholder goal used for scoring before the player sets one. */
export const DEFAULT_GOAL: Goal = { wpm: 40, accuracy: 0.95 };

export function createProfile(profile: InputProfile, seed: number, order: UnlockOrder = "frequency"): ProfileState {
  return {
    version: 1,
    profile,
    goal: null,
    calibration: "none",
    silentRoundsLeft: 0,
    unlockOrder: order,
    unlocked: UNLOCK_ORDERS[order].slice(0, START_LETTERS).split(""),
    mastered: [],
    keys: {},
    pairs: {},
    keyHistory: {},
    rounds: [],
    roundCounter: 0,
    seed: seed >>> 0,
    taps: {},
  };
}

/** Whether a letter meets the mastery bar over its recent rounds. */
export function meetsMastery(history: readonly KeyRoundEntry[] | undefined, goal: Goal): boolean {
  if (!history || history.length < MASTERY_ROUNDS) return false;
  const recent = history.slice(-MASTERY_ROUNDS);
  let n = 0;
  let correct = 0;
  let msTotal = 0;
  let msN = 0;
  for (const e of recent) {
    n += e.n;
    correct += e.correct;
    msTotal += e.msTotal;
    msN += e.msN;
  }
  if (n < MASTERY_MIN_SAMPLES || msN === 0) return false;
  return correct / n >= goal.accuracy && msTotal / msN <= wpmToMs(goal.wpm);
}

/** Progress toward mastery, 0..1, for display. Takes the weaker of speed and accuracy. */
export function masteryProgress(history: readonly KeyRoundEntry[] | undefined, goal: Goal): number {
  if (!history || history.length === 0) return 0;
  const recent = history.slice(-MASTERY_ROUNDS);
  let n = 0;
  let correct = 0;
  let msTotal = 0;
  let msN = 0;
  for (const e of recent) {
    n += e.n;
    correct += e.correct;
    msTotal += e.msTotal;
    msN += e.msN;
  }
  if (n === 0) return 0;
  const accuracy = Math.min(1, correct / n / goal.accuracy);
  const speed = msN > 0 ? Math.min(1, wpmToMs(goal.wpm) / (msTotal / msN)) : 0;
  const coverage = Math.min(1, recent.length / MASTERY_ROUNDS, n / MASTERY_MIN_SAMPLES);
  return Math.min(accuracy, speed) * coverage;
}

/** The next letter in the unlock order that isn't unlocked yet. */
export function nextLetter(state: ProfileState): string | null {
  for (const letter of UNLOCK_ORDERS[state.unlockOrder]) {
    if (!state.unlocked.includes(letter)) return letter;
  }
  return null;
}

export interface UnlockResult {
  newlyMastered: string[];
  newlyUnlocked: string | null;
}

/**
 * Marks letters that meet mastery as mastered, then unlocks the next letter
 * if every unlocked letter is mastered. At most one letter unlocks per call.
 */
export function updateUnlocks(state: ProfileState): UnlockResult {
  const goal = state.goal ?? DEFAULT_GOAL;
  const newlyMastered: string[] = [];
  for (const letter of state.unlocked) {
    if (!state.mastered.includes(letter) && meetsMastery(state.keyHistory[letter], goal)) {
      state.mastered.push(letter);
      newlyMastered.push(letter);
    }
  }
  let newlyUnlocked: string | null = null;
  if (state.calibration !== "silent" && state.unlocked.every((l) => state.mastered.includes(l))) {
    newlyUnlocked = nextLetter(state);
    if (newlyUnlocked) state.unlocked.push(newlyUnlocked);
  }
  return { newlyMastered, newlyUnlocked };
}

/** Whether calibration data shows a letter is already at goal. */
export function testsOut(state: ProfileState, letter: string, goal: Goal): boolean {
  const s = state.keys[letter];
  if (!s || s.n < TEST_OUT_MIN_SAMPLES || s.timedN < TEST_OUT_MIN_TIMED) return false;
  return 1 - s.errAvg >= goal.accuracy && s.msAvg <= wpmToMs(goal.wpm);
}

/**
 * Applies calibration: every letter that tests out is unlocked and mastered;
 * the first START_LETTERS of the order are always unlocked. Unlocked letters
 * keep the unlock order. Then the normal unlock check runs once.
 */
export function applyTestOut(state: ProfileState): string[] {
  const goal = state.goal ?? DEFAULT_GOAL;
  const order = UNLOCK_ORDERS[state.unlockOrder];
  const testedOut: string[] = [];
  const unlocked: string[] = [];
  for (let i = 0; i < order.length; i++) {
    const letter = order[i];
    const passes = testsOut(state, letter, goal);
    if (passes) testedOut.push(letter);
    if (passes || i < START_LETTERS || state.unlocked.includes(letter)) unlocked.push(letter);
  }
  state.unlocked = unlocked;
  for (const letter of testedOut) if (!state.mastered.includes(letter)) state.mastered.push(letter);
  updateUnlocks(state);
  return testedOut;
}

/**
 * Switches unlock order. Mastered letters stay unlocked; the start letters of
 * the new order are added; everything else locks again.
 */
export function setUnlockOrder(state: ProfileState, order: UnlockOrder): void {
  state.unlockOrder = order;
  const sequence = UNLOCK_ORDERS[order];
  state.unlocked = sequence
    .split("")
    .filter((l, i) => i < START_LETTERS || state.mastered.includes(l));
  updateUnlocks(state);
}

/** Whether the next round should use all letters to calibrate silently. */
export function isCalibrating(state: ProfileState): boolean {
  return state.calibration === "silent" && state.silentRoundsLeft > 0;
}

export function skipCalibration(state: ProfileState): void {
  state.calibration = "silent";
  state.silentRoundsLeft = SILENT_CALIBRATION_ROUNDS;
}

export interface PlanOptions {
  pack: WordPack;
  blocklist: Blocklist;
  count: number;
  /** Which chunk of the round this is (0 for the first). Timed and endless rounds ask for more chunks. */
  chunk?: number;
  previous?: string;
  /** Force a calibration test round. */
  calibrationTest?: boolean;
}

/**
 * Words for the next round. The seed is derived from the profile seed, the
 * round counter and the chunk, so planning is reproducible.
 */
export function planWords(state: ProfileState, options: PlanOptions): RoundWord[] {
  const rng = new Rng(deriveSeed(state.seed, state.roundCounter, options.chunk ?? 0));
  if (options.calibrationTest || isCalibrating(state)) {
    return calibrationWords(options.pack, options.count, rng);
  }
  const scores = computeScores(state, state.goal ?? DEFAULT_GOAL);
  return generateWords({
    pack: options.pack,
    blocklist: options.blocklist,
    letters: state.unlocked,
    scores,
    count: options.count,
    rng,
    previous: options.previous,
  });
}

export interface RoundOutcome extends UnlockResult {
  summary: RoundSummary;
  perKey: Record<string, KeyRoundEntry>;
  /** Letters tested out by this round, when it completed calibration. */
  testedOut: string[];
}

/**
 * Records a finished round: updates stats, history, taps, unlocks and the
 * round counter. Rounds with no keystrokes are ignored except for advancing
 * the counter.
 */
export function completeRound(
  state: ProfileState,
  round: TypingRound,
  at: number,
  options: { calibrationTest?: boolean } = {},
): RoundOutcome {
  const metrics = round.metrics();
  const calibration = !!options.calibrationTest || isCalibrating(state);
  const { perKey } = applyRecords(round.target, round.records, state.keys, state.pairs);
  const letterKeys: Record<string, KeyRoundEntry> = {};
  for (const key of Object.keys(perKey)) if (isLetter(key)) letterKeys[key] = perKey[key];
  appendHistory(state.keyHistory, letterKeys);

  for (const r of round.records) {
    if (!r.tap) continue;
    const list = (state.taps[r.expected] ??= []);
    list.push(r.tap);
    if (list.length > MAX_TAPS_PER_KEY) list.splice(0, list.length - MAX_TAPS_PER_KEY);
  }

  const summary: RoundSummary = {
    at,
    wpm: metrics.wpm,
    accuracy: metrics.accuracy,
    durationMs: metrics.elapsedMs,
    chars: metrics.correctChars,
    corrections: metrics.corrections,
    calibration,
  };
  if (metrics.keystrokes > 0) {
    state.rounds.push(summary);
    if (state.rounds.length > MAX_ROUNDS_KEPT) state.rounds.splice(0, state.rounds.length - MAX_ROUNDS_KEPT);
  }
  state.roundCounter += 1;

  let testedOut: string[] = [];
  let result: UnlockResult = { newlyMastered: [], newlyUnlocked: null };
  if (options.calibrationTest) {
    // The test only measures; test-out runs once the goal is chosen.
  } else if (isCalibrating(state)) {
    if (metrics.keystrokes > 0) state.silentRoundsLeft -= 1;
    if (state.silentRoundsLeft <= 0) {
      state.calibration = "done";
      testedOut = applyTestOut(state);
    }
  } else {
    result = updateUnlocks(state);
  }
  return { ...result, summary, perKey, testedOut };
}

/** Average WPM and accuracy over recent non-calibration rounds, or null with none. */
export function recentAverage(state: ProfileState, skipLast = 0): { wpm: number; accuracy: number } | null {
  const rounds = state.rounds.filter((r) => !r.calibration);
  const slice = rounds.slice(0, rounds.length - skipLast).slice(-RECENT_ROUNDS);
  if (slice.length === 0) return null;
  let wpm = 0;
  let accuracy = 0;
  for (const r of slice) {
    wpm += r.wpm;
    accuracy += r.accuracy;
  }
  return { wpm: wpm / slice.length, accuracy: accuracy / slice.length };
}

/** Suggested goal after calibration: 20% above measured speed, rounded to 5, between 15 and 150. */
export function suggestGoalWpm(measuredWpm: number): number {
  const raw = Math.round((measuredWpm * 1.2) / 5) * 5;
  return Math.min(150, Math.max(15, raw));
}

/** Sets the goal after the calibration test and unlocks what the test showed you already know. */
export function finishCalibrationTest(state: ProfileState, goal: Goal): string[] {
  state.goal = goal;
  state.calibration = "done";
  state.silentRoundsLeft = 0;
  return applyTestOut(state);
}
