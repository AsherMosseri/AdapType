import { describe, expect, it } from "vitest";
import blocklist from "../../content/blocklist.json";
import charsJson from "../../content/characters.json";
import loanwords from "../../content/loanwords.json";
import shortcutPack from "../../content/shortcuts-text-editing.json";
import pack from "../../content/words-en.json";
import {
  applyModifiers,
  applyRecords,
  categoryOf,
  completeRound,
  comboFor,
  computeScores,
  createProfile,
  DEFAULT_MODIFIER_SETTINGS,
  difficultyParams,
  explainRound,
  extraForSystem,
  formatCombo,
  keyDetail,
  LETTERS,
  migrateProfile,
  modifierRate,
  planRound,
  planShortcutDrill,
  recordShortcut,
  Rng,
  sameCombo,
  SHIFT_SIDE_KEY,
  TOUCH_LAYER_KEY,
  TypingRound,
  updateDifficulty,
  updateUnlocks,
  type CharacterData,
  type ModifierSettings,
  type ProfileState,
  type ShortcutPack,
} from "../src";
import { simulateTyping } from "./simulate";

const chars: CharacterData = { ...charsJson, loanwords: loanwords.words };
const shortcuts = shortcutPack as ShortcutPack;
const goal = { wpm: 40, accuracy: 0.95 };
const allOn: ModifierSettings = {
  ...DEFAULT_MODIFIER_SETTINGS,
  modes: { caps: "on", punct: "on", numbers: "on", symbols: "on", accents: "on", extra: "on", shortcuts: "on" },
};
const macPlatform = { extra: extraForSystem(chars, "mac", { full: false, altCodes: false }), accents: true };

function fullyUnlocked(seed = 1): ProfileState {
  const state = createProfile("physical", seed);
  state.goal = goal;
  state.calibration = "done";
  state.unlocked = LETTERS.split("");
  state.mastered = LETTERS.split("");
  return state;
}

function ctx(rates: Record<string, number>, settings = allOn, seed = 3) {
  const rng = new Rng(seed);
  return {
    rng,
    chars,
    settings,
    platform: macPlatform,
    rates: Object.entries(rates).map(([id, rate]) => ({ id: id as never, rate })),
    charScore: () => 0,
    extraWord: () => "more",
  };
}

const plain = (n: number) => Array.from({ length: n }, (_, i) => ({ text: ["alpha", "beta", "gamma", "delta"][i % 4], madeUp: false }));

describe("character categories", () => {
  it("sorts characters into modifiers", () => {
    expect(categoryOf("a", chars)).toBe("letter");
    expect(categoryOf("A", chars)).toBe("caps");
    expect(categoryOf("7", chars)).toBe("numbers");
    expect(categoryOf(",", chars)).toBe("punct");
    expect(categoryOf("{", chars)).toBe("symbols");
    expect(categoryOf("é", chars)).toBe("accents");
    expect(categoryOf("É", chars)).toBe("accents");
    expect(categoryOf("—", chars)).toBe("extra");
    expect(categoryOf("»", chars)).toBe("extra");
    expect(categoryOf(" ", chars)).toBe("space");
  });
});

