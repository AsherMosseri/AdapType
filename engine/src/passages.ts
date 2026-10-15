import { PASSAGE_BASE_WEIGHT, PASSAGE_CHAR_CAP, PASSAGE_RECENT } from "./constants";
import { applyErrorAnalysis } from "./errors";
import { modifierGoal } from "./modifiers";
import { DEFAULT_GOAL } from "./profile";
import type { Rng } from "./rng";
import { weakness, type Scores } from "./scoring";
import { applyRecords, recordKeyDays } from "./stats";
import type { RoundMetrics, TypingRound } from "./typing";
import type { CharacterData, ProfileState, WordPack } from "./types";

/** A code snippet or a quote to type whole. */
export interface Passage {
  id: string;
  text: string;
  /** Who wrote it and where it's from, for quotes. */
  credit?: string;
}

/**
 * How much a passage leans on your weak spots: PASSAGE_BASE_WEIGHT plus the
 * mean score of its characters (spaces and newlines skipped). A letter
 * (either case) scores its key score; any other character scores its
 * weakness against the modifier goal, capped at PASSAGE_CHAR_CAP.
 */
export function passageWeight(text: string, state: ProfileState, scores: Scores): number {
  const goal = modifierGoal(state.goal ?? DEFAULT_GOAL);
  let sum = 0;
  let n = 0;
  for (const ch of text) {
    if (ch === " " || ch === "\n") continue;
    const lower = ch.toLowerCase();
    sum += lower >= "a" && lower <= "z" ? (scores.keys[lower] ?? 0) : Math.min(PASSAGE_CHAR_CAP, weakness(state.keys[ch], goal));
    n += 1;
  }
  return PASSAGE_BASE_WEIGHT + (n > 0 ? sum / n : 0);
}

/**
 * Picks a passage by weight, skipping the ones in recentPassages (unless
 * every one is recent). Null for an empty list.
 */
export function pickPassage(state: ProfileState, passages: readonly Passage[], scores: Scores, rng: Rng): Passage | null {
  if (passages.length === 0) return null;
  const recent = new Set(state.recentPassages);
  const fresh = passages.some((p) => !recent.has(p.id));
  const weights = passages.map((p) => (fresh && recent.has(p.id) ? 0 : passageWeight(p.text, state, scores)));
  const idx = rng.weightedIndex(weights);
  return passages[idx < 0 ? rng.int(passages.length) : idx];
}

/**
 * Records a typed passage: its keystrokes count toward key stats (full
 * weight), error analysis and key days, not unlocks, difficulty or rounds.
 * The passage joins recentPassages (newest last, PASSAGE_RECENT kept).
 */
export function completePassage(
  state: ProfileState,
  passage: Passage,
  round: TypingRound,
  at: number,
  options: { chars?: CharacterData; pack?: WordPack } = {},
): RoundMetrics {
  const { perKey } = applyRecords(round.target, round.records, state.keys, state.pairs, options.chars, 1, state.layout);
  applyErrorAnalysis(state, round.target, round.records, options.pack ?? null);
  recordKeyDays(state.keyDays, perKey, at);
  state.recentPassages = [...state.recentPassages.filter((id) => id !== passage.id), passage.id].slice(-PASSAGE_RECENT);
  return round.metrics();
}
