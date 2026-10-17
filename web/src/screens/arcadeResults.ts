import type { NemesisChange } from "../../../engine/src";
import { newBadgesPanel } from "../achievements";
import type { App, Screen } from "../app";
import { activeEffect } from "../appearance";
import { celebrate } from "../components/celebrate";
import { nemesisFace } from "../components/nemesisFace";
import { nemesisContentFor } from "../content";
import { h } from "../dom";
import { currentTone } from "../explainText";

export interface GameOverOptions {
  title: string;
  /** 1-based place in the mode's top 10, or null. */
  rank: number | null;
  stats: [string, string][];
  nemesisChange: NemesisChange;
  again: Screen;
  /** A line under the title, such as who won a race. */
  verdict?: string;
  /** Badges this game earned. */
  badges?: string[];
  /** An extra action, such as challenging a friend to this race. */
  extra?: HTMLElement | null;
}

/**
 * The end-of-game panel: a personal-best burst for first place (a static
 * badge with reduced motion), stats, any nemesis news, and play again.
 */
export function gameOverPanel(app: App, o: GameOverOptions): HTMLElement {
  const best = o.rank === 1;
  const again = h("button", { type: "button", class: "button primary", onclick: () => app.go(o.again) }, "Play again");
  const burst = best
    ? h(
        "div",
        { class: "pb-burst", "aria-hidden": "true" },
        Array.from({ length: 12 }, (_, i) => h("span", { style: `--i:${i}` })),
      )
    : null;
  const { defeated, chosen } = o.nemesisChange;
  const panel = h(
    "div",
    { class: `overlay game-over${best ? " best" : ""}`, role: "dialog", "aria-labelledby": "game-over-title" },
    burst,
    h("p", { class: "overlay-title", id: "game-over-title", tabindex: "-1" }, o.title),
    o.verdict ? h("p", { class: "verdict" }, o.verdict) : null,
    best
      ? h("p", { class: "pb-badge", role: "status" }, "New personal best!")
      : o.rank
        ? h("p", { class: "rank", role: "status" }, `Number ${o.rank} in your top 10`)
        : null,
    h(
      "dl",
      { class: "over-stats" },
      o.stats.map(([k, v]) => h("div", null, h("dt", null, k), h("dd", null, v))),
    ),
    defeated
      ? h(
          "div",
          { class: "nemesis-news" },
          nemesisFace(defeated, 48, true),
          h("p", null, nemesisContentFor(currentTone()).defeat.replaceAll("{name}", defeated.name).replaceAll("{key}", defeated.key), " It joins your hall of defeated in Progress."),
        )
      : null,
    chosen
      ? h(
          "div",
          { class: "nemesis-news" },
          nemesisFace(chosen, 48),
          h("p", null, `A new nemesis: ${chosen.name}. Your ${chosen.key} is your weakest key, so it will show up as a boss.`),
        )
      : null,
    newBadgesPanel(app, o.badges ?? []),
    h(
      "div",
      { class: "actions" },
      again,
      o.extra,
      h("button", { type: "button", class: "button", onclick: () => app.go({ name: "arcade" }) }, "Arcade"),
      h("button", { type: "button", class: "button", onclick: () => app.go({ name: "practice" }) }, "Practice"),
    ),
  );
  // A personal best gets the picked celebration too (a new badge already brings one).
  if (best && !o.badges?.length) celebrate(activeEffect());
  requestAnimationFrame(() => again.focus({ preventScroll: true }));
  return panel;
}
