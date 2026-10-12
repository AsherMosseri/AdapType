import {
  BASE_WORD_WEIGHT,
  CALIBRATION_WORD_POOL,
  CONSONANT_CLUSTER_CHANCE,
  FULL_POOL,
  MADE_UP_ATTEMPTS,
  MADE_UP_MAX_LENGTH,
  MADE_UP_MIN_LENGTH,
  MAX_MADE_UP_SHARE,
  MAX_WORD_LENGTH,
  MIN_WORD_LENGTH,
  VOWELS,
} from "./constants";
import { difficultyParams, type DifficultyParams } from "./difficulty";
import type { Rng } from "./rng";
import type { Scores } from "./scoring";
import type { Blocklist, RoundWord, WordPack } from "./types";

export interface PoolWord {
  text: string;
  rank: number;
}

/**
 * Real words that use only the given letters, most common first, between
 * MIN_WORD_LENGTH and maxLength letters, capped at poolCap words.
 */
export function wordPool(
  pack: WordPack,
  letters: readonly string[],
  params: Pick<DifficultyParams, "maxLength" | "poolCap"> = difficultyParams(0.3),
): PoolWord[] {
  const allowed = new Set(letters);
  const pool: PoolWord[] = [];
  for (let rank = 0; rank < pack.words.length && pool.length < params.poolCap; rank++) {
    const word = pack.words[rank];
    if (word.length < MIN_WORD_LENGTH || word.length > params.maxLength) continue;
    let ok = true;
    for (const ch of word) {
      if (!allowed.has(ch)) {
        ok = false;
        break;
      }
    }
    if (ok) pool.push({ text: word, rank });
  }
  return pool;
}

/**
 * A word's weight: (base + intensity x (average letter score + average pair
 * score)), scaled down for rarer words by 1 / (1 + rank / rankScale).
 */
export function wordWeight(
  word: PoolWord,
  scores: Scores,
  params: Pick<DifficultyParams, "rankScale" | "intensity"> = difficultyParams(0.3),
): number {
  const text = word.text;
  let letterSum = 0;
  for (const ch of text) letterSum += scores.keys[ch] ?? 0;
  let pairSum = 0;
  for (let i = 1; i < text.length; i++) pairSum += scores.pairs[text[i - 1] + text[i]] ?? 0;
  const pairAvg = text.length > 1 ? pairSum / (text.length - 1) : 0;
  const raw = BASE_WORD_WEIGHT + params.intensity * (letterSum / text.length + pairAvg);
  return raw / (1 + word.rank / params.rankScale);
}

/** Share of a round that's made-up words, given how many real words fit. */
export function madeUpShare(poolSize: number): number {
  if (poolSize >= FULL_POOL) return 0;
  return Math.min(MAX_MADE_UP_SHARE, 1 - poolSize / FULL_POOL);
}

export interface GenerateOptions {
  pack: WordPack;
  blocklist: Blocklist;
  letters: readonly string[];
  scores: Scores;
  count: number;
  rng: Rng;
  /** Last word of the previous chunk, so the first new word doesn't repeat it. */
  previous?: string;
  /** Difficulty settings (defaults to difficulty 0.3). */
  params?: DifficultyParams;
}

/**
 * Picks the words for a round. For each slot: with probability madeUpShare
 * it's a made-up word, otherwise a real word drawn by weight without
 * repeating within the round (repeats are allowed once the pool runs out, but
 * never the same word twice in a row).
 */
export function generateWords(options: GenerateOptions): RoundWord[] {
  const { pack, blocklist, letters, scores, count, rng } = options;
  const params = options.params ?? difficultyParams(0.3);
  const pool = wordPool(pack, letters, params);
  const share = madeUpShare(pool.length);
  const weights = pool.map((w) => wordWeight(w, scores, params));
  const used = new Set<number>();
  const words: RoundWord[] = [];
  let previous = options.previous ?? "";

  for (let i = 0; i < count; i++) {
    const useMadeUp = pool.length === 0 || (share > 0 && rng.next() < share);
    let word: RoundWord;
    if (useMadeUp) {
      word = makeUpWord(letters, scores, blocklist, pack, rng);
    } else {
      if (used.size >= pool.length) used.clear();
      const available = weights.map((w, idx) => (used.has(idx) || pool[idx].text === previous ? 0 : w));
      let idx = rng.weightedIndex(available);
      if (idx < 0) idx = rng.int(pool.length);
      used.add(idx);
      word = { text: pool[idx].text, madeUp: false };
    }
    words.push(word);
    previous = word.text;
  }
  return words;
}

/**
 * A pronounceable made-up word from the given letters, favoring weak ones.
 * Alternates consonants and vowels when both are available. At most one
 * consonant cluster per word (not at the start), and a letter never directly
 * follows itself unless it's the only choice. Rejects anything containing a blocked root or
 * equal to a blocked word. If it happens to be a real word, it's marked real.
 */
export function makeUpWord(
  letters: readonly string[],
  scores: Scores,
  blocklist: Blocklist,
  pack: WordPack,
  rng: Rng,
): RoundWord {
  const vowels = letters.filter((l) => VOWELS.includes(l));
  const consonants = letters.filter((l) => !VOWELS.includes(l));
  const weightOf = (l: string) => 0.5 + (scores.keys[l] ?? 0);
  const pick = (from: string[]) => from[Math.max(0, rng.weightedIndex(from.map(weightOf)))];

  let text = "";
  for (let attempt = 0; attempt < MADE_UP_ATTEMPTS; attempt++) {
    const length = MADE_UP_MIN_LENGTH + rng.int(MADE_UP_MAX_LENGTH - MADE_UP_MIN_LENGTH + 1);
    text = "";
    if (vowels.length === 0 || consonants.length === 0) {
      const all = [...letters];
      for (let i = 0; i < length; i++) text += pick(all);
    } else {
      let vowelNext = rng.next() < 0.5;
      let clustered = false;
      for (let i = 0; i < length; i++) {
        const prev = text[text.length - 1];
        const from = vowelNext ? vowels : consonants;
        // Inside a cluster, never repeat the previous consonant.
        const choices = from.length > 1 && prev !== undefined ? from.filter((l) => l !== prev) : from;
        text += pick(choices);
        if (vowelNext) {
          vowelNext = false;
        } else if (!clustered && i > 0 && rng.next() < CONSONANT_CLUSTER_CHANCE) {
          clustered = true;
        } else {
          vowelNext = true;
        }
      }
    }
    if (!isBlocked(text, blocklist)) break;
    text = "";
  }
  if (text === "") text = letters[0].repeat(MADE_UP_MIN_LENGTH);
  return { text, madeUp: !pack.words.includes(text) };
}

export function isBlocked(text: string, blocklist: Blocklist): boolean {
  if (blocklist.words.includes(text)) return true;
  return blocklist.roots.some((root) => text.includes(root));
}

/** Calibration words: drawn evenly from the most common words, all letters allowed. */
export function calibrationWords(pack: WordPack, count: number, rng: Rng): RoundWord[] {
  const pool: string[] = [];
  for (const word of pack.words) {
    if (pool.length >= CALIBRATION_WORD_POOL) break;
    if (word.length >= MIN_WORD_LENGTH && word.length <= MAX_WORD_LENGTH) pool.push(word);
  }
  const words: RoundWord[] = [];
  let previous = "";
  for (let i = 0; i < count; i++) {
    let text = pool[rng.int(pool.length)];
    if (text === previous) text = pool[(pool.indexOf(text) + 1) % pool.length];
    words.push({ text, madeUp: false });
    previous = text;
  }
  return words;
}
