// Which system the player is on, what it can type, and how to type special characters.
import { extraForSystem, type Platform } from "../../engine/src";
import type { App } from "./app";
import { characters, touchAlternates, touchLayouts, type TouchLayerName, type TouchLayout } from "./content";
import type { OsChoice, Settings } from "./store";

export type Os = Exclude<OsChoice, "auto">;

export function detectOs(): Os {
  const ua = navigator.userAgent;
  if (/Mac|iPhone|iPad|iPod/.test(ua)) return "mac";
  if (/Windows/.test(ua)) return "windows";
  return "linux";
}

export function currentOs(settings: Settings): Os {
  return settings.os === "auto" ? detectOs() : settings.os;
}

export const OS_NAMES: Record<Os, string> = {
  mac: "Mac",
  windows: "Windows (US)",
  "windows-intl": "Windows (US-International)",
  linux: "Linux",
};

export function detectTouchLayout(): "ios" | "android" {
  const ua = navigator.userAgent;
  if (/Android/.test(ua)) return "android";
  return "ios";
}

export function currentTouchLayout(settings: Settings): { name: "ios" | "android"; layout: TouchLayout } {
  const name = settings.touchLayout === "auto" ? detectTouchLayout() : settings.touchLayout;
  return { name, layout: touchLayouts[name] };
}

/** Every character reachable on a touch layout, by layer key or long-press. */
export function touchReachable(layout: TouchLayout): string[] {
  const set = new Set<string>();
  for (const layer of Object.values(layout)) for (const row of layer) for (const key of row) if ([...key].length === 1) set.add(key);
  for (const [key, alts] of Object.entries(touchAlternates)) if (set.has(key)) for (const a of alts) set.add(a);
  return [...set];
}

/** What the active profile's device can type. */
export function platformFor(app: App): Platform {
  const settings = app.data.settings;
  const full = settings.extraSet === "full";
  if (app.data.settings.activeProfile === "touch") {
    const { layout } = currentTouchLayout(settings);
    return { extra: extraForSystem(characters, { touchReachable: touchReachable(layout) }, { full, altCodes: false }), accents: true };
  }
  const os = currentOs(settings);
  return {
    extra: extraForSystem(characters, os, { full, altCodes: settings.altCodes }),
    accents: os !== "windows" || settings.altCodes,
  };
}

/** How to type a special character on a physical keyboard, or null for ordinary keys. */
export function physicalHint(ch: string, settings: Settings): string | null {
  const os = currentOs(settings);
  const lower = ch.toLowerCase();
  const upper = ch !== lower;
  const accent = characters.accents[lower];
  const extra = characters.extra[ch];
  const closer = Object.values(characters.extra).find((x) => x.close === ch);
  let hint: string | undefined;
  if (accent) hint = os === "mac" ? accent.mac : os === "windows-intl" ? accent.windowsIntl : os === "windows" ? altCode(accent.altCode) : "AltGr or Compose";
  else if (extra) hint = os === "mac" ? extra.mac : os === "windows-intl" ? extra.windowsIntl ?? altCode(extra.altCode) : os === "windows" ? altCode(extra.altCode) : "AltGr or Compose";
  else if (closer) {
    const c = closer as { closeMac?: string; closeWindowsIntl?: string; closeAltCode?: string };
    hint = os === "mac" ? c.closeMac : os === "windows-intl" ? c.closeWindowsIntl ?? altCode(c.closeAltCode) : os === "windows" ? altCode(c.closeAltCode) : "AltGr or Compose";
  }
  if (!hint) return null;
  return upper && accent ? `${hint}, with Shift on the letter` : hint;
}

function altCode(code: string | undefined): string | undefined {
  return code ? `hold Alt, type ${code} on the number pad` : undefined;
}

/** How to reach a character on the touch keyboard, or null when it's on the letter layer. */
export function touchHint(ch: string, layout: TouchLayout, name: "ios" | "android"): string | null {
  if (ch === " " || (ch >= "a" && ch <= "z")) return null;
  if (ch >= "A" && ch <= "Z") return "Tap ⇧ first";
  const layer = layerOf(ch, layout);
  if (layer === "numbers") return "Tap 123";
  if (layer === "symbols") return `Tap 123, then ${SYMBOL_KEY_LABEL[name]}`;
  for (const [key, alts] of Object.entries(touchAlternates)) {
    if (alts.includes(ch) || alts.includes(ch.toLowerCase())) {
      const where = layerOf(key, layout);
      const base = where === "letters" || where === null ? "" : where === "numbers" ? "On 123, hold " : "On the symbols layer, hold ";
      return `${base || "Hold "}${key} for ${ch}${ch !== ch.toLowerCase() ? " (tap ⇧ first)" : ""}`;
    }
  }
  return null;
}

/** What the key to the second symbol page is labeled on each layout. */
export const SYMBOL_KEY_LABEL = { ios: "#+=", android: "=\\<" } as const;

/** Which layer a character's key is on, if it has its own key. */
export function layerOf(ch: string, layout: TouchLayout): TouchLayerName | null {
  for (const name of ["letters", "numbers", "symbols"] as const) {
    for (const row of layout[name]) if (row.includes(ch)) return name;
  }
  if (ch >= "A" && ch <= "Z") return "letters";
  return null;
}
