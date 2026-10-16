import { ACHIEVEMENTS, achievementProgress, type AchievementDef } from "../../../engine/src";
import { REWARDS } from "../achievements";
import type { App, Screen, ScreenView } from "../app";
import { badgeSvg } from "../components/badge";
import { topBar } from "../components/topBar";
import { h } from "../dom";

const TIER_NAMES = { bronze: "Bronze", silver: "Silver", gold: "Gold" } as const;

/** The trophy case: every badge by kind, with progress, mystery slots for secrets, and the rewards they unlock. */
export function trophiesScreen(app: App, screen: Screen): ScreenView {
  if (screen.name !== "trophies") throw new Error("trophies");
  const back = () => app.go(screen.returnTo ?? { name: "practice" });
  const state = app.profile;
  const earned = state.achievements.earned;
  const has = (d: AchievementDef) => earned[d.id] !== undefined;
  const total = ACHIEVEMENTS.length;
  const count = ACHIEVEMENTS.filter(has).length;
  const c = state.achievements.counters;
  const date = (at: number) => new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  const meter = (value: number, target: number, label: string) =>
    h(
      "span",
      { class: "badge-meter" },
      h("span", { class: "meter", role: "meter", "aria-valuemin": "0", "aria-valuemax": String(target), "aria-valuenow": String(value), "aria-label": label }, h("span", { style: { width: `${Math.round((value / target) * 100)}%` } })),
      h("span", { class: "fine" }, `${value.toLocaleString()} / ${target.toLocaleString()}`),
    );

  const card = (d: AchievementDef) => {
    const got = has(d);
    const p = got ? null : achievementProgress(state, d.id);
    const reward = d.reward ? REWARDS[d.reward] : null;
    return h(
      "li",
      { class: `badge-card${got ? " earned" : ""}` },
      badgeSvg(d, got, 52),
      h(
        "div",
        { class: "badge-text" },
        h("strong", null, d.name, h("span", { class: "sr-only" }, got ? ", earned" : ", not earned yet")),
        h("span", null, d.description),
        got ? h("span", { class: "fine" }, `Earned ${date(earned[d.id])}`) : p ? meter(p.value, p.target, `${d.name} progress`) : null,
        reward ? h("span", { class: "badge-reward" }, `${got ? "Unlocked" : "Unlocks"}: ${reward.name}`) : null,
      ),
    );
  };

  const milestones = ACHIEVEMENTS.filter((d) => d.group === "milestone");
  const themes = ACHIEVEMENTS.filter((d) => d.group === "theme");
  const secrets = ACHIEVEMENTS.filter((d) => d.group === "secret");
  const foundSecrets = secrets.filter(has);
  const tracks = [...new Set(ACHIEVEMENTS.filter((d) => d.group === "skill").map((d) => d.track!))];

  const trackRow = (track: string) => {
    const tiers = ACHIEVEMENTS.filter((d) => d.track === track);
    const next = tiers.find((d) => !has(d));
    const p = next ? achievementProgress(state, next.id) : null;
    const rewards = tiers.filter((d) => d.reward).map((d) => `${TIER_NAMES[d.tier!]}: ${REWARDS[d.reward!].name}`);
    return h(
      "li",
      { class: "track-card" },
      h(
        "div",
        { class: "track-medals" },
        tiers.map((d) => h("span", { class: "track-medal", title: `${TIER_NAMES[d.tier!]}: ${d.description}` }, badgeSvg(d, has(d), 44), h("span", { class: "fine" }, TIER_NAMES[d.tier!]))),
      ),
      h(
        "div",
        { class: "badge-text" },
        h("strong", null, tiers[0].name),
        h("span", null, next ? `Next, ${TIER_NAMES[next.tier!].toLowerCase()}: ${next.description}` : `All three earned. ${tiers[2].description.replace(/\.$/, "")}: done.`),
        p ? meter(p.value, p.target, `${tiers[0].name} progress`) : null,
        rewards.length ? h("span", { class: "badge-reward" }, `Rewards: ${rewards.join(", ")}`) : null,
      ),
    );
  };

  const main = h(
    "main",
    { class: "trophies" },
    h("h1", { tabindex: "-1" }, "Trophy case"),
    h(
      "p",
      { class: "lead" },
      `${count} of ${total} badges earned.`,
      (c.bestStreak ?? 0) > 0 ? ` Practice streak: ${c.streak ?? 0} day${c.streak === 1 ? "" : "s"} (best ${c.bestStreak}).` : "",
    ),
    h("div", { class: "actions wrap" }, h("button", { type: "button", class: "button", onclick: () => app.go({ name: "settings", returnTo: screen }) }, "Pick rewards in Settings")),
    h("section", { class: "panel" }, h("h2", null, "Milestones"), h("ul", { class: "badge-grid" }, milestones.map(card))),
    h(
      "section",
      { class: "panel" },
      h("h2", null, "Skills"),
      h("p", { class: "panel-lead" }, "Bronze, silver and gold for each skill."),
      h("ul", { class: "badge-grid tracks" }, tracks.map(trackRow)),
    ),
    h(
      "section",
      { class: "panel" },
      h("h2", null, "Secrets"),
      h("p", { class: "panel-lead" }, foundSecrets.length === secrets.length ? "You found every secret." : `${secrets.length - foundSecrets.length} of ${secrets.length} still hidden. Keep playing to stumble on them.`),
      h(
        "ul",
        { class: "badge-grid" },
        secrets.map((d) =>
          has(d)
            ? card(d)
            : h("li", { class: "badge-card mystery" }, badgeSvg(d, false, 52), h("div", { class: "badge-text" }, h("strong", null, "???"), h("span", null, "A secret badge."))),
        ),
      ),
    ),
    h("section", { class: "panel" }, h("h2", null, "Themes"), h("ul", { class: "badge-grid" }, themes.map(card))),
    h("p", { class: "fine" }, "Badges belong to this profile. Keyboard, touch and each keyboard layout keep their own; rewards from any of them can be used everywhere."),
  );
  const el = h("div", { class: "screen" }, topBar(app, { back, backLabel: "Back", returnTo: screen }), main);
  return { el };
}
