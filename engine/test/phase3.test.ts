import { describe, expect, it } from "vitest";
import blocklist from "../../content/blocklist.json";
import pack from "../../content/words-en.json";
import {
  applyErrorAnalysis,
  areNeighbors,
  beginSession,
  classifyErrors,
  completeRound,
  computeScores,
  createProfile,
  DAY_MS,
  drift,
  driftingKeys,
  dueItems,
  FINGERS,
  groupBreakdown,
  keyDetail,
  LETTERS,
  migrateProfile,
  phonotactics,
  planRound,
  pronounceableWord,
  recordSessionRound,
  rhythm,
  Rng,
  shouldWarmUp,
  suggestGrip,
  TypingRound,
  updateReviews,
  warmupTargets,
  wordOutcomes,
  type ProfileState,
  type TypingEvent,
} from "../src";
import { simulateTyping } from "./simulate";

const goal = { wpm: 40, accuracy: 0.95 };
const NOW = 1_700_000_000_000;

function typed(target: string, chars: string, step = 150): TypingRound {
  const round = new TypingRound(target, "skip");
  [...chars].forEach((c, i) => round.input({ kind: "char", char: c, t: i * step }));
  return round;
}

function ready(seed = 1): ProfileState {
  const state = createProfile("physical", seed);
  state.goal = goal;
  state.calibration = "done";
  return state;
}

describe("error types", () => {
  it("classifies swaps, doubles, skips, neighbors and case", () => {
    const kinds = (target: string, chars: string) => classifyErrors(target, typed(target, chars).records).map((e) => e.type);
    expect(kinds("the", "teh")).toEqual(["swap"]);
    expect(kinds("letter", "leter")).toEqual(["missed-double"]);
    expect(kinds("letter", "lettter")).toEqual(["double"]);
    expect(kinds("then", "ten")).toEqual(["skipped"]);
    expect(kinds("tea", "rea")).toEqual(["neighbor"]);
    expect(kinds("Tea", "tea")).toEqual(["case"]);
  });

  it("knows QWERTY neighbors", () => {
    expect(areNeighbors("r", "t")).toBe(true);
    expect(areNeighbors("g", "b")).toBe(true);
    expect(areNeighbors("a", "p")).toBe(false);
  });

  it("records typos, confusions, missed words and a swap pair sample", () => {
    const state = ready();
    const round = typed("the tea", "teh rea");
    const summary = applyErrorAnalysis(state, round.target, round.records, { words: pack.words });
    expect(summary.counts.swap).toBe(1);
    expect(summary.counts.neighbor).toBe(1);
    expect(state.typos.h).toEqual({ e: 1 });
    expect(state.confusions.rt).toBe(1);
    expect(summary.missedWords).toEqual(["tea", "the"]);
    expect(state.pairs.he.n).toBe(1);
    expect(state.errorBias.swap).toBeGreaterThan(0);
  });
});

describe("hesitation", () => {
  it("flags long pauses relative to the key's own average", () => {
    const state = ready();
    state.keys.e = { n: 20, timedN: 20, msAvg: 150, errAvg: 0 };
    state.keys.t = { n: 20, timedN: 20, msAvg: 150, errAvg: 0 };
    const round = new TypingRound("tete", "backspace");
    const events: TypingEvent[] = [
      { kind: "char", char: "t", t: 0 },
      { kind: "char", char: "e", t: 150 },
      { kind: "char", char: "t", t: 1000 },
      { kind: "char", char: "e", t: 1150 },
    ];
    for (const e of events) round.input(e);
    const outcome = completeRound(state, round, NOW);
    expect(outcome.hesitated).toEqual([{ key: "t", count: 1 }]);
    expect(state.hesitations.t.errAvg).toBe(1);
    expect(state.hesitations.e.errAvg).toBe(0);
  });

  it("raises a hesitant key's score and calls it hesitant", () => {
    const state = ready();
    for (const l of state.unlocked) state.keys[l] = { n: 50, timedN: 50, msAvg: 200, errAvg: 0 };
    state.mastered = [...state.unlocked];
    state.hesitations.o = { n: 20, timedN: 0, msAvg: 0, errAvg: 0.3 };
    const scores = computeScores(state, goal);
    expect(scores.keys.o).toBeGreaterThan(scores.keys.t);
    expect(keyDetail(state.keys.o, goal, false, { hesitation: state.hesitations.o }).reasons).toEqual(["hesitant"]);
  });
});

