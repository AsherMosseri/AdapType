import {
  completeSpelling,
  deriveSeed,
  pickSpelling,
  planRound,
  Rng,
  SpellingSession,
  type SpellingCheck,
  type SpellingSource,
} from "../../../engine/src";
import { earn, newBadgesPanel } from "../achievements";
import { announce } from "../announce";
import type { App, Screen, ScreenView } from "../app";
import { topBar } from "../components/topBar";
import { touchKeyboard } from "../components/touchKeyboard";
import { blocklist, spelling } from "../content";
import { h, icon, ICONS } from "../dom";
import { currentTouchLayout } from "../platform";
import { playSound } from "../sound";
import { speak, stopSpeaking, voicesReady } from "../speech";
import { practicePack } from "../wordPacks";
import { radioGroup } from "./settings";

/** A right answer moves on by itself after this long. */
const RIGHT_PAUSE_MS = 900;

const SOURCES: { id: SpellingSource; label: string; hint: string }[] = [
  { id: "weak", label: "Your weak words", hint: "Words full of the keys you're working on, so listening trains your fingers too." },
  { id: "tricky", label: "Tricky spellings", hint: "Words people often get wrong, like necessary and rhythm." },
  { id: "sentences", label: "Sentences", hint: "Short sentences read aloud, for dictation. Punctuation and capitals don't count." },
  { id: "own", label: "Your own words", hint: "Words from the packs you made in Your words." },
];

/** Words of your custom packs, most used first. */
function ownWords(app: App): string[] {
  return app.data.customPacks.flatMap((p) => p.words.map(([w]) => w));
}

/** Spelling by ear: pick where the words come from, then start. */
export function spellingScreen(app: App): ScreenView {
  const settings = app.data.settings;
  const state = app.profile;
  const error = h("p", { class: "status error", role: "alert" });
  const voiceNote = h("div", { "aria-live": "polite" });
  const start = h(
    "button",
    {
      type: "button",
      class: "button primary",
      onclick: () => {
        if (settings.spellingSource === "own" && ownWords(app).length === 0) {
          error.textContent = "You don't have any word packs yet. Make one in Your words first.";
          return;
        }
        app.go({ name: "spelling-round", source: settings.spellingSource });
      },
    },
    icon([...ICONS.speaker]),
    "Start",
  ) as HTMLButtonElement;
  void voicesReady().then((voices) => {
    if (voices.length > 0) return;
    start.disabled = true;
    voiceNote.replaceChildren(
      h("div", { class: "callout" }, h("p", null, "This device has no voice for reading aloud, so spelling by ear can't play here. Most phones and computers have one built in; it may need turning on in the device's accessibility or speech settings.")),
    );
  });
  const missed = state.spelling.missed.length;
  const main = h(
    "main",
    { class: "spelling" },
    h("h1", { tabindex: "-1" }, "Spelling by ear"),
    h("p", { class: "lead" }, "Hear a word, then type it. Words you miss come back until you've got them."),
    voiceNote,
    h(
      "section",
      { class: "panel" },
      h("h2", null, "Words"),
      radioGroup("spelling-source", "Words", SOURCES.map((s) => (s.id === "own" && ownWords(app).length === 0 ? { ...s, hint: "Make a pack in Your words first." } : s)), settings.spellingSource, (id) => {
        settings.spellingSource = id as SpellingSource;
        error.textContent = "";
        app.persist();
      }),
      missed > 0 ? h("p", { class: "fine" }, `${missed === 1 ? "One word" : `${missed} words`} you missed ${missed === 1 ? "is" : "are"} waiting; a few come back at the start of each round of words.`) : null,
      error,
      h("div", { class: "actions wrap" }, start, h("button", { type: "button", class: "button", onclick: () => app.go({ name: "settings", returnTo: { name: "spelling" } }) }, "Choose a voice")),
    ),
  );
  const el = h("div", { class: "screen" }, topBar(app, { back: () => app.go({ name: "practice" }), backLabel: "Practice", returnTo: { name: "spelling" } }), main);
  return { el };
}

