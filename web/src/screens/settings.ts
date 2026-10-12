import {
  DEFAULT_GOAL,
  MODIFIER_STAGES,
  setUnlockOrder,
  type ErrorMode,
  type InputProfile,
  type ModifierLevel,
  type ModifierMode,
  type RoundType,
  type UnlockableId,
  type UnlockOrder,
} from "../../../engine/src";
import type { App, Screen, ScreenView } from "../app";
import { goalControls } from "../components/goalControls";
import { topBar } from "../components/topBar";
import { h } from "../dom";
import { MODIFIER_NAMES } from "../explainText";
import { currentOs, detectOs, detectTouchLayout, OS_NAMES, platformFor, type Os } from "../platform";
import { clearSaved, defaultData, fromCode, newProfile, parseData, toCode, type AppData, type OsChoice, type TouchLayoutChoice } from "../store";

const ROUND_CHOICES: { id: string; label: string; round: RoundType }[] = [
  { id: "w25", label: "25 words", round: { kind: "words", count: 25 } },
  { id: "w50", label: "50 words", round: { kind: "words", count: 50 } },
  { id: "t30", label: "30 sec", round: { kind: "timed", seconds: 30 } },
  { id: "t60", label: "60 sec", round: { kind: "timed", seconds: 60 } },
  { id: "endless", label: "Endless", round: { kind: "endless" } },
];

const ERROR_CHOICES: { id: ErrorMode; label: string; hint: string }[] = [
  { id: "backspace", label: "Fix with backspace", hint: "Errors stay until you backspace and fix them, like real typing." },
  { id: "block", label: "Must fix to continue", hint: "A wrong key doesn't move you forward until you press the right one." },
  { id: "skip", label: "Mark and move on", hint: "Errors show in red and you keep going." },
];

const ORDER_CHOICES: { id: UnlockOrder; label: string; hint: string }[] = [
  { id: "frequency", label: "Most common first", hint: "e t a o i n… so real words show up early." },
  { id: "homeRow", label: "Home row first", hint: "a s d f j k l, then the top and bottom rows. Best for physical keyboards." },
];

export function settingsScreen(app: App, screen: Screen): ScreenView {
  const returnTo = screen.name === "settings" ? screen.returnTo : undefined;
  const settings = app.data.settings;
  const state = app.profile;
  const leave = () => {
    app.persist();
    if (app.needsSetup) app.go({ name: "welcome" });
    else app.go(returnTo ?? { name: "practice" });
  };

  const roundId = ROUND_CHOICES.find((c) => JSON.stringify(c.round) === JSON.stringify(settings.round))?.id ?? "w25";

  const main = h(
    "main",
    { class: "settings" },
    h("h1", { tabindex: "-1" }, "Settings"),
    section(
      "Rounds",
      radioGroup("round", "Round length", ROUND_CHOICES.map((c) => ({ id: c.id, label: c.label })), roundId, (id) => {
        settings.round = ROUND_CHOICES.find((c) => c.id === id)!.round;
        app.persist();
      }, true),
    ),
    section(
      "Errors",
      radioGroup("errors", "When you press a wrong key", ERROR_CHOICES, settings.errorMode, (id) => {
        settings.errorMode = id as ErrorMode;
        app.persist();
      }),
    ),
    section(
      "Speed goal",
      h("p", { class: "panel-lead" }, "A letter is mastered when you reach this speed and accuracy on it across 3 rounds."),
      goalControls(state.goal ?? DEFAULT_GOAL, (g) => {
        state.goal = g;
        app.persist();
      }, "settings-goal"),
    ),
    section(
      "Unlock order",
      radioGroup("order", "Which letters unlock first", ORDER_CHOICES, state.unlockOrder, (id) => {
        setUnlockOrder(state, id as UnlockOrder);
        app.persist();
      }),
      h("p", { class: "fine" }, "Switching keeps every letter you've mastered."),
    ),
    modifiersSection(app),
    keyboardSection(app, returnTo),
    app.data.settings.activeProfile === "physical"
      ? section(
          "Shortcut drill",
          radioGroup(
            "sc-style",
            "How prompts are shown",
            [
              { id: "shown", label: "Show the combo", hint: "You see ⌘ Z and press it." },
              { id: "named", label: "Name the action", hint: "You see “Undo” and press the right combo." },
            ],
            settings.shortcutStyle,
            (id) => {
              settings.shortcutStyle = id as "shown" | "named";
              app.persist();
            },
          ),
          radioGroup(
            "sc-answer",
            "How you answer",
            [
              { id: "press", label: "Press the keys", hint: "Best practice. Some browsers block a few shortcuts; you can build those instead." },
              { id: "build", label: "Build the combo", hint: "Tap ⌘ ⇧ ⌥ ⌃ and the key on screen instead of pressing them." },
            ],
            settings.shortcutAnswer,
            (id) => {
              settings.shortcutAnswer = id as "press" | "build";
              app.persist();
            },
          ),
        )
      : null,
    section(
      "Input",
      radioGroup(
        "profile",
        "What you're typing on",
        [
          { id: "physical", label: "Keyboard", hint: "Physical keyboard." },
          { id: "touch", label: "Touch screen", hint: "AdapType's on-screen keyboard." },
        ],
        settings.activeProfile,
        (id) => {
          settings.activeProfile = id as InputProfile;
          app.persist();
          app.go({ name: "settings", returnTo });
        },
      ),
      h("p", { class: "fine" }, "Keyboard and touch have separate progress, goals and letters."),
    ),
    section(
      "Calibration",
      h("p", { class: "panel-lead" }, "Retake the 1-minute test, for example after a long break. It unlocks any letters you now type at your goal and never locks letters again."),
      h("button", { type: "button", class: "button", onclick: () => app.go({ name: "calibration" }) }, "Retake the test"),
    ),
    dataSection(app, returnTo),
    h("p", { class: "fine" }, h("a", { href: "#", onclick: (e: Event) => { e.preventDefault(); app.go({ name: "about", returnTo: { name: "settings", returnTo } }); } }, "About AdapType")),
  );

  const el = h("div", { class: "screen" }, topBar(app, { back: leave, backLabel: "Done", noSettings: true }), main);
  return { el };
}

