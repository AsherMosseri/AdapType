import {
  CREATURE_BABY_SAMPLES,
  CREATURE_GROWN_SAMPLES,
  CREATURE_LEGENDARY_SAMPLES,
  creatureViews,
  forecastKey,
  type CreatureGroup,
  type CreatureView,
} from "../../../engine/src";
import type { App, Screen, ScreenView } from "../app";
import { creatureSvg, STAGE_NAMES } from "../components/creature";
import { topBar } from "../components/topBar";
import { characters } from "../content";
import { h } from "../dom";
import { forecastText, isTimed } from "../forecastText";

const GROUPS: { id: CreatureGroup; title: string }[] = [
  { id: "letters", title: "Letters" },
  { id: "numbers", title: "Numbers" },
  { id: "punctuation", title: "Punctuation" },
  { id: "symbols", title: "Symbols" },
];

/** The space bar's name for a key, for screen readers and the detail panel. */
export function keyName(key: string): string {
  return key === " " ? "space" : key;
}

export function mood(health: number): string {
  return health >= 0.75 ? "Thriving" : health >= 0.4 ? "Doing okay" : "Needs practice";
}

/** Every key's creature: met ones drawn at their stage, the rest as silhouettes. */
export function collectionScreen(app: App, screen: Screen): ScreenView {
  const returnTo = screen.name === "collection" ? screen.returnTo : undefined;
  const state = app.profile;
  const now = Date.now();
  const views = creatureViews(state, now, characters);
  const met = views.filter((v) => v.stage !== null).length;
  const counts = [0, 1, 2, 3].map((s) => views.filter((v) => v.stage === s).length);

  const detail = h("section", { class: "panel creature-detail", "aria-live": "polite" });
  detail.hidden = true;

  const show = (v: CreatureView, button: HTMLElement) => {
    for (const b of grid.querySelectorAll(".creature-cell[aria-pressed='true']")) b.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-pressed", "true");
    detail.hidden = false;
    detail.replaceChildren(...detailContent(v));
    detail.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const detailContent = (v: CreatureView): (HTMLElement | SVGElement)[] => {
    const name = `${keyName(v.key)} creature`;
    if (v.stage === null) {
      return [
        creatureSvg(v.traits, null, { size: 96, label: `Unmet ${name}` }),
        h("div", null, h("h2", null, `The ${keyName(v.key)} creature`), h("p", null, `You haven't met it yet. Type ${keyName(v.key)} in a round to find its egg.`)),
      ];
    }
    const entry = state.keys[v.key];
    const n = entry?.n ?? 0;
    const forecast = forecastKey(state, v.key, now);
    let next: string;
    if (v.stage === 0) next = `Hatches after ${CREATURE_BABY_SAMPLES} presses (${n} so far).`;
    else if (v.stage === 1)
      next =
        n < CREATURE_GROWN_SAMPLES
          ? `Grows up once ${keyName(v.key)} is close to your goal, after ${CREATURE_GROWN_SAMPLES} presses (${n} so far).`
          : `Grows up once ${keyName(v.key)} is close to your goal. ${isTimed(forecast) ? `Forecast: ${forecastText(forecast, "key")}.` : forecastText(forecast, "key") + "."}`;
    else if (v.stage === 2)
      next = `Becomes legendary when ${keyName(v.key)} is well past your goal with almost no mistakes, over ${CREATURE_LEGENDARY_SAMPLES} presses (${n} so far).`;
    else next = "Fully evolved. Keep it healthy by practicing now and then.";
    const days = v.daysSince === null ? "" : v.daysSince === 0 ? "Typed today." : v.daysSince === 1 ? "Last typed yesterday." : `Last typed ${v.daysSince} days ago.`;
    return [
      creatureSvg(v.traits, v.stage, { size: 112, health: v.health, label: `${STAGE_NAMES[v.stage]} ${name}` }),
      h(
        "div",
        null,
        h("h2", null, `The ${keyName(v.key)} creature`),
        h("p", { class: "stage-line" }, h("strong", null, STAGE_NAMES[v.stage]), ` · ${mood(v.health)}`),
        h(
          "div",
          { class: "health-meter", role: "img", "aria-label": `Health ${Math.round(v.health * 100)}%` },
          h("span", { style: `width:${Math.round(v.health * 100)}%` }),
        ),
        h("p", { class: "fine" }, `${days} Health follows how well you type ${keyName(v.key)} and how recently you practiced it.`),
        h("p", null, next),
      ),
    ];
  };

  const grid = h(
    "div",
    { class: "collection" },
    GROUPS.map((g) => {
      const list = views.filter((v) => v.group === g.id);
      return h(
        "section",
        { class: "creature-group" },
        h("h2", null, `${g.title} `, h("span", { class: "fine" }, `${list.filter((v) => v.stage !== null).length} of ${list.length}`)),
        h(
          "div",
          { class: "creature-grid" },
          list.map((v) => {
            const label = v.stage === null ? `${keyName(v.key)}, not met yet` : `${keyName(v.key)}, ${STAGE_NAMES[v.stage].toLowerCase()}, ${mood(v.health).toLowerCase()}`;
            const button = h(
              "button",
              { type: "button", class: `creature-cell${v.stage === null ? " unmet" : ""}`, "aria-pressed": "false", "aria-label": label },
              creatureSvg(v.traits, v.stage, { size: 56, health: v.health }),
              h("span", { class: "creature-key" }, keyName(v.key)),
            );
            button.addEventListener("click", () => show(v, button));
            return button;
          }),
        ),
      );
    }),
  );

  const el = h(
    "div",
    { class: "screen" },
    topBar(app, { back: () => (returnTo ? app.go(returnTo) : app.go({ name: "progress" })), backLabel: "Progress" }),
    h(
      "main",
      { class: "collection-screen" },
      h("h1", { tabindex: "-1" }, "Creatures"),
      h(
        "p",
        { class: "lead" },
        met === 0
          ? "Every key has a creature. Type a key and you'll find its egg."
          : `You've met ${met} of ${views.length}. Each grows as its key gets faster and more accurate, and gets sleepy if you neglect it.`,
      ),
      met > 0
        ? h(
            "ul",
            { class: "stage-counts" },
            counts.map((c, i) => h("li", null, h("span", { class: "num" }, String(c)), ` ${c === 1 ? STAGE_NAMES[i].toLowerCase() : ["eggs", "babies", "grown", "legendary"][i]}`)),
          )
        : null,
      detail,
      grid,
    ),
  );
  return { el };
}
