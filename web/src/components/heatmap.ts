import { weakness, type Goal, type ProfileState } from "../../../engine/src";
import { h } from "../dom";
import { QWERTY_ROWS } from "../keyboardLayout";

const LEVELS = [
  { id: "strong", label: "At goal", max: 0.25 },
  { id: "ok", label: "Close", max: 0.75 },
  { id: "weak", label: "Needs work", max: 1.5 },
  { id: "weakest", label: "Weakest", max: Infinity },
] as const;

export function heatLevel(state: ProfileState, letter: string, goal: Goal): string {
  if (!state.unlocked.includes(letter)) return "locked";
  const entry = state.keys[letter];
  if (!entry || entry.n < 3) return "unknown";
  const score = weakness(entry, goal);
  return LEVELS.find((l) => score < l.max)!.id;
}

/** A keyboard colored by how weak each key is, with a legend. */
export function heatmap(state: ProfileState, goal: Goal): HTMLElement {
  const label = (level: string) =>
    LEVELS.find((l) => l.id === level)?.label ?? (level === "locked" ? "Locked" : "Not enough data yet");
  const rows = QWERTY_ROWS.map((row, i) =>
    h(
      "div",
      { class: `heat-row row-${i}` },
      [...row].map((letter) => {
        const level = heatLevel(state, letter, goal);
        return h("div", { class: `heat-key ${level}`, role: "listitem", "aria-label": `${letter}: ${label(level)}` }, letter);
      }),
    ),
  );
  const legend = h(
    "ul",
    { class: "heat-legend" },
    [...LEVELS.map((l) => l.id), "unknown"].map((id) => h("li", null, h("span", { class: `swatch ${id}` }), label(id))),
  );
  return h("figure", { class: "heatmap" }, h("div", { class: "heat-keys", role: "list", "aria-label": "Key strength" }, rows), legend);
}
