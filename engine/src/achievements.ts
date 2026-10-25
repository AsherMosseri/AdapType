// Achievements (phase 7): badges for milestones, skill tiers, secrets and
// themes. Each activity reports what happened; counters update and any badge
// whose condition is now met is awarded. See spec section 38.

import { DEFAULT_GOAL } from "./profile";
import { dateNumber } from "./daily";
import type { TypingRound } from "./typing";
import type { LivesMode, ProfileState } from "./types";

export type AchievementGroup = "milestone" | "skill" | "secret" | "theme";
export type AchievementTier = "bronze" | "silver" | "gold";

/** Cosmetic extras some badges unlock. The app decides how each one looks. */
export type RewardId =
  | "cursor:block"
  | "cursor:underline"
  | "cursor:glow"
  | "cursor:rainbow"
  | "cursor:creature"
  | "accessory:hat"
  | "accessory:scarf"
  | "accessory:glasses"
  | "accessory:crown"
  | "effect:confetti"
  | "effect:fireworks"
  | "effect:sparks"
  | "effect:bubbles"
  | "style:gold"
  | "style:neon"
  | "style:holo";

/** When and how it happened: the local date and hour, and the look in use (for theme badges). */
export interface AchievementContext {
  /** Local date, YYYY-MM-DD. */
  day: string;
  /** Local hour, 0 to 23. */
  hour: number;
  theme: string;
  dark: boolean;
  sound: boolean;
}

/** What just happened. "check" only looks at saved progress (for example, at launch). */
export type AchievementEvent =
  | { kind: "check" }
  | {
      kind: "round" | "passage" | "daily" | "course";
      wpm: number;
      accuracy: number;
      /** Characters typed correctly. */
      chars: number;
      durationMs: number;
      /** Rhythm consistency 0..1 (practice rounds only), or null. */
      consistency: number | null;
      /** Words typed fully and correctly. */
      words: readonly string[];
    }
  | { kind: "arcade"; score: number; level: number; lives: LivesMode }
  /** marginMs: the gap between the two finish times (always positive), or null if the opponent didn't finish. */
  | { kind: "race"; ghost: boolean; won: boolean | null; marginMs: number | null }
  /** A finished rhythm song: misses counts every missed note. */
  | { kind: "rhythm"; score: number; maxCombo: number; misses: number; notes: number }
  | { kind: "drill" };

type TypingEvent = Extract<AchievementEvent, { kind: "round" | "passage" | "daily" | "course" }>;

export interface AchievementDef {
  id: string;
  group: AchievementGroup;
  name: string;
  description: string;
  /** Skill tracks: bronze, silver and gold share a track. */
  track?: string;
  tier?: AchievementTier;
  /** Theme badges: the theme they belong to. */
  theme?: string;
  reward?: RewardId;
  /** Counter-style badges: what's measured and the target, for progress bars. */
  progress?: (state: ProfileState) => number;
  target?: number;
  /** Met by the saved state (checked after every event). */
  met?: (state: ProfileState) => boolean;
  /** Met by this event. */
  on?: (event: AchievementEvent, state: ProfileState, ctx: AchievementContext) => boolean;
}

export const SPEED_MIN_CHARS = 50;
export const PERFECT_MIN_CHARS = 100;
export const ACCURATE_ROUND = 0.97;
export const STEADY_ROUND = 0.75;
export const THEME_ROUNDS = 20;
export const PHOTO_FINISH_MS = 100;
export const MARATHON_MS = 10 * 60 * 1000;

const counter = (state: ProfileState, key: string) => state.achievements.counters[key] ?? 0;
const isTyping = (e: AchievementEvent): e is TypingEvent => e.kind === "round" || e.kind === "passage" || e.kind === "daily" || e.kind === "course";
const letterCount = (state: ProfileState) => state.unlocked.filter((c) => c >= "a" && c <= "z").length;
const stages = (state: ProfileState) => Object.values(state.creatures).map((c) => c.stage);
const bestArcade = (state: ProfileState) => Math.max(0, ...[...(state.arcade.scores.falling ?? []), ...(state.arcade.scores.survival ?? [])].map((s) => s.score));

function counted(id: string, name: string, description: string, key: string, target: number, extra: Partial<AchievementDef> = {}): AchievementDef {
  return { id, group: "milestone", name, description, progress: (s) => counter(s, key), target, met: (s) => counter(s, key) >= target, ...extra };
}

