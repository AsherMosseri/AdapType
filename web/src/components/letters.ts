import { focusLetter, isOn, MODIFIER_STAGES, UNLOCK_ORDERS, type ModifierSettings, type ProfileState, type UnlockableId } from "../../../engine/src";
import { h } from "../dom";
import { MODIFIER_GLYPHS, MODIFIER_NAMES } from "../explainText";

/**
 * All 26 letters in unlock order, showing which are mastered, learning, the
 * focus, or locked. Once modifiers come into play, they follow as chips.
 */
export function letterStrip(state: ProfileState, modifiers?: ModifierSettings): HTMLElement {
  const focus = focusLetter(state);
  const order = UNLOCK_ORDERS[state.unlockOrder];
  const items = [...order].map((letter) => {
    const unlocked = state.unlocked.includes(letter);
    const mastered = state.mastered.includes(letter);
    const status = !unlocked ? "locked" : letter === focus ? "focus" : mastered ? "mastered" : "learning";
    const label = { locked: "locked", focus: "new, focus", mastered: "mastered", learning: "learning" }[status];
    return h("li", { class: `letter ${status}`, title: `${letter}: ${label}` }, h("span", { "aria-hidden": "true" }, letter), h("span", { class: "sr-only" }, `${letter}, ${label}`));
  });

  const ids = MODIFIER_STAGES.flat() as UnlockableId[];
  const lettersDone = state.unlocked.length === 26 && state.mastered.length === 26;
  const anyMod = modifiers && ids.some((id) => isOn(id, state, modifiers));
  const mods =
    modifiers && (lettersDone || anyMod)
      ? ids.map((id) => {
          const on = isOn(id, state, modifiers);
          const unlocked = state.modsUnlocked.includes(id);
          const mastered = id !== "shortcuts" && state.modsMastered.includes(id as never);
          const status = !on ? "locked" : mastered ? "mastered" : unlocked ? "learning" : "early";
          const label = { locked: modifiers.modes[id] === "off" ? "off" : "locked", mastered: "mastered", learning: "learning", early: "on early" }[status];
          return h(
            "li",
            { class: `letter mod ${status}`, title: `${MODIFIER_NAMES[id]}: ${label}` },
            h("span", { "aria-hidden": "true" }, MODIFIER_GLYPHS[id]),
            h("span", { class: "sr-only" }, `${MODIFIER_NAMES[id]}, ${label}`),
          );
        })
      : [];

  return h(
    "div",
    { class: "letters" },
    h(
      "ol",
      { class: "letter-strip", "aria-label": `Letters: ${state.unlocked.length} of 26 unlocked` },
      items,
      mods.length ? h("li", { class: "strip-gap", "aria-hidden": "true" }) : null,
      mods,
    ),
  );
}
