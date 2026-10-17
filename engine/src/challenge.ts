// Challenge a friend (phase 8): a link carries a text and your run of it,
// and your friend races your ghost. No server: the whole challenge is in the
// link. See spec section 40.

import { REPLAY_BACKSPACE, replayEvents, replayRound } from "./replay";
import type { RoundMetrics, TypingRound } from "./typing";
import type { ErrorMode, ReplayRun, TypingEvent } from "./types";

/** The link format's version, the first byte of every challenge. */
export const CHALLENGE_FORMAT = 1;
/** Keystroke times are kept to this many ms. */
export const CHALLENGE_TIME_STEP = 4;
/** The longest text you can write yourself for a challenge. */
export const CHALLENGE_MAX_TEXT = 500;
/** The longest name, in characters. */
export const CHALLENGE_MAX_NAME = 24;
/** Limits when reading a link, so a damaged one can't ask for huge amounts. */
const MAX_TARGET = 5000;
const MAX_EVENTS = 20000;
const MAX_STRING_BYTES = 4 * MAX_TARGET;

/** Where a challenge was typed. The order is part of the link format. */
export const CHALLENGE_SOURCES = ["practice", "daily", "code", "quotes", "course", "race", "custom", "rematch"] as const;
export type ChallengeSource = (typeof CHALLENGE_SOURCES)[number];
const ERROR_MODES: readonly ErrorMode[] = ["backspace", "block", "skip"];

export interface Challenge {
  target: string;
  /** How the sender's round handled mistakes, needed to replay their run. */
  errorMode: ErrorMode;
  autoIndent: boolean;
  catchUp: boolean;
  /** The sender's keystrokes: ms after the first (multiples of CHALLENGE_TIME_STEP) and the character, or REPLAY_BACKSPACE. */
  events: [number, string][];
  source: ChallengeSource;
  /** The sender's name, or "". */
  name: string;
  /** Who the sender raced to make this run (a rematch), or "". */
  opponent: string;
  /** Races won so far in a rematch series: [sender, opponent]. */
  score: [number, number];
}

export class ChallengeError extends Error {
  /** True when the link was made by a newer version of AdapType. */
  readonly newer: boolean;
  constructor(message: string, newer = false) {
    super(message);
    this.name = "ChallengeError";
    this.newer = newer;
  }
}

/** A name as it goes in a link: control characters removed, spaces collapsed, trimmed, at most CHALLENGE_MAX_NAME characters. */
export function cleanName(name: string): string {
  return [...name.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim()].slice(0, CHALLENGE_MAX_NAME).join("").trim();
}

/**
 * Your own text for a challenge, made typeable: curly quotes, dashes and
 * ellipses become plain ones, tabs and unusual spaces become spaces, runs of
 * spaces and of blank lines shrink to one, characters that can't be typed
 * (controls, emoji) go, and each line is trimmed. At most CHALLENGE_MAX_TEXT
 * characters.
 */
export function challengeText(raw: string): string {
  const s = raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u201c\u201d\u201e\u00ab\u00bb]/g, '"')
    .replace(/[\u2018\u2019\u201a]/g, "'")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\t\u00a0\u2000-\u200a\u202f\u3000]/g, " ")
    .replace(/[\ud800-\udfff]/g, "")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff]/g, "")
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return s.slice(0, CHALLENGE_MAX_TEXT).trimEnd();
}

/** The sender's run, replayed (to any moment with uptoMs). */
export function challengeRound(ch: Pick<Challenge, "target" | "errorMode" | "autoIndent" | "catchUp" | "events">, uptoMs = Infinity): TypingRound {
  return replayRound(ch, uptoMs);
}

/**
 * Makes a challenge from a finished run. Times become whole steps of
 * CHALLENGE_TIME_STEP ms after the first keystroke. Null when the run doesn't
 * finish its text (only finished runs can be raced).
 */
export function makeChallenge(
  run: Pick<ReplayRun, "target" | "errorMode" | "events"> & { catchUp?: boolean; autoIndent?: boolean },
  source: ChallengeSource,
  name: string,
  rematch: { opponent: string; score: [number, number] } | null = null,
): Challenge | null {
  if (run.events.length === 0 || run.target.length === 0) return null;
  const t0 = run.events[0][0];
  const events: [number, string][] = run.events.map(([t, ch]) => [Math.round((t - t0) / CHALLENGE_TIME_STEP) * CHALLENGE_TIME_STEP, ch]);
  const ch: Challenge = {
    target: run.target,
    errorMode: run.errorMode,
    autoIndent: !!run.autoIndent,
    catchUp: run.errorMode === "block" && !!run.catchUp,
    events,
    source,
    name: cleanName(name),
    opponent: cleanName(rematch?.opponent ?? ""),
    score: rematch ? [rematch.score[0], rematch.score[1]] : [0, 0],
  };
  return challengeRound(ch).done ? ch : null;
}

