import type { Goal } from "../../../engine/src";
import { h } from "../dom";

const ACCURACY_CHOICES = [0.9, 0.95, 0.97, 0.99];
const MIN_WPM = 10;
const MAX_WPM = 200;
const STEP = 5;

/** A WPM stepper plus accuracy choices. Calls onChange with each new goal. */
export function goalControls(initial: Goal, onChange: (goal: Goal) => void, idPrefix = "goal"): HTMLElement {
  const goal = { ...initial };
  const value = h("output", { class: "stepper-value", id: `${idPrefix}-wpm`, "aria-live": "polite" }, String(goal.wpm));
  const setWpm = (wpm: number) => {
    goal.wpm = Math.min(MAX_WPM, Math.max(MIN_WPM, wpm));
    value.textContent = String(goal.wpm);
    minus.disabled = goal.wpm <= MIN_WPM;
    plus.disabled = goal.wpm >= MAX_WPM;
    onChange({ ...goal });
  };
  const minus = h("button", { type: "button", class: "step", "aria-label": "5 WPM slower", onclick: () => setWpm(goal.wpm - STEP) }, "−");
  const plus = h("button", { type: "button", class: "step", "aria-label": "5 WPM faster", onclick: () => setWpm(goal.wpm + STEP) }, "+");

  const accuracy = h(
    "div",
    { class: "segmented", role: "radiogroup", "aria-label": "Accuracy target" },
    ACCURACY_CHOICES.map((a) => {
      const id = `${idPrefix}-acc-${Math.round(a * 100)}`;
      const input = h("input", { type: "radio", name: `${idPrefix}-accuracy`, id, value: String(a), checked: Math.abs(goal.accuracy - a) < 1e-9 });
      input.addEventListener("change", () => {
        goal.accuracy = a;
        onChange({ ...goal });
      });
      return h("label", { for: id }, input, h("span", null, `${Math.round(a * 100)}%`));
    }),
  );

  return h(
    "div",
    { class: "goal-controls" },
    h(
      "div",
      { class: "field" },
      h("span", { class: "field-label", id: `${idPrefix}-wpm-label` }, "Speed goal"),
      h("div", { class: "stepper", role: "group", "aria-labelledby": `${idPrefix}-wpm-label` }, minus, h("span", { class: "stepper-display" }, value, h("small", null, "WPM")), plus),
    ),
    h("div", { class: "field" }, h("span", { class: "field-label" }, "Accuracy target"), accuracy),
  );
}
