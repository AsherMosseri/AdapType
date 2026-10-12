import { RHYTHM_MIN_INTERVALS, STALL_FACTOR } from "./constants";
import type { KeystrokeRecord } from "./types";

export interface Rhythm {
  /** Clean intervals in order, with the record index each belongs to. */
  intervals: { record: number; ms: number }[];
  mean: number;
  median: number;
  /** Population standard deviation. */
  sd: number;
  /** clamp(1 - sd / mean, 0, 1), or null with fewer than RHYTHM_MIN_INTERVALS intervals. */
  consistency: number | null;
  /** Record indexes of intervals longer than STALL_FACTOR x the median. */
  stalls: number[];
}

/** How even the typing was, from the clean intervals between keystrokes. */
export function rhythm(records: readonly KeystrokeRecord[]): Rhythm {
  const intervals: { record: number; ms: number }[] = [];
  records.forEach((r, i) => {
    if (r.interval !== null) intervals.push({ record: i, ms: r.interval });
  });
  const n = intervals.length;
  if (n === 0) return { intervals, mean: 0, median: 0, sd: 0, consistency: null, stalls: [] };
  let sum = 0;
  for (const x of intervals) sum += x.ms;
  const mean = sum / n;
  let sq = 0;
  for (const x of intervals) sq += (x.ms - mean) * (x.ms - mean);
  const sd = Math.sqrt(sq / n);
  const sorted = intervals.map((x) => x.ms).sort((a, b) => a - b);
  const median = n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const consistency = n >= RHYTHM_MIN_INTERVALS && mean > 0 ? Math.min(1, Math.max(0, 1 - sd / mean)) : null;
  const stalls = intervals.filter((x) => x.ms > STALL_FACTOR * median).map((x) => x.record);
  return { intervals, mean, median, sd, consistency, stalls };
}
