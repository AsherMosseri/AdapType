import type { Screen } from "../app";
import { h } from "../dom";
import { applyUpdate, updateReady } from "../pwa";

/** Screens where you're typing: the banner waits until you leave them. */
const TYPING: ReadonlySet<Screen["name"]> = new Set(["practice", "calibration", "daily", "race", "arcade-game", "shortcuts", "passages", "course-round"]);

let banner: HTMLElement | null = null;
let dismissed = false;

/** Shows or hides the "new version ready" banner for the current screen. */
export function syncUpdateBanner(screen: Screen | null): void {
  const show = updateReady() && !dismissed && !!screen && !TYPING.has(screen.name);
  if (!show) {
    banner?.remove();
    banner = null;
    return;
  }
  if (banner) return;
  const reload = h("button", { type: "button", class: "button primary", onclick: () => applyUpdate() }, "Reload");
  banner = h(
    "div",
    { class: "update-banner", role: "status" },
    h("p", null, h("strong", null, "A new version of AdapType is ready. "), "Reload to switch to it; your progress stays."),
    h(
      "div",
      { class: "actions" },
      reload,
      h(
        "button",
        {
          type: "button",
          class: "button",
          onclick: () => {
            dismissed = true;
            syncUpdateBanner(screen);
          },
        },
        "Later",
      ),
    ),
  );
  document.body.append(banner);
}