function tiers(track: string, name: string, unit: (n: number) => string, measure: (s: ProfileState) => number, targets: [number, number, number], rewards: (RewardId | undefined)[] = []): AchievementDef[] {
  return (["bronze", "silver", "gold"] as const).map((tier, i) => ({
    id: `${track}-${tier}`,
    group: "skill" as const,
    name,
    description: unit(targets[i]),
    track,
    tier,
    reward: rewards[i],
    progress: measure,
    target: targets[i],
    met: (s: ProfileState) => measure(s) >= targets[i],
  }));
}

const speed = (wpm: number, reward?: RewardId): AchievementDef => ({
  id: `speed-${wpm}`,
  group: "milestone",
  name: `${wpm} WPM`,
  description: `Type ${wpm} WPM or faster at your accuracy goal.`,
  reward,
  progress: (s) => Math.floor(counter(s, "bestWpm")),
  target: wpm,
  met: (s) => counter(s, "bestWpm") >= wpm,
});

const themed = (theme: string, name: string, description: string, key = `theme:${theme}`): AchievementDef => ({
  id: `theme-${theme}`,
  group: "theme",
  name,
  description,
  theme,
  progress: (s) => counter(s, key),
  target: THEME_ROUNDS,
  met: (s) => counter(s, key) >= THEME_ROUNDS,
});

