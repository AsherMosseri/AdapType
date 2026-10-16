import {
  completePassage,
  computeScores,
  DEFAULT_GOAL,
  deriveSeed,
  pickPassage,
  Rng,
  TypingRound,
  typedWords,
  updateCreatures,
  type Passage,
  type TypingEvent,
} from "../../../engine/src";
import { announce } from "../announce";
import { earn, newBadgesPanel } from "../achievements";
import type { App, Screen, ScreenView } from "../app";
import { scrollBehavior } from "../appearance";
import { topBar } from "../components/topBar";
import { touchKeyboard } from "../components/touchKeyboard";
import { characters, codeLanguages, codePassages, pack, quotePassages, type CodeLanguage } from "../content";
import { formatPercent, h } from "../dom";
import { attachPhysicalInput } from "../physicalInput";
import { currentTouchLayout } from "../platform";
import { playSound } from "../sound";
import { keystrokeFeedback } from "../typingFeedback";

/** Shows a passage character by character; newlines show as ↵ and break the line. */
class PassageView {
  readonly el: HTMLElement;
  private readonly chars: HTMLSpanElement[] = [];
  private last = 0;

  constructor(text: string) {
    this.el = h("div", { class: "passage-text", "aria-hidden": "true" });
    for (const ch of text) {
      const span = h("span", { class: ch === "\n" ? "ch newline" : ch === " " ? "ch space" : "ch" }, ch === "\n" ? "↵" : ch);
      this.chars.push(span);
      this.el.append(span);
      if (ch === "\n") this.el.append(h("br"));
    }
    this.chars[0]?.classList.add("current");
  }

  update(round: TypingRound): void {
    const pos = round.position;
    const from = Math.max(0, Math.min(pos, this.last) - 1);
    const to = Math.min(this.chars.length - 1, Math.max(pos, this.last) + 1);
    for (let i = from; i <= to; i++) {
      const typed = i < pos;
      this.chars[i].classList.toggle("ok", typed && round.isCorrectAt(i));
      this.chars[i].classList.toggle("bad", typed && !round.isCorrectAt(i));
      this.chars[i].classList.toggle("current", i === pos);
    }
    this.last = pos;
    this.chars[Math.min(pos, this.chars.length - 1)]?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
  }
}

