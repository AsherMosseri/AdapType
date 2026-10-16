// The numbers and symbols course (phase 7): a path that unlocks digits and
// symbols a step at a time, and drills on everyday numbers, math, code and
// punctuation. Both lean toward your weakest symbols. See spec section 39.

import { applyErrorAnalysis } from "./errors";
import { modifierGoal } from "./modifiers";
import { DEFAULT_GOAL, masteryProgress, meetsMastery } from "./profile";
import type { Rng } from "./rng";
import { weakness } from "./scoring";
import { appendHistory, applyRecords, recordKeyDays } from "./stats";
import type { RoundMetrics, TypingRound } from "./typing";
import type { CharacterData, KeyRoundEntry, ProfileState, WordPack } from "./types";

export interface CourseStep {
  id: string;
  name: string;
  /** The keys this step teaches, in order. */
  keys: string;
}

export interface CourseDrill {
  name: string;
  description: string;
  templates: readonly string[];
}

/** content/course.json */
export interface CourseContent {
  version: number;
  steps: readonly CourseStep[];
  pathTemplates: readonly string[];
  drills: Readonly<Record<string, CourseDrill>>;
  identifiers: readonly string[];
}

/** A path round for one step (the current one or a finished one, for review), or a drill. */
export type CourseMode = { step: number } | { drill: string };

export interface CourseOutcome {
  metrics: RoundMetrics;
  /** Course keys that reached mastery in this round. */
  newlyMastered: string[];
  /** Ids of steps finished by this round. */
  stepsFinished: string[];
  /** True when this round finished the whole path. */
  finishedPath: boolean;
}

export const COURSE_PATH_ITEMS = 18;
export const COURSE_DRILL_ITEMS = 12;
/** Weight multiplier for the step being learned's keys that aren't mastered yet. */
export const COURSE_FOCUS_BOOST = 3;
/** How many of the pack's most common words fill in word placeholders. */
export const COURSE_WORDS = 500;

const DIGITS = "0123456789";
const PLACEHOLDER = /⟨([A-Za-z0-9]+)⟩/g;

/** Every key the course teaches, in step order. */
export function courseKeys(content: CourseContent): string[] {
  return content.steps.flatMap((s) => [...s.keys]);
}

/** The first step with a key not mastered yet, or the number of steps when the path is finished. */
export function currentStep(state: ProfileState, content: CourseContent): number {
  const i = content.steps.findIndex((s) => [...s.keys].some((k) => !state.course.mastered.includes(k)));
  return i < 0 ? content.steps.length : i;
}

/** A course key's progress toward mastery, 0..1, against the symbol goal. */
export function courseKeyProgress(state: ProfileState, key: string): number {
  return masteryProgress(state.course.history[key], modifierGoal(state.goal ?? DEFAULT_GOAL));
}

/** Words for placeholders: the pack's most common words of 2 to 8 plain letters. */
export function courseWords(pack: WordPack): string[] {
  const out: string[] = [];
  for (const w of pack.words) {
    if (out.length >= COURSE_WORDS) break;
    if (/^[a-z]{2,8}$/.test(w)) out.push(w);
  }
  return out;
}

/** The literal (non-placeholder) course keys in a template, in order of appearance, without repeats. */
function literalKeys(template: string, keys: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const ch of template.replace(PLACEHOLDER, "")) if (keys.has(ch) && !out.includes(ch)) out.push(ch);
  return out;
}

function hasNumber(template: string): boolean {
  for (const m of template.matchAll(PLACEHOLDER)) if (!["w", "W", "id"].includes(m[1])) return true;
  return false;
}

/** A random integer in [lo, hi]. */
const between = (rng: Rng, lo: number, hi: number) => lo + rng.int(hi - lo + 1);

/**
 * Text for a course round: COURSE_PATH_ITEMS items for a path step or
 * COURSE_DRILL_ITEMS for a drill, joined by spaces. Each item is a template
 * picked by weight and filled in. Spec section 39.
 */
