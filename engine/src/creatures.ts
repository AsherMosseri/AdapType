import {
  CREATURE_BABY_SAMPLES,
  CREATURE_DECAY_DAYS,
  CREATURE_GRACE_DAYS,
  CREATURE_GROWN_SAMPLES,
  CREATURE_GROWN_WEAKNESS,
  CREATURE_LEGENDARY_ERRORS,
  CREATURE_LEGENDARY_SAMPLES,
  CREATURE_LEGENDARY_SPEED,
  CREATURE_MIN_HEALTH,
  CREATURE_MIN_RECENCY,
  CREATURE_SICK_WEAKNESS,
} from "./constants";
import { modifierGoal } from "./modifiers";
import { DEFAULT_GOAL } from "./profile";
import { hashString } from "./rng";
import { weakness } from "./scoring";
import { dayOf } from "./stats";
import { wpmToMs } from "./typing";
import type { CharacterData, CreatureStage, Goal, ProfileState, StatEntry } from "./types";

export type CreatureGroup = "letters" | "numbers" | "punctuation" | "symbols";

/** Every key with a creature, in display order: letters, digits, punctuation, symbols. */
export function creatureKeys(chars: Pick<CharacterData, "punctuation" | "symbols">): { key: string; group: CreatureGroup }[] {
  const out: { key: string; group: CreatureGroup }[] = [];
  for (const k of "abcdefghijklmnopqrstuvwxyz") out.push({ key: k, group: "letters" });
  for (const k of "0123456789") out.push({ key: k, group: "numbers" });
  for (const k of chars.punctuation) out.push({ key: k, group: "punctuation" });
  for (const k of chars.symbols) out.push({ key: k, group: "symbols" });
  return out;
}

/** Letters use the goal; other keys use the slower modifier goal (they need Shift or a layer switch). */
export function creatureGoal(key: string, goal: Goal): Goal {
  return key >= "a" && key <= "z" ? goal : modifierGoal(goal);
}

/**
 * The stage a key's stats earn right now, or null when the key has never
 * been typed:
 *   legendary: n >= CREATURE_LEGENDARY_SAMPLES, msAvg <= CREATURE_LEGENDARY_SPEED x goal ms, errAvg <= CREATURE_LEGENDARY_ERRORS
 *   grown: n >= CREATURE_GROWN_SAMPLES and weakness <= CREATURE_GROWN_WEAKNESS
 *   baby: n >= CREATURE_BABY_SAMPLES
 *   egg: anything else typed at least once
 */
export function earnedStage(entry: StatEntry | undefined, goal: Goal): CreatureStage | null {
  if (!entry || entry.n === 0) return null;
  if (
    entry.n >= CREATURE_LEGENDARY_SAMPLES &&
    entry.timedN > 0 &&
    entry.msAvg <= CREATURE_LEGENDARY_SPEED * wpmToMs(goal.wpm) &&
    entry.errAvg <= CREATURE_LEGENDARY_ERRORS
  ) {
    return 3;
  }
  if (entry.n >= CREATURE_GROWN_SAMPLES && weakness(entry, goal) <= CREATURE_GROWN_WEAKNESS) return 2;
  if (entry.n >= CREATURE_BABY_SAMPLES) return 1;
  return 0;
}

/** The last day a key was typed: its newest keyDays entry, else the last round, else null. */
export function lastPracticedDay(state: ProfileState, key: string): number | null {
  const days = state.keyDays[key];
  if (days && days.length > 0) return days[days.length - 1][0];
  const last = state.rounds[state.rounds.length - 1];
  return last ? dayOf(last.at) : null;
}

/**
 * Health 0..1 = skill x recency, at least CREATURE_MIN_HEALTH.
 *   skill = clamp(1 - (weakness - GROWN_WEAKNESS) / (SICK_WEAKNESS - GROWN_WEAKNESS), 0, 1)
 *   recency = 1 for up to GRACE_DAYS without practice, then falls linearly to
 *   MIN_RECENCY over DECAY_DAYS more.
 * Rounded to 2 decimals.
 */
