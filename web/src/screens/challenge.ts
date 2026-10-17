import {
  applyArcadeRecords,
  challengeGhost,
  challengeGhostAt,
  challengeResult,
  challengeText,
  CHALLENGE_MAX_TEXT,
  rematchChallenge,
  TypingRound,
  updateCreatures,
  type Challenge,
  type ChallengeSource,
  type TypingEvent,
} from "../../../engine/src";
import { earn, newBadgesPanel } from "../achievements";
import { announce } from "../announce";
import type { App, Screen, ScreenView } from "../app";
import { challengeFromRound, runSummary, seconds, shareChallenge } from "../challenge";
import { topBar } from "../components/topBar";
import { touchKeyboard } from "../components/touchKeyboard";
import { characters, pack } from "../content";
import { formatPercent, h, icon, ICONS } from "../dom";
import { attachPhysicalInput } from "../physicalInput";
import { currentTouchLayout } from "../platform";
import { playSound } from "../sound";
import { keystrokeFeedback } from "../typingFeedback";
import { PassageView } from "./passages";

const SOURCE_LABELS: Record<ChallengeSource, string> = {
  practice: "a practice round",
  daily: "a daily challenge",
  code: "a code snippet",
  quotes: "a quote",
  course: "a numbers and symbols round",
  race: "an arcade race",
  custom: "their own text",
  rematch: "a rematch",
};

/**
 * Racing a friend's challenge (their ghost on their text), or typing your
 * own text once so you can send it. A link that couldn't be read shows why.
 */
