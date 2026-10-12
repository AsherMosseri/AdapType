import type { TapPoint } from "../../../engine/src";
import { touchAlternates, type TouchLayerName, type TouchLayout } from "../content";
import { h, icon, ICONS } from "../dom";
import { SYMBOL_KEY_LABEL } from "../platform";

export interface TouchKeyboardOptions {
  layout: TouchLayout;
  layoutName: "ios" | "android";
  /** layer: true when the character was typed on the number or symbol layer. t: when the finger landed. */
  onChar: (char: string, tap: TapPoint, layer: boolean, t: number) => void;
  onBackspace: () => void;
  isLocked: (letter: string) => boolean;
}

const LONG_PRESS_MS = 380;

/**
 * AdapType's own on-screen keyboard: no autocorrect, records where each tap
 * lands, has number and symbol layers that match the device, a one-shot
 * Shift, and long-press menus for accents and extra characters.
 */
export function touchKeyboard(options: TouchKeyboardOptions): HTMLElement {
  let layer: TouchLayerName = "letters";
  let shift = false;
  let longTimer = 0;
  let pending: { key: HTMLElement; event: PointerEvent } | null = null;

  const popup = h("div", { class: "key-popup", "aria-hidden": "true" });
  const altMenu = h("div", { class: "alt-menu", role: "group", "aria-label": "Alternate characters" });
  altMenu.hidden = true;
  const rowsEl = h("div", { class: "tkey-rows" });
  const keyboard = h("div", { class: "touch-keyboard", role: "group", "aria-label": "On-screen keyboard" }, rowsEl, popup, altMenu);
  let popupTimer = 0;

  const label = (value: string) => (shift && value.length === 1 ? value.toUpperCase() : value);

  const render = () => {
    const rows = options.layout[layer].map((row, i) => {
      const keys = row.map((value) => keyButton(value));
      return h("div", { class: `tkey-row trow-${i}` }, keys);
    });
    rowsEl.replaceChildren(...rows);
    keyboard.dataset.layer = layer;
  };

  const keyButton = (value: string): HTMLElement => {
    const special: Record<string, () => HTMLElement> = {
      shift: () => h("button", { type: "button", class: `tkey wide mod${shift ? " on" : ""}`, dataset: { key: "shift" }, "aria-label": "Shift", "aria-pressed": String(shift), tabindex: "-1" }, "⇧"),
      backspace: () => h("button", { type: "button", class: "tkey wide mod", dataset: { key: "backspace" }, "aria-label": "Backspace", tabindex: "-1" }, icon([...ICONS.backspace])),
      "123": () => h("button", { type: "button", class: "tkey wide mod", dataset: { key: "123" }, "aria-label": "Numbers", tabindex: "-1" }, "123"),
      abc: () => h("button", { type: "button", class: "tkey wide mod", dataset: { key: "abc" }, "aria-label": "Letters", tabindex: "-1" }, "ABC"),
      sym: () => h("button", { type: "button", class: "tkey wide mod", dataset: { key: "sym" }, "aria-label": "More symbols", tabindex: "-1" }, SYMBOL_KEY_LABEL[options.layoutName]),
      space: () => h("button", { type: "button", class: "tkey space", dataset: { key: " " }, "aria-label": "Space", tabindex: "-1" }, "space"),
    };
    if (special[value]) return special[value]();
    const locked = layer === "letters" && options.isLocked(value);
    const hasAlts = !!touchAlternates[value];
    return h(
      "button",
      { type: "button", class: `tkey${locked ? " locked" : ""}${hasAlts ? " has-alts" : ""}`, dataset: { key: value }, "aria-label": label(value), tabindex: "-1" },
      label(value),
    );
  };

  const tapPoint = (event: PointerEvent, key: HTMLElement): TapPoint => {
    const r = key.getBoundingClientRect();
    return {
      dx: round3((event.clientX - (r.left + r.width / 2)) / r.width),
      dy: round3((event.clientY - (r.top + r.height / 2)) / r.height),
    };
  };

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

  const type = (char: string, tap: TapPoint, key: HTMLElement, t: number) => {
    const out = shift ? char.toUpperCase() : char;
    if (char !== " ") showPopup(key, out);
    options.onChar(out, tap, layer !== "letters", t);
    if (shift) {
      shift = false;
      render();
    }
    // Like iOS and Gboard, a space takes you back to letters.
    if (char === " " && layer !== "letters") {
      layer = "letters";
      render();
    }
  };

  function flushPending(): void {
    window.clearTimeout(longTimer);
    if (pending) {
      const { key, event } = pending;
      pending = null;
      type(key.dataset.key!, tapPoint(event, key), key, event.timeStamp);
    }
  }

  const closeAlts = () => {
    altMenu.hidden = true;
    altMenu.replaceChildren();
  };

  const openAlts = (key: HTMLElement) => {
    const base = key.dataset.key!;
    const alts = [...touchAlternates[base]];
    altMenu.replaceChildren(
      ...alts.map((a) =>
        h("button", { type: "button", class: "alt-key", dataset: { alt: a }, tabindex: "-1" }, shift ? a.toUpperCase() : a),
      ),
    );
    altMenu.hidden = false;
    const kb = keyboard.getBoundingClientRect();
    const r = key.getBoundingClientRect();
    const width = altMenu.offsetWidth;
    const left = Math.min(Math.max(4, r.left - kb.left + r.width / 2 - width / 2), kb.width - width - 4);
    altMenu.style.left = `${left}px`;
    altMenu.style.top = `${r.top - kb.top - altMenu.offsetHeight - 6}px`;
  };

  keyboard.addEventListener("pointerdown", (event) => {
    const alt = (event.target as HTMLElement).closest<HTMLElement>(".alt-key");
    if (alt) {
      event.preventDefault();
      haptic();
      type(alt.dataset.alt!, tapPoint(event, alt), alt, event.timeStamp);
      closeAlts();
      return;
    }
    if (!altMenu.hidden) closeAlts();
    // A second finger landed before the first lifted: type the first key now so order is kept.
    flushPending();
    const key = (event.target as HTMLElement).closest<HTMLElement>(".tkey");
    if (!key) return;
    event.preventDefault();
    haptic();
    const value = key.dataset.key!;
    if (value === "backspace") return options.onBackspace();
    if (value === "shift") {
      shift = !shift;
      return render();
    }
    if (value === "123" || value === "abc" || value === "sym") {
      layer = value === "123" ? "numbers" : value === "abc" ? "letters" : "symbols";
      return render();
    }
    if (touchAlternates[value]) {
      // Wait: a quick tap types the key, a long press opens the menu.
      pending = { key, event };
      longTimer = window.setTimeout(() => {
        if (pending) openAlts(pending.key);
        pending = null;
      }, LONG_PRESS_MS);
      return;
    }
    type(value, tapPoint(event, key), key, event.timeStamp);
  });

  keyboard.addEventListener("pointerup", flushPending);
  keyboard.addEventListener("pointercancel", flushPending);
  // Stop the browser's own long-press menus and double-tap zoom.
  keyboard.addEventListener("contextmenu", (e) => e.preventDefault());

  render();
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
