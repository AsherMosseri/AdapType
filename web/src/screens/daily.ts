import {
  completeDaily,
  dailyShareText,
  dailyStreak,
  dailyText,
  makeReplay,
  saveReplay,
  TypingRound,
  updateCreatures,
  type DailyResult,
  type TypingEvent,
} from "../../../engine/src";
import type { App, ScreenView } from "../app";
import { topBar } from "../components/topBar";
import { touchKeyboard } from "../components/touchKeyboard";
import { TypingView } from "../components/typingView";
import { blocklist, characters, pack } from "../content";
import { formatPercent, h } from "../dom";
import { announce, wordAt } from "../announce";
import { scrollBehavior } from "../appearance";
import { attachPhysicalInput } from "../physicalInput";
import { playSound } from "../sound";
import { keystrokeFeedback } from "../typingFeedback";
import { currentTouchLayout } from "../platform";

/** Today's date where the player is, as YYYY-MM-DD. */
export function localDate(at = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

const SQUARE_CLASS: Record<string, string> = { g: "clean", y: "fixed", r: "wrong" };

/** The word squares, as a row a screen reader can read as a sentence. */
function markRow(marks: string): HTMLElement {
  const clean = [...marks].filter((m) => m === "g").length;
  const fixed = [...marks].filter((m) => m === "y").length;
  const wrong = [...marks].filter((m) => m === "r").length;
  return h(
    "div",
    { class: "mark-row", role: "img", "aria-label": `${clean} words clean, ${fixed} fixed, ${wrong} left wrong` },
    [...marks].map((m) => h("span", { class: `mark ${SQUARE_CLASS[m] ?? ""}` })),
  );
}

/**
 * The daily challenge: the same text for everyone today, built from the
 * date. Your first attempt is scored; later ones are practice.
 */
export function dailyScreen(app: App): ScreenView {
  const state = app.profile;
  const settings = app.data.settings;
  const touch = settings.activeProfile === "touch";
  const date = localDate();
  const text = dailyText(date, pack, blocklist);
  const done: DailyResult | undefined = state.daily[date];
  const prettyDate = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const round = new TypingRound(text, settings.errorMode);
  const view = new TypingView(text.split(" ").map((w) => ({ text: w, madeUp: false })));
  const inputEvents: TypingEvent[] = [];
  let startedAt: number | null = null;
  let finished = false;
  let ticker = 0;

  const wpmValue = h("span", { class: "stat-value" }, "0");
  const accValue = h("span", { class: "stat-value" }, "100%");
  const stats = h(
    "dl",
    { class: "live-stats" },
    h("div", null, h("dt", null, "WPM"), h("dd", null, wpmValue)),
    h("div", null, h("dt", null, "Accuracy"), h("dd", null, accValue)),
  );
  const startHint = h("p", { class: "start-hint" }, touch ? "Tap the keys below to start" : "Start typing to begin");
  const streak = dailyStreak(state, date);

  const intro = done
    ? h(
        "div",
        { class: "notice" },
        h("p", null, h("strong", null, "You've played today. "), `Your score: ${Math.round(done.wpm)} WPM, ${formatPercent(done.accuracy)}. This try is practice and won't change it.`),
      )
    : h(
        "p",
        { class: "notice" },
        h("strong", null, "Everyone gets this text today. "),
        "It uses every letter, capitals and punctuation, whatever you've unlocked, so results compare. Your first try is the one that counts.",
      );

  const resultArea = h("div", { class: "daily-result", "aria-live": "polite" });

  const physical = touch
    ? null
    : attachPhysicalInput({
        onEvent: (e) => handle(e),
        onEscape: () => app.go({ name: "practice" }),
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
    { class: "practice daily" },
    h("h1", { tabindex: "-1" }, "Daily challenge"),
    h("p", { class: "daily-date" }, prettyDate, streak > 0 ? h("span", { class: "streak" }, ` · ${streak}-day streak`) : null),
    intro,
    h("div", { class: "typing-wrap" }, view.el, startHint),
    h("p", { class: "sr-only" }, `Type: ${text}`),
    physical?.el,
    h("div", { class: "practice-foot" }, stats),
    resultArea,
  );
  const el = h(
    "div",
    { class: `screen practice-screen daily-screen${touch ? " touch" : ""}` },
    topBar(app, { back: () => app.go({ name: "practice" }), backLabel: "Practice" }),
    main,
    keyboard,
  );
  if (physical) main.addEventListener("pointerup", (e) => !(e.target as HTMLElement).closest("button, a") && physical.focus());

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
    inputEvents.push({ kind: event.kind, char: event.char, t: event.t });
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
    const { scored, result, streak: newStreak } = completeDaily(state, date, round, now, { chars: characters, pack });
    if (inputEvents.length >= 2) saveReplay(state, makeReplay(round.target, round.mode, inputEvents, now, "daily"));
    const grown = updateCreatures(state, now, characters);
    playSound("success");
    announce(`Done. ${Math.round(result.wpm)} words per minute, ${formatPercent(result.accuracy)} accuracy.${scored ? " This is today's score." : " Practice try; today's score stays."}`);
    app.persist();
    keyboard?.remove();
    el.classList.remove("touch");

    const shown = scored ? result : state.daily[date];
    const share = dailyShareText(date, shown, newStreak);
    const status = h("p", { class: "fine", role: "status" });
    const shareButton = h(
      "button",
      {
        type: "button",
        class: "button primary",
        onclick: async () => {
          try {
            if (navigator.share && touch) await navigator.share({ text: share });
            else {
              await navigator.clipboard.writeText(share);
              status.textContent = "Copied. Paste it anywhere.";
            }
          } catch {
            status.textContent = "Couldn't share. Select the text below and copy it.";
          }
        },
      },
      touch && "share" in navigator ? "Share result" : "Copy result",
    );
    resultArea.replaceChildren(
      h(
        "section",
        { class: "panel" },
        h("h2", null, scored ? "Today's result" : "Practice try"),
        h(
          "p",
          { class: "daily-score" },
          h("span", { class: "num" }, `${Math.round(result.wpm)} WPM`),
          " · ",
          h("span", { class: "num" }, formatPercent(result.accuracy)),
        ),
        scored
          ? h("p", null, newStreak > 1 ? `That's a ${newStreak}-day streak. Come back tomorrow for a new text.` : "Come back tomorrow for a new text and start a streak.")
          : h("p", null, `Your scored try today was ${Math.round(shown.wpm)} WPM, ${formatPercent(shown.accuracy)}.`),
        markRow(result.marks),
        h("p", { class: "fine" }, "One square per word: green clean, yellow fixed, red left wrong."),
        grown.length ? h("p", null, `Creatures evolved: ${grown.map((c) => c.key).join(" ")}.`) : null,
        h("pre", { class: "share-text" }, share),
        h(
          "div",
          { class: "actions wrap" },
          shareButton,
          h("button", { type: "button", class: "button", onclick: () => app.go({ name: "replay", list: "recent", index: state.replays.recent.length - 1, returnTo: { name: "daily" } }) }, "Watch replay"),
          h("button", { type: "button", class: "button", onclick: () => app.go({ name: "practice" }) }, "Practice"),
        ),
        status,
      ),
    );
    requestAnimationFrame(() => {
      resultArea.scrollIntoView({ block: "start", behavior: scrollBehavior() });
      shareButton.focus({ preventScroll: true });
    });
  }

  announce(`Ready. First word: ${wordAt(round.target, 0)}.`);
  const onResize = () => view.scroll();
  window.addEventListener("resize", onResize);
  requestAnimationFrame(() => view.scroll());

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