/** A round of spelling by ear: listen, type, check; misses come back once at the end. */
export function spellingRoundScreen(app: App, screen: Screen): ScreenView {
  if (screen.name !== "spelling-round") throw new Error("spelling-round");
  const source = screen.source;
  const state = app.profile;
  const settings = app.data.settings;
  const touch = settings.activeProfile === "touch";
  const rng = new Rng(deriveSeed(state.seed, "spelling", source, state.spelling.sessions));
  const candidates =
    source === "weak"
      ? planRound(state, { pack: practicePack(app), blocklist, count: 30, now: Date.now(), madeUpCap: 0 })
          .words.filter((w) => !w.madeUp)
          .map((w) => w.text)
      : source === "own"
        ? ownWords(app)
        : [];
  const items = pickSpelling(state, spelling, source, candidates, rng);
  if (items.length === 0) {
    const main = h(
      "main",
      null,
      h("h1", { tabindex: "-1" }, "Spelling by ear"),
      h("div", { class: "callout" }, h("p", null, "None of these words can be asked by ear: they're too short, or they sound like other words. Try another set.")),
      h("div", { class: "actions" }, h("button", { type: "button", class: "button primary", onclick: () => app.go({ name: "spelling" }) }, "Choose words")),
    );
    return { el: h("div", { class: "screen" }, topBar(app, { back: () => app.go({ name: "spelling" }), backLabel: "Spelling" }), main) };
  }
  const session = new SpellingSession(items, source);
  const noun = session.kind === "word" ? "Word" : "Sentence";

  const progress = h("p", { class: "spell-progress" });
  const listen = h("button", { type: "button", class: "button primary", onclick: () => say(false) }, icon([...ICONS.speaker]), "Listen");
  const slower = h("button", { type: "button", class: "button", onclick: () => say(true) }, "Slower");
  const feedback = h("div", { class: "spell-feedback", "aria-live": "polite" });
  const checkButton = h("button", { type: "button", class: "button", onclick: () => submit() }, "Check");
  const nextButton = h("button", { type: "button", class: "button primary", hidden: true, onclick: () => next() }, "Next", touch ? null : h("kbd", null, "Enter"));
  let typed = "";
  let phase: "answer" | "feedback" | "done" = "answer";
  let rightTimer = 0;

  // A real text field on a keyboard (spellcheck and autocorrect off); the app's own keyboard on touch, so nothing suggests the spelling.
  const input = touch
    ? null
    : (h("input", {
        type: "text",
        class: "spell-input",
        "aria-label": `Type the ${noun.toLowerCase()} you hear`,
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        spellcheck: "false",
        enterkeyhint: "done",
      }) as HTMLInputElement);
  const display = touch ? h("div", { class: "spell-input spell-display", role: "textbox", "aria-label": `What you typed` }) : null;
  const showTyped = () => {
    if (display) display.replaceChildren(typed, h("span", { class: "spell-caret", "aria-hidden": "true" }));
  };
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (phase === "answer") submit();
      else if (phase === "feedback") next();
    } else if (e.key === "Escape") app.go({ name: "spelling" });
  });
  input?.addEventListener("input", () => {
    if (phase === "answer") typed = input.value;
  });
  const layout = currentTouchLayout(settings);
  const keyboard = touch
    ? touchKeyboard({
        layout: layout.layout,
        layoutName: layout.name,
        returnKey: true,
        onChar: (char) => {
          if (char === "\n") {
            if (phase === "answer") submit();
            else if (phase === "feedback") next();
            return;
          }
          if (phase !== "answer") return;
          typed += char;
          showTyped();
        },
        onBackspace: () => {
          if (phase !== "answer") return;
          typed = [...typed].slice(0, -1).join("");
          showTyped();
        },
        isLocked: () => false,
      })
    : null;

  const main = h(
    "main",
    { class: "spelling-round" },
    h("h1", { tabindex: "-1" }, "Spelling by ear"),
    progress,
    h("div", { class: "actions wrap" }, listen, slower),
    input ?? display,
    h("p", { class: "fine spell-hint" }, touch ? "Tap return to check." : "Enter checks. Press Enter with nothing typed to hear it again."),
    h("div", { class: "actions wrap" }, checkButton, nextButton),
    feedback,
  );
  const el = h(
    "div",
    { class: `screen practice-screen spelling-screen${touch ? " touch" : ""}` },
    topBar(app, { back: () => app.go({ name: "spelling" }), backLabel: "Spelling" }),
    main,
    keyboard,
  );

  function say(slow: boolean): void {
    const item = session.current;
    if (item && !speak(item.text, settings, { slow })) feedback.replaceChildren(h("p", { class: "status error" }, "No voice to read it aloud. Choose one in Settings, under Sound."));
    input?.focus({ preventScroll: true });
  }

  /** Asks the current item: clears the answer and says it. */
  function ask(): void {
    phase = "answer";
    typed = "";
    if (input) {
      input.value = "";
      input.readOnly = false;
    }
    showTyped();
    const p = session.progress;
    progress.replaceChildren(
      h("strong", null, session.retrying ? `Second try` : `${noun} ${p.index + 1} of ${p.total}`),
      session.retrying ? h("span", { class: "fine" }, ` · ${noun.toLowerCase()}s you missed come back once`) : "",
    );
    feedback.replaceChildren();
    checkButton.hidden = false;
    nextButton.hidden = true;
    say(false);
  }

  function submit(): void {
    if (phase !== "answer") return;
    if (typed.trim() === "") return say(false);
    const item = session.current!;
    const first = !session.retrying;
    const check = session.answer(typed);
    phase = "feedback";
    if (input) input.readOnly = true;
    checkButton.hidden = true;
    nextButton.hidden = false;
    feedback.replaceChildren(...result(item.text, typed, check, first));
    if (check.correct) {
      playSound("success");
      announce("Right.");
      rightTimer = window.setTimeout(next, RIGHT_PAUSE_MS);
    } else {
      playSound("error");
      announce(`Not quite. It's spelled ${[...item.text].join(" ")}.`);
      nextButton.focus({ preventScroll: true });
      if (input) input.focus({ preventScroll: true });
    }
  }

  /** The answer, marked: missed letters (words) or missed words (sentences). */
  function result(text: string, answer: string, check: SpellingCheck, first: boolean): HTMLElement[] {
    if (check.correct) return [h("p", { class: "spell-right" }, "Right! ", h("span", { class: "spell-answer" }, text))];
    const marked =
      session.kind === "word"
        ? h("span", { class: "spell-answer" }, [...text].map((c, i) => h("span", { class: check.letters![i] ? "" : "missed" }, c)))
        : h("span", { class: "spell-answer sentence" }, check.words!.flatMap((w, i) => [i > 0 ? " " : "", h("span", { class: w.ok ? "" : "missed" }, w.word)]));
    const out: HTMLElement[] = [
      h("p", { class: "spell-wrong" }, "Not quite. It's spelled:"),
      h("p", null, marked),
      h("p", { class: "fine" }, "You typed: ", h("span", { class: "spell-typed" }, answer)),
    ];
    if (first) out.push(h("p", { class: "fine" }, `This ${noun.toLowerCase()} comes back once more at the end.`));
    return out;
  }

  function next(): void {
    window.clearTimeout(rightTimer);
    if (phase !== "feedback") return;
    if (session.done) finish();
    else ask();
  }

  function finish(): void {
    phase = "done";
    stopSpeaking();
    const outcome = completeSpelling(state, session);
    const badges = earn(app, { kind: "spelling", source, correct: outcome.correct, total: outcome.total });
    app.persist();
    keyboard?.remove();
    el.classList.remove("touch");
    const summary = `${outcome.correct} of ${outcome.total} right on the first try`;
    main.replaceChildren(
      h("h1", { tabindex: "-1" }, summary),
      outcome.missed.length
        ? h(
            "section",
            { class: "panel" },
            h("h2", null, session.kind === "word" ? "Words to work on" : "Sentences to work on"),
            h("ul", { class: "spell-missed" }, outcome.missed.map((t) => h("li", null, t))),
            session.kind === "word" ? h("p", { class: "fine" }, "They come back at the start of your next rounds of words until you spell them right.") : null,
          )
        : h("p", { class: "lead" }, outcome.correct === outcome.total ? "Every one right. Nice work!" : ""),
      outcome.learned.length ? h("p", null, `Off your list: ${outcome.learned.join(", ")}.`) : "",
      h(
        "div",
        { class: "actions wrap" },
        h("button", { type: "button", class: "button primary", onclick: () => app.go({ name: "spelling-round", source }) }, "Another round"),
        h("button", { type: "button", class: "button", onclick: () => app.go({ name: "spelling" }) }, "Choose words"),
        h("button", { type: "button", class: "button", onclick: () => app.go({ name: "practice" }) }, "Practice"),
      ),
      newBadgesPanel(app, badges) ?? "",
    );
    announce(`${summary}.`);
    (main.querySelector("h1") as HTMLElement).focus({ preventScroll: true });
  }

  // Said right away, while the Start tap still counts as a user gesture (some browsers only speak after one).
  ask();
  return {
    el,
    focus: input ?? listen,
    dispose: () => {
      window.clearTimeout(rightTimer);
      stopSpeaking();
    },
  };
}
