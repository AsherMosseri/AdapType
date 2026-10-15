import {
  CONFUSION_BONUS,
  CONFUSION_MIN,
  DIFFICULTY_START,
  DOUBLE_BIAS_MIN,
  FATIGUE_EASE,
  FOCUS_KEY_MIN_SCORE,
  FOCUS_PAIR_MIN_SCORE,
  HESITATION_FACTOR,
  HESITATION_MIN_MS,
  HESITATION_MIN_SAMPLES,
  REVIEW_WORDS,
  TIRED_WEIGHT,
  WARMUP_BONUS,
  WARMUP_KEYS,
  WARMUP_PAIRS,
  MASTERY_MIN_SAMPLES,
  MODIFIER_STAGES,
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
import { difficultyParams, updateDifficulty } from "./difficulty";
import { applyErrorAnalysis, type ErrorRoundSummary } from "./errors";
import { explainRound, type RoundExplanation } from "./explain";
import { calibrationWords, generateWords, wordPool } from "./generate";
import {
  activeModifiers,
  applyModifiers,
  capRates,
  modifierGoal,
  modifierMastered,
  modifierRate,
  modKey,
} from "./modifiers";
import { dueItems, updateReviews, wordOutcomes, type ReviewChanges } from "./reviews";
import { rhythm, type Rhythm } from "./rhythm";
import { deriveSeed, Rng } from "./rng";
import { clamp, computeScores, weakness, type Scores } from "./scoring";
import { addGripSignal, recordSessionRound, suggestGrip, type FatigueChange } from "./session";
import { KEY_LAYOUTS, type LayoutId } from "./layouts";
import { addSample, appendHistory, applyRecords, emptyStat, isLetter, recordKeyDays } from "./stats";
import { wpmToMs, type TypingRound } from "./typing";
import type {
  ArcadeState,
  Blocklist,
  CharacterData,
  Goal,
  InputProfile,
  Grip,
  KeyRoundEntry,
  ModifierId,
  ModifierSettings,
  Platform,
  ProfileState,
  RoundSummary,
  RoundWord,
  UnlockableId,
  UnlockOrder,
  WordPack,
} from "./types";

/** Placeholder goal used for scoring before the player sets one. */
export const DEFAULT_GOAL: Goal = { wpm: 40, accuracy: 0.95 };

export function createProfile(profile: InputProfile, seed: number, order: UnlockOrder = "frequency", layout: LayoutId = "qwerty"): ProfileState {
  return {
    version: 7,
    profile,
    goal: null,
    calibration: "none",
    silentRoundsLeft: 0,
    unlockOrder: order,
    unlocked: unlockSequence(order, layout).slice(0, START_LETTERS).split(""),
    mastered: [],
    keys: {},
    pairs: {},
    keyHistory: {},
    rounds: [],
    roundCounter: 0,
    seed: seed >>> 0,
    taps: {},
    difficulty: DIFFICULTY_START,
    modsUnlocked: [],
    modsMastered: [],
    ...phase3Defaults(),
    arcade: emptyArcade(),
    ...phase5Defaults(),
    recentPassages: [],
    layout,
  };
}

/** The letters in unlock order: by frequency (the same on every layout), or the layout's home row first. */
export function unlockSequence(order: UnlockOrder, layout: LayoutId = "qwerty"): string {
  return order === "homeRow" ? KEY_LAYOUTS[layout].homeRow : UNLOCK_ORDERS.frequency;
}

function phase5Defaults() {
  return { keyDays: {}, creatures: {}, replays: { recent: [], best: [] }, daily: {} };
}

export function emptyArcade(): ArcadeState {
  return { scores: {}, ghost: null, nemesis: null, hall: [], games: 0 };
}

function phase3Defaults() {
  return {
    reviews: {},
    hesitations: {},
    errorCounts: {},
    typos: {},
    confusions: {},
    errorBias: { swap: 0, double: 0, neighbor: 0 },
    missedWords: {},
    session: null,
    touchTyping: null,
    gripKeys: {},
    gripTaps: {},
  };
}

/**
 * Upgrades a saved profile to the current version. 1 → 2 adds difficulty and
 * modifier unlocks; 2 → 3 adds reviews, hesitations, error analysis,
 * sessions, the touch-typing answer and per-grip stats; 3 → 4 adds the arcade
 * (scores, ghost run, nemesis, hall of defeated); 4 → 5 adds key days,
 * creatures, replays and daily results (creatures fill in on the next
 * updateCreatures call); 5 → 6 adds recent passages; 6 → 7 adds the
 * keyboard layout (QWERTY for existing profiles).
 */
export function migrateProfile(saved: Record<string, unknown>): ProfileState {
  let p = { ...saved } as Record<string, unknown>;
  if (p.version === 1) {
    p.difficulty = DIFFICULTY_START;
    p.modsUnlocked = [];
    p.modsMastered = [];
    p.version = 2;
  }
  if (p.version === 2) {
    p = { ...p, ...phase3Defaults(), version: 3 };
  }
  if (p.version === 3) {
    p = { ...p, arcade: emptyArcade(), version: 4 };
  }
  if (p.version === 4) {
    p = { ...p, ...phase5Defaults(), version: 5 };
  }
  if (p.version === 5) {
    p = { ...p, recentPassages: [], version: 6 };
  }
  if (p.version === 6) {
    p = { ...p, layout: "qwerty", version: 7 };
  }
  return p as unknown as ProfileState;
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
  for (const letter of unlockSequence(state.unlockOrder, state.layout)) {
    if (!state.unlocked.includes(letter)) return letter;
  }
  return null;
}

export interface UnlockResult {
  newlyMastered: string[];
  newlyUnlocked: string | null;
  newlyMasteredMods: ModifierId[];
  newlyUnlockedMods: UnlockableId[];
}

/** The next stage of modifiers to unlock, or null when all are unlocked. */
export function nextModifierStage(state: ProfileState): readonly UnlockableId[] | null {
  for (const stage of MODIFIER_STAGES) {
    if (stage.some((id) => !state.modsUnlocked.includes(id))) return stage;
  }
  return null;
}

/**
 * Marks letters that meet mastery as mastered, then unlocks the next letter
 * if every unlocked letter is mastered. At most one letter unlocks per call.
 * Once all 26 letters are unlocked and mastered, the same happens for
 * modifiers: unlocked modifiers whose running stats meet modifier mastery are
 * marked mastered, and when every unlocked modifier is mastered the next
 * stage unlocks.
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
  const newlyMasteredMods: ModifierId[] = [];
  const newlyUnlockedMods: UnlockableId[] = [];
  const lettersDone = state.unlocked.every((l) => state.mastered.includes(l));
  if (state.calibration !== "silent" && lettersDone) {
    newlyUnlocked = nextLetter(state);
    if (newlyUnlocked) state.unlocked.push(newlyUnlocked);
  }
  if (state.calibration !== "silent" && lettersDone && !newlyUnlocked && nextLetter(state) === null) {
    for (const id of state.modsUnlocked) {
      if (id === "shortcuts" || state.modsMastered.includes(id)) continue;
      if (modifierMastered(state.keys[modKey(id)], goal)) {
        state.modsMastered.push(id);
        newlyMasteredMods.push(id);
      }
    }
    const allMastered = state.modsUnlocked.every((id) => id === "shortcuts" || state.modsMastered.includes(id));
    const stage = nextModifierStage(state);
    if (allMastered && stage) {
      for (const id of stage) {
        if (!state.modsUnlocked.includes(id)) {
          state.modsUnlocked.push(id);
          newlyUnlockedMods.push(id);
        }
      }
    }
  }
  return { newlyMastered, newlyUnlocked, newlyMasteredMods, newlyUnlockedMods };
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
  const order = unlockSequence(state.unlockOrder, state.layout);
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
  const sequence = unlockSequence(order, state.layout);
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

export interface ModifierOptions {
  settings: ModifierSettings;
  chars: CharacterData;
  platform: Platform;
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
  /** Modifier settings; without them, rounds are plain lowercase words. */
  modifiers?: ModifierOptions;
  /** Phase 3: current time, for spaced-repetition reviews. Without it, reviews are ignored. */
  now?: number;
  /** Phase 3: a warm-up round on recent trouble spots. */
  warmup?: boolean;
  /** Phase 3: the most of a round that may be made-up words. */
  madeUpCap?: number;
}

