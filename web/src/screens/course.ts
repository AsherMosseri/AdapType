import {
  completeCourseRound,
  courseKeyProgress,
  courseText,
  currentStep,
  deriveSeed,
  Rng,
  TypingRound,
  typedWords,
  updateCreatures,
  type CourseMode,
  type TypingEvent,
} from "../../../engine/src";
import { earn, newBadgesPanel } from "../achievements";
import { announce } from "../announce";
import type { App, Screen, ScreenView } from "../app";
import { topBar } from "../components/topBar";
import { touchKeyboard } from "../components/touchKeyboard";
import { characters, course, pack } from "../content";
import { formatPercent, h } from "../dom";
import { attachPhysicalInput } from "../physicalInput";
import { currentTouchLayout } from "../platform";
import { playSound } from "../sound";
import { keystrokeFeedback } from "../typingFeedback";
import { PassageView } from "./passages";

/** Shows a key the way it's typed; a space would be invisible, so name it. */
const keyLabel = (k: string) => (k === " " ? "space" : k);

/** The course overview: the step-by-step path with each key's progress, and the four drills. */
export function courseScreen(app: App): ScreenView {
  const state = app.profile;
  const touch = app.data.settings.activeProfile === "touch";
  const now = currentStep(state, course);
  const mastered = new Set(state.course.mastered);

  const steps = course.steps.map((step, i) => {
    const status = i < now ? "done" : i === now ? "current" : "locked";
    const keys = [...step.keys];
    const done = keys.filter((k) => mastered.has(k)).length;
    return h(
      "li",
      { class: `course-step ${status}` },
      h("span", { class: "course-step-num", "aria-hidden": "true" }, status === "done" ? "✓" : String(i + 1)),
      h(
        "div",
        { class: "course-step-body" },
        h("h3", null, step.name, h("span", { class: "fine" }, status === "done" ? " · done" : status === "current" ? ` · ${done} of ${keys.length} keys` : " · locked")),
        h(
          "ul",
          { class: "course-keys", "aria-label": `${step.name} keys` },
          keys.map((k) => {
            const p = mastered.has(k) ? 1 : courseKeyProgress(state, k);
            return h(
              "li",
              { class: `course-key${mastered.has(k) ? " mastered" : ""}`, title: mastered.has(k) ? "Mastered" : `${Math.round(p * 100)}% to mastery` },
              h("span", { class: "course-key-cap" }, keyLabel(k)),
              h("span", { class: "course-key-bar", "aria-hidden": "true" }, h("span", { style: { width: `${Math.round(p * 100)}%` } })),
              h("span", { class: "sr-only" }, mastered.has(k) ? "mastered" : `${Math.round(p * 100)}% to mastery`),
            );
          }),
        ),
        status === "locked"
          ? null
          : h(
              "div",
              { class: "actions" },
              h(
                "button",
                { type: "button", class: status === "current" ? "button primary" : "button", onclick: () => app.go({ name: "course-round", mode: { step: i } }) },
                status === "current" ? "Practice" : "Review",
              ),
            ),
      ),
    );
  });

  const drills = Object.entries(course.drills).map(([id, d]) =>
    h(
      "li",
      { class: "course-drill" },
      h("h3", null, d.name),
      h("p", { class: "fine" }, d.description),
      h("div", { class: "actions" }, h("button", { type: "button", class: "button", onclick: () => app.go({ name: "course-round", mode: { drill: id } }) }, "Start")),
    ),
  );

  const main = h(
    "main",
    { class: "course" },
    h("h1", { tabindex: "-1" }, "Numbers and symbols"),
    h(
      "p",
      { class: "lead" },
      state.course.finished
        ? "You've finished the path: every number and symbol key is mastered. Keep them sharp with the drills."
        : "Learn the number row and symbols a few keys at a time. A step is done when you type each of its keys fast and accurately over a few rounds, then the next one opens.",
    ),
    h("section", { class: "panel" }, h("h2", null, "The path"), h("ol", { class: "course-path" }, steps)),
    h(
      "section",
      { class: "panel" },
      h("h2", null, "Drills"),
      h("p", { class: "panel-lead" }, "Any time, in any order. They lean toward your weakest numbers and symbols, and count toward the path too."),
      h("ul", { class: "course-drills" }, drills),
    ),
    h(
      "p",
      { class: "fine" },
      touch
        ? "Numbers and symbols are on the 123 and #+= keys of the on-screen keyboard. Switching counts as part of typing them."
        : "Key stats are shared with practice, so a symbol that's slow here also comes up when that modifier is on in practice.",
    ),
  );
  const el = h("div", { class: "screen" }, topBar(app, { back: () => app.go({ name: "practice" }), backLabel: "Practice", returnTo: { name: "course" } }), main);
  return { el };
}

