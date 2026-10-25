// Spelling by ear (phase 8): the app says a word or a sentence and you type
// it. Words come from your weak keys, a list of tricky spellings, your own
// packs, or short sentences for dictation. Words you miss come back in later
// sessions until you spell them right. See spec section 42.

import type { Rng } from "./rng";
import type { ProfileState } from "./types";

/** content/spelling.json */
export interface SpellingContent {
  version: number;
  /** Commonly misspelled words, lowercase, none of them homophones. */
  tricky: readonly string[];
  /** Short sentences for dictation. */
  sentences: readonly string[];
  /** Groups of words that sound alike; none of them is asked on its own. */
  homophones: readonly (readonly string[])[];
}

export type SpellingSource = "weak" | "tricky" | "sentences" | "own";
export type SpellingKind = "word" | "sentence";

/** Items in a session: words, or sentences. */
export const SPELLING_WORDS = 10;
export const SPELLING_SENTENCES = 5;
/** Shortest word asked. */
export const SPELLING_MIN_LENGTH = 3;
/** Missed words kept, and how many of them open each word session. */
export const SPELLING_MISSED_MAX = 30;
export const SPELLING_MISSED_PER_SESSION = 3;

/** Every word in a homophone group. */
export function homophoneSet(content: SpellingContent): Set<string> {
  return new Set(content.homophones.flat());
}

/** A word that can be asked by ear: SPELLING_MIN_LENGTH or more letters a to z, and no sound-alike. */
export function spellableWord(word: string, homophones: ReadonlySet<string>): boolean {
  return word.length >= SPELLING_MIN_LENGTH && /^[a-z]+$/.test(word) && !homophones.has(word);
}

/** Fisher-Yates: from the last position down to the second, swap with rng.int(i + 1). */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The items for a session. Sentences: SPELLING_SENTENCES of them, shuffled.
 * Words: up to SPELLING_MISSED_PER_SESSION missed words first (most recent
 * first), then candidates (weak: in the order given, already weighted toward
 * weak keys; tricky: the tricky list, shuffled; own: the given words,
 * shuffled), skipping words that can't be asked by ear and repeats, up to
 * SPELLING_WORDS.
 */
export function pickSpelling(state: ProfileState, content: SpellingContent, source: SpellingSource, candidates: readonly string[], rng: Rng): string[] {
  if (source === "sentences") return shuffle(content.sentences, rng).slice(0, SPELLING_SENTENCES);
  const homophones = homophoneSet(content);
  const out: string[] = [];
  for (const w of state.spelling.missed) {
    if (out.length >= SPELLING_MISSED_PER_SESSION) break;
    if (spellableWord(w, homophones)) out.push(w);
  }
  const pool = source === "tricky" ? shuffle(content.tricky, rng) : source === "own" ? shuffle(candidates, rng) : candidates;
  for (const w of pool) {
    if (out.length >= SPELLING_WORDS) break;
    if (spellableWord(w, homophones) && !out.includes(w)) out.push(w);
  }
  return out;
}

/** A sentence word as compared: lowercase, curly apostrophes made straight, only a to z, digits and apostrophes kept. */
export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9']/g, "");
}

/** Which items of a are in a longest common subsequence with b (the earliest such match). */
export function lcsMatch<T>(a: readonly T[], b: readonly T[]): boolean[] {
  const n = a.length;
  const m = b.length;
  // len[i][j]: LCS length of a[i..] and b[j..].
  const len: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) len[i][j] = a[i] === b[j] ? len[i + 1][j + 1] + 1 : Math.max(len[i + 1][j], len[i][j + 1]);
  const out = new Array<boolean>(n).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out[i] = true;
      i++;
      j++;
    } else if (len[i + 1][j] >= len[i][j + 1]) i++;
    else j++;
  }
  return out;
}

export interface SpellingCheck {
  correct: boolean;
  /** Words: for each letter of the answer, whether the typed word had it in place. */
  letters?: boolean[];
  /** Sentences: each word of the sentence as written, and whether it was typed. */
  words?: { word: string; ok: boolean }[];
}

/**
 * Checks an answer. A word is right when the typed text, trimmed and in
 * lowercase, is the word. A sentence is right when its normalized words
 * equal the typed text's (case, punctuation and spacing don't count).
 */