export interface RoundPlan {
  words: RoundWord[];
  /** Null for calibration rounds. */
  explanation: RoundExplanation | null;
}

/**
 * The next round's words and what it focuses on. The seed is derived from
 * the profile seed, the round counter and the chunk, so planning is
 * reproducible. Steps: pick base words (difficulty sets length, rarity and
 * intensity), then apply active modifiers with the same generator.
 */
export function planRound(state: ProfileState, options: PlanOptions): RoundPlan {
  const rng = new Rng(deriveSeed(state.seed, state.roundCounter, options.chunk ?? 0));
  if (options.calibrationTest || isCalibrating(state)) {
    return { words: calibrationWords(options.pack, options.count, rng), explanation: null };
  }
  const goal = state.goal ?? DEFAULT_GOAL;
  let scores = computeScores(state, goal, options.now);
  const targets = options.warmup ? warmupTargets(state, goal, options.now) : null;
  if (targets) scores = boostTargets(scores, targets);
  const fatigued = !!state.session?.fatigued;
  const params = difficultyParams(clamp(state.difficulty - (fatigued ? FATIGUE_EASE : 0), 0, 1));
  let words = generateWords({
    pack: options.pack,
    blocklist: options.blocklist,
    letters: state.unlocked,
    scores,
    count: options.count,
    rng,
    previous: options.previous,
    params,
    madeUpCap: options.madeUpCap,
    wordBonus: errorDrillBonus(state),
    pronounceable: true,
  });
  // Due review words go into the first batch at random places.
  const reviewWords: string[] = [];
  if ((options.chunk ?? 0) === 0 && options.now !== undefined) {
    const unlocked = new Set(state.unlocked);
    for (const item of dueItems(state, options.now, "word")) {
      if (reviewWords.length >= REVIEW_WORDS || reviewWords.length >= words.length) break;
      if (![...item.target].every((c) => unlocked.has(c))) continue;
      words[rng.int(words.length)] = { text: item.target, madeUp: false };
      reviewWords.push(item.target);
    }
  }
  const mods = options.modifiers;
  const rates = mods
    ? capRates(activeModifiers(state, mods.settings, mods.platform).map((id) => ({ id, rate: modifierRate(id, state, mods.settings, goal) })))
    : [];
  if (mods && rates.length > 0) {
    const pool = wordPool(options.pack, state.unlocked, params);
    const charGoal = modifierGoal(goal);
    words = applyModifiers(words, {
      rng,
      chars: mods.chars,
      settings: mods.settings,
      platform: mods.platform,
      rates,
      charScore: (ch) => weakness(state.keys[ch], charGoal),
      extraWord: () => (pool.length > 0 ? pool[rng.int(pool.length)].text : state.unlocked.slice(0, 3).join("")),
      previous: options.previous,
    });
  }
  return {
    words,
    explanation: explainRound(state, scores, words, rates, {
      warmup: targets ?? undefined,
      reviewWords: reviewWords.filter((w) => words.some((x) => x.text.toLowerCase().includes(w))),
      fatigued,
    }),
  };
}

