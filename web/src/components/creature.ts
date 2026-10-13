import type { CreatureStage, CreatureTraits } from "../../../engine/src";
import { activeTheme } from "../appearance";
import type { ThemeId } from "../store";

/** Each theme's drawing style. Every style keeps the creature's traits: body, eyes, top, pattern, mouth, tail. */
export type CreatureStyle = "clean" | "pixel" | "blob" | "keycap";
const THEME_STYLES: Record<ThemeId, CreatureStyle> = { clean: "clean", terminal: "pixel", cute: "blob", mechanical: "keycap" };

const NS = "http://www.w3.org/2000/svg";

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export const STAGE_NAMES = ["Egg", "Baby", "Grown", "Legendary"] as const;

/** Body outline and the points features hang off, per body shape (64 x 64 box, feet at y 58). */
const BODIES = {
  round: { d: "M32 18 C45 18 52 28 52 39 C52 51 43 57 32 57 C21 57 12 51 12 39 C12 28 19 18 32 18 Z", top: 19, half: 16 },
  tall: { d: "M32 13 C42 13 47 20 47 30 L47 46 C47 53 41 57 32 57 C23 57 17 53 17 46 L17 30 C17 20 22 13 32 13 Z", top: 14, half: 12 },
  wide: { d: "M32 25 C48 25 57 32 57 42 C57 51 47 57 32 57 C17 57 7 51 7 42 C7 32 16 25 32 25 Z", top: 26, half: 20 },
  pear: { d: "M32 16 C40 16 43 23 44 30 C51 35 54 41 54 47 C54 54 45 57 32 57 C19 57 10 54 10 47 C10 41 13 35 20 30 C21 23 24 16 32 16 Z", top: 17, half: 10 },
} as const;

/**
 * A key's creature in the clean theme's style: flat shapes with an ink
 * outline, colored from the creature's hue. Stage changes size and extras
 * (egg, small baby, grown, legendary with a crown); low health makes it
 * paler with sleepy eyes. Unmet creatures are plain silhouettes.
 */
