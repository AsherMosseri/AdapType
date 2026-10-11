import {
  completeRound,
  isCalibrating,
  planWords,
  SILENT_CALIBRATION_ROUNDS,
  type RoundType,
  type TypingEvent,
} from "../../../engine/src";
import { TypingRound } from "../../../engine/src/typing";
import type { App, Screen, ScreenView } from "../app";
import { letterStrip } from "../components/letters";
import { topBar } from "../components/topBar";
import { touchKeyboard } from "../components/touchKeyboard";
import { TypingView } from "../components/typingView";
import { blocklist, pack } from "../content";
import { formatPercent, h } from "../dom";

const CHUNK = 30;
const CALIBRATION_SECONDS = 60;

/** The practice round, also used for the 1-minute calibration test. */
export function practiceScreen(app: App, screen: Screen): ScreenView {
  const calibrationTest = screen.name === "calibration";
  const state = app.profile;
  const silent = isCalibrating(state);
  const roundType: RoundType = calibrationTest ? { kind: "timed", seconds: CALIBRATION_SECONDS } : app.data.settings.round;
  const touch = app.data.settings.activeProfile === "touch";

  let chunk = 0;
  const firstWords = planWords(state, {
    pack,
    blocklist,
    count: roundType.kind === "words" ? roundType.count : CHUNK,
    calibrationTest,
  });
  let lastWord = firstWords[firstWords.length - 1]?.text ?? "";
  const round = new TypingRound(firstWords.map((w) => w.text).join(" "), app.data.settings.errorMode);
  const view = new TypingView(firstWords);
  const wordTotal = roundType.kind === "words" ? roundType.count : 0;

  let startedAt: number | null = null;
  let finished = false;
  let ticker = 0;

  // Live stats.
  const wpmValue = h("span", { class: "stat-value" }, "0");
  const accValue = h("span", { class: "stat-value" }, "100%");
  const progressValue = h("span", { class: "stat-value" }, progressText());
  const progressLabel = roundType.kind === "words" ? "Words" : roundType.kind === "timed" ? "Time left" : "Time";
  const stats = h(
    "dl",
    { class: "live-stats" },
    h("div", null, h("dt", null, "WPM"), h("dd", null, wpmValue)),
    h("div", null, h("dt", null, "Accuracy"), h("dd", null, accValue)),
    h("div", null, h("dt", null, progressLabel), h("dd", null, progressValue)),
  );

  const startHint = h("p", { class: "start-hint" }, touch ? "Tap the keys below to start" : "Start typing to begin");
  const capsHint = h("p", { class: "caps-hint", role: "status" }, "Caps Lock is on");
  capsHint.hidden = true;
  const endButton = h(
    "button",
    { type: "button", class: "text-button", onclick: () => endEarly() },
    roundType.kind === "endless" ? "Finish" : "End round",
    touch ? null : h("kbd", null, "Esc"),
  );

  let notice: HTMLElement | null = null;
  if (calibrationTest) {
    notice = h(
      "p",
      { class: "notice" },
      h("strong", null, "1-minute test. "),
      "Type the words as they come, at a comfortable pace. AdapType uses this to set your starting letters and suggest a goal.",
    );
  } else if (silent) {
    const n = SILENT_CALIBRATION_ROUNDS - state.silentRoundsLeft + 1;
    notice = h(
      "p",
      { class: "notice" },
      h("strong", null, `Warm-up ${n} of ${SILENT_CALIBRATION_ROUNDS}. `),
      "These rounds use all letters so AdapType can learn what you already know.",
    );
  } else if (app.notice) {
    notice = h("p", { class: "notice", role: "status" }, app.notice);
    app.notice = null;
  }

  // Screen reader summary of the text, since the visual text is hidden from them.
  const srText = h("p", { class: "sr-only", "aria-live": "off" }, `Type: ${round.target}`);

  const keyboard = touch
    ? touchKeyboard({
        onChar: (char, tap) => handle({ kind: "char", char, t: performance.now(), tap }),
        onBackspace: () => handle({ kind: "backspace", t: performance.now() }),
        isLocked: (letter) => !calibrationTest && !silent && !state.unlocked.includes(letter),
      })
    : null;

  const main = h(
    "main",
    { class: "practice" },
    h("h1", { class: "sr-only", tabindex: "-1" }, calibrationTest ? "Calibration test" : "Practice"),
    calibrationTest || silent ? null : letterStrip(state),
    notice,
    h("div", { class: "typing-wrap" }, view.el, startHint, capsHint),
    firstWords.some((w) => w.madeUp)
      ? h("p", { class: "fine" }, "Words with a dotted underline are made-up practice words, used while only a few letters are unlocked.")
      : null,
    srText,
    h("div", { class: "practice-foot" }, stats, endButton),
  );
  const el = h(
    "div",
    { class: touch ? "screen practice-screen touch" : "screen practice-screen" },
    topBar(app, { returnTo: calibrationTest ? undefined : { name: "practice" } }),
    main,
    keyboard,
  );

  function progressText(): string {
    if (roundType.kind === "words") {
      const typedWords = round ? round.target.slice(0, round.position).split(" ").length - 1 : 0;
      return `${Math.min(typedWords, wordTotal)}/${wordTotal}`;
    }
    const elapsed = startedAt === null ? 0 : performance.now() - startedAt;
    if (roundType.kind === "timed") return clock(Math.max(0, roundType.seconds * 1000 - elapsed));
    return clock(elapsed);
  }

  function refreshStats(): void {
    const m = round.metrics();
    wpmValue.textContent = String(Math.round(m.wpm));
    accValue.textContent = formatPercent(m.accuracy);
    progressValue.textContent = progressText();
  }

  function addMore(): void {
    chunk += 1;
    const more = planWords(state, { pack, blocklist, count: CHUNK, chunk, previous: lastWord, calibrationTest });
    lastWord = more[more.length - 1]?.text ?? lastWord;
    round.append(" " + more.map((w) => w.text).join(" "));
    view.addWords(more);
  }

  function handle(event: TypingEvent): void {
    if (finished) return;
    if (startedAt === null) {
      if (event.kind === "backspace") return;
      startedAt = performance.now();
      startHint.hidden = true;
      el.classList.add("running");
      ticker = window.setInterval(tick, 250);
    }
    round.input(event);
    view.update(round);
    if (roundType.kind !== "words" && view.remaining(round) < 80) addMore();
    if (round.done) finish();
    else if (roundType.kind === "words") progressValue.textContent = progressText();
  }

  function tick(): void {
    refreshStats();
    if (roundType.kind === "timed" && startedAt !== null && performance.now() - startedAt >= roundType.seconds * 1000) {
      finish();
    }
  }

  function endEarly(): void {
    if (finished) return;
    if (round.records.length === 0) {
      finished = true;
      app.go(calibrationTest ? { name: "welcome" } : { name: "practice" });
      return;
    }
    finish();
  }

  function finish(): void {
    if (finished) return;
    finished = true;
    window.clearInterval(ticker);
    const metrics = round.metrics();
    const outcome = completeRound(state, round, Date.now(), { calibrationTest });
    app.persist();
    if (calibrationTest) app.go({ name: "goal", measuredWpm: metrics.wpm, from: "test" });
    else app.go({ name: "results", outcome, metrics, calibrationTest });
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLElement && e.target.closest("button, a, input, textarea, select") && e.key !== "Escape") {
      // Let Enter/Space activate a focused control instead of typing.
      if (e.key === "Enter" || e.key === " ") return;
    }
    capsHint.hidden = !e.getModifierState?.("CapsLock");
    const t = e.timeStamp > 0 ? e.timeStamp : performance.now();
    if (e.key === "Escape") {
      e.preventDefault();
      endEarly();
    } else if (e.key === "Backspace") {
      e.preventDefault();
      handle({ kind: "backspace", t });
    } else if (e.key.length === 1) {
      e.preventDefault();
      handle({ kind: "char", char: e.key, t });
    }
  };
  window.addEventListener("keydown", onKey);
  const onResize = () => view.scroll();
  window.addEventListener("resize", onResize);
  requestAnimationFrame(() => view.scroll());

  return {
    el,
    focus: main.querySelector("h1") as HTMLElement,
    dispose: () => {
      finished = true;
      window.clearInterval(ticker);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    },
  };
}

function clock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

