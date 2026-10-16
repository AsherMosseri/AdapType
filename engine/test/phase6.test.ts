import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import code from "../../content/code.json";
import quotes from "../../content/quotes.json";
import {
  areNeighbors,
  classifyErrors,
  createProfile,
  fingerMap,
  KEY_LAYOUTS,
  LAYOUT_IDS,
  LETTERS,
  makeReplay,
  migrateProfile,
  mixWordPacks,
  nextLetter,
  replayRound,
  screenZoneMap,
  setUnlockOrder,
  thumbMap,
  TypingRound,
  wordsFromText,
  zoneMap,
  type ShortcutPack,
  type TypingEvent,
} from "../src";

const CONTENT = join(__dirname, "..", "..", "content");
const shortcutPacks: ShortcutPack[] = readdirSync(CONTENT)
  .filter((f) => f.startsWith("shortcuts-"))
  .map((f) => JSON.parse(readFileSync(join(CONTENT, f), "utf-8")));

describe("custom words", () => {
  it("keeps only words and counts, never the text", () => {
    const words = wordsFromText("Dear Sam, the deadline moved. The deadline is Friday!");
    expect(words[0]).toEqual(["deadline", 2]);
    expect(words.map((w) => w[0])).not.toContain("sam,");
    expect(JSON.stringify(words)).not.toContain("moved.");
  });

  it("mixes packs without repeats", () => {
    const mixed = mixWordPacks([{ words: ["the", "and", "of"], weight: 2 }, { words: ["deadline", "the"], weight: 2 }]).words;
    expect(new Set(mixed).size).toBe(mixed.length);
    expect(mixed.slice(0, 2)).toEqual(["the", "deadline"]);
  });
});

describe("typing newlines", () => {
  it("fills indentation after a correct newline, but not after a wrong key", () => {
    const round = new TypingRound("a\n  b", "backspace", { autoIndent: true });
    const type = (char: string, t: number) => round.input({ kind: "char", char, t } as TypingEvent);
    type("a", 0);
    type("\n", 1);
    expect(round.position).toBe(4);
    type("b", 2);
    expect(round.done).toBe(true);
    const plain = new TypingRound("a\n  b", "backspace");
    plain.input({ kind: "char", char: "a", t: 0 });
    plain.input({ kind: "char", char: "\n", t: 1 });
    expect(plain.position).toBe(2);
  });
});

describe("content", () => {
  it("code snippets are plain ASCII, spaces only, in nine languages", () => {
    const langs = Object.keys(code.languages);
    expect(langs.length).toBe(9);
    for (const lang of langs) {
      const snippets = (code.languages as Record<string, { snippets: string[] }>)[lang].snippets;
      expect(snippets.length).toBeGreaterThanOrEqual(10);
      for (const s of snippets) {
        expect(/^[\x20-\x7e\n]+$/.test(s), `${lang}: ${s}`).toBe(true);
        expect(s.endsWith("\n")).toBe(false);
      }
    }
  });

  it("quotes are credited and typeable", () => {
    expect(quotes.quotes.length).toBeGreaterThanOrEqual(30);
    for (const q of quotes.quotes) {
      expect(q.credit.length).toBeGreaterThan(0);
      expect(/^[\x20-\x7e\n]+$/.test(q.text), q.text).toBe(true);
    }
  });

  it("shortcut ids are unique across packs and combos are well formed", () => {
    const ids = shortcutPacks.flatMap((p) => p.shortcuts.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(shortcutPacks.length).toBeGreaterThanOrEqual(9);
    const mods = new Set(["meta", "ctrl", "alt", "shift"]);
    for (const p of shortcutPacks) {
      for (const s of p.shortcuts) {
        for (const c of [s.mac, s.other, s.linux].filter(Boolean)) {
          expect(c!.mods.every((m) => mods.has(m)), s.id).toBe(true);
          expect(c!.key.length === 1 ? c!.key === c!.key.toLowerCase() : /^[A-Z][A-Za-z0-9]+$/.test(c!.key), `${s.id} ${c!.key}`).toBe(true);
        }
      }
    }
  });
});

describe("keyboard layouts", () => {
  it("every layout has all 26 letters once, and a home-row order of all 26", () => {
    for (const id of LAYOUT_IDS) {
      const l = KEY_LAYOUTS[id];
      const letters = l.rows.join("").replace(/[^a-z]/g, "");
      expect([...letters].sort().join(""), id).toBe(LETTERS);
      expect([...l.homeRow].sort().join(""), id).toBe(LETTERS);
      for (const map of [fingerMap(id), zoneMap(id), thumbMap(id), screenZoneMap(id)]) {
        expect(Object.values(map).join("").split("").sort().join(""), id).toBe(LETTERS);
      }
    }
  });

  it("QWERTY keeps its old maps", () => {
    const sorted = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v].sort().join("")]));
    expect(sorted(fingerMap("qwerty"))).toEqual(sorted({ "Left pinky": "qaz", "Left ring": "wsx", "Left middle": "edc", "Left index": "rfvtgb", "Right index": "yhnujm", "Right middle": "ik", "Right ring": "ol", "Right pinky": "p" }));
    expect(thumbMap("qwerty")).toEqual({ "Left thumb": "qwertasdfgzxcv", "Right thumb": "yuiophjklbnm" });
    expect(sorted(screenZoneMap("qwerty"))).toEqual(sorted({ "Left, top row": "qwe", "Middle, top row": "rtyu", "Right, top row": "iop", "Left, middle row": "asd", "Middle, middle row": "fghj", "Right, middle row": "kl", "Left, bottom row": "zx", "Middle, bottom row": "cvb", "Right, bottom row": "nm" }));
  });

  it("neighbors, home-row unlocks and error types follow the layout", () => {
    expect(areNeighbors("e", "u", "dvorak")).toBe(true);
    expect(areNeighbors("e", "u", "qwerty")).toBe(false);
    const dvorak = createProfile("physical", 1, "homeRow", "dvorak");
    expect(dvorak.unlocked).toEqual(["a", "o", "e", "u", "h", "t"]);
    expect(nextLetter(dvorak)).toBe("n");
    const round = new TypingRound("the", "backspace");
    for (const [char, t] of [["t", 0], ["h", 100], ["u", 200]] as const) round.input({ kind: "char", char, t });
    expect(classifyErrors(round.target, round.records, "dvorak")[0].type).toBe("neighbor");
    expect(classifyErrors(round.target, round.records, "qwerty")[0].type).toBe("other");
    const colemak = createProfile("physical", 1, "frequency", "colemak");
    setUnlockOrder(colemak, "homeRow");
    expect(colemak.unlocked).toEqual(["a", "r", "s", "t", "n", "e"]);
  });
});