export function creatureSvg(
  traits: CreatureTraits,
  stage: CreatureStage | null,
  options: { health?: number; size?: number; label?: string; legend?: string; style?: CreatureStyle } = {},
): SVGSVGElement {
  const size = options.size ?? 64;
  const health = options.health ?? 1;
  const style = options.style ?? THEME_STYLES[activeTheme()];
  const svg = el("svg", {
    viewBox: "0 0 64 64",
    width: size,
    height: size,
    class: `creature style-${style} stage-${stage ?? "unmet"}${health < 0.4 ? " unwell" : ""}`,
    role: "img",
    "aria-label": options.label ?? "",
  });
  svg.style.setProperty("--hue", String(traits.hue));
  svg.style.setProperty("--sat", `${Math.round(20 + 45 * health)}%`);
  if (style === "pixel") return pixelCreature(svg, traits, stage, health);
  if (style === "keycap") return keycapCreature(svg, traits, stage, health, options.legend ?? "");

  if (stage === null) {
    svg.append(el("path", { d: BODIES[traits.body].d, class: "cr-shadow" }));
    const q = el("text", { x: 32, y: 45, "text-anchor": "middle", class: "cr-unknown" });
    q.textContent = "?";
    svg.append(q);
    return svg;
  }

  if (stage === 0) {
    svg.append(el("path", { d: "M32 10 C44 10 50 28 50 40 C50 51 42 58 32 58 C22 58 14 51 14 40 C14 28 20 10 32 10 Z", class: "cr-body" }));
    if (traits.pattern === "spots" || traits.pattern === "plain") {
      svg.append(el("circle", { cx: 25, cy: 30, r: 3, class: "cr-mark" }), el("circle", { cx: 38, cy: 40, r: 4, class: "cr-mark" }), el("circle", { cx: 27, cy: 48, r: 2.5, class: "cr-mark" }));
    } else {
      svg.append(el("path", { d: "M16 34 Q32 29 48 34 M15 44 Q32 39 49 44", class: "cr-stripe" }));
    }
    // A crack once it's close to hatching would need stats; every egg wobbles instead (CSS).
    return svg;
  }

  const g = el("g", { class: "cr-figure" });
  if (stage === 1) g.setAttribute("transform", "translate(32 58) scale(0.78) translate(-32 -58)");
  svg.append(g);
  const body = BODIES[traits.body];

  // Behind the body: tail and headgear.
  if (traits.tail) g.append(el("path", { d: "M50 48 C58 48 60 40 56 35", class: "cr-tail" }));
  const top = body.top;
  const lx = 32 - body.half;
  const rx = 32 + body.half;
  if (traits.top === "ears") {
    g.append(el("path", { d: `M${lx - 2} ${top + 10} L${lx} ${top - 6} L${lx + 10} ${top + 3} Z M${rx + 2} ${top + 10} L${rx} ${top - 6} L${rx - 10} ${top + 3} Z`, class: "cr-body" }));
  } else if (traits.top === "horns") {
    g.append(el("path", { d: `M${lx + 4} ${top + 4} Q${lx - 2} ${top - 4} ${lx + 2} ${top - 9} Q${lx + 6} ${top - 2} ${lx + 10} ${top + 2} Z M${rx - 4} ${top + 4} Q${rx + 2} ${top - 4} ${rx - 2} ${top - 9} Q${rx - 6} ${top - 2} ${rx - 10} ${top + 2} Z`, class: "cr-horn" }));
  } else if (traits.top === "antenna") {
    g.append(
      el("path", { d: `M28 ${top + 2} L24 ${top - 8} M36 ${top + 2} L40 ${top - 8}`, class: "cr-line" }),
      el("circle", { cx: 24, cy: top - 9, r: 2.5, class: "cr-horn" }),
      el("circle", { cx: 40, cy: top - 9, r: 2.5, class: "cr-horn" }),
    );
  } else if (traits.top === "tuft") {
    g.append(el("path", { d: `M28 ${top + 2} Q27 ${top - 6} 30 ${top - 8} M32 ${top + 1} Q32 ${top - 8} 34 ${top - 10} M36 ${top + 2} Q38 ${top - 5} 40 ${top - 6}`, class: "cr-line" }));
  }

  g.append(el("path", { d: body.d, class: "cr-body" }));
  if (traits.pattern === "belly") g.append(el("ellipse", { cx: 32, cy: 48, rx: body.half * 0.75 + 3, ry: 7, class: "cr-belly" }));
  else if (traits.pattern === "spots") g.append(el("circle", { cx: 32 - body.half + 6, cy: 46, r: 2.5, class: "cr-mark" }), el("circle", { cx: 32 + body.half - 5, cy: 43, r: 3, class: "cr-mark" }), el("circle", { cx: 37, cy: 52, r: 2, class: "cr-mark" }));
  else if (traits.pattern === "stripes") g.append(el("path", { d: `M${32 - body.half - 2} 45 Q32 41 ${32 + body.half + 2} 45 M${32 - body.half} 51 Q32 47 ${32 + body.half} 51`, class: "cr-stripe" }));

  // Feet.
  g.append(el("ellipse", { cx: 25, cy: 57.5, rx: 4.5, ry: 2, class: "cr-foot" }), el("ellipse", { cx: 39, cy: 57.5, rx: 4.5, ry: 2, class: "cr-foot" }));

  // Eyes: babies have bigger ones; sleepy when unwell.
  const eyeY = top + (traits.body === "wide" ? 8 : 13);
  const xs = traits.eyes === 1 ? [32] : traits.eyes === 2 ? [26, 38] : [23, 32, 41];
  const r = stage === 1 ? 5 : 4.2;
  for (const [i, x] of xs.entries()) {
    const y = traits.eyes === 3 && i === 1 ? eyeY - 3 : eyeY;
    if (health < 0.4) g.append(el("path", { d: `M${x - r} ${y} Q${x} ${y + r * 0.7} ${x + r} ${y}`, class: "cr-line" }));
    else if (style === "blob") g.append(el("circle", { cx: x, cy: y, r: r * 0.85, class: "cr-pupil" }), el("circle", { cx: x - r * 0.3, cy: y - r * 0.35, r: r * 0.3, class: "cr-shine" }));
    else g.append(el("circle", { cx: x, cy: y, r, class: "cr-eye" }), el("circle", { cx: x + 0.8, cy: y + 0.6, r: r * 0.45, class: "cr-pupil" }));
  }
  // Blobs blush.
  if (style === "blob") g.append(el("ellipse", { cx: xs[0] - 4, cy: eyeY + 6, rx: 3.2, ry: 2, class: "cr-blush" }), el("ellipse", { cx: xs[xs.length - 1] + 4, cy: eyeY + 6, rx: 3.2, ry: 2, class: "cr-blush" }));

  // Mouth.
  const my = eyeY + 9;
  if (traits.mouth === "smile") g.append(el("path", { d: `M27 ${my} Q32 ${my + 5} 37 ${my}`, class: "cr-line" }));
  else if (traits.mouth === "fangs") g.append(el("path", { d: `M26 ${my} Q32 ${my + 4} 38 ${my}`, class: "cr-line" }), el("path", { d: `M29 ${my + 1.5} L30 ${my + 5} L31.5 ${my + 2} M33 ${my + 2} L34.5 ${my + 5} L35.5 ${my + 1.5}`, class: "cr-fang" }));
  else if (traits.mouth === "open") g.append(el("ellipse", { cx: 32, cy: my + 1.5, rx: 3.5, ry: 3, class: "cr-pupil" }));
  else g.append(el("path", { d: `M28 ${my - 1} L36 ${my - 1} L32 ${my + 4} Z`, class: "cr-beak" }));

  if (stage === 3) {
    g.append(el("path", { d: `M22 ${top - 3} L22 ${top - 13} L27 ${top - 8} L32 ${top - 15} L37 ${top - 8} L42 ${top - 13} L42 ${top - 3} Z`, class: "cr-crown" }));
    svg.append(el("path", { d: "M6 14 L8 18 L12 20 L8 22 L6 26 L4 22 L0 20 L4 18 Z M57 6 L58.5 9 L61.5 10.5 L58.5 12 L57 15 L55.5 12 L52.5 10.5 L55.5 9 Z", class: "cr-sparkle" }));
  }
  return svg;
}

