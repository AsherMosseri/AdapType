import { MADE_UP_ATTEMPTS, MADE_UP_LONG_MAX, MADE_UP_MAX_SYLLABLES, MADE_UP_MIN_LENGTH, PHONOTACTIC_TOP, PHONOTACTIC_WORDS, VOWELS } from "./constants";
import type { Rng } from "./rng";
import type { Scores } from "./scoring";
import type { Blocklist, WordPack } from "./types";

/** English sound patterns counted from real words: how words start, their vowel groups, middle clusters and endings. */
export interface Phonotactics {
  onsets: [string, number][];
  nuclei: [string, number][];
  medials: [string, number][];
  codas: [string, number][];
}

const cache = new WeakMap<WordPack, Phonotactics>();

/**
 * Splits each of the first PHONOTACTIC_WORDS words (3+ letters, a-z) into
 * alternating consonant and vowel groups (vowels: a e i o u y). Counts
 * word-initial consonant groups (onsets), vowel groups (nuclei), inner
 * consonant groups (medials) and word-final consonant groups (codas), each
 * at most 2 letters. Keeps the PHONOTACTIC_TOP most common of each (ties
 * alphabetical).
 */
export function phonotactics(pack: WordPack): Phonotactics {
  const cached = cache.get(pack);
  if (cached) return cached;
  const counts = { onsets: new Map<string, number>(), nuclei: new Map<string, number>(), medials: new Map<string, number>(), codas: new Map<string, number>() };
  const add = (map: Map<string, number>, part: string) => {
    if (part.length > 0 && part.length <= 2) map.set(part, (map.get(part) ?? 0) + 1);
  };
  for (const word of pack.words.slice(0, PHONOTACTIC_WORDS)) {
    if (word.length < 3 || !/^[a-z]+$/.test(word)) continue;
    const groups = word.match(/[aeiouy]+|[^aeiouy]+/g) ?? [];
    groups.forEach((g, i) => {
      const vowel = VOWELS.includes(g[0]);
      if (vowel) add(counts.nuclei, g);
      else if (i === 0) add(counts.onsets, g);
      else if (i === groups.length - 1) add(counts.codas, g);
      else add(counts.medials, g);
    });
  }
  const top = (map: Map<string, number>): [string, number][] =>
    [...map.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, PHONOTACTIC_TOP);
  const result = { onsets: top(counts.onsets), nuclei: top(counts.nuclei), medials: top(counts.medials), codas: top(counts.codas) };
  cache.set(pack, result);
  return result;
}

/**
 * A pronounceable made-up word from unlocked letters, or null when the
 * patterns can't be built from them (no usable vowel group). Shape:
 *   [onset, 80%] nucleus (medial nucleus) x (syllables - 1) [coda, 60%]
 * with syllables = 1 + int(MADE_UP_MAX_SYLLABLES). Each part is picked from
 * the parts made only of unlocked letters, weighted by
 * sqrt(count) x (1 + average letter score). Words shorter than
 * MADE_UP_MIN_LENGTH, longer than MADE_UP_LONG_MAX, or blocked are retried,
 * up to MADE_UP_ATTEMPTS times.
 */
export function pronounceableWord(
  pack: WordPack,
  letters: readonly string[],
  scores: Scores,
  blocklist: Blocklist,
  rng: Rng,
): string | null {
  const p = phonotactics(pack);
  const allowed = new Set(letters);
  const usable = (parts: [string, number][]) => parts.filter(([part]) => [...part].every((c) => allowed.has(c)));
  const onsets = usable(p.onsets);
  const nuclei = usable(p.nuclei);
  const medials = usable(p.medials);
  const codas = usable(p.codas);
  if (nuclei.length === 0 || medials.length === 0) return null;
  const pick = (parts: [string, number][]) => {
    const weights = parts.map(([part, count]) => {
      let s = 0;
      for (const c of part) s += scores.keys[c] ?? 0;
      return Math.sqrt(count) * (1 + s / part.length);
    });
    return parts[Math.max(0, rng.weightedIndex(weights))][0];
  };
  for (let attempt = 0; attempt < MADE_UP_ATTEMPTS; attempt++) {
    const syllables = 1 + rng.int(MADE_UP_MAX_SYLLABLES);
    let word = onsets.length > 0 && rng.next() < 0.8 ? pick(onsets) : "";
    word += pick(nuclei);
    for (let s = 1; s < syllables; s++) word += pick(medials) + pick(nuclei);
    if (codas.length > 0 && rng.next() < 0.6) word += pick(codas);
    if (word.length < MADE_UP_MIN_LENGTH || word.length > MADE_UP_LONG_MAX) continue;
    if (blocklist.words.includes(word) || blocklist.roots.some((r) => word.includes(r))) continue;
    return word;
  }
  return null;
}