// --- The link format: bytes, then base64url. ---

function writeVarint(out: number[], n: number): void {
  if (!Number.isInteger(n) || n < 0) throw new ChallengeError(`Can't write ${n}`);
  while (n >= 0x80) {
    out.push((n % 0x80) | 0x80);
    n = Math.floor(n / 0x80);
  }
  out.push(n);
}

function writeString(out: number[], s: string): void {
  const bytes = new TextEncoder().encode(s);
  writeVarint(out, bytes.length);
  for (const b of bytes) out.push(b);
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function toBase64Url(bytes: readonly number[]): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2;
    for (let j = 0; j < chars; j++) s += B64[(n >> (18 - 6 * j)) & 63];
  }
  return s;
}

function fromBase64Url(s: string): Uint8Array {
  if (s.length % 4 === 1) throw new ChallengeError("The link is cut off.");
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let n = 0;
  let bits = 0;
  let o = 0;
  for (const c of s) {
    const v = B64.indexOf(c);
    if (v < 0) throw new ChallengeError("The link has characters that don't belong in it.");
    n = (n << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (n >> bits) & 0xff;
    }
  }
  return out;
}

/**
 * Packs a challenge into link-safe text (spec section 40): the format byte,
 * flags, source and score, the names and the text, then each keystroke as a
 * time step and, unless it's the character the text expects next, the
 * character itself.
 */
export function encodeChallenge(ch: Challenge): string {
  const out: number[] = [CHALLENGE_FORMAT];
  const mode = ERROR_MODES.indexOf(ch.errorMode);
  out.push(mode | (ch.autoIndent ? 4 : 0) | (ch.catchUp ? 8 : 0));
  out.push(CHALLENGE_SOURCES.indexOf(ch.source));
  writeVarint(out, ch.score[0]);
  writeVarint(out, ch.score[1]);
  writeString(out, ch.name);
  writeString(out, ch.opponent);
  writeString(out, ch.target);
  writeVarint(out, ch.events.length);
  let p = 0;
  let prev = 0;
  for (const [t, c] of ch.events) {
    const step = Math.round(t / CHALLENGE_TIME_STEP);
    const match = c !== REPLAY_BACKSPACE && c === ch.target[p];
    writeVarint(out, (step - prev) * 2 + (match ? 1 : 0));
    if (!match) writeString(out, c);
    prev = step;
    p = c === REPLAY_BACKSPACE ? Math.max(0, p - 1) : p + 1;
  }
  return toBase64Url(out);
}

/** Reads a challenge from encodeChallenge's text. Throws ChallengeError when it's damaged, cut off or from a newer version. */
export function decodeChallenge(code: string): Challenge {
  const bytes = fromBase64Url(code.trim());
  let i = 0;
  const byte = () => {
    if (i >= bytes.length) throw new ChallengeError("The link is cut off.");
    return bytes[i++];
  };
  const varint = () => {
    let n = 0;
    let scale = 1;
    for (;;) {
      const b = byte();
      n += (b & 0x7f) * scale;
      if (b < 0x80) return n;
      scale *= 0x80;
      if (scale > 2 ** 35) throw new ChallengeError("The link is damaged.");
    }
  };
  const string = (max: number) => {
    const len = varint();
    if (len > max || i + len > bytes.length) throw new ChallengeError("The link is cut off.");
    const s = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(i, i + len));
    i += len;
    return s;
  };
  const format = byte();
  if (format > CHALLENGE_FORMAT) throw new ChallengeError("This challenge was made by a newer version of AdapType.", true);
  if (format !== CHALLENGE_FORMAT) throw new ChallengeError("The link is damaged.");
  const flags = byte();
  const errorMode = ERROR_MODES[flags & 3];
  const source = CHALLENGE_SOURCES[byte()];
  if (!errorMode || !source || flags > 15) throw new ChallengeError("The link is damaged.");
  const score: [number, number] = [varint(), varint()];
  const name = cleanName(string(4 * CHALLENGE_MAX_NAME * 2));
  const opponent = cleanName(string(4 * CHALLENGE_MAX_NAME * 2));
  const target = string(MAX_STRING_BYTES);
  if (target.length === 0 || target.length > MAX_TARGET) throw new ChallengeError("The link is damaged.");
  const count = varint();
  if (count > MAX_EVENTS) throw new ChallengeError("The link is damaged.");
  const events: [number, string][] = [];
  let p = 0;
  let step = 0;
  for (let k = 0; k < count; k++) {
    const v = varint();
    step += Math.floor(v / 2);
    const c = v % 2 === 1 ? target[p] : string(16);
    if (c === undefined || c.length === 0) throw new ChallengeError("The link is damaged.");
    events.push([step * CHALLENGE_TIME_STEP, c]);
    p = c === REPLAY_BACKSPACE ? Math.max(0, p - 1) : p + 1;
  }
  if (i !== bytes.length) throw new ChallengeError("The link is damaged.");
  const ch: Challenge = { target, errorMode, autoIndent: (flags & 4) !== 0, catchUp: (flags & 8) !== 0, events, source, name, opponent, score };
  if (!challengeRound(ch).done) throw new ChallengeError("The link is damaged.");
  return ch;
}

