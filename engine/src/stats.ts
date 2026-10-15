import { DAY_MS, KEY_DAYS_KEPT, KEY_HISTORY_ROUNDS, MIN_AVG_WEIGHT } from "./constants";
import { leftHandLetters, type LayoutId } from "./layouts";
import { categoryOf, modKey } from "./modifiers";
import type { CharacterData, DayEntry, KeyRoundEntry, KeystrokeRecord, StatEntry } from "./types";

/** Stat key for using the wrong Shift (same hand as the letter). */
export const SHIFT_SIDE_KEY = "shift:side";
/** Stat key for characters that needed a touch layer switch. */
export const TOUCH_LAYER_KEY = "touch:layer";

export function emptyStat(): StatEntry {
  return { n: 0, timedN: 0, msAvg: 0, errAvg: 0 };
}

/**
 * Moving-average step: a plain average for early samples, recent-weighted
 * after. `factor` (below 1 for tired rounds) scales the weight, except for
 * a first sample, which always sets the average.
 */
function step(avg: number, count: number, sample: number, factor: number): number {
  const weight = count === 1 ? 1 : Math.max(MIN_AVG_WEIGHT, 1 / count) * factor;
  return avg + weight * (sample - avg);
}

/** Adds one sample to a stat entry, in place. */
export function addSample(entry: StatEntry, error: boolean, interval: number | null, factor = 1): void {
  entry.n += 1;
  entry.errAvg = step(entry.errAvg, entry.n, error ? 1 : 0, factor);
  if (interval !== null) {
    entry.timedN += 1;
    entry.msAvg = step(entry.msAvg, entry.timedN, interval, factor);
  }
}

/** Per-round entry key for a letter pair. */
export function pairRoundKey(pair: string): string {
  return `pair:${pair}`;
}

export interface StatsUpdate {
  /** How each key did this round. */
  perKey: Record<string, KeyRoundEntry>;
}

/**
 * Folds a round's keystrokes into key and pair stats, in place. Only first
 * attempts count. A pair is the previous target character plus this one,
 * when both are letters. With character data, each modifier character also
 * counts toward its modifier ("mod:caps" and so on), uppercase letters typed
 * with a known Shift count toward "shift:side", and touch characters that
 * needed a layer switch count toward "touch:layer".
 */
export function applyRecords(
  target: string,
  records: readonly KeystrokeRecord[],
  keys: Record<string, StatEntry>,
  pairs: Record<string, StatEntry>,
  chars?: CharacterData,
  /** Weight factor for every sample (TIRED_WEIGHT for rounds played while fatigued). */
  factor = 1,
  /** Which hand types each letter, for the Shift side check. */
  layout: LayoutId = "qwerty",
): StatsUpdate {
  const leftHand = leftHandLetters(layout);
  const perKey: Record<string, KeyRoundEntry> = {};
  const count = (key: string, r: KeystrokeRecord) => {
    const round = (perKey[key] ??= { n: 0, correct: 0, msTotal: 0, msN: 0 });
    round.n += 1;
    if (r.correct) round.correct += 1;
    if (r.interval !== null) {
      round.msTotal += r.interval;
      round.msN += 1;
    }
  };
  for (const r of records) {
    if (!r.first) continue;
    const key = r.expected;
    const entry = (keys[key] ??= emptyStat());
    addSample(entry, !r.correct, r.interval, factor);
    count(key, r);

    if (chars) {
      const category = categoryOf(key, chars);
      if (category !== "letter" && category !== "space" && category !== "other") {
        addSample((keys[modKey(category)] ??= emptyStat()), !r.correct, r.interval, factor);
        count(modKey(category), r);
      }
      if (r.shift && key >= "A" && key <= "Z") {
        const wrongSide = leftHand.includes(key.toLowerCase()) ? r.shift === "left" : r.shift === "right";
        addSample((keys[SHIFT_SIDE_KEY] ??= emptyStat()), wrongSide, null, factor);
      }
      if (r.layer) addSample((keys[TOUCH_LAYER_KEY] ??= emptyStat()), !r.correct, r.interval, factor);
    }

    if (r.index > 0) {
      const prev = target[r.index - 1];
      if (isLetter(prev) && isLetter(key)) {
        const pair = (pairs[prev + key] ??= emptyStat());
        addSample(pair, !r.correct, r.interval, factor);
        count(pairRoundKey(prev + key), r);
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

/** The day number (UTC days since the epoch) of a timestamp. */
export function dayOf(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

/**
 * Adds a round's per-key results to keyDays: single characters other than
 * space, merged into today's entry or appended, keeping KEY_DAYS_KEPT days.
 */
export function recordKeyDays(keyDays: Record<string, DayEntry[]>, perKey: Record<string, KeyRoundEntry>, at: number): void {
  const day = dayOf(at);
  for (const key of Object.keys(perKey).sort()) {
    if (key.length !== 1 || key === " ") continue;
    const e = perKey[key];
    const list = (keyDays[key] ??= []);
    const last = list[list.length - 1];
    if (last && last[0] === day) {
      last[1] += e.n;
      last[2] += e.correct;
      last[3] += e.msTotal;
      last[4] += e.msN;
    } else {
      list.push([day, e.n, e.correct, e.msTotal, e.msN] as DayEntry);
      if (list.length > KEY_DAYS_KEPT) list.splice(0, list.length - KEY_DAYS_KEPT);
    }
  }
}

