import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  achievementProgress,
  createProfile,
  earnedRewards,
  migrateProfile,
  recordAchievements,
  typedWords,
  TypingRound,
  type AchievementContext,
  type AchievementEvent,
} from "../src";

const ctx = (day = "2026-05-10", extra: Partial<AchievementContext> = {}): AchievementContext => ({ day, hour: 12, theme: "clean", dark: false, sound: false, ...extra });
const round = (wpm: number, accuracy: number, chars = 120, extra: Partial<{ durationMs: number; consistency: number | null; words: string[] }> = {}): AchievementEvent => ({
  kind: "round",
  wpm,
  accuracy,
  chars,
  durationMs: 60000,
  consistency: null,
  words: [],
  ...extra,
});
const fresh = () => {
  const state = createProfile("physical", 9);
  state.goal = { wpm: 40, accuracy: 0.95 };
  return state;
};

describe("achievement catalog", () => {
  it("has unique ids, three tiers per skill track, and each reward on exactly one badge", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const tracks = new Map<string, string[]>();
    for (const a of ACHIEVEMENTS.filter((a) => a.group === "skill")) tracks.set(a.track!, [...(tracks.get(a.track!) ?? []), a.tier!]);
    for (const tiers of tracks.values()) expect(tiers).toEqual(["bronze", "silver", "gold"]);
    const rewards = ACHIEVEMENTS.flatMap((a) => (a.reward ? [a.reward] : []));
    expect(new Set(rewards).size).toBe(rewards.length);
    expect(rewards.length).toBe(16);
  });

  it("never rewards secret, theme or count-based badges, so nobody grinds for rewards", () => {
    const counts = ["races", "daily", "passages", "drills", "rounds"];
    for (const a of ACHIEVEMENTS) {
      if (a.group === "secret" || a.group === "theme" || (a.track && counts.includes(a.track))) expect(a.reward, a.id).toBeUndefined();
    }
  });
});

describe("earning", () => {
  it("counts speed only at the accuracy goal and in rounds long enough to mean it", () => {
    const state = fresh();
    expect(recordAchievements(state, round(70, 0.9), ctx(), 1)).not.toContain("speed-40");
    expect(recordAchievements(state, round(70, 0.99, 30), ctx(), 2)).not.toContain("speed-40");
    expect(recordAchievements(state, round(70, 0.99), ctx(), 3)).toEqual(expect.arrayContaining(["speed-40", "speed-60"]));
  });

  it("awards each badge once, with the time it was earned", () => {
    const state = fresh();
    expect(recordAchievements(state, round(45, 1), ctx(), 10)).toContain("speed-40");
    expect(recordAchievements(state, round(45, 1), ctx(), 20)).not.toContain("speed-40");
    expect(state.achievements.earned["speed-40"]).toBe(10);
  });

  it("keeps a streak over consecutive days, restarts it after a gap, and remembers the best", () => {
    const state = fresh();
    for (const day of ["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-01", "2026-02-05"]) recordAchievements(state, round(30, 1), ctx(day), 0);
    expect(state.achievements.counters.streak).toBe(1);
    expect(state.achievements.counters.bestStreak).toBe(3);
    expect(state.achievements.earned["streak-3"]).toBeDefined();
  });

  it("counts theme badges only in that theme, and mechanical only with sound on", () => {
    const state = fresh();
    for (let i = 0; i < 20; i++) recordAchievements(state, { kind: "drill" }, ctx("2026-05-10", { theme: "mechanical" }), i);
    expect(state.achievements.earned["theme-mechanical"]).toBeUndefined();
    for (let i = 0; i < 20; i++) recordAchievements(state, { kind: "drill" }, ctx("2026-05-10", { theme: "mechanical", sound: true, dark: true }), i);
    expect(state.achievements.earned["theme-mechanical"]).toBeDefined();
    expect(state.achievements.earned["theme-dark"]).toBeDefined();
    expect(state.achievements.earned["theme-clean"]).toBeUndefined();
  });

  it("finds the secret ones", () => {
    const state = fresh();
    expect(recordAchievements(state, { kind: "race", ghost: true, won: false, marginMs: 99 }, ctx(), 1)).toContain("photo-finish");
    expect(recordAchievements(state, { kind: "arcade", score: 10, level: 5, lives: "hardcore" }, ctx(), 2)).toContain("hardcore");
    const thes = Array.from({ length: 1000 }, () => "the");
    expect(recordAchievements(state, round(30, 0.9, 120, { words: thes }), ctx(), 3)).toContain("the-1000");
    const other = fresh();
    expect(recordAchievements(other, { kind: "race", ghost: false, won: false, marginMs: 10 }, ctx(), 1)).not.toContain("photo-finish");
  });

  it("shows progress for counted badges", () => {
    const state = fresh();
    recordAchievements(state, round(50, 0.98), ctx(), 1);
    expect(achievementProgress(state, "accuracy-bronze")).toEqual({ value: 1, target: 10 });
    expect(achievementProgress(state, "speed-60")).toEqual({ value: 50, target: 60 });
    expect(achievementProgress(state, "perfect")).toBeNull();
  });

  it("lists the rewards a profile has earned", () => {
    const state = fresh();
    recordAchievements(state, round(65, 0.99), ctx(), 1);
    expect(earnedRewards(state)).toEqual(["cursor:block", "cursor:glow"]);
  });
});

describe("progress from before achievements", () => {
  it("is counted on the first call after upgrading a version 7 profile", () => {
    const v7 = { ...createProfile("physical", 3) } as unknown as Record<string, unknown>;
    delete v7.achievements;
    v7.version = 7;
    const state = migrateProfile(v7);
    expect(state.version).toBe(8);
    expect(state.achievements).toEqual({ earned: {}, counters: {}, backfilled: false });
    state.goal = { wpm: 40, accuracy: 0.95 };
    state.unlocked = [..."abcdefghijklm"];
    state.rounds = [
      { at: 0, wpm: 63, accuracy: 0.98, durationMs: 60000, chars: 300, corrections: 0, calibration: false, consistency: 0.8 },
      { at: 0, wpm: 90, accuracy: 0.98, durationMs: 60000, chars: 300, corrections: 0, calibration: true },
    ];
    state.keyDays = { a: [[100, 5, 5, 0, 0], [101, 5, 5, 0, 0]], b: [[102, 5, 5, 0, 0]] };
    const earned = recordAchievements(state, { kind: "check" }, ctx(), 50);
    expect(earned).toEqual(["speed-40", "speed-60", "letters-half", "streak-3"]);
    expect(state.achievements.backfilled).toBe(true);
    expect(recordAchievements(state, { kind: "check" }, ctx(), 60)).toEqual([]);
  });
});

describe("typedWords", () => {
  it("lists only words typed fully and correctly", () => {
    const r = new TypingRound("The cat sat", "skip");
    [..."The cxt sa"].forEach((char, i) => r.input({ kind: "char", char, t: i * 100 }));
    expect(typedWords(r)).toEqual(["the"]);
  });
});
