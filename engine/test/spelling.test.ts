import { describe, expect, it } from "vitest";
import spellingJson from "../../content/spelling.json";
import {
  checkSpelling,
  completeSpelling,
  createProfile,
  homophoneSet,
  lcsMatch,
  migrateProfile,
  normalizeWord,
  pickSpelling,
  recordAchievements,
  Rng,
  shuffle,
  spellableWord,
  SPELLING_MISSED_MAX,
  SPELLING_MISSED_PER_SESSION,
  SPELLING_SENTENCES,
  SPELLING_WORDS,
  SpellingSession,
  type AchievementContext,
  type SpellingContent,
} from "../src";

const content = spellingJson as SpellingContent;

describe("spelling content", () => {
  it("has tricky words that can all be asked by ear, with no repeats", () => {
    const hom = homophoneSet(content);
    expect(content.tricky.every((w) => spellableWord(w, hom))).toBe(true);
    expect(new Set(content.tricky).size).toBe(content.tricky.length);
    expect(content.sentences.length).toBeGreaterThanOrEqual(SPELLING_SENTENCES * 4);
  });

  it("never asks a sound-alike, a short word or a word with other characters", () => {
    const hom = homophoneSet(content);
    expect(["there", "their", "weather", "write"].some((w) => spellableWord(w, hom))).toBe(false);
    expect(spellableWord("ox", hom)).toBe(false);
    expect(spellableWord("don't", hom)).toBe(false);
    expect(spellableWord("garden", hom)).toBe(true);
  });
});

