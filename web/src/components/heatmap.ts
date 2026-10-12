import {
  focusLetter,
  isOn,
  keyDetail,
  MODIFIER_IDS,
  modifierGoal,
  modKey,
  weakness,
  type Goal,
  type ModifierSettings,
  type ProfileState,
  type StatEntry,
} from "../../../engine/src";
import { formatPercent, h } from "../dom";
import { MODIFIER_GLYPHS, MODIFIER_NAMES, reasonText } from "../explainText";
import { QWERTY_ROWS } from "../keyboardLayout";

const LEVELS = [
  { id: "strong", label: "At goal", max: 0.25 },
  { id: "ok", label: "Close", max: 0.75 },
  { id: "weak", label: "Needs work", max: 1.5 },
  { id: "weakest", label: "Weakest", max: Infinity },
] as const;

function levelFor(entry: StatEntry | undefined, goal: Goal): string {
  if (!entry || entry.n < 3) return "unknown";
  const score = weakness(entry, goal);
  return LEVELS.find((l) => score < l.max)!.id;
}

export function heatLevel(state: ProfileState, letter: string, goal: Goal): string {
  if (!state.unlocked.includes(letter)) return "locked";
  return levelFor(state.keys[letter], goal);
}

const label = (level: string) =>
  LEVELS.find((l) => l.id === level)?.label ?? (level === "locked" ? "Locked" : "Not enough data yet");

/** A keyboard colored by how weak each key is, with a legend. Tap a key for its details. */
export function heatmap(state: ProfileState, goal: Goal, modifiers?: ModifierSettings): HTMLElement {
  const detail = h("div", { class: "key-detail", "aria-live": "polite" });
  detail.hidden = true;
  let selected: HTMLElement | null = null;

  const select = (button: HTMLElement, render: () => Node[]) => {
    selected?.classList.remove("selected");
    selected?.setAttribute("aria-pressed", "false");
    if (selected === button) {
      selected = null;
      detail.hidden = true;
      return;
    }
    selected = button;
    button.classList.add("selected");
    button.setAttribute("aria-pressed", "true");
    detail.replaceChildren(...render());
    detail.hidden = false;
  };

  const describe = (title: string, entry: StatEntry | undefined, g: Goal, isNew: boolean): Node[] => {
    const d = keyDetail(entry, g, isNew);
    const facts =
      d.samples === 0
        ? "No presses yet."
        : `${d.samples} presses · ${d.avgMs === null ? "no timing yet" : `${Math.round(d.avgMs)} ms each`} (goal ${Math.round(d.goalMs)} ms) · ${formatPercent(d.accuracy)} accurate`;
    return [h("p", { class: "detail-title" }, title), h("p", null, facts), h("p", { class: "detail-why" }, reasonText(d.reasons))];
  };

  const focus = focusLetter(state);
  const rows = QWERTY_ROWS.map((row, i) =>
    h(
      "div",
      { class: `heat-row row-${i}` },
      [...row].map((letter) => {
        const level = heatLevel(state, letter, goal);
        const button = h(
          "button",
          { type: "button", class: `heat-key ${level}`, "aria-pressed": "false", "aria-label": `${letter}: ${label(level)}. Show details` },
          letter,
        );
        button.addEventListener("click", () =>
          select(button, () =>
            level === "locked"
              ? [h("p", { class: "detail-title" }, `${letter}`), h("p", null, "Locked. It unlocks once your current letters reach your goal.")]
              : describe(letter, state.keys[letter], goal, letter === focus),
          ),
        );
        return button;
      }),
    ),
  );

  const modGoal = modifierGoal(goal);
  const modButtons = modifiers
    ? MODIFIER_IDS.filter((id) => isOn(id, state, modifiers) || state.keys[modKey(id)]).map((id) => {
        const entry = state.keys[modKey(id)];
        const level = levelFor(entry, modGoal);
        const button = h(
          "button",
          { type: "button", class: `heat-key mod ${level}`, "aria-pressed": "false", "aria-label": `${MODIFIER_NAMES[id]}: ${label(level)}. Show details` },
          MODIFIER_GLYPHS[id],
        );
        button.addEventListener("click", () => select(button, () => describe(MODIFIER_NAMES[id], entry, modGoal, false)));
        return button;
      })
    : [];

  const legend = h(
    "ul",
    { class: "heat-legend" },
    [...LEVELS.map((l) => l.id), "unknown"].map((id) => h("li", null, h("span", { class: `swatch ${id}` }), label(id))),
  );
  return h(
    "figure",
    { class: "heatmap" },
    h("div", { class: "heat-keys", role: "group", "aria-label": "Key strength" }, rows, modButtons.length ? h("div", { class: "heat-row heat-mods" }, modButtons) : null),
    detail,
    legend,
    h("figcaption", { class: "fine" }, modButtons.length ? "Tap a key or modifier to see why it's targeted. Modifiers allow 1.5 times the goal time." : "Tap a key to see why it's targeted."),
  );
}
