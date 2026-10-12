import type { TypingEvent } from "../../engine/src";
import { h } from "./dom";

export interface PhysicalInputOptions {
  onEvent: (event: TypingEvent) => void;
  onEscape: () => void;
  onCapsLock: (on: boolean) => void;
}

export interface PhysicalInput {
  /** A hidden text field that receives composed characters (dead keys, Alt codes, input methods). */
  el: HTMLTextAreaElement;
  focus: () => void;
  dispose: () => void;
}

/**
 * Keyboard input for practice. Ordinary keys (including Option and AltGr
 * characters) are read from keydown for precise timing. Characters the
 * system composes, such as dead-key accents (⌥e then e) and Windows Alt
 * codes, arrive through a hidden text field instead.
 */
export function attachPhysicalInput(options: PhysicalInputOptions): PhysicalInput {
  const el = h("textarea", {
    class: "capture-input",
    "aria-label": "Type here",
    autocomplete: "off",
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: "false",
    rows: "1",
  });
  const shiftDown = { left: false, right: false };

  const shiftSide = (e: KeyboardEvent): "left" | "right" | undefined => {
    if (!e.shiftKey) return undefined;
    if (shiftDown.left && !shiftDown.right) return "left";
    if (shiftDown.right && !shiftDown.left) return "right";
    return undefined;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "ShiftLeft") shiftDown.left = true;
    if (e.code === "ShiftRight") shiftDown.right = true;
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape") {
      e.preventDefault();
      options.onEscape();
      return;
    }
    // Cmd shortcuts and Ctrl shortcuts aren't typing. Ctrl+Alt is AltGr on Windows, which types characters.
    if (e.metaKey || (e.ctrlKey && !e.altKey)) return;
    const target = e.target as HTMLElement | null;
    if (target !== el && target?.closest?.("button, a, input, textarea, select") && (e.key === "Enter" || e.key === " ")) return;
    if (typeof e.getModifierState === "function") options.onCapsLock(e.getModifierState("CapsLock"));
    const t = e.timeStamp > 0 ? e.timeStamp : performance.now();
    if (e.key === "Backspace") {
      e.preventDefault();
      options.onEvent({ kind: "backspace", t });
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      if (e.key === "Enter") e.preventDefault();
      return;
    }
    // Dead keys and Alt codes compose in the hidden field; let them through.
    if (e.key === "Dead" || (e.altKey && !e.ctrlKey && e.code.startsWith("Numpad"))) return;
    if ([...e.key].length === 1) {
      e.preventDefault();
      options.onEvent({ kind: "char", char: e.key.normalize("NFC"), t, shift: shiftSide(e) });
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "ShiftLeft") shiftDown.left = false;
    if (e.code === "ShiftRight") shiftDown.right = false;
  };

  const flush = () => {
    const text = el.value.normalize("NFC");
    el.value = "";
    const t = performance.now();
    for (const char of text) {
      if (char === "\n" || char === "\r") continue;
      options.onEvent({ kind: "char", char, t });
    }
  };
  const onInput = (e: Event) => {
    if ((e as InputEvent).isComposing) return;
    flush();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  el.addEventListener("input", onInput);
  el.addEventListener("compositionend", flush);
  const blur = () => {
    shiftDown.left = false;
    shiftDown.right = false;
  };
  window.addEventListener("blur", blur);

  return {
    el,
    focus: () => el.focus({ preventScroll: true }),
    dispose: () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", blur);
    },
  };
}
