import { KEY_HISTORY_ROUNDS, MIN_AVG_WEIGHT } from "./constants";
import type { KeyRoundEntry, KeystrokeRecord, StatEntry } from "./types";

export function emptyStat(): StatEntry {
  return { n: 0, timedN: 0, msAvg: 0, errAvg: 0 };
}

/** Moving-average step: a plain average for early samples, recent-weighted after. */
function step(avg: number, count: number, sample: number): number {
  const weight = Math.max(MIN_AVG_WEIGHT, 1 / count);
  return avg + weight * (sample - avg);
}

/** Adds one sample to a stat entry, in place. */
export function addSample(entry: StatEntry, error: boolean, interval: number | null): void {
  entry.n += 1;
  entry.errAvg = step(entry.errAvg, entry.n, error ? 1 : 0);
  if (interval !== null) {
    entry.timedN += 1;
    entry.msAvg = step(entry.msAvg, entry.timedN, interval);
  }
}

export interface StatsUpdate {
  /** How each key did this round. */
  perKey: Record<string, KeyRoundEntry>;
}

/**
 * Folds a round's keystrokes into key and pair stats, in place. Only first
 * attempts count. A pair is the previous target character plus this one,
 * when both are letters.
 */
export function applyRecords(
  target: string,
  records: readonly KeystrokeRecord[],
  keys: Record<string, StatEntry>,
  pairs: Record<string, StatEntry>,
): StatsUpdate {
  const perKey: Record<string, KeyRoundEntry> = {};
  for (const r of records) {
    if (!r.first) continue;
    const key = r.expected;
    const entry = (keys[key] ??= emptyStat());
    addSample(entry, !r.correct, r.interval);

    const round = (perKey[key] ??= { n: 0, correct: 0, msTotal: 0, msN: 0 });
    round.n += 1;
    if (r.correct) round.correct += 1;
    if (r.interval !== null) {
      round.msTotal += r.interval;
      round.msN += 1;
    }

    if (r.index > 0) {
      const prev = target[r.index - 1];
      if (isLetter(prev) && isLetter(key)) {
        const pair = (pairs[prev + key] ??= emptyStat());
        addSample(pair, !r.correct, r.interval);
      }
    }
  }
  return { perKey };
}

/** Appends this round's per-key results to each key's history, keeping the most recent rounds. */
export function appendHistory(
  history: Record<string, KeyRoundEntry[]>,
  perKey: Record<string, KeyRoundEntry>,
): void {
  for (const key of Object.keys(perKey).sort()) {
    const list = (history[key] ??= []);
    list.push(perKey[key]);
    if (list.length > KEY_HISTORY_ROUNDS) list.splice(0, list.length - KEY_HISTORY_ROUNDS);
  }
}

export function isLetter(ch: string | undefined): boolean {
  return ch !== undefined && ch.length === 1 && ch >= "a" && ch <= "z";
}
