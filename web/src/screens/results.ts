import {
  DEFAULT_GOAL,
  focusLetter,
  masteryProgress,
  modifierGoal,
  modifierProgress,
  modKey,
  nextLetter,
  nextModifierStage,
  recentAverage,
  creatureTraits,
  roundKeySummary,
  SHIFT_SIDE_KEY,
  TOUCH_LAYER_KEY,
  wpmToMs,
  type RoundExplanation,
  type RoundOutcome,
} from "../../../engine/src";
import type { App, Screen, ScreenView } from "../app";
import { challengeButton } from "../challenge";
import { rhythmGraph } from "../components/charts";
import { heatmap } from "../components/heatmap";
import { announce } from "../announce";
import { newBadgesPanel } from "../achievements";
import { activeEffect } from "../appearance";
import { celebrate } from "../components/celebrate";
import { creatureSvg } from "../components/creature";
import { nemesisFace } from "../components/nemesisFace";
import { topBar } from "../components/topBar";
import { formatPercent, h, icon, ICONS } from "../dom";
import { list, MODIFIER_NAMES } from "../explainText";
import { playSound } from "../sound";

/** Results that already celebrated a best run, so coming back doesn't celebrate again. */
const celebratedBest = new WeakSet<object>();

export function resultsScreen(app: App, screen: Screen): ScreenView {
  if (screen.name !== "results") throw new Error("results screen needs an outcome");
  const view = screen;
  const { outcome, metrics } = screen;
  const state = app.profile;
  const goal = state.goal ?? DEFAULT_GOAL;
  const before = recentAverage(state, 1);
  const now = recentAverage(state);

  const delta = (value: number, base: number | undefined, unit: "wpm" | "pct") => {
    if (base === undefined) return h("p", { class: "delta" }, "Your first round");
    const diff = unit === "wpm" ? Math.round(value - base) : Math.round((value - base) * 100);
    const text = diff === 0 ? "Same as" : `${diff > 0 ? "+" : "−"}${Math.abs(diff)}${unit === "pct" ? " pts" : ""} vs`;
    return h("p", { class: `delta ${diff > 0 ? "up" : diff < 0 ? "down" : ""}` }, `${text} your recent average`);
  };

  const headline = h(
    "section",
    { class: "headline", "aria-label": "This round" },
    h(
      "div",
      { class: "big-stat" },
      h("p", { class: "big-label" }, "Speed"),
      h("p", { class: "big-value" }, String(Math.round(metrics.wpm)), h("small", null, " WPM")),
      delta(metrics.wpm, before?.wpm, "wpm"),
    ),
    h(
      "div",
      { class: "big-stat" },
      h("p", { class: "big-label" }, "Accuracy"),
      h("p", { class: "big-value" }, formatPercent(metrics.accuracy)),
      delta(metrics.accuracy, before?.accuracy, "pct"),
    ),
  );

  // What changed: unlocks, mastery, calibration.
  const events: HTMLElement[] = [];
  if (outcome.testedOut.length > 0 || (outcome.summary.calibration && state.calibration === "done")) {
    events.push(
      callout(
        "Warm-up done",
        outcome.testedOut.length > 0
          ? `You already type ${outcome.testedOut.length} letters at your goal, so they're unlocked: ${outcome.testedOut.join(" ")}.`
          : "AdapType has a picture of your typing now. Practice starts with the first letters.",
      ),
    );
  }
  if (outcome.newlyUnlocked) {
    events.push(
      callout(
        `New letter: ${outcome.newlyUnlocked}`,
        `Every unlocked letter reached your goal, so ${outcome.newlyUnlocked} is next. It shows up more often while you learn it.`,
        "unlock",
      ),
    );
  }
  if (outcome.newlyMastered.length > 0) {
    events.push(callout(`Mastered: ${outcome.newlyMastered.join(" ")}`, "These letters reached your goal speed and accuracy over 3 rounds."));
  }
  if (outcome.newlyUnlockedMods.length > 0) {
    const names = outcome.newlyUnlockedMods.map((id) => MODIFIER_NAMES[id].toLowerCase());
    events.push(
      callout(
        `Unlocked: ${list(names)}`,
        outcome.newlyUnlockedMods.includes("shortcuts")
          ? "You've mastered every letter and modifier so far. The shortcut drill is on the practice screen."
          : "Your letters are at your goal, so rounds now mix these in. Change how often in settings.",
        "unlock",
      ),
    );
  }
  if (outcome.newlyMasteredMods.length > 0) {
    events.push(callout(`Mastered: ${list(outcome.newlyMasteredMods.map((id) => MODIFIER_NAMES[id].toLowerCase()))}`, "They now show up at the low end of their range."));
  }
  const nemesisNews = screen.nemesisChange;
  if (nemesisNews?.defeated) {
    const d = nemesisNews.defeated;
    events.push(
      h(
        "div",
        { class: "callout unlock nemesis-callout", role: "status" },
        nemesisFace(d, 48, true),
        h("div", null, h("p", { class: "callout-title" }, `${d.name} is defeated`), h("p", null, `Your ${d.key} reached your goal. See your hall of defeated in Progress.`)),
      ),
    );
  }
  if (nemesisNews?.chosen) {
    const c = nemesisNews.chosen;
    events.push(
      h(
        "div",
        { class: "callout nemesis-callout", role: "status" },
        nemesisFace(c, 48),
        h(
          "div",
          null,
          h("p", { class: "callout-title" }, `A nemesis appears: ${c.name}`),
          h("p", null, `${c.key} is your weakest key. It shows up as a boss in the arcade until you get it to your goal.`),
          h("div", { class: "actions wrap" }, h("button", { type: "button", class: "button", onclick: () => app.go({ name: "arcade" }) }, "Go to the arcade")),
        ),
      ),
    );
  }
  const grown = screen.creatureChanges ?? [];
  if (grown.length > 0) {
    const lines = grown.map((c) => (c.to === 1 ? `${c.key} hatched` : c.to === 2 ? `${c.key} grew up` : `${c.key} became legendary`));
    events.push(
      h(
        "div",
        { class: "callout unlock creature-callout", role: "status" },
        h("div", { class: "creature-row" }, grown.slice(0, 4).map((c) => creatureSvg(creatureTraits(c.key), c.to, { size: 48, legend: c.key }))),
        h(
          "div",
          null,
          h("p", { class: "callout-title" }, grown.length === 1 ? `Your ${lines[0]}!` : `${grown.length} creatures evolved`),
          grown.length > 1 ? h("p", null, `${list(lines)}.`) : null,
          h("div", { class: "actions wrap" }, h("button", { type: "button", class: "button", onclick: () => app.go({ name: "collection", returnTo: view }) }, "See your creatures")),
        ),
      ),
    );
  }
  if (screen.replayRank === 1 && state.replays.best.length > 1) {
    events.push(callout("New best run", "This round is now your best replay. Watch it, or race it side by side with your next one in Replays.", "unlock"));
    if (!screen.badges?.length && !celebratedBest.has(view)) {
      celebratedBest.add(view);
      celebrate(activeEffect());
    }
  }
  if (outcome.difficultyChange > 0) {
    events.push(h("p", { class: "fine" }, "You've been at your goal, so rounds just got a little harder: longer and less common words, and a bit more focus on weak spots."));
  } else if (outcome.difficultyChange < 0) {
    events.push(h("p", { class: "fine" }, "The last few rounds were tough, so the next ones ease off a little."));
  }
  if (screen.warmup) {
    events.unshift(callout("Warm-up done", "Your trouble spots got a head start. Regular rounds pick up from here.", "unlock"));
  }
  if (outcome.fatigue === "started") {
    events.unshift(
      h(
        "div",
        { class: "callout rest", role: "status" },
        h("p", { class: "callout-title" }, "You're slowing down. Take 5?"),
        h(
          "p",
          null,
          "Your last rounds are slower or less accurate than when you started this session. A short break usually helps. If you keep going, rounds ease off a little and count less toward your weak spots until you recover.",
        ),
        h(
          "div",
          { class: "actions wrap" },
          h("button", { type: "button", class: "button", onclick: () => app.go({ name: "session" }) }, "End session and see the summary"),
        ),
      ),
    );
  } else if (outcome.fatigue === "recovered") {
    events.push(h("p", { class: "fine" }, "You're back to your starting pace, so rounds are back to normal."));
  } else if (state.session?.fatigued) {
    events.push(h("p", { class: "fine" }, "Still a bit tired: rounds stay a little easier and count less until you're back to your starting pace."));
  }
  if (outcome.gripSuggestion && state.session) {
    const session = state.session;
    const suggested = outcome.gripSuggestion;
    events.push(
      h(
        "div",
        { class: "callout", role: "status" },
        h("p", { class: "callout-title" }, suggested === "one" ? "Typing with one thumb?" : "Typing with two thumbs?"),
        h("p", null, suggested === "one" ? "Your taps look like one-thumb typing: letters on opposite sides of the keyboard take you longer." : "Your taps look like two-thumb typing: letters on opposite sides of the keyboard come faster."),
        h(
          "div",
          { class: "actions wrap" },
          h("button", { type: "button", class: "button", onclick: (e: Event) => { session.grip = suggested; session.gripSignal = { sameMs: 0, sameN: 0, crossMs: 0, crossN: 0 }; app.persist(); (e.target as HTMLElement).closest(".callout")?.remove(); } }, `Switch to ${suggested === "one" ? "one thumb" : "two thumbs"}`),
          h("button", { type: "button", class: "button", onclick: (e: Event) => { session.gripSignal = { sameMs: 0, sameN: 0, crossMs: 0, crossN: 0 }; app.persist(); (e.target as HTMLElement).closest(".callout")?.remove(); } }, "Keep my choice"),
        ),
      ),
    );
  }
  if (state.profile === "physical" && state.touchTyping === null && state.rounds.filter((r) => !r.calibration).length >= 3) {
    const answer = (yes: boolean) => (e: Event) => {
      state.touchTyping = yes;
      app.persist();
      const box = (e.target as HTMLElement).closest(".callout");
      if (box) box.replaceChildren(h("p", null, yes ? "Thanks. Progress now shows your weakest finger." : "Thanks. Progress now shows your weakest keyboard zone."));
    };
    events.push(
      h(
        "div",
        { class: "callout ask" },
        h("p", { class: "callout-title" }, "Do you touch-type?"),
        h("p", null, "That means using a set finger for each key, with your fingers resting on the home row. AdapType can't see your hands, so this decides whether it reports your weakest finger or your weakest keyboard zone."),
        h("div", { class: "actions wrap" }, h("button", { type: "button", class: "button", onclick: answer(true) }, "Yes, I touch-type"), h("button", { type: "button", class: "button", onclick: answer(false) }, "No")),
      ),
    );
  }

  const el = h(
    "div",
    { class: "screen" },
    topBar(app, { returnTo: { name: "practice" } }),
    h(
      "main",
      { class: "results" },
      h("h1", { class: "sr-only", tabindex: "-1" }, "Round results"),
      headline,
      newBadgesPanel(app, screen.badges ?? [], view),
      events.length ? h("div", { class: "events" }, events) : null,
      screen.explanation ? targeted(screen.explanation, outcome) : null,
      mistakesPanel(),
      rhythmPanel(),
      goalBar(now?.wpm ?? metrics.wpm, goal.wpm),
      unlockProgress(),
      h("section", { class: "panel" }, h("h2", null, "Key strength"), heatmap(state, goal, app.data.settings.modifiers)),
    ),
  );

  announce(
    `Round done. ${Math.round(metrics.wpm)} words per minute, ${formatPercent(metrics.accuracy)} accuracy.${outcome.newlyUnlocked ? ` New letter: ${outcome.newlyUnlocked}.` : ""}${grown.length ? ` ${grown.length === 1 ? "A creature" : `${grown.length} creatures`} evolved.` : ""}`,
  );
  if (outcome.newlyUnlocked || outcome.newlyUnlockedMods.length || outcome.newlyMastered.length || grown.length) playSound("success");
  const next = h("button", { type: "button", class: "button primary", onclick: () => app.go({ name: "practice" }) }, "Next round", h("kbd", null, "Enter"));
  const endSession = h(
    "button",
    { type: "button", class: "button compact", "aria-label": "End session", title: "End session", onclick: () => app.go({ name: "session" }) },
    icon([...ICONS.stop]),
    h("span", { class: "button-label" }, "End session"),
  );
  const replayIndex = state.replays.recent.length - 1;
  const watch =
    screen.replay && replayIndex >= 0
      ? h(
          "button",
          { type: "button", class: "button compact", "aria-label": "Watch replay", title: "Watch replay", onclick: () => app.go({ name: "replay", list: "recent", index: replayIndex, returnTo: view }) },
          icon([...ICONS.replay]),
          h("span", { class: "button-label" }, "Watch replay"),
        )
      : null;
  el.querySelector("main")!.append(h("div", { class: "actions sticky-actions" }, next, watch, challengeButton(app, screen.challenge ?? null), state.session && state.session.rounds > 0 ? endSession : null));

  /** Error types, self-correction, hesitations and reviews. */
  function mistakesPanel(): HTMLElement | null {
    const lines: HTMLElement[] = [];
    const counts = outcome.errors.counts;
    const labels: [keyof typeof counts, string, string][] = [
      ["swap", "swap", "swaps"],
      ["neighbor", "neighbor-key hit", "neighbor-key hits"],
      ["double", "extra double letter", "extra double letters"],
      ["missed-double", "missed double letter", "missed double letters"],
      ["skipped", "skipped letter", "skipped letters"],
      ["case", "wrong capital", "wrong capitals"],
      ["other", "other slip", "other slips"],
    ];
    const parts = labels.filter(([k]) => counts[k]).map(([k, one, many]) => `${counts[k]} ${counts[k] === 1 ? one : many}`);
    if (parts.length > 0) lines.push(h("li", null, h("strong", null, "Errors: "), `${list(parts)}.`));
    const firstErrors = metrics.firstErrors;
    if (firstErrors > 0) {
      lines.push(
        h(
          "li",
          null,
          h("strong", null, "Self-correction: "),
          `you caught and fixed ${metrics.corrections} of ${firstErrors} ${firstErrors === 1 ? "error" : "errors"} yourself (${formatPercent(metrics.corrections / firstErrors)}).`,
        ),
      );
    }
    if (outcome.hesitated.length > 0) {
      const keys = outcome.hesitated.slice(0, 4).map((x) => (x.key === " " ? "space" : x.key));
      lines.push(h("li", null, h("strong", null, "Pauses: "), `you hesitated before ${list(keys)}. Those keys get extra practice even when you type them right.`));
    }
    const added = outcome.reviews.added.length;
    const passed = outcome.reviews.passed.length;
    const learned = outcome.reviews.learned.length;
    if (added + passed + learned > 0) {
      const bits = [
        added ? `${added} new ${added === 1 ? "item" : "items"} to review later` : "",
        passed ? `${passed} review${passed === 1 ? "" : "s"} passed` : "",
        learned ? `${learned} learned for good` : "",
      ].filter(Boolean);
      lines.push(h("li", null, h("strong", null, "Reviews: "), `${list(bits)}.`));
    }
    if (view.explanation?.reviewWords?.length) {
      lines.push(h("li", null, h("strong", null, "Back for review: "), `${list(view.explanation.reviewWords)}.`));
    }
    if (lines.length === 0) return null;
    return h("section", { class: "panel" }, h("h2", null, "Mistakes and pauses"), h("ul", { class: "fact-list" }, lines));
  }

  /** Consistency score and the gap before each keystroke. */
  function rhythmPanel(): HTMLElement | null {
    const r = outcome.rhythm;
    if (r.consistency === null) return null;
    return h(
      "section",
      { class: "panel" },
      h("h2", null, "Rhythm"),
      h(
        "p",
        { class: "panel-lead" },
        h("strong", { class: "inline-stat" }, formatPercent(r.consistency)),
        ` consistent. ${r.stalls.length === 0 ? "No stalls: an even pace all the way." : `${r.stalls.length} ${r.stalls.length === 1 ? "stall" : "stalls"}, marked in red. Hover a bar to see the key.`}`,
      ),
      rhythmGraph(r, view.records ?? [], wpmToMs(goal.wpm)),
    );
  }

  /** What the round focused on, and how it went for each. */
  function targeted(explanation: RoundExplanation, result: RoundOutcome): HTMLElement | null {
    const rows: HTMLElement[] = [];
    const goalMs = wpmToMs(goal.wpm);
    const keyRow = (name: string, key: string, targetMs: number, wide = false) => {
      const r = roundKeySummary(result.perKey[key]);
      const text = r
        ? `${formatPercent(r.accuracy)} accurate${r.avgMs === null ? "" : `, ${Math.round(r.avgMs)} ms each (goal ${Math.round(targetMs)})`}`
        : "Didn't come up this round.";
      const good = r && r.accuracy >= goal.accuracy && (r.avgMs === null || r.avgMs <= targetMs);
      rows.push(h("li", { class: good ? "target good" : "target" }, h("span", { class: wide ? "target-name wide" : "target-name" }, name), h("span", null, text)));
    };
    const keys = [...(explanation.newLetter ? [explanation.newLetter] : []), ...explanation.keys];
    for (const k of keys) keyRow(k, k, goalMs);
    for (const p of explanation.pairs) rows.push(h("li", { class: "target" }, h("span", { class: "target-name" }, p), h("span", null, "Letter pair, practiced inside words.")));
    for (const m of explanation.modifiers) keyRow(MODIFIER_NAMES[m.id], modKey(m.id), wpmToMs(modifierGoal(goal).wpm), true);
    const shift = state.keys[SHIFT_SIDE_KEY];
    if (shift && shift.n >= 5 && shift.errAvg > 0.2) {
      rows.push(h("li", { class: "target" }, h("span", { class: "target-name" }, "⇧"), h("span", null, `You often use the Shift on the same side as the letter (${formatPercent(shift.errAvg)} of the time). Try the opposite hand's Shift.`)));
    }
    const layer = state.keys[TOUCH_LAYER_KEY];
    if (layer && layer.timedN >= 5) {
      rows.push(h("li", { class: "target" }, h("span", { class: "target-name" }, "123"), h("span", null, `Switching to numbers and symbols takes you about ${Math.round(layer.msAvg)} ms per character.`)));
    }
    if (rows.length === 0) return null;
    return h("section", { class: "panel" }, h("h2", null, "This round targeted"), h("ul", { class: "target-list" }, rows));
  }

  function unlockProgress(): HTMLElement {
    const upcoming = nextLetter(state);
    const learning = state.unlocked.filter((l) => !state.mastered.includes(l));
    const focus = focusLetter(state);
    const rows = learning.map((letter) => {
      const progress = masteryProgress(state.keyHistory[letter], goal);
      return h(
        "li",
        { class: letter === focus ? "progress-row focus" : "progress-row" },
        h("span", { class: "progress-letter" }, letter),
        h("span", { class: "meter", role: "meter", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(progress * 100)), "aria-label": `${letter} progress to mastery` }, h("span", { style: { width: `${Math.round(progress * 100)}%` } })),
        h("span", { class: "progress-pct" }, formatPercent(progress)),
      );
    });
    if (!upcoming && learning.length === 0) return modifierProgressPanel();
    const summary = !upcoming
      ? "All 26 letters are unlocked."
      : learning.length === 0
        ? `Next up: ${upcoming}.`
        : `Master ${learning.length === 1 ? "this letter" : `these ${learning.length} letters`} to unlock ${upcoming}.`;
    return h(
      "section",
      { class: "panel" },
      h("h2", null, "Unlock progress"),
      h("p", { class: "panel-lead" }, `${state.unlocked.length} of 26 letters unlocked. ${summary}`),
      rows.length ? h("ul", { class: "progress-list" }, rows) : null,
    );
  }

  /** After the letters: progress on unlocked modifiers and what unlocks next. */
  function modifierProgressPanel(): HTMLElement {
    const stage = nextModifierStage(state);
    const learning = state.modsUnlocked.filter((id) => id !== "shortcuts" && !state.modsMastered.includes(id as never));
    const rows = learning.map((id) => {
      const progress = modifierProgress(state.keys[modKey(id as never)], goal);
      return h(
        "li",
        { class: "progress-row" },
        h("span", { class: "progress-letter wide" }, MODIFIER_NAMES[id]),
        h("span", { class: "meter", role: "meter", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(progress * 100)), "aria-label": `${MODIFIER_NAMES[id]} progress to mastery` }, h("span", { style: { width: `${Math.round(progress * 100)}%` } })),
        h("span", { class: "progress-pct" }, formatPercent(progress)),
      );
    });
    const next = stage ? list(stage.filter((id) => !state.modsUnlocked.includes(id)).map((id) => MODIFIER_NAMES[id].toLowerCase())) : null;
    const lead = !next
      ? "All 26 letters, every modifier and the shortcut drill are unlocked."
      : learning.length === 0
        ? `All 26 letters are mastered. Next up: ${next}.`
        : `All 26 letters are mastered. Master ${learning.length === 1 ? "this" : "these"} to unlock ${next}.`;
    return h("section", { class: "panel" }, h("h2", null, "Unlock progress"), h("p", { class: "panel-lead" }, lead), rows.length ? h("ul", { class: "progress-list" }, rows) : null);
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      app.go({ name: "practice" });
    }
  };
  // A short delay so a key still held from the last word doesn't skip this screen.
  const timer = window.setTimeout(() => window.addEventListener("keydown", onKey), 400);

  return {
    el,
    dispose: () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    },
  };
}