/** A course round: a path step or a drill, typed like a passage. */
export function courseRoundScreen(app: App, screen: Screen): ScreenView {
  if (screen.name !== "course-round") throw new Error("course-round");
  const mode: CourseMode = screen.mode;
  const state = app.profile;
  const settings = app.data.settings;
  const touch = settings.activeProfile === "touch";
  const step = "step" in mode ? course.steps[mode.step] : null;
  const drill = "drill" in mode ? course.drills[mode.drill] : null;
  const seed = deriveSeed(state.seed, "course", state.roundCounter, "step" in mode ? `step:${mode.step}` : `drill:${mode.drill}`);
  const text = courseText(state, course, pack, mode, new Rng(seed));
  const round = new TypingRound(text, settings.errorMode);
  const view = new PassageView(text);
  const inputEvents: TypingEvent[] = [];
  let startedAt: number | null = null;
  let finished = false;
  let ticker = 0;

  const wpmValue = h("span", { class: "stat-value" }, "0");
  const accValue = h("span", { class: "stat-value" }, "100%");
  const result = h("div", { class: "passage-result", "aria-live": "polite" });
  const startHint = h("p", { class: "start-hint" }, touch ? "Tap the keys below to start." : "Start typing to begin.");
  const focusKeys = step ? [...step.keys].filter((k) => !state.course.mastered.includes(k)) : [];

  const physical = touch
    ? null
    : attachPhysicalInput({
        onEvent: (e) => {
          if (finished) {
            if (e.kind === "char" && e.char === "\n") next();
            return;
          }
          handle(e);
        },
        onEscape: () => app.go({ name: "course" }),
        onCapsLock: () => undefined,
      });
  const layout = currentTouchLayout(settings);
  const keyboard = touch
    ? touchKeyboard({
        layout: layout.layout,
        layoutName: layout.name,
        onChar: (char, tap, layer, t) => handle({ kind: "char", char, t, tap, layer: layer || undefined }),
        onBackspace: () => handle({ kind: "backspace", t: performance.now() }),
        isLocked: () => false,
      })
    : null;

  const main = h(
    "main",
    { class: "practice passages course-round" },
    h("h1", { tabindex: "-1" }, step ? step.name : drill?.name ?? "Drill"),
    h(
      "p",
      { class: "notice" },
      step
        ? focusKeys.length
          ? h("span", null, h("strong", null, "Learning: "), focusKeys.map(keyLabel).join(" "))
          : h("span", null, h("strong", null, "Review. "), "Every key in this step is mastered.")
        : h("span", null, drill?.description ?? ""),
    ),
    h("div", { class: "typing-wrap" }, view.el, startHint),
    h("p", { class: "sr-only" }, `Type: ${text}`),
    physical?.el,
    h(
      "div",
      { class: "practice-foot" },
      h("dl", { class: "live-stats" }, h("div", null, h("dt", null, "WPM"), h("dd", null, wpmValue)), h("div", null, h("dt", null, "Accuracy"), h("dd", null, accValue))),
      h("div", { class: "foot-actions" }, h("button", { type: "button", class: "text-button", onclick: () => next() }, "New text")),
    ),
    result,
  );
  const el = h("div", { class: `screen practice-screen passages-screen${touch ? " touch" : ""}` }, topBar(app, { back: () => app.go({ name: "course" }), backLabel: "Course" }), main, keyboard);
  if (physical) main.addEventListener("pointerup", (e) => !(e.target as HTMLElement).closest("button, a, label") && physical.focus());

  function handle(event: TypingEvent): void {
    if (finished) return;
    if (startedAt === null) {
      if (event.kind === "backspace") return;
      startedAt = performance.now();
      startHint.hidden = true;
      el.classList.add("running");
      ticker = window.setInterval(refresh, 250);
    }
    const before = round.position;
    const record = round.input(event);
    inputEvents.push(event);
    keystrokeFeedback(round, record, before);
    view.update(round);
    if (round.done) finish();
  }

  function refresh(): void {
    const m = round.metrics();
    wpmValue.textContent = String(Math.round(m.wpm));
    accValue.textContent = formatPercent(m.accuracy);
  }

  function finish(): void {
    finished = true;
    window.clearInterval(ticker);
    refresh();
    const now = Date.now();
    const outcome = completeCourseRound(state, course, round, now, { chars: characters, pack });
    updateCreatures(state, now, characters);
    const m = outcome.metrics;
    const badges = earn(app, { kind: "course", wpm: m.wpm, accuracy: m.accuracy, chars: m.correctChars, durationMs: m.elapsedMs, consistency: null, words: typedWords(round) });
    app.persist();
    playSound(outcome.stepsFinished.length ? "levelUp" : "success");
    const summary = `${Math.round(m.wpm)} WPM, ${formatPercent(m.accuracy)} accuracy.`;
    const nextStep = currentStep(state, course);
    const lines: (HTMLElement | null)[] = [];
    if (outcome.newlyMastered.length) lines.push(h("p", null, `Mastered: ${outcome.newlyMastered.map(keyLabel).join(" ")}.`));
    if (outcome.finishedPath) lines.push(h("p", null, h("strong", null, "You finished the whole path! "), "Every number and symbol key is mastered."));
    else if (outcome.stepsFinished.length) {
      const names = course.steps.filter((s) => outcome.stepsFinished.includes(s.id)).map((s) => s.name);
      lines.push(h("p", null, h("strong", null, `Step done: ${names.join(", ")}. `), `Next up: ${course.steps[nextStep].name} (${[...course.steps[nextStep].keys].map(keyLabel).join(" ")}).`));
    } else if (step && focusKeys.length) {
      lines.push(h("p", { class: "fine" }, "Keys are mastered when they're fast and accurate over a few rounds."));
    }
    announce(`Done. ${summary}${outcome.newlyMastered.length ? ` Mastered ${outcome.newlyMastered.length} keys.` : ""}`);
    // After finishing a step, "Next" goes on to the new current step.
    const nextMode: CourseMode = step && outcome.stepsFinished.length && nextStep < course.steps.length ? { step: nextStep } : mode;
    const nextButton = h("button", { type: "button", class: "button primary", onclick: () => app.go({ name: "course-round", mode: nextMode }) }, nextMode === mode ? "Next round" : "Next step", touch ? null : h("kbd", null, "Enter"));
    result.replaceChildren(
      h(
        "div",
        { class: "callout" },
        h("p", { class: "callout-title" }, summary),
        ...lines.filter((l): l is HTMLElement => l !== null),
        h("div", { class: "actions wrap" }, nextButton, h("button", { type: "button", class: "button", onclick: () => app.go({ name: "course" }) }, "Back to the course")),
      ),
      newBadgesPanel(app, badges) ?? "",
    );
    keyboard?.remove();
    next = () => app.go({ name: "course-round", mode: nextMode });
    nextButton.focus({ preventScroll: true });
  }

  let next = () => app.go({ name: "course-round", mode });

  announce(`${step ? step.name : drill?.name}. First item: ${text.split(" ")[0]}.`);
  return {
    el,
    focus: physical?.el ?? (main.querySelector("h1") as HTMLElement),
    dispose: () => {
      finished = true;
      window.clearInterval(ticker);
      physical?.dispose();
    },
  };
}