describe("picking items", () => {
  it("shuffles deterministically and keeps every item", () => {
    const a = shuffle([1, 2, 3, 4, 5, 6], new Rng(7));
    expect(a).toEqual(shuffle([1, 2, 3, 4, 5, 6], new Rng(7)));
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("puts missed words first, then candidates, skipping sound-alikes and repeats", () => {
    const s = createProfile("physical", 1);
    s.spelling.missed = ["necessary", "their", "rhythm", "separate", "weird"];
    const weak = ["there", "garden", "rhythm", "planet", "it", "garden", "window", "friendly", "number", "silver", "basket", "forest", "candle", "pocket"];
    const items = pickSpelling(s, content, "weak", weak, new Rng(1));
    expect(items.slice(0, SPELLING_MISSED_PER_SESSION)).toEqual(["necessary", "rhythm", "separate"]);
    expect(items.slice(3)).toEqual(["garden", "planet", "window", "friendly", "number", "silver", "basket"]);
    expect(items.length).toBe(SPELLING_WORDS);
  });

  it("draws tricky words and sentences at random", () => {
    const s = createProfile("physical", 1);
    const tricky = pickSpelling(s, content, "tricky", [], new Rng(3));
    expect(tricky.length).toBe(SPELLING_WORDS);
    expect(tricky.every((w) => content.tricky.includes(w))).toBe(true);
    expect(pickSpelling(s, content, "tricky", [], new Rng(4))).not.toEqual(tricky);
    const sentences = pickSpelling(s, content, "sentences", [], new Rng(3));
    expect(sentences.length).toBe(SPELLING_SENTENCES);
    expect(sentences.every((x) => content.sentences.includes(x))).toBe(true);
  });
});

describe("checking answers", () => {
  it("compares words without case or surrounding spaces, and marks the letters typed", () => {
    expect(checkSpelling("necessary", " Necessary ", "word").correct).toBe(true);
    const c = checkSpelling("necessary", "neccesary", "word");
    expect(c.correct).toBe(false);
    // n e c e s s a r y: the typed word has every letter but the second s in place.
    expect(c.letters).toEqual([true, true, true, true, true, false, true, true, true]);
  });

  it("compares sentences by their words, not case, punctuation or spacing", () => {
    const target = "We need eggs, milk, and a loaf of bread.";
    expect(checkSpelling(target, "we need eggs milk and a loaf of bread", "sentence").correct).toBe(true);
    expect(checkSpelling(target, "We  need eggs, milk and a loaf of bread!", "sentence").correct).toBe(true);
    const c = checkSpelling(target, "We need egs, milk, and loaf of bread.", "sentence");
    expect(c.correct).toBe(false);
    expect(c.words!.filter((w) => !w.ok).map((w) => w.word)).toEqual(["eggs,", "a"]);
    // An extra word is wrong too.
    expect(checkSpelling(target, "We need eggs, milk, and a loaf of bread please.", "sentence").correct).toBe(false);
    expect(normalizeWord("Don’t!")).toBe("don't");
  });

  it("finds a longest common subsequence", () => {
    expect(lcsMatch([..."abcde"], [..."ace"])).toEqual([true, false, true, false, true]);
    expect(lcsMatch([..."abc"], [])).toEqual([false, false, false]);
  });
});

describe("a session", () => {
  it("asks a missed item once more at the end, counting only the first try", () => {
    const session = new SpellingSession(["rhythm", "garden", "weird"], "tricky");
    expect(session.current!.text).toBe("rhythm");
    expect(session.answer("rythm").correct).toBe(false);
    expect(session.answer("garden").correct).toBe(true);
    expect(session.answer("wierd").correct).toBe(false);
    expect(session.current!.text).toBe("rhythm");
    expect(session.retrying).toBe(true);
    expect(session.answer("rhythm").correct).toBe(true);
    expect(session.answer("wierd").correct).toBe(false);
    expect(session.done).toBe(true);
    expect(session.correct).toBe(1);
    expect(session.results.map((r) => r.attempts)).toEqual([["rythm", "rhythm"], ["garden"], ["wierd", "wierd"]]);
  });

  it("remembers missed words, newest first, and drops ones spelled right later", () => {
    const s = createProfile("physical", 1);
    s.spelling.missed = ["garden", "planet"];
    const session = new SpellingSession(["garden", "rhythm", "weird"], "weak");
    session.answer("garden");
    session.answer("rythm");
    session.answer("wierd");
    const out = completeSpelling(s, session);
    expect(out).toEqual({ correct: 1, total: 3, missed: ["rhythm", "weird"], learned: ["garden"] });
    expect(s.spelling.missed).toEqual(["weird", "rhythm", "planet"]);
    expect(s.spelling.sessions).toBe(1);
    // The list keeps SPELLING_MISSED_MAX.
    s.spelling.missed = Array.from({ length: SPELLING_MISSED_MAX }, (_, i) => `word${"abcdefghijklmnopqrstuvwxyzabcd"[i]}`);
    const again = new SpellingSession(["rhythm"], "weak");
    again.answer("rhytm");
    completeSpelling(s, again);
    expect(s.spelling.missed.length).toBe(SPELLING_MISSED_MAX);
    expect(s.spelling.missed[0]).toBe("rhythm");
  });

  it("leaves the missed list alone for sentences", () => {
    const s = createProfile("physical", 1);
    const session = new SpellingSession(["The rain kept falling all night long."], "sentences");
    expect(session.kind).toBe("sentence");
    session.answer("the rain kept faling all night long");
    expect(completeSpelling(s, session).missed).toEqual(["The rain kept falling all night long."]);
    expect(s.spelling.missed).toEqual([]);
  });

  it("migrates profiles from version 9", () => {
    const old = createProfile("physical", 2) as unknown as Record<string, unknown>;
    delete old.spelling;
    old.version = 9;
    const p = migrateProfile(old);
    expect(p.version).toBe(10);
    expect(p.spelling).toEqual({ missed: [], sessions: 0 });
  });
});

describe("spelling badges", () => {
  const ctx: AchievementContext = { day: "2026-05-10", hour: 12, theme: "clean", dark: false, sound: false };
  it("counts items right first try, and a perfect tricky session is a spelling bee", () => {
    const s = createProfile("physical", 3);
    expect(recordAchievements(s, { kind: "spelling", source: "weak", correct: 10, total: 10 }, ctx, 1)).not.toContain("spelling-bee");
    s.achievements.counters.spelled = 20;
    const earned = recordAchievements(s, { kind: "spelling", source: "tricky", correct: 10, total: 10 }, ctx, 2);
    expect(earned).toContain("spelling-bronze");
    expect(earned).toContain("spelling-bee");
    expect(s.achievements.counters.spelled).toBe(30);
  });
});