const MODE_CHOICES: { id: ModifierMode; label: string }[] = [
  { id: "unlock", label: "When unlocked" },
  { id: "on", label: "On now" },
  { id: "off", label: "Off" },
];
const LEVEL_CHOICES: { id: ModifierLevel; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "auto", label: "Auto" },
];
const LEVEL_HINT = "Low: up to 1 in 10 words. Medium: up to 1 in 4. High: up to half. Auto: AdapType picks. Within the level, weak modifiers show up more.";

/** One row per modifier: when it's on, and how often it shows up. */
function modifiersSection(app: App): HTMLElement {
  const settings = app.data.settings;
  const mods = settings.modifiers;
  const state = app.profile;
  const platform = platformFor(app);
  const ids = MODIFIER_STAGES.flat() as UnlockableId[];
  const stageOf = (id: UnlockableId) => MODIFIER_STAGES.findIndex((stage) => (stage as readonly string[]).includes(id));

  const rows = ids.map((id) => {
    const unlocked = state.modsUnlocked.includes(id);
    const mastered = id !== "shortcuts" && state.modsMastered.includes(id as never);
    const stage = stageOf(id);
    const status = mastered
      ? "Mastered"
      : unlocked
        ? "Unlocked"
        : stage === 0
          ? "Unlocks after all 26 letters"
          : `Unlocks after ${MODIFIER_NAMES[MODIFIER_STAGES[stage - 1][0]].toLowerCase()}`;
    const unavailable =
      (id === "accents" && !platform.accents) || (id === "extra" && platform.extra.length === 0)
        ? "Your keyboard setting can't type these. Choose another system below, or turn on Alt codes."
        : id === "shortcuts" && settings.activeProfile === "touch"
          ? "Physical keyboards only."
          : null;
    return h(
      "div",
      { class: "mod-row" },
      h("div", { class: "mod-head" }, h("strong", null, MODIFIER_NAMES[id]), h("span", { class: "mod-status" }, status)),
      unavailable ? h("p", { class: "fine" }, unavailable) : null,
      radioGroup(`mode-${id}`, `${MODIFIER_NAMES[id]}: when it's on`, MODE_CHOICES, mods.modes[id], (v) => {
        mods.modes[id] = v as ModifierMode;
        app.persist();
      }, true),
      id === "shortcuts"
        ? null
        : radioGroup(`level-${id}`, `${MODIFIER_NAMES[id]}: how often`, LEVEL_CHOICES, mods.levels[id], (v) => {
            mods.levels[id] = v as ModifierLevel;
            app.persist();
          }, true),
    );
  });

  return section(
    "Modifiers",
    h("p", { class: "panel-lead" }, "Capitals, punctuation and the rest unlock in stages once all 26 letters are mastered. Turn any of them on now to practice early."),
    h("p", { class: "fine" }, LEVEL_HINT),
    h("div", { class: "mod-rows" }, rows),
    h("h3", null, "Capitals"),
    radioGroup("caps-style", "Capital style", [
      { id: "first", label: "First letter", hint: "Apple" },
      { id: "any", label: "Any letter", hint: "apPle" },
    ], mods.caps, (v) => {
      mods.caps = v as "first" | "any";
      app.persist();
    }),
    h("h3", null, "Punctuation"),
    radioGroup("punct-style", "Punctuation style", [
      { id: "sentence", label: "Like sentences", hint: "Periods end sentences, the next word gets a capital, commas and quotes fall where real text has them." },
      { id: "random", label: "Fully random", hint: "Any punctuation on any word." },
    ], mods.punct, (v) => {
      mods.punct = v as "sentence" | "random";
      app.persist();
    }),
    h("h3", null, "Extra characters"),
    radioGroup("extra-set", "Extra character set", [
      { id: "curated", label: "Useful set", hint: "About 20: — – … • © ™ ® ° ± ≠ ≤ ≥ € £ and similar." },
      { id: "full", label: "Everything", hint: "Every character your keyboard can make with Option or AltGr." },
    ], settings.extraSet, (v) => {
      settings.extraSet = v as "curated" | "full";
      app.persist();
    }),
  );
}

