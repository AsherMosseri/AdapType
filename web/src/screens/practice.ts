import {
  completeRound,
  isCalibrating,
  isOn,
  planRound,
  SILENT_CALIBRATION_ROUNDS,
  type RoundType,
  type RoundWord,
  type TypingEvent,
} from "../../../engine/src";
import { TypingRound } from "../../../engine/src/typing";
import type { App, Screen, ScreenView } from "../app";
import { letterStrip } from "../components/letters";
import { topBar } from "../components/topBar";
import { touchKeyboard } from "../components/touchKeyboard";
import { TypingView } from "../components/typingView";
import { blocklist, characters, pack } from "../content";
import { formatPercent, h } from "../dom";
import { roundBanner } from "../explainText";
import { attachPhysicalInput } from "../physicalInput";
import { currentTouchLayout, physicalHint, platformFor, touchHint } from "../platform";

const CHUNK = 30;
const CALIBRATION_SECONDS = 60;

/** The practice round, also used for the 1-minute calibration test. */
export function practiceScreen(app: App, screen: Screen): ScreenView {
  const calibrationTest = screen.name === "calibration";
  const state = app.profile;
  const settings = app.data.settings;
  const silent = isCalibrating(state);
  const roundType: RoundType = calibrationTest ? { kind: "timed", seconds: CALIBRATION_SECONDS } : settings.round;
  const touch = settings.activeProfile === "touch";
  const touchLayout = currentTouchLayout(settings);
  const modifiers = { settings: settings.modifiers, chars: characters, platform: platformFor(app) };

  let chunk = 0;
  const plan = planRound(state, {
    pack,
    blocklist,
    count: roundType.kind === "words" ? roundType.count : CHUNK,
    calibrationTest,
    modifiers,
  });
  const firstWords = plan.words;
  let lastWord = firstWords[firstWords.length - 1]?.text ?? "";
  const round = new TypingRound(firstWords.map((w) => w.text).join(" "), settings.errorMode);
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
  const charHint = h("p", { class: "char-hint" });
  const endButton = h(
    "button",
    { type: "button", class: "text-button", onclick: () => endEarly() },
    roundType.kind === "endless" ? "Finish" : "End round",
    touch ? null : h("kbd", null, "Esc"),
  );
  const shortcutsOn = !touch && !calibrationTest && !silent && isOn("shortcuts", state, settings.modifiers);
  const drillButton = shortcutsOn
    ? h("button", { type: "button", class: "text-button", onclick: () => app.go({ name: "shortcuts" }) }, "Shortcut drill")
    : null;

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
  } else if (plan.explanation) {
    notice = h("p", { class: "notice explain" }, roundBanner(plan.explanation));
  }

  // Screen reader summary of the text, since the visual text is hidden from them.
  const srText = h("p", { class: "sr-only", "aria-live": "off" }, `Type: ${round.target}`);

  const physical = touch
    ? null
    : attachPhysicalInput({
        onEvent: (event) => handle(event),
        onEscape: () => endEarly(),
        onCapsLock: (on) => (capsHint.hidden = !on),
      });

  const keyboard = touch
    ? touchKeyboard({
        layout: touchLayout.layout,
        layoutName: touchLayout.name,
        onChar: (char, tap, layer, t) => handle({ kind: "char", char, t, tap, layer: layer || undefined }),
        onBackspace: () => handle({ kind: "backspace", t: performance.now() }),
        isLocked: (letter) => !calibrationTest && !silent && letter >= "a" && letter <= "z" && !state.unlocked.includes(letter),
      })
    : null;

  const main = h(
    "main",
    { class: "practice" },
    h("h1", { class: "sr-only", tabindex: "-1" }, calibrationTest ? "Calibration test" : "Practice"),
    calibrationTest || silent ? null : letterStrip(state, settings.modifiers),
    notice,
    h("div", { class: "typing-wrap" }, view.el, startHint, capsHint, charHint),
    firstWords.some((w) => w.madeUp)
      ? h("p", { class: "fine" }, "Words with a dotted underline are made-up practice words, used while only a few letters are unlocked.")
      : null,
    srText,
    physical?.el,
    h("div", { class: "practice-foot" }, stats, h("div", { class: "foot-actions" }, drillButton, endButton)),
  );
  const el = h(
    "div",
    { class: touch ? "screen practice-screen touch" : "screen practice-screen" },
    topBar(app, { returnTo: calibrationTest ? undefined : { name: "practice" } }),
    main,
    keyboard,
  );
  // Clicking anywhere on the practice area keeps typing going.
  if (physical) main.addEventListener("pointerup", () => physical.focus());

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

  function refreshHint(): void {
    const ch = round.target[round.position];
    const hint = ch === undefined ? null : touch ? touchHint(ch, touchLayout.layout, touchLayout.name) : physicalHint(ch, settings);
    charHint.replaceChildren();
    if (hint) charHint.append(h("span", { class: "hint-char" }, ch), hint);
    charHint.hidden = !hint;
  }

  function addMore(): void {
    chunk += 1;
    const more: RoundWord[] = planRound(state, { pack, blocklist, count: CHUNK, chunk, previous: lastWord, calibrationTest, modifiers }).words;
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
    refreshHint();
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
    const outcome = completeRound(state, round, Date.now(), { calibrationTest, chars: characters });
    app.persist();
    if (calibrationTest) app.go({ name: "goal", measuredWpm: metrics.wpm, from: "test" });
    else app.go({ name: "results", outcome, metrics, calibrationTest, explanation: plan.explanation });
  }

  const onResize = () => view.scroll();
  window.addEventListener("resize", onResize);
  requestAnimationFrame(() => {
    view.scroll();
    refreshHint();
  });

  return {
    el,
    focus: physical?.el ?? (main.querySelector("h1") as HTMLElement),
    dispose: () => {
      finished = true;
      window.clearInterval(ticker);
      physical?.dispose();
      window.removeEventListener("resize", onResize);
    },
  };
}

function clock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
