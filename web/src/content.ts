import blocklistJson from "../../content/blocklist.json";
import charactersJson from "../../content/characters.json";
import loanwordsJson from "../../content/loanwords.json";
import nemesisJson from "../../content/nemesis.json";
import shortcutsJson from "../../content/shortcuts-text-editing.json";
import touchJson from "../../content/touch-layouts.json";
import packJson from "../../content/words-en.json";
import type { Blocklist, CharacterData, NemesisContent, ShortcutPack, WordPack } from "../../engine/src";

export const pack: WordPack = { words: packJson.words, id: packJson.id, version: packJson.version };
export const blocklist: Blocklist = blocklistJson;
export const packCredits: string[] = packJson.credits;
export const characters: CharacterData = { ...charactersJson, loanwords: loanwordsJson.words };
export const textEditingShortcuts = shortcutsJson as ShortcutPack;

export type TouchLayerName = "letters" | "numbers" | "symbols";
export type TouchLayout = Record<TouchLayerName, string[][]>;
export const touchLayouts = touchJson.layouts as Record<"ios" | "android", TouchLayout>;
export const touchAlternates: Record<string, string> = touchJson.alternates;
export const nemesisContent: NemesisContent = nemesisJson;

/** Nemesis names with taunts and the defeat line in a theme's tone (plain is the default set). */
export function nemesisContentFor(tone: "plain" | "terse" | "playful" | "matter"): NemesisContent {
  if (tone === "plain") return nemesisContent;
  const t = nemesisJson.tones[tone];
  return { names: nemesisJson.names, taunts: t.taunts, defeat: t.defeat };
}
