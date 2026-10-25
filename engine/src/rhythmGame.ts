// Rhythm mode (phase 8): words scroll to a beat and each character lands on
// one, like a rhythm game. Perfect, good or miss for each key, combos for
// unbroken streaks, and the tempo goes up a level when you keep up. Times are
// ms from the start of the song. See spec section 41.

import type { KeystrokeRecord, TapPoint } from "./types";

/** Phrases in a song, and words in a phrase. */
export const RHYTHM_PHRASES = 8;
export const RHYTHM_PHRASE_WORDS = 5;
export const RHYTHM_BEATS_PER_BAR = 4;
/** The song starts at this share of your typing speed: keeping time is harder than typing freely. */
export const RHYTHM_START_FACTOR = 0.8;
export const RHYTHM_MIN_BPM = 50;
export const RHYTHM_MAX_BPM = 200;
/** Characters land on eighth notes unless that would need more beats per minute than this; then sixteenths. */
export const RHYTHM_EIGHTHS_MAX_BPM = 150;
/** Each level is this much faster. */
export const RHYTHM_LEVEL_STEP = 1.06;
/** A phrase with this share of hits or more goes up a level; under RHYTHM_LEVEL_DOWN, down one. */
export const RHYTHM_LEVEL_UP = 0.9;
export const RHYTHM_LEVEL_DOWN = 0.6;
/** Hit windows: a share of the time between notes, capped in ms. */
export const RHYTHM_PERFECT = 0.2;
export const RHYTHM_PERFECT_MAX_MS = 60;
export const RHYTHM_GOOD = 0.45;
export const RHYTHM_GOOD_MAX_MS = 130;
export const RHYTHM_PERFECT_POINTS = 100;
export const RHYTHM_GOOD_POINTS = 50;
/** The multiplier grows by 1 every RHYTHM_COMBO_STEP hits in a row, up to RHYTHM_MAX_MULTIPLIER. */
export const RHYTHM_COMBO_STEP = 10;
export const RHYTHM_MAX_MULTIPLIER = 4;

export type RhythmJudgment = "perfect" | "good" | "miss";

export interface RhythmTempo {
  bpm: number;
  /** 2 for eighth notes, 4 for sixteenths. */
  notesPerBeat: number;
}

export interface RhythmNote {
  char: string;
  /** When it should be typed. */
  t: number;
  phrase: number;
  /** Position in the song's text (the phrases joined by spaces). */
  index: number;
  judged: { kind: RhythmJudgment; reason?: "early" | "wrong" | "late"; offset: number | null; actual: string | null } | null;
}

/** From t on, the beat runs at this tempo (each phrase's tempo starts with it; the count-in starts the first). */
export interface RhythmSegment {
  t: number;
  bpm: number;
  level: number;
}

export interface RhythmPhraseResult {
  phrase: number;
  hits: number;
  notes: number;
  /** The level for the next phrase, and whether it changed. */
  level: number;
  change: "up" | "down" | null;
}

export interface RhythmHit {
  note: number;
  kind: RhythmJudgment;
  reason?: "early" | "wrong" | "late";
  /** Points this hit scored, with the multiplier. */
  points: number;
  combo: number;
}

/** The starting tempo for a typing speed: RHYTHM_START_FACTOR of it, in characters per minute, on eighths or sixteenths. */
export function rhythmTempo(wpm: number): RhythmTempo {
  const cpm = Math.max(1, wpm) * 5 * RHYTHM_START_FACTOR;
  const notesPerBeat = cpm / 2 <= RHYTHM_EIGHTHS_MAX_BPM ? 2 : 4;
  const bpm = Math.min(RHYTHM_MAX_BPM, Math.max(RHYTHM_MIN_BPM, Math.round(cpm / notesPerBeat)));
  return { bpm, notesPerBeat };
}

