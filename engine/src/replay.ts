import { REPLAYS_BEST, REPLAYS_RECENT } from "./constants";
import { rhythm } from "./rhythm";
import { TypingRound } from "./typing";
import type { ErrorMode, ProfileState, ReplayRun, ReplayStore, TypingEvent } from "./types";

export function emptyReplays(): ReplayStore {
  return { recent: [], best: [] };
}

/** "\b" stands for a backspace in a replay's events. */
export const REPLAY_BACKSPACE = "\b";

/**
 * Feeds a run's events up to and including uptoMs into a fresh round, so
 * any moment of the run can be shown. Without uptoMs, the whole run.
 */
export function replayRound(run: Pick<ReplayRun, "target" | "errorMode" | "events">, uptoMs = Infinity): TypingRound {
  const round = new TypingRound(run.target, run.errorMode);
  for (const [t, ch] of run.events) {
    if (t > uptoMs) break;
    round.input(ch === REPLAY_BACKSPACE ? { kind: "backspace", t } : { kind: "char", char: ch, t });
  }
  return round;
}

/**
 * Builds a replay from a round's raw input events. Times become whole ms
 * after the first event; the target is cut after the word the run ended in
 * (timed and endless rounds keep extending their text). WPM and accuracy
 * come from replaying the events, so they match what the replay shows.
 */
export function makeReplay(target: string, errorMode: ErrorMode, input: readonly TypingEvent[], at: number, source: ReplayRun["source"]): ReplayRun {
  const t0 = input.length > 0 ? input[0].t : 0;
  const events: [number, string][] = [];
  for (const e of input) {
    if (e.kind === "backspace") events.push([Math.round(e.t - t0), REPLAY_BACKSPACE]);
    else if (e.char) events.push([Math.round(e.t - t0), e.char]);
  }
  const full = replayRound({ target, errorMode, events });
  let end = target.indexOf(" ", full.position);
  if (end < 0) end = target.length;
  const run = { target: target.slice(0, end), errorMode, events };
  const metrics = replayRound(run).metrics();
  return { at, ...run, wpm: metrics.wpm, accuracy: metrics.accuracy, source };
}

/** How long a run lasts, in ms. */
export function replayDuration(run: Pick<ReplayRun, "events">): number {
  return run.events.length > 0 ? run.events[run.events.length - 1][0] : 0;
}

export interface ReplayMarker {
  t: number;
  /** Position in the text. */
  index: number;
  kind: "error" | "hesitation";
}

/** Wrong keystrokes and stalls (intervals over STALL_FACTOR x the median), in time order. */
export function replayMarkers(run: Pick<ReplayRun, "target" | "errorMode" | "events">): ReplayMarker[] {
  const round = replayRound(run);
  const markers: ReplayMarker[] = [];
  for (const r of round.records) if (!r.correct) markers.push({ t: r.t, index: r.index, kind: "error" });
  for (const i of rhythm(round.records).stalls) {
    const r = round.records[i];
    markers.push({ t: r.t, index: r.index, kind: "hesitation" });
  }
  return markers.sort((a, b) => a.t - b.t || a.index - b.index || (a.kind < b.kind ? -1 : 1));
}

const replayScore = (run: ReplayRun) => run.wpm * run.accuracy;

/**
 * Keeps a run: the last REPLAYS_RECENT runs, and the REPLAYS_BEST best by
 * WPM x accuracy (ties keep the earlier run first). Returns its place among
 * the bests (1-based), or null. Runs with fewer than 2 keystrokes aren't kept.
 */
export function saveReplay(state: ProfileState, run: ReplayRun): number | null {
  if (run.events.length < 2) return null;
  const store = state.replays;
  store.recent.push(run);
  if (store.recent.length > REPLAYS_RECENT) store.recent.splice(0, store.recent.length - REPLAYS_RECENT);
  let rank = store.best.findIndex((b) => replayScore(run) > replayScore(b));
  if (rank < 0) rank = store.best.length;
  if (rank >= REPLAYS_BEST) return null;
  store.best.splice(rank, 0, run);
  if (store.best.length > REPLAYS_BEST) store.best.length = REPLAYS_BEST;
  return rank + 1;
}