export interface WarmupTargets {
  keys: string[];
  pairs: string[];
}

/**
 * Trouble spots for a warm-up: the WARMUP_KEYS highest-scoring letters with
 * score at least FOCUS_KEY_MIN_SCORE and the WARMUP_PAIRS highest pairs with
 * score at least FOCUS_PAIR_MIN_SCORE (ties: unlock order, then
 * alphabetical). Null when there are none.
 */
export function warmupTargets(state: ProfileState, goal: Goal, now?: number): WarmupTargets | null {
  const scores = computeScores(state, goal, now);
  const keys = state.unlocked
    .map((l, i) => ({ l, i, s: scores.keys[l] }))
    .filter((k) => k.s >= FOCUS_KEY_MIN_SCORE)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, WARMUP_KEYS)
    .map((k) => k.l);
  const pairs = Object.entries(scores.pairs)
    .filter(([, s]) => s >= FOCUS_PAIR_MIN_SCORE)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, WARMUP_PAIRS)
    .map(([p]) => p);
  return keys.length + pairs.length > 0 ? { keys, pairs } : null;
}

function boostTargets(scores: Scores, targets: WarmupTargets): Scores {
  const keys = { ...scores.keys };
  const pairs = { ...scores.pairs };
  for (const k of targets.keys) keys[k] += WARMUP_BONUS;
  for (const p of targets.pairs) pairs[p] += WARMUP_BONUS;
  return { keys, pairs };
}