/** Every badge, in the order the trophy case shows them. */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  speed(40, "cursor:block"),
  speed(60, "cursor:glow"),
  speed(80, "effect:fireworks"),
  speed(100, "cursor:rainbow"),
  speed(120, "style:holo"),
  { id: "letters-half", group: "milestone", name: "Halfway there", description: "Unlock 13 letters.", reward: "cursor:underline", progress: letterCount, target: 13, met: (s) => letterCount(s) >= 13 },
  { id: "letters-all", group: "milestone", name: "The whole alphabet", description: "Unlock all 26 letters.", reward: "accessory:crown", progress: letterCount, target: 26, met: (s) => letterCount(s) >= 26 },
  counted("streak-3", "Three in a row", "Practice 3 days in a row.", "bestStreak", 3, { reward: "effect:confetti" }),
  counted("streak-7", "A whole week", "Practice 7 days in a row.", "bestStreak", 7, { reward: "accessory:scarf" }),
  counted("streak-30", "Habit formed", "Practice 30 days in a row.", "bestStreak", 30, { reward: "style:neon" }),
  counted("streak-100", "Unstoppable", "Practice 100 days in a row.", "bestStreak", 100),
  { id: "nemesis-1", group: "milestone", name: "Nemesis defeated", description: "Beat a nemesis key.", reward: "effect:sparks", progress: (s) => s.arcade.hall.length, target: 1, met: (s) => s.arcade.hall.length >= 1 },
  { id: "nemesis-5", group: "milestone", name: "Hall of defeated", description: "Beat 5 nemesis keys.", progress: (s) => s.arcade.hall.length, target: 5, met: (s) => s.arcade.hall.length >= 5 },
  { id: "creature-grown", group: "milestone", name: "All grown up", description: "Grow a key creature.", reward: "accessory:hat", met: (s) => stages(s).some((x) => x >= 2) },
  { id: "creature-legendary", group: "milestone", name: "Legendary", description: "Raise a legendary key creature.", reward: "cursor:creature", met: (s) => stages(s).some((x) => x >= 3) },
  { id: "course-done", group: "milestone", name: "Every key on the board", description: "Finish the numbers and symbols path.", met: (s) => s.course.finished },
  {
    id: "creatures-letters",
    group: "milestone",
    name: "Full menagerie",
    description: "Grow the creature for every letter.",
    progress: (s) => [..."abcdefghijklmnopqrstuvwxyz"].filter((c) => (s.creatures[c]?.stage ?? 0) >= 2).length,
    target: 26,
    met: (s) => [..."abcdefghijklmnopqrstuvwxyz"].every((c) => (s.creatures[c]?.stage ?? 0) >= 2),
  },
  ...tiers("accuracy", "Sharpshooter", (n) => `Finish ${n} rounds at 97% accuracy or better.`, (s) => counter(s, "accurateRounds"), [10, 50, 200], [undefined, "accessory:glasses", "style:gold"]),
  ...tiers("rhythm", "Steady hands", (n) => `Keep an even rhythm (75% or steadier) in ${n} rounds.`, (s) => counter(s, "steadyRounds"), [5, 25, 100], [undefined, "effect:bubbles"]),
  ...tiers("arcade", "Arcade ace", (n) => `Score ${n.toLocaleString("en-US")} in falling words or survival.`, bestArcade, [1000, 5000, 15000]),
  ...tiers("groove", "In the groove", (n) => `Hit ${n} notes in a row in rhythm mode.`, (s) => counter(s, "bestCombo"), [25, 50, 100]),
  ...tiers("races", "Racer", (n) => (n === 1 ? "Win a race." : `Win ${n} races.`), (s) => counter(s, "racesWon"), [1, 10, 50]),
  ...tiers("daily", "Daily regular", (n) => `Play ${n} daily challenges.`, (s) => Object.keys(s.daily).length, [3, 15, 50]),
  ...tiers("passages", "Well read", (n) => `Finish ${n} code snippets or quotes.`, (s) => counter(s, "passages"), [5, 25, 100]),
  ...tiers("drills", "Shortcut pro", (n) => `Finish ${n} shortcut drills.`, (s) => counter(s, "drills"), [3, 15, 50]),
  ...tiers("rounds", "Dedicated", (n) => `Finish ${n} practice rounds.`, (s) => counter(s, "rounds"), [10, 100, 500]),
  { id: "perfect", group: "secret", name: "Flawless", description: "Finish a round of 100 or more characters without a single mistake.", on: (e) => isTyping(e) && e.accuracy === 1 && e.chars >= PERFECT_MIN_CHARS },
  { id: "night-owl", group: "secret", name: "Night owl", description: "Type between 2 and 4 in the morning.", on: (e, _s, ctx) => isTyping(e) && (ctx.hour === 2 || ctx.hour === 3) },
  { id: "early-bird", group: "secret", name: "Early bird", description: "Type between 5 and 6 in the morning.", on: (e, _s, ctx) => isTyping(e) && ctx.hour === 5 },
  { id: "the-1000", group: "secret", name: "The the", description: 'Type the word "the" 1,000 times.', met: (s) => counter(s, "word:the") >= 1000 },
  { id: "photo-finish", group: "secret", name: "Photo finish", description: "Lose to your own ghost by less than a tenth of a second.", on: (e) => e.kind === "race" && e.ghost && e.won === false && e.marginMs !== null && e.marginMs < PHOTO_FINISH_MS },
  { id: "marathon", group: "secret", name: "Marathon", description: "Keep a single round going for 10 minutes.", on: (e) => e.kind === "round" && e.durationMs >= MARATHON_MS },
  { id: "tortoise", group: "secret", name: "Slow and steady", description: "Finish a round under 20 WPM with no mistakes.", on: (e) => e.kind === "round" && e.accuracy === 1 && e.wpm < 20 && e.chars >= SPEED_MIN_CHARS },
  { id: "full-combo", group: "secret", name: "Full combo", description: "Finish a rhythm song without missing a note.", on: (e) => e.kind === "rhythm" && e.misses === 0 && e.notes > 0 },
  { id: "hardcore", group: "secret", name: "Iron fingers", description: "Reach level 5 in hardcore mode.", on: (e) => e.kind === "arcade" && e.lives === "hardcore" && e.level >= 5 },
  themed("clean", "Minimalist", `Play ${THEME_ROUNDS} times in the clean theme.`),
  themed("terminal", "Hacker", `Play ${THEME_ROUNDS} times in the terminal theme.`),
  themed("cute", "Best friends", `Play ${THEME_ROUNDS} times in the cute theme.`),
  themed("mechanical", "Clack clack", `Play ${THEME_ROUNDS} times in the mechanical theme with sound on.`, "clack"),
  { ...themed("dark", "Night shift", `Play ${THEME_ROUNDS} times in dark mode.`, "dark"), theme: undefined },
];

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function achievementById(id: string): AchievementDef | undefined {
  return BY_ID.get(id);
}

/** Progress toward a counter-style badge, or null for badges that are simply met or not. */
export function achievementProgress(state: ProfileState, id: string): { value: number; target: number } | null {
  const def = BY_ID.get(id);
  if (!def?.progress || def.target === undefined) return null;
  return { value: Math.min(def.target, def.progress(state)), target: def.target };
}

/** Words typed fully and correctly so far (lowercase), for word counters. */
export function typedWords(round: TypingRound): string[] {
  const words: string[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(round.target))) {
    const end = m.index + m[0].length;
    if (end > round.position) break;
    let ok = true;
    for (let i = m.index; i < end && ok; i++) ok = round.isCorrectAt(i);
    if (ok) words.push(m[0].toLowerCase());
  }
  return words;
}

