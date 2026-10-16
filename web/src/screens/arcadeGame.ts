import {
  ArcadeGame,
  COMBO_STEP,
  arcadeWordSource,
  completeArcadeGame,
  computeScores,
  DEFAULT_GOAL,
  deriveSeed,
  nemesisTaunt,
  Rng,
  START_LIVES,
  topWeakKeys,
  updateCreatures,
  updateNemesis,
  WEAK_KEYS_FOR_BONUS,
  type ArcadeEvent,
  type FallingWord,
  type PowerUpKind,
} from "../../../engine/src";
import type { App, Screen, ScreenView } from "../app";
import { nemesisFace } from "../components/nemesisFace";
import { earn } from "../achievements";
import { MENU_OPEN } from "../components/menu";
import { topBar } from "../components/topBar";
import { touchKeyboard } from "../components/touchKeyboard";
import { blocklist, characters, nemesisContent, nemesisContentFor, pack } from "../content";
import { formatPercent, h } from "../dom";
import { currentTone } from "../explainText";
import { announce } from "../announce";
import { attachPhysicalInput } from "../physicalInput";
import { playSound } from "../sound";
import { currentTouchLayout, platformFor } from "../platform";
import { practicePack } from "../wordPacks";
import { gameOverPanel } from "./arcadeResults";

const POWER_LABELS: Record<PowerUpKind, string> = { slow: "Slow time", clear: "Clear screen", shield: "Shield", double: "Double points" };

