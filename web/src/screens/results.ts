import {
  DEFAULT_GOAL,
  focusLetter,
  masteryProgress,
  nextLetter,
  recentAverage,
} from "../../../engine/src";
import type { App, Screen, ScreenView } from "../app";
import { heatmap } from "../components/heatmap";
import { topBar } from "../components/topBar";
import { formatPercent, h } from "../dom";

export function resultsScreen(app: App, screen: Screen): ScreenView {
  if (screen.name !== "results") throw new Error("results screen needs an outcome");
  const { outcome, metrics } = screen;
  const state = app.profile;
  const goal = state.goal ?? DEFAULT_GOAL;
  const before = recentAverage(state, 1);
  const now = recentAverage(state);

  const delta = (value: number, base: number | undefined, unit: "wpm" | "pct") => {
    if (base === undefined) return h("p", { class: "delta" }, "Your first round");
    const diff = unit === "wpm" ? Math.round(value - base) : Math.round((value - base) * 100);
    const text = diff === 0 ? "Same as" : `${diff > 0 ? "+" : "−"}${Math.abs(diff)}${unit === "pct" ? " pts" : ""} vs`;
    return h("p", { class: `delta ${diff > 0 ? "up" : diff < 0 ? "down" : ""}` }, `${text} your recent average`);
  };

  const headline = h(
    "section",
    { class: "headline", "aria-label": "This round" },
    h(
      "div",
      { class: "big-stat" },
      h("p", { class: "big-label" }, "Speed"),
      h("p", { class: "big-value" }, String(Math.round(metrics.wpm)), h("small", null, " WPM")),
      delta(metrics.wpm, before?.wpm, "wpm"),
    ),
    h(
      "div",
      { class: "big-stat" },
      h("p", { class: "big-label" }, "Accuracy"),
      h("p", { class: "big-value" }, formatPercent(metrics.accuracy)),
      delta(metrics.accuracy, before?.accuracy, "pct"),
    ),
  );

  // What changed: unlocks, mastery, calibration.
  const events: HTMLElement[] = [];
  if (outcome.testedOut.length > 0 || (outcome.summary.calibration && state.calibration === "done")) {
    events.push(
      callout(
        "Warm-up done",
        outcome.testedOut.length > 0
          ? `You already type ${outcome.testedOut.length} letters at your goal, so they're unlocked: ${outcome.testedOut.join(" ")}.`
          : "AdapType has a picture of your typing now. Practice starts with the first letters.",
      ),
    );
  }
  if (outcome.newlyUnlocked) {
    events.push(
      callout(
        `New letter: ${outcome.newlyUnlocked}`,
        `Every unlocked letter reached your goal, so ${outcome.newlyUnlocked} is next. It shows up more often while you learn it.`,
        "unlock",
      ),
    );
  }
  if (outcome.newlyMastered.length > 0) {
    events.push(callout(`Mastered: ${outcome.newlyMastered.join(" ")}`, "These letters reached your goal speed and accuracy over 3 rounds."));
  }
  if (metrics.corrections > 0) {
    events.push(h("p", { class: "fine" }, `You caught and fixed ${metrics.corrections} ${metrics.corrections === 1 ? "error" : "errors"} yourself.`));
  }

  const el = h(
    "div",
    { class: "screen" },
    topBar(app, { returnTo: { name: "practice" } }),
    h(
      "main",
      { class: "results" },
      h("h1", { class: "sr-only", tabindex: "-1" }, "Round results"),
      headline,
      events.length ? h("div", { class: "events" }, events) : null,
      goalBar(now?.wpm ?? metrics.wpm, goal.wpm),
      unlockProgress(),
      h("section", { class: "panel" }, h("h2", null, "Key strength"), heatmap(state, goal)),
    ),
  );

  const next = h("button", { type: "button", class: "button primary", onclick: () => app.go({ name: "practice" }) }, "Next round", h("kbd", null, "Enter"));
  el.querySelector("main")!.append(h("div", { class: "actions sticky-actions" }, next));

  function unlockProgress(): HTMLElement {
    const upcoming = nextLetter(state);
    const learning = state.unlocked.filter((l) => !state.mastered.includes(l));
    const focus = focusLetter(state);
    const rows = learning.map((letter) => {
      const progress = masteryProgress(state.keyHistory[letter], goal);
      return h(
        "li",
        { class: letter === focus ? "progress-row focus" : "progress-row" },
        h("span", { class: "progress-letter" }, letter),
        h("span", { class: "meter", role: "meter", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(progress * 100)), "aria-label": `${letter} progress to mastery` }, h("span", { style: { width: `${Math.round(progress * 100)}%` } })),
        h("span", { class: "progress-pct" }, formatPercent(progress)),
      );
    });
    const summary = !upcoming
      ? "All 26 letters are unlocked."
      : learning.length === 0
        ? `Next up: ${upcoming}.`
        : `Master ${learning.length === 1 ? "this letter" : `these ${learning.length} letters`} to unlock ${upcoming}.`;
    return h(
      "section",
      { class: "panel" },
      h("h2", null, "Unlock progress"),
      h("p", { class: "panel-lead" }, `${state.unlocked.length} of 26 letters unlocked. ${summary}`),
      rows.length ? h("ul", { class: "progress-list" }, rows) : null,
    );
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      app.go({ name: "practice" });
    }
  };
  // A short delay so a key still held from the last word doesn't skip this screen.
  const timer = window.setTimeout(() => window.addEventListener("keydown", onKey), 400);

  return {
    el,
    dispose: () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    },
  };
}

function callout(title: string, body: string, kind = ""): HTMLElement {
  return h("div", { class: `callout ${kind}`, role: "status" }, h("p", { class: "callout-title" }, title), h("p", null, body));
}

/** Recent average speed against the goal. */
export function goalBar(average: number, goalWpm: number): HTMLElement {
  const max = Math.max(goalWpm * 1.25, average * 1.05);
  const pct = (v: number) => `${Math.min(100, (v / max) * 100).toFixed(1)}%`;
  const reached = average >= goalWpm;
  return h(
    "section",
    { class: "panel goal-panel" },
    h("h2", null, "Speed goal"),
    h(
      "p",
      { class: "panel-lead" },
      reached
        ? `Your recent average is ${Math.round(average)} WPM, at or above your goal of ${goalWpm}.`
        : `Your recent average is ${Math.round(average)} WPM. Your goal is ${goalWpm}.`,
    ),
    h(
      "div",
      { class: `goal-bar ${reached ? "reached" : ""}`, role: "meter", "aria-valuemin": "0", "aria-valuemax": String(goalWpm), "aria-valuenow": String(Math.round(average)), "aria-label": "Recent average speed toward goal" },
      h("span", { class: "goal-fill", style: { width: pct(average) } }),
      h("span", { class: "goal-mark", style: { left: pct(goalWpm) } }, h("span", null, `${goalWpm}`)),
    ),
  );
}
