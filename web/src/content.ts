import blocklistJson from "../../content/blocklist.json";
import charactersJson from "../../content/characters.json";
import loanwordsJson from "../../content/loanwords.json";
import nemesisJson from "../../content/nemesis.json";
import codeJson from "../../content/code.json";
import quotesJson from "../../content/quotes.json";
import browserShortcuts from "../../content/shortcuts-browser.json";
import figmaShortcuts from "../../content/shortcuts-figma.json";
import googleShortcuts from "../../content/shortcuts-google-docs.json";
import linuxShortcuts from "../../content/shortcuts-os-linux.json";
import macShortcuts from "../../content/shortcuts-os-mac.json";
import windowsShortcuts from "../../content/shortcuts-os-windows.json";
import slackShortcuts from "../../content/shortcuts-slack.json";
import shortcutsJson from "../../content/shortcuts-text-editing.json";
import vscodeShortcuts from "../../content/shortcuts-vscode.json";
import touchJson from "../../content/touch-layouts.json";
import packJson from "../../content/words-en.json";
import type { Blocklist, CharacterData, NemesisContent, Passage, ShortcutPack, WordPack } from "../../engine/src";

export const pack: WordPack = { words: packJson.words, id: packJson.id, version: packJson.version };
export const blocklist: Blocklist = blocklistJson;
export const packCredits: string[] = packJson.credits;
export const characters: CharacterData = { ...charactersJson, loanwords: loanwordsJson.words };
export const textEditingShortcuts = shortcutsJson as ShortcutPack;

/** Every shortcut pack, text editing first. OS-wide packs only show on their own system. */
export const shortcutPacks = [
  shortcutsJson,
  macShortcuts,
  windowsShortcuts,
  linuxShortcuts,
  browserShortcuts,
  vscodeShortcuts,
  googleShortcuts,
  figmaShortcuts,
  slackShortcuts,
] as (ShortcutPack & { about?: string })[];

export type CodeLanguage = keyof typeof codeJson.languages;
export const codeLanguages = Object.entries(codeJson.languages).map(([id, l]) => ({ id: id as CodeLanguage, name: l.name }));

/** Code snippets for the chosen languages, as passages with stable ids ("python-3"). */
export function codePassages(langs: readonly CodeLanguage[]): Passage[] {
  return langs.flatMap((lang) => codeJson.languages[lang].snippets.map((text, i) => ({ id: `${lang}-${i}`, text, credit: codeJson.languages[lang].name })));
}

export const quotePassages: Passage[] = quotesJson.quotes.map((q, i) => ({ id: `quote-${i}`, text: q.text, credit: q.credit }));

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
