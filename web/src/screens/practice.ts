import {
  beginSession,
  completeRound,
  DEFAULT_GOAL,
  drift,
  isCalibrating,
  shouldWarmUp,
  WARMUP_SECONDS,
  isOn,
  planRound,
  SILENT_CALIBRATION_ROUNDS,
  type RoundType,
  type RoundWord,
  type TypingEvent,
  makeReplay,
  saveReplay,
  updateCreatures,
  updateNemesis,
} from "../../../engine/src";
import { TypingRound } from "../../../engine/src/typing";
import type { App, Screen, ScreenView } from "../app";
import { letterStrip } from "../components/letters";
import { topBar } from "../components/topBar";
import { touchKeyboard } from "../components/touchKeyboard";
import { TypingView } from "../components/typingView";
import { blocklist, characters, nemesisContent, pack } from "../content";
import { formatPercent, h } from "../dom";
import { list, roundBanner } from "../explainText";
import { announce, wordAt } from "../announce";
import { attachPhysicalInput } from "../physicalInput";
import { playSound } from "../sound";
import { keystrokeFeedback } from "../typingFeedback";
import { practicePack } from "../wordPacks";
import { localDate } from "./daily";
import { currentTouchLayout, physicalHint, platformFor, touchHint } from "../platform";

const CHUNK = 30;
const CALIBRATION_SECONDS = 60;

