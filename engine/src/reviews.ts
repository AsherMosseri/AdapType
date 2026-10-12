import {
  CONFIDENT_SAMPLES,
  DAY_MS,
  REVIEW_INTERVALS_DAYS,
  REVIEW_MIN_SAMPLES,
  REVIEW_PAIR_MIN_SAMPLES,
  REVIEW_SESSION_GAP,
  REVIEW_WEAKNESS,
} from "./constants";
import { weakness } from "./scoring";
import { isLetter } from "./stats";
import { wpmToMs } from "./typing";
import type { Goal, KeyRoundEntry, ProfileState, ReviewItem } from "./types";

export function reviewKey(kind: ReviewItem["kind"], target: string): string {
  return `${kind}:${target}`;
}

/** Due across days, or due again within this session. */
export function isDue(item: ReviewItem, state: ProfileState, now: number): boolean {
  const rounds = state.session?.rounds ?? 0;
  return item.due <= now || (item.sessionRound !== null && rounds >= item.sessionRound);
}

function sessionRounds(state: ProfileState): number {
  return state.session?.rounds ?? 0;
}

/** A miss: back to the first step, due tomorrow and again REVIEW_SESSION_GAP rounds from now. */
function lapse(state: ProfileState, item: ReviewItem, at: number): void {
  item.step = 0;
  item.due = at + REVIEW_INTERVALS_DAYS[0] * DAY_MS;
  item.sessionRound = sessionRounds(state) + REVIEW_SESSION_GAP;
  item.lapses += 1;
}

/**
 * A success: a passed in-session review clears its session round; a success
 * on or after the day due moves to the next interval, and an item past the
 * last interval is learned and leaves the schedule. Returns false when the
 * item graduates.
 */
function succeed(state: ProfileState, item: ReviewItem, at: number): boolean {
  if (item.sessionRound !== null && sessionRounds(state) >= item.sessionRound) item.sessionRound = null;
  if (item.due <= at) {
    item.step += 1;
    if (item.step >= REVIEW_INTERVALS_DAYS.length) return false;
    item.due = at + REVIEW_INTERVALS_DAYS[item.step] * DAY_MS;
  }
  return true;
}

/** Adds an item: due tomorrow, and again REVIEW_SESSION_GAP rounds from now. */
function schedule(state: ProfileState, kind: ReviewItem["kind"], target: string, at: number): void {
  state.reviews[reviewKey(kind, target)] = {
    kind,
    target,
    step: 0,
    due: at + REVIEW_INTERVALS_DAYS[0] * DAY_MS,
    sessionRound: sessionRounds(state) + REVIEW_SESSION_GAP,
    lapses: 0,
  };
}

export interface ReviewChanges {
  added: string[];
  passed: string[];
  missed: string[];
  learned: string[];
}

/**
 * Updates the schedule after a round. Call after stats are updated and the
 * session's round count includes this round.
 *
 * Keys (letters with at least REVIEW_MIN_SAMPLES presses this round) and
 * pairs (at least REVIEW_PAIR_MIN_SAMPLES): a round is a success when its
 * accuracy reaches the goal and its average time is within 1.1 x the goal
 * interval (or untimed). Scheduled items succeed or lapse; unscheduled ones
 * join when the round wasn't a success, their overall stats have at least
 * CONFIDENT_SAMPLES samples, and their weakness is at least REVIEW_WEAKNESS.
 *
 * Words: botched words lapse or join; scheduled words typed cleanly succeed.
 * Keys are processed in alphabetical order, then pairs, then words.
 */
export function updateReviews(
  state: ProfileState,
  perKey: Record<string, KeyRoundEntry>,
  words: { clean: string[]; botched: string[] },
  at: number,
  goal: Goal,
): ReviewChanges {
  const changes: ReviewChanges = { added: [], passed: [], missed: [], learned: [] };
  const goalMs = wpmToMs(goal.wpm);
  const judge = (kind: "key" | "pair", target: string, entry: KeyRoundEntry, weak: number, confident: boolean) => {
    const ok = entry.correct / entry.n >= goal.accuracy && (entry.msN === 0 || entry.msTotal / entry.msN <= goalMs * 1.1);
    const id = reviewKey(kind, target);
    const item = state.reviews[id];
    if (item) {
      if (!ok) {
        lapse(state, item, at);
        changes.missed.push(id);
      } else if (succeed(state, item, at)) {
        changes.passed.push(id);
      } else {
        delete state.reviews[id];
        changes.learned.push(id);
      }
    } else if (!ok && confident && weak >= REVIEW_WEAKNESS) {
      schedule(state, kind, target, at);
      changes.added.push(id);
    }
  };

  for (const key of Object.keys(perKey).sort()) {
    const entry = perKey[key];
    if (isLetter(key) && entry.n >= REVIEW_MIN_SAMPLES) judge("key", key, entry, weakness(state.keys[key], goal), (state.keys[key]?.n ?? 0) >= CONFIDENT_SAMPLES);
  }
  for (const key of Object.keys(perKey).sort()) {
    const entry = perKey[key];
    if (key.startsWith("pair:") && entry.n >= REVIEW_PAIR_MIN_SAMPLES) {
      const pair = key.slice(5);
      judge("pair", pair, entry, weakness(state.pairs[pair], goal), (state.pairs[pair]?.n ?? 0) >= CONFIDENT_SAMPLES);
    }
  }
  for (const word of [...words.botched].sort()) {
    const id = reviewKey("word", word);
    const item = state.reviews[id];
    if (item) {
      lapse(state, item, at);
      changes.missed.push(id);
    } else {
      schedule(state, "word", word, at);
      changes.added.push(id);
    }
  }
  for (const word of [...new Set(words.clean)].sort()) {
    const id = reviewKey("word", word);
    const item = state.reviews[id];
    if (!item || words.botched.includes(word)) continue;
    if (succeed(state, item, at)) changes.passed.push(id);
    else {
      delete state.reviews[id];
      changes.learned.push(id);
    }
  }
  return changes;
}

/** Splits a round's target into words typed cleanly and words with a first-attempt error (letters only, lowercased). */
export function wordOutcomes(target: string, errorIndexes: readonly number[], typedLength: number): { clean: string[]; botched: string[] } {
  const clean: string[] = [];
  const botched: string[] = [];
  const errors = new Set(errorIndexes);
  let start = 0;
  for (let i = 0; i <= target.length; i++) {
    if (i === target.length || target[i] === " ") {
      if (i <= typedLength && i > start) {
        const word = target.slice(start, i).toLowerCase().replace(/[^a-z]/g, "");
        let bad = false;
        for (let j = start; j < i; j++) if (errors.has(j)) bad = true;
        if (word.length > 1) (bad ? botched : clean).push(word);
      }
      start = i + 1;
    }
  }
  return { clean, botched };
}

/** Due items of a kind, earliest due first (ties by target). */
export function dueItems(state: ProfileState, now: number, kind?: ReviewItem["kind"]): ReviewItem[] {
  return Object.values(state.reviews)
    .filter((item) => (!kind || item.kind === kind) && isDue(item, state, now))
    .sort((a, b) => a.due - b.due || (a.target < b.target ? -1 : 1));
}
