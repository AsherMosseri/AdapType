import {
  FORECAST_ESTIMATE_DAYS,
  FORECAST_ESTIMATE_SPREAD,
  FORECAST_KEY_MIN_TIMED,
  FORECAST_MAX_DAYS,
  FORECAST_MIN_DAYS,
  FORECAST_WINDOW_DAYS,
} from "./constants";
import { creatureGoal } from "./creatures";
import { dayOf } from "./stats";
import { DEFAULT_GOAL, nextLetter, recentAverage } from "./profile";
import { wpmToMs } from "./typing";
import type { ProfileState } from "./types";

export type Forecast =
  | { kind: "reached" }
  | { kind: "estimate"; days: number }
  | { kind: "range"; low: number; high: number }
  | { kind: "none"; reason: "data" | "flat" | "uncertain" | "far" | "accuracy" };

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Fits a straight line (least squares) through points (x = day relative to
 * today, y = value) and asks when it reaches target. direction is 1 when y
 * should rise to the target (speed), -1 when it should fall (ms per key).
 *   fewer than FORECAST_MIN_DAYS points, or all on one day: none (data)
 *   fitted value today already at the target: reached
 *   not moving toward the target: none (flat)
 *   days = gap / rate; with se the slope's standard error,
 *   low = gap / (rate + se), high = gap / (rate - se) (infinite if rate <= se)
 *   low beyond FORECAST_MAX_DAYS: none (far)
 *   at least FORECAST_ESTIMATE_DAYS points and se <= FORECAST_ESTIMATE_SPREAD x rate: estimate
 *   high within FORECAST_MAX_DAYS: range
 *   otherwise: none (uncertain)
 * Days are rounded to 0.1.
 */
export function trendForecast(points: readonly { x: number; y: number }[], target: number, direction: 1 | -1): Forecast {
  const n = points.length;
  if (n < FORECAST_MIN_DAYS) return { kind: "none", reason: "data" };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  const xm = sx / n;
  const ym = sy / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - xm) * (p.x - xm);
    sxy += (p.x - xm) * (p.y - ym);
  }
  if (sxx === 0) return { kind: "none", reason: "data" };
  const b = sxy / sxx;
  const a = ym - b * xm;
  let ss = 0;
  for (const p of points) ss += (p.y - a - b * p.x) ** 2;
  const se = Math.sqrt(ss / (n - 2) / sxx);
  const gap = direction * (target - a);
  if (gap <= 0) return { kind: "reached" };
  const rate = direction * b;
  if (rate <= 0) return { kind: "none", reason: "flat" };
  const days = gap / rate;
  const low = gap / (rate + se);
  const high = rate > se ? gap / (rate - se) : Infinity;
  if (low > FORECAST_MAX_DAYS) return { kind: "none", reason: "far" };
  if (n >= FORECAST_ESTIMATE_DAYS && se <= FORECAST_ESTIMATE_SPREAD * rate && days <= FORECAST_MAX_DAYS) {
    return { kind: "estimate", days: round1(days) };
  }
  if (high <= FORECAST_MAX_DAYS) return { kind: "range", low: round1(low), high: round1(high) };
  return { kind: "none", reason: "uncertain" };
}

/**
 * When you'll reach your speed goal: reached once your recent average is at
 * the goal; otherwise the trend of each day's mean WPM (practice rounds, not
 * calibration or warm-up) over the last FORECAST_WINDOW_DAYS days.
 */
export function forecastGoal(state: ProfileState, now: number): Forecast {
  const goal = state.goal ?? DEFAULT_GOAL;
  const recent = recentAverage(state);
  if (recent && recent.wpm >= goal.wpm) return { kind: "reached" };
  const today = dayOf(now);
  const byDay = new Map<number, { sum: number; n: number }>();
  for (const r of state.rounds) {
    if (r.calibration || r.warmup) continue;
    const day = dayOf(r.at);
    if (day < today - FORECAST_WINDOW_DAYS) continue;
    const d = byDay.get(day) ?? { sum: 0, n: 0 };
    d.sum += r.wpm;
    d.n += 1;
    byDay.set(day, d);
  }
  const points = [...byDay.entries()].sort((p, q) => p[0] - q[0]).map(([day, d]) => ({ x: day - today, y: d.sum / d.n }));
  return trendForecast(points, goal.wpm, 1);
}

/**
 * When a key reaches its goal (letters: the goal; other keys: the modifier
 * goal). Reached when its running averages are at goal speed and accuracy.
 * none (accuracy) when its accuracy over the window is below the goal, since
 * speed alone won't fix it. Otherwise the trend of its daily average time
 * per press, using days with at least FORECAST_KEY_MIN_TIMED timed presses.
 */
export function forecastKey(state: ProfileState, key: string, now: number): Forecast {
  const goal = creatureGoal(key, state.goal ?? DEFAULT_GOAL);
  const targetMs = wpmToMs(goal.wpm);
  const entry = state.keys[key];
  if (entry && entry.timedN > 0 && entry.msAvg <= targetMs && 1 - entry.errAvg >= goal.accuracy) return { kind: "reached" };
  const today = dayOf(now);
  const days = (state.keyDays[key] ?? []).filter((d) => d[0] >= today - FORECAST_WINDOW_DAYS);
  let n = 0;
  let correct = 0;
  for (const d of days) {
    n += d[1];
    correct += d[2];
  }
  if (n > 0 && correct / n < goal.accuracy) return { kind: "none", reason: "accuracy" };
  const points = days.filter((d) => d[4] >= FORECAST_KEY_MIN_TIMED).map((d) => ({ x: d[0] - today, y: d[3] / d[4] }));
  return trendForecast(points, targetMs, -1);
}

/**
 * When the next letter unlocks: every unlocked letter that isn't mastered
 * has to reach the goal, so this combines their key forecasts. Null when
 * every letter is unlocked. Any none makes it none; otherwise the latest
 * letter decides (an estimate when all are estimates or reached, else a range).
 */
export function forecastUnlock(state: ProfileState, now: number): { letter: string; forecast: Forecast; blocking: string[] } | null {
  const letter = nextLetter(state);
  if (letter === null) return null;
  const blocking = state.unlocked.filter((l) => !state.mastered.includes(l));
  let low = 0;
  let high = 0;
  let allEstimates = true;
  for (const key of blocking) {
    const f = forecastKey(state, key, now);
    if (f.kind === "none") return { letter, forecast: f, blocking };
    if (f.kind === "estimate") {
      low = Math.max(low, f.days);
      high = Math.max(high, f.days);
    } else if (f.kind === "range") {
      allEstimates = false;
      low = Math.max(low, f.low);
      high = Math.max(high, f.high);
    }
  }
  if (high === 0) return { letter, forecast: { kind: "reached" }, blocking };
  return { letter, forecast: allEstimates ? { kind: "estimate", days: high } : { kind: "range", low, high }, blocking };
}
