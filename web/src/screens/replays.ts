import type { ReplayRun } from "../../../engine/src";
import type { App, Screen, ScreenView } from "../app";
import { topBar } from "../components/topBar";
import { formatPercent, h } from "../dom";

export function runLabel(run: ReplayRun): string {
  const when = new Date(run.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `${run.source === "daily" ? "Daily challenge" : "Practice"}, ${when}`;
}

/** Recent runs and personal bests, each one watchable in slow motion. */
export function replaysScreen(app: App, screen: Screen): ScreenView {
  const returnTo = screen.name === "replays" ? screen.returnTo : undefined;
  const { recent, best } = app.profile.replays;
  const here: Screen = { name: "replays", returnTo };

  const row = (run: ReplayRun, list: "recent" | "best", index: number, rank?: number) =>
    h(
      "li",
      { class: "replay-row" },
      rank ? h("span", { class: "replay-rank" }, `#${rank}`) : null,
      h("span", { class: "replay-main" }, h("strong", { class: "num" }, `${Math.round(run.wpm)} WPM`), h("span", { class: "fine" }, ` ${formatPercent(run.accuracy)} · ${runLabel(run)}`)),
      h("button", { type: "button", class: "button", onclick: () => app.go({ name: "replay", list, index, returnTo: here }), "aria-label": `Watch ${runLabel(run)}` }, "Watch"),
    );

  const main = h(
    "main",
    { class: "replays" },
    h("h1", { tabindex: "-1" }, "Replays"),
    h("p", { class: "lead" }, "Watch a run again in slow motion. Mistakes and hesitations are marked on the timeline, and your best run plays alongside."),
    recent.length === 0
      ? h("p", { class: "panel-lead" }, "Finish a practice round and it shows up here.")
      : h(
          "section",
          { class: "panel" },
          h("h2", null, "Personal bests"),
          h("p", { class: "panel-lead" }, "Your top runs by speed times accuracy."),
          h("ol", { class: "replay-list" }, best.map((run, i) => row(run, "best", i, i + 1))),
        ),
    recent.length
      ? h(
          "section",
          { class: "panel" },
          h("h2", null, "Recent runs"),
          h("ol", { class: "replay-list" }, [...recent].map((run, i) => ({ run, i })).reverse().map(({ run, i }) => row(run, "recent", i))),
        )
      : null,
  );
  const el = h("div", { class: "screen" }, topBar(app, { back: () => (returnTo ? app.go(returnTo) : app.go({ name: "progress" })), backLabel: "Back" }), main);
  return { el };
}
