import {
  DIFFICULTY_ACCURACY_SLACK,
  DIFFICULTY_DOWN_RATIO,
  DIFFICULTY_ROUNDS,
  DIFFICULTY_STEP,
  DIFFICULTY_UP_RATIO,
} from "./constants";
import { clamp } from "./scoring";
import type { Goal, ProfileState } from "./types";

export interface DifficultyParams {
  /** Longest real word allowed. */
  maxLength: number;
  /** Word weight is divided by (1 + rank / rankScale): higher reaches rarer words. */
  rankScale: number;
  /** How many matching words (most common first) are considered. */
  poolCap: number;
  /** Multiplies letter and pair scores in word weights: higher leans harder on weak spots. */
  intensity: number;
}

/** What a difficulty level (0..1) means for word choice. */
export function difficultyParams(d: number): DifficultyParams {
  return {
    maxLength: 5 + Math.round(d * 5),
    rankScale: 1000 + d * 5000,
    poolCap: 1000 + Math.round(d * 3000),
    intensity: 0.5 + 1.5 * d,
  };
}

/**
 * Gentle adjustment after a practice round, from the last DIFFICULTY_ROUNDS
 * non-calibration rounds (no change with fewer):
 *   at or above 95% of goal speed with accuracy on target: up one step
 *   below 80% of goal speed, or accuracy more than 3 points under target: down one step
 * Returns the change (-step, 0 or +step).
 */
export function updateDifficulty(state: ProfileState, goal: Goal): number {
  const rounds = state.rounds.filter((r) => !r.calibration).slice(-DIFFICULTY_ROUNDS);
  if (rounds.length < DIFFICULTY_ROUNDS) return 0;
  let wpm = 0;
  let accuracy = 0;
  for (const r of rounds) {
    wpm += r.wpm;
    accuracy += r.accuracy;
  }
  wpm /= rounds.length;
  accuracy /= rounds.length;
  const ratio = wpm / goal.wpm;
  let change = 0;
  if (ratio >= DIFFICULTY_UP_RATIO && accuracy >= goal.accuracy) change = DIFFICULTY_STEP;
  else if (ratio < DIFFICULTY_DOWN_RATIO || accuracy < goal.accuracy - DIFFICULTY_ACCURACY_SLACK) change = -DIFFICULTY_STEP;
  const before = state.difficulty;
  state.difficulty = clamp(Math.round((before + change) * 1000) / 1000, 0, 1);
  return state.difficulty - before;
}
