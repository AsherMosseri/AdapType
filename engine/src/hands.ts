import { DRIFT_MIN_TAPS, DRIFT_THRESHOLD } from "./constants";
import { weakness } from "./scoring";
import type { Goal, StatEntry, TapPoint } from "./types";

/** Standard touch-typing fingers on QWERTY. */
export const FINGERS: Record<string, string> = {
  "Left pinky": "qaz",
  "Left ring": "wsx",
  "Left middle": "edc",
  "Left index": "rfvtgb",
  "Right index": "yhnujm",
  "Right middle": "ik",
  "Right ring": "ol",
  "Right pinky": "p",
};

/** Keyboard zones for people who don't touch-type: columns by rows. */
export const ZONES: Record<string, string> = {
  "Left, top row": "qwe",
  "Left, home row": "asd",
  "Left, bottom row": "zxc",
  "Center, top row": "rtyu",
  "Center, home row": "fghj",
  "Center, bottom row": "vbnm",
  "Right, top row": "iop",
  "Right, home row": "kl",
};

/** Thumbs when holding a phone with two thumbs. */
export const THUMBS: Record<string, string> = {
  "Left thumb": "qwertasdfgzxcv",
  "Right thumb": "yuiophjklbnm",
};

/** Screen zones on a phone keyboard: left, middle and right by row. */
export const SCREEN_ZONES: Record<string, string> = {
  "Left, top row": "qwe",
  "Middle, top row": "rtyu",
  "Right, top row": "iop",
  "Left, middle row": "asd",
  "Middle, middle row": "fghj",
  "Right, middle row": "kl",
  "Left, bottom row": "zx",
  "Middle, bottom row": "cvb",
  "Right, bottom row": "nm",
};

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
