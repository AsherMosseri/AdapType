import type { AchievementDef } from "../../../engine/src";
import { activeTheme } from "../appearance";
import { ICONS } from "../dom";

const NS = "http://www.w3.org/2000/svg";

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Symbols on a 24-unit grid, drawn as strokes (filled where marked). */
type Glyph = { paths: readonly string[]; fill?: boolean } | { text: string };
const GLYPHS: Record<string, Glyph> = {
  speed: { paths: ["M13 2L4 14h7l-1 8 9-12h-7l1-8z"], fill: true },
  letters: { text: "Az" },
  streak: { paths: ["M12 22c4 0 7-3 7-7 0-4-3-6-4-10-2 3-2 5-3 6-1-2-2-3-2-5-3 3-5 6-5 9 0 4 3 7 7 7z"] },
  nemesis: { paths: ["M14.5 17.5L3 6V3h3l11.5 11.5", "M13 19l6-6", "M16 16l4 4", "M19 21l2-2"] },
  creature: { paths: ["M12 4c5 0 8 4 8 9s-3 8-8 8-8-3-8-8 3-9 8-9z", "M9 12h.01", "M15 12h.01", "M9.5 16c1.5 1 3.5 1 5 0"] },
  accuracy: { paths: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z", "M12 11.5v1"] },
  rhythm: { paths: ["M2 12h3l3-7 4 14 3-9 2 2h5"] },
  arcade: { paths: ICONS.arcade },
  races: { paths: ["M5 21V4", "M5 4h11l-2 4 2 4H5"] },
  groove: { paths: ICONS.music },
  daily: { paths: ICONS.calendar },
  passages: { paths: ICONS.quote },
  drills: { paths: ICONS.command },
  rounds: { paths: ICONS.keyboard },
  perfect: { paths: ["M12 3l2.7 5.6 6.2.9-4.5 4.4 1 6.1L12 17l-5.4 2.9 1-6.1L3.1 9.5l6.2-.9z"] },
  moon: { paths: ["M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"] },
  sun: { paths: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M12 2v2", "M12 20v2", "M4.9 4.9l1.4 1.4", "M17.7 17.7l1.4 1.4", "M2 12h2", "M20 12h2", "M4.9 19.1l1.4-1.4", "M17.7 6.3l1.4-1.4"] },
  the: { text: "the" },
  stopwatch: { paths: ["M12 7a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M12 10v4l2 1", "M10 3h4", "M12 3v4"] },
  hourglass: { paths: ["M6 3h12", "M6 21h12", "M7 3c0 5 10 6 10 9s-10 4-10 9", "M17 3c0 5-10 6-10 9s10 4 10 9"] },
  tortoise: { paths: ["M4 15c0-5 3.6-8 8-8s8 3 8 8z", "M2 15h20", "M7 15v3", "M17 15v3", "M20 13h2.5"] },
  skull: { paths: ["M12 3a8 8 0 0 0-5 14.2V20h10v-2.8A8 8 0 0 0 12 3z", "M9 11h.01", "M15 11h.01", "M10 20v-2", "M14 20v-2"] },
  palette: { paths: ["M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-1.2-1-1.6-1-2.6 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z", "M7.5 11h.01", "M10 7h.01", "M14.5 7h.01"] },
  mystery: { text: "?" },
};

function glyphFor(def: AchievementDef): string {
  if (def.track) return def.track;
  const id = def.id;
  if (id.startsWith("speed")) return "speed";
  if (id.startsWith("letters")) return "letters";
  if (id.startsWith("streak")) return "streak";
  if (id.startsWith("nemesis")) return "nemesis";
  if (id.startsWith("creature")) return "creature";
  if (id === "theme-dark") return "moon";
  if (id.startsWith("theme")) return "palette";
  return { perfect: "perfect", "night-owl": "moon", "early-bird": "sun", "the-1000": "the", "photo-finish": "stopwatch", marathon: "hourglass", tortoise: "tortoise", hardcore: "skull", "full-combo": "groove" }[id] ?? "perfect";
}

/** The medal shape in each theme's style: a round medal, a pixel frame, a flower, or a keycap. */
function frame(theme: string): SVGElement[] {
  switch (theme) {
    case "terminal":
      return [el("path", { d: "M10 4h44v6h6v44h-6v6H10v-6H4V10h6z", class: "badge-rim" }), el("path", { d: "M14 10h36v4h4v36h-4v4H14v-4h-4V14h4z", class: "badge-face" })];
    case "cute": {
      // Eight petals around a circle.
      let d = "";
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = 32 + Math.cos(a) * 19, y = 32 + Math.sin(a) * 19;
        d += `M${(x + 11).toFixed(1)} ${y.toFixed(1)}a11 11 0 1 0 -22 0a11 11 0 1 0 22 0z`;
      }
      return [el("path", { d, class: "badge-rim" }), el("circle", { cx: 32, cy: 32, r: 21, class: "badge-face" })];
    }
    case "mechanical":
      return [el("rect", { x: 5, y: 6, width: 54, height: 54, rx: 11, class: "badge-rim" }), el("rect", { x: 11, y: 9, width: 42, height: 40, rx: 8, class: "badge-face" })];
    default:
      return [el("circle", { cx: 32, cy: 32, r: 29, class: "badge-rim" }), el("circle", { cx: 32, cy: 32, r: 22, class: "badge-face" })];
  }
}

/**
 * A badge's art in the current theme's style. Bronze, silver and gold tiers
 * color the rim; other badges use the theme's accent (secrets are dark).
 * Badges not yet earned are grey, and secrets show a question mark.
 */
export function badgeSvg(def: AchievementDef, earned: boolean, size = 48): SVGSVGElement {
  const theme = activeTheme();
  const hidden = def.group === "secret" && !earned;
  const svg = el("svg", {
    viewBox: "0 0 64 64",
    width: size,
    height: size,
    class: `badge badge-${theme} ${def.tier ? `tier-${def.tier}` : `group-${def.group}`}${earned ? "" : " locked"}`,
    "aria-hidden": "true",
  });
  svg.append(...frame(theme));
  const glyph = GLYPHS[hidden ? "mystery" : glyphFor(def)] ?? GLYPHS.perfect;
  const cy = theme === "mechanical" ? 29 : 32;
  if ("text" in glyph) {
    const t = el("text", { x: 32, y: cy + 1, "text-anchor": "middle", "dominant-baseline": "central", class: "badge-text-glyph" });
    t.textContent = glyph.text;
    if (glyph.text.length > 2) t.setAttribute("font-size", "13");
    svg.append(t);
  } else {
    const g = el("g", { transform: `translate(${32 - 12 * 1.15} ${cy - 12 * 1.15}) scale(1.15)`, class: glyph.fill ? "badge-glyph fill" : "badge-glyph" });
    for (const d of glyph.paths) g.append(el("path", { d }));
    svg.append(g);
  }
  return svg;
}
