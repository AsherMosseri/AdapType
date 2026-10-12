import { CONFIDENT_SAMPLES, FOCUS_KEY_MIN_SCORE, FOCUS_PAIR_MIN_SCORE } from "./constants";
import { focusLetter, type Scores } from "./scoring";
import { wpmToMs } from "./typing";
import type { Goal, KeyRoundEntry, ModifierId, ProfileState, RoundWord, StatEntry } from "./types";

export interface RoundExplanation {
  /** Up to two weak letters this round leans on (not counting the new letter). */
  keys: string[];
  /** Up to one weak letter pair that appears in the round. */
  pairs: string[];
  /** The newest unlocked letter still being learned, if any. */
  newLetter: string | null;
  /** Modifiers in the round and the share of words each one targets. */
  modifiers: { id: ModifierId; rate: number }[];
  /** Difficulty level used, 0..1. */
  difficulty: number;
}

/**
 * What a round is focusing on. Keys: unlocked letters other than the new
 * letter with score >= FOCUS_KEY_MIN_SCORE that appear in the round, highest
 * score first (ties: earlier in the unlock list), top 2. Pairs: pairs with
 * score >= FOCUS_PAIR_MIN_SCORE that appear inside a word of the round
 * (lowercased), highest first (ties: alphabetical), top 1.
 */
export function explainRound(
  state: ProfileState,
  scores: Scores,
  words: readonly RoundWord[],
  modifiers: { id: ModifierId; rate: number }[],
): RoundExplanation {
  const newLetter = focusLetter(state);
  const lower = words.map((w) => w.text.toLowerCase());
  const text = lower.join(" ");
  const keys = state.unlocked
    .map((letter, order) => ({ letter, order, score: scores.keys[letter] ?? 0 }))
    .filter((k) => k.letter !== newLetter && k.score >= FOCUS_KEY_MIN_SCORE && text.includes(k.letter))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, 2)
    .map((k) => k.letter);
  const pairs = Object.entries(scores.pairs)
    .filter(([pair, score]) => score >= FOCUS_PAIR_MIN_SCORE && lower.some((w) => w.includes(pair)))
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 1)
    .map(([pair]) => pair);
  return { keys, pairs, newLetter, modifiers, difficulty: state.difficulty };
}

export type ReasonKind = "slow" | "errors" | "unknown" | "new" | "fine";

export interface KeyDetail {
  samples: number;
  /** Average ms per press, or null with no timed samples. */
  avgMs: number | null;
  goalMs: number;
  /** 0..1 */
  accuracy: number;
  reasons: ReasonKind[];
}

/** Why a key is (or isn't) being targeted, for the tap-for-detail panel. */
export function keyDetail(entry: StatEntry | undefined, goal: Goal, isNewLetter: boolean): KeyDetail {
  const goalMs = wpmToMs(goal.wpm);
  const reasons: ReasonKind[] = [];
  if (isNewLetter) reasons.push("new");
  if (!entry || entry.n < CONFIDENT_SAMPLES) reasons.push("unknown");
  if (entry && entry.timedN > 0 && entry.msAvg > goalMs * 1.05) reasons.push("slow");
  if (entry && entry.n > 0 && entry.errAvg > 1 - goal.accuracy) reasons.push("errors");
  if (reasons.length === 0) reasons.push("fine");
  return {
    samples: entry?.n ?? 0,
    avgMs: entry && entry.timedN > 0 ? entry.msAvg : null,
    goalMs,
    accuracy: entry && entry.n > 0 ? 1 - entry.errAvg : 1,
    reasons,
  };
}

/** How a key did in one round: accuracy and average ms (null with no timed presses). */
export function roundKeySummary(entry: KeyRoundEntry | undefined): { presses: number; accuracy: number; avgMs: number | null } | null {
  if (!entry || entry.n === 0) return null;
  return { presses: entry.n, accuracy: entry.correct / entry.n, avgMs: entry.msN > 0 ? entry.msTotal / entry.msN : null };
}