describe("sessions and fatigue", () => {
  it("starts a new session after a 30 minute gap", () => {
    const state = ready();
    expect(beginSession(state, NOW)).toBe(true);
    state.session!.lastAt = NOW;
    expect(beginSession(state, NOW + 10 * 60 * 1000)).toBe(false);
    expect(beginSession(state, NOW + 45 * 60 * 1000)).toBe(true);
    expect(state.session!.id).toBe(2);
  });

  it("spots fatigue against the session's start, and recovery", () => {
    const state = ready();
    beginSession(state, NOW);
    const s = state.session!;
    expect(recordSessionRound(s, NOW, 50, 0.97)).toBeNull();
    expect(recordSessionRound(s, NOW, 50, 0.97)).toBeNull();
    expect(recordSessionRound(s, NOW, 48, 0.96)).toBeNull();
    expect(recordSessionRound(s, NOW, 38, 0.95)).toBe("started");
    expect(s.fatigued).toBe(true);
    expect(recordSessionRound(s, NOW, 49, 0.97)).toBeNull();
    expect(recordSessionRound(s, NOW, 50, 0.97)).toBe("recovered");
  });

  it("counts tired rounds less and eases them", () => {
    const fresh = ready();
    const tired = ready();
    beginSession(tired, NOW);
    tired.session!.fatigued = true;
    for (const state of [fresh, tired]) {
      state.keys.t = { n: 20, timedN: 20, msAvg: 200, errAvg: 0 };
      const round = new TypingRound("t", "backspace");
      round.input({ kind: "char", char: "x", t: 0 });
      completeRound(state, round, NOW);
    }
    expect(tired.keys.t.errAvg).toBeLessThan(fresh.keys.t.errAvg);
    const plan = planRound(tired, { pack, blocklist, count: 5 });
    expect(plan.explanation?.fatigued).toBe(true);
  });

  it("doesn't raise difficulty while tired", () => {
    const state = ready();
    beginSession(state, NOW);
    state.session!.fatigued = true;
    state.rounds = Array.from({ length: 3 }, () => ({ at: 0, wpm: 80, accuracy: 1, durationMs: 1, chars: 1, corrections: 0, calibration: false }));
    const round = new TypingRound("tea", "backspace");
    for (const e of simulateTyping("tea", { msPerKey: 100, errorRate: 0, seed: 1 })) round.input(e);
    expect(completeRound(state, round, NOW).difficultyChange).toBe(0);
  });
});

