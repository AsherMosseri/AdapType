import { activeTheme, reduceMotion } from "../appearance";
import { h } from "../dom";

/**
 * A short burst over the page for a new badge or a personal best: confetti,
 * fireworks, pixel sparks or bubbles. Nothing happens with "none" or when
 * motion is reduced. The burst ignores the pointer and removes itself.
 */
export function celebrate(effect: string): void {
  if (effect === "none" || reduceMotion()) return;
  const count = effect === "fireworks" ? 36 : effect === "bubbles" ? 18 : 40;
  const layer = h("div", { class: `celebration fx-${effect} fx-theme-${activeTheme()}`, "aria-hidden": "true" });
  for (let i = 0; i < count; i++) {
    const p = h("span", { class: "fx-bit" });
    // Spread is decided here so each bit gets its own path; the look is CSS.
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 90 + Math.random() * 160;
    p.style.setProperty("--x", `${(Math.random() * 100).toFixed(1)}vw`);
    p.style.setProperty("--dx", `${(Math.cos(angle) * dist).toFixed(0)}px`);
    p.style.setProperty("--dy", `${(Math.sin(angle) * dist).toFixed(0)}px`);
    p.style.setProperty("--delay", `${(Math.random() * 0.35).toFixed(2)}s`);
    p.style.setProperty("--hue", String(Math.floor(Math.random() * 360)));
    p.style.setProperty("--spin", `${Math.floor(Math.random() * 720 - 360)}deg`);
    layer.append(p);
  }
  document.body.append(layer);
  window.setTimeout(() => layer.remove(), 2600);
}
