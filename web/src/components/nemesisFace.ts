import { hashString, type Nemesis } from "../../../engine/src";

const NS = "http://www.w3.org/2000/svg";

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * A villain face drawn from the nemesis's name: the same name always gets the
 * same brows, eyes, mouth and headgear. Colors come from theme tokens.
 */
export function nemesisFace(nemesis: Pick<Nemesis, "key" | "name">, size = 72, defeated = false): SVGSVGElement {
  const h = hashString(nemesis.name);
  const pick = (shift: number, n: number) => ((h >>> shift) & 0xff) % n;
  const svg = el("svg", { viewBox: "0 0 64 64", width: size, height: size, class: defeated ? "nemesis-face defeated" : "nemesis-face", role: "img", "aria-label": `${nemesis.name}${defeated ? ", defeated" : ""}` });

  // Headgear behind the head: none, horns, a crown or a pointed hat.
  const hat = pick(0, 4);
  if (hat === 1) {
    svg.append(el("path", { d: "M14 18 L10 4 L22 13 Z M50 18 L54 4 L42 13 Z", class: "nf-accent" }));
  } else if (hat === 2) {
    svg.append(el("path", { d: "M18 14 L18 4 L25 9 L32 2 L39 9 L46 4 L46 14 Z", class: "nf-accent" }));
  } else if (hat === 3) {
    svg.append(el("path", { d: "M20 14 L32 1 L44 14 Z", class: "nf-accent" }));
  }
  svg.append(el("rect", { x: 8, y: 10, width: 48, height: 48, rx: pick(4, 3) === 0 ? 24 : 14, class: "nf-head" }));

  // Brows: angry slant of varying steepness.
  const slant = 3 + pick(8, 5);
  svg.append(
    el("path", { d: `M17 ${22 - slant / 2} L28 ${22 + slant / 2}`, class: "nf-line" }),
    el("path", { d: `M47 ${22 - slant / 2} L36 ${22 + slant / 2}`, class: "nf-line" }),
  );

  // Eyes: dots, narrow slits, or one squint.
  const eyes = defeated ? 3 : pick(12, 3);
  if (eyes === 0) {
    svg.append(el("circle", { cx: 23, cy: 29, r: 3, class: "nf-fill" }), el("circle", { cx: 41, cy: 29, r: 3, class: "nf-fill" }));
  } else if (eyes === 1) {
    svg.append(el("path", { d: "M19 29 L27 29", class: "nf-line" }), el("path", { d: "M37 29 L45 29", class: "nf-line" }));
  } else if (eyes === 2) {
    svg.append(el("circle", { cx: 23, cy: 29, r: 3, class: "nf-fill" }), el("path", { d: "M37 29 L45 29", class: "nf-line" }));
  } else {
    // Defeated: crossed-out eyes.
    svg.append(
      el("path", { d: "M20 26 L26 32 M26 26 L20 32", class: "nf-line" }),
      el("path", { d: "M38 26 L44 32 M44 26 L38 32", class: "nf-line" }),
    );
  }

  // Mouth: smirk either way, a grin, or a zigzag.
  const mouth = defeated ? 4 : pick(16, 4);
  const mouths = ["M22 44 Q32 49 42 40", "M22 40 Q32 49 42 44", "M21 42 Q32 52 43 42", "M21 44 L26 41 L31 44 L36 41 L41 44", "M23 46 Q32 40 41 46"];
  svg.append(el("path", { d: mouths[mouth], class: "nf-line" }));

  // A mustache sometimes.
  if (!defeated && pick(20, 3) === 0) svg.append(el("path", { d: "M24 38 Q28 35 32 38 Q36 35 40 38", class: "nf-line" }));

  // The letter it stands for, on the chin.
  const letter = el("text", { x: 32, y: 56, "text-anchor": "middle", class: "nf-letter" });
  letter.textContent = nemesis.key.toUpperCase();
  svg.append(letter);
  return svg;
}
