import { isCalibrating, isOn } from "../../../engine/src";
import type { App, Screen } from "../app";
import { codeLanguages } from "../content";
import { h, icon, ICONS } from "../dom";
import { localDate } from "../screens/daily";

/** Sent on the window when the menu opens, so a running game can pause. */
export const MENU_OPEN = "adaptype:menuopen";

interface MenuItem {
  label: string;
  hint: string;
  icon: readonly string[];
  to: Screen;
  /** Screens that count as this item, for marking the current one. */
  matches: Screen["name"][];
  badge?: string;
}

/** Everything in the app, grouped, with what to show on this profile right now. */
function menuGroups(app: App, returnTo: Screen): { title: string; items: MenuItem[] }[] {
  const state = app.profile;
  const settings = app.data.settings;
  const touch = settings.activeProfile === "touch";
  // The warm-up rounds right after the test measure every key; practice keeps the extras away until they're done.
  const warmingUp = isCalibrating(state);
  const practice: MenuItem[] = [
    { label: "Practice", hint: "Rounds built around your weak keys", icon: touch ? ICONS.phone : ICONS.keyboard, to: { name: "practice" }, matches: ["practice", "results", "session"] },
  ];
  if (!warmingUp) {
    practice.push(
      { label: "Daily challenge", hint: "The same words for everyone today", icon: ICONS.calendar, to: { name: "daily" }, matches: ["daily"], badge: state.daily[localDate()] ? "Done" : undefined },
      { label: "Code", hint: `Snippets in ${codeLanguages.length} languages`, icon: ICONS.code, to: { name: "passages", kind: "code" }, matches: [] },
      { label: "Quotes", hint: "Passages from public-domain books", icon: ICONS.quote, to: { name: "passages", kind: "quotes" }, matches: [] },
    );
    if (!touch && isOn("shortcuts", state, settings.modifiers)) {
      practice.push({ label: "Shortcut drill", hint: "Keyboard shortcuts for the apps you use", icon: ICONS.command, to: { name: "shortcuts" }, matches: ["shortcuts"] });
    }
  }
  return [
    { title: "Practice", items: practice },
    {
      title: "Play",
      items: [{ label: "Arcade", hint: "Falling words, survival and races", icon: ICONS.arcade, to: { name: "arcade" }, matches: ["arcade", "arcade-game", "race"] }],
    },
    {
      title: "You",
      items: [
        { label: "Progress", hint: "Speed, accuracy and every key", icon: ICONS.progress, to: { name: "progress", returnTo }, matches: ["progress"] },
        { label: "Creatures", hint: "One for each key you practice", icon: ICONS.creature, to: { name: "collection", returnTo }, matches: ["collection"] },
        { label: "Replays", hint: "Watch your rounds back", icon: ICONS.replay, to: { name: "replays", returnTo }, matches: ["replays", "replay"] },
        { label: "Fingerprint card", hint: "Your typing on one card", icon: ICONS.card, to: { name: "card", returnTo }, matches: ["card"] },
      ],
    },
  ];
}

function isCurrent(item: MenuItem, current: Screen | null): boolean {
  if (!current) return false;
  if (current.name === "passages" && item.to.name === "passages") return current.kind === item.to.kind;
  return item.matches.includes(current.name);
}

/** Opens the menu as a modal panel. Keys pressed in it never reach the round or game behind it. */
function openMenu(app: App, returnTo: Screen, opener: HTMLElement): void {
  const current = app.screen;
  let going: Screen | null = null;
  const go = (to: Screen) => {
    going = to;
    dialog.close();
  };
  const groups = menuGroups(app, returnTo).map((group, g) =>
    h(
      "section",
      { class: "menu-group", "aria-labelledby": `menu-group-${g}` },
      h("h3", { id: `menu-group-${g}` }, group.title),
      h(
        "ul",
        { class: "menu-list" },
        group.items.map((item) => {
          const here = isCurrent(item, current);
          return h(
            "li",
            null,
            h(
              "button",
              { type: "button", class: "menu-item", "aria-current": here ? "page" : undefined, onclick: () => go(item.to) },
              icon([...item.icon]),
              h("span", { class: "menu-text" }, h("strong", null, item.label), h("span", null, item.hint)),
              item.badge ? h("span", { class: "menu-badge" }, item.badge) : null,
            ),
          );
        }),
      ),
    ),
  );
  const footer = h(
    "div",
    { class: "menu-footer" },
    h("button", { type: "button", class: "button", onclick: () => go({ name: "settings", returnTo }) }, icon([...ICONS.settings]), "Settings"),
    h("button", { type: "button", class: "button", onclick: () => go({ name: "about", returnTo }) }, icon([...ICONS.info]), "About"),
  );
  const closeButton = h("button", { type: "button", class: "icon-button", "aria-label": "Close menu", onclick: () => dialog.close() }, icon([...ICONS.close]));
  const dialog = h(
    "dialog",
    { class: "menu-sheet", "aria-labelledby": "menu-title" },
    h("div", { class: "menu-head" }, h("h2", { id: "menu-title" }, "Menu"), closeButton),
    groups,
    footer,
  );
  // Stop keys at the panel: practice, games and replays listen on the window.
  dialog.addEventListener("keydown", (e) => e.stopPropagation());
  // A click on the backdrop (outside the panel's box) closes it.
  dialog.addEventListener("click", (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (going) {
      app.persist();
      app.go(going);
    } else {
      // Back to typing if a typing screen is behind the menu, otherwise to the menu button.
      const capture = document.querySelector<HTMLElement>(".capture-input");
      (capture ?? opener).focus({ preventScroll: true });
    }
  });
  window.dispatchEvent(new Event(MENU_OPEN));
  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector<HTMLElement>('[aria-current="page"]')?.focus();
}

/** The top bar's menu button. */
export function menuButton(app: App, returnTo: Screen = { name: "practice" }): HTMLElement {
  const button: HTMLButtonElement = h(
    "button",
    { type: "button", class: "icon-button menu-button", "aria-haspopup": "dialog", onclick: () => openMenu(app, returnTo, button) },
    icon([...ICONS.menu]),
    h("span", { class: "menu-label" }, "Menu"),
  );
  return button;
}