/** Falling words and survival. */
export function arcadeGameScreen(app: App, screen: Screen): ScreenView {
  if (screen.name !== "arcade-game") throw new Error("arcade game");
  const mode = screen.mode;
  const state = app.profile;
  const settings = app.data.settings;
  const touch = settings.activeProfile === "touch";
  const now = Date.now();
  const goal = state.goal ?? DEFAULT_GOAL;
  const scores = computeScores(state, goal, now);
  const nemesis = state.arcade.nemesis;
  const seed = deriveSeed(state.seed, "arcade", state.roundCounter);
  const source = arcadeWordSource(state, {
    pack: practicePack(app),
    blocklist,
    modifiers: { settings: settings.modifiers, chars: characters, platform: platformFor(app) },
    now,
    madeUpCap: settings.madeUpCap,
    rng: new Rng(deriveSeed(seed, "words")),
  });
  const game = new ArcadeGame(
    {
      mode,
      lives: mode === "survival" ? settings.arcadeLives : "lives",
      touch,
      weakKeys: topWeakKeys(state, scores, WEAK_KEYS_FOR_BONUS),
      nemesisKey: nemesis?.key ?? null,
    },
    source,
    new Rng(seed),
  );
  const tauntRng = new Rng(deriveSeed(seed, "taunts"));

  // HUD.
  const scoreEl = h("span", { class: "hud-value" }, "0");
  const levelEl = h("span", { class: "hud-value" }, "1");
  const comboEl = h("span", { class: "hud-value" }, "×1");
  const lifeEl = h("span", { class: "hud-value lives", "aria-live": "polite" });
  const effectsEl = h("div", { class: "effects", "aria-live": "polite" });
  const hud = h(
    "dl",
    { class: "hud" },
    h("div", null, h("dt", null, "Score"), h("dd", null, scoreEl)),
    h("div", null, h("dt", null, "Level"), h("dd", null, levelEl)),
    h("div", null, h("dt", null, "Combo"), h("dd", null, comboEl)),
    h("div", null, h("dt", null, game.config.lives === "health" ? "Health" : game.config.lives === "hardcore" ? "Hardcore" : "Lives"), h("dd", null, lifeEl)),
    effectsEl,
  );
  const bossName = h("span", { class: "boss-name" });
  const bossFill = h("span", { class: "boss-fill" });
  const bossTime = h("span", { class: "boss-time" });
  const bossBar = h("div", { class: "boss-bar", "aria-live": "polite" }, bossName, h("span", { class: "boss-hp" }, bossFill), bossTime);
  bossBar.hidden = true;

  // The words themselves are hidden from screen readers; the start and pause panels aren't.
  const area = h("div", { class: "play-area" });
  const toast = h("p", { class: "toast", role: "status" });
  const startButton = h("button", { type: "button", class: "button primary" }, "Start");
  const startPanel = h(
    "div",
    { class: "overlay" },
    h("p", { class: "overlay-title" }, mode === "falling" ? "Falling words" : "Survival"),
    h("p", null, touch ? "Tap a word's first letter to lock on, then type the rest." : "Type a word's first letter to lock on, then type the rest. Space starts, Esc ends the game."),
    startButton,
  );
  area.append(startPanel);

  const wordEls = new Map<number, HTMLElement>();
  let running = false;
  let last = 0;
  let raf = 0;
  let toastTimer = 0;
  let lastTaunt = -10;
  let finished = false;

  const showToast = (text: string, kind = "") => {
    toast.textContent = text;
    toast.className = `toast show ${kind}`;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast.className = "toast"), 1600);
  };

  const physical = touch
    ? null
    : attachPhysicalInput({
        onEvent: (e) => {
          if (!running) {
            if (e.kind === "char" && (e.char === " " || e.char === "\n")) start();
            return;
          }
          // Words have no spaces, so a habitual space after a word isn't a mistake.
          if (e.kind === "char" && e.char && e.char !== " ") handleEvents(game.input(e.char, e.t));
        },
        onEscape: () => (running ? endGame() : app.go({ name: "arcade" })),
        onCapsLock: () => undefined,
      });

  const landscape = touch && window.matchMedia("(orientation: landscape)").matches;
  const layout = currentTouchLayout(settings);
  const keyboard = touch
    ? touchKeyboard({
        layout: layout.layout,
        layoutName: layout.name,
        split: landscape,
        onChar: (char, _tap, _layer, t) => {
          if (!running || char === " ") return;
          handleEvents(game.input(char, t));
        },
        onBackspace: () => undefined,
        isLocked: () => false,
      })
    : null;

  const main = h("main", { class: "arcade-game" }, h("h1", { class: "sr-only", tabindex: "-1" }, mode === "falling" ? "Falling words" : "Survival"), hud, bossBar, area, toast, physical?.el);
  const el = h(
    "div",
    { class: `screen game-screen${touch ? " touch" : ""}${landscape ? " landscape" : ""}` },
    topBar(app, { back: () => endOrLeave(), backLabel: "Arcade" }),
    main,
    keyboard,
  );
  startButton.addEventListener("click", () => start());

  function start(): void {
    if (running || finished) return;
    running = true;
    startPanel.remove();
    area.querySelector(".overlay.paused")?.remove();
    last = performance.now();
    physical?.focus();
    raf = requestAnimationFrame(frame);
  }

  function frame(t: number): void {
    if (!running) return;
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    handleEvents(game.tick(dt));
    render();
    if (game.over) endGame();
    else raf = requestAnimationFrame(frame);
  }

  function handleEvents(events: ArcadeEvent[]): void {
    for (const e of events) {
      if (e.type === "correct") playSound("key");
      else if (e.type === "error") playSound("error");
      else if (e.type === "damage") playSound("error");
      else if (e.type === "cleared" && game.combo > 0 && game.combo % COMBO_STEP === 0) playSound("combo");
      else if (e.type === "powerUp") playSound("powerUp");
      else if (e.type === "levelUp") playSound("levelUp");
      else if (e.type === "bossHit") playSound("bossHit");
      else if (e.type === "bossDefeated") playSound("success");
      else if (e.type === "lock") {
        const w = game.words.find((x) => x.id === e.id);
        if (w) announce(w.text);
      }
      if (e.type === "powerUp") showToast(POWER_LABELS[e.kind], "power");
      else if (e.type === "levelUp") showToast(`Level ${e.level}`);
      else if (e.type === "bossStart") showToast(e.nemesis && nemesis ? `${nemesis.name} appears!` : "Boss round!", "boss");
      else if (e.type === "bossPhase2") showToast("Half health: faster, with capitals", "boss");
      else if (e.type === "bossDefeated") showToast(`Boss defeated! +${e.bonus}`, "power");
      else if (e.type === "bossEscaped") showToast("The boss got away", "bad");
      else if (e.type === "shieldUsed") showToast("Shield absorbed it");
      else if (e.type === "landed") flash();
      else if (e.type === "error" && nemesis && e.expected?.toLowerCase() === nemesis.key && game.time - lastTaunt > 4) {
        lastTaunt = game.time;
        showToast(nemesisTaunt(nemesis, nemesisContentFor(currentTone()), tauntRng), "bad");
      } else if (e.type === "cleared") {
        const w = wordEls.get(e.id);
        if (w) {
          const pop = h("span", { class: "points-pop", "aria-hidden": "true", style: `--x:${w.style.getPropertyValue("--x")};top:${w.style.top}` }, `+${e.points}`);
          area.append(pop);
          window.setTimeout(() => pop.remove(), 700);
        }
      }
    }
    render();
  }

  function flash(): void {
    area.classList.remove("hit");
    void area.offsetWidth;
    area.classList.add("hit");
  }

  function render(): void {
    scoreEl.textContent = game.score.toLocaleString();
    levelEl.textContent = String(game.level);
    comboEl.textContent = `×${game.comboMultiplier()}${game.combo ? ` (${game.combo})` : ""}`;
    if (game.config.lives === "health") lifeEl.replaceChildren(h("span", { class: "health" }, h("span", { style: { width: `${Math.round(game.health * 100)}%` } })));
    else if (game.config.lives === "hardcore") lifeEl.textContent = game.over ? "✕" : "1";
    else lifeEl.textContent = "♥".repeat(Math.max(0, game.lives)) + "♡".repeat(Math.max(0, START_LIVES - game.lives));
    const effects: string[] = [];
    if (game.slowed) effects.push("Slow");
    if (game.doubled) effects.push("Double");
    if (game.shield) effects.push("Shield");
    effectsEl.replaceChildren(...effects.map((e) => h("span", { class: "effect" }, e)));

    if (game.boss) {
      bossBar.hidden = false;
      const isNemesis = !!game.boss.nemesis && !!nemesis;
      bossName.replaceChildren(isNemesis ? nemesisFace(nemesis!, 28) : "", isNemesis ? nemesis!.name : "Boss");
      bossFill.style.width = `${Math.round((game.boss.hp / game.boss.maxHp) * 100)}%`;
      bossTime.textContent = `${Math.ceil(game.boss.timeLeft)}s`;
    } else bossBar.hidden = true;

    const height = area.clientHeight;
    const seen = new Set<number>();
    for (const w of game.words) {
      seen.add(w.id);
      let node = wordEls.get(w.id);
      if (!node) {
        node = h("span", { "aria-hidden": "true", class: `fw${w.powerUp ? " power" : ""}${w.boss ? " boss" : ""}${w.madeUp ? " made-up" : ""}` });
        if (w.powerUp) node.title = POWER_LABELS[w.powerUp];
        wordEls.set(w.id, node);
        area.append(node);
      }
      node.classList.toggle("locked", game.target === w.id);
      paintWord(node, w);
      node.style.setProperty("--x", w.x.toFixed(4));
      node.style.top = `${Math.round(w.y * Math.max(0, height - 36))}px`;
    }
    for (const [id, node] of wordEls) {
      if (!seen.has(id)) {
        node.remove();
        wordEls.delete(id);
      }
    }
  }

  function paintWord(node: HTMLElement, w: FallingWord): void {
    const key = `${w.typed}`;
    if (node.dataset.typed === key) return;
    node.dataset.typed = key;
    node.replaceChildren(h("span", { class: "done" }, w.text.slice(0, w.typed)), w.text.slice(w.typed));
  }

  function endGame(): void {
    if (finished) return;
    finished = true;
    running = false;
    cancelAnimationFrame(raf);
    const { entry, rank } = completeArcadeGame(state, game, Date.now(), { chars: characters, pack });
    const nemesisChange = updateNemesis(state, Date.now(), nemesisContent);
    updateCreatures(state, Date.now(), characters);
    const badges = earn(app, { kind: "arcade", score: entry.score, level: entry.level, lives: game.config.lives });
    app.persist();
    main.append(
      gameOverPanel(app, {
        title: game.over ? "Game over" : "Game ended",
        rank,
        stats: [
          ["Score", entry.score.toLocaleString()],
          ["Level", String(entry.level)],
          ["Words", String(entry.words)],
          ["Speed", `${Math.round(entry.wpm)} WPM`],
          ["Accuracy", formatPercent(entry.accuracy)],
          ["Best combo", String(game.maxCombo)],
        ],
        nemesisChange,
        badges,
        again: { name: "arcade-game", mode },
      }),
    );
  }

  function endOrLeave(): void {
    if (running) endGame();
    else app.go({ name: "arcade" });
  }

  const pause = () => {
    if (running && !area.querySelector(".overlay.paused")) {
      running = false;
      cancelAnimationFrame(raf);
      area.append(
        h(
          "div",
          { class: "overlay paused" },
          h("p", { class: "overlay-title" }, "Paused"),
          h("button", {
            type: "button",
            class: "button primary",
            onclick: () => start(),
          }, "Resume"),
        ),
      );
    }
  };
  const onVisibility = () => document.hidden && pause();
  document.addEventListener("visibilitychange", onVisibility);
  // Opening the menu pauses too, so words don't land behind it.
  window.addEventListener(MENU_OPEN, pause);

  return {
    el,
    focus: startButton,
    dispose: () => {
      running = false;
      cancelAnimationFrame(raf);
      physical?.dispose();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(MENU_OPEN, pause);
      window.clearTimeout(toastTimer);
    },
  };
}
