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
  const chip = h(
    "span",
    { class: "chip", title: profile === "touch" ? "Touch screen" : "Keyboard" },
    icon(profile === "touch" ? [...ICONS.phone] : [...ICONS.keyboard]),
    profile === "touch" ? "Touch" : "Keyboard",
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
  return h("header", { class: "top-bar" }, left, h("div", { class: "top-actions" }, chip, settings));
}