export function checkSpelling(target: string, typed: string, kind: SpellingKind): SpellingCheck {
  if (kind === "word") {
    const t = typed.trim().toLowerCase();
    return { correct: t === target.toLowerCase(), letters: lcsMatch([...target.toLowerCase()], [...t]) };
  }
  const words = target.split(/\s+/).filter((w) => w.length > 0);
  const norm = words.map(normalizeWord);
  const typedWords = typed.split(/\s+/).map(normalizeWord).filter((w) => w.length > 0);
  const kept = norm.filter((w) => w.length > 0);
  const matched = lcsMatch(kept, typedWords);
  let k = 0;
  const marks = words.map((word, i) => ({ word, ok: norm[i].length === 0 ? true : matched[k++] }));
  const correct = kept.length === typedWords.length && kept.every((w, i) => w === typedWords[i]);
  return { correct, words: marks };
}

export interface SpellingItemResult {
  text: string;
  /** Right on the first try (null until answered). */
  firstTry: boolean | null;
  attempts: string[];
}

/**
 * A session: each item in turn; an item missed on its first try comes back
 * once more at the end (only the first try counts).
 */
export class SpellingSession {
  readonly kind: SpellingKind;
  readonly source: SpellingSource;
  readonly results: SpellingItemResult[];
  private readonly queue: number[];
  private pos = 0;

  constructor(items: readonly string[], source: SpellingSource) {
    if (items.length === 0) throw new Error("A spelling session needs items");
    this.source = source;
    this.kind = source === "sentences" ? "sentence" : "word";
    this.results = items.map((text) => ({ text, firstTry: null, attempts: [] }));
    this.queue = items.map((_, i) => i);
  }

  /** The item being asked, or null when done. */
  get current(): SpellingItemResult | null {
    return this.pos < this.queue.length ? this.results[this.queue[this.pos]] : null;
  }

  /** True when the current item is a second try. */
  get retrying(): boolean {
    return this.current !== null && this.current.attempts.length > 0;
  }

  get done(): boolean {
    return this.pos >= this.queue.length;
  }

  /** Items asked so far (second tries not counted) and in all. */
  get progress(): { index: number; total: number } {
    return { index: Math.min(this.pos, this.results.length), total: this.results.length };
  }

  answer(typed: string): SpellingCheck {
    const index = this.queue[this.pos];
    const item = this.results[index];
    if (!item) throw new Error("The session is done");
    const check = checkSpelling(item.text, typed, this.kind);
    if (item.firstTry === null) {
      item.firstTry = check.correct;
      if (!check.correct) this.queue.push(index);
    }
    item.attempts.push(typed);
    this.pos++;
    return check;
  }

  /** Items right on the first try. */
  get correct(): number {
    return this.results.filter((r) => r.firstTry).length;
  }
}

export interface SpellingOutcome {
  correct: number;
  total: number;
  /** Words missed this time (now at the front of the missed list). */
  missed: string[];
  /** Missed words from earlier spelled right first try, so off the list. */
  learned: string[];
}

/**
 * Records a finished session. Word sessions update the missed list: a word
 * right on the first try leaves it; a word missed moves to the front (no
 * repeats), and the list keeps SPELLING_MISSED_MAX. Sentences leave it alone.
 */
export function completeSpelling(state: ProfileState, session: SpellingSession): SpellingOutcome {
  const s = state.spelling;
  const missed: string[] = [];
  const learned: string[] = [];
  if (session.kind === "word") {
    for (const r of session.results) {
      if (r.firstTry === true && s.missed.includes(r.text)) {
        s.missed = s.missed.filter((w) => w !== r.text);
        learned.push(r.text);
      } else if (r.firstTry === false) missed.push(r.text);
    }
    s.missed = [...missed.slice().reverse(), ...s.missed.filter((w) => !missed.includes(w))].slice(0, SPELLING_MISSED_MAX);
  } else {
    for (const r of session.results) if (r.firstTry === false) missed.push(r.text);
  }
  s.sessions += 1;
  return { correct: session.correct, total: session.results.length, missed, learned };
}
