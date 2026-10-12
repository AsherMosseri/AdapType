import {
  CONFIDENT_SAMPLES,
  DRIFT_BONUS,
  DRIFT_MIN_TAPS,
  DRIFT_THRESHOLD,
  ERROR_SCORE_CAP,
  ERROR_SCORE_SCALE,
  FOCUS_BONUS,
  HESITATION_SCORE_CAP,
  HESITATION_SCORE_SCALE,
  REVIEW_BONUS,
  SPEED_SCORE_CAP,
} from "./constants";
import { wpmToMs } from "./typing";
import type { Goal, ProfileState, StatEntry, TapPoint } from "./types";

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

/** Hesitation score bonus: min(HESITATION_SCORE_CAP, rate x HESITATION_SCORE_SCALE), once there are CONFIDENT_SAMPLES judgments. */
export function hesitationBonus(entry: StatEntry | undefined): number {
  if (!entry || entry.n < CONFIDENT_SAMPLES) return 0;
  return Math.min(HESITATION_SCORE_CAP, entry.errAvg * HESITATION_SCORE_SCALE);
}

function drifts(taps: readonly TapPoint[] | undefined): boolean {
  if (!taps || taps.length < DRIFT_MIN_TAPS) return false;
  let dx = 0;
  let dy = 0;
  for (const t of taps) {
    dx += t.dx;
    dy += t.dy;
  }
  dx /= taps.length;
  dy /= taps.length;
  return Math.sqrt(dx * dx + dy * dy) > DRIFT_THRESHOLD;
}

/**
 * Weakness scores for every unlocked letter and every pair of unlocked
 * letters seen so far. Letters add: FOCUS_BONUS for the focus letter, the
 * hesitation bonus, REVIEW_BONUS when due for review, and DRIFT_BONUS on
 * touch when taps drift off the key. Pairs add REVIEW_BONUS when due.
 * Without `now`, reviews are ignored.
 */
export function computeScores(state: ProfileState, goal: Goal, now?: number): Scores {
  const keys: Record<string, number> = {};
  const focus = focusLetter(state);
  const reviews = state.reviews ?? {};
  const rounds = state.session?.rounds ?? 0;
  const due = (id: string) => {
    const item = reviews[id];
    return now !== undefined && !!item && (item.due <= now || (item.sessionRound !== null && rounds >= item.sessionRound));
  };
  for (const letter of state.unlocked) {
    let score = weakness(state.keys[letter], goal) + (letter === focus ? FOCUS_BONUS : 0);
    score += hesitationBonus(state.hesitations?.[letter]);
    if (due(`key:${letter}`)) score += REVIEW_BONUS;
    if (state.profile === "touch" && drifts(state.taps[letter])) score += DRIFT_BONUS;
    keys[letter] = score;
  }
  const pairs: Record<string, number> = {};
  for (const pair of Object.keys(state.pairs)) {
    if (keys[pair[0]] !== undefined && keys[pair[1]] !== undefined) {
      pairs[pair] = weakness(state.pairs[pair], goal) + (due(`pair:${pair}`) ? REVIEW_BONUS : 0);
    }
  }
  return { keys, pairs };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