/** Which system you type on, so accents and extra characters match your keyboard. */
function keyboardSection(app: App, returnTo: Screen | undefined): HTMLElement {
  const settings = app.data.settings;
  if (settings.activeProfile === "touch") {
    const detected = detectTouchLayout() === "ios" ? "iPhone" : "Android";
    return section(
      "Touch keyboard",
      radioGroup("touch-layout", "Symbol layout", [
        { id: "auto", label: `Match this device (${detected})`, hint: "Number and symbol pages laid out like your phone's own keyboard." },
        { id: "ios", label: "iPhone", hint: "123 and #+= pages." },
        { id: "android", label: "Android", hint: "?123 and =\< pages, like Gboard." },
      ], settings.touchLayout, (v) => {
        settings.touchLayout = v as TouchLayoutChoice;
        app.persist();
      }),
    );
  }
  const detected = OS_NAMES[detectOs()];
  const os: Os = currentOs(settings);
  const altCodes = h("input", { type: "checkbox", id: "alt-codes", checked: settings.altCodes });
  altCodes.addEventListener("change", () => {
    settings.altCodes = altCodes.checked;
    app.persist();
    app.go({ name: "settings", returnTo });
  });
  return section(
    "Your keyboard",
    h("p", { class: "panel-lead" }, "Accented letters and extra characters are typed differently on each system. AdapType shows how when one comes up."),
    radioGroup(
      "os",
      "System",
      [
        { id: "auto", label: `Detect (${detected})` },
        ...(Object.keys(OS_NAMES) as Os[]).map((id) => ({ id, label: OS_NAMES[id] })),
      ],
      settings.os,
      (v) => {
        settings.os = v as OsChoice;
        app.persist();
        app.go({ name: "settings", returnTo });
      },
      true,
    ),
    os === "windows"
      ? h(
          "label",
          { class: "check", for: "alt-codes" },
          altCodes,
          h("span", null, h("strong", null, "Use Alt codes"), h("span", null, "The US layout can't type accents or extra characters directly. With this on, AdapType includes them and shows the Alt code (hold Alt, type the number on the number pad).")),
        )
      : null,
    os === "windows" ? h("p", { class: "fine" }, "Tip: the US-International layout (a free Windows setting) types accents and many symbols with AltGr.") : null,
    os === "linux" ? h("p", { class: "fine" }, "Linux layouts vary, so hints say AltGr or Compose. Turn on a Compose key in your system settings to type all of these.") : null,
  );
}

function section(title: string, ...children: (Node | null)[]): HTMLElement {
  return h("section", { class: "panel" }, h("h2", null, title), children);
}

function radioGroup(
  name: string,
  label: string,
  choices: { id: string; label: string; hint?: string }[],
  selected: string,
  onChange: (id: string) => void,
  compact = false,
): HTMLElement {
  return h(
    "div",
    { class: compact ? "segmented" : "radio-list", role: "radiogroup", "aria-label": label },
    choices.map((c) => {
      const id = `${name}-${c.id}`;
      const input = h("input", { type: "radio", name, id, value: c.id, checked: c.id === selected });
      input.addEventListener("change", () => onChange(c.id));
      return h(
        "label",
        { for: id },
        input,
        compact ? h("span", null, c.label) : h("span", { class: "radio-text" }, h("strong", null, c.label), c.hint ? h("span", null, c.hint) : null),
      );
    }),
  );
}

