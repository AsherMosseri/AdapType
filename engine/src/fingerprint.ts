import {
  FINGERPRINT_MIN_SAMPLES,
  RECENT_ROUNDS,
  TRAIT_BURSTY,
  TRAIT_DARING,
  TRAIT_FIXER,
  TRAIT_PRECISE,
  TRAIT_PRESSES_ON,
  TRAIT_STEADY,
} from "./constants";
import { creatureViews, type CreatureView } from "./creatures";
import { DEFAULT_GOAL, recentAverage } from "./profile";
import { weakness } from "./scoring";
import type { CharacterData, ProfileState } from "./types";

export type Trait = "steady" | "bursty" | "precise" | "daring" | "fixer" | "presses-on" | "at-goal";

export interface Fingerprint {
  wpm: number;
  accuracy: number;
  /** Up to 3 letters each, from letters with at least FINGERPRINT_MIN_SAMPLES samples. */
  best: string[];
  worst: string[];
  traits: Trait[];
  /** Weakness per letter with data, for the heatmap. */
  heat: Record<string, number>;
  /** Up to 3 creatures, furthest evolved first, then healthiest, then roster order. */
  creatures: CreatureView[];
  rounds: number;
}

/**
 * The card's numbers, from the last RECENT_ROUNDS practice rounds:
 *   steady / bursty: mean rhythm consistency >= TRAIT_STEADY / < TRAIT_BURSTY
 *   precise / daring: accuracy >= TRAIT_PRECISE / < TRAIT_DARING
 *   fixer / presses-on: corrections / first errors >= TRAIT_FIXER / <= TRAIT_PRESSES_ON (with 5+ first errors)
 *   at-goal: recent WPM at or above the goal
 * Best letters: lowest weakness, ties by faster msAvg then alphabet; worst:
 * highest weakness, ties by slower msAvg then alphabet. A letter is never both.
 */
export function fingerprint(state: ProfileState, now: number, chars: Pick<CharacterData, "punctuation" | "symbols">): Fingerprint {
  const goal = state.goal ?? DEFAULT_GOAL;
  const recent = recentAverage(state) ?? { wpm: 0, accuracy: 0 };
  const rounds = state.rounds.filter((r) => !r.calibration).slice(-RECENT_ROUNDS);
  const traits: Trait[] = [];
  const cons = rounds.map((r) => r.consistency).filter((c): c is number => typeof c === "number");
  if (cons.length > 0) {
    const mean = cons.reduce((a, b) => a + b, 0) / cons.length;
    if (mean >= TRAIT_STEADY) traits.push("steady");
    else if (mean < TRAIT_BURSTY) traits.push("bursty");
  }
  if (rounds.length > 0) {
    if (recent.accuracy >= TRAIT_PRECISE) traits.push("precise");
    else if (recent.accuracy < TRAIT_DARING) traits.push("daring");
  }
  let firstErrors = 0;
  let corrections = 0;
  for (const r of rounds) {
    firstErrors += r.firstErrors ?? 0;
    corrections += r.corrections;
  }
  if (firstErrors >= 5) {
    const rate = corrections / firstErrors;
    if (rate >= TRAIT_FIXER) traits.push("fixer");
    else if (rate <= TRAIT_PRESSES_ON) traits.push("presses-on");
  }
  if (rounds.length > 0 && recent.wpm >= goal.wpm) traits.push("at-goal");

  const heat: Record<string, number> = {};
  const rated: { key: string; w: number; ms: number }[] = [];
  for (const key of "abcdefghijklmnopqrstuvwxyz") {
    const e = state.keys[key];
    if (!e || e.n === 0) continue;
    const w = weakness(e, goal);
    heat[key] = Math.round(w * 1000) / 1000;
    if (e.n >= FINGERPRINT_MIN_SAMPLES) rated.push({ key, w, ms: e.msAvg });
  }
  const best = [...rated].sort((a, b) => a.w - b.w || a.ms - b.ms || (a.key < b.key ? -1 : 1)).slice(0, 3).map((x) => x.key);
  const worst = [...rated]
    .sort((a, b) => b.w - a.w || b.ms - a.ms || (a.key < b.key ? -1 : 1))
    .filter((x) => !best.includes(x.key))
    .slice(0, 3)
    .map((x) => x.key);

  const creatures = creatureViews(state, now, chars)
    .map((c, i) => ({ c, i }))
    .filter((x) => x.c.stage !== null)
    .sort((a, b) => b.c.stage! - a.c.stage! || b.c.health - a.c.health || a.i - b.i)
    .slice(0, 3)
    .map((x) => x.c);

  return { wpm: recent.wpm, accuracy: recent.accuracy, best, worst, traits, heat, creatures, rounds: rounds.length };
}
