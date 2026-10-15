// Wording for round explanations. Each theme has a tone: clean is plain,
// terminal terse, cute playful, mechanical matter-of-fact.
import type { KeyDetail, ModifierId, RoundExplanation, UnlockableId } from "../../engine/src";
import { activeTheme } from "./appearance";
import type { ThemeId } from "./store";

export type Tone = "plain" | "terse" | "playful" | "matter";

export const THEME_TONES: Record<ThemeId, Tone> = { clean: "plain", terminal: "terse", cute: "playful", mechanical: "matter" };

export function currentTone(): Tone {
  return THEME_TONES[activeTheme()];
}

export const MODIFIER_NAMES: Record<UnlockableId, string> = {
  caps: "Capitals",
  punct: "Punctuation",
  numbers: "Numbers",
  symbols: "Symbols",
  accents: "Accented words",
  extra: "Extra characters",
  shortcuts: "Shortcut drill",
};

/** Short visual labels for the strip of letters and modifiers. */
export const MODIFIER_GLYPHS: Record<UnlockableId, string> = {
  caps: "Aa",
  punct: ".,?",
  numbers: "123",
  symbols: "#&",
  accents: "é",
  extra: "©",
  shortcuts: "⌘",
};

export function oneIn(rate: number): string {
  return `1 in ${Math.max(2, Math.round(1 / rate))}`;
}

/** The one-line banner before a round, in the theme's tone. */
export function roundBanner(explanation: RoundExplanation, tone: Tone = currentTone()): string {
  const e = explanation;
  const focus = [...e.keys, ...e.pairs.map((p) => (tone === "terse" ? p : `the pair ${p}`))];
  const mods = e.modifiers.map((m) => `${MODIFIER_NAMES[m.id].toLowerCase()} (${oneIn(m.rate)} words)`);
  const parts: string[] = [];
  if (tone === "terse") {
    if (e.newLetter) parts.push(`new: ${e.newLetter}`);
    if (focus.length) parts.push(`target: ${focus.join(" ")}`);
    if (e.reviewWords?.length) parts.push(`review: ${e.reviewWords.join(" ")}`);
    if (e.fatigued) parts.push("load: reduced");
    if (e.modifiers.length) parts.push(`mods: ${e.modifiers.map((m) => `${m.id} 1/${Math.max(2, Math.round(1 / m.rate))}`).join(" ")}`);
    return `> ${parts.length ? parts.join(" | ") : "all keys nominal"}`;
  }
  if (tone === "playful") {
    if (e.newLetter) parts.push(`Ooh, a new letter: ${e.newLetter}! Say hi.`);
    if (focus.length) parts.push(`Giving ${list(focus)} some extra love.`);
    if (e.reviewWords?.length) parts.push(`Old friends back for a visit: ${list(e.reviewWords)}.`);
    if (e.fatigued) parts.push("Taking it easy for a bit. You've earned it.");
    if (mods.length) parts.push(`Sprinkled with ${list(mods)}.`);
    if (!parts.length) parts.push("Everything's looking lovely. Just a nice even mix today!");
    return parts.join(" ");
  }
  if (tone === "matter") {
    if (e.newLetter) parts.push(`New key: ${e.newLetter}.`);
    if (focus.length) parts.push(`Targeting ${list(focus)}.`);
    if (e.reviewWords?.length) parts.push(`Review: ${list(e.reviewWords)}.`);
    if (e.fatigued) parts.push("Load reduced while you recover.");
    if (mods.length) parts.push(`Modifiers: ${list(mods)}.`);
    if (!parts.length) parts.push("Even mix. No weak keys stand out.");
    return parts.join(" ");
  }
  if (e.newLetter) parts.push(`New letter: ${e.newLetter}.`);
  if (focus.length > 0) parts.push(`Focusing on ${list(focus)}.`);
  if (e.reviewWords?.length) parts.push(`Back for review: ${list(e.reviewWords)}.`);
  if (e.fatigued) parts.push("A little easier while you recover.");
  if (mods.length > 0) parts.push(`With ${list(mods)}.`);
  if (parts.length === 0) parts.push("Practicing all your letters evenly. Nothing stands out as weak right now.");
  return parts.join(" ");
}

export function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const REASONS: Record<KeyDetail["reasons"][number], string> = {
  new: "It's your newest letter.",
  unknown: "There isn't much data on it yet.",
  slow: "It's slower than your goal.",
  errors: "It has more errors than your accuracy target allows.",
  fine: "It's at your goal, so it only shows up as often as normal.",
  hesitant: "You often pause before it, even when you get it right. It needs confidence more than accuracy.",
  review: "It's due for review: you missed it before, so it comes back to check it stuck.",
};

export function reasonText(reasons: KeyDetail["reasons"]): string {
  return reasons.map((r) => REASONS[r]).join(" ");
}

export function modifierName(id: ModifierId | UnlockableId): string {
  return MODIFIER_NAMES[id];
}