describe("migration", () => {
  it("upgrades version 6 profiles to QWERTY", () => {
    const v6 = { ...createProfile("physical", 1), version: 6 } as Record<string, unknown>;
    delete v6.layout;
    const p = migrateProfile(v6);
    expect(p.version).toBe(9);
    expect(p.layout).toBe("qwerty");
  });

  it("upgrades version 5 profiles", () => {
    const v5 = { ...createProfile("physical", 1), version: 5 } as Record<string, unknown>;
    delete v5.recentPassages;
    const p = migrateProfile(v5);
    expect(p.version).toBe(9);
    expect(p.recentPassages).toEqual([]);
  });
});

describe("block mode catching up", () => {
  const typeAll = (round: TypingRound, text: string) => [...text].forEach((char, i) => round.input({ kind: "char", char, t: i * 100 }));

  it("moves on after a late letter, a skipped letter, and a letter fixed in place", () => {
    for (const [keys, typed, errors] of [["teh cat", "the cat", 1], ["te cat", "tee cat", 1], ["tehe cat", "the cat", 1]] as const) {
      const round = new TypingRound("the cat", "block");
      typeAll(round, keys);
      expect(round.done).toBe(true);
      expect(round.typed.join("")).toBe(typed);
      expect(round.metrics().firstErrors).toBe(errors);
    }
  });

  it("still waits for the right key when the wrong keys don't match what follows", () => {
    const round = new TypingRound("the cat", "block");
    typeAll(round, "txy");
    expect(round.position).toBe(1);
  });

  it("is off in the other modes and when replaying runs recorded before it", () => {
    const skip = new TypingRound("the cat", "skip");
    typeAll(skip, "te cat");
    expect(skip.typed.join("")).toBe("te cat");
    const old = replayRound({ target: "the cat", errorMode: "block", events: [..."te cat"].map((c, i): [number, string] => [i * 100, c]) });
    expect(old.position).toBe(1);
  });

  it("records block-mode replays with catching up, so they replay as typed", () => {
    const events = [..."te cat"].map((char, i) => ({ kind: "char" as const, char, t: i * 100 }));
    const run = makeReplay("the cat", "block", events, 0, "practice");
    expect(run.catchUp).toBe(true);
    expect(replayRound(run).done).toBe(true);
    expect(makeReplay("the cat", "skip", events, 0, "practice")).not.toHaveProperty("catchUp");
  });
});
