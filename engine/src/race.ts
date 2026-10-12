import { RIVAL_AHEAD, RIVAL_WARMUP_SECONDS, RUBBER_BAND_CHARS, RUBBER_BAND_STRENGTH } from "./constants";
import { computeWpm, type TypingRound } from "./typing";
import type { GhostRun, ProfileState } from "./types";

export type RivalPace = { kind: "ahead" } | { kind: "goal" } | { kind: "custom"; wpm: number };

export interface Rival {
  pace: RivalPace;
  /** The player's recent average WPM (or goal) to pace off before live speed is known. */
  baseWpm: number;
  goalWpm: number;
  /** Characters covered so far. */
  position: number;
  elapsed: number;
}

export function createRival(pace: RivalPace, baseWpm: number, goalWpm: number): Rival {
  return { pace, baseWpm, goalWpm, position: 0, elapsed: 0 };
}

/**
 * The rival's speed in WPM right now.
 *   goal: the goal. custom: the chosen WPM.
 *   ahead: RIVAL_AHEAD x (the player's live WPM after RIVAL_WARMUP_SECONDS,
 *   else the recent average), slowed by RUBBER_BAND_STRENGTH when more than
 *   RUBBER_BAND_CHARS ahead and sped up by it when as far behind.
 */
export function rivalWpm(rival: Rival, playerChars: number, playerWpm: number): number {
  if (rival.pace.kind === "goal") return rival.goalWpm;
  if (rival.pace.kind === "custom") return rival.pace.wpm;
  const base = (rival.elapsed >= RIVAL_WARMUP_SECONDS && playerWpm > 0 ? playerWpm : rival.baseWpm) * RIVAL_AHEAD;
  const gap = rival.position - playerChars;
  if (gap > RUBBER_BAND_CHARS) return base * (1 - RUBBER_BAND_STRENGTH);
  if (gap < -RUBBER_BAND_CHARS) return base * (1 + RUBBER_BAND_STRENGTH);
  return base;
}

/** Moves the rival forward by dt seconds: position += wpm x 5 / 60 x dt. */
export function stepRival(rival: Rival, dt: number, playerChars: number, playerWpm: number): void {
  const wpm = rivalWpm(rival, playerChars, playerWpm);
  rival.elapsed += dt;
  rival.position += (wpm * 5 * dt) / 60;
}

/** How many characters the ghost had typed after elapsedMs (times are sorted). */
export function ghostPosition(ghost: GhostRun, elapsedMs: number): number {
  let lo = 0;
  let hi = ghost.times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ghost.times[mid] <= elapsedMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * A finished, fully correct ghost-race round as a ghost run: for each
 * position, the time (ms after the first keystroke) of the last correct
 * keystroke there, kept non-decreasing. Null when the round isn't finished
 * with every character correct.
 */
export function ghostFromRound(round: TypingRound, at: number): GhostRun | null {
  if (!round.done || round.records.length === 0) return null;
  for (let i = 0; i < round.target.length; i++) if (!round.isCorrectAt(i)) return null;
  const t0 = round.records[0].t;
  const times = new Array<number>(round.target.length).fill(0);
  for (const r of round.records) if (r.correct) times[r.index] = r.t - t0;
  for (let i = 1; i < times.length; i++) times[i] = Math.max(times[i], times[i - 1]);
  const elapsed = times[times.length - 1];
  return { target: round.target, times, wpm: computeWpm(round.target.length, elapsed), at };
}

/** Keeps the new run when there's no ghost, the text changed, or it was faster. Returns true when kept. */
export function saveGhostIfBest(state: ProfileState, run: GhostRun | null): boolean {
  if (!run) return false;
  const current = state.arcade.ghost;
  if (current && current.target === run.target && current.wpm >= run.wpm) return false;
  state.arcade.ghost = run;
  return true;
}