/**
 * Error-type drills, as a multiplier on real words' weights: words with a
 * doubled letter get x(1 + double bias) when the double bias is at least
 * DOUBLE_BIAS_MIN; words containing both letters of one of the two most
 * frequent neighbor confusions (count at least CONFUSION_MIN) get
 * x(1 + CONFUSION_BONUS). Swaps are drilled through letter pairs instead.
 */
export function errorDrillBonus(state: ProfileState): ((text: string) => number) | undefined {
  const double = state.errorBias?.double ?? 0;
  const confusions = Object.entries(state.confusions ?? {})
    .filter(([, n]) => n >= CONFUSION_MIN)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 2)
    .map(([pair]) => pair);
  if (double < DOUBLE_BIAS_MIN && confusions.length === 0) return undefined;
  return (text) => {
    let bonus = 1;
    if (double >= DOUBLE_BIAS_MIN && /(.)\1/.test(text)) bonus *= 1 + double;
    if (confusions.some((pair) => text.includes(pair[0]) && text.includes(pair[1]))) bonus *= 1 + CONFUSION_BONUS;
    return bonus;
  };
}

/** Whether to offer a warm-up: a new session with past practice and trouble spots to work on. */
export function shouldWarmUp(state: ProfileState, now: number): boolean {
  const s = state.session;
  if (!s || s.rounds > 0 || s.warmupDone || isCalibrating(state) || state.calibration === "none") return false;
  if (state.rounds.filter((r) => !r.calibration).length < 3) return false;
  return warmupTargets(state, state.goal ?? DEFAULT_GOAL, now) !== null;
}

/** Just the words of planRound. */
export function planWords(state: ProfileState, options: PlanOptions): RoundWord[] {
  return planRound(state, options).words;
}

