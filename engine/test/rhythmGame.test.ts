import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  createProfile,
  recordAchievements,
  RHYTHM_BEATS_PER_BAR,
  RHYTHM_MAX_BPM,
  RHYTHM_MIN_BPM,
  RhythmGame,
  rhythmMultiplier,
  rhythmTempo,
  rhythmWindows,
  type AchievementContext,
} from "../src";

const PHRASES = ["the cat sat", "on a mat", "and it was", "very happy"];

/** Types every scheduled note at its time plus offset(i), until the song ends. */
function playAll(game: RhythmGame, offset: (i: number) => number = () => 0, char: (c: string, i: number) => string = (c) => c): void {
  for (let i = 0; !game.done && i < 10000; i++) {
    const note = game.notes[game.cursor];
    game.input(char(note.char, game.cursor), note.t + offset(game.cursor));
  }
}

describe("rhythm tempo", () => {
  it("starts below your speed, on eighths, or sixteenths when fast", () => {
    // 40 WPM: 200 cpm x 0.8 = 160 notes a minute, 80 BPM on eighths.
    expect(rhythmTempo(40)).toEqual({ bpm: 80, notesPerBeat: 2 });
    // 100 WPM: 400 notes a minute would be 200 BPM on eighths, so sixteenths at 100.
    expect(rhythmTempo(100)).toEqual({ bpm: 100, notesPerBeat: 4 });
    expect(rhythmTempo(5).bpm).toBe(RHYTHM_MIN_BPM);
    expect(rhythmTempo(400).bpm).toBe(RHYTHM_MAX_BPM);
  });

  it("has windows that scale with the gap between notes, and caps", () => {
    expect(rhythmWindows(200)).toEqual({ perfect: 40, good: 90 });
    expect(rhythmWindows(1000)).toEqual({ perfect: 60, good: 130 });
  });

  it("multiplies every 10 hits in a row, up to 4", () => {
    expect([0, 9, 10, 25, 30, 100].map(rhythmMultiplier)).toEqual([1, 1, 2, 3, 4, 4]);
  });
});

describe("a rhythm song", () => {
  it("counts in a bar, then puts each character on a note", () => {
    const g = new RhythmGame(PHRASES, 40);
    const bar = (60000 / 80) * RHYTHM_BEATS_PER_BAR;
    expect(g.notes.length).toBe(PHRASES[0].length);
    expect(g.notes[0].t).toBe(bar);
    expect(g.notes[1].t - g.notes[0].t).toBeCloseTo(375);
    expect(g.notes.map((n) => n.char).join("")).toBe(PHRASES[0]);
    expect(g.text).toBe(PHRASES.join(" "));
  });

  it("judges perfect, good, early, wrong and late", () => {
    const g = new RhythmGame(PHRASES, 40);
    const n = g.notes;
    // 375 ms between notes: perfect within 60, good within 130.
    expect(g.input("t", n[0].t + 10)[0].kind).toBe("perfect");
    expect(g.input("h", n[1].t - 100)[0].kind).toBe("good");
    expect(g.input("e", n[2].t - 200)[0]).toMatchObject({ kind: "miss", reason: "early" });
    expect(g.input("x", n[3].t)[0]).toMatchObject({ kind: "miss", reason: "wrong" });
    // Nothing typed for note 4: missed once its window passes.
    expect(g.update(n[4].t + 120)).toEqual([]);
    expect(g.update(n[4].t + 140)[0]).toMatchObject({ note: 4, kind: "miss", reason: "late" });
    // A key over a whole note early is ignored.
    expect(g.input("a", n[5].t - 400)).toEqual([]);
    expect(g.cursor).toBe(5);
    expect(g.counts).toEqual({ perfect: 1, good: 1, miss: 3 });
    expect(g.records.map((r) => r.correct)).toEqual([true, true, true, false]);
    expect(g.records.every((r) => r.interval === null && r.first)).toBe(true);
  });

  it("scores with a growing multiplier and resets the combo on a miss", () => {
    const g = new RhythmGame(["abcdefghijklmnop"], 40);
    for (let i = 0; i < 12; i++) g.input(g.notes[i].char, g.notes[i].t);
    // 10 perfects at x1, then 2 at x2.
    expect(g.score).toBe(10 * 100 + 2 * 200);
    expect(g.combo).toBe(12);
    g.input("z", g.notes[12].t);
    expect(g.combo).toBe(0);
    expect(g.maxCombo).toBe(12);
  });

  it("goes up a level after a clean phrase, with a bar of rest at the old tempo", () => {
    const g = new RhythmGame(PHRASES, 40);
    const bar = g.barMs();
    playAll(g);
    expect(g.done).toBe(true);
    expect(g.counts.miss).toBe(0);
    expect(g.phraseResults.map((r) => r.change)).toEqual(["up", "up", "up", "up"]);
    expect(g.level).toBe(5);
    expect(g.topLevel).toBe(5);
    // Phrase 1 starts after phrase 0's bars and one more bar, at level 2's tempo.
    const p0 = g.notes.filter((n) => n.phrase === 0);
    const p1 = g.notes.filter((n) => n.phrase === 1);
    const bars0 = Math.ceil((p0.length * (60000 / 160)) / bar);
    expect(p1[0].t).toBeCloseTo(p0[0].t + bars0 * bar + bar);
    expect(g.segments[1]).toEqual({ t: p1[0].t, bpm: g.bpmAt(2), level: 2 });
    expect(p1[1].t - p1[0].t).toBeCloseTo(60000 / (g.bpmAt(2) * 2));
    expect(g.endT).not.toBeNull();
  });

  it("goes down a level after a poor phrase, but not below 1", () => {
    const g = new RhythmGame(PHRASES, 40);
    // Clean first phrase (level 2), then type nothing at all.
    for (const n of g.notes.slice()) g.input(n.char, n.t);
    expect(g.level).toBe(2);
    g.update(1e9);
    expect(g.phraseResults[1].change).toBe("down");
    expect(g.done).toBe(true);
    expect(g.level).toBe(1);
    expect(g.phraseResults.slice(2).every((r) => r.change === null && r.hits === 0)).toBe(true);
    expect(g.counts.miss).toBe(g.notes.length - PHRASES[0].length);
  });

  it("keeps 'up' at the top tempo from going past the maximum", () => {
    const g = new RhythmGame(Array.from({ length: 6 }, () => "ab"), 380);
    playAll(g);
    expect(g.bpm).toBe(RHYTHM_MAX_BPM);
    expect(g.phraseResults.every((r) => r.change === null)).toBe(true);
  });
});

describe("rhythm badges", () => {
  const ctx: AchievementContext = { day: "2026-05-10", hour: 12, theme: "clean", dark: false, sound: false };
  it("tracks the best combo, and a song with no misses is a full combo", () => {
    const s = createProfile("physical", 3);
    const first = recordAchievements(s, { kind: "rhythm", score: 9000, maxCombo: 30, misses: 2, notes: 90 }, ctx, 1);
    expect(first).toContain("groove-bronze");
    expect(first).not.toContain("full-combo");
    const second = recordAchievements(s, { kind: "rhythm", score: 9000, maxCombo: 12, misses: 0, notes: 12 }, ctx, 2);
    expect(second).toContain("full-combo");
    expect(s.achievements.counters.bestCombo).toBe(30);
    expect(ACHIEVEMENTS.some((a) => a.id === "groove-gold")).toBe(true);
  });
});