describe("modifiers", () => {
  it("keeps rates inside the level's range, higher for weak modifiers", () => {
    const state = fullyUnlocked();
    const settings = { ...allOn, levels: { ...allOn.levels, caps: "medium" as const } };
    state.keys["mod:caps"] = { n: 100, timedN: 100, msAvg: 200, errAvg: 0 };
    const strong = modifierRate("caps", state, settings, goal);
    state.keys["mod:caps"] = { n: 100, timedN: 100, msAvg: 900, errAvg: 0.3 };
    const weak = modifierRate("caps", state, settings, goal);
    expect(strong).toBeGreaterThanOrEqual(0.06);
    expect(weak).toBeLessThanOrEqual(0.25);
    expect(weak).toBeGreaterThan(strong);
    expect(strong).toBeGreaterThan(0);
  });

  it("keeps at least half the words plain", () => {
    const state = fullyUnlocked();
    const settings: ModifierSettings = { ...allOn, levels: { caps: "high", punct: "high", numbers: "high", symbols: "high", accents: "high", extra: "high" } };
    const plan = planRound(state, { pack, blocklist, count: 400, modifiers: { settings, chars, platform: macPlatform } });
    const total = plan.explanation!.modifiers.reduce((sum, m) => sum + m.rate, 0);
    expect(total).toBeCloseTo(0.5);
    const plain = plan.words.filter((w) => /^[a-z]+$/.test(w.text)).length / plan.words.length;
    expect(plain).toBeGreaterThan(0.4);
  });

  it("capitalizes first letters or any letter", () => {
    const first = applyModifiers(plain(8), ctx({ caps: 1 }, { ...allOn, caps: "first" }));
    for (const w of first) expect(w.text[0]).toMatch(/[A-Z]/);
    const any = applyModifiers(plain(30), ctx({ caps: 1 }, { ...allOn, caps: "any" }));
    for (const w of any) expect(w.text).toMatch(/[A-Z]/);
    expect(any.some((w) => /^[a-z]/.test(w.text))).toBe(true);
  });

  it("builds sentences in sentence mode", () => {
    const words = applyModifiers(plain(60), ctx({ punct: 0.5 }, { ...allOn, punct: "sentence" }));
    expect(words[0].text[0]).toMatch(/[A-Z]/);
    for (let i = 1; i < words.length; i++) {
      if (/[.!?]$/.test(words[i - 1].text)) expect(words[i].text).toMatch(/^["']?[A-Z]/);
    }
    expect(words.some((w) => /[.!?]$/.test(w.text))).toBe(true);
  });

  it("uses real loanwords for accents and only platform extra characters", () => {
    const accented = applyModifiers(plain(10), ctx({ accents: 1 }));
    for (const w of accented) expect(loanwords.words).toContain(w.text);
    const extra = applyModifiers(plain(60), ctx({ extra: 1 }));
    for (const w of extra) {
      const specials = [...w.text].filter((c) => categoryOf(c, chars) === "extra");
      expect(specials.length).toBeGreaterThan(0);
      for (const c of specials) {
        const opener = Object.entries(chars.extra).find(([, x]) => x.close === c)?.[0] ?? c;
        expect(macPlatform.extra).toContain(opener);
      }
    }
  });

  it("adds numbers and symbols", () => {
    const numbered = applyModifiers(plain(20), ctx({ numbers: 1 }));
    for (const w of numbered) expect(w.text).toMatch(/[0-9]/);
    const symbols = applyModifiers(plain(20), ctx({ symbols: 1 }));
    for (const w of symbols) expect([...w.text].some((c) => chars.symbols.includes(c))).toBe(true);
  });

  it("filters extra characters by system", () => {
    expect(extraForSystem(chars, "windows", { full: false, altCodes: false })).toEqual([]);
    expect(extraForSystem(chars, "windows", { full: false, altCodes: true })).toContain("©");
    expect(extraForSystem(chars, "mac", { full: false, altCodes: false })).not.toContain("×");
    expect(extraForSystem(chars, "mac", { full: true, altCodes: false }).length).toBeGreaterThan(30);
    expect(extraForSystem(chars, { touchReachable: ["—", "•"] }, { full: false, altCodes: false })).toEqual(["—", "•"]);
  });

  it("plans rounds with modifiers only when they're on", () => {
    const state = fullyUnlocked();
    const off = planRound(state, { pack, blocklist, count: 40, modifiers: { settings: DEFAULT_MODIFIER_SETTINGS, chars, platform: macPlatform } });
    for (const w of off.words) expect(w.text).toMatch(/^[a-z]+$/);
    state.modsUnlocked = ["caps"];
    const on = planRound(state, { pack, blocklist, count: 80, modifiers: { settings: DEFAULT_MODIFIER_SETTINGS, chars, platform: macPlatform } });
    expect(on.words.some((w) => /[A-Z]/.test(w.text))).toBe(true);
    expect(on.explanation?.modifiers.map((m) => m.id)).toEqual(["caps"]);
  });
});

describe("modifier stats", () => {
  it("tracks modifier categories, Shift side and layer switches", () => {
    const target = "Tea 4";
    const round = new TypingRound(target, "backspace");
    round.input({ kind: "char", char: "T", t: 0, shift: "left" });
    round.input({ kind: "char", char: "e", t: 200 });
    round.input({ kind: "char", char: "a", t: 400 });
    round.input({ kind: "char", char: " ", t: 600 });
    round.input({ kind: "char", char: "4", t: 900, layer: true });
    const keys = {};
    const pairs = {};
    const { perKey } = applyRecords(target, round.records, keys, pairs, chars);
    expect(perKey["mod:caps"].n).toBe(1);
    expect(perKey["mod:numbers"].n).toBe(1);
    // T is a left-hand letter, so the left Shift is the wrong side.
    expect((keys as Record<string, { errAvg: number }>)[SHIFT_SIDE_KEY].errAvg).toBe(1);
    expect((keys as Record<string, { n: number }>)[TOUCH_LAYER_KEY].n).toBe(1);
  });
});

describe("modifier unlocking", () => {
  it("unlocks capitals once every letter is mastered, then the next stage after mastery", () => {
    const state = fullyUnlocked();
    expect(updateUnlocks(state).newlyUnlockedMods).toEqual(["caps"]);
    expect(updateUnlocks(state).newlyUnlockedMods).toEqual([]);
    state.keys["mod:caps"] = { n: 20, timedN: 20, msAvg: 300, errAvg: 0.02 };
    const result = updateUnlocks(state);
    expect(result.newlyMasteredMods).toEqual(["caps"]);
    expect(result.newlyUnlockedMods).toEqual(["punct"]);
  });

  it("unlocks accents, extra characters and shortcuts together last", () => {
    const state = fullyUnlocked();
    state.modsUnlocked = ["caps", "punct", "numbers", "symbols"];
    state.modsMastered = ["caps", "punct", "numbers", "symbols"];
    expect(updateUnlocks(state).newlyUnlockedMods).toEqual(["accents", "extra", "shortcuts"]);
  });

  it("doesn't unlock modifiers while letters remain", () => {
    const state = createProfile("physical", 1);
    state.calibration = "done";
    expect(updateUnlocks(state).newlyUnlockedMods).toEqual([]);
  });
});

describe("difficulty curve", () => {
  const round = (wpm: number, accuracy: number) => ({ at: 0, wpm, accuracy, durationMs: 1, chars: 1, corrections: 0, calibration: false });

  it("rises at goal and falls when struggling, gently", () => {
    const state = fullyUnlocked();
    state.rounds = [round(45, 0.97), round(44, 0.98)];
    expect(updateDifficulty(state, goal)).toBe(0);
    state.rounds.push(round(43, 0.96));
    expect(updateDifficulty(state, goal)).toBeCloseTo(0.05);
    state.rounds.push(round(20, 0.9), round(22, 0.9), round(25, 0.9));
    expect(updateDifficulty(state, goal)).toBeCloseTo(-0.05);
    state.rounds.push(round(36, 0.95), round(36, 0.95), round(36, 0.95));
    expect(updateDifficulty(state, goal)).toBe(0);
  });

  it("makes words longer and rarer as it rises", () => {
    const easy = difficultyParams(0);
    const hard = difficultyParams(1);
    expect(hard.maxLength).toBeGreaterThan(easy.maxLength);
    expect(hard.rankScale).toBeGreaterThan(easy.rankScale);
    expect(hard.intensity).toBeGreaterThan(easy.intensity);
  });

  it("updates after practice rounds", () => {
    const state = fullyUnlocked();
    state.goal = { wpm: 20, accuracy: 0.9 };
    let change = 0;
    for (let i = 0; i < 4; i++) {
      const words = planRound(state, { pack, blocklist, count: 10 }).words;
      const target = words.map((w) => w.text).join(" ");
      const r = new TypingRound(target, "backspace");
      for (const e of simulateTyping(target, { msPerKey: 150, errorRate: 0, seed: i })) r.input(e);
      change = completeRound(state, r, 0).difficultyChange;
    }
    expect(change).toBeCloseTo(0.05);
    expect(state.difficulty).toBeCloseTo(0.4);
  });
});

describe("explanations", () => {
  it("names weak letters that are in the round", () => {
    const state = createProfile("physical", 1);
    state.goal = goal;
    for (const l of state.unlocked) state.keys[l] = { n: 50, timedN: 50, msAvg: 200, errAvg: 0 };
    state.keys.o = { n: 50, timedN: 50, msAvg: 800, errAvg: 0.2 };
    state.mastered = [...state.unlocked];
    const scores = computeScores(state, goal);
    const explanation = explainRound(state, scores, [{ text: "onto", madeUp: false }], []);
    expect(explanation.keys).toEqual(["o"]);
    expect(explanation.newLetter).toBeNull();
  });

  it("says why a key is targeted", () => {
    expect(keyDetail({ n: 50, timedN: 50, msAvg: 600, errAvg: 0.2 }, goal, false).reasons).toEqual(["slow", "errors"]);
    expect(keyDetail(undefined, goal, true).reasons).toEqual(["new", "unknown"]);
    expect(keyDetail({ n: 50, timedN: 50, msAvg: 200, errAvg: 0 }, goal, false).reasons).toEqual(["fine"]);
  });
});

describe("shortcuts", () => {
  it("matches and formats combos per system", () => {
    const redo = shortcuts.shortcuts.find((s) => s.id === "redo")!;
    expect(sameCombo(comboFor(redo, true), { mods: ["shift", "meta"], key: "Z" })).toBe(true);
    expect(sameCombo(comboFor(redo, false), { mods: ["ctrl"], key: "y" })).toBe(true);
    expect(formatCombo(comboFor(redo, true), true)).toBe("⇧ ⌘ Z");
    expect(formatCombo(comboFor(redo, false), false)).toBe("Ctrl + Y");
  });

  it("drills weak shortcuts more and never repeats back to back", () => {
    const state = fullyUnlocked();
    for (const s of shortcuts.shortcuts) recordShortcut(state, s.id, true, 600);
    for (let i = 0; i < 5; i++) recordShortcut(state, "redo", false, 4000);
    const drill = planShortcutDrill(state, shortcuts, 200, new Rng(1));
    for (let i = 1; i < drill.length; i++) expect(drill[i].id).not.toBe(drill[i - 1].id);
    const redoShare = drill.filter((s) => s.id === "redo").length / drill.length;
    expect(redoShare).toBeGreaterThan(1 / shortcuts.shortcuts.length);
  });
});

describe("migration", () => {
  it("upgrades version 1 profiles", () => {
    const v1 = { ...createProfile("physical", 1), version: 1 } as Record<string, unknown>;
    delete v1.difficulty;
    delete v1.modsUnlocked;
    delete v1.modsMastered;
    const p = migrateProfile(v1);
    expect(p.version).toBe(7);
    expect(p.difficulty).toBe(0.3);
    expect(p.modsUnlocked).toEqual([]);
  });
});
