import type { WordSource } from "./arcade";
import { ARCADE_MAX_WORD_LENGTH, BOSS_MIN_LENGTH, POWERUP_MIN_LENGTH } from "./constants";
import { difficultyParams } from "./difficulty";
import { wordPool, type PoolWord } from "./generate";
import { DEFAULT_GOAL, planRound, type ModifierOptions } from "./profile";
import type { Rng } from "./rng";
import { computeScores, type Scores } from "./scoring";
import type { Blocklist, ProfileState, RoundWord, WordPack } from "./types";

export interface ArcadeSourceOptions {
  pack: WordPack;
  blocklist: Blocklist;
  modifiers?: ModifierOptions;
  now?: number;
  madeUpCap?: number;
  /** Used for power-up and boss picks; normal words come from planRound's own seeded batches. */
  rng: Rng;
}

/** Average letter score of a word (letters only, lowercased). */
function letterAverage(text: string, scores: Scores): number {
  let sum = 0;
  let n = 0;
  for (const c of text.toLowerCase()) {
    if (c < "a" || c > "z") continue;
    sum += scores.keys[c] ?? 0;
    n += 1;
  }
  return n > 0 ? sum / n : 0;
}

/**
 * Power-up word weights: words of at least POWERUP_MIN_LENGTH letters,
 * weighted (0.1 + average letter score)^2, so the glowing words lean hard
 * on weak keys.
 */
export function powerUpWeights(pool: readonly PoolWord[], scores: Scores): number[] {
  return pool.map((w) => (w.text.length >= POWERUP_MIN_LENGTH ? (0.1 + letterAverage(w.text, scores)) ** 2 : 0));
}

/**
 * Boss word weights: words of at least BOSS_MIN_LENGTH letters containing the
 * boss key, weighted average letter score + 2 x (share of letters that are
 * the boss key).
 */
export function bossWeights(pool: readonly PoolWord[], scores: Scores, bossKey: string): number[] {
  return pool.map((w) => {
    if (w.text.length < BOSS_MIN_LENGTH || !w.text.includes(bossKey)) return 0;
    let hits = 0;
    for (const c of w.text) if (c === bossKey) hits += 1;
    return letterAverage(w.text, scores) + (2 * hits) / w.text.length;
  });
}

/** The highest-scoring unlocked letter (ties by unlock order). */
export function weakestKey(state: ProfileState, scores: Scores): string {
  let best = state.unlocked[0];
  for (const l of state.unlocked) if ((scores.keys[l] ?? 0) > (scores.keys[best] ?? 0)) best = l;
  return best;
}

/** The top letters by score with score above zero (ties by unlock order). */
export function topWeakKeys(state: ProfileState, scores: Scores, count: number): string[] {
  return state.unlocked
    .map((l, i) => ({ l, i, s: scores.keys[l] ?? 0 }))
    .filter((k) => k.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, count)
    .map((k) => k.l);
}

/**
 * Words for an arcade game. Normal words come from planRound in batches of
 * 20 (chunks 0, 1, 2...), so they adapt and carry modifiers like practice.
 * Power-up and boss words are drawn from the word pool (up to
 * ARCADE_MAX_WORD_LENGTH letters) with powerUpWeights and bossWeights; the
 * boss key is the nemesis or else the weakest letter. When no word fits, a
 * normal word is used.
 */
export function arcadeWordSource(state: ProfileState, options: ArcadeSourceOptions): WordSource {
  const goal = state.goal ?? DEFAULT_GOAL;
  const scores = computeScores(state, goal, options.now);
  const pool = wordPool(options.pack, state.unlocked, { ...difficultyParams(state.difficulty), maxLength: ARCADE_MAX_WORD_LENGTH });
  let buffer: RoundWord[] = [];
  let chunk = 0;
  let previous: string | undefined;
  const normal = (): RoundWord => {
    if (buffer.length === 0) {
      buffer = planRound(state, {
        pack: options.pack,
        blocklist: options.blocklist,
        count: 20,
        chunk,
        previous,
        modifiers: options.modifiers,
        now: options.now,
        madeUpCap: options.madeUpCap,
      }).words;
      chunk += 1;
    }
    const word = buffer.shift()!;
    previous = word.text;
    return word;
  };
  const pick = (weights: number[]): RoundWord | null => {
    const idx = options.rng.weightedIndex(weights);
    return idx < 0 ? null : { text: pool[idx].text, madeUp: false };
  };
  return {
    next(kind, bossKey) {
      if (kind === "powerup") return pick(powerUpWeights(pool, scores)) ?? normal();
      if (kind === "boss") return pick(bossWeights(pool, scores, bossKey ?? weakestKey(state, scores))) ?? normal();
      return normal();
    },
  };
}
