import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import code from "../../content/code.json";
import quotes from "../../content/quotes.json";
import { createProfile, migrateProfile, mixWordPacks, TypingRound, wordsFromText, type ShortcutPack, type TypingEvent } from "../src";

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

describe("migration", () => {
  it("upgrades version 5 profiles", () => {
    const v5 = { ...createProfile("physical", 1), version: 5 } as Record<string, unknown>;
    delete v5.recentPassages;
    const p = migrateProfile(v5);
    expect(p.version).toBe(6);
    expect(p.recentPassages).toEqual([]);
  });
});
