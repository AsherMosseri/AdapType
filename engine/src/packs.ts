import { CUSTOM_MAX_LENGTH, CUSTOM_MAX_WORDS, CUSTOM_MIN_LENGTH } from "./constants";
import type { WordPack } from "./types";

/**
 * The words in a text and how often each appears, for a custom word pack.
 * The text is lowercased and split on anything that isn't a-z or an
 * apostrophe; tokens with an apostrophe ("don't") are dropped, as are tokens
 * outside CUSTOM_MIN_LENGTH..CUSTOM_MAX_LENGTH letters. Sorted by count
 * (most first), then alphabetically; at most CUSTOM_MAX_WORDS words. The
 * original text isn't kept.
 */
export function wordsFromText(text: string): [word: string, count: number][] {
  const counts = new Map<string, number>();
  for (const token of text.toLowerCase().split(/[^a-z']+/)) {
    if (token.length < CUSTOM_MIN_LENGTH || token.length > CUSTOM_MAX_LENGTH || token.includes("'")) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, CUSTOM_MAX_WORDS);
}

/**
 * Interleaves word packs into one, most common first, by weight (smooth
 * weighted round robin). Each step, every pack that still has words adds
 * its weight to its credit; the pack with the most credit (ties: the
 * earlier pack) gives its next word not already taken, and loses the total
 * weight of the packs still in play. Packs with weight 0 are skipped. A word
 * in several packs appears once, where it's first taken.
 */
export function mixWordPacks(packs: readonly { words: readonly string[]; weight: number }[]): WordPack {
  const live = packs.map((p, i) => ({ words: p.words, weight: p.weight, next: 0, credit: 0, i })).filter((p) => p.weight > 0 && p.words.length > 0);
  const seen = new Set<string>();
  const out: string[] = [];
  const skipTaken = (p: (typeof live)[number]) => {
    while (p.next < p.words.length && seen.has(p.words[p.next])) p.next++;
  };
  live.forEach(skipTaken);
  let active = live.filter((p) => p.next < p.words.length);
  while (active.length > 0) {
    const total = active.reduce((s, p) => s + p.weight, 0);
    let best = active[0];
    for (const p of active) {
      p.credit += p.weight;
      if (p.credit > best.credit || (p.credit === best.credit && p.i < best.i)) best = p;
    }
    const word = best.words[best.next++];
    seen.add(word);
    out.push(word);
    best.credit -= total;
    active.forEach(skipTaken);
    active = active.filter((p) => p.next < p.words.length);
  }
  return { words: out };
}
