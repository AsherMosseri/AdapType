import type { TapPoint } from "../../../engine/src";
import { h, icon, ICONS } from "../dom";
import { QWERTY_ROWS } from "../keyboardLayout";

export interface TouchKeyboardOptions {
  onChar: (char: string, tap: TapPoint) => void;
  onBackspace: () => void;
  isLocked: (letter: string) => boolean;
}

/**
 * AdapType's own on-screen keyboard: no autocorrect, and it records where
 * each tap lands relative to the key's center.
 */
export function touchKeyboard(options: TouchKeyboardOptions): HTMLElement {
  const popup = h("div", { class: "key-popup", "aria-hidden": "true" });
  let popupTimer = 0;

  const showPopup = (key: HTMLElement, text: string) => {
    const kb = keyboard.getBoundingClientRect();
    const r = key.getBoundingClientRect();
    popup.textContent = text;
    popup.style.left = `${r.left - kb.left + r.width / 2}px`;
    popup.style.top = `${r.top - kb.top}px`;
    popup.classList.add("show");
    window.clearTimeout(popupTimer);
    popupTimer = window.setTimeout(() => popup.classList.remove("show"), 140);
  };

  const press = (event: PointerEvent, key: HTMLElement) => {
    event.preventDefault();
    const r = key.getBoundingClientRect();
    const tap: TapPoint = {
      dx: round3((event.clientX - (r.left + r.width / 2)) / r.width),
      dy: round3((event.clientY - (r.top + r.height / 2)) / r.height),
    };
    haptic();
    const value = key.dataset.key!;
    if (value === "backspace") {
      options.onBackspace();
    } else {
      if (value !== " ") showPopup(key, value);
      options.onChar(value, tap);
    }
  };

  const letterKey = (letter: string) =>
    h(
      "button",
      {
        type: "button",
        class: options.isLocked(letter) ? "tkey locked" : "tkey",
        dataset: { key: letter },
        "aria-label": letter,
        tabindex: "-1",
      },
      letter,
    );

  const rows = QWERTY_ROWS.map((row, i) => {
    const keys: HTMLElement[] = [...row].map(letterKey);
    if (i === 2) {
      keys.push(
        h(
          "button",
          { type: "button", class: "tkey wide", dataset: { key: "backspace" }, "aria-label": "Backspace", tabindex: "-1" },
          icon([...ICONS.backspace]),
        ),
      );
    }
    return h("div", { class: `tkey-row trow-${i}` }, keys);
  });
  rows.push(
    h(
      "div",
      { class: "tkey-row trow-space" },
      h("button", { type: "button", class: "tkey space", dataset: { key: " " }, "aria-label": "Space", tabindex: "-1" }, "space"),
    ),
  );

  const keyboard = h("div", { class: "touch-keyboard", role: "group", "aria-label": "On-screen keyboard" }, rows, popup);
  keyboard.addEventListener("pointerdown", (event) => {
    const key = (event.target as HTMLElement).closest<HTMLElement>(".tkey");
    if (key) press(event, key);
  });
  // Stop long-press menus and double-tap zoom on the keys.
  keyboard.addEventListener("contextmenu", (e) => e.preventDefault());
  return keyboard;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** A short vibration where the browser allows it (Android; not iPhone Safari). */
function haptic(): void {
  try {
    navigator.vibrate?.(8);
  } catch {
    // Not supported.
  }
}
