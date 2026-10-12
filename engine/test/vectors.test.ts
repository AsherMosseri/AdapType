// Shared test vectors. Each file in engine/vectors holds inputs and the
// expected outputs. Every port (web, Swift, Kotlin) must reproduce them.
// Run `npm run vectors` to regenerate after an intentional engine change.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import blocklist from "../../content/blocklist.json";
import fullPack from "../../content/words-en.json";
import {
  applyRecords,
  completeRound,
  computeScores,
  createProfile,
  deriveSeed,
  finishCalibrationTest,
  generateWords,
  hashString,
  planWords,
  Rng,
  skipCalibration,
  TypingRound,
  weakness,
  type ErrorMode,
  type Goal,
  type ProfileState,
  type StatEntry,
  type TypingEvent,
  type UnlockOrder,
} from "../src";
import { simulateTyping } from "./simulate";

const DIR = join(__dirname, "..", "vectors");
const UPDATE = process.env.UPDATE_VECTORS === "1";
/** Vectors use the first 2,000 words of content/words-en.json (version 1). */
const PACK_SIZE = 2000;
const pack = { words: fullPack.words.slice(0, PACK_SIZE) };

function check(name: string, build: () => unknown) {
  it(name, () => {
    const path = join(DIR, `${name}.json`);
    const actual = JSON.parse(JSON.stringify(build()));
    if (UPDATE || !existsSync(path)) {
      writeFileSync(path, JSON.stringify(actual, null, 1) + "\n");
      return;
    }
    const expected = JSON.parse(readFileSync(path, "utf-8"));
    expectClose(actual, expected, "$");
  });
}

/** Deep equality, with numbers compared to 1e-9. */
function expectClose(actual: unknown, expected: unknown, path: string): void {
  if (typeof expected === "number" && typeof actual === "number") {
    expect(Math.abs(actual - expected), path).toBeLessThan(1e-9);
  } else if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    expect((actual as unknown[]).length, path).toBe(expected.length);
    expected.forEach((e, i) => expectClose((actual as unknown[])[i], e, `${path}[${i}]`));
  } else if (expected && typeof expected === "object") {
    expect(Object.keys(actual as object).sort(), path).toEqual(Object.keys(expected).sort());
    for (const k of Object.keys(expected)) {
      expectClose((actual as Record<string, unknown>)[k], (expected as Record<string, unknown>)[k], `${path}.${k}`);
    }
  } else {
    expect(actual, path).toEqual(expected);
  }
}