/** Hit windows for a note interval: perfect and good, in ms either side of the beat. */
export function rhythmWindows(noteMs: number): { perfect: number; good: number } {
  return { perfect: Math.min(RHYTHM_PERFECT * noteMs, RHYTHM_PERFECT_MAX_MS), good: Math.min(RHYTHM_GOOD * noteMs, RHYTHM_GOOD_MAX_MS) };
}

/** The multiplier for a hit made with this many hits in a row before it. */
export function rhythmMultiplier(combo: number): number {
  return Math.min(RHYTHM_MAX_MULTIPLIER, 1 + Math.floor(combo / RHYTHM_COMBO_STEP));
}

export class RhythmGame {
  readonly phrases: readonly string[];
  /** The phrases joined by spaces; notes and records index into it. */
  readonly text: string;
  readonly notesPerBeat: number;
  /** Level 1's tempo. */
  readonly baseBpm: number;
  readonly notes: RhythmNote[] = [];
  readonly segments: RhythmSegment[] = [];
  readonly phraseResults: RhythmPhraseResult[] = [];
  /** Keystrokes judged against a note, for key stats (no intervals: the beat sets the pace). */
  readonly records: KeystrokeRecord[] = [];
  /** The next note to judge. */
  cursor = 0;
  level = 1;
  topLevel = 1;
  combo = 0;
  maxCombo = 0;
  score = 0;
  readonly counts: Record<RhythmJudgment, number> = { perfect: 0, good: 0, miss: 0 };
  /** When the song's closing bar ends, once the last phrase is scheduled. */
  endT: number | null = null;
  /** True once every note is judged. */
  done = false;
  private phraseStart = 0;
  private phraseOffsets: number[] = [];

  constructor(phrases: readonly string[], wpm: number) {
    if (phrases.length === 0 || phrases.some((p) => p.length === 0)) throw new Error("Rhythm mode needs phrases");
    this.phrases = phrases;
    this.text = phrases.join(" ");
    let offset = 0;
    for (const p of phrases) {
      this.phraseOffsets.push(offset);
      offset += p.length + 1;
    }
    const tempo = rhythmTempo(wpm);
    this.notesPerBeat = tempo.notesPerBeat;
    this.baseBpm = tempo.bpm;
    this.segments.push({ t: 0, bpm: this.bpm, level: 1 });
    // One bar of count-in, then the first phrase.
    this.schedule(0, this.barMs());
  }

  /** The tempo at a level. */
  bpmAt(level: number): number {
    return Math.min(RHYTHM_MAX_BPM, Math.max(RHYTHM_MIN_BPM, Math.round(this.baseBpm * RHYTHM_LEVEL_STEP ** (level - 1))));
  }

  get bpm(): number {
    return this.bpmAt(this.level);
  }

  /** Time between notes at the current level. */
  noteMs(level = this.level): number {
    return 60000 / (this.bpmAt(level) * this.notesPerBeat);
  }

  barMs(level = this.level): number {
    return (60000 / this.bpmAt(level)) * RHYTHM_BEATS_PER_BAR;
  }

  /** The tempo segment in effect at t. */
  segmentAt(t: number): RhythmSegment {
    let s = this.segments[0];
    for (const seg of this.segments) if (seg.t <= t) s = seg;
    return s;
  }

  /** Hits so far as a share of notes judged (1 before any). */
  get accuracy(): number {
    const judged = this.counts.perfect + this.counts.good + this.counts.miss;
    return judged === 0 ? 1 : (this.counts.perfect + this.counts.good) / judged;
  }

  private schedule(phrase: number, start: number): void {
    const ms = this.noteMs();
    const text = this.phrases[phrase];
    this.phraseStart = start;
    for (let i = 0; i < text.length; i++) {
      this.notes.push({ char: text[i], t: start + i * ms, phrase, index: this.phraseOffsets[phrase] + i, judged: null });
    }
  }

