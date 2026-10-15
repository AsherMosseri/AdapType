import {
  DEFAULT_GOAL,
  finishCalibrationTest,
  skipCalibration,
  suggestGoalWpm,
  type Goal,
  type InputProfile,
} from "../../../engine/src";
import type { App, Screen, ScreenView } from "../app";
import { goalControls } from "../components/goalControls";
import { topBar } from "../components/topBar";
import { h, icon, ICONS } from "../dom";
import { detectProfile } from "../store";

/** First launch for an input profile: choose keyboard or touch, then test or skip. */
export function welcomeScreen(app: App): ScreenView {
  const detected = detectProfile();
  const choice = (profile: InputProfile, title: string, body: string, paths: readonly string[]) => {
    const id = `profile-${profile}`;
    const input = h("input", { type: "radio", name: "profile", id, value: profile, checked: app.data.settings.activeProfile === profile });
    input.addEventListener("change", () => {
      app.data.settings.activeProfile = profile;
      app.persist();
      if (!app.needsSetup) app.home();
      else app.go({ name: "welcome" });
    });
    return h(
      "label",
      { class: "choice", for: id },
      input,
      h("span", { class: "choice-icon" }, icon([...paths])),
      h("span", { class: "choice-text" }, h("strong", null, title, profile === detected ? h("em", null, "Detected") : null), h("span", null, body)),
    );
  };

  const otherReady = Object.entries(app.data.profiles).some(([key, p]) => key !== app.profileKey && p?.goal);
  const el = h(
    "div",
    { class: "screen" },
    topBar(app, { settingsOnly: true, returnTo: { name: "welcome" } }),
    h(
      "main",
      { class: "welcome" },
      h("h1", { tabindex: "-1" }, "Typing practice that learns your weak spots"),
      h(
        "p",
        { class: "lead" },
        "You start with a few letters. AdapType watches which keys slow you down or trip you up, builds each round around them, and unlocks a new letter once you've got the current ones.",
      ),
      h(
        "fieldset",
        { class: "choices" },
        h("legend", null, "What are you typing on?"),
        choice("physical", "Keyboard", "A physical keyboard on a laptop or desktop.", ICONS.keyboard),
        choice("touch", "Touch screen", "AdapType's own on-screen keyboard, built for thumbs.", ICONS.phone),
      ),
      otherReady ? h("p", { class: "fine" }, "Keyboard, touch and each keyboard layout keep their own progress, so each starts with its own test.") : null,
      h(
        "section",
        { class: "panel" },
        h("h2", null, "Start with a 1-minute test"),
        h(
          "p",
          null,
          "It measures your speed, suggests a goal, and unlocks letters you already type well. You can skip it; AdapType will then learn from your first two rounds instead.",
        ),
        h(
          "div",
          { class: "actions" },
          h("button", { type: "button", class: "button primary", onclick: () => app.go({ name: "calibration" }) }, "Take the 1-minute test"),
          h("button", { type: "button", class: "button", onclick: () => app.go({ name: "goal", from: "skip" }) }, "Skip the test"),
        ),
      ),
      h("p", { class: "fine" }, h("a", { href: "#", onclick: (e: Event) => { e.preventDefault(); app.go({ name: "about", returnTo: { name: "welcome" } }); } }, "About AdapType and its word list")),
    ),
  );
  return { el };
}

/** Choose a speed goal: after the test (with a suggestion) or after skipping it. */
export function goalScreen(app: App, screen: Screen): ScreenView {
  if (screen.name !== "goal") throw new Error("goal screen");
  const state = app.profile;
  const touch = state.profile === "touch";
  const measured = screen.measuredWpm;
  const suggested = measured !== undefined ? suggestGoalWpm(measured) : state.goal?.wpm ?? (touch ? 30 : DEFAULT_GOAL.wpm);
  let goal: Goal = { wpm: suggested, accuracy: state.goal?.accuracy ?? DEFAULT_GOAL.accuracy };

  const start = () => {
    if (screen.from === "test") {
      const testedOut = finishCalibrationTest(state, goal);
      app.notice =
        testedOut.length > 0
          ? `The test unlocked ${testedOut.length} letters you already type at your goal. ${state.unlocked.length} of 26 are open.`
          : `You're starting with ${state.unlocked.length} letters. Master them to unlock more.`;
    } else {
      state.goal = goal;
      skipCalibration(state);
    }
    app.persist();
    app.go({ name: "practice" });
  };

  const el = h(
    "div",
    { class: "screen" },
    topBar(app, { settingsOnly: true, returnTo: { name: "welcome" } }),
    h(
      "main",
      { class: "goal-screen" },
      h("h1", { tabindex: "-1" }, measured !== undefined ? `You typed ${Math.round(measured)} WPM` : "Pick a speed goal"),
      h(
        "p",
        { class: "lead" },
        measured !== undefined
          ? `A good goal is a bit above where you are now. We suggest ${suggested} WPM. Letters unlock when you reach your goal on each one.`
          : `Letters unlock when you reach your goal speed and accuracy on each one. ${touch ? "On a phone, 25 to 35 WPM is a solid start." : "40 WPM is a solid start; pick lower if you're new to typing."}`,
      ),
      h("section", { class: "panel" }, goalControls(goal, (g) => (goal = g))),
      h("p", { class: "fine" }, "You can change your goal anytime in settings."),
      h("div", { class: "actions" }, h("button", { type: "button", class: "button primary", onclick: start }, "Start practicing")),
    ),
  );
  return { el };
}
