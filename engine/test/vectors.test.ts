// Shared test vectors. Each file in engine/vectors holds inputs and the
// expected outputs. Every port (web, Swift, Kotlin) must reproduce them.
// Run `npm run vectors` to regenerate after an intentional engine change.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import blocklist from "../../content/blocklist.json";
import charsJson from "../../content/characters.json";
import loanwords from "../../content/loanwords.json";
import nemesisContent from "../../content/nemesis.json";
import shortcutPack from "../../content/shortcuts-text-editing.json";
import fullPack from "../../content/words-en.json";
import {
  comboFor,
  completePassage,
  mixWordPacks,
  passageWeight,
  pickPassage,
  wordsFromText,
  completeDaily,
  creatureHealth,
  creatureKeys,
  creatureTraits,
  dailyShareText,
  dailyStreak,
  dailyText,
  earnedStage,
  fingerprint,
  forecastGoal,
  forecastKey,
  forecastUnlock,
  makeReplay,
  recordKeyDays,
  replayMarkers,
  replayRound,
  saveReplay,
  trendForecast,
  updateCreatures,
  ArcadeGame,
  arcadeWordSource,
  bossWeights,
  completeArcadeGame,
  createRival,
  ghostFromRound,
  ghostPosition,
  nemesisName,
  powerUpWeights,
  recordScore,
  stepRival,
  updateNemesis,
  wordPool,
  type ArcadeEvent,
  type WordSource,
  applyErrorAnalysis,
  beginSession,
  classifyErrors,
  DAY_MS,
  judgeHesitations,
  phonotactics,
  pronounceableWord,
  recordSessionRound,
  rhythm,
  suggestGrip,
  updateReviews,
  warmupTargets,
  wordOutcomes,
  applyModifiers,
  applyRecords,
  DEFAULT_MODIFIER_SETTINGS,
  difficultyParams,
  explainRound,
  extraForSystem,
  keyDetail,
  LETTERS,
  modifierRate,
  planRound,
  planShortcutDrill,
  shortcutDrillSeed,
  updateDifficulty,
  type CharacterData,
  type ModifierSettings,
  type ShortcutPack,
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
  type KeyRoundEntry,
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
const charData: CharacterData = { ...charsJson, loanwords: loanwords.words };
const macExtra = extraForSystem(charData, "mac", { full: false, altCodes: false });

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

  check("modifiers", () => {
    const settings: ModifierSettings = {
      ...DEFAULT_MODIFIER_SETTINGS,
      modes: { caps: "on", punct: "on", numbers: "on", symbols: "on", accents: "on", extra: "on", shortcuts: "on" },
    };
    const base = "the quick brown fox jumps over lazy dogs and runs far away from home today".split(" ").map((text) => ({ text, madeUp: false }));
    const cases = [
      { name: "caps first", rates: { caps: 0.5 }, settings: { ...settings, caps: "first" as const } },
      { name: "caps any", rates: { caps: 0.5 }, settings: { ...settings, caps: "any" as const } },
      { name: "sentences", rates: { punct: 0.4 }, settings: { ...settings, punct: "sentence" as const } },
      { name: "random punctuation", rates: { punct: 0.5 }, settings: { ...settings, punct: "random" as const } },
      { name: "numbers and symbols", rates: { numbers: 0.4, symbols: 0.4 }, settings },
      { name: "accents and extra", rates: { accents: 0.3, extra: 0.4 }, settings },
      { name: "everything", rates: { caps: 0.3, punct: 0.3, numbers: 0.2, symbols: 0.2, accents: 0.2, extra: 0.2 }, settings },
    ];
    const order = ["caps", "punct", "numbers", "symbols", "accents", "extra"];
    return {
      platformExtra: macExtra,
      extraWord: "join",
      charScores: { e: 1.5, "1": 2, "#": 1 },
      cases: cases.map((c, i) => {
        const scores: Record<string, number> = { e: 1.5, "1": 2, "#": 1 };
        const rates = Object.entries(c.rates)
          .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
          .map(([id, rate]) => ({ id: id as never, rate }));
        const words = applyModifiers(base, {
          rng: new Rng(100 + i),
          chars: charData,
          settings: c.settings,
          platform: { extra: macExtra, accents: true },
          rates,
          charScore: (ch) => scores[ch] ?? 0,
          extraWord: () => "join",
        });
        return { name: c.name, seed: 100 + i, settings: c.settings, rates, input: base.map((w) => w.text), words };
      }),
      rateCases: [
        { level: "low", stat: null },
        { level: "medium", stat: { n: 40, timedN: 40, msAvg: 300, errAvg: 0.02 } },
        { level: "high", stat: { n: 40, timedN: 40, msAvg: 900, errAvg: 0.2 } },
        { level: "auto", stat: { n: 40, timedN: 40, msAvg: 450, errAvg: 0.05 } },
      ].map((c) => {
        const state = createProfile("physical", 1);
        state.difficulty = 0.6;
        if (c.stat) state.keys["mod:caps"] = c.stat;
        const s = { ...settings, levels: { ...settings.levels, caps: c.level as "low" } };
        return { ...c, difficulty: 0.6, goal: { wpm: 40, accuracy: 0.95 }, rate: modifierRate("caps", state, s, { wpm: 40, accuracy: 0.95 }) };
      }),
    };
  });

  check("difficulty", () => {
    const goal: Goal = { wpm: 40, accuracy: 0.95 };
    const r = (wpm: number, accuracy: number) => ({ at: 0, wpm, accuracy, durationMs: 1, chars: 1, corrections: 0, calibration: false });
    const histories = [
      [r(42, 0.97), r(41, 0.96)],
      [r(42, 0.97), r(41, 0.96), r(39, 0.95)],
      [r(30, 0.97), r(31, 0.96), r(29, 0.95)],
      [r(40, 0.9), r(40, 0.91), r(40, 0.9)],
      [r(36, 0.95), r(37, 0.95), r(38, 0.95)],
    ];
    return {
      goal,
      params: [0, 0.3, 0.5, 1].map((d) => ({ difficulty: d, params: difficultyParams(d) })),
      updates: histories.flatMap((rounds) =>
        [0, 1].map((start) => {
          const state = createProfile("physical", 1);
          state.difficulty = start;
          state.rounds = rounds;
          const change = updateDifficulty(state, goal);
          return { start, rounds, change, difficulty: state.difficulty };
        }),
      ),
    };
  });

  check("explain", () => {
    const goal: Goal = { wpm: 40, accuracy: 0.95 };
    const state = createProfile("physical", 1);
    state.goal = goal;
    state.unlocked = "etaoinsh".split("");
    state.mastered = "etaoins".split("");
    for (const l of state.unlocked) state.keys[l] = { n: 30, timedN: 30, msAvg: 250, errAvg: 0.01 };
    state.keys.o = { n: 30, timedN: 30, msAvg: 520, errAvg: 0.12 };
    state.keys.s = { n: 30, timedN: 30, msAvg: 380, errAvg: 0.02 };
    state.pairs.th = { n: 20, timedN: 20, msAvg: 600, errAvg: 0.1 };
    const scores = computeScores(state, goal);
    const words = planRound(state, { pack, blocklist, count: 15 }).words;
    return {
      state: { unlocked: state.unlocked, mastered: state.mastered, keys: state.keys, pairs: state.pairs, goal },
      words,
      scores,
      explanation: explainRound(state, scores, words, []),
      details: ["o", "s", "h", "e"].map((k) => ({ key: k, detail: keyDetail(state.keys[k], goal, k === "h") })),
    };
  });

  check("shortcuts", () => {
    const state = createProfile("physical", 77);
    state.keys["sc:undo"] = { n: 10, timedN: 10, msAvg: 3000, errAvg: 0.3 };
    state.keys["sc:copy"] = { n: 10, timedN: 10, msAvg: 500, errAvg: 0 };
    const seed = shortcutDrillSeed(state);
    const drill = planShortcutDrill(state, shortcutPack as ShortcutPack, 12, new Rng(seed));
    return { profileSeed: 77, roundCounter: 0, seed, keys: { "sc:undo": state.keys["sc:undo"], "sc:copy": state.keys["sc:copy"] }, drill: drill.map((s) => s.id) };
  });

  check("errors", () => {
    const cases: { target: string; mode: ErrorMode; typed: string }[] = [
      { target: "the cat", mode: "skip", typed: "teh cat" },
      { target: "letter", mode: "skip", typed: "leter" },
      { target: "letter", mode: "skip", typed: "lettter" },
      { target: "then", mode: "skip", typed: "ten" },
      { target: "tea", mode: "skip", typed: "rea" },
      { target: "Tea", mode: "skip", typed: "tea" },
      { target: "quick", mode: "block", typed: "qwuick" },
      { target: "jump", mode: "skip", typed: "jmup" },
    ];
    return cases.map((c) => {
      const round = new TypingRound(c.target, c.mode);
      const events = [...c.typed].map((char, i) => ({ kind: "char" as const, char, t: i * 100 }));
      for (const e of events) round.input(e);
      const state = createProfile("physical", 1);
      const summary = applyErrorAnalysis(state, c.target, round.records, pack);
      return {
        ...c,
        events,
        errors: classifyErrors(c.target, round.records),
        summary,
        state: { errorCounts: state.errorCounts, typos: state.typos, confusions: state.confusions, errorBias: state.errorBias, missedWords: state.missedWords, pairs: state.pairs },
      };
    });
  });

  check("hesitation", () => {
    const state = createProfile("physical", 1);
    state.keys.t = { n: 20, timedN: 20, msAvg: 150, errAvg: 0 };
    state.keys.e = { n: 20, timedN: 20, msAvg: 180, errAvg: 0 };
    state.keys.a = { n: 3, timedN: 3, msAvg: 180, errAvg: 0 };
    const target = "tea tee ate";
    const gaps = [0, 150, 500, 160, 200, 900, 170, 150, 140, 380, 150];
    let t = 0;
    const events = gaps.map((g, i) => ({ kind: "char" as const, char: target[i], t: (t += g) }));
    const round = new TypingRound(target, "backspace");
    for (const e of events) round.input(e);
    const keysBefore = structuredClone(state.keys);
    const hesitated = judgeHesitations(state, round);
    return { keysBefore, target, events, hesitated, hesitations: state.hesitations };
  });

  check("session", () => {
    const state = createProfile("touch", 1);
    const start = 1_700_000_000_000;
    const steps: unknown[] = [];
    steps.push({ begin: start, newSession: beginSession(state, start), session: structuredClone(state.session) });
    steps.push({ begin: start + 20 * 60000, newSession: beginSession(state, start + 20 * 60000) });
    const rounds = [
      [50, 0.97], [52, 0.96], [49, 0.96], [41, 0.93], [40, 0.94], [48, 0.96], [51, 0.97],
    ];
    rounds.forEach(([wpm, acc], i) => {
      const change = recordSessionRound(state.session!, start + i * 60000, wpm, acc);
      steps.push({ round: { wpm, accuracy: acc }, change, fatigued: state.session!.fatigued, baseline: state.session!.baseline });
    });
    steps.push({ begin: start + 3 * 60 * 60000, newSession: beginSession(state, start + 3 * 60 * 60000), session: structuredClone(state.session) });
    const grip = state.session!;
    grip.grip = "two";
    grip.gripSignal = { sameMs: 25 * 210, sameN: 25, crossMs: 22 * 260, crossN: 22 };
    steps.push({ gripSignal: grip.gripSignal, picked: "two", suggestion: suggestGrip(grip) });
    return steps;
  });

  check("reviews", () => {
    const goal: Goal = { wpm: 40, accuracy: 0.95 };
    const state = createProfile("physical", 1);
    state.goal = goal;
    const t0 = 1_700_000_000_000;
    beginSession(state, t0);
    state.keys.o = { n: 30, timedN: 30, msAvg: 650, errAvg: 0.15 };
    state.pairs.th = { n: 20, timedN: 20, msAvg: 640, errAvg: 0.1 };
    const bad = { n: 5, correct: 3, msTotal: 3500, msN: 5 };
    const good = { n: 5, correct: 5, msTotal: 1000, msN: 5 };
    const steps: { at: number; sessionRounds: number; perKey: Record<string, KeyRoundEntry>; words: { clean: string[]; botched: string[] } }[] = [
      { at: t0, sessionRounds: 1, perKey: { o: bad, "pair:th": { n: 3, correct: 2, msTotal: 1900, msN: 3 } }, words: { clean: ["the"], botched: ["onto", "into"] } },
      { at: t0 + 60000, sessionRounds: 2, perKey: { o: good }, words: { clean: ["onto"], botched: [] } },
      { at: t0 + 120000, sessionRounds: 3, perKey: { o: good, "pair:th": { n: 3, correct: 3, msTotal: 600, msN: 3 } }, words: { clean: ["onto", "into"], botched: [] } },
      { at: t0 + DAY_MS + 1, sessionRounds: 1, perKey: { o: good }, words: { clean: ["onto"], botched: ["into"] } },
      { at: t0 + 5 * DAY_MS, sessionRounds: 1, perKey: { o: bad }, words: { clean: ["onto"], botched: [] } },
    ];
    return {
      goal,
      keys: { o: state.keys.o },
      pairs: { th: state.pairs.th },
      steps: steps.map((step) => {
        state.session!.rounds = step.sessionRounds;
        const changes = updateReviews(state, step.perKey, step.words, step.at, goal);
        return { ...step, changes, reviews: structuredClone(state.reviews) };
      }),
      wordOutcomes: [
        { target: "the cat sat", errors: [5], typedLength: 11, result: wordOutcomes("the cat sat", [5], 11) },
        { target: "Over, the (top)!", errors: [0, 7], typedLength: 16, result: wordOutcomes("Over, the (top)!", [0, 7], 16) },
      ],
    };
  });

  check("rhythm", () => {
    const sequences = [
      [0, 200, 400, 600, 800, 1000, 1200],
      [0, 100, 400, 450, 900, 950, 1900, 2000],
      [0, 150, 300],
    ];
    return sequences.map((times) => {
      const target = "a".repeat(times.length);
      const round = new TypingRound(target, "backspace");
      times.forEach((t) => round.input({ kind: "char", char: "a", t }));
      return { times, rhythm: rhythm(round.records) };
    });
  });

  check("phonotactics", () => {
    const p = phonotactics(pack);
    const letterSets = ["etaoinshr", "asdfjklhgeriotu", "etaoinshrdlcumwfgypbvkjxqz"];
    return {
      packSize: PACK_SIZE,
      patterns: p,
      words: letterSets.map((letters, i) => {
        const rng = new Rng(500 + i);
        return {
          letters,
          seed: 500 + i,
          words: Array.from({ length: 12 }, () => pronounceableWord(pack, letters.split(""), { keys: { e: 1, o: 0.5 }, pairs: {} }, blocklist, rng)),
        };
      }),
    };
  });

  check("warmup", () => {
    const goal: Goal = { wpm: 40, accuracy: 0.95 };
    const state = createProfile("physical", 9);
    state.goal = goal;
    state.calibration = "done";
    state.unlocked = "etaoinshr".split("");
    state.mastered = "etaoinsh".split("");
    for (const l of state.unlocked) state.keys[l] = { n: 40, timedN: 40, msAvg: 240, errAvg: 0.02 };
    state.keys.n = { n: 40, timedN: 40, msAvg: 520, errAvg: 0.08 };
    state.keys.s = { n: 40, timedN: 40, msAvg: 380, errAvg: 0.04 };
    state.pairs.nt = { n: 20, timedN: 20, msAvg: 600, errAvg: 0.1 };
    const now = 1_700_000_000_000;
    beginSession(state, now);
    state.reviews["word:onto"] = { kind: "word", target: "onto", step: 0, due: now - 1, sessionRound: null, lapses: 1 };
    const targets = warmupTargets(state, goal, now);
    const plan = planRound(state, { pack, blocklist, count: 20, warmup: true, now });
    return { state: { unlocked: state.unlocked, mastered: state.mastered, keys: state.keys, pairs: state.pairs, reviews: state.reviews, seed: 9, roundCounter: 0 }, now, targets, plan };
  });

  check("arcade", () => {
    const words = ["lamp", "river", "stone", "cloud", "apple", "tiger", "maple", "noble", "quiet", "sugar"];
    const makeSource = (): WordSource => {
      let i = 0;
      let p = 0;
      return {
        next(kind) {
          if (kind === "boss") return { text: ["quickest", "equator", "quietly"][p++ % 3], madeUp: false };
          if (kind === "powerup") return { text: "quiz", madeUp: false };
          return { text: words[i++ % words.length], madeUp: false };
        },
      };
    };
    const games = [
      { name: "falling", config: { mode: "falling" as const, lives: "lives" as const, touch: false, weakKeys: ["q", "u"], nemesisKey: "q" }, seed: 11, bot: { cps: 9, errorRate: 0.06, seed: 3 }, seconds: 150 },
      { name: "survival health", config: { mode: "survival" as const, lives: "health" as const, touch: true, weakKeys: ["e"], nemesisKey: null }, seed: 12, bot: { cps: 5, errorRate: 0.1, seed: 4 }, seconds: 120 },
    ];
    return {
      sourceWords: words,
      bossWords: ["quickest", "equator", "quietly"],
      powerUpWord: "quiz",
      games: games.map((g) => {
        const game = new ArcadeGame(g.config, makeSource(), new Rng(g.seed));
        const ops = recordBot(game, g.bot, g.seconds);
        return {
          name: g.name,
          config: g.config,
          rngSeed: g.seed,
          ops,
          final: {
            time: game.time, level: game.level, score: game.score, combo: game.combo, maxCombo: game.maxCombo, lives: game.lives,
            health: game.health, cleared: game.cleared, landed: game.landed, errors: game.errors, keystrokes: game.keystrokes,
            correctKeystrokes: game.correctKeystrokes, over: game.over, log: game.log, words: game.words, boss: game.boss,
          },
        };
      }),
    };
  });

  check("arcadeWords", () => {
    const state = createProfile("physical", 21);
    state.goal = { wpm: 40, accuracy: 0.95 };
    state.calibration = "done";
    state.unlocked = "etaoinshrdlcumwfgypbvkjxqz".split("");
    state.mastered = [...state.unlocked];
    for (const l of state.unlocked) state.keys[l] = { n: 30, timedN: 30, msAvg: 260, errAvg: 0.02 };
    state.keys.k = { n: 30, timedN: 30, msAvg: 600, errAvg: 0.15 };
    state.keys.w = { n: 30, timedN: 30, msAvg: 450, errAvg: 0.05 };
    const scores = computeScores(state, state.goal);
    const pool = wordPool(pack, state.unlocked, { maxLength: 10, poolCap: 2000 });
    const top = (weights: number[]) => weights.map((w, i) => ({ w, word: pool[i].text })).filter((x) => x.w > 0).sort((a, b) => b.w - a.w || (a.word < b.word ? -1 : 1)).slice(0, 15);
    const source = arcadeWordSource(state, { pack, blocklist, rng: new Rng(8) });
    return {
      packSize: PACK_SIZE,
      keys: { k: state.keys.k, w: state.keys.w },
      powerUpTop: top(powerUpWeights(pool, scores)),
      bossTop: top(bossWeights(pool, scores, "k")),
      sequence: ["normal", "powerup", "normal", "boss", "boss", "normal", "powerup"].map((kind) => ({ kind, word: source.next(kind as "normal") })),
    };
  });

  check("arcadeResults", () => {
    const state = createProfile("physical", 3);
    state.keys.l = { n: 30, timedN: 30, msAvg: 250, errAvg: 0.02 };
    state.keys.a = { n: 30, timedN: 30, msAvg: 250, errAvg: 0.02 };
    const before = structuredClone(state.keys);
    const game = new ArcadeGame({ mode: "falling", lives: "lives", touch: false, weakKeys: [], nemesisKey: null }, { next: () => ({ text: "lamp", madeUp: false }) }, new Rng(1));
    game.tick(0.1);
    const inputs: [string, number][] = [["l", 0], ["a", 180], ["x", 360], ["m", 600], ["p", 790]];
    for (const [c, t] of inputs) game.input(c, t);
    const result = completeArcadeGame(state, game, 1_700_000_000_000);
    const entry = (score: number) => ({ score, level: 1, words: 1, wpm: 1, accuracy: 1, at: score });
    const ranks = [500, 200, 900, 200, 50].map((sc) => recordScore(state, "survival", entry(sc)));
    return { before, inputs, log: game.log, records: game.records, result, keys: { l: state.keys.l, a: state.keys.a, m: state.keys.m, p: state.keys.p }, survivalRanks: ranks, survival: state.arcade.scores.survival };
  });

  check("race", () => {
    const rival = createRival({ kind: "ahead" }, 40, 50);
    const steps: unknown[] = [];
    const player = [[0, 0], [10, 0], [20, 30], [35, 45], [70, 60], [80, 30], [85, 30]];
    for (const [chars, wpm] of player) {
      stepRival(rival, 1, chars, wpm);
      steps.push({ playerChars: chars, playerWpm: wpm, position: rival.position, elapsed: rival.elapsed });
    }
    const round = new TypingRound("on it", "backspace");
    const events: TypingEvent[] = [
      { kind: "char", char: "o", t: 500 },
      { kind: "char", char: "m", t: 700 },
      { kind: "backspace", t: 900 },
      { kind: "char", char: "n", t: 1000 },
      { kind: "char", char: " ", t: 1150 },
      { kind: "char", char: "i", t: 1350 },
      { kind: "char", char: "t", t: 1500 },
    ];
    for (const e of events) round.input(e);
    const ghost = ghostFromRound(round, 42);
    return {
      rival: { pace: "ahead", baseWpm: 40, goalWpm: 50, steps },
      ghost: { target: "on it", events, run: ghost, positions: [0, 250, 499, 500, 1000].map((ms) => ({ ms, chars: ghostPosition(ghost!, ms) })) },
    };
  });

  check("nemesis", () => {
    const state = createProfile("physical", 99);
    state.unlocked = "etaoinshr".split("");
    state.goal = { wpm: 40, accuracy: 0.95 };
    for (const l of state.unlocked) state.keys[l] = { n: 25, timedN: 25, msAvg: 260, errAvg: 0.03 };
    state.keys.h = { n: 25, timedN: 25, msAvg: 640, errAvg: 0.12 };
    state.keys.r = { n: 25, timedN: 25, msAvg: 560, errAvg: 0.1 };
    const steps: unknown[] = [];
    steps.push({ change: updateNemesis(state, 1000, nemesisContent), nemesis: state.arcade.nemesis });
    state.keys.h = { n: 40, timedN: 40, msAvg: 250, errAvg: 0.02 };
    steps.push({ keysH: state.keys.h, change: updateNemesis(state, 2000, nemesisContent), nemesis: state.arcade.nemesis, hall: structuredClone(state.arcade.hall) });
    return {
      seed: 99,
      names: LETTERS.split("").map((k) => ({ key: k, name: nemesisName(state, k, nemesisContent) })),
      steps,
    };
  });

  check("creatures", () => {
    const goal = { wpm: 40, accuracy: 0.95 };
    const entries: StatEntry[] = [
      { n: 0, timedN: 0, msAvg: 0, errAvg: 0 },
      { n: 3, timedN: 2, msAvg: 400, errAvg: 0.1 },
      { n: 15, timedN: 14, msAvg: 500, errAvg: 0.05 },
      { n: 40, timedN: 38, msAvg: 290, errAvg: 0.02 },
      { n: 40, timedN: 38, msAvg: 340, errAvg: 0.02 },
      { n: 150, timedN: 150, msAvg: 230, errAvg: 0.015 },
      { n: 150, timedN: 150, msAvg: 230, errAvg: 0.03 },
      { n: 60, timedN: 60, msAvg: 900, errAvg: 0.2 },
    ];
    const state = createProfile("physical", 5);
    state.goal = goal;
    state.keys = { e: entries[3], t: entries[2], a: entries[1], "?": { n: 50, timedN: 50, msAvg: 330, errAvg: 0.01 } };
    const first = updateCreatures(state, 1000, charData);
    state.keys.t = entries[5];
    state.keys.e = entries[7];
    const second = updateCreatures(state, 2000, charData);
    return {
      goal,
      roster: creatureKeys(charData).map((c) => c.key).join(""),
      traits: creatureKeys(charData).map(({ key }) => ({ key, ...creatureTraits(key) })),
      stages: entries.map((entry) => ({ entry, stage: earnedStage(entry, goal) })),
      health: [0, 7, 8, 22, 37, 60].flatMap((days) => entries.slice(1).map((entry) => ({ entry, daysSince: days, health: creatureHealth(entry, goal, days) }))),
      updates: { first, second, creatures: state.creatures },
    };
  });

  check("forecast", () => {
    const line = (n: number, start: number, slope: number, noise: number[]) => Array.from({ length: n }, (_, i) => ({ x: i - n + 1, y: start + slope * i + (noise[i % noise.length] ?? 0) }));
    const cases = [
      { points: line(2, 30, 1, [0]), target: 40, direction: 1 as const },
      { points: line(8, 30, 1, [0.2, -0.3, 0.1]), target: 40, direction: 1 as const },
      { points: line(4, 30, 1, [2, -3, 1]), target: 40, direction: 1 as const },
      { points: line(5, 30, -0.5, [0.1, -0.1]), target: 40, direction: 1 as const },
      { points: line(5, 45, 0.5, [0]), target: 40, direction: 1 as const },
      { points: line(10, 400, -5, [10, -12, 4]), target: 300, direction: -1 as const },
      { points: line(4, 30, 0.01, [0.5, -0.5]), target: 40, direction: 1 as const },
      { points: line(3, 30, 3, [4, -4, 0]), target: 40, direction: 1 as const },
    ];
    const now = 20_000 * DAY_MS + 3_600_000;
    const state = createProfile("physical", 9);
    state.goal = { wpm: 40, accuracy: 0.95 };
    state.unlocked = "etaoin".split("");
    state.mastered = "etao".split("");
    for (let d = 0; d < 9; d++) {
      for (let r = 0; r < 2; r++) {
        state.rounds.push({ at: now - (8 - d) * DAY_MS + r * 1000, wpm: 28 + d * 1.2 + (r ? 0.5 : -0.5), accuracy: 0.95, durationMs: 30000, chars: 120, corrections: 0, calibration: false });
      }
      const day = 20_000 - 8 + d;
      recordKeyDays(state.keyDays, { i: { n: 10, correct: 10, msTotal: (420 - d * 12) * 8, msN: 8 }, n: { n: 10, correct: 8, msTotal: 3000, msN: 8 }, e: { n: 10, correct: 10, msTotal: 2000, msN: 8 } }, day * DAY_MS + 5000);
    }
    recordKeyDays(state.keyDays, { i: { n: 2, correct: 2, msTotal: 600, msN: 2 } }, now);
    state.keys.i = { n: 92, timedN: 74, msAvg: 330, errAvg: 0.01 };
    state.keys.n = { n: 90, timedN: 72, msAvg: 375, errAvg: 0.2 };
    state.keys.e = { n: 90, timedN: 72, msAvg: 250, errAvg: 0.01 };
    return {
      trend: cases.map((c) => ({ ...c, forecast: trendForecast(c.points, c.target, c.direction) })),
      profile: {
        now,
        rounds: state.rounds,
        keyDays: state.keyDays,
        keys: { i: state.keys.i, n: state.keys.n, e: state.keys.e },
        goal: forecastGoal(state, now),
        keyI: forecastKey(state, "i", now),
        keyN: forecastKey(state, "n", now),
        keyE: forecastKey(state, "e", now),
        unlock: forecastUnlock(state, now),
      },
    };
  });

  check("replay", () => {
    const events: TypingEvent[] = [
      { kind: "char", char: "t", t: 1000 },
      { kind: "char", char: "h", t: 1180 },
      { kind: "char", char: "r", t: 1350 },
      { kind: "backspace", t: 1600 },
      { kind: "char", char: "e", t: 1720 },
      { kind: "char", char: " ", t: 1880 },
      { kind: "char", char: "c", t: 2050 },
      { kind: "char", char: "a", t: 2200 },
      { kind: "char", char: "t", t: 3400 },
    ];
    const run = makeReplay("the cat sat on", "backspace", events, 77, "practice");
    const state = createProfile("physical", 1);
    const variant = (wpm: number, accuracy: number, at: number) => ({ ...run, wpm, accuracy, at });
    const ranks = [variant(40, 0.9, 1), variant(50, 0.9, 2), variant(30, 1, 3), variant(45, 1, 4), variant(20, 1, 5), variant(60, 0.5, 6)].map((r) => saveReplay(state, r));
    return {
      events,
      run,
      markers: replayMarkers(run),
      frames: [0, 180, 600, 700, 1219, 5000].map((ms) => {
        const r = replayRound(run, ms);
        return { ms, position: r.position, typed: r.typed.join("") };
      }),
      ranks,
      recentAt: state.replays.recent.map((r) => r.at),
      bestAt: state.replays.best.map((r) => r.at),
    };
  });

  check("daily", () => {
    const daily = { words: fullPack.words, id: fullPack.id, version: fullPack.version };
    const dates = ["2026-01-01", "2026-10-12", "2027-02-28", "2028-02-29", "2030-12-31"];
    const state = createProfile("physical", 3);
    const round = new TypingRound("Ab cd, ef.", "backspace");
    const typing: TypingEvent[] = [
      ...chars("Ab ", 0, 150),
      { kind: "char", char: "x", t: 500 },
      { kind: "backspace", t: 600 },
      ...chars("cd, ", 700, 150),
      { kind: "char", char: "e", t: 1400 },
      { kind: "char", char: "x", t: 1550 },
      { kind: "char", char: ".", t: 1700 },
    ];
    for (const e of typing) round.input(e);
    const first = completeDaily(state, "2026-10-10", round, 1000);
    const again = completeDaily(state, "2026-10-10", round, 2000);
    state.daily["2026-10-11"] = { ...first.result, at: 3000 };
    state.daily["2026-10-08"] = { ...first.result, at: 4000 };
    return {
      pack: { id: daily.id, version: daily.version },
      texts: dates.map((date) => ({ date, text: dailyText(date, daily, blocklist) })),
      typing,
      first,
      again: { scored: again.scored },
      streaks: ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-09"].map((today) => ({ today, streak: dailyStreak(state, today) })),
      share: dailyShareText("2026-10-10", { ...first.result, marks: "gggyrgggggggyg" }, 4),
    };
  });

  check("fingerprint", () => {
    const state = createProfile("physical", 4);
    state.goal = { wpm: 40, accuracy: 0.95 };
    const letters = "etaoinshrdlc";
    letters.split("").forEach((k, i) => (state.keys[k] = { n: 30 + i, timedN: 30, msAvg: 200 + i * 25, errAvg: 0.01 + (i % 4) * 0.02 }));
    state.keys.z = { n: 5, timedN: 5, msAvg: 900, errAvg: 0.3 };
    for (let i = 0; i < 12; i++) state.rounds.push({ at: 1000 + i, wpm: 41 + (i % 3), accuracy: 0.975, durationMs: 30000, chars: 150, corrections: 3, calibration: false, consistency: 0.6, firstErrors: 3 });
    updateCreatures(state, 5000, charData);
    return { keys: state.keys, rounds: state.rounds, card: fingerprint(state, 5000, charData) };
  });

  check("packs", () => {
    const text = "The cat and the hat. THE CAT sat; don't sit! A cat's hat, x, supercalifragilisticexpialidocious hat.";
    return {
      text,
      words: wordsFromText(text),
      mixes: [
        { packs: [{ words: ["a", "b", "c", "d"], weight: 2 }, { words: ["x", "b", "y"], weight: 1 }] },
        { packs: [{ words: ["a", "b"], weight: 1 }, { words: ["c", "d", "e", "f"], weight: 1 }, { words: ["g"], weight: 4 }] },
        { packs: [{ words: ["a", "b"], weight: 0 }, { words: ["c", "d"], weight: 1 }] },
      ].map((m) => ({ ...m, mixed: mixWordPacks(m.packs).words })),
    };
  });

  check("passages", () => {
    const state = createProfile("physical", 21);
    state.goal = { wpm: 40, accuracy: 0.95 };
    for (const l of "etaoinshrdlc") state.keys[l] = { n: 30, timedN: 30, msAvg: 250, errAvg: 0.02 };
    state.keys.x = { n: 30, timedN: 30, msAvg: 700, errAvg: 0.2 };
    state.keys["{"] = { n: 10, timedN: 10, msAvg: 900, errAvg: 0.3 };
    const scores = computeScores(state, state.goal);
    const passages = [
      { id: "a", text: "the cat sat" },
      { id: "b", text: "fix x {\n  max(x)\n}" },
      { id: "c", text: "Hello, there." },
    ];
    const weights = passages.map((p) => passageWeight(p.text, state, scores));
    state.recentPassages = ["b"];
    const rng = new Rng(4);
    const picks = Array.from({ length: 6 }, () => pickPassage(state, passages, scores, rng)!.id);
    const round = new TypingRound("if x {\n    y\n}", "backspace", { autoIndent: true });
    const events: TypingEvent[] = [..."if x {\n"].map((char, i) => ({ kind: "char", char, t: i * 100 }));
    events.push({ kind: "char", char: "y", t: 800 }, { kind: "char", char: "\n", t: 900 }, { kind: "char", char: "}", t: 1000 });
    for (const e of events) round.input(e);
    const metrics = completePassage(state, passages[1], round, 5 * DAY_MS);
    return {
      weights,
      picks,
      autoIndent: { target: round.target, events, typed: round.typed.join(""), records: round.records.length, done: round.done, metrics },
      recentPassages: state.recentPassages,
      keyDays: state.keyDays["{"],
      combos: [
        comboFor({ id: "t", action: "", group: "", mac: { mods: ["meta"], key: "f" }, other: { mods: ["shift", "alt"], key: "f" }, linux: { mods: ["ctrl", "shift"], key: "i" } }, false, true),
        comboFor({ id: "t", action: "", group: "", mac: { mods: ["meta"], key: "f" }, other: { mods: ["shift", "alt"], key: "f" } }, false, true),
      ],
    };
  });

  check("profile", () => {
    // A full session: test, goal, then practice rounds with a simulated typist.
    // Ports replay the same events and must reach the same state each round.
    return [
      playSession("frequency", 2024, false),
      playSession("homeRow", 7, true),
      playModifierSession(31),
      playPhase3Session(77),
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

/** All letters mastered: modifiers unlock in stages as the simulated typist masters them. */
function playModifierSession(seed: number) {
  const state = createProfile("physical", seed);
  state.goal = { wpm: 30, accuracy: 0.9 };
  state.calibration = "done";
  state.unlocked = LETTERS.split("");
  state.mastered = LETTERS.split("");
  const settings = DEFAULT_MODIFIER_SETTINGS;
  const platform = { extra: macExtra, accents: true };
  const steps: unknown[] = [];
  for (let i = 0; i < 16; i++) {
    const plan = planRound(state, { pack, blocklist, count: 20, modifiers: { settings, chars: charData, platform } });
    const target = plan.words.map((w) => w.text).join(" ");
    const events = simulateTyping(target, { msPerKey: 160, errorRate: 0.02, seed: 300 + i });
    const round = new TypingRound(target, "backspace");
    for (const e of events) round.input(e);
    const outcome = completeRound(state, round, 1_700_000_000_000 + i, { chars: charData });
    steps.push({
      words: plan.words,
      explanation: plan.explanation,
      events,
      outcome,
      state: { ...snapshot(state), modsUnlocked: [...state.modsUnlocked], modsMastered: [...state.modsMastered], difficulty: state.difficulty },
    });
  }
  return { modifierSession: true, seed, packSize: PACK_SIZE, platformExtra: macExtra, settings, steps };
}

/** Phase 3: sessions, reviews, hesitations and error analysis across rounds, with one long break. */
function playPhase3Session(seed: number) {
  const state = createProfile("physical", seed);
  state.goal = { wpm: 35, accuracy: 0.95 };
  state.calibration = "done";
  state.unlocked = "etaoinshrdl".split("");
  state.mastered = "etaoinshrd".split("");
  const t0 = 1_700_000_000_000;
  const steps: unknown[] = [];
  for (let i = 0; i < 8; i++) {
    const at = t0 + (i < 5 ? i * 120000 : DAY_MS + i * 120000);
    const newSession = beginSession(state, at);
    const plan = planRound(state, { pack, blocklist, count: 15, now: at });
    const target = plan.words.map((w) => w.text).join(" ");
    const events = simulateTyping(target, { msPerKey: i === 3 ? 320 : 190, errorRate: 0.06, seed: 900 + i }, 1000);
    const round = new TypingRound(target, "backspace");
    for (const e of events) round.input(e);
    const outcome = completeRound(state, round, at + 30000, { pack });
    steps.push({
      at,
      newSession,
      words: plan.words,
      explanation: plan.explanation,
      events,
      outcome: { ...outcome, rhythm: { consistency: outcome.rhythm.consistency, stalls: outcome.rhythm.stalls } },
      state: {
        ...snapshot(state),
        difficulty: state.difficulty,
        reviews: structuredClone(state.reviews),
        hesitations: structuredClone(state.hesitations),
        errorBias: { ...state.errorBias },
        missedWords: { ...state.missedWords },
        session: structuredClone(state.session),
      },
    });
  }
  return { phase3Session: true, seed, packSize: PACK_SIZE, steps };
}

/** Plays the test bot while logging every operation and the events it produced. */
function recordBot(game: ArcadeGame, bot: { cps: number; errorRate: number; seed: number }, seconds: number) {
  const rng = new Rng(bot.seed);
  const ops: ({ op: "tick"; dt: number; events: ArcadeEvent[] } | { op: "input"; char: string; t: number; events: ArcadeEvent[] })[] = [];
  let budget = 0;
  const step = 0.1;
  for (let i = 0; i < Math.round(seconds / step) && !game.over; i++) {
    const events = game.tick(step);
    if (events.length) ops.push({ op: "tick", dt: step, events });
    else ops.push({ op: "tick", dt: step, events: [] });
    budget += bot.cps * step;
    while (budget >= 1 && !game.over) {
      budget -= 1;
      let word = game.words.find((w) => w.id === game.target);
      if (!word) word = [...game.words].sort((a, b) => b.y - a.y || a.id - b.id)[0];
      if (!word) break;
      const char = rng.next() < bot.errorRate ? "#" : word.text[word.typed];
      const t = Math.round(game.time * 1000);
      ops.push({ op: "input", char, t, events: game.input(char, t) });
    }
  }
  return ops;
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
