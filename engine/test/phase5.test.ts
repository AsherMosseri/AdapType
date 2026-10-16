import { describe, expect, it } from "vitest";
import blocklist from "../../content/blocklist.json";
import charsJson from "../../content/characters.json";
import loanwords from "../../content/loanwords.json";
import fullPack from "../../content/words-en.json";
import {
  completeDaily,
  completeRound,
  createProfile,
  creatureViews,
  dailyStreak,
  dailyText,
  DAY_MS,
  fingerprint,
  forecastGoal,
  forecastKey,
  makeReplay,
  migrateProfile,
  replayMarkers,
  replayRound,
  saveReplay,
  TypingRound,
  updateCreatures,
  wordMarks,
  type CharacterData,
  type TypingEvent,
} from "../src";

const chars: CharacterData = { ...charsJson, loanwords: loanwords.words };
const pack = { words: fullPack.words, id: fullPack.id, version: fullPack.version };

function typed(text: string, start = 0, step = 150): { round: TypingRound; events: TypingEvent[] } {
  const round = new TypingRound(text, "backspace");
  const events: TypingEvent[] = [...text].map((char, i) => ({ kind: "char", char, t: start + i * step }));
  for (const e of events) round.input(e);
  return { round, events };
}

describe("creatures", () => {
  it("hatch with practice, never devolve, and lose health when neglected", () => {
    const state = createProfile("physical", 1);
    state.goal = { wpm: 40, accuracy: 0.95 };
    state.keys.e = { n: 45, timedN: 45, msAvg: 260, errAvg: 0.01 };
    expect(updateCreatures(state, 0, chars)).toEqual([{ key: "e", from: null, to: 2 }]);
    state.keys.e = { n: 60, timedN: 60, msAvg: 800, errAvg: 0.2 };
    expect(updateCreatures(state, 1, chars)).toEqual([]);
    const now = 40 * DAY_MS;
    state.keyDays.e = [[0, 10, 10, 2000, 8]];
    const e = creatureViews(state, now, chars).find((c) => c.key === "e")!;
    expect(e.stage).toBe(2);
    expect(e.daysSince).toBe(40);
    expect(e.health).toBeLessThan(0.5);
    expect(creatureViews(state, now, chars).find((c) => c.key === "q")!.stage).toBeNull();
  });

  it("covers letters, digits, punctuation and symbols", () => {
    const keys = creatureViews(createProfile("touch", 2), 0, chars).map((c) => c.key);
    expect(keys).toContain("a");
    expect(keys).toContain("7");
    expect(keys).toContain("?");
    expect(keys).toContain("@");
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("forecasts", () => {
  it("are honest about too little data", () => {
    const state = createProfile("physical", 3);
    state.goal = { wpm: 60, accuracy: 0.95 };
    state.rounds.push({ at: 0, wpm: 30, accuracy: 0.95, durationMs: 1, chars: 1, corrections: 0, calibration: false });
    expect(forecastGoal(state, DAY_MS)).toEqual({ kind: "none", reason: "data" });
    expect(forecastKey(state, "e", DAY_MS)).toEqual({ kind: "none", reason: "data" });
  });

  it("practice rounds feed key days", () => {
    const state = createProfile("physical", 4);
    const { round } = typed("tea tea");
    completeRound(state, round, 5 * DAY_MS + 10);
    expect(state.keyDays.t?.[0][0]).toBe(5);
    expect(state.keyDays.t?.[0][1]).toBe(2);
    expect(state.keyDays[" "]).toBeUndefined();
  });
});

describe("replays", () => {
  it("reproduce the round exactly", () => {
    const round = new TypingRound("go now", "backspace");
    const events: TypingEvent[] = [
      { kind: "char", char: "g", t: 100 },
      { kind: "char", char: "p", t: 300 },
      { kind: "backspace", t: 450 },
      { kind: "char", char: "o", t: 600 },
      { kind: "char", char: " ", t: 750 },
      { kind: "char", char: "n", t: 900 },
    ];
    for (const e of events) round.input(e);
    const run = makeReplay(round.target, round.mode, events, 1, "practice");
    expect(run.target).toBe("go now");
    expect(run.events[0][0]).toBe(0);
    const again = replayRound(run);
    expect(again.typed.join("")).toBe("go n");
    expect(replayMarkers(run).filter((m) => m.kind === "error")).toEqual([{ t: 200, index: 1, kind: "error" }]);
  });

  it("keep the last five and the three best", () => {
    const state = createProfile("physical", 5);
    for (let i = 0; i < 8; i++) {
      const { round, events } = typed("abc", 0, 100 + i * 10);
      saveReplay(state, makeReplay(round.target, round.mode, events, i, "practice"));
    }
    expect(state.replays.recent.map((r) => r.at)).toEqual([3, 4, 5, 6, 7]);
    expect(state.replays.best.map((r) => r.at)).toEqual([0, 1, 2]);
  });
});

describe("daily challenge", () => {
  it("is the same text for everyone on a date, and different the next day", () => {
    const a = dailyText("2026-10-12", pack, blocklist);
    expect(dailyText("2026-10-12", pack, blocklist)).toBe(a);
    expect(dailyText("2026-10-13", pack, blocklist)).not.toBe(a);
    expect(a.split(" ").length).toBe(30);
    expect(a[0]).toBe(a[0].toUpperCase());
    expect(a.endsWith(".")).toBe(true);
  });

  it("scores only the first attempt and counts streaks", () => {
    const state = createProfile("physical", 6);
    const { round } = typed("Go on.");
    expect(wordMarks(round)).toBe("gg");
    const slip = new TypingRound("go on", "backspace");
    for (const e of [
      { kind: "char", char: "g", t: 0 },
      { kind: "char", char: "o", t: 1 },
      { kind: "char", char: "x", t: 2 },
      { kind: "backspace", t: 3 },
      { kind: "char", char: " ", t: 4 },
      { kind: "char", char: "o", t: 5 },
    ] as TypingEvent[]) slip.input(e);
    expect(wordMarks(slip)).toBe("yg");
    expect(completeDaily(state, "2026-10-11", round, 1).scored).toBe(true);
    expect(completeDaily(state, "2026-10-11", round, 2).scored).toBe(false);
    expect(completeDaily(state, "2026-10-12", round, 3).streak).toBe(2);
    expect(dailyStreak(state, "2026-10-14")).toBe(0);
  });
});

describe("fingerprint", () => {
  it("works with no data", () => {
    const card = fingerprint(createProfile("touch", 7), 0, chars);
    expect(card.traits).toEqual([]);
    expect(card.best).toEqual([]);
    expect(card.creatures).toEqual([]);
  });
});

describe("migration", () => {
  it("upgrades version 4 profiles", () => {
    const v4 = { ...createProfile("physical", 1), version: 4 } as Record<string, unknown>;
    for (const k of ["keyDays", "creatures", "replays", "daily"]) delete v4[k];
    const p = migrateProfile(v4);
    expect(p.version).toBe(9);
    expect(p.keyDays).toEqual({});
    expect(p.creatures).toEqual({});
    expect(p.replays).toEqual({ recent: [], best: [] });
    expect(p.daily).toEqual({});
  });
});