/** The practice round, also used for the 1-minute calibration test. */
export function practiceScreen(app: App, screen: Screen): ScreenView {
  const calibrationTest = screen.name === "calibration";
  const state = app.profile;
  const settings = app.data.settings;
  const silent = isCalibrating(state);
  const touch = settings.activeProfile === "touch";
  const now = Date.now();
  if (!calibrationTest) {
    beginSession(state, now);
    app.persist();
  }
  if (touch && !calibrationTest && !silent && state.session && !state.session.grip) return gripPicker(app);
  const warmup =
    !calibrationTest && !silent && settings.warmup && screen.name === "practice" && !screen.skipWarmup && shouldWarmUp(state, now);
  const roundType: RoundType = calibrationTest
    ? { kind: "timed", seconds: CALIBRATION_SECONDS }
    : warmup
      ? { kind: "timed", seconds: WARMUP_SECONDS }
      : settings.round;
  const touchLayout = currentTouchLayout(settings);
  const modifiers = { settings: settings.modifiers, chars: characters, platform: platformFor(app) };
  const words = practicePack(app);

  let chunk = 0;
  const plan = planRound(state, {
    pack: words,
    blocklist,
    count: roundType.kind === "words" ? roundType.count : CHUNK,
    calibrationTest,
    modifiers,
    now,
    warmup,
    madeUpCap: settings.madeUpCap,
  });
  const firstWords = plan.words;
  let lastWord = firstWords[firstWords.length - 1]?.text ?? "";
  const round = new TypingRound(firstWords.map((w) => w.text).join(" "), settings.errorMode);
  const view = new TypingView(firstWords);
  const wordTotal = roundType.kind === "words" ? roundType.count : 0;

  let startedAt: number | null = null;
  /** Every keystroke, for the replay. */
  const inputEvents: TypingEvent[] = [];
  let finished = false;
  let ticker = 0;
  let beatTimer = 0;

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
  const dailyButton =
    !calibrationTest && !silent && !state.daily[localDate()]
      ? h("button", { type: "button", class: "text-button", onclick: () => app.go({ name: "daily" }) }, "Daily challenge")
      : null;
  const passagesButton =
    !calibrationTest && !silent ? h("button", { type: "button", class: "text-button", onclick: () => app.go({ name: "passages", kind: "code" }) }, "Code and quotes") : null;
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
  } else if (warmup && plan.explanation?.warmup) {
    const w = plan.explanation.warmup;
    notice = h(
      "div",
      { class: "notice warmup" },
      h("p", null, h("strong", null, `Warm-up, ${WARMUP_SECONDS} seconds. `), `Your trouble spots lately: ${list([...w.keys, ...w.pairs])}.`),
      h(
        "button",
        {
          type: "button",
          class: "text-button",
          onclick: () => {
            if (state.session) state.session.warmupDone = true;
            app.persist();
            app.go({ name: "practice", skipWarmup: true });
          },
        },
        "Skip warm-up",
      ),
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
        assist:
          settings.hitZones === "assist"
            ? (letter) => {
                const grip = state.session?.grip;
                const d = drift((grip && state.gripTaps[grip]?.[letter]) || state.taps[letter]);
                return d && d.taps >= 5 ? d : null;
              }
            : undefined,
      })
    : null;

  // Metronome: one beat per word at goal pace. Live pulse: a glow that steadies with even rhythm.
  const goalWpm = (state.goal ?? DEFAULT_GOAL).wpm;
  const metronome =
    settings.metronome && !calibrationTest
      ? h(
          "p",
          { class: "metronome" },
          h("span", { class: "beat", "aria-hidden": "true" }),
          `Metronome: one beat per word at ${goalWpm} WPM${settings.sound.on ? ", out loud" : ""}`,
        )
      : null;
  metronome?.style.setProperty("--beat", `${Math.round(60000 / goalWpm)}ms`);

  const main = h(
    "main",
    { class: "practice" },
    h("h1", { class: "sr-only", tabindex: "-1" }, calibrationTest ? "Calibration test" : "Practice"),
    calibrationTest || silent ? null : letterStrip(state, settings.modifiers),
    notice,
    h("div", { class: settings.livePulse && !calibrationTest ? "typing-wrap pulse" : "typing-wrap" }, view.el, startHint, capsHint, charHint),
    metronome,
    firstWords.some((w) => w.madeUp)
      ? h("p", { class: "fine" }, "Words with a dotted underline are made-up practice words, used while only a few letters are unlocked.")
      : null,
    srText,
    physical?.el,
    h("div", { class: "practice-foot" }, stats, h("div", { class: "foot-actions" }, dailyButton, passagesButton, drillButton, endButton)),
  );
  const el = h(
    "div",
    { class: touch ? "screen practice-screen touch" : "screen practice-screen" },
    topBar(app, { returnTo: calibrationTest ? undefined : { name: "practice" } }),
    main,
    keyboard,
  );
  const wrapEl = main.querySelector<HTMLElement>(".typing-wrap");
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

  /** Steadiness of the last 12 clean intervals: 1 - (standard deviation / mean). */
  function refreshPulse(): void {
    const recent: number[] = [];
    for (let i = round.records.length - 1; i >= 0 && recent.length < 12; i--) {
      const ms = round.records[i].interval;
      if (ms !== null) recent.push(ms);
    }
    if (recent.length < 5) return;
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    const sd = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length);
    const steady = Math.max(0, Math.min(1, 1 - sd / mean));
    wrapEl?.style.setProperty("--steady", steady.toFixed(2));
  }

  function addMore(): void {
    chunk += 1;
    const more: RoundWord[] = planRound(state, {
      pack: words,
      blocklist,
      count: CHUNK,
      chunk,
      previous: lastWord,
      calibrationTest,
      modifiers,
      now,
      warmup,
      madeUpCap: settings.madeUpCap,
    }).words;
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
      if (metronome) beatTimer = window.setInterval(() => playSound("beat"), Math.round(60000 / goalWpm));
    }
    const before = round.position;
    const record = round.input(event);
    inputEvents.push({ kind: event.kind, char: event.char, t: event.t });
    keystrokeFeedback(round, record, before);
    view.update(round);
    refreshHint();
    if (settings.livePulse) refreshPulse();
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
    window.clearInterval(beatTimer);
    const metrics = round.metrics();
    const outcome = completeRound(state, round, Date.now(), { calibrationTest, chars: characters, pack, warmup });
    const nemesisChange = calibrationTest || silent ? null : updateNemesis(state, Date.now(), nemesisContent);
    const creatureChanges = updateCreatures(state, Date.now(), characters);
    const keepReplay = !calibrationTest && !silent && inputEvents.length >= 2;
    const replayRank = keepReplay ? saveReplay(state, makeReplay(round.target, settings.errorMode, inputEvents, Date.now(), "practice")) : null;
    app.persist();
    if (calibrationTest) app.go({ name: "goal", measuredWpm: metrics.wpm, from: "test" });
    else app.go({ name: "results", outcome, metrics, calibrationTest, explanation: plan.explanation, warmup, records: round.records, nemesisChange, creatureChanges, replayRank, replay: keepReplay });
  }

  const onResize = () => view.scroll();
  window.addEventListener("resize", onResize);
  requestAnimationFrame(() => {
    view.scroll();
    refreshHint();
  });
  announce(`Ready. First word: ${wordAt(round.target, 0)}.`);

  return {
    el,
    focus: physical?.el ?? (main.querySelector("h1") as HTMLElement),
    dispose: () => {
      finished = true;
      window.clearInterval(ticker);
      window.clearInterval(beatTimer);
      physical?.dispose();
      window.removeEventListener("resize", onResize);
    },
  };
}

/** Touch: how are you holding your phone? Asked once per session; stats are kept per grip. */
function gripPicker(app: App): ScreenView {
  const choose = (grip: "one" | "two") => {
    const session = app.profile.session;
    if (session) session.grip = grip;
    app.persist();
    app.go({ name: "practice" });
  };
  const el = h(
    "div",
    { class: "screen" },
    topBar(app, { returnTo: { name: "practice" } }),
    h(
      "main",
      { class: "grip" },
      h("h1", { tabindex: "-1" }, "How are you holding your phone?"),
      h("p", { class: "lead" }, "AdapType keeps separate stats for each grip, so your thumbs and tap drift are measured fairly."),
      h(
        "div",
        { class: "choices" },
        h("button", { type: "button", class: "choice", onclick: () => choose("two") }, h("span", { class: "choice-text" }, h("strong", null, "Two thumbs"), h("span", null, "Holding the phone in both hands."))),
        h("button", { type: "button", class: "choice", onclick: () => choose("one") }, h("span", { class: "choice-text" }, h("strong", null, "One thumb"), h("span", null, "Typing with one hand."))),
      ),
      h("p", { class: "fine" }, "AdapType asks at the start of each session, and suggests switching if your taps look like the other grip."),
    ),
  );
  return { el };
}

function clock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
