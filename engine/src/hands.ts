import { DRIFT_MIN_TAPS, DRIFT_THRESHOLD } from "./constants";
import { fingerMap, screenZoneMap, thumbMap, zoneMap } from "./layouts";
import { weakness } from "./scoring";
import type { Goal, StatEntry, TapPoint } from "./types";

/** The QWERTY maps; other layouts use fingerMap, zoneMap, thumbMap and screenZoneMap from layouts.ts. */
export const FINGERS: Record<string, string> = fingerMap("qwerty");
export const ZONES: Record<string, string> = zoneMap("qwerty");
export const THUMBS: Record<string, string> = thumbMap("qwerty");
export const SCREEN_ZONES: Record<string, string> = screenZoneMap("qwerty");

export interface GroupScore {
  name: string;
  /** Sample-weighted average weakness of the group's keys. */
  score: number;
  samples: number;
}

/**
 * Average weakness per group, weighting each key by its samples. Groups with
 * no samples are left out. Sorted weakest first (ties by name).
 */
export function groupBreakdown(groups: Record<string, string>, keys: Record<string, StatEntry>, goal: Goal): GroupScore[] {
  const out: GroupScore[] = [];
  for (const [name, letters] of Object.entries(groups)) {
    let total = 0;
    let samples = 0;
    for (const l of letters) {
      const e = keys[l];
      if (!e || e.n === 0) continue;
      total += weakness(e, goal) * e.n;
      samples += e.n;
    }
    if (samples > 0) out.push({ name, score: total / samples, samples });
  }
  return out.sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : 1));
}

export interface Drift {
  dx: number;
  dy: number;
  /** Distance of the average tap from the key's center, in key sizes. */
  offset: number;
  taps: number;
}

/** Average tap position for a key. */
export function drift(taps: readonly TapPoint[] | undefined): Drift | null {
  if (!taps || taps.length === 0) return null;
  let dx = 0;
  let dy = 0;
  for (const t of taps) {
    dx += t.dx;
    dy += t.dy;
  }
  dx /= taps.length;
  dy /= taps.length;
  return { dx, dy, offset: Math.sqrt(dx * dx + dy * dy), taps: taps.length };
}

/** Keys whose average tap lands more than DRIFT_THRESHOLD key sizes from center, with at least DRIFT_MIN_TAPS taps. */
export function driftingKeys(taps: Record<string, TapPoint[]>): string[] {
  return Object.keys(taps)
    .filter((k) => {
      const d = drift(taps[k]);
      return d !== null && d.taps >= DRIFT_MIN_TAPS && d.offset > DRIFT_THRESHOLD;
    })
    .sort();
}