/** Rewards earned in this profile. */
export function earnedRewards(state: ProfileState): RewardId[] {
  return ACHIEVEMENTS.filter((a) => a.reward && state.achievements.earned[a.id] !== undefined).map((a) => a.reward!);
}

function bump(state: ProfileState, key: string, by = 1): void {
  state.achievements.counters[key] = counter(state, key) + by;
}

/** Counts a day of practice toward the streak (days are date numbers, see dateNumber). */
function practiceDay(state: ProfileState, day: number): void {
  const c = state.achievements.counters;
  if (c.streakDay === day) return;
  c.streak = c.streakDay === day - 1 ? (c.streak ?? 0) + 1 : 1;
  c.streakDay = day;
  c.bestStreak = Math.max(c.bestStreak ?? 0, c.streak);
}

/**
 * Fills in counters from progress made before achievements existed: best
 * speed and accurate, steady and practice rounds from recent rounds and daily
 * results, and streaks from the days with key results.
 */
function backfill(state: ProfileState): void {
  const goalAccuracy = (state.goal ?? DEFAULT_GOAL).accuracy;
  const c = state.achievements.counters;
  for (const r of state.rounds) {
    if (r.calibration) continue;
    c.rounds = (c.rounds ?? 0) + 1;
    if (r.accuracy >= goalAccuracy && r.chars >= SPEED_MIN_CHARS) c.bestWpm = Math.max(c.bestWpm ?? 0, r.wpm);
    if (r.accuracy >= ACCURATE_ROUND && r.chars >= SPEED_MIN_CHARS) c.accurateRounds = (c.accurateRounds ?? 0) + 1;
    if (r.consistency != null && r.consistency >= STEADY_ROUND) c.steadyRounds = (c.steadyRounds ?? 0) + 1;
  }
  for (const d of Object.values(state.daily)) {
    if (d.accuracy >= goalAccuracy) c.bestWpm = Math.max(c.bestWpm ?? 0, d.wpm);
  }
  const days = new Set<number>();
  for (const entries of Object.values(state.keyDays)) for (const [day] of entries) days.add(day);
  for (const day of [...days].sort((a, b) => a - b)) practiceDay(state, day);
}

/**
 * Records an event and returns the badges it newly earned, in catalog order.
 * The first call on a profile also counts progress made before achievements
 * existed (see backfill).
 */
export function recordAchievements(state: ProfileState, event: AchievementEvent, ctx: AchievementContext, now: number): string[] {
  const a = state.achievements;
  if (!a.backfilled) {
    backfill(state);
    a.backfilled = true;
  }
  if (event.kind !== "check") {
    practiceDay(state, dateNumber(ctx.day));
    bump(state, `theme:${ctx.theme}`);
    if (ctx.dark) bump(state, "dark");
    if (ctx.theme === "mechanical" && ctx.sound) bump(state, "clack");
  }
  if (isTyping(event)) {
    const goalAccuracy = (state.goal ?? DEFAULT_GOAL).accuracy;
    if (event.kind === "round") bump(state, "rounds");
    if (event.kind === "passage") bump(state, "passages");
    if (event.accuracy >= goalAccuracy && event.chars >= SPEED_MIN_CHARS) a.counters.bestWpm = Math.max(counter(state, "bestWpm"), event.wpm);
    if (event.accuracy >= ACCURATE_ROUND && event.chars >= SPEED_MIN_CHARS) bump(state, "accurateRounds");
    if (event.consistency !== null && event.consistency >= STEADY_ROUND) bump(state, "steadyRounds");
    const the = event.words.filter((w) => w === "the").length;
    if (the > 0) bump(state, "word:the", the);
  } else if (event.kind === "race" && event.won) {
    bump(state, "racesWon");
  } else if (event.kind === "drill") {
    bump(state, "drills");
  } else if (event.kind === "rhythm") {
    a.counters.bestCombo = Math.max(counter(state, "bestCombo"), event.maxCombo);
  }
  const earned: string[] = [];
  for (const def of ACHIEVEMENTS) {
    if (a.earned[def.id] !== undefined) continue;
    if (def.met?.(state) || def.on?.(event, state, ctx)) {
      a.earned[def.id] = now;
      earned.push(def.id);
    }
  }
  return earned;
}
