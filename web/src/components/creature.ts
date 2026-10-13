import type { CreatureStage, CreatureTraits } from "../../../engine/src";

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
  options: { health?: number; size?: number; label?: string } = {},
): SVGSVGElement {
  const size = options.size ?? 64;
  const health = options.health ?? 1;
  const svg = el("svg", {
    viewBox: "0 0 64 64",
    width: size,
    height: size,
    class: `creature stage-${stage ?? "unmet"}${health < 0.4 ? " unwell" : ""}`,
    role: "img",
    "aria-label": options.label ?? "",
  });
  svg.style.setProperty("--hue", String(traits.hue));
  svg.style.setProperty("--sat", `${Math.round(20 + 45 * health)}%`);

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
    else g.append(el("circle", { cx: x, cy: y, r, class: "cr-eye" }), el("circle", { cx: x + 0.8, cy: y + 0.6, r: r * 0.45, class: "cr-pupil" }));
  }

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
