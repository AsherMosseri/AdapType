import { CATCH_UP_KEYS, MAX_INTERVAL_MS } from "./constants";
import type { ErrorMode, KeystrokeRecord, TypingEvent } from "./types";

export interface RoundMetrics {
  /** Characters currently typed correctly, spaces included. */
  correctChars: number;
  /** Character keystrokes made (backspaces not counted). */
  keystrokes: number;
  correctKeystrokes: number;
  /** Positions that were wrong on the first try and are now correct. */
  corrections: number;
  /** Positions whose first attempt was wrong. */
  firstErrors: number;
  /** From the first keystroke to the last, in ms. */
  elapsedMs: number;
  wpm: number;
  /** 0..1 */
  accuracy: number;
}

/**
 * Follows one round of typing: what has been typed, what's right and wrong,
 * and a record of every keystroke.
 */
export class TypingRound {
  target: string;
  readonly mode: ErrorMode;
  /** What's been typed at each position so far. */
  readonly typed: string[] = [];
  readonly records: KeystrokeRecord[] = [];
  private readonly attempted = new Set<number>();
  private readonly firstWrong = new Set<number>();
  private lastT: number | null = null;
  /** True when the previous keystroke was a correct first attempt. */
  private lastWasCleanFirst = false;
  /** Block mode: wrong keys pressed while stuck that match the text right after the stuck letter. */
  private ahead = "";
  /** Block mode: a letter just filled in after a late letter, so pressing it again right away is ignored. */
  private refill: { index: number; char: string } | null = null;

  /**
   * autoIndent: after a correct newline, the spaces that start the next line
   * are filled in automatically (no keystrokes recorded), like a code editor.
   */
  readonly autoIndent: boolean;
  /**
   * Block mode catches up when you've moved on (spec 2.1): a late letter
   * fills in the letters typed ahead of it, and CATCH_UP_KEYS keys that match
   * the text after a stuck letter mark it missed and move on. Off only to
   * replay runs recorded before this existed.
   */
  readonly catchUp: boolean;

  constructor(target: string, mode: ErrorMode, options: { autoIndent?: boolean; catchUp?: boolean } = {}) {
    this.target = target;
    this.mode = mode;
    this.autoIndent = !!options.autoIndent;
    this.catchUp = options.catchUp ?? true;
  }

  get position(): number {
    return this.typed.length;
  }

  get done(): boolean {
    return this.typed.length >= this.target.length;
  }

  isCorrectAt(index: number): boolean {
    return this.typed[index] === this.target[index];
  }

  /** Adds more text to the end (for timed and endless rounds). */
  append(text: string): void {
    this.target += text;
  }

  /** Applies one keystroke. Returns the record for a character, or null. */
  input(event: TypingEvent): KeystrokeRecord | null {
    if (this.done) return null;
    if (event.kind === "backspace") {
      if (this.mode === "backspace" && this.typed.length > 0) this.typed.pop();
      this.lastT = event.t;
      this.lastWasCleanFirst = false;
      return null;
    }
    const actual = event.char ?? "";
    if (actual.length === 0) return null;
    const index = this.typed.length;
    const expected = this.target[index];
    const correct = actual === expected;
    const catchUp = this.mode === "block" && this.catchUp;
    if (catchUp) {
      // Pressing the letter that was just filled in again (fixing it in place) is ignored.
      const refill = this.refill;
      this.refill = null;
      if (refill && refill.index === index - 1 && actual === refill.char && !correct) {
        this.lastT = event.t;
        this.lastWasCleanFirst = false;
        return null;
      }
    }
    const first = !this.attempted.has(index);
    let interval: number | null = null;
    if (this.lastT !== null && this.lastWasCleanFirst) {
      const gap = event.t - this.lastT;
      if (gap >= 0 && gap <= MAX_INTERVAL_MS) interval = gap;
    }
    const record: KeystrokeRecord = { index, expected, actual, t: event.t, correct, first, interval };
    if (event.tap) record.tap = event.tap;
    if (event.shift) record.shift = event.shift;
    if (event.layer) record.layer = true;
    this.records.push(record);
    this.attempted.add(index);
    if (first && !correct) this.firstWrong.add(index);
    if (correct || this.mode !== "block") this.typed.push(actual);
    if (this.autoIndent && correct && actual === "\n") {
      while (this.typed.length < this.target.length && this.target[this.typed.length] === " ") this.typed.push(" ");
    }
    this.lastT = event.t;
    this.lastWasCleanFirst = correct && first;
    if (catchUp) this.catchUpAfter(index, actual, correct);
    return record;
  }

  /** Block mode's catching up, after the keystroke at index (spec 2.1). */
  private catchUpAfter(index: number, actual: string, correct: boolean): void {
    if (correct) {
      // The late letter arrived after the ones typed ahead of it: fill those in too.
      const ahead = this.ahead;
      this.ahead = "";
      if (ahead.length === 0) return;
      for (const ch of ahead) {
        this.attempted.add(this.typed.length);
        this.typed.push(ch);
      }
      this.refill = { index: this.typed.length - 1, char: ahead[ahead.length - 1] };
      return;
    }
    const next = this.ahead + actual;
    this.ahead = this.target.startsWith(next, index + 1) ? next : this.target.startsWith(actual, index + 1) ? actual : "";
    if (this.ahead.length < CATCH_UP_KEYS) return;
    // Moved on without the stuck letter: it's missed, and the keys after the first count where they belong.
    const ahead = this.ahead;
    this.ahead = "";
    this.typed.push(ahead[0]);
    const records = this.records.slice(-ahead.length);
    for (let k = 0; k < ahead.length; k++) {
      const at = index + 1 + k;
      if (k > 0) {
        const r = records[k];
        r.index = at;
        r.expected = this.target[at];
        r.correct = true;
        r.first = !this.attempted.has(at);
        r.interval = null;
      }
      this.attempted.add(at);
      this.typed.push(ahead[k]);
    }
    this.lastWasCleanFirst = true;
  }

  metrics(): RoundMetrics {
    let correctChars = 0;
    for (let i = 0; i < this.typed.length; i++) if (this.typed[i] === this.target[i]) correctChars++;
    let correctKeystrokes = 0;
    for (const r of this.records) if (r.correct) correctKeystrokes++;
    let corrections = 0;
    for (const i of this.firstWrong) if (i < this.typed.length && this.typed[i] === this.target[i]) corrections++;
    const keystrokes = this.records.length;
    const elapsedMs = keystrokes > 1 ? this.records[keystrokes - 1].t - this.records[0].t : 0;
    return {
      correctChars,
      keystrokes,
      correctKeystrokes,
      corrections,
      firstErrors: this.firstWrong.size,
      elapsedMs,
      wpm: computeWpm(correctChars, elapsedMs),
      accuracy: keystrokes > 0 ? correctKeystrokes / keystrokes : 1,
    };
  }
}

/** Words per minute, counting 5 characters as one word. */
export function computeWpm(correctChars: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return correctChars / 5 / (elapsedMs / 60000);
}

/** Converts a per-key interval to the WPM it corresponds to, and back. */
export function msToWpm(ms: number): number {
  return ms > 0 ? 12000 / ms : 0;
}
export function wpmToMs(wpm: number): number {
  return 12000 / wpm;
}
