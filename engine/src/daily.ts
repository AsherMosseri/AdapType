import {
  DAILY_COMMA_CHANCE,
  DAILY_KEPT,
  DAILY_MAX_LENGTH,
  DAILY_MIN_LENGTH,
  DAILY_POOL,
  DAILY_SENTENCE_MAX,
  DAILY_SENTENCE_MIN,
  DAILY_WORDS,
} from "./constants";
import { applyErrorAnalysis } from "./errors";
import { isBlocked } from "./generate";
import { deriveSeed, Rng } from "./rng";
import { applyRecords, recordKeyDays } from "./stats";
import type { TypingRound } from "./typing";
import type { Blocklist, CharacterData, DailyResult, ProfileState, WordPack } from "./types";

/** Days since 1970-01-01 for a "YYYY-MM-DD" date. */
export function dateNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** The "YYYY-MM-DD" date of a day number. */
export function dateString(day: number): string {
  return new Date(day * 86400000).toISOString().slice(0, 10);
}

/**
 * The daily challenge text, the same for everyone on a date:
 *   rng = Rng(deriveSeed("daily", pack id or "en", pack version or 1, date))
 *   pool = the first DAILY_POOL pack words that are only a-z, DAILY_MIN_LENGTH
 *     to DAILY_MAX_LENGTH letters long, and not blocked, in pack order
 *   DAILY_WORDS words, each pool[rng.int(pool.length)], drawn again (once per
 *     try) while equal to the previous word
 *   sentences: each takes DAILY_SENTENCE_MIN + rng.int(MAX - MIN + 1) words
 *     (fewer if fewer remain); a last sentence under 3 words joins the one
 *     before. The first word is capitalized, the sentence ends with "."; each
 *     other word but the last gets a "," when rng.next() < DAILY_COMMA_CHANCE.
 * Random calls happen in exactly that order: all word picks, then per
 * sentence one length pick followed by one comma roll per non-final word.
 */
export function dailyText(date: string, pack: WordPack, blocklist: Blocklist): string {
  const rng = new Rng(deriveSeed("daily", pack.id ?? "en", pack.version ?? 1, date));
  const pool: string[] = [];
  for (let i = 0; i < pack.words.length && i < DAILY_POOL; i++) {
    const w = pack.words[i];
    if (w.length < DAILY_MIN_LENGTH || w.length > DAILY_MAX_LENGTH || !/^[a-z]+$/.test(w) || isBlocked(w, blocklist)) continue;
    pool.push(w);
  }
  const words: string[] = [];
  for (let i = 0; i < DAILY_WORDS; i++) {
    let w = pool[rng.int(pool.length)];
    if (w === words[words.length - 1]) w = pool[rng.int(pool.length)];
    words.push(w);
  }
  const sentences: string[][] = [];
  let i = 0;
  while (i < words.length) {
    const len = DAILY_SENTENCE_MIN + rng.int(DAILY_SENTENCE_MAX - DAILY_SENTENCE_MIN + 1);
    const sentence = words.slice(i, i + len);
    i += sentence.length;
    for (let j = 0; j < sentence.length - 1; j++) if (rng.next() < DAILY_COMMA_CHANCE) sentence[j] += ",";
    if (sentence.length < 3 && sentences.length > 0) sentences[sentences.length - 1].push(...sentence);
    else sentences.push(sentence);
  }
  return sentences
    .map((s) => {
      const out = [...s];
      out[0] = out[0][0].toUpperCase() + out[0].slice(1);
      const last = out.length - 1;
      out[last] = out[last].replace(/,$/, "") + ".";
      return out.join(" ");
    })
    .join(" ");
}

/** One letter per word typed: g clean, y wrong first but fixed, r still wrong at the end. */
export function wordMarks(round: TypingRound): string {
  const firstWrong = new Set<number>();
  for (const r of round.records) if (r.first && !r.correct) firstWrong.add(r.index);
  let marks = "";
  let start = 0;
  const end = round.position;
  for (let i = 0; i <= round.target.length; i++) {
    if (i < round.target.length && round.target[i] !== " ") continue;
    if (start < end) {
      let mark = "g";
      for (let j = start; j < i && j < end; j++) {
        if (!round.isCorrectAt(j)) mark = "r";
        else if (firstWrong.has(j) && mark === "g") mark = "y";
      }
      marks += mark;
    }
    start = i + 1;
  }
  return marks;
}

/** Consecutive days with a result, ending today (or yesterday, if today isn't played yet). */
export function dailyStreak(state: ProfileState, today: string): number {
  let day = dateNumber(today);
  if (!state.daily[today]) day -= 1;
  let streak = 0;
  while (state.daily[dateString(day)]) {
    streak += 1;
    day -= 1;
  }
  return streak;
}

/**
 * Records a daily challenge attempt. Its keystrokes count toward key stats
 * and error analysis at full weight (not unlocks, difficulty or rounds). Only
 * the first attempt on a date is scored and kept; DAILY_KEPT dates are kept.
 */
export function completeDaily(
  state: ProfileState,
  date: string,
  round: TypingRound,
  at: number,
  options: { chars?: CharacterData; pack?: WordPack } = {},
): { scored: boolean; result: DailyResult; streak: number } {
  const { perKey } = applyRecords(round.target, round.records, state.keys, state.pairs, options.chars);
  applyErrorAnalysis(state, round.target, round.records, options.pack ?? null);
  recordKeyDays(state.keyDays, perKey, at);
  const m = round.metrics();
  const result: DailyResult = { wpm: m.wpm, accuracy: m.accuracy, at, marks: wordMarks(round) };
  const scored = !state.daily[date];
  if (scored) {
    state.daily[date] = result;
    const dates = Object.keys(state.daily).sort();
    for (const d of dates.slice(0, Math.max(0, dates.length - DAILY_KEPT))) delete state.daily[d];
  }
  return { scored, result, streak: dailyStreak(state, date) };
}

const SQUARES: Record<string, string> = { g: "🟩", y: "🟨", r: "🟥" };

/** A short result to paste anywhere, Wordle-style: rows of 10 squares, one per word. */
export function dailyShareText(date: string, result: DailyResult, streak: number): string {
  const rows: string[] = [];
  for (let i = 0; i < result.marks.length; i += 10) rows.push([...result.marks.slice(i, i + 10)].map((m) => SQUARES[m] ?? "⬜").join(""));
  const streakText = streak > 1 ? ` · ${streak}-day streak` : "";
  return [`AdapType daily ${date}`, `${Math.round(result.wpm)} WPM · ${Math.round(result.accuracy * 100)}%${streakText}`, ...rows].join("\n");
}