describe("spaced repetition", () => {
  it("schedules weak keys and missed words, then grows the gap on success", () => {
    const state = ready();
    beginSession(state, NOW);
    state.keys.o = { n: 30, timedN: 30, msAvg: 700, errAvg: 0.2 };
    const bad = { n: 5, correct: 3, msTotal: 3500, msN: 5 };
    const changes = updateReviews(state, { o: bad }, { clean: [], botched: ["onto"] }, NOW, goal);
    expect(changes.added).toEqual(["key:o", "word:onto"]);
    const item = state.reviews["key:o"];
    expect(item.due).toBe(NOW + DAY_MS);
    expect(item.sessionRound).toBe(2);

    // Two rounds later in the same session it's due again.
    state.session!.rounds = 2;
    expect(dueItems(state, NOW + 1000).map((i) => i.target)).toEqual(["o", "onto"]);
    const good = { n: 5, correct: 5, msTotal: 1000, msN: 5 };
    updateReviews(state, { o: good }, { clean: ["onto"], botched: [] }, NOW + 1000, goal);
    expect(state.reviews["key:o"].sessionRound).toBeNull();
    expect(state.reviews["key:o"].step).toBe(0);

    // A success the next day moves to 3 days.
    updateReviews(state, { o: good }, { clean: [], botched: [] }, NOW + DAY_MS + 1, goal);
    expect(state.reviews["key:o"].step).toBe(1);
    expect(state.reviews["key:o"].due).toBe(NOW + DAY_MS + 1 + 3 * DAY_MS);

    // A miss resets it.
    updateReviews(state, { o: bad }, { clean: [], botched: [] }, NOW + 2 * DAY_MS, goal);
    expect(state.reviews["key:o"].step).toBe(0);
    expect(state.reviews["key:o"].lapses).toBe(1);
  });

  it("graduates items after the last interval", () => {
    const state = ready();
    beginSession(state, NOW);
    state.reviews["word:onto"] = { kind: "word", target: "onto", step: 4, due: NOW, sessionRound: null, lapses: 0 };
    const changes = updateReviews(state, {}, { clean: ["onto"], botched: [] }, NOW + 1, goal);
    expect(changes.learned).toEqual(["word:onto"]);
    expect(state.reviews["word:onto"]).toBeUndefined();
  });

  it("splits a round into clean and botched words", () => {
    expect(wordOutcomes("the cat sat", [5], 11)).toEqual({ clean: ["the", "sat"], botched: ["cat"] });
    expect(wordOutcomes("the cat sat", [], 5)).toEqual({ clean: ["the"], botched: [] });
  });

  it("puts due words into the next round", () => {
    const state = ready();
    beginSession(state, NOW);
    state.reviews["word:into"] = { kind: "word", target: "into", step: 0, due: NOW - 1, sessionRound: null, lapses: 1 };
    const plan = planRound(state, { pack, blocklist, count: 20, now: NOW });
    expect(plan.words.some((w) => w.text === "into")).toBe(true);
    expect(plan.explanation?.reviewWords).toEqual(["into"]);
  });
});

describe("warm-up", () => {
  it("targets current trouble spots at the start of a session", () => {
    const state = ready();
    for (const l of state.unlocked) state.keys[l] = { n: 50, timedN: 50, msAvg: 200, errAvg: 0 };
    state.mastered = [...state.unlocked];
    state.keys.n = { n: 50, timedN: 50, msAvg: 600, errAvg: 0.1 };
    state.rounds = Array.from({ length: 3 }, () => ({ at: 0, wpm: 40, accuracy: 0.95, durationMs: 1, chars: 1, corrections: 0, calibration: false }));
    beginSession(state, NOW);
    expect(warmupTargets(state, goal)?.keys).toEqual(["n"]);
    expect(shouldWarmUp(state, NOW)).toBe(true);
    const plan = planRound(state, { pack, blocklist, count: 30, warmup: true, now: NOW });
    expect(plan.explanation?.warmup?.keys).toEqual(["n"]);
    const share = plan.words.filter((w) => w.text.includes("n")).length / plan.words.length;
    expect(share).toBeGreaterThan(0.5);
  });
});

describe("rhythm", () => {
  it("scores even typing higher and finds stalls", () => {
    const even = new TypingRound("aaaaaaaa", "backspace");
    for (let i = 0; i < 8; i++) even.input({ kind: "char", char: "a", t: i * 200 });
    const bumpy = new TypingRound("aaaaaaaa", "backspace");
    [0, 100, 400, 450, 900, 950, 1900, 2000].forEach((t) => bumpy.input({ kind: "char", char: "a", t }));
    expect(rhythm(even.records).consistency).toBe(1);
    const r = rhythm(bumpy.records);
    expect(r.consistency!).toBeLessThan(0.5);
    expect(r.stalls.length).toBeGreaterThan(0);
  });
});