/** Code snippets and public-domain quotes, typed whole, picked to lean on your weak keys. */
export function passagesScreen(app: App, screen: Screen): ScreenView {
  if (screen.name !== "passages") throw new Error("passages");
  const kind = screen.kind;
  const state = app.profile;
  const settings = app.data.settings;
  const touch = settings.activeProfile === "touch";
  const langs = settings.content.code.filter((l) => codeLanguages.some((c) => c.id === l)) as CodeLanguage[];
  const pool = kind === "code" ? codePassages(langs.length ? langs : ["javascript"]) : quotePassages;
  const scores = computeScores(state, state.goal ?? DEFAULT_GOAL, Date.now());
  const passage = pickPassage(state, pool, scores, new Rng(deriveSeed(state.seed, "passage", kind, state.recentPassages.join(","), langs.join(","))))!;
  const round = new TypingRound(passage.text, settings.errorMode, { autoIndent: kind === "code" });
  const view = new PassageView(passage.text);
  const inputEvents: TypingEvent[] = [];
  let startedAt: number | null = null;
  let finished = false;
  let ticker = 0;

  const wpmValue = h("span", { class: "stat-value" }, "0");
  const accValue = h("span", { class: "stat-value" }, "100%");
  const result = h("div", { class: "passage-result", "aria-live": "polite" });
  const startHint = h("p", { class: "start-hint" }, touch ? "Tap the keys below to start. Use return for new lines." : "Start typing to begin. Press Enter for new lines; indentation fills in by itself.");

  const tabs = h(
    "div",
    { class: "segmented", role: "radiogroup", "aria-label": "Passages" },
    (["code", "quotes"] as const).map((k) => {
      const input = h("input", { type: "radio", name: "passage-kind", id: `kind-${k}`, checked: k === kind });
      input.addEventListener("change", () => app.go({ name: "passages", kind: k }));
      return h("label", { for: `kind-${k}` }, input, h("span", null, k === "code" ? "Code" : "Quotes"));
    }),
  );
  const chipRow =
    kind === "code"
      ? h(
          "div",
          { class: "chip-row", role: "group", "aria-label": "Languages" },
          codeLanguages.map((l) => {
            const on = langs.includes(l.id);
            return h(
              "button",
              {
                type: "button",
                class: "chip-toggle",
                "aria-pressed": String(on),
                onclick: () => {
                  const next = on ? langs.filter((x) => x !== l.id) : [...langs, l.id];
                  if (next.length === 0) return;
                  settings.content.code = next;
                  app.persist();
                  app.go({ name: "passages", kind });
                },
              },
              l.name,
            );
          }),
        )
      : null;
  // On phones the language list folds away so the passage stays in view.
  const langChips =
    chipRow && touch
      ? h("details", { class: "lang-picker" }, h("summary", null, `Languages: ${langs.length} of ${codeLanguages.length} on`), chipRow)
      : chipRow;

  const physical = touch
    ? null
    : attachPhysicalInput({
        enter: true,
        onEvent: (e) => {
          if (finished) {
            if (e.kind === "char" && e.char === "\n") next();
            return;
          }
          handle(e);
        },
        onEscape: () => app.go({ name: "practice" }),
        onCapsLock: () => undefined,
      });
  const layout = currentTouchLayout(settings);
  const keyboard = touch
    ? touchKeyboard({
        layout: layout.layout,
        layoutName: layout.name,
        returnKey: true,
        onChar: (char, tap, layer, t) => handle({ kind: "char", char, t, tap, layer: layer || undefined }),
        onBackspace: () => handle({ kind: "backspace", t: performance.now() }),
        isLocked: () => false,
      })
    : null;

  const main = h(
    "main",
    { class: "practice passages" },
    h("h1", { tabindex: "-1" }, kind === "code" ? "Code" : "Quotes"),
    h("div", { class: "passage-controls" }, tabs, langChips),
    h("div", { class: "typing-wrap" }, view.el, startHint),
    h("p", { class: "passage-credit fine" }, kind === "code" ? passage.credit ?? "" : `From ${passage.credit}`),
    h("p", { class: "sr-only" }, `Type: ${passage.text}`),
    physical?.el,
    h(
      "div",
      { class: "practice-foot" },
      h("dl", { class: "live-stats" }, h("div", null, h("dt", null, "WPM"), h("dd", null, wpmValue)), h("div", null, h("dt", null, "Accuracy"), h("dd", null, accValue))),
      h("div", { class: "foot-actions" }, h("button", { type: "button", class: "text-button", onclick: () => next() }, "Another one")),
    ),
    result,
  );
  const el = h("div", { class: `screen practice-screen passages-screen${touch ? " touch" : ""}` }, topBar(app, { back: () => app.go({ name: "practice" }), backLabel: "Practice" }), main, keyboard);
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
    const m = completePassage(state, passage as Passage, round, Date.now(), { chars: characters, pack });
    const grown = updateCreatures(state, Date.now(), characters);
    const badges = earn(app, { kind: "passage", wpm: m.wpm, accuracy: m.accuracy, chars: m.correctChars, durationMs: m.elapsedMs, consistency: null, words: typedWords(round) });
    app.persist();
    playSound("success");
    const summary = `${Math.round(m.wpm)} WPM, ${formatPercent(m.accuracy)} accuracy.`;
    announce(`Done. ${summary}`);
    const nextButton = h("button", { type: "button", class: "button primary", onclick: () => next() }, "Next", touch ? null : h("kbd", null, "Enter"));
    result.replaceChildren(
      h(
        "div",
        { class: "callout" },
        h("p", { class: "callout-title" }, summary),
        h("p", null, `It counts toward your key stats${grown.length ? `, and ${grown.map((c) => c.key).join(" ")} evolved` : ""}.`),
        h("div", { class: "actions wrap" }, nextButton),
      ),
      newBadgesPanel(app, badges) ?? "",
    );
    keyboard?.remove();
    nextButton.focus({ preventScroll: true });
  }

  function next(): void {
    app.go({ name: "passages", kind });
  }

  announce(`${kind === "code" ? "Code" : "Quote"}. First word: ${passage.text.split(/[\s]/)[0]}.`);
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
