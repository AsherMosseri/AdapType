// Applies the theme, light or dark, and accessibility settings to the page,
// and tells sound and creature drawing which theme is active.
// Every font ships with the app (no font service), so it all works offline.
import "@fontsource/atkinson-hyperlegible-next/400.css";
import "@fontsource/atkinson-hyperlegible-next/600.css";
import "@fontsource/atkinson-hyperlegible-next/800.css";
import "@fontsource/atkinson-hyperlegible-mono/400.css";
import "@fontsource/atkinson-hyperlegible-mono/500.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/vt323/400.css";
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/opendyslexic/400.css";
import "@fontsource/opendyslexic/700.css";
import type { Settings, ThemeId } from "./store";

export const THEMES: { id: ThemeId; name: string; blurb: string }[] = [
  { id: "clean", name: "Clean", blurb: "Calm and minimal. Plain wording." },
  { id: "terminal", name: "Terminal", blurb: "Retro green screen. Terse wording, pixel creatures, beeps." },
  { id: "cute", name: "Cute", blurb: "Soft and colorful. Playful wording, blob creatures, pops." },
  { id: "mechanical", name: "Mechanical", blurb: "Keycaps and switches. Matter-of-fact wording, thocky clicks." },
];

/** Browser chrome color per theme, light then dark (matches each theme's --bg). */
const CHROME: Record<ThemeId, [string, string]> = {
  clean: ["#f5f6f8", "#0f1115"],
  terminal: ["#f2efe4", "#050805"],
  cute: ["#fff5fa", "#1e1424"],
  mechanical: ["#e9e6df", "#1b1c1e"],
};

let currentTheme: ThemeId = "clean";
let reducedByUser = false;
let currentAccessory = "none";
let currentEffect = "none";

export function activeTheme(): ThemeId {
  return currentTheme;
}

/** The creature accessory picked as a reward ("none" by default). */
export function activeAccessory(): string {
  return currentAccessory;
}

/** The celebration effect picked as a reward ("none" by default). */
export function activeEffect(): string {
  return currentEffect;
}

/** Reduced motion from the device or the setting; for motion done in script (smooth scrolling). */
export function reduceMotion(): boolean {
  return reducedByUser || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Smooth scrolling unless motion is reduced. */
export function scrollBehavior(): ScrollBehavior {
  return reduceMotion() ? "auto" : "smooth";
}

export function isDark(): boolean {
  const mode = document.documentElement.dataset.theme;
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

export function applyAppearance(settings: Settings): void {
  const root = document.documentElement;
  const a = settings.a11y;
  currentTheme = settings.theme;
  reducedByUser = a.motion === "reduce";
  root.dataset.skin = settings.theme;
  if (settings.colorMode === "auto") delete root.dataset.theme;
  else root.dataset.theme = settings.colorMode;
  root.dataset.font = a.font;
  root.dataset.heat = a.heatmap;
  root.dataset.motion = a.motion;
  // Rewards: the cursor and the heatmap and card style are pure CSS; accessories and effects are drawn in script.
  root.dataset.cursor = settings.rewards.cursor;
  root.dataset.reward = settings.rewards.style;
  currentAccessory = settings.rewards.accessory;
  currentEffect = settings.rewards.effect;
  root.style.setProperty("--text-scale", String(Math.min(1.6, Math.max(0.8, a.textSize / 100))));
  root.style.setProperty("--type-tracking", ["0em", "0.06em", "0.12em"][a.letterSpacing]);
  root.style.setProperty("--line-scale", ["1", "1.2", "1.4"][a.lineSpacing]);
  const [light, dark] = CHROME[settings.theme];
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const forDark = meta.media.includes("dark");
    const pinned = settings.colorMode === "auto" ? (forDark ? dark : light) : settings.colorMode === "dark" ? dark : light;
    meta.content = pinned;
  }
}
