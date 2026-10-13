import {
  applyArcadeRecords,
  createRival,
  DEFAULT_GOAL,
  ghostFromRound,
  ghostPosition,
  planRound,
  RACE_WORDS,
  recentAverage,
  recordScore,
  saveGhostIfBest,
  stepRival,
  TypingRound,
  updateCreatures,
  updateNemesis,
  type GhostRun,
  type RoundWord,
  type TypingEvent,
} from "../../../engine/src";
import type { App, Screen, ScreenView } from "../app";
import { topBar } from "../components/topBar";
import { touchKeyboard } from "../components/touchKeyboard";
import { TypingView } from "../components/typingView";
import { blocklist, characters, nemesisContent, pack } from "../content";
import { formatPercent, h } from "../dom";
import { announce, wordAt } from "../announce";
import { attachPhysicalInput } from "../physicalInput";
import { playSound } from "../sound";
import { keystrokeFeedback } from "../typingFeedback";
import { currentTouchLayout, platformFor } from "../platform";
import { gameOverPanel } from "./arcadeResults";

/** Ghost race (your best run on the same text) and rival race (a paced opponent). */
export function raceScreen(app: App, screen: Screen): ScreenView {
  if (screen.name !== "race") throw new Error("race");
  const kind = screen.kind;
  const state = app.profile;
  const settings = app.data.settings;
  const touch = settings.activeProfile === "touch";
  const goal = state.goal ?? DEFAULT_GOAL;

  // The ghost races its own text; new text (or no ghost yet) sets a fresh one.
  const ghost: GhostRun | null = kind === "ghost" && !screen.newText ? state.arcade.ghost : null;
  let words: RoundWord[];
  if (ghost) words = ghost.target.split(" ").map((text) => ({ text, madeUp: false }));
  else {
    words = planRound(state, {
      pack,
      blocklist,
      count: RACE_WORDS,
      modifiers: { settings: settings.modifiers, chars: characters, platform: platformFor(app) },
      now: Date.now(),
      madeUpCap: settings.madeUpCap,
    }).words;
  }
  const target = ghost ? ghost.target : words.map((w) => w.text).join(" ");
  const round = new TypingRound(target, settings.errorMode);
  const view = new TypingView(words);
  const baseWpm = recentAverage(state)?.wpm ?? goal.wpm;
  const rival = kind === "rival" ? createRival(settings.rivalPace, baseWpm, goal.wpm) : null;
  const opponentName = kind === "ghost" ? "Ghost" : "Rival";
  const hasOpponent = !!ghost || !!rival;

  const lane = (name: string, cls: string) => {
    const runner = h("span", { class: `runner ${cls}` });
    const wpm = h("span", { class: "lane-wpm" });
    return { el: h("div", { class: `lane ${cls}` }, h("span", { class: "lane-name" }, name), h("span", { class: "lane-track" }, runner, h("span", { class: "finish-line" })), wpm), runner, wpm };
  };
  const you = lane("You", "you");
  const them = lane(opponentName, "them");
  const track = h("div", { class: "race-track", "aria-hidden": "true" }, you.el, hasOpponent ? them.el : null);
  const status = h("p", { class: "race-status", "aria-live": "polite" });

  let intro: string;
  if (kind === "ghost") {
    intro = ghost
      ? `Your ghost typed this at ${Math.round(ghost.wpm)} WPM. Finish it with every character right and a faster time replaces it.`
      : "No ghost yet. Finish this text with every character right and it becomes your ghost.";
  } else {
    const pace = settings.rivalPace;
    intro =
      pace.kind === "ahead"
        ? "Your rival keeps just ahead of you. Pull away and it slows a little; fall behind and it catches up."
        : pace.kind === "goal"
          ? `Your rival types at your goal, ${goal.wpm} WPM.`
          : `Your rival types at ${pace.wpm} WPM.`;
  }

  const startHint = h("p", { class: "start-hint" }, touch ? "Tap the keys below to start" : "Start typing to begin");
  const physical = touch
    ? null
    : attachPhysicalInput({
        onEvent: (e) => handle(e),
        onEscape: () => leave(),
        onCapsLock: () => undefined,
      });
  const landscape = touch && window.matchMedia("(orientation: landscape)").matches;
  const layout = currentTouchLayout(settings);
  const keyboard = touch
    ? touchKeyboard({
        layout: layout.layout,
        layoutName: layout.name,
        split: landscape,
        onChar: (char, tap, layer, t) => handle({ kind: "char", char, t, tap, layer: layer || undefined }),
        onBackspace: () => handle({ kind: "backspace", t: performance.now() }),
        isLocked: () => false,
      })
    : null;

  const main = h(
    "main",
    { class: "race" },
    h("h1", { tabindex: "-1" }, kind === "ghost" ? "Ghost race" : "Rival race"),
    h("p", { class: "notice" }, intro),
    track,
    h("div", { class: "typing-wrap" }, view.el, startHint),
    status,
    h("p", { class: "sr-only" }, `Type: ${target}`),
    physical?.el,
  );
  const el = h(
    "div",
    { class: `screen practice-screen race-screen${touch ? " touch" : ""}${landscape ? " landscape" : ""}` },
    topBar(app, { back: () => leave(), backLabel: "Arcade" }),
    main,
    keyboard,
  );
  if (physical) main.addEventListener("pointerup", () => physical.focus());

  let startedAt: number | null = null;
  let raf = 0;
  let finished = false;
  let opponentDone: number | null = null;
  let last = 0;

  function opponentChars(elapsedMs: number): number {
    if (ghost) return ghostPosition(ghost, elapsedMs);
    if (rival) return Math.min(target.length, Math.floor(rival.position));
    return 0;
  }

  function frame(t: number): void {
    if (finished || startedAt === null) return;
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    const elapsed = t - startedAt;
    if (rival) stepRival(rival, dt, round.position, round.metrics().wpm);
    const pos = opponentChars(elapsed);
    if (hasOpponent && opponentDone === null && pos >= target.length) {
      opponentDone = elapsed;
      status.textContent = `${opponentName} finished.`;
    }
    draw(pos, elapsed);
    raf = requestAnimationFrame(frame);
  }

  function draw(pos: number, elapsedMs: number): void {
    const youPct = (round.position / target.length) * 100;
    you.runner.style.setProperty("--p", String(youPct / 100));
    you.wpm.textContent = startedAt === null ? "" : `${Math.round(round.metrics().wpm)}`;
    if (hasOpponent) {
      them.runner.style.setProperty("--p", String(Math.min(pos, target.length) / target.length));
      const wpm = ghost ? ghost.wpm : rival ? (rival.position * 12) / Math.max(1, elapsedMs / 1000) : 0;
      them.wpm.textContent = startedAt === null ? "" : `${Math.round(wpm)}`;
      if (startedAt !== null) view.setGhost(pos);
    }
  }

  function handle(event: TypingEvent): void {
    if (finished) return;
    if (startedAt === null) {
      if (event.kind === "backspace") return;
      startedAt = performance.now();
      last = startedAt;
      startHint.hidden = true;
      el.classList.add("running");
      raf = requestAnimationFrame(frame);
    }
    const before = round.position;
    keystrokeFeedback(round, round.input(event), before);
    view.update(round);
    if (round.done) finish();
  }

  function finish(): void {
    finished = true;
    cancelAnimationFrame(raf);
    const now = Date.now();
    const elapsed = performance.now() - (startedAt ?? performance.now());
    const metrics = round.metrics();
    applyArcadeRecords(state, round.target, round.records, { chars: characters, pack, at: now });
    updateCreatures(state, now, characters);
    state.arcade.games += 1;
    state.roundCounter += 1;
    let newGhost = false;
    if (kind === "ghost") newGhost = saveGhostIfBest(state, ghostFromRound(round, now));
    const entry = { score: Math.round(metrics.wpm * metrics.accuracy * 10), level: 1, words: words.length, wpm: metrics.wpm, accuracy: metrics.accuracy, at: now };
    const rank = recordScore(state, kind, entry);
    const nemesisChange = updateNemesis(state, now, nemesisContent);
    app.persist();

    const won = hasOpponent ? opponentDone === null || elapsed < opponentDone : null;
    playSound(won === false ? "error" : "success");
    let verdict: string;
    if (kind === "ghost") {
      verdict = newGhost
        ? ghost
          ? "You beat your ghost. This run is your new ghost."
          : "This run is now your ghost."
        : ghost && won
          ? "You crossed first, but a mistake was left in, so the ghost stays."
          : ghost
            ? "The ghost wins this time."
            : "Leave no mistakes in to set a ghost.";
    } else verdict = won ? "You beat your rival." : "Your rival wins this time.";
    draw(opponentChars(elapsed), elapsed);
    main.append(
      gameOverPanel(app, {
        title: won === false ? "Race lost" : "Race won",
        verdict,
        rank,
        stats: [
          ["Speed", `${Math.round(metrics.wpm)} WPM`],
          ["Accuracy", formatPercent(metrics.accuracy)],
          ["Time", `${(elapsed / 1000).toFixed(1)}s`],
        ],
        nemesisChange,
        again: { name: "race", kind },
      }),
    );
  }

  function leave(): void {
    if (!finished && round.records.length > 0) {
      // An unfinished race still counts toward your stats, without a score.
      finished = true;
      applyArcadeRecords(state, round.target, round.records, { chars: characters, pack, at: Date.now() });
      app.persist();
    }
    app.go({ name: "arcade" });
  }

  announce(`Ready. First word: ${wordAt(round.target, 0)}.`);
  const onResize = () => view.scroll();
  window.addEventListener("resize", onResize);
  requestAnimationFrame(() => {
    view.scroll();
    draw(0, 0);
  });

  return {
    el,
    focus: physical?.el ?? (main.querySelector("h1") as HTMLElement),
    dispose: () => {
      finished = true;
      cancelAnimationFrame(raf);
      physical?.dispose();
      window.removeEventListener("resize", onResize);
    },
  };
}