function callout(title: string, body: string, kind = ""): HTMLElement {
  return h("div", { class: `callout ${kind}`, role: "status" }, h("p", { class: "callout-title" }, title), h("p", null, body));
}

/** Recent average speed against the goal. */
export function goalBar(average: number, goalWpm: number): HTMLElement {
  const max = Math.max(goalWpm * 1.25, average * 1.05);
  const pct = (v: number) => `${Math.min(100, (v / max) * 100).toFixed(1)}%`;
  const reached = average >= goalWpm;
  return h(
    "section",
    { class: "panel goal-panel" },
    h("h2", null, "Speed goal"),
    h(
      "p",
      { class: "panel-lead" },
      reached
        ? `Your recent average is ${Math.round(average)} WPM, at or above your goal of ${goalWpm}.`
        : `Your recent average is ${Math.round(average)} WPM. Your goal is ${goalWpm}.`,
    ),
    h(
      "div",
      { class: `goal-bar ${reached ? "reached" : ""}`, role: "meter", "aria-valuemin": "0", "aria-valuemax": String(goalWpm), "aria-valuenow": String(Math.round(average)), "aria-label": "Recent average speed toward goal" },
      h("span", { class: "goal-fill", style: { width: pct(average) } }),
      h("span", { class: "goal-mark", style: { left: pct(goalWpm) } }, h("span", null, `${goalWpm}`)),
    ),
  );
}