/** Body masks on a 16 x 16 grid, for pixel creatures. */
const PIXEL_BODIES: Record<CreatureTraits["body"], (x: number, y: number) => boolean> = {
  round: (x, y) => ((x - 7.5) / 6.3) ** 2 + ((y - 9.3) / 5.6) ** 2 <= 1,
  tall: (x, y) => x >= 4 && x <= 11 && y >= 3 && y <= 14 && !((x === 4 || x === 11) && (y === 3 || y === 14)),
  wide: (x, y) => ((x - 7.5) / 7.4) ** 2 + ((y - 10.5) / 4.1) ** 2 <= 1,
  pear: (x, y) => y >= 4 && y <= 14 && Math.abs(x - 7.5) <= (y < 8 ? 2.5 + (y - 4) * 0.4 : 4.5 + Math.min(2, (y - 8) * 0.6)),
};
const EGG = (x: number, y: number) => ((x - 7.5) / 4.8) ** 2 + ((y - 9) / (y < 9 ? 6.4 : 5.4)) ** 2 <= 1;

/** Terminal style: pixel art on a 16 x 16 grid, one color family (the theme's). */
function pixelCreature(svg: SVGSVGElement, traits: CreatureTraits, stage: CreatureStage | null, health: number): SVGSVGElement {
  svg.setAttribute("shape-rendering", "crispEdges");
  const g = el("g", {});
  if (stage === 1) g.setAttribute("transform", "translate(32 60) scale(0.8) translate(-32 -60)");
  svg.append(g);
  const px = (x: number, y: number, cls: string) => g.append(el("rect", { x: x * 4, y: y * 4, width: 4, height: 4, class: cls }));
  const mask = stage === null || stage === 0 ? (stage === null ? PIXEL_BODIES[traits.body] : EGG) : PIXEL_BODIES[traits.body];
  let top = 16;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (mask(x, y)) top = Math.min(top, y);
  const inside = (x: number, y: number) => x >= 0 && x < 16 && y >= 0 && y < 16 && mask(x, y);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (!mask(x, y)) continue;
      if (stage === null) {
        px(x, y, "px-shadow");
        continue;
      }
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      let cls = edge ? "px-edge" : "px-body";
      if (!edge && traits.pattern === "spots" && (x * 7 + y * 3) % 11 === 0) cls = "px-mark";
      if (!edge && traits.pattern === "stripes" && y % 3 === 0 && y > top + 3) cls = "px-mark";
      if (!edge && traits.pattern === "belly" && y >= 11 && Math.abs(x - 7.5) < 3) cls = "px-light";
      px(x, y, cls);
    }
  }
  if (stage === null || stage === 0) return svg;
  // Headgear above the top row.
  if (traits.top === "ears") [[4, top - 1], [11, top - 1], [4, top - 2], [11, top - 2]].forEach(([x, y]) => px(x, y, "px-edge"));
  else if (traits.top === "horns") [[5, top - 1], [10, top - 1], [4, top - 2], [11, top - 2]].forEach(([x, y]) => px(x, y, "px-mark"));
  else if (traits.top === "antenna") [[6, top - 1], [9, top - 1], [5, top - 2], [10, top - 2]].forEach(([x, y]) => px(x, y, "px-edge"));
  else if (traits.top === "tuft") [[7, top - 1], [8, top - 2], [6, top - 2]].forEach(([x, y]) => px(x, y, "px-edge"));
  if (traits.tail) [[13, 12], [14, 11], [14, 10]].forEach(([x, y]) => !inside(x, y) && px(x, y, "px-edge"));
  // Face.
  const eyeY = top + (traits.body === "wide" ? 2 : 3);
  const eyes = traits.eyes === 1 ? [7] : traits.eyes === 2 ? [5, 10] : [4, 7, 11];
  for (const x of eyes) {
    if (health < 0.4) px(x, eyeY + 1, "px-eye");
    else {
      px(x, eyeY, "px-eye");
      if (stage === 1) px(x, eyeY + 1, "px-eye");
    }
  }
  const my = eyeY + 3;
  if (traits.mouth === "open") px(7, my, "px-eye"), px(8, my, "px-eye"), px(7, my + 1, "px-eye"), px(8, my + 1, "px-eye");
  else if (traits.mouth === "beak") px(7, my, "px-mark"), px(8, my, "px-mark");
  else {
    px(6, my, "px-eye");
    px(7, my + 1, "px-eye");
    px(8, my + 1, "px-eye");
    px(9, my, "px-eye");
    if (traits.mouth === "fangs") px(7, my + 2, "px-light"), px(8, my + 2, "px-light");
  }
  if (stage === 3) {
    for (const [x, y] of [[5, top - 3], [7, top - 4], [9, top - 4], [11, top - 3], [5, top - 2], [6, top - 2], [7, top - 2], [8, top - 2], [9, top - 2], [10, top - 2], [11, top - 2], [7, top - 3], [9, top - 3]]) px(x, y, "px-gold");
    for (const [x, y] of [[1, 2], [14, 1], [1, 12]]) px(x, y, "px-gold");
  }
  return svg;
}

