import {
  CONFIDENT_SAMPLES,
  ERROR_SCORE_CAP,
  ERROR_SCORE_SCALE,
  FOCUS_BONUS,
  SPEED_SCORE_CAP,
} from "./constants";
import { wpmToMs } from "./typing";
import type { Goal, ProfileState, StatEntry } from "./types";

/**
 * How much a key or pair needs practice. 0 means it's at goal; higher is weaker.
 *   speed:   how far the average interval is above the goal's interval (0..2)
 *   errors:  error rate x 10 (0..3), so 10% errors scores 1
 *   unknown: up to 1 extra while there are fewer than 5 samples
 */
export function weakness(entry: StatEntry | undefined, goal: Goal): number {
  if (!entry || entry.n === 0) return 1;
  const targetMs = wpmToMs(goal.wpm);
  const speed = entry.timedN > 0 ? clamp(entry.msAvg / targetMs - 1, 0, SPEED_SCORE_CAP) : 0;
  const errors = clamp(entry.errAvg * ERROR_SCORE_SCALE, 0, ERROR_SCORE_CAP);
  const unknown = entry.n < CONFIDENT_SAMPLES ? (CONFIDENT_SAMPLES - entry.n) / CONFIDENT_SAMPLES : 0;
  return speed + errors + unknown;
}

/** The newest unlocked letter that isn't mastered yet, if any. */
export function focusLetter(state: ProfileState): string | null {
  for (let i = state.unlocked.length - 1; i >= 0; i--) {
    const letter = state.unlocked[i];
    if (!state.mastered.includes(letter)) return letter;
  }
  return null;
}

export interface Scores {
  keys: Record<string, number>;
  pairs: Record<string, number>;
}

/** Weakness scores for every unlocked letter and every pair of unlocked letters seen so far. */
export function computeScores(state: ProfileState, goal: Goal): Scores {
  const keys: Record<string, number> = {};
  const focus = focusLetter(state);
  for (const letter of state.unlocked) {
    keys[letter] = weakness(state.keys[letter], goal) + (letter === focus ? FOCUS_BONUS : 0);
  }
  const pairs: Record<string, number> = {};
  for (const pair of Object.keys(state.pairs)) {
    if (keys[pair[0]] !== undefined && keys[pair[1]] !== undefined) {
      pairs[pair] = weakness(state.pairs[pair], goal);
    }
  }
  return { keys, pairs };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
