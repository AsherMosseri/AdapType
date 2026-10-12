import { describe, expect, it } from "vitest";
import blocklist from "../../content/blocklist.json";
import pack from "../../content/words-en.json";
import {
  addSample,
  completeRound,
  computeScores,
  createProfile,
  emptyStat,
  finishCalibrationTest,
  focusLetter,
  generateWords,
  makeUpWord,
  meetsMastery,
  planWords,
  Rng,
  setUnlockOrder,
  skipCalibration,
  suggestGoalWpm,
  TypingRound,
  UNLOCK_ORDERS,
  weakness,
  wordPool,
  type ProfileState,
} from "../src";
import { simulateTyping, type Typist } from "./simulate";

const fast: Typist = { msPerKey: 150, errorRate: 0, seed: 1 };

function playRound(state: ProfileState, typist: Typist, count = 15, calibrationTest = false) {
  const words = planWords(state, { pack, blocklist, count, calibrationTest });
  const target = words.map((w) => w.text).join(" ");
  const round = new TypingRound(target, "backspace");
  for (const e of simulateTyping(target, typist)) round.input(e);
  return completeRound(state, round, 0, { calibrationTest });
}

describe("Rng", () => {
  it("is deterministic and in range", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) {
      const x = a.next();
      expect(x).toBe(b.next());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("weightedIndex never picks a zero weight", () => {
    const rng = new Rng(7);
    for (let i = 0; i < 200; i++) expect(rng.weightedIndex([0, 1, 0, 3])).not.toBe(0);
    expect(rng.weightedIndex([0, 0])).toBe(-1);
  });
});

describe("TypingRound", () => {
  it("backspace mode lets you fix errors and counts corrections", () => {
    const round = new TypingRound("cat", "backspace");
    round.input({ kind: "char", char: "c", t: 0 });
    round.input({ kind: "char", char: "x", t: 100 });
    round.input({ kind: "backspace", t: 200 });
    round.input({ kind: "char", char: "a", t: 300 });
    round.input({ kind: "char", char: "t", t: 400 });
    expect(round.done).toBe(true);
    const m = round.metrics();
    expect(m.correctChars).toBe(3);
    expect(m.corrections).toBe(1);
    expect(m.accuracy).toBeCloseTo(3 / 4);
    // The retyped "a" isn't a first attempt and has no clean interval.
    expect(round.records[2]).toMatchObject({ first: false, interval: null });
    // "t" follows a non-first keystroke, so it has no clean interval either.
    expect(round.records[3].interval).toBeNull();
  });

  it("block mode doesn't advance on a wrong key", () => {
    const round = new TypingRound("ab", "block");
    round.input({ kind: "char", char: "x", t: 0 });
    expect(round.position).toBe(0);
    round.input({ kind: "char", char: "a", t: 100 });
    round.input({ kind: "char", char: "b", t: 200 });
    expect(round.done).toBe(true);
    expect(round.metrics().correctChars).toBe(2);
  });

  it("skip mode keeps errors and ignores backspace", () => {
    const round = new TypingRound("ab", "skip");
    round.input({ kind: "char", char: "x", t: 0 });
    round.input({ kind: "backspace", t: 50 });
    round.input({ kind: "char", char: "b", t: 100 });
    expect(round.done).toBe(true);
    expect(round.metrics().correctChars).toBe(1);
  });

  it("drops pauses longer than 2 seconds from intervals", () => {
    const round = new TypingRound("ab", "backspace");
    round.input({ kind: "char", char: "a", t: 0 });
    round.input({ kind: "char", char: "b", t: 5000 });
    expect(round.records[1].interval).toBeNull();
  });

  it("computes WPM from correct characters", () => {
    const round = new TypingRound("aaaaaaaaaaa", "backspace");
    for (let i = 0; i <= 10; i++) round.input({ kind: "char", char: "a", t: i * 600 });
    // 11 chars over 6 s = 2.2 words / 0.1 min = 22 WPM.
    expect(round.metrics().wpm).toBeCloseTo(22);
  });
});

describe("stats and scoring", () => {
  it("averages plainly for the first samples", () => {
    const s = emptyStat();
    addSample(s, false, 100);
    addSample(s, true, 300);
    expect(s.msAvg).toBeCloseTo(200);
    expect(s.errAvg).toBeCloseTo(0.5);
  });

  it("scores an at-goal key as 0 and an unseen key as 1", () => {
    const goal = { wpm: 40, accuracy: 0.95 };
    expect(weakness({ n: 50, timedN: 50, msAvg: 250, errAvg: 0 }, goal)).toBe(0);
    expect(weakness(undefined, goal)).toBe(1);
    // Twice the goal interval and 10% errors: 1 + 1.
    expect(weakness({ n: 50, timedN: 50, msAvg: 600, errAvg: 0.1 }, goal)).toBeCloseTo(2);
  });
});

describe("word generation", () => {
  it("uses only unlocked letters", () => {
    const letters = "etaoinsh".split("");
    const state = createProfile("physical", 1);
    state.unlocked = letters;
    const scores = computeScores(state, { wpm: 40, accuracy: 0.95 });
    const words = generateWords({ pack, blocklist, letters, scores, count: 50, rng: new Rng(3) });
    for (const w of words) for (const ch of w.text) expect(letters).toContain(ch);
  });

  it("fills in made-up words when few real words fit", () => {
    const letters = UNLOCK_ORDERS.homeRow.slice(0, 6).split("");
    expect(wordPool(pack, letters).length).toBeLessThan(60);
    const state = createProfile("physical", 1, "homeRow");
    const scores = computeScores(state, { wpm: 40, accuracy: 0.95 });
    const words = generateWords({ pack, blocklist, letters, scores, count: 40, rng: new Rng(9) });
    expect(words.some((w) => w.madeUp)).toBe(true);
  });

  it("never makes up a blocked word", () => {
    const letters = "shitfuckcn".split("");
    const scores = { keys: {}, pairs: {} };
    const rng = new Rng(5);
    for (let i = 0; i < 300; i++) {
      const w = makeUpWord(letters, scores, blocklist, pack, rng).text;
      expect(blocklist.roots.some((r) => w.includes(r))).toBe(false);
      expect(blocklist.words).not.toContain(w);
    }
  });

  it("leans toward weak letters", () => {
    const state = createProfile("physical", 1);
    state.goal = { wpm: 40, accuracy: 0.95 };
    for (const l of state.unlocked) state.keys[l] = { n: 100, timedN: 100, msAvg: 200, errAvg: 0 };
    state.keys.o = { n: 100, timedN: 100, msAvg: 700, errAvg: 0.2 };
    const words = planWords(state, { pack, blocklist, count: 200 });
    const share = words.filter((w) => w.text.includes("o")).length / words.length;
    const baseline = wordPool(pack, state.unlocked).filter((w) => w.text.includes("o")).length /
      wordPool(pack, state.unlocked).length;
    expect(share).toBeGreaterThan(baseline);
  });
});

describe("unlocking", () => {
  it("starts with 6 letters and unlocks the next after mastery", () => {
    const state = createProfile("physical", 11);
    state.goal = { wpm: 30, accuracy: 0.95 };
    state.calibration = "done";
    expect(state.unlocked).toEqual(["e", "t", "a", "o", "i", "n"]);
    let unlocked: string | null = null;
    for (let i = 0; i < 6 && !unlocked; i++) unlocked = playRound(state, fast).newlyUnlocked;
    expect(unlocked).toBe("s");
    expect(focusLetter(state)).toBe("s");
  });

  it("doesn't unlock for a slow typist", () => {
    const state = createProfile("physical", 11);
    state.goal = { wpm: 60, accuracy: 0.95 };
    state.calibration = "done";
    for (let i = 0; i < 5; i++) playRound(state, { msPerKey: 400, errorRate: 0, seed: i });
    expect(state.unlocked.length).toBe(6);
  });

  it("needs 3 rounds of history for mastery", () => {
    const entry = { n: 10, correct: 10, msTotal: 1000, msN: 10 };
    const goal = { wpm: 40, accuracy: 0.95 };
    expect(meetsMastery([entry, entry], goal)).toBe(false);
    expect(meetsMastery([entry, entry, entry], goal)).toBe(true);
  });

  it("keeps mastered letters when switching unlock order", () => {
    const state = createProfile("physical", 1);
    state.mastered = ["e", "t", "a", "o", "i", "n"];
    state.unlocked = [...state.mastered, "s"];
    setUnlockOrder(state, "homeRow");
    for (const l of ["e", "t", "a", "o", "i", "n", "s", "d", "f", "j", "k"]) expect(state.unlocked).toContain(l);
  });
});

describe("calibration", () => {
  it("tests out letters a fast typist already knows", () => {
    const state = createProfile("physical", 5);
    for (let i = 0; i < 3; i++) playRound(state, fast, 40, true);
    const testedOut = finishCalibrationTest(state, { wpm: 40, accuracy: 0.95 });
    expect(testedOut.length).toBeGreaterThan(10);
    expect(state.unlocked.length).toBeGreaterThan(START);
  });

  it("silent calibration uses all letters, then tests out", () => {
    const state = createProfile("physical", 5);
    state.goal = { wpm: 40, accuracy: 0.95 };
    skipCalibration(state);
    const words = planWords(state, { pack, blocklist, count: 30 });
    expect(words.some((w) => [...w.text].some((c) => !state.unlocked.includes(c)))).toBe(true);
    playRound(state, fast, 40);
    playRound(state, fast, 40);
    expect(state.calibration).toBe("done");
    expect(state.unlocked.length).toBeGreaterThan(START);
  });

  it("suggests a goal 20% above measured speed", () => {
    expect(suggestGoalWpm(50)).toBe(60);
    expect(suggestGoalWpm(3)).toBe(15);
  });
});

const START = 6;