/** Export, import, text code, and reset, each with an on-page confirmation where it replaces data. */
function dataSection(app: App, returnTo: Screen | undefined): HTMLElement {
  const status = h("p", { class: "status", role: "status" });
  const say = (text: string, kind: "ok" | "error" = "ok") => {
    status.textContent = text;
    status.className = `status ${kind}`;
  };
  const confirmArea = h("div", { class: "confirm-area" });

  const confirm = (message: string, action: string, onYes: () => void) => {
    confirmArea.replaceChildren(
      h(
        "div",
        { class: "confirm", role: "alertdialog", "aria-label": message },
        h("p", null, message),
        h(
          "div",
          { class: "actions" },
          h("button", { type: "button", class: "button danger", onclick: () => { confirmArea.replaceChildren(); onYes(); } }, action),
          h("button", { type: "button", class: "button", onclick: () => confirmArea.replaceChildren() }, "Cancel"),
        ),
      ),
    );
    (confirmArea.querySelector("button") as HTMLButtonElement).focus();
  };

  const replaceAll = (data: AppData, message: string) => {
    confirm("Replace all your current progress with this data?", "Replace progress", () => {
      app.data = data;
      app.persist();
      app.notice = message;
      app.go({ name: "settings", returnTo });
    });
  };

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(app.data, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: `adaptype-progress-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say("Progress file saved.");
  };

  const fileInput = h("input", { type: "file", accept: ".json,application/json", class: "sr-only", id: "import-file" });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    try {
      replaceAll(parseData(await file.text()), "Progress imported.");
    } catch (err) {
      say((err as Error).message, "error");
    }
  });

  const codeBox = h("textarea", { id: "progress-code", rows: "3", spellcheck: "false", autocomplete: "off", placeholder: "Paste a progress code here" });
  const copyCode = async () => {
    try {
      const code = await toCode(app.data);
      codeBox.value = code;
      try {
        await navigator.clipboard.writeText(code);
        say("Progress code copied. Paste it into AdapType on another browser or device.");
      } catch {
        codeBox.select();
        say("Your browser didn't allow copying. The code is selected in the box below; copy it from there.");
      }
    } catch {
      say("This browser can't create codes. Use Export file instead.", "error");
    }
  };
  const loadCode = async () => {
    if (!codeBox.value.trim()) {
      say("Paste a progress code into the box first.", "error");
      return;
    }
    try {
      replaceAll(await fromCode(codeBox.value), "Progress loaded from code.");
    } catch (err) {
      say((err as Error).message, "error");
    }
  };

  const profileName = app.data.settings.activeProfile === "touch" ? "touch" : "keyboard";
  const resetProfile = () =>
    confirm(`Delete all ${profileName} progress? Letters, stats and your goal for ${profileName} start over.`, `Delete ${profileName} progress`, () => {
      const key = app.data.settings.activeProfile;
      app.data.profiles[key] = newProfile(key);
      app.persist();
      app.go({ name: "welcome" });
    });
  const resetAll = () =>
    confirm("Delete everything? All progress and settings for keyboard and touch are removed.", "Delete everything", () => {
      clearSaved();
      app.data = defaultData(app.data.settings.activeProfile);
      app.persist();
      app.go({ name: "welcome" });
    });

  return section(
    "Your data",
    h("p", { class: "panel-lead" }, "Progress is saved in this browser only. Move it to another browser or device with a file or a code."),
    app.saving ? null : h("p", { class: "status error" }, "This browser isn't saving progress (private browsing or storage is full). Export your progress to keep it."),
    h(
      "div",
      { class: "actions wrap" },
      h("button", { type: "button", class: "button", onclick: exportFile }, "Export file"),
      h("label", { class: "button", for: "import-file" }, "Import file"),
      fileInput,
      h("button", { type: "button", class: "button", onclick: copyCode }, "Copy as code"),
    ),
    h("label", { class: "field-label", for: "progress-code" }, "Progress code"),
    codeBox,
    h("div", { class: "actions" }, h("button", { type: "button", class: "button", onclick: loadCode }, "Load code")),
    status,
    h("h3", null, "Start over"),
    h(
      "div",
      { class: "actions wrap" },
      h("button", { type: "button", class: "button danger-outline", onclick: resetProfile }, `Reset ${profileName} progress`),
      h("button", { type: "button", class: "button danger-outline", onclick: resetAll }, "Reset everything"),
    ),
    confirmArea,
  );
}
