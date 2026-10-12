import type { ArcadeGame } from "./arcade";
import { ARCADE_WEIGHT, MAX_SCORES, NEMESIS_DEFEAT_WEAKNESS, NEMESIS_MIN_SAMPLES, NEMESIS_MIN_WEAKNESS } from "./constants";
import { applyErrorAnalysis } from "./errors";
import { DEFAULT_GOAL } from "./profile";
export { emptyArcade } from "./profile";
import { hashString, type Rng } from "./rng";
import { weakness } from "./scoring";
import { applyRecords } from "./stats";
import type {
  ArcadeMode,
  CharacterData,
  DefeatedNemesis,
  KeystrokeRecord,
  Nemesis,
  ProfileState,
  ScoreEntry,
  WordPack,
} from "./types";

/**
 * Folds arcade keystrokes into stats at ARCADE_WEIGHT (letters, pairs and
 * modifiers), and into error analysis. Arcade play doesn't touch mastery,
 * unlocks, difficulty, reviews or the session.
 */
export function applyArcadeRecords(
  state: ProfileState,
  target: string,
  records: readonly KeystrokeRecord[],
  options: { chars?: CharacterData; pack?: WordPack } = {},
): void {
  applyRecords(target, records, state.keys, state.pairs, options.chars, ARCADE_WEIGHT);
  applyErrorAnalysis(state, target, records, options.pack ?? null);
}

/**
 * Adds a score to a mode's top list (best first; ties keep the earlier
 * game first) and keeps MAX_SCORES. Returns the 1-based rank, or null when
 * it didn't make the list.
 */
export function recordScore(state: ProfileState, mode: ArcadeMode, entry: ScoreEntry): number | null {
  const list = (state.arcade.scores[mode] ??= []);
  let rank = list.findIndex((e) => entry.score > e.score);
  if (rank < 0) rank = list.length;
  if (rank >= MAX_SCORES) return null;
  list.splice(rank, 0, entry);
  if (list.length > MAX_SCORES) list.length = MAX_SCORES;
  return rank + 1;
}

/** Records a finished falling or survival game: stats, the game count and the score. */
export function completeArcadeGame(
  state: ProfileState,
  game: ArcadeGame,
  at: number,
  options: { chars?: CharacterData; pack?: WordPack } = {},
): { entry: ScoreEntry; rank: number | null } {
  applyArcadeRecords(state, game.log, game.records, options);
  state.arcade.games += 1;
  state.roundCounter += 1;
  const entry: ScoreEntry = {
    score: game.score,
    level: game.level,
    words: game.cleared,
    wpm: game.wpm(),
    accuracy: game.accuracy(),
    at,
  };
  if (game.config.mode === "survival") entry.lives = game.config.lives;
  return { entry, rank: recordScore(state, game.config.mode, entry) };
}

export interface NemesisContent {
  names: Record<string, string[]>;
  taunts: string[];
  defeat: string;
}

/** "<name> the <LETTER>", the name picked by hashString(profile seed + letter). */
export function nemesisName(state: ProfileState, key: string, content: NemesisContent): string {
  const options = content.names[key] ?? [key.toUpperCase()];
  return `${options[hashString(`${state.seed}${key}`) % options.length]} the ${key.toUpperCase()}`;
}

export interface NemesisChange {
  defeated: DefeatedNemesis | null;
  chosen: Nemesis | null;
}

/**
 * After a round or game: the current nemesis is defeated once its key has
 * NEMESIS_MIN_SAMPLES samples and weakness at most NEMESIS_DEFEAT_WEAKNESS
 * (it joins the hall). With no nemesis, the unlocked letter with the highest
 * weakness that has NEMESIS_MIN_SAMPLES samples and weakness at least
 * NEMESIS_MIN_WEAKNESS becomes the nemesis (ties by unlock order).
 */
export function updateNemesis(state: ProfileState, now: number, content: NemesisContent): NemesisChange {
  const goal = state.goal ?? DEFAULT_GOAL;
  const arcade = state.arcade;
  let defeated: DefeatedNemesis | null = null;
  if (arcade.nemesis) {
    const entry = state.keys[arcade.nemesis.key];
    if (entry && entry.n >= NEMESIS_MIN_SAMPLES && weakness(entry, goal) <= NEMESIS_DEFEAT_WEAKNESS) {
      defeated = { ...arcade.nemesis, defeatedAt: now };
      arcade.hall.push(defeated);
      arcade.nemesis = null;
    }
  }
  let chosen: Nemesis | null = null;
  if (!arcade.nemesis) {
    let best: { key: string; w: number } | null = null;
    for (const key of state.unlocked) {
      const entry = state.keys[key];
      if (!entry || entry.n < NEMESIS_MIN_SAMPLES) continue;
      const w = weakness(entry, goal);
      if (w >= NEMESIS_MIN_WEAKNESS && (!best || w > best.w)) best = { key, w };
    }
    if (best) {
      chosen = { key: best.key, name: nemesisName(state, best.key, content), since: now };
      arcade.nemesis = chosen;
    }
  }
  return { defeated, chosen };
}

/** A taunt with the name and key filled in, picked with the generator. */
export function nemesisTaunt(nemesis: Nemesis, content: NemesisContent, rng: Rng): string {
  const line = content.taunts[rng.int(content.taunts.length)];
  return line.replaceAll("{name}", nemesis.name).replaceAll("{key}", nemesis.key);
}