export function courseText(state: ProfileState, content: CourseContent, pack: WordPack, mode: CourseMode, rng: Rng): string {
  const all = courseKeys(content);
  const keySet = new Set(all);
  const goal = modifierGoal(state.goal ?? DEFAULT_GOAL);
  const path = "step" in mode;
  // Keys this round may use, and how much each one should come up.
  const allowed = new Set(path ? content.steps.slice(0, mode.step + 1).flatMap((s) => [...s.keys]) : all);
  const focus = path ? new Set(content.steps[mode.step]?.keys ?? "") : new Set<string>();
  const weight = new Map<string, number>();
  for (const k of allowed) {
    let w = 1 + weakness(state.keys[k], goal);
    if (focus.has(k) && !state.course.mastered.includes(k)) w *= COURSE_FOCUS_BOOST;
    weight.set(k, w);
  }
  const digits = [...DIGITS].filter((d) => allowed.has(d));
  const digitWeights = digits.map((d) => weight.get(d)!);
  const digitMean = digits.length ? digitWeights.reduce((a, b) => a + b, 0) / digits.length : 0;

  const templates = (path ? content.pathTemplates : content.drills[mode.drill]?.templates ?? []).filter(
    (t) => literalKeys(t, keySet).every((k) => allowed.has(k)) && (!hasNumber(t) || digits.length > 0),
  );
  const weights = templates.map((t) => {
    const lits = literalKeys(t, keySet);
    let w = lits.reduce((sum, k) => sum + weight.get(k)!, 0);
    if (hasNumber(t)) w += digitMean;
    return lits.length === 0 && !hasNumber(t) ? 1 : 1 + w;
  });

  const words = courseWords(pack);
  const word = () => words[rng.int(words.length)];
  // Path rounds build numbers from the unlocked digits only (picked by weight); drills use any digits.
  const pathNumber = (len: number) => {
    let s = "";
    for (let i = 0; i < len; i++) s += digits[rng.weightedIndex(digitWeights)];
    return s;
  };
  const items: string[] = [];
  const count = path ? COURSE_PATH_ITEMS : COURSE_DRILL_ITEMS;
  for (let i = 0; i < count && templates.length > 0; i++) {
    const t = templates[rng.weightedIndex(weights)];
    let a = 0;
    let b = 0;
    if (!path && /⟨(a|b|sum|diff|product)⟩/.test(t)) {
      a = between(rng, 2, 20);
      b = between(rng, 2, 20);
      if (a < b) [a, b] = [b, a];
    }
    items.push(
      t.replace(PLACEHOLDER, (_, name: string) => {
        switch (name) {
          case "w":
            return word();
          case "W": {
            const w = word();
            return w[0].toUpperCase() + w.slice(1);
          }
          case "id":
            return content.identifiers[rng.int(content.identifiers.length)];
        }
        if (path) return pathNumber(name === "d" ? 1 : 1 + rng.int(name === "n" ? 3 : 2));
        switch (name) {
          case "n":
            return String(between(rng, 1, 999));
          case "d":
            return String(rng.int(10));
          case "a":
            return String(a);
          case "b":
            return String(b);
          case "sum":
            return String(a + b);
          case "diff":
            return String(a - b);
          case "product":
            return String(a * b);
          case "dd":
            return String(rng.int(100)).padStart(2, "0");
          case "mm":
            return String(rng.int(60)).padStart(2, "0");
          case "h":
          case "m":
            return String(between(rng, 1, 12));
          case "day":
            return String(between(rng, 1, 28));
          case "year":
            return String(between(rng, 1990, 2030));
          case "n3":
            return String(between(rng, 100, 999));
          case "n4":
            return String(between(rng, 1000, 9999));
        }
        return "";
      }),
    );
  }
  return items.join(" ");
}

/**
 * Records a course round: key stats (shared with practice), error analysis,
 * key days, and the course's own per-round history for its keys. Keys that
 * now meet mastery against the symbol goal are mastered for good.
 */
export function completeCourseRound(
  state: ProfileState,
  content: CourseContent,
  round: TypingRound,
  at: number,
  options: { chars?: CharacterData; pack?: WordPack } = {},
): CourseOutcome {
  const { perKey } = applyRecords(round.target, round.records, state.keys, state.pairs, options.chars, 1, state.layout);
  applyErrorAnalysis(state, round.target, round.records, options.pack ?? null);
  recordKeyDays(state.keyDays, perKey, at);
  state.roundCounter += 1;
  const keys = new Set(courseKeys(content));
  const course: Record<string, KeyRoundEntry> = {};
  for (const k of Object.keys(perKey)) if (keys.has(k)) course[k] = perKey[k];
  appendHistory(state.course.history, course);

  const goal = modifierGoal(state.goal ?? DEFAULT_GOAL);
  const before = currentStep(state, content);
  const newlyMastered: string[] = [];
  for (const k of courseKeys(content)) {
    if (!state.course.mastered.includes(k) && meetsMastery(state.course.history[k], goal)) {
      state.course.mastered.push(k);
      newlyMastered.push(k);
    }
  }
  const after = currentStep(state, content);
  const stepsFinished = content.steps.slice(before, after).filter((s) => [...s.keys].every((k) => state.course.mastered.includes(k))).map((s) => s.id);
  const finishedPath = !state.course.finished && after >= content.steps.length;
  if (finishedPath) state.course.finished = true;
  return { metrics: round.metrics(), newlyMastered, stepsFinished, finishedPath };
}
