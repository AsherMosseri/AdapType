// Wording for round explanations. Phase 2 ships the plain tone of the clean
// theme; other themes bring their own tones in phase 6.
import type { KeyDetail, ModifierId, RoundExplanation, UnlockableId } from "../../engine/src";

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

/** The one-line banner before a round. */
export function roundBanner(explanation: RoundExplanation): string {
  const parts: string[] = [];
  if (explanation.newLetter) parts.push(`New letter: ${explanation.newLetter}.`);
  const focus = [...explanation.keys, ...explanation.pairs];
  if (focus.length > 0) parts.push(`Focusing on ${list(focus)}.`);
  if (explanation.modifiers.length > 0) {
    const mods = explanation.modifiers.map((m) => `${MODIFIER_NAMES[m.id].toLowerCase()} (${oneIn(m.rate)} words)`);
    parts.push(`With ${list(mods)}.`);
  }
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
};

export function reasonText(reasons: KeyDetail["reasons"]): string {
  return reasons.map((r) => REASONS[r]).join(" ");
}

export function modifierName(id: ModifierId | UnlockableId): string {
  return MODIFIER_NAMES[id];
}