export interface RoundOutcome extends UnlockResult {
  summary: RoundSummary;
  perKey: Record<string, KeyRoundEntry>;
  /** Letters tested out by this round, when it completed calibration. */
  testedOut: string[];
  /** How much difficulty changed after this round. */
  difficultyChange: number;
  /** Phase 3. */
  errors: ErrorRoundSummary;
  rhythm: Rhythm;
  /** Keys with a hesitation this round, most hesitations first. */
  hesitated: { key: string; count: number }[];
  fatigue: FatigueChange;
  reviews: ReviewChanges;
  /** Touch: a grip suggestion when the taps don't match the grip picked. */
  gripSuggestion: Grip | null;
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
  options: { calibrationTest?: boolean; chars?: CharacterData; pack?: WordPack; warmup?: boolean } = {},
): RoundOutcome {
  const metrics = round.metrics();
  const calibration = !!options.calibrationTest || isCalibrating(state);
  const session = state.session;
  const tired = !calibration && !!session?.fatigued;
  const hesitated = judgeHesitations(state, round);
  const { perKey } = applyRecords(round.target, round.records, state.keys, state.pairs, options.chars, tired ? TIRED_WEIGHT : 1, state.layout);
  const errors = applyErrorAnalysis(state, round.target, round.records, options.pack ?? null);
  const flow = rhythm(round.records);
  const historyKeys: Record<string, KeyRoundEntry> = {};
  for (const key of Object.keys(perKey)) if (isLetter(key) || key.startsWith("mod:")) historyKeys[key] = perKey[key];
  appendHistory(state.keyHistory, historyKeys);
  recordKeyDays(state.keyDays, perKey, at);

  const grip = state.profile === "touch" ? session?.grip ?? null : null;
  for (const r of round.records) {
    if (!r.tap) continue;
    const lists = [(state.taps[r.expected] ??= [])];
    if (grip) lists.push(((state.gripTaps[grip] ??= {})[r.expected] ??= []));
    for (const list of lists) {
      list.push(r.tap);
      if (list.length > MAX_TAPS_PER_KEY) list.splice(0, list.length - MAX_TAPS_PER_KEY);
    }
  }
  if (grip) applyRecords(round.target, round.records, (state.gripKeys[grip] ??= {}), {}, undefined, tired ? TIRED_WEIGHT : 1);

  const summary: RoundSummary = {
    at,
    wpm: metrics.wpm,
    accuracy: metrics.accuracy,
    durationMs: metrics.elapsedMs,
    chars: metrics.correctChars,
    corrections: metrics.corrections,
    calibration,
    consistency: flow.consistency,
    firstErrors: metrics.firstErrors,
    ...(options.warmup ? { warmup: true } : {}),
  };
  if (metrics.keystrokes > 0) {
    state.rounds.push(summary);
    if (state.rounds.length > MAX_ROUNDS_KEPT) state.rounds.splice(0, state.rounds.length - MAX_ROUNDS_KEPT);
  }
  state.roundCounter += 1;

  let fatigue: FatigueChange = null;
  let gripSuggestion: Grip | null = null;
  if (session && !calibration && metrics.keystrokes > 0) {
    fatigue = recordSessionRound(session, at, metrics.wpm, metrics.accuracy);
    if (options.warmup) session.warmupDone = true;
    if (grip) {
      addGripSignal(session, round.target, round.records);
      gripSuggestion = suggestGrip(session);
    }
  }
  const goal = state.goal ?? DEFAULT_GOAL;
  const reviews: ReviewChanges =
    calibration || metrics.keystrokes === 0
      ? { added: [], passed: [], missed: [], learned: [] }
      : updateReviews(state, perKey, wordOutcomes(round.target, errors.errors.map((e) => e.index), round.position), at, goal);

  let testedOut: string[] = [];
  let result: UnlockResult = { newlyMastered: [], newlyUnlocked: null, newlyMasteredMods: [], newlyUnlockedMods: [] };
  let difficultyChange = 0;
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
    if (metrics.keystrokes > 0 && !options.warmup) difficultyChange = updateDifficulty(state, goal, { noRaise: tired || fatigue === "started" });
  }
  return { ...result, summary, perKey, testedOut, difficultyChange, errors, rhythm: flow, hesitated, fatigue, reviews, gripSuggestion };
}

/**
 * Judges each first-attempt keystroke with an interval: it's a hesitation
 * when the interval is above max(HESITATION_MIN_MS, HESITATION_FACTOR x the
 * key's average before this round). Keys need HESITATION_MIN_SAMPLES timed
 * samples first. Each judgment is a sample in state.hesitations (error =
 * hesitation, no interval). Run before the round's stats are applied.
 */
export function judgeHesitations(state: ProfileState, round: TypingRound): { key: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const r of round.records) {
    if (!r.first || r.interval === null) continue;
    const base = state.keys[r.expected];
    if (!base || base.timedN < HESITATION_MIN_SAMPLES) continue;
    const hesitation = r.interval > Math.max(HESITATION_MIN_MS, HESITATION_FACTOR * base.msAvg);
    addSample((state.hesitations[r.expected] ??= emptyStat()), hesitation, null);
    if (hesitation) counts[r.expected] = (counts[r.expected] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([key, count]) => ({ key, count }));
}

/** Seed for a shortcut drill; finishing the drill advances the round counter. */
export function shortcutDrillSeed(state: ProfileState): number {
  return deriveSeed(state.seed, "shortcuts", state.roundCounter);
}

/** Average WPM and accuracy over recent non-calibration rounds, or null with none. */
export function recentAverage(state: ProfileState, skipLast = 0): { wpm: number; accuracy: number } | null {
  const rounds = state.rounds.filter((r) => !r.calibration && !r.warmup);
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

/** Call when a shortcut drill finishes, so the next drill gets a new seed. */
export function completeShortcutDrill(state: ProfileState): void {
  state.roundCounter += 1;
}