export function creatureHealth(entry: StatEntry | undefined, goal: Goal, daysSince: number): number {
  const w = weakness(entry, goal);
  const skill = Math.min(1, Math.max(0, 1 - (w - CREATURE_GROWN_WEAKNESS) / (CREATURE_SICK_WEAKNESS - CREATURE_GROWN_WEAKNESS)));
  const late = Math.max(0, daysSince - CREATURE_GRACE_DAYS);
  const recency = Math.max(CREATURE_MIN_RECENCY, 1 - ((1 - CREATURE_MIN_RECENCY) * late) / CREATURE_DECAY_DAYS);
  return Math.max(CREATURE_MIN_HEALTH, Math.round(skill * recency * 100) / 100);
}

export interface CreatureTraits {
  body: "round" | "tall" | "wide" | "pear";
  eyes: 1 | 2 | 3;
  top: "none" | "ears" | "horns" | "antenna" | "tuft";
  pattern: "plain" | "spots" | "stripes" | "belly";
  mouth: "smile" | "fangs" | "open" | "beak";
  tail: boolean;
  /** 0..359. Themes may map it to their own palette. */
  hue: number;
}

const BODIES = ["round", "tall", "wide", "pear"] as const;
const TOPS = ["none", "ears", "horns", "antenna", "tuft"] as const;
const PATTERNS = ["plain", "spots", "stripes", "belly"] as const;
const MOUTHS = ["smile", "fangs", "open", "beak"] as const;

/**
 * A key's look, the same in every theme and every port. With
 * h = hashString("creature:" + key): body = h & 3, eyes = (h >>> 2) % 3 + 1,
 * top = (h >>> 4) % 5, pattern = (h >>> 7) & 3, mouth = (h >>> 9) & 3,
 * tail = (h >>> 11) & 1, hue = (h >>> 12) % 360.
 */
export function creatureTraits(key: string): CreatureTraits {
  const h = hashString(`creature:${key}`);
  return {
    body: BODIES[h & 3],
    eyes: (((h >>> 2) % 3) + 1) as 1 | 2 | 3,
    top: TOPS[(h >>> 4) % 5],
    pattern: PATTERNS[(h >>> 7) & 3],
    mouth: MOUTHS[(h >>> 9) & 3],
    tail: ((h >>> 11) & 1) === 1,
    hue: (h >>> 12) % 360,
  };
}

export interface CreatureChange {
  key: string;
  from: CreatureStage | null;
  to: CreatureStage;
}

/**
 * Raises each creature to the stage its stats earn (stages never go down)
 * and returns the ones that reached baby or later this time, in roster order.
 * Eggs are recorded without being reported.
 */
export function updateCreatures(state: ProfileState, now: number, chars: Pick<CharacterData, "punctuation" | "symbols">): CreatureChange[] {
  const goal = state.goal ?? DEFAULT_GOAL;
  const changes: CreatureChange[] = [];
  for (const { key } of creatureKeys(chars)) {
    const earned = earnedStage(state.keys[key], creatureGoal(key, goal));
    if (earned === null) continue;
    const current = state.creatures[key];
    if (current && current.stage >= earned) continue;
    state.creatures[key] = { stage: earned, at: now };
    if (earned >= 1) changes.push({ key, from: current ? current.stage : null, to: earned });
  }
  return changes;
}

export interface CreatureView {
  key: string;
  group: CreatureGroup;
  /** Null when you haven't met it yet. */
  stage: CreatureStage | null;
  health: number;
  /** Days since you last typed it, or null if never. */
  daysSince: number | null;
  traits: CreatureTraits;
}

/** Every creature for the collection screen. */
export function creatureViews(state: ProfileState, now: number, chars: Pick<CharacterData, "punctuation" | "symbols">): CreatureView[] {
  const goal = state.goal ?? DEFAULT_GOAL;
  const today = dayOf(now);
  return creatureKeys(chars).map(({ key, group }) => {
    const record = state.creatures[key];
    const last = record ? lastPracticedDay(state, key) : null;
    const daysSince = last === null ? null : Math.max(0, today - last);
    return {
      key,
      group,
      stage: record ? record.stage : null,
      health: record ? creatureHealth(state.keys[key], creatureGoal(key, goal), daysSince ?? 0) : 0,
      daysSince,
      traits: creatureTraits(key),
    };
  });
}