describe("hands and drift", () => {
  it("ranks fingers by weakness", () => {
    const keys: Record<string, { n: number; timedN: number; msAvg: number; errAvg: number }> = {};
    for (const l of LETTERS) keys[l] = { n: 20, timedN: 20, msAvg: 200, errAvg: 0 };
    keys.q = { n: 20, timedN: 20, msAvg: 800, errAvg: 0.2 };
    expect(groupBreakdown(FINGERS, keys, goal)[0].name).toBe("Left pinky");
  });

  it("finds keys whose taps drift off center", () => {
    const taps = { a: Array.from({ length: 12 }, () => ({ dx: 0.3, dy: 0.1 })), b: Array.from({ length: 12 }, () => ({ dx: 0.05, dy: 0 })) };
    expect(drift(taps.a)!.offset).toBeCloseTo(Math.sqrt(0.1));
    expect(driftingKeys(taps)).toEqual(["a"]);
  });

  it("suggests a grip when taps don't match", () => {
    const state = ready();
    beginSession(state, NOW);
    const s = state.session!;
    s.grip = "two";
    s.gripSignal = { sameMs: 20 * 200, sameN: 20, crossMs: 20 * 300, crossN: 20 };
    expect(suggestGrip(s)).toBe("one");
    s.grip = "one";
    s.gripSignal = { sameMs: 20 * 300, sameN: 20, crossMs: 20 * 200, crossN: 20 };
    expect(suggestGrip(s)).toBe("two");
  });
});

describe("made-up words", () => {
  it("learns English sound patterns", () => {
    const p = phonotactics({ words: pack.words });
    expect(p.onsets.map(([o]) => o)).toContain("th");
    expect(p.nuclei.map(([n]) => n)).toContain("ea");
  });

  it("builds pronounceable words from unlocked letters only", () => {
    const letters = "etaoinshr".split("");
    const rng = new Rng(4);
    for (let i = 0; i < 100; i++) {
      const w = pronounceableWord({ words: pack.words }, letters, { keys: {}, pairs: {} }, blocklist, rng);
      expect(w).not.toBeNull();
      for (const c of w!) expect(letters).toContain(c);
      expect(blocklist.roots.some((r) => w!.includes(r))).toBe(false);
    }
  });

  it("respects the made-up word cap", () => {
    const state = createProfile("physical", 1, "homeRow");
    state.goal = goal;
    state.calibration = "done";
    const none = planRound(state, { pack, blocklist, count: 40, madeUpCap: 0 }).words;
    expect(none.some((w) => w.madeUp)).toBe(false);
    const some = planRound(state, { pack, blocklist, count: 40 }).words;
    expect(some.some((w) => w.madeUp)).toBe(true);
  });
});

describe("migration", () => {
  it("upgrades version 2 profiles", () => {
    const v2 = { ...createProfile("touch", 1), version: 2 } as Record<string, unknown>;
    for (const k of ["reviews", "hesitations", "errorCounts", "typos", "confusions", "errorBias", "missedWords", "session", "touchTyping", "gripKeys", "gripTaps"]) delete v2[k];
    const p = migrateProfile(v2);
    expect(p.version).toBe(10);
    expect(p.reviews).toEqual({});
    expect(p.errorBias).toEqual({ swap: 0, double: 0, neighbor: 0 });
    expect(p.session).toBeNull();
  });
});

describe("full rounds", () => {
  it("completes rounds with every phase 3 output", () => {
    const state = ready(5);
    beginSession(state, NOW);
    for (let i = 0; i < 5; i++) {
      const plan = planRound(state, { pack, blocklist, count: 15, now: NOW + i });
      const target = plan.words.map((w) => w.text).join(" ");
      const round = new TypingRound(target, "backspace");
      for (const e of simulateTyping(target, { msPerKey: 160, errorRate: 0.05, seed: i })) round.input(e);
      const outcome = completeRound(state, round, NOW + i * 60000, { pack: { words: pack.words } });
      expect(outcome.rhythm.consistency).not.toBeNull();
      expect(outcome.summary.firstErrors).toBeGreaterThanOrEqual(0);
    }
    expect(state.session!.rounds).toBe(5);
  });
});