  /** Judges the note at the cursor and moves on. */
  private judge(kind: RhythmJudgment, reason: RhythmHit["reason"], offset: number | null, actual: string | null): RhythmHit {
    const index = this.cursor;
    const note = this.notes[index];
    note.judged = { kind, reason, offset, actual };
    this.counts[kind] += 1;
    let points = 0;
    if (kind === "miss") this.combo = 0;
    else {
      points = (kind === "perfect" ? RHYTHM_PERFECT_POINTS : RHYTHM_GOOD_POINTS) * rhythmMultiplier(this.combo);
      this.score += points;
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    }
    this.cursor += 1;
    const next = this.notes[this.cursor];
    if (!next || next.phrase !== note.phrase) this.finishPhrase(note.phrase);
    return { note: index, kind, reason, points, combo: this.combo };
  }

  /**
   * At the end of a phrase: change level by its hit rate, then schedule the
   * next phrase after a bar of rest (the tempo changes when it starts), or
   * close the song.
   */
  private finishPhrase(phrase: number): void {
    const notes = this.notes.filter((n) => n.phrase === phrase);
    const hits = notes.filter((n) => n.judged && n.judged.kind !== "miss").length;
    const rate = hits / notes.length;
    const before = this.level;
    // Bars the phrase took at its own tempo, then one bar of rest.
    const restStart = this.phraseStart + Math.ceil((notes.length * this.noteMs()) / this.barMs()) * this.barMs();
    const nextStart = restStart + this.barMs();
    let change: RhythmPhraseResult["change"] = null;
    if (rate >= RHYTHM_LEVEL_UP && this.bpmAt(this.level + 1) > this.bpm) {
      this.level += 1;
      change = "up";
    } else if (rate < RHYTHM_LEVEL_DOWN && this.level > 1) {
      this.level -= 1;
      change = "down";
    }
    this.topLevel = Math.max(this.topLevel, this.level);
    this.phraseResults.push({ phrase, hits, notes: notes.length, level: this.level, change });
    if (phrase + 1 < this.phrases.length) {
      if (this.level !== before) this.segments.push({ t: nextStart, bpm: this.bpm, level: this.level });
      this.schedule(phrase + 1, nextStart);
    } else {
      this.endT = nextStart;
      this.done = true;
    }
  }

  /** Misses every note whose good window has passed by t. Returns the judgments made. */
  update(t: number): RhythmHit[] {
    const out: RhythmHit[] = [];
    while (!this.done && this.cursor < this.notes.length) {
      const note = this.notes[this.cursor];
      if (t <= note.t + rhythmWindows(this.noteMs(this.levelOf(note))).good) break;
      out.push(this.judge("miss", "late", null, null));
    }
    return out;
  }

  /** The level a note was scheduled at. */
  private levelOf(note: RhythmNote): number {
    return this.segmentAt(note.t).level;
  }

  /**
   * A key typed at t. Notes whose window has passed are missed first. A key
   * more than a whole note interval early is ignored (null); otherwise it's
   * judged against the next note: right key inside the windows is perfect or
   * good, a wrong key is a miss, and the right key too early is a miss.
   */
  input(char: string, t: number, extra: { tap?: TapPoint; layer?: boolean; shift?: "left" | "right" } = {}): RhythmHit[] {
    const out = this.update(t);
    if (this.done || this.cursor >= this.notes.length) return out;
    const note = this.notes[this.cursor];
    const ms = this.noteMs(this.levelOf(note));
    const offset = t - note.t;
    if (offset < -ms) return out;
    const w = rhythmWindows(ms);
    const correct = char === note.char;
    this.records.push({ index: note.index, expected: note.char, actual: char, t, correct, first: true, interval: null, ...extra });
    if (!correct) out.push(this.judge("miss", "wrong", offset, char));
    else if (offset < -w.good) out.push(this.judge("miss", "early", offset, char));
    else out.push(this.judge(Math.abs(offset) <= w.perfect ? "perfect" : "good", undefined, offset, char));
    return out;
  }

  /** Words-per-minute the top level's tempo asks for. */
  get topWpm(): number {
    return (this.bpmAt(this.topLevel) * this.notesPerBeat) / 5;
  }
}
