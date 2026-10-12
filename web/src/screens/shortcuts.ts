import {
  comboFor,
  completeShortcutDrill,
  formatCombo,
  planShortcutDrill,
  recordShortcut,
  Rng,
  sameCombo,
  SHORTCUT_DRILL_LENGTH,
  shortcutDrillSeed,
  type Combo,
  type ModifierKey,
  type Shortcut,
} from "../../../engine/src";
import type { App, ScreenView } from "../app";
import { topBar } from "../components/topBar";
import { textEditingShortcuts } from "../content";
import { formatPercent, h } from "../dom";
import { currentOs } from "../platform";

const MODIFIER_KEYS = new Set(["Meta", "Control", "Alt", "Shift", "CapsLock", "OS", "AltGraph", "Fn"]);
const REVEAL_AFTER_MS = 4000;

interface Answer {
  shortcut: Shortcut;
  firstTry: boolean;
  ms: number;
}

/** The text-editing shortcut drill. Physical keyboards only. */
export function shortcutsScreen(app: App): ScreenView {
  const settings = app.data.settings;
  const state = app.profile;
  const mac = currentOs(settings) === "mac";
  const rng = new Rng(shortcutDrillSeed(state));
  const prompts = planShortcutDrill(state, textEditingShortcuts, SHORTCUT_DRILL_LENGTH, rng);
  const answers: Answer[] = [];

  let index = 0;
  let shownAt = 0;
  let firstTry = true;
  let building = settings.shortcutAnswer === "build";
  let revealTimer = 0;
  let busy = false;
  let done = false;

  const counter = h("p", { class: "drill-counter" });
  const prompt = h("p", { class: "drill-prompt" });
  const sub = h("p", { class: "drill-sub" });
  const feedback = h("p", { class: "drill-feedback", role: "status" });
  const builder = h("div", { class: "builder" });
  const switchButton = h("button", { type: "button", class: "text-button" });
  const card = h("div", { class: "drill-card" }, counter, prompt, sub, feedback, builder);

  const fullscreenButton = document.fullscreenEnabled
    ? h("button", { type: "button", class: "text-button", onclick: () => goFullscreen() }, "Go fullscreen to catch more shortcuts")
    : null;

  const body = h(
    "main",
    { class: "drill" },
    h("h1", { tabindex: "-1" }, "Shortcut drill"),
    h("p", { class: "lead" }, `${textEditingShortcuts.name}. ${building ? "Build each combo on screen." : `Press each shortcut. ${mac ? "⌘ is Command, ⌥ is Option." : ""}`}`),
    card,
    h("div", { class: "foot-actions" }, switchButton, fullscreenButton, h("button", { type: "button", class: "text-button", onclick: () => finish() }, "End drill", h("kbd", null, "Esc"))),
  );
  const el = h("div", { class: "screen" }, topBar(app, { back: () => app.go({ name: "practice" }), backLabel: "Practice" }), body);

  function current(): Shortcut {
    return prompts[index];
  }

  function show(): void {
    const sc = current();
    const combo = comboFor(sc, mac);
    counter.textContent = `${index + 1} of ${prompts.length} · ${sc.group}`;
    if (settings.shortcutStyle === "shown") {
      prompt.textContent = formatCombo(combo, mac);
      sub.textContent = sc.action;
    } else {
      prompt.textContent = sc.action;
      sub.textContent = "";
      window.clearTimeout(revealTimer);
      revealTimer = window.setTimeout(() => (sub.textContent = `It's ${formatCombo(combo, mac)}`), REVEAL_AFTER_MS);
    }
    feedback.textContent = "";
    card.classList.remove("good", "bad");
    firstTry = true;
    shownAt = performance.now();
    renderBuilder();
  }

  function renderBuilder(): void {
    switchButton.textContent = building ? "Press keys instead" : "Can't press this one? Build it instead";
    switchButton.onclick = () => {
      building = !building;
      renderBuilder();
    };
    if (!building) {
      builder.replaceChildren();
      builder.hidden = true;
      return;
    }
    builder.hidden = false;
    const target = comboFor(current(), mac);
    const chosen = new Set<ModifierKey>();
    const modOrder: ModifierKey[] = mac ? ["ctrl", "alt", "shift", "meta"] : ["ctrl", "alt", "shift"];
    const modLabel: Record<ModifierKey, string> = mac
      ? { ctrl: "⌃ Control", alt: "⌥ Option", shift: "⇧ Shift", meta: "⌘ Command" }
      : { ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Win" };
    const mods = modOrder.map((m) => {
      const b = h("button", { type: "button", class: "chip-toggle", "aria-pressed": "false" }, modLabel[m]);
      b.addEventListener("click", () => {
        if (chosen.has(m)) chosen.delete(m);
        else chosen.add(m);
        b.setAttribute("aria-pressed", String(chosen.has(m)));
      });
      return b;
    });
    // The right key plus five others from the pack, in a seeded shuffle.
    const pool = [...new Set(textEditingShortcuts.shortcuts.map((s) => comboFor(s, mac).key))].filter((k) => k !== target.key);
    const keys = [target.key];
    while (keys.length < 6 && pool.length > 0) keys.push(pool.splice(rng.int(pool.length), 1)[0]);
    for (let i = keys.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    const keyButtons = keys.map((k) =>
      h("button", { type: "button", class: "key-choice", onclick: () => attempt({ mods: [...chosen], key: k }) }, formatCombo({ mods: [], key: k }, mac)),
    );
    builder.replaceChildren(
      h("p", { class: "field-label" }, "1. Choose the modifier keys"),
      h("div", { class: "chip-row" }, mods),
      h("p", { class: "field-label" }, "2. Choose the key"),
      h("div", { class: "chip-row" }, keyButtons),
    );
  }

  function attempt(combo: Combo): void {
    if (busy || done) return;
    const sc = current();
    const target = comboFor(sc, mac);
    if (sameCombo(combo, target)) {
      busy = true;
      const ms = performance.now() - shownAt;
      answers.push({ shortcut: sc, firstTry, ms });
      recordShortcut(state, sc.id, firstTry, ms);
      card.classList.remove("bad");
      card.classList.add("good");
      feedback.textContent = firstTry ? "Correct." : "Correct, on a later try.";
      window.setTimeout(() => {
        busy = false;
        index += 1;
        if (index >= prompts.length) finish();
        else show();
      }, 350);
    } else {
      firstTry = false;
      card.classList.remove("good");
      card.classList.add("bad");
      feedback.textContent = `That was ${formatCombo(combo, mac)}. It's ${formatCombo(target, mac)}.`;
    }
  }

  const onKey = (e: KeyboardEvent) => {
    if (done) return;
    if (e.key === "Escape") {
      e.preventDefault();
      finish();
      return;
    }
    if (building || MODIFIER_KEYS.has(e.key)) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.("button") && (e.key === "Enter" || e.key === " ") && !e.metaKey && !e.ctrlKey && !e.altKey) return;
    e.preventDefault();
    const mods: ModifierKey[] = [];
    if (e.metaKey) mods.push("meta");
    if (e.ctrlKey) mods.push("ctrl");
    if (e.altKey) mods.push("alt");
    if (e.shiftKey) mods.push("shift");
    const key = e.code.startsWith("Key") ? e.code.slice(3).toLowerCase() : e.code.startsWith("Digit") ? e.code.slice(5) : e.key;
    attempt({ mods, key });
  };
  window.addEventListener("keydown", onKey);

  async function goFullscreen(): Promise<void> {
    try {
      await document.documentElement.requestFullscreen();
      const kb = (navigator as Navigator & { keyboard?: { lock?: () => Promise<void> } }).keyboard;
      await kb?.lock?.();
      feedback.textContent = kb?.lock ? "Fullscreen with keyboard lock: more shortcuts reach the drill." : "Fullscreen. This browser can't lock the keyboard, so build any shortcut it blocks.";
    } catch {
      feedback.textContent = "Fullscreen isn't available here. Build any shortcut your browser blocks.";
    }
  }

  function finish(): void {
    if (done) return;
    done = true;
    window.clearTimeout(revealTimer);
    window.removeEventListener("keydown", onKey);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    if (answers.length === 0) {
      app.go({ name: "practice" });
      return;
    }
    completeShortcutDrill(state);
    app.persist();
    const first = answers.filter((a) => a.firstTry).length / answers.length;
    const avg = answers.reduce((sum, a) => sum + a.ms, 0) / answers.length;
    const slowest = [...answers].sort((a, b) => b.ms - a.ms).slice(0, 3);
    body.replaceChildren(
      h("h1", { tabindex: "-1" }, "Drill done"),
      h(
        "section",
        { class: "headline" },
        h("div", { class: "big-stat" }, h("p", { class: "big-label" }, "Right first time"), h("p", { class: "big-value" }, formatPercent(first))),
        h("div", { class: "big-stat" }, h("p", { class: "big-label" }, "Average time"), h("p", { class: "big-value" }, (avg / 1000).toFixed(1), h("small", null, " s"))),
      ),
      h(
        "section",
        { class: "panel" },
        h("h2", null, "Slowest this time"),
        h(
          "ul",
          { class: "target-list" },
          slowest.map((a) =>
            h("li", { class: "target" }, h("span", { class: "target-name wide" }, formatCombo(comboFor(a.shortcut, mac), mac)), h("span", null, `${a.shortcut.action}: ${(a.ms / 1000).toFixed(1)} s${a.firstTry ? "" : ", not right first time"}`)),
          ),
        ),
        h("p", { class: "fine" }, "Slow and missed shortcuts come back more often next time."),
      ),
      h(
        "div",
        { class: "actions" },
        h("button", { type: "button", class: "button primary", onclick: () => app.go({ name: "shortcuts" }) }, "Drill again"),
        h("button", { type: "button", class: "button", onclick: () => app.go({ name: "practice" }) }, "Back to practice"),
      ),
    );
    (body.querySelector("h1") as HTMLElement).focus();
  }

  show();
  return {
    el,
    dispose: () => {
      done = true;
      window.clearTimeout(revealTimer);
      window.removeEventListener("keydown", onKey);
    },
  };
}