/** Mechanical style: a keycap critter, with the key's legend on its cap. */
function keycapCreature(svg: SVGSVGElement, traits: CreatureTraits, stage: CreatureStage | null, health: number, legend: string): SVGSVGElement {
  const g = el("g", {});
  if (stage === 0) g.setAttribute("transform", "translate(32 58) scale(0.72) translate(-32 -58)");
  else if (stage === 1) g.setAttribute("transform", "translate(32 58) scale(0.82) translate(-32 -58)");
  svg.append(g);
  const wide = traits.body === "wide" ? 4 : traits.body === "tall" ? -3 : 0;
  const tall = traits.body === "tall" ? -4 : traits.body === "wide" ? 4 : 0;
  const x0 = 11 - wide;
  const x1 = 53 + wide;
  const y0 = 16 + tall;
  if (stage === null) {
    g.append(el("rect", { x: x0, y: y0, width: x1 - x0, height: 56 - y0, rx: 9, class: "cr-shadow" }));
    const q = el("text", { x: 32, y: 44, "text-anchor": "middle", class: "cr-unknown" });
    q.textContent = "?";
    g.append(q);
    return svg;
  }
  if (stage > 0) {
    if (traits.tail) g.append(el("path", { d: `M${x1} 46 C${x1 + 8} 46 ${x1 + 9} 38 ${x1 + 5} 34`, class: "cr-tail" }));
    if (traits.top === "ears") g.append(el("path", { d: `M${x0 + 2} ${y0 + 6} L${x0 + 3} ${y0 - 7} L${x0 + 12} ${y0 + 1} Z M${x1 - 2} ${y0 + 6} L${x1 - 3} ${y0 - 7} L${x1 - 12} ${y0 + 1} Z`, class: "cap-side" }));
    else if (traits.top === "horns") g.append(el("path", { d: `M${x0 + 6} ${y0 + 1} Q${x0} ${y0 - 6} ${x0 + 4} ${y0 - 10} Q${x0 + 8} ${y0 - 3} ${x0 + 12} ${y0} Z M${x1 - 6} ${y0 + 1} Q${x1} ${y0 - 6} ${x1 - 4} ${y0 - 10} Q${x1 - 8} ${y0 - 3} ${x1 - 12} ${y0} Z`, class: "cr-horn" }));
    else if (traits.top === "antenna") g.append(el("path", { d: `M27 ${y0} L23 ${y0 - 9} M37 ${y0} L41 ${y0 - 9}`, class: "cr-line" }), el("circle", { cx: 23, cy: y0 - 10, r: 2.5, class: "cr-horn" }), el("circle", { cx: 41, cy: y0 - 10, r: 2.5, class: "cr-horn" }));
    else if (traits.top === "tuft") g.append(el("path", { d: `M28 ${y0} Q27 ${y0 - 7} 30 ${y0 - 9} M32 ${y0} Q32 ${y0 - 9} 34 ${y0 - 11} M36 ${y0} Q38 ${y0 - 6} 40 ${y0 - 7}`, class: "cr-line" }));
  }
  // The cap: a darker skirt and a lighter, slightly inset top face.
  g.append(el("rect", { x: x0, y: y0, width: x1 - x0, height: 56 - y0, rx: 9, class: "cap-side" }));
  g.append(el("rect", { x: x0 + 5, y: y0 + 2, width: x1 - x0 - 10, height: 56 - y0 - 12, rx: 6, class: "cap-top" }));
  if (traits.pattern === "stripes") g.append(el("path", { d: `M${x0 + 1} ${52} L${x1 - 1} ${52}`, class: "cr-stripe" }));
  else if (traits.pattern === "spots") g.append(el("circle", { cx: x0 + 3, cy: 50, r: 1.6, class: "cr-mark" }), el("circle", { cx: x1 - 3, cy: 48, r: 1.6, class: "cr-mark" }));
  if (legend) {
    const t = el("text", { x: x0 + 9, y: y0 + 11, class: "cap-legend" });
    t.textContent = legend;
    g.append(t);
  }
  g.append(el("ellipse", { cx: 25, cy: 57.5, rx: 4.5, ry: 2, class: "cr-foot" }), el("ellipse", { cx: 39, cy: 57.5, rx: 4.5, ry: 2, class: "cr-foot" }));
  if (stage === 0) return svg;
  const eyeY = y0 + 20;
  const xs = traits.eyes === 1 ? [32] : traits.eyes === 2 ? [27, 37] : [24, 32, 40];
  for (const x of xs) {
    if (health < 0.4) g.append(el("path", { d: `M${x - 3} ${eyeY} L${x + 3} ${eyeY}`, class: "cr-line" }));
    else g.append(el("rect", { x: x - 2, y: eyeY - 3, width: 4, height: 6, rx: 1.5, class: "cr-pupil" }));
  }
  const my = eyeY + 7;
  if (traits.mouth === "open") g.append(el("rect", { x: 29.5, y: my - 1, width: 5, height: 4, rx: 1.5, class: "cr-pupil" }));
  else if (traits.mouth === "beak") g.append(el("path", { d: `M29 ${my - 1} L35 ${my - 1} L32 ${my + 3} Z`, class: "cr-beak" }));
  else g.append(el("path", { d: `M28 ${my} L32 ${my + 2.5} L36 ${my}`, class: "cr-line" }));
  if (traits.mouth === "fangs") g.append(el("path", { d: `M29.5 ${my + 1} L30.5 ${my + 4} L31.5 ${my + 1.7} M32.5 ${my + 1.7} L33.5 ${my + 4} L34.5 ${my + 1}`, class: "cr-fang" }));
  if (stage === 3) {
    g.append(el("path", { d: `M22 ${y0 - 2} L22 ${y0 - 12} L27 ${y0 - 7} L32 ${y0 - 14} L37 ${y0 - 7} L42 ${y0 - 12} L42 ${y0 - 2} Z`, class: "cr-crown" }));
    svg.append(el("path", { d: "M6 14 L8 18 L12 20 L8 22 L6 26 L4 22 L0 20 L4 18 Z M57 6 L58.5 9 L61.5 10.5 L58.5 12 L57 15 L55.5 12 L52.5 10.5 L55.5 9 Z", class: "cr-sparkle" }));
  }
  return svg;
}
