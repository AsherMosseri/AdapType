import { makeChallenge, replayDuration, replayMarkers, replayRound, type ReplayRun } from "../../../engine/src";
import type { App, Screen, ScreenView } from "../app";
import { challengeButton } from "../challenge";
import { topBar } from "../components/topBar";
import { TypingView } from "../components/typingView";
import { formatPercent, h } from "../dom";
import { runLabel } from "./replays";

const SPEEDS = [0.25, 0.5, 1, 2] as const;

/** One replay track: its text, a progress lane and live numbers. */
class Track {
  readonly view: TypingView;
  readonly el: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly duration: number;

  constructor(readonly run: ReplayRun, title: string, cls: string) {
    this.view = new TypingView(run.target.split(" ").map((text) => ({ text, madeUp: false })));
    this.fill = h("span", { class: "replay-fill" });
    this.stats = h("span", { class: "replay-stats num" });
    this.duration = replayDuration(run);
    this.el = h(
      "section",
      { class: `replay-track ${cls}` },
      h("div", { class: "replay-track-head" }, h("h2", null, title), this.stats),
      h("div", { class: "replay-lane", "aria-hidden": "true" }, this.fill),
      h("div", { class: "typing-wrap" }, this.view.el),
    );
  }

  show(ms: number): void {
    const round = replayRound(this.run, ms);
    this.view.update(round);
    this.fill.style.width = `${(round.position / this.run.target.length) * 100}%`;
    const m = round.metrics();
    const done = ms >= this.duration;
    this.stats.textContent = round.records.length < 2 ? "" : `${Math.round(m.wpm)} WPM · ${formatPercent(m.accuracy)}${done ? " · finished" : ""}`;
  }
}

/** Slow-motion playback of one run, with your best run alongside. */
export function replayScreen(app: App, screen: Screen): ScreenView {
  if (screen.name !== "replay") throw new Error("replay");
  const store = app.profile.replays;
  const run = store[screen.list][screen.index];
  const back = () => (screen.returnTo ? app.go(screen.returnTo) : app.go({ name: "replays" }));
  if (!run) {
    const el = h("div", { class: "screen" }, topBar(app, { back, backLabel: "Back" }), h("main", null, h("h1", { tabindex: "-1" }, "Replay"), h("p", { class: "lead" }, "That replay isn't saved anymore.")));
    return { el };
  }
  const best = store.best.find((b) => b.at !== run.at) ?? null;
  const self = new Track(run, "This run", "this");
  const other = best ? new Track(best, "Your best run", "best") : null;
  const duration = Math.max(replayDuration(run), best ? replayDuration(best) : 0);
  const markers = replayMarkers(run);

  let t = 0;
  let speed = 1;
  let playing = false;
  let raf = 0;
  let last = 0;

  const playButton = h("button", { type: "button", class: "button primary play-button" }, "Play");
  const timeText = h("span", { class: "replay-time num", "aria-live": "off" });
  const scrub = h("input", { type: "range", min: "0", max: String(duration), step: "10", value: "0", class: "scrub", "aria-label": "Position in the replay" });
  const markerLayer = h(
    "div",
    { class: "marker-layer" },
    markers.map((m) =>
      h("button", {
        type: "button",
        class: `marker ${m.kind}`,
        style: `left:${duration > 0 ? (m.t / duration) * 100 : 0}%`,
        title: m.kind === "error" ? `Mistake at "${run.target[m.index] ?? ""}"` : `Hesitation before "${run.target[m.index] ?? ""}"`,
        "aria-label": `${m.kind === "error" ? "Mistake" : "Hesitation"} at ${(m.t / 1000).toFixed(1)} seconds`,
        onclick: () => seek(Math.max(0, m.t - 400)),
      }),
    ),
  );
  const speedControl = h(
    "div",
    { class: "segmented", role: "radiogroup", "aria-label": "Playback speed" },
    SPEEDS.map((s) => {
      const id = `speed-${s}`;
      const input = h("input", { type: "radio", name: "speed", id, checked: s === 1 });
      input.addEventListener("change", () => (speed = s));
      return h("label", { for: id }, input, h("span", null, `${s}x`));
    }),
  );

  const counts = { error: markers.filter((m) => m.kind === "error").length, hesitation: markers.filter((m) => m.kind === "hesitation").length };
  const main = h(
    "main",
    { class: "replay" },
    h("h1", { tabindex: "-1" }, "Replay"),
    h("p", { class: "panel-lead" }, `${runLabel(run)}: ${Math.round(run.wpm)} WPM, ${formatPercent(run.accuracy)}. ${counts.error} ${counts.error === 1 ? "mistake" : "mistakes"} and ${counts.hesitation} ${counts.hesitation === 1 ? "hesitation" : "hesitations"} marked below.`),
    h(
      "div",
      { class: "replay-controls" },
      h("div", { class: "actions wrap" }, playButton, speedControl, timeText, challengeButton(app, makeChallenge(run, run.source, ""))),
      h("div", { class: "timeline" }, scrub, markerLayer),
      h("p", { class: "fine legend" }, h("span", { class: "dot error" }), " mistake ", h("span", { class: "dot hesitation" }), " hesitation. Select one to jump just before it. Space plays and pauses, arrow keys step a second."),
    ),
    self.el,
    other ? other.el : h("p", { class: "fine" }, "Your best run plays alongside once you have another run saved."),
  );
  const el = h("div", { class: "screen" }, topBar(app, { back, backLabel: "Back" }), main);

  function render(): void {
    self.show(t);
    other?.show(t);
    scrub.value = String(Math.round(t));
    timeText.textContent = `${(t / 1000).toFixed(1)}s of ${(duration / 1000).toFixed(1)}s`;
  }

  function seek(ms: number): void {
    t = Math.max(0, Math.min(duration, ms));
    render();
  }

  function frame(now: number): void {
    if (!playing) return;
    t += (now - last) * speed;
    last = now;
    if (t >= duration) {
      t = duration;
      setPlaying(false);
    }
    render();
    if (playing) raf = requestAnimationFrame(frame);
  }

  function setPlaying(on: boolean): void {
    playing = on;
    playButton.textContent = on ? "Pause" : t >= duration ? "Play again" : "Play";
    cancelAnimationFrame(raf);
    if (on) {
      if (t >= duration) t = 0;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  playButton.addEventListener("click", () => setPlaying(!playing));
  scrub.addEventListener("input", () => seek(Number(scrub.value)));
  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("input[type=radio], button, a") && (e.key === " " || e.key === "Enter")) return;
    if (e.key === " ") {
      e.preventDefault();
      setPlaying(!playing);
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && target !== scrub) {
      e.preventDefault();
      seek(t + (e.key === "ArrowLeft" ? -1000 : 1000));
    }
  };
  window.addEventListener("keydown", onKey);
  const onResize = () => {
    self.view.scroll();
    other?.view.scroll();
  };
  window.addEventListener("resize", onResize);
  requestAnimationFrame(render);

  return {
    el,
    focus: playButton,
    dispose: () => {
      playing = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    },
  };
}
