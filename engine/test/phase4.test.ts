import { describe, expect, it } from "vitest";
import blocklist from "../../content/blocklist.json";
import nemesisContent from "../../content/nemesis.json";
import pack from "../../content/words-en.json";
import {
  ARCADE_WEIGHT,
  ArcadeGame,
  arcadeWordSource,
  bossWeights,
  completeArcadeGame,
  computeScores,
  createProfile,
  createRival,
  ghostFromRound,
  ghostPosition,
  LETTERS,
  migrateProfile,
  nemesisName,
  nemesisTaunt,
  powerUpWeights,
  recordScore,
  Rng,
  rivalWpm,
  saveGhostIfBest,
  stepRival,
  TypingRound,
  updateNemesis,
  wordPool,
  type ArcadeConfig,
  type ProfileState,
  type RoundWord,
  type WordSource,
} from "../src";
import { playBot } from "./arcadeBot";

const goal = { wpm: 40, accuracy: 0.95 };

function ready(seed = 1): ProfileState {
  const state = createProfile("physical", seed);
  state.goal = goal;
  state.calibration = "done";
  state.unlocked = LETTERS.split("");
  state.mastered = LETTERS.split("");
  for (const l of LETTERS) state.keys[l] = { n: 30, timedN: 30, msAvg: 250, errAvg: 0.02 };
  state.keys.q = { n: 30, timedN: 30, msAvg: 700, errAvg: 0.2 };
  return state;
}

function fixedSource(): WordSource {
  const words = ["lamp", "river", "stone", "cloud", "apple", "tiger", "maple", "noble"];
  let i = 0;
  return {
    next(kind): RoundWord {
      if (kind === "boss") return { text: "quickest", madeUp: false };
      if (kind === "powerup") return { text: "quiz", madeUp: false };
      return { text: words[i++ % words.length], madeUp: false };
    },
  };
}

const config = (over: Partial<ArcadeConfig> = {}): ArcadeConfig => ({ mode: "falling", lives: "lives", touch: false, weakKeys: ["q"], nemesisKey: null, ...over });

describe("arcade game", () => {
  it("is deterministic", () => {
    const run = () => {
      const game = new ArcadeGame(config(), fixedSource(), new Rng(5));
      playBot(game, { cps: 6, errorRate: 0.05, seed: 2 }, 60);
      return [game.score, game.level, game.cleared, game.landed, game.errors, game.records.length];
    };
    expect(run()).toEqual(run());
  });

  it("ends when an idle player lets three words land", () => {
    const game = new ArcadeGame(config(), fixedSource(), new Rng(1));
    const events: string[] = [];
    for (let i = 0; i < 1000 && !game.over; i++) events.push(...game.tick(0.1).map((e) => e.type));
    expect(game.over).toBe(true);
    expect(events.filter((e) => e === "landed").length).toBe(3);
  });

  it("auto-targets the lowest matching word and scores with combos", () => {
    const game = new ArcadeGame(config(), fixedSource(), new Rng(1));
    game.tick(0.1);
    const word = game.words[0];
    for (const c of word.text) game.input(c, 0);
    expect(game.cleared).toBe(1);
    expect(game.score).toBe(10 * word.text.length);
    expect(game.combo).toBe(1);
  });

  it("levels up every 10 words and brings a boss at level 5", () => {
    const game = new ArcadeGame(config(), fixedSource(), new Rng(3));
    const events = playBot(game, { cps: 12, errorRate: 0, seed: 1 }, 400).map((e) => e.type);
    expect(events).toContain("levelUp");
    expect(events).toContain("bossStart");
    expect(events).toContain("bossPhase2");
    expect(events).toContain("bossDefeated");
    expect(game.level).toBeGreaterThan(5);
  });

  it("drops power-up words that trigger effects", () => {
    const game = new ArcadeGame(config(), fixedSource(), new Rng(3));
    const events = playBot(game, { cps: 12, errorRate: 0, seed: 1 }, 120);
    const kinds = events.filter((e) => e.type === "powerUp").map((e) => (e as { kind: string }).kind);
    expect(kinds.length).toBeGreaterThan(0);
  });

  it("hardcore ends on the first error, health mode chips away", () => {
    const hard = new ArcadeGame(config({ mode: "survival", lives: "hardcore" }), fixedSource(), new Rng(1));
    hard.tick(0.1);
    hard.input("#", 0);
    expect(hard.over).toBe(true);
    const health = new ArcadeGame(config({ mode: "survival", lives: "health" }), fixedSource(), new Rng(1));
    health.tick(0.1);
    health.input("#", 0);
    expect(health.health).toBeCloseTo(0.95);
    expect(health.over).toBe(false);
  });

  it("costs a life after three errors in a row", () => {
    const game = new ArcadeGame(config(), fixedSource(), new Rng(1));
    game.tick(0.1);
    game.input("#", 0);
    game.input("#", 1);
    expect(game.lives).toBe(3);
    game.input("#", 2);
    expect(game.lives).toBe(2);
  });

  it("falls slower on touch and faster each level", () => {
    const desk = new ArcadeGame(config(), fixedSource(), new Rng(1));
    const touch = new ArcadeGame(config({ touch: true }), fixedSource(), new Rng(1));
    expect(touch.fallSeconds()).toBeGreaterThan(desk.fallSeconds());
    const before = desk.fallSeconds();
    desk.level = 3;
    expect(desk.fallSeconds()).toBeLessThan(before);
  });
});

