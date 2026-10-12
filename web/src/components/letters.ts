import { focusLetter, UNLOCK_ORDERS, type ProfileState } from "../../../engine/src";
import { h } from "../dom";

/** All 26 letters in unlock order, showing which are mastered, learning, the focus, or locked. */
export function letterStrip(state: ProfileState): HTMLElement {
  const focus = focusLetter(state);
  const order = UNLOCK_ORDERS[state.unlockOrder];
  const items = [...order].map((letter) => {
    const unlocked = state.unlocked.includes(letter);
    const mastered = state.mastered.includes(letter);
    const status = !unlocked ? "locked" : letter === focus ? "focus" : mastered ? "mastered" : "learning";
    const label = { locked: "locked", focus: "new, focus", mastered: "mastered", learning: "learning" }[status];
    return h("li", { class: `letter ${status}`, title: `${letter}: ${label}` }, h("span", { "aria-hidden": "true" }, letter), h("span", { class: "sr-only" }, `${letter}, ${label}`));
  });
  const unlockedCount = state.unlocked.length;
  return h(
    "div",
    { class: "letters" },
    h("ol", { class: "letter-strip", "aria-label": `Letters: ${unlockedCount} of 26 unlocked` }, items),
  );
}