// --- Racing a challenge. ---

export interface ChallengeGhost {
  /** After each keystroke: its time and the position it left. */
  times: number[];
  positions: number[];
  /** When the sender finished, in ms after their first keystroke. */
  finishMs: number;
  metrics: RoundMetrics;
}

/** The sender's run as a ghost to race. */
export function challengeGhost(ch: Challenge): ChallengeGhost {
  const round = challengeRound({ ...ch, events: [] });
  const times: number[] = [];
  const positions: number[] = [];
  for (const [t, c] of ch.events) {
    round.input(c === REPLAY_BACKSPACE ? { kind: "backspace", t } : { kind: "char", char: c, t });
    times.push(t);
    positions.push(round.position);
    if (round.done) break;
  }
  return { times, positions, finishMs: times[times.length - 1] ?? 0, metrics: round.metrics() };
}

/** Where the ghost is elapsedMs after the race started (its position after the last keystroke by then). */
export function challengeGhostAt(ghost: ChallengeGhost, elapsedMs: number): number {
  let lo = 0;
  let hi = ghost.times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ghost.times[mid] <= elapsedMs) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? 0 : ghost.positions[lo - 1];
}

export interface ChallengeResult {
  outcome: "win" | "loss" | "tie";
  /** Your finish time and the sender's, in ms after each first keystroke. */
  yourMs: number;
  theirMs: number;
  /** The gap between the two finish times. */
  marginMs: number;
  /** The series score after this race: [you, the sender]. */
  score: [number, number];
}

/**
 * Compares your finished round with the sender's run: the faster finish
 * (first keystroke to last) wins. Times compare at CHALLENGE_TIME_STEP, as
 * the link keeps them; the same step is a tie.
 */
export function challengeResult(ch: Challenge, round: TypingRound): ChallengeResult {
  const recs = round.records;
  const raw = recs.length > 0 ? recs[recs.length - 1].t - recs[0].t : 0;
  const yourMs = Math.round(raw / CHALLENGE_TIME_STEP) * CHALLENGE_TIME_STEP;
  const theirMs = challengeGhost(ch).finishMs;
  const outcome = yourMs < theirMs ? "win" : yourMs > theirMs ? "loss" : "tie";
  // The sender's score is first in the link; yours is the opponent's.
  const score: [number, number] = [ch.score[1] + (outcome === "win" ? 1 : 0), ch.score[0] + (outcome === "loss" ? 1 : 0)];
  return { outcome, yourMs, theirMs, marginMs: Math.abs(yourMs - theirMs), score };
}

/**
 * Your run of a challenge, sent back: the same text, the sender as your
 * opponent, and the score so far. input is the raw input that typed round.
 */
export function rematchChallenge(ch: Challenge, round: TypingRound, input: readonly TypingEvent[], name: string): Challenge | null {
  const result = challengeResult(ch, round);
  return makeChallenge(
    { target: ch.target, errorMode: round.mode, catchUp: round.mode === "block" && round.catchUp, autoIndent: round.autoIndent, events: replayEvents(input) },
    "rematch",
    name,
    { opponent: ch.name, score: result.score },
  );
}
