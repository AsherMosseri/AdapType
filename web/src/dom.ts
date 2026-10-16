type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

/**
 * Creates an element. Props starting with "on" become event listeners,
 * "class" sets className, "dataset" sets data attributes, and everything else
 * is set as an attribute (true sets an empty attribute; false or null skips).
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key.startsWith("on") && typeof value === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key === "class") {
        el.className = String(value);
      } else if (key === "dataset") {
        Object.assign(el.dataset, value as Record<string, string>);
      } else if (key === "style" && typeof value === "object") {
        Object.assign(el.style, value);
      } else if (value === true) {
        el.setAttribute(key, "");
      } else {
        el.setAttribute(key, String(value));
      }
    }
  }
  append(el, children);
  return el;
}

function append(el: Element, children: (Child | Child[])[]): void {
  for (const child of children) {
    if (Array.isArray(child)) append(el, child);
    else if (child === null || child === undefined || child === false) continue;
    else el.append(child instanceof Node ? child : String(child));
  }
}

/** An inline SVG icon from a path list (24x24 viewBox, stroked). */
export function icon(paths: string[], label?: string): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  if (label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }
  for (const d of paths) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

export const ICONS = {
  settings: [
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  ],
  back: ["M15 18l-6-6 6-6"],
  backspace: ["M21 5H8l-6 7 6 7h13a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z", "M17 9l-6 6", "M11 9l6 6"],
  keyboard: ["M3 6h18v12H3z", "M7 10h.01M11 10h.01M15 10h.01M7 14h10"],
  phone: ["M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z", "M11 18h2"],
  progress: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20H2"],
  arcade: ["M6 9h12a4 4 0 0 1 4 4v1a3 3 0 0 1-5.4 1.8L15 14H9l-1.6 1.8A3 3 0 0 1 2 14v-1a4 4 0 0 1 4-4z", "M7 11v3M5.5 12.5h3", "M16 12h.01M18 13.5h.01"],
  menu: ["M4 6h16", "M4 12h16", "M4 18h16"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  calendar: ["M4 5h16v15H4z", "M4 10h16", "M8 3v4", "M16 3v4"],
  code: ["M8 6l-6 6 6 6", "M16 6l6 6-6 6"],
  quote: ["M5 7h5v5c0 3-2 5-4.5 6", "M14 7h5v5c0 3-2 5-4.5 6"],
  command: ["M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"],
  creature: ["M12 3c5 0 8 4 8 9s-3 9-8 9-8-4-8-9 3-9 8-9z", "M9 10h.01", "M15 10h.01", "M9.5 15c1.5 1 3.5 1 5 0"],
  replay: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M10 8.5v7l6-3.5z"],
  card: ["M3 5h18v14H3z", "M7 9h4", "M7 13h10", "M7 16h6"],
  info: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 11v5", "M12 8h.01"],
  hash: ["M4 9h16", "M4 15h16", "M10 3L8 21", "M16 3l-2 18"],
  trophy: ["M8 21h8", "M12 17v4", "M7 4h10v5a5 5 0 0 1-10 0z", "M17 5h3v2a3 3 0 0 1-3 3", "M7 5H4v2a3 3 0 0 0 3 3"],
} as const;

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