describe("arcade words", () => {
  it("power-up and boss words lean on weak keys", () => {
    const state = ready();
    const scores = computeScores(state, goal);
    const pool = wordPool({ words: pack.words }, state.unlocked, { maxLength: 10, poolCap: 3000 });
    const pw = powerUpWeights(pool, scores);
    const withQ = pool.findIndex((w) => w.text.includes("q") && w.text.length >= 4);
    const plain = pool.findIndex((w) => !w.text.includes("q") && w.text.length >= 4);
    expect(pw[withQ]).toBeGreaterThan(pw[plain]);
    const bw = bossWeights(pool, scores, "q");
    for (let i = 0; i < pool.length; i++) if (bw[i] > 0) expect(pool[i].text).toContain("q");
  });

  it("a source serves adaptive normal words and weak-key specials", () => {
    const state = ready();
    const source = arcadeWordSource(state, { pack, blocklist, rng: new Rng(2) });
    const normal = Array.from({ length: 30 }, () => source.next("normal"));
    expect(normal.length).toBe(30);
    const boss = Array.from({ length: 10 }, () => source.next("boss", "q").text);
    for (const w of boss) expect(w).toContain("q");
  });
});

describe("arcade results", () => {
  it("counts arcade keystrokes at half weight", () => {
    const practiceLike = ready();
    const arcade = ready();
    const game = new ArcadeGame(config(), fixedSource(), new Rng(1));
    game.tick(0.1);
    const w = game.words[0];
    game.input(w.text[0], 0);
    game.input("#", 100);
    completeArcadeGame(arcade, game, 0);
    const key = w.text[1];
    const before = practiceLike.keys[key].errAvg;
    const after = arcade.keys[key].errAvg;
    // One error sample at weight max(0.1, 1/31) x 0.5.
    expect(after - before).toBeCloseTo((1 - before) * Math.max(0.1, 1 / 31) * ARCADE_WEIGHT);
    expect(arcade.arcade.games).toBe(1);
  });

  it("keeps the top 10 scores", () => {
    const state = ready();
    const entry = (score: number) => ({ score, level: 1, words: 1, wpm: 1, accuracy: 1, at: score });
    expect(recordScore(state, "falling", entry(100))).toBe(1);
    expect(recordScore(state, "falling", entry(300))).toBe(1);
    expect(recordScore(state, "falling", entry(200))).toBe(2);
    for (let i = 0; i < 10; i++) recordScore(state, "falling", entry(1000 + i));
    expect(state.arcade.scores.falling!.length).toBe(10);
    expect(recordScore(state, "falling", entry(5))).toBeNull();
  });
});

describe("nemesis", () => {
  it("names the worst key, taunts, and moves to the hall when defeated", () => {
    const state = ready(7);
    const first = updateNemesis(state, 1000, nemesisContent);
    expect(first.chosen?.key).toBe("q");
    expect(first.chosen?.name).toMatch(/ the Q$/);
    expect(nemesisName(state, "q", nemesisContent)).toBe(first.chosen?.name);
    expect(nemesisTaunt(first.chosen!, nemesisContent, new Rng(1)).length).toBeGreaterThan(0);
    state.keys.q = { n: 40, timedN: 40, msAvg: 200, errAvg: 0.01 };
    const second = updateNemesis(state, 2000, nemesisContent);
    expect(second.defeated?.key).toBe("q");
    expect(state.arcade.hall.length).toBe(1);
    expect(state.arcade.nemesis).toBeNull();
  });

  it("makes the nemesis every other boss", () => {
    const game = new ArcadeGame(config({ nemesisKey: "q" }), fixedSource(), new Rng(3));
    const bosses = playBot(game, { cps: 14, errorRate: 0, seed: 1 }, 900)
      .filter((e) => e.type === "bossStart")
      .map((e) => (e as { nemesis: string | null }).nemesis);
    expect(bosses.slice(0, 2)).toEqual(["q", null]);
  });
});

describe("races", () => {
  it("the rival stays just ahead, with a rubber band", () => {
    const rival = createRival({ kind: "ahead" }, 40, 50);
    expect(rivalWpm(rival, 0, 0)).toBeCloseTo(42);
    rival.elapsed = 5;
    expect(rivalWpm(rival, 0, 60)).toBeCloseTo(63);
    rival.position = 30;
    expect(rivalWpm(rival, 10, 60)).toBeCloseTo(63 * 0.7);
    rival.position = 0;
    expect(rivalWpm(rival, 20, 60)).toBeCloseTo(63 * 1.3);
    const goalRival = createRival({ kind: "goal" }, 40, 50);
    stepRival(goalRival, 6, 0, 0);
    expect(goalRival.position).toBeCloseTo(25);
  });

  it("records a ghost and replays its position", () => {
    const state = ready();
    const round = new TypingRound("go on", "backspace");
    "go on".split("").forEach((c, i) => round.input({ kind: "char", char: c, t: 1000 + i * 200 }));
    const ghost = ghostFromRound(round, 5)!;
    expect(ghost.times).toEqual([0, 200, 400, 600, 800]);
    expect(ghostPosition(ghost, 450)).toBe(3);
    expect(saveGhostIfBest(state, ghost)).toBe(true);
    const slower = { ...ghost, wpm: ghost.wpm - 1 };
    expect(saveGhostIfBest(state, slower)).toBe(false);
  });
});

describe("migration", () => {
  it("upgrades version 3 profiles", () => {
    const v3 = { ...createProfile("physical", 1), version: 3 } as Record<string, unknown>;
    delete v3.arcade;
    const p = migrateProfile(v3);
    expect(p.version).toBe(7);
    expect(p.arcade).toEqual({ scores: {}, ghost: null, nemesis: null, hall: [], games: 0 });
  });
});