export function challengeScreen(app: App, screen: Screen): ScreenView {
  if (screen.name !== "challenge") throw new Error("challenge");
  if (screen.error !== undefined || (!screen.challenge && !screen.text)) return brokenLink(app, screen.error ?? "This challenge link couldn't be read.");
  const ch: Challenge | null = screen.challenge ?? null;
  const ownText = ch ? null : screen.text!;
  const target = ch ? ch.target : ownText!;
  const state = app.profile;
  const settings = app.data.settings;
  const touch = settings.activeProfile === "touch";
  const newcomer = app.needsSetup;
  // The opponent at the start of a sentence, and inside one.
  const them = ch?.name || "Your friend";
  const themIn = ch?.name || "your friend";
  const ghost = ch ? challengeGhost(ch) : null;
  const run = ch ? runSummary(ch) : null;
  const round = new TypingRound(target, settings.errorMode, { autoIndent: ch?.autoIndent ?? false });
  const view = new PassageView(target);
  const inputEvents: TypingEvent[] = [];

  const lane = (name: string, cls: string) => {
    const runner = h("span", { class: `runner ${cls}` });
    const wpm = h("span", { class: "lane-wpm" });
    return { el: h("div", { class: `lane ${cls}` }, h("span", { class: "lane-name" }, name), h("span", { class: "lane-track" }, runner, h("span", { class: "finish-line" })), wpm), runner, wpm };
  };
  const you = lane("You", "you");
  const ghostLane = ch ? lane(them.length > 10 ? `${[...them].slice(0, 9).join("")}…` : them, "them") : null;
  const status = h("p", { class: "race-status", "aria-live": "polite" });
  const result = h("div", { class: "challenge-result" });
  const startHint = h("p", { class: "start-hint" }, touch ? "Tap the keys below to start" : "Start typing to begin");

  const intro: (HTMLElement | string)[] = [];
  if (ch && run) {
    intro.push(
      h("p", { class: "notice" }, `Race ${ch.name ? `${ch.name}'s` : "your friend's"} ghost on ${SOURCE_LABELS[ch.source]}: ${Math.round(run.wpm)} WPM, ${formatPercent(run.accuracy)} accuracy, ${seconds(run.ms)}. The ghost starts when you type your first key.`),
    );
    if (ch.score[0] + ch.score[1] > 0) intro.push(h("p", { class: "fine" }, `Score so far: ${themIn} ${ch.score[0]}, you ${ch.score[1]}.`));
    if (newcomer) intro.push(h("p", { class: "fine" }, "New to AdapType? Race first. Afterward, a short placement test sets you up, and this race already counts."));
  } else {
    intro.push(h("p", { class: "notice" }, "Type your text once. Then send it, and your friend races your run."));
  }

  // Code has new lines: Enter (or return on the touch keyboard) types them.
  const multiline = target.includes("\n");
  const physical = touch
    ? null
    : attachPhysicalInput({
        enter: multiline,
        onEvent: (e) => handle(e),
        onEscape: () => leave(),
        onCapsLock: () => undefined,
      });
  const layout = currentTouchLayout(settings);
  const keyboard = touch
    ? touchKeyboard({
        layout: layout.layout,
        layoutName: layout.name,
        returnKey: multiline,
        onChar: (char, tap, layer, t) => handle({ kind: "char", char, t, tap, layer: layer || undefined }),
        onBackspace: () => handle({ kind: "backspace", t: performance.now() }),
        isLocked: () => false,
      })
    : null;

  const main = h(
    "main",
    { class: "race challenge" },
    h("h1", { tabindex: "-1" }, ch ? (ch.name ? `${ch.name}'s challenge` : "A typing challenge") : "Your challenge"),
    ...intro,
    h("div", { class: "race-track", "aria-hidden": "true" }, you.el, ghostLane?.el),
    h("div", { class: "typing-wrap" }, view.el, startHint),
    status,
    h("p", { class: "sr-only" }, `Type: ${target}`),
    physical?.el,
    result,
  );
  const backLabel = ownText !== null ? "Edit text" : newcomer ? "AdapType" : "Practice";
  const el = h("div", { class: `screen practice-screen race-screen passages-screen${touch ? " touch" : ""}` }, topBar(app, { back: () => leave(), backLabel }), main, keyboard);
  if (physical) main.addEventListener("pointerup", (e) => !(e.target as HTMLElement).closest("button, a, label, input") && physical.focus());

  let startedAt: number | null = null;
  let raf = 0;
  let finished = false;
  let ghostDone = false;

  function frame(t: number): void {
    if (finished || startedAt === null) return;
    draw(t - startedAt);
    raf = requestAnimationFrame(frame);
  }

  function draw(elapsed: number): void {
    you.runner.style.setProperty("--p", String(round.position / target.length));
    you.wpm.textContent = startedAt === null ? "" : `${Math.round(round.metrics().wpm)}`;
    if (ghost && ghostLane) {
      const pos = challengeGhostAt(ghost, elapsed);
      ghostLane.runner.style.setProperty("--p", String(pos / target.length));
      ghostLane.wpm.textContent = startedAt === null ? "" : `${Math.round(run!.wpm)}`;
      if (startedAt !== null) view.setGhost(pos);
      if (!ghostDone && elapsed >= ghost.finishMs && startedAt !== null) {
        ghostDone = true;
        status.textContent = `${them} finished.`;
      }
    }
  }

  function handle(event: TypingEvent): void {
    if (finished) return;
    if (startedAt === null) {
      if (event.kind === "backspace") return;
      startedAt = performance.now();
      startHint.hidden = true;
      el.classList.add("running");
      raf = requestAnimationFrame(frame);
    }
    const before = round.position;
    const record = round.input(event);
    inputEvents.push(event);
    keystrokeFeedback(round, record, before);
    view.update(round);
    if (round.done) finish();
  }

  function finish(): void {
    finished = true;
    cancelAnimationFrame(raf);
    const now = Date.now();
    const m = round.metrics();
    // It counts toward key stats like an arcade race (a newcomer's practice starts off informed).
    applyArcadeRecords(state, round.target, round.records, { chars: characters, pack, at: now });
    updateCreatures(state, now, characters);
    state.roundCounter += 1;
    keyboard?.remove();
    el.classList.remove("touch");
    if (ch && ghost) raceOver(m.wpm, m.accuracy);
    else ownTextDone(m.wpm, m.accuracy);
  }

  function raceOver(wpm: number, accuracy: number): void {
    const r = challengeResult(ch!, round);
    draw(r.yourMs);
    const badges = earn(app, { kind: "race", ghost: false, won: r.outcome === "win", marginMs: r.marginMs });
    app.persist();
    playSound(r.outcome === "loss" ? "error" : "success");
    const title = r.outcome === "win" ? "You win!" : r.outcome === "loss" ? `${them} wins` : "A tie!";
    const verdict = r.outcome === "tie" ? "You finished in exactly the same time." : `By ${seconds(r.marginMs)}.`;
    const score = `Score: you ${r.score[0]}, ${themIn} ${r.score[1]}.`;
    const rematch = rematchChallenge(ch!, round, inputEvents, settings.challengeName);
    const rematchButton = rematch
      ? h(
          "button",
          {
            type: "button",
            class: "button primary",
            onclick: () =>
              shareChallenge(app, rematch, {
                title: "Send a rematch",
                lead: `${them} races your ghost next, and the link carries the score (you ${r.score[0]}, ${themIn} ${r.score[1]}).`,
              }),
          },
          icon([...ICONS.flag]),
          "Send a rematch",
        )
      : null;
    const row = (name: string, w: number, a: number, ms: number, cls: string) =>
      h("tr", { class: cls }, h("th", { scope: "row" }, name), h("td", { class: "num" }, `${Math.round(w)}`), h("td", { class: "num" }, formatPercent(a)), h("td", { class: "num" }, seconds(ms)));
    const runs = [
      { name: "You", wpm, accuracy, ms: r.yourMs, cls: "you" },
      { name: them, wpm: run!.wpm, accuracy: run!.accuracy, ms: r.theirMs, cls: "them" },
    ].sort((a, b) => a.ms - b.ms);
    result.replaceChildren(
      h(
        "section",
        { class: `panel challenge-over ${r.outcome}` },
        h("h2", { class: "challenge-title", tabindex: "-1" }, title),
        h("p", { class: "verdict" }, verdict, " ", score),
        h(
          "table",
          { class: "challenge-table" },
          h("thead", null, h("tr", null, h("th", { scope: "col" }, h("span", { class: "sr-only" }, "Who")), h("th", { scope: "col" }, "WPM"), h("th", { scope: "col" }, "Accuracy"), h("th", { scope: "col" }, "Time"))),
          h("tbody", null, runs.map((x) => row(x.name, x.wpm, x.accuracy, x.ms, x.cls))),
        ),
        newcomer
          ? h("p", null, "AdapType learns which keys slow you down and builds practice around them. A short placement test sets you up, and this race already counts.")
          : h("p", { class: "fine" }, "The race counts toward your key stats."),
        h(
          "div",
          { class: "actions wrap" },
          rematchButton,
          h("button", { type: "button", class: "button", onclick: () => app.go({ name: "challenge", challenge: ch! }) }, "Race again"),
          newcomer
            ? h("button", { type: "button", class: "button", onclick: () => app.home() }, "Set up AdapType")
            : h("button", { type: "button", class: "button", onclick: () => app.go({ name: "practice" }) }, "Practice"),
        ),
      ),
      newBadgesPanel(app, badges) ?? "",
    );
    announce(`${title} ${verdict} ${score}`);
    requestAnimationFrame(() => (result.querySelector(".challenge-title") as HTMLElement).focus());
  }

  function ownTextDone(wpm: number, accuracy: number): void {
    app.persist();
    playSound("success");
    const made = challengeFromRound(round, inputEvents, "custom");
    const send = made
      ? h("button", { type: "button", class: "button primary", onclick: () => shareChallenge(app, made) }, icon([...ICONS.flag]), "Challenge a friend")
      : null;
    result.replaceChildren(
      h(
        "section",
        { class: "panel challenge-over" },
        h("h2", { class: "challenge-title", tabindex: "-1" }, `${Math.round(wpm)} WPM, ${formatPercent(accuracy)} accuracy`),
        h("p", null, made ? `Your friend races this run: ${seconds(runSummary(made).ms)} to beat.` : "This run can't be sent."),
        h(
          "div",
          { class: "actions wrap" },
          send,
          h("button", { type: "button", class: "button", onclick: () => app.go({ name: "challenge", text: ownText! }) }, "Type it again"),
          h("button", { type: "button", class: "button", onclick: () => app.go({ name: "challenge-new", text: ownText! }) }, "Edit the text"),
        ),
      ),
    );
    announce(`Done. ${Math.round(wpm)} words per minute.`);
    requestAnimationFrame(() => (send ?? (result.querySelector(".challenge-title") as HTMLElement)).focus());
  }

  function leave(): void {
    if (ownText !== null) app.go({ name: "challenge-new", text: ownText });
    else if (newcomer) app.home();
    else app.go({ name: "practice" });
  }

  announce(ch ? `Challenge. ${run ? `${Math.round(run.wpm)} words per minute to beat.` : ""} First word: ${target.split(/\s/)[0]}.` : `Your text. First word: ${target.split(/\s/)[0]}.`);
  requestAnimationFrame(() => draw(0));
  return {
    el,
    focus: physical?.el ?? (main.querySelector("h1") as HTMLElement),
    dispose: () => {
      finished = true;
      cancelAnimationFrame(raf);
      physical?.dispose();
    },
  };
}

function brokenLink(app: App, message: string): ScreenView {
  const main = h(
    "main",
    null,
    h("h1", { tabindex: "-1" }, "Challenge"),
    h("div", { class: "callout" }, h("p", null, message)),
    h("div", { class: "actions" }, h("button", { type: "button", class: "button primary", onclick: () => app.home() }, "Go to AdapType")),
  );
  return { el: h("div", { class: "screen" }, topBar(app), main) };
}

/** Write your own text to send as a challenge, and how to send any other run. */
export function challengeNewScreen(app: App, screen: Screen): ScreenView {
  if (screen.name !== "challenge-new") throw new Error("challenge-new");
  const area = h("textarea", { id: "challenge-text", rows: "6", maxlength: String(CHALLENGE_MAX_TEXT * 2), placeholder: "A sentence, a line of a song, an inside joke…" }) as HTMLTextAreaElement;
  area.value = screen.text ?? "";
  const count = h("p", { class: "fine", "aria-live": "polite" });
  const error = h("p", { class: "status error", role: "alert" });
  const update = () => {
    const n = challengeText(area.value).length;
    count.textContent = `${n} of ${CHALLENGE_MAX_TEXT} characters${area.value.length > 0 && challengeText(area.value) !== area.value.trim() ? ". Curly quotes, long dashes and emoji are made typeable." : "."}`;
  };
  area.addEventListener("input", update);
  update();
  const go = () => {
    const text = challengeText(area.value);
    if (text.replace(/\s/g, "").length < 10) {
      error.textContent = "Write at least a few words.";
      area.focus();
      return;
    }
    app.go({ name: "challenge", text });
  };
  const main = h(
    "main",
    { class: "challenge-new" },
    h("h1", { tabindex: "-1" }, "Challenge a friend"),
    h(
      "p",
      { class: "lead" },
      "Send a friend a link to race your ghost. They don't need an account, or even AdapType: the link opens it, and the race starts right away.",
    ),
    h(
      "section",
      { class: "panel" },
      h("h2", null, "Send any run"),
      h(
        "p",
        null,
        "Finish a practice round, the daily challenge, a quote, a code snippet, a numbers and symbols round or an arcade race, then choose ",
        h("strong", null, "Challenge a friend"),
        ". You can also send a saved run from Replays.",
      ),
      h(
        "div",
        { class: "actions wrap" },
        h("button", { type: "button", class: "button", onclick: () => app.go({ name: "practice" }) }, "Practice"),
        h("button", { type: "button", class: "button", onclick: () => app.go({ name: "replays", returnTo: { name: "challenge-new" } }) }, "Replays"),
      ),
    ),
    h(
      "section",
      { class: "panel" },
      h("h2", null, "Or your own text"),
      h("div", { class: "field" }, h("label", { for: "challenge-text", class: "field-label" }, "Your text"), area, count),
      error,
      h("div", { class: "actions" }, h("button", { type: "button", class: "button primary", onclick: go }, "Type it")),
      h("p", { class: "fine" }, "You type it once, then send that run."),
    ),
  );
  const el = h("div", { class: "screen" }, topBar(app, { back: () => app.go({ name: "practice" }), backLabel: "Practice", returnTo: { name: "challenge-new" } }), main);
  return { el };
}