describe("test vectors", () => {
  check("rng", () => ({
    hashString: ["", "a", "adaptype", "physical|0|0"].map((input) => ({ input, output: hashString(input) })),
    deriveSeed: [{ parts: [12345, 3, 0], output: deriveSeed(12345, 3, 0) }],
    mulberry32: [0, 1, 42, 4294967295].map((seed) => {
      const rng = new Rng(seed);
      return { seed, outputs: Array.from({ length: 8 }, () => rng.next()) };
    }),
    weightedIndex: [{ seed: 99, weights: [1, 0, 2, 5, 0.5], picks: pickMany(99, [1, 0, 2, 5, 0.5], 12) }],
  }));

  check("typing", () => {
    const cases: { name: string; target: string; mode: ErrorMode; events: TypingEvent[] }[] = [
      {
        name: "clean",
        target: "on it",
        mode: "backspace",
        events: chars("on it", 100, 120),
      },
      {
        name: "backspace fix",
        target: "cat",
        mode: "backspace",
        events: [
          { kind: "char", char: "c", t: 0 },
          { kind: "char", char: "x", t: 150 },
          { kind: "backspace", t: 300 },
          { kind: "char", char: "a", t: 420 },
          { kind: "char", char: "t", t: 530 },
        ],
      },
      {
        name: "block",
        target: "to",
        mode: "block",
        events: [
          { kind: "char", char: "t", t: 0 },
          { kind: "char", char: "p", t: 200 },
          { kind: "char", char: "o", t: 350 },
        ],
      },
      {
        name: "skip",
        target: "tea",
        mode: "skip",
        events: [
          { kind: "char", char: "t", t: 0 },
          { kind: "char", char: "r", t: 200 },
          { kind: "backspace", t: 300 },
          { kind: "char", char: "a", t: 450 },
        ],
      },
      {
        name: "long pause",
        target: "no",
        mode: "backspace",
        events: [
          { kind: "char", char: "n", t: 0 },
          { kind: "char", char: "o", t: 2500 },
        ],
      },
    ];
    return cases.map((c) => {
      const round = new TypingRound(c.target, c.mode);
      for (const e of c.events) round.input(e);
      return { ...c, expected: { typed: round.typed.join(""), done: round.done, records: round.records, metrics: round.metrics() } };
    });
  });

  check("stats", () => {
    const target = "tent ten";
    const events = simulateTyping(target, { msPerKey: 180, errorRate: 0.3, seed: 4 });
    const round = new TypingRound(target, "backspace");
    for (const e of events) round.input(e);
    const keys: Record<string, StatEntry> = {};
    const pairs: Record<string, StatEntry> = {};
    const { perKey } = applyRecords(target, round.records, keys, pairs);
    return { target, records: round.records, expected: { keys, pairs, perKey } };
  });

  check("scoring", () => {
    const goal: Goal = { wpm: 40, accuracy: 0.95 };
    const entries: (StatEntry | null)[] = [
      null,
      { n: 2, timedN: 1, msAvg: 400, errAvg: 0.5 },
      { n: 50, timedN: 40, msAvg: 250, errAvg: 0.01 },
      { n: 50, timedN: 40, msAvg: 450, errAvg: 0.08 },
      { n: 50, timedN: 40, msAvg: 2000, errAvg: 0.6 },
      { n: 6, timedN: 0, msAvg: 0, errAvg: 0 },
    ];
    return { goal, cases: entries.map((entry) => ({ entry, weakness: weakness(entry ?? undefined, goal) })) };
  });

  check("generate", () => {
    const cases = [
      { seed: 1, letters: "etaoin", count: 20 },
      { seed: 2, letters: "asdfjk", count: 20 },
      { seed: 3, letters: "etaoinshrdlcu", count: 30 },
    ];
    return {
      packSize: PACK_SIZE,
      cases: cases.map((c) => {
        const state = createProfile("physical", c.seed);
        state.unlocked = c.letters.split("");
        state.keys.e = { n: 30, timedN: 30, msAvg: 500, errAvg: 0.1 };
        state.keys.a = { n: 30, timedN: 30, msAvg: 200, errAvg: 0 };
        const scores = computeScores(state, { wpm: 40, accuracy: 0.95 });
        const words = generateWords({
          pack,
          blocklist,
          letters: state.unlocked,
          scores,
          count: c.count,
          rng: new Rng(c.seed),
        });
        return { ...c, keys: { e: state.keys.e, a: state.keys.a }, scores, words };
      }),
    };
  });

  check("profile", () => {
    // A full session: test, goal, then practice rounds with a simulated typist.
    // Ports replay the same events and must reach the same state each round.
    return [
      playSession("frequency", 2024, false),
      playSession("homeRow", 7, true),
    ];
  });
});

function playSession(order: UnlockOrder, seed: number, skip: boolean) {
  const state = createProfile("physical", seed, order);
  const steps: unknown[] = [];
  const goal: Goal = { wpm: 35, accuracy: 0.95 };
  const play = (calibrationTest: boolean, typistSeed: number, msPerKey: number) => {
    const words = planWords(state, { pack, blocklist, count: 12, calibrationTest });
    const target = words.map((w) => w.text).join(" ");
    const events = simulateTyping(target, { msPerKey, errorRate: 0.03, seed: typistSeed });
    const round = new TypingRound(target, "backspace");
    for (const e of events) round.input(e);
    const outcome = completeRound(state, round, 1_700_000_000_000 + typistSeed, { calibrationTest });
    steps.push({ calibrationTest, words, events, outcome, state: snapshot(state) });
  };
  if (skip) {
    state.goal = goal;
    skipCalibration(state);
  } else {
    play(true, 100, 170);
    play(true, 101, 170);
    const testedOut = finishCalibrationTest(state, goal);
    steps.push({ finishCalibrationTest: goal, testedOut, state: snapshot(state) });
  }
  for (let i = 0; i < 8; i++) play(false, 200 + i, 190);
  return { order, seed, packSize: PACK_SIZE, steps };
}

function snapshot(state: ProfileState) {
  return {
    calibration: state.calibration,
    silentRoundsLeft: state.silentRoundsLeft,
    unlocked: [...state.unlocked],
    mastered: [...state.mastered],
    roundCounter: state.roundCounter,
    keys: structuredClone(state.keys),
    pairCount: Object.keys(state.pairs).length,
  };
}

function chars(text: string, start: number, step: number): TypingEvent[] {
  return [...text].map((char, i) => ({ kind: "char", char, t: start + i * step }));
}

function pickMany(seed: number, weights: number[], n: number): number[] {
  const rng = new Rng(seed);
  return Array.from({ length: n }, () => rng.weightedIndex(weights));
}
