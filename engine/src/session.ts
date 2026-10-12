import {
  FATIGUE_ACCURACY_DROP,
  FATIGUE_BASELINE_ROUNDS,
  FATIGUE_MIN_ROUNDS,
  FATIGUE_RECENT_ROUNDS,
  FATIGUE_WPM_DROP,
  GRIP_MIN_SAMPLES,
  GRIP_ONE_RATIO,
  GRIP_TWO_RATIO,
  RECOVER_ACCURACY_DROP,
  RECOVER_WPM,
  SESSION_GAP_MS,
  SESSION_HISTORY,
} from "./constants";
import type { Grip, KeystrokeRecord, ProfileState, SessionState } from "./types";

/**
 * Starts a new session when there's none or the last round ended more than
 * SESSION_GAP_MS ago. Returns true for a new session.
 */
export function beginSession(state: ProfileState, now: number): boolean {
  const s = state.session;
  if (s && now - s.lastAt <= SESSION_GAP_MS) return false;
  state.session = {
    id: (s?.id ?? 0) + 1,
    startedAt: now,
    lastAt: now,
    rounds: 0,
    history: [],
    baseline: null,
    fatigued: false,
    grip: s && state.profile === "touch" ? s.grip : null,
    warmupDone: false,
    gripSignal: { sameMs: 0, sameN: 0, crossMs: 0, crossN: 0 },
  };
  return true;
}

export type FatigueChange = "started" | "recovered" | null;

function average(list: { wpm: number; accuracy: number }[]): { wpm: number; accuracy: number } {
  let wpm = 0;
  let accuracy = 0;
  for (const r of list) {
    wpm += r.wpm;
    accuracy += r.accuracy;
  }
  return { wpm: wpm / list.length, accuracy: accuracy / list.length };
}

/**
 * Records a round in the session and updates fatigue:
 *   baseline = average of the first FATIGUE_BASELINE_ROUNDS rounds
 *   recent   = average of the last FATIGUE_RECENT_ROUNDS rounds
 * With at least FATIGUE_MIN_ROUNDS rounds: fatigue starts when recent WPM is
 * below baseline x FATIGUE_WPM_DROP or recent accuracy is more than
 * FATIGUE_ACCURACY_DROP under baseline. It ends when recent WPM is at least
 * baseline x RECOVER_WPM and accuracy is within RECOVER_ACCURACY_DROP.
 */
export function recordSessionRound(session: SessionState, at: number, wpm: number, accuracy: number): FatigueChange {
  session.rounds += 1;
  session.lastAt = at;
  session.history.push({ wpm, accuracy });
  if (session.history.length > SESSION_HISTORY) session.history.splice(0, session.history.length - SESSION_HISTORY);
  if (session.baseline === null && session.rounds >= FATIGUE_BASELINE_ROUNDS) {
    session.baseline = average(session.history.slice(0, FATIGUE_BASELINE_ROUNDS));
  }
  if (!session.baseline || session.rounds < FATIGUE_MIN_ROUNDS) return null;
  const recent = average(session.history.slice(-FATIGUE_RECENT_ROUNDS));
  const base = session.baseline;
  if (!session.fatigued && (recent.wpm < base.wpm * FATIGUE_WPM_DROP || recent.accuracy < base.accuracy - FATIGUE_ACCURACY_DROP)) {
    session.fatigued = true;
    return "started";
  }
  if (session.fatigued && recent.wpm >= base.wpm * RECOVER_WPM && recent.accuracy >= base.accuracy - RECOVER_ACCURACY_DROP) {
    session.fatigued = false;
    return "recovered";
  }
  return null;
}

/** Letters typed with the left thumb when holding a phone with two thumbs. */
export const LEFT_THUMB = "qwertasdfgzxcv";

/**
 * Touch grip signal: for consecutive letters with a clean interval, adds the
 * interval to "same" (both on the same half of the keyboard) or "cross"
 * (alternating halves).
 */
export function addGripSignal(session: SessionState, target: string, records: readonly KeystrokeRecord[]): void {
  for (const r of records) {
    if (!r.first || r.interval === null || r.index === 0) continue;
    const a = target[r.index - 1];
    const b = r.expected;
    if (!(a >= "a" && a <= "z" && b >= "a" && b <= "z")) continue;
    const same = LEFT_THUMB.includes(a) === LEFT_THUMB.includes(b);
    if (same) {
      session.gripSignal.sameMs += r.interval;
      session.gripSignal.sameN += 1;
    } else {
      session.gripSignal.crossMs += r.interval;
      session.gripSignal.crossN += 1;
    }
  }
}

/**
 * Which grip the taps suggest, if it differs from the one picked. Two thumbs
 * make alternating-side letters faster than same-side ones (ratio below
 * GRIP_TWO_RATIO); one thumb makes them slower (above GRIP_ONE_RATIO).
 */
export function suggestGrip(session: SessionState): Grip | null {
  const g = session.gripSignal;
  if (!session.grip || g.sameN < GRIP_MIN_SAMPLES || g.crossN < GRIP_MIN_SAMPLES) return null;
  const ratio = g.crossMs / g.crossN / (g.sameMs / g.sameN);
  if (session.grip === "two" && ratio > GRIP_ONE_RATIO) return "one";
  if (session.grip === "one" && ratio < GRIP_TWO_RATIO) return "two";
  return null;
}
