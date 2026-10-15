import { BIAS_WEIGHT, MAX_MISSED_WORDS } from "./constants";
import { areNeighbors, type LayoutId } from "./layouts";
import { addSample, emptyStat, isLetter } from "./stats";
import type { BiasType, ErrorType, KeystrokeRecord, ProfileState, WordPack } from "./types";

/** Neighbors moved to layouts.ts (they depend on the keyboard layout); re-exported here for existing callers. */
export { areNeighbors } from "./layouts";

export interface ClassifiedError {
  index: number;
  expected: string;
  actual: string;
  type: ErrorType;
}

/**
 * Classifies each first-attempt error. Errors that belong to an earlier slip
 * aren't listed: the keystroke right after a swap that types the swapped
 * letter (the "h" in "teh"), and consecutive errors that continue the
 * one-letter shift of a skipped, missed-double (typing one ahead) or double
 * (one behind) error. Otherwise, checking in this order:
 *   missed-double: expected equals the previous target character and actual is the next one (leter)
 *   swap:          actual is the next target character and the next keystroke typed the expected one (teh)
 *   skipped:       actual is the next target character otherwise (th → t_e)
 *   double:        actual equals the previous target character (lettter)
 *   case:          same letter, wrong case
 *   neighbor:      actual is next to expected on the keyboard layout
 *   other
 */
export function classifyErrors(target: string, records: readonly KeystrokeRecord[], layout: LayoutId = "qwerty"): ClassifiedError[] {
  const out: ClassifiedError[] = [];
  let shift: { dir: 1 | -1; index: number } | null = null;
  for (let k = 0; k < records.length; k++) {
    const r = records[k];
    if (!r.first || r.correct) continue;
    const i = r.index;
    const e = r.expected;
    const a = r.actual;
    const prev = i > 0 ? target[i - 1] : undefined;
    const next = target[i + 1];
    // The second half of a swap is part of the same slip, not a new error.
    const last = out[out.length - 1];
    if (last && last.type === "swap" && last.index === i - 1 && a === prev) continue;
    // So are errors that continue a one-letter shift (typing ahead after a skip, or behind after an extra letter).
    if (shift && i === shift.index + 1 && a === target[i + shift.dir]) {
      shift.index = i;
      continue;
    }
    shift = null;
    let type: ErrorType;
    if (prev !== undefined && e === prev && next !== undefined && a === next) type = "missed-double";
    else if (next !== undefined && a === next && next !== e) {
      const following = records[k + 1];
      type = following && following.index === i + 1 && following.actual === e ? "swap" : "skipped";
    } else if (prev !== undefined && a === prev) type = "double";
    else if (a.toLowerCase() === e.toLowerCase()) type = "case";
    else if (areNeighbors(a, e, layout)) type = "neighbor";
    else type = "other";
    out.push({ index: i, expected: e, actual: a, type });
    if (type === "missed-double" || type === "skipped") shift = { dir: 1, index: i };
    else if (type === "double") shift = { dir: -1, index: i };
  }
  return out;
}

export interface ErrorRoundSummary {
  errors: ClassifiedError[];
  counts: Partial<Record<ErrorType, number>>;
  /** Real words with a first-attempt error this round, lowercased. */
  missedWords: string[];
}

/** The word (letters only, lowercased) that contains a target position. */
function wordAt(target: string, index: number): string {
  let start = index;
  while (start > 0 && target[start - 1] !== " ") start--;
  let end = index;
  while (end < target.length && target[end] !== " ") end++;
  return target.slice(start, end).toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Folds a round's errors into the profile: per-key error type counts, what
 * was typed instead, neighbor confusions, missed real words, the error-type
 * bias (moving average with weight BIAS_WEIGHT of each type's share of this
 * round's errors, skipped for rounds without errors), and an extra error
 * sample on the swapped letter pair, so swaps get pair drills.
 */
export function applyErrorAnalysis(state: ProfileState, target: string, records: readonly KeystrokeRecord[], pack: WordPack | null): ErrorRoundSummary {
  const errors = classifyErrors(target, records, state.layout);
  const counts: Partial<Record<ErrorType, number>> = {};
  const missed = new Set<string>();
  for (const err of errors) {
    counts[err.type] = (counts[err.type] ?? 0) + 1;
    const perKey = (state.errorCounts[err.expected] ??= {});
    perKey[err.type] = (perKey[err.type] ?? 0) + 1;
    const typos = (state.typos[err.expected] ??= {});
    typos[err.actual] = (typos[err.actual] ?? 0) + 1;
    if (err.type === "neighbor") {
      const key = [err.expected.toLowerCase(), err.actual.toLowerCase()].sort().join("");
      state.confusions[key] = (state.confusions[key] ?? 0) + 1;
    }
    if (err.type === "swap") {
      const next = target[err.index + 1];
      if (isLetter(err.expected) && isLetter(next)) addSample((state.pairs[err.expected + next] ??= emptyStat()), true, null);
    }
    const word = wordAt(target, err.index);
    if (word.length > 1 && (!pack || pack.words.includes(word))) missed.add(word);
  }
  for (const word of missed) state.missedWords[word] = (state.missedWords[word] ?? 0) + 1;
  trimMissed(state);
  if (errors.length > 0) {
    const share = (types: ErrorType[]) => types.reduce((sum, t) => sum + (counts[t] ?? 0), 0) / errors.length;
    const shares: Record<BiasType, number> = {
      swap: share(["swap"]),
      double: share(["double", "missed-double"]),
      neighbor: share(["neighbor"]),
    };
    for (const t of ["swap", "double", "neighbor"] as BiasType[]) {
      state.errorBias[t] += BIAS_WEIGHT * (shares[t] - state.errorBias[t]);
    }
  }
  return { errors, counts, missedWords: [...missed].sort() };
}

function trimMissed(state: ProfileState): void {
  const entries = Object.entries(state.missedWords);
  if (entries.length <= MAX_MISSED_WORDS) return;
  entries.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  state.missedWords = Object.fromEntries(entries.slice(0, MAX_MISSED_WORDS));
}

/** The most-missed words, most first (ties alphabetical). */
export function topMissedWords(state: ProfileState, count: number): { word: string; misses: number }[] {
  return Object.entries(state.missedWords)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, count)
    .map(([word, misses]) => ({ word, misses }));
}
