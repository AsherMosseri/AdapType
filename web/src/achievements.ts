// Achievements in the app: the context each activity is recorded in, the
// reward names, and the "new badge" panel shown on results screens.
import {
  achievementById,
  earnedRewards,
  recordAchievements,
  type AchievementContext,
  type AchievementEvent,
  type RewardId,
} from "../../engine/src";
import { announce } from "./announce";
import type { App } from "./app";
import { activeEffect, isDark } from "./appearance";
import { badgeSvg } from "./components/badge";
import { celebrate } from "./components/celebrate";
import { h } from "./dom";
import { localDate } from "./screens/daily";
import { playSound } from "./sound";
import type { RewardKind } from "./store";

export const REWARD_KINDS: { kind: RewardKind; name: string; none: string }[] = [
  { kind: "cursor", name: "Cursor", none: "Standard" },
  { kind: "accessory", name: "Creature accessory", none: "None" },
  { kind: "effect", name: "Celebration", none: "None" },
  { kind: "style", name: "Heatmap and card", none: "Standard" },
];

export const REWARDS: Record<RewardId, { kind: RewardKind; value: string; name: string }> = {
  "cursor:block": { kind: "cursor", value: "block", name: "Block cursor" },
  "cursor:underline": { kind: "cursor", value: "underline", name: "Underline cursor" },
  "cursor:glow": { kind: "cursor", value: "glow", name: "Glowing cursor" },
  "cursor:rainbow": { kind: "cursor", value: "rainbow", name: "Rainbow cursor" },
  "cursor:creature": { kind: "cursor", value: "creature", name: "Creature cursor" },
  "accessory:hat": { kind: "accessory", value: "hat", name: "Hats" },
  "accessory:scarf": { kind: "accessory", value: "scarf", name: "Scarves" },
  "accessory:glasses": { kind: "accessory", value: "glasses", name: "Glasses" },
  "accessory:crown": { kind: "accessory", value: "crown", name: "Party crowns" },
  "effect:confetti": { kind: "effect", value: "confetti", name: "Confetti" },
  "effect:fireworks": { kind: "effect", value: "fireworks", name: "Fireworks" },
  "effect:sparks": { kind: "effect", value: "sparks", name: "Pixel sparks" },
  "effect:bubbles": { kind: "effect", value: "bubbles", name: "Bubbles" },
  "style:gold": { kind: "style", value: "gold", name: "Gold finish" },
  "style:neon": { kind: "style", value: "neon", name: "Neon finish" },
  "style:holo": { kind: "style", value: "holo", name: "Holographic finish" },
};

/** When and how the player is playing, for streaks, secret badges and theme badges. */
export function achievementContext(app: App): AchievementContext {
  const s = app.data.settings;
  return { day: localDate(), hour: new Date().getHours(), theme: s.theme, dark: isDark(), sound: s.sound.on };
}

/** Rewards earned in any profile (keyboard, touch and each layout share them). */
export function availableRewards(app: App): Set<RewardId> {
  const out = new Set<RewardId>();
  for (const p of Object.values(app.data.profiles)) if (p?.achievements) for (const r of earnedRewards(p)) out.add(r);
  return out;
}

/**
 * Records an activity and returns the badges it earned. A newly unlocked
 * reward is switched on if nothing of its kind was picked yet.
 */
export function earn(app: App, event: AchievementEvent): string[] {
  const ids = recordAchievements(app.profile, event, achievementContext(app), Date.now());
  equipNew(app, ids);
  app.persist();
  return ids;
}

/** Switches on rewards these badges unlocked, where nothing of that kind is picked yet. */
function equipNew(app: App, ids: readonly string[]): void {
  const picked = app.data.settings.rewards;
  let changed = false;
  for (const id of ids) {
    const reward = achievementById(id)?.reward;
    if (!reward) continue;
    const r = REWARDS[reward];
    if (picked[r.kind] === "none") {
      picked[r.kind] = r.value;
      changed = true;
    }
  }
  if (changed) app.applyLook();
}

/**
 * Looks at saved progress at launch. The first time (right after the update
 * that added badges) this awards what was already earned; returns how many
 * the active profile got that way.
 */
export function checkAchievementsAtLaunch(app: App): number {
  let backfilled = 0;
  for (const [key, p] of Object.entries(app.data.profiles)) {
    if (!p) continue;
    const first = !p.achievements.backfilled;
    const ids = recordAchievements(p, { kind: "check" }, achievementContext(app), Date.now());
    equipNew(app, ids);
    if (first && key === app.profileKey) backfilled = ids.length;
  }
  app.persist();
  return backfilled;
}

/** Results already celebrated, so coming back to the same results screen doesn't celebrate again. */
const celebrated = new WeakSet<object>();

/**
 * The "new badge" panel for a results screen, with a sound, the picked
 * celebration and an announcement the first time it's shown for `once`.
 * Null when nothing was earned.
 */
export function newBadgesPanel(app: App, ids: readonly string[], once: object = {}): HTMLElement | null {
  const defs = ids.map((id) => achievementById(id)).filter((d) => d !== undefined);
  if (defs.length === 0) return null;
  if (!celebrated.has(once)) {
    celebrated.add(once);
    playSound("levelUp");
    celebrate(activeEffect());
    announce(`New badge${defs.length > 1 ? "s" : ""}: ${defs.map((d) => d.name).join(", ")}.`);
  }
  return h(
    "section",
    { class: "panel new-badges", "aria-label": "New badges" },
    h("h2", null, defs.length > 1 ? `${defs.length} new badges` : "New badge"),
    h(
      "ul",
      { class: "badge-list" },
      defs.map((d) => {
        const reward = d.reward ? REWARDS[d.reward] : null;
        return h(
          "li",
          { class: "badge-row pop" },
          badgeSvg(d, true, 56),
          h(
            "div",
            { class: "badge-text" },
            h("strong", null, d.tier ? `${d.name} (${d.tier})` : d.name),
            h("span", null, d.description),
            reward ? h("span", { class: "badge-reward" }, `Unlocked: ${reward.name}. Pick rewards in Settings, under Rewards.`) : null,
          ),
        );
      }),
    ),
    h("div", { class: "actions" }, h("button", { type: "button", class: "text-button", onclick: () => app.go({ name: "trophies", returnTo: { name: "practice" } }) }, "Open the trophy case")),
  );
}
