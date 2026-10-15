import { KEY_LAYOUTS } from "../../../engine/src";
import type { App, Screen } from "../app";
import { h, icon, ICONS } from "../dom";

export interface TopBarOptions {
  /** Shows a back button that goes here. */
  back?: () => void;
  backLabel?: string;
  /** Hides the settings button (on the settings screen itself). */
  noSettings?: boolean;
  returnTo?: Screen;
}

export function topBar(app: App, options: TopBarOptions = {}): HTMLElement {
  const profile = app.data.settings.activeProfile;
  const left = options.back
    ? h(
        "button",
        { type: "button", class: "icon-button back", onclick: options.back, "aria-label": options.backLabel ?? "Back" },
        icon([...ICONS.back]),
        h("span", null, options.backLabel ?? "Back"),
      )
    : h("span", { class: "wordmark" }, "Adap", h("b", null, "Type"));
  // Non-QWERTY layouts keep their own progress, so the chip names the layout (the icon shows keyboard or touch).
  const kind = profile === "touch" ? "Touch" : "Keyboard";
  const label = app.layout === "qwerty" ? kind : KEY_LAYOUTS[app.layout].name;
  const chip = h(
    "span",
    { class: "chip", title: app.layout === "qwerty" ? (profile === "touch" ? "Touch screen" : "Keyboard") : `${kind}, ${label} layout` },
    icon(profile === "touch" ? [...ICONS.phone] : [...ICONS.keyboard]),
    label,
  );
  const settings = options.noSettings
    ? null
    : h(
        "button",
        {
          type: "button",
          class: "icon-button",
          "aria-label": "Settings",
          onclick: () => app.go({ name: "settings", returnTo: options.returnTo }),
        },
        icon([...ICONS.settings]),
      );
  const progress = options.noSettings
    ? null
    : h(
        "button",
        { type: "button", class: "icon-button", "aria-label": "Progress", onclick: () => app.go({ name: "progress", returnTo: options.returnTo }) },
        icon([...ICONS.progress]),
      );
  const arcade = options.noSettings
    ? null
    : h("button", { type: "button", class: "icon-button", "aria-label": "Arcade", onclick: () => app.go({ name: "arcade" }) }, icon([...ICONS.arcade]));
  return h("header", { class: "top-bar" }, left, h("div", { class: "top-actions" }, chip, arcade, progress, settings));
}
