import { DEFAULT_GOAL } from "../../../engine/src";
import type { App, ScreenView } from "../app";
import { topBar } from "../components/topBar";
import { formatPercent, h } from "../dom";

/** End of a session: how it went, then the session closes so the next visit starts fresh with a warm-up. */
export function sessionScreen(app: App): ScreenView {
  const state = app.profile;
  const session = state.session;
  const goal = state.goal ?? DEFAULT_GOAL;
  const history = session?.history ?? [];
  const avg = (key: "wpm" | "accuracy", list = history) => (list.length ? list.reduce((s, r) => s + r[key], 0) / list.length : 0);
  const minutes = session ? Math.max(1, Math.round((session.lastAt - session.startedAt) / 60000)) : 0;
  const best = history.reduce((m, r) => Math.max(m, r.wpm), 0);
  const firstHalf = history.slice(0, Math.ceil(history.length / 2));
  const secondHalf = history.slice(Math.ceil(history.length / 2));
  const reviewCount = Object.keys(state.reviews).length;

  const trend =
    history.length >= 4
      ? avg("wpm", secondHalf) < avg("wpm", firstHalf) * 0.92
        ? "You slowed down toward the end. That's normal; next time, a break around there should help."
        : avg("wpm", secondHalf) > avg("wpm", firstHalf) * 1.05
          ? "You got faster as the session went on."
          : "You kept a steady pace all session."
      : null;

  // Close the session: the next practice starts a new one.
  if (session) {
    state.session = null;
    app.persist();
  }

  const main = h(
    "main",
    { class: "session-summary" },
    h("h1", { tabindex: "-1" }, "Session summary"),
    history.length === 0
      ? h("p", { class: "lead" }, "No rounds this session.")
      : h(
          "div",
          { class: "summary-grid" },
          stat("Rounds", String(history.length)),
          stat("Time", `${minutes} min`),
          stat("Average speed", `${Math.round(avg("wpm"))} WPM`),
          stat("Best round", `${Math.round(best)} WPM`),
          stat("Accuracy", formatPercent(avg("accuracy"))),
          stat("Goal", `${goal.wpm} WPM`),
        ),
    trend ? h("p", { class: "lead" }, trend) : null,
    reviewCount > 0 ? h("p", null, `${reviewCount} ${reviewCount === 1 ? "item is" : "items are"} on your review schedule. They come back next time.`) : null,
    h(
      "div",
      { class: "actions wrap" },
      h("button", { type: "button", class: "button primary", onclick: () => app.go({ name: "progress" }) }, "See progress"),
      h("button", { type: "button", class: "button", onclick: () => app.go({ name: "practice" }) }, "Start a new session"),
    ),
  );
  return { el: h("div", { class: "screen" }, topBar(app, { back: () => app.go({ name: "practice" }), backLabel: "Practice" }), main) };
}

function stat(label: string, value: string): HTMLElement {
  return h("div", { class: "summary-stat" }, h("p", { class: "big-label" }, label), h("p", { class: "summary-value" }, value));
}
