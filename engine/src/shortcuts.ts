import { SHORTCUT_MAX_MS, SHORTCUT_TARGET_MS } from "./constants";
import type { Rng } from "./rng";
import { weakness } from "./scoring";
import { addSample, emptyStat } from "./stats";
import type { Goal, ProfileState } from "./types";

export type ModifierKey = "meta" | "ctrl" | "alt" | "shift";

export interface Combo {
  mods: ModifierKey[];
  /** A lowercase letter, or a key name such as "ArrowLeft", "Backspace", "Home", "F3". */
  key: string;
}

export interface Shortcut {
  id: string;
  action: string;
  group: string;
  mac: Combo;
  /** Windows and Linux. */
  other: Combo;
}

export interface ShortcutPack {
  id: string;
  name: string;
  shortcuts: readonly Shortcut[];
}

/** The goal a shortcut is scored against: answered within SHORTCUT_TARGET_MS, 90% right. */
export const SHORTCUT_GOAL: Goal = { wpm: 12000 / SHORTCUT_TARGET_MS, accuracy: 0.9 };

export function shortcutKey(id: string): string {
  return `sc:${id}`;
}

export function comboFor(shortcut: Shortcut, mac: boolean): Combo {
  return mac ? shortcut.mac : shortcut.other;
}

const MOD_ORDER: ModifierKey[] = ["ctrl", "alt", "shift", "meta"];

export function sameCombo(a: Combo, b: Combo): boolean {
  if (a.key.toLowerCase() !== b.key.toLowerCase()) return false;
  if (a.mods.length !== b.mods.length) return false;
  return a.mods.every((m) => b.mods.includes(m));
}

/** Readable combo, e.g. "⌘ ⇧ Z" on Mac or "Ctrl + Shift + Z" elsewhere. */
export function formatCombo(combo: Combo, mac: boolean): string {
  const mods = [...combo.mods].sort((x, y) => MOD_ORDER.indexOf(x) - MOD_ORDER.indexOf(y));
  const keyName = KEY_NAMES[combo.key] ?? (combo.key.length === 1 ? combo.key.toUpperCase() : combo.key);
  if (mac) {
    const symbols: Record<ModifierKey, string> = { ctrl: "⌃", alt: "⌥", shift: "⇧", meta: "⌘" };
    return [...mods.map((m) => symbols[m]), MAC_KEY_NAMES[combo.key] ?? keyName].join(" ");
  }
  const names: Record<ModifierKey, string> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Win" };
  return [...mods.map((m) => names[m]), keyName].join(" + ");
}

const KEY_NAMES: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Backspace: "Backspace",
};
const MAC_KEY_NAMES: Record<string, string> = { Backspace: "⌫" };

/**
 * Picks the shortcuts for a drill, favoring weak and unseen ones: weight is
 * 0.2 + weakness against SHORTCUT_GOAL. Never the same shortcut twice in a row.
 */
export function planShortcutDrill(state: ProfileState, pack: ShortcutPack, count: number, rng: Rng): Shortcut[] {
  const list = pack.shortcuts;
  const weights = list.map((s) => 0.2 + weakness(state.keys[shortcutKey(s.id)], SHORTCUT_GOAL));
  const picks: Shortcut[] = [];
  let previous = -1;
  for (let i = 0; i < count; i++) {
    const w = weights.map((x, idx) => (idx === previous ? 0 : x));
    let idx = rng.weightedIndex(w);
    if (idx < 0) idx = rng.int(list.length);
    picks.push(list[idx]);
    previous = idx;
  }
  return picks;
}

/** Records one answered prompt: an error if the first attempt was wrong; time counts if under SHORTCUT_MAX_MS. */
export function recordShortcut(state: ProfileState, id: string, firstTryCorrect: boolean, ms: number): void {
  const entry = (state.keys[shortcutKey(id)] ??= emptyStat());
  addSample(entry, !firstTryCorrect, ms >= 0 && ms <= SHORTCUT_MAX_MS ? ms : null);
}
