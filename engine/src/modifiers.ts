import {
  LEVEL_RANGES,
  MAX_DECORATED_SHARE,
  MODIFIER_IDS,
  MODIFIER_MASTERY_SAMPLES,
  MODIFIER_MASTERY_TIMED,
  MODIFIER_TIME_SLACK,
  MODIFIER_WEAKNESS_WEIGHT,
} from "./constants";
import type { Rng } from "./rng";
import { clamp, weakness } from "./scoring";
import { wpmToMs } from "./typing";
import type {
  CharacterData,
  Goal,
  ModifierId,
  ModifierSettings,
  Platform,
  ProfileState,
  RoundWord,
  StatEntry,
  UnlockableId,
} from "./types";

export type CharCategory = "letter" | "space" | ModifierId | "other";

/** Which kind of character this is. Uppercase accented letters count as accents. */
export function categoryOf(ch: string, chars: CharacterData): CharCategory {
  if (ch >= "a" && ch <= "z") return "letter";
  if (ch === " ") return "space";
  if (ch >= "A" && ch <= "Z") return "caps";
  if (ch >= "0" && ch <= "9") return "numbers";
  if (chars.punctuation.includes(ch)) return "punct";
  if (chars.symbols.includes(ch)) return "symbols";
  if (chars.accents[ch.toLowerCase()]) return "accents";
  if (chars.extra[ch] || Object.values(chars.extra).some((x) => x.close === ch)) return "extra";
  return "other";
}

/** Stat key for a modifier's combined stats. */
export function modKey(id: ModifierId): string {
  return `mod:${id}`;
}

/** Modifiers get a longer goal interval, since they involve Shift, Option or a layer switch. */
export function modifierGoal(goal: Goal): Goal {
  return { wpm: goal.wpm / MODIFIER_TIME_SLACK, accuracy: goal.accuracy };
}

/**
 * A modifier is mastered when its running stats have at least
 * MODIFIER_MASTERY_SAMPLES samples (MODIFIER_MASTERY_TIMED timed), accuracy
 * at the goal, and an average interval within the modifier goal.
 */
export function modifierMastered(entry: StatEntry | undefined, goal: Goal): boolean {
  if (!entry || entry.n < MODIFIER_MASTERY_SAMPLES || entry.timedN < MODIFIER_MASTERY_TIMED) return false;
  return 1 - entry.errAvg >= goal.accuracy && entry.msAvg <= wpmToMs(modifierGoal(goal).wpm);
}

/** Progress toward modifier mastery, 0..1: the weaker of speed and accuracy, scaled by samples so far. */
export function modifierProgress(entry: StatEntry | undefined, goal: Goal): number {
  if (!entry || entry.n === 0) return 0;
  const accuracy = Math.min(1, (1 - entry.errAvg) / goal.accuracy);
  const speed = entry.timedN > 0 ? Math.min(1, wpmToMs(modifierGoal(goal).wpm) / entry.msAvg) : 0;
  return Math.min(accuracy, speed) * Math.min(1, entry.n / MODIFIER_MASTERY_SAMPLES);
}

export const DEFAULT_MODIFIER_SETTINGS: ModifierSettings = {
  modes: { caps: "unlock", punct: "unlock", numbers: "unlock", symbols: "unlock", accents: "unlock", extra: "unlock", shortcuts: "unlock" },
  levels: { caps: "medium", punct: "medium", numbers: "low", symbols: "low", accents: "low", extra: "low" },
  caps: "first",
  punct: "sentence",
};

/** Whether a modifier or the shortcut drill is on, given its setting and what's unlocked. */
export function isOn(id: UnlockableId, state: ProfileState, settings: ModifierSettings): boolean {
  const mode = settings.modes[id];
  if (mode === "off") return false;
  if (mode === "on") return true;
  return state.modsUnlocked.includes(id);
}

/** Active modifiers for a round, in MODIFIER_IDS order. Accents and extra characters need the platform to support them. */
export function activeModifiers(state: ProfileState, settings: ModifierSettings, platform: Platform): ModifierId[] {
  return MODIFIER_IDS.filter((id) => {
    if (!isOn(id, state, settings)) return false;
    if (id === "accents") return platform.accents;
    if (id === "extra") return platform.extra.length > 0;
    return true;
  });
}

/**
 * The share of words that get a modifier this round:
 *   position = clamp(0.7 x clamp(weakness / 2, 0, 1) + 0.3 x difficulty, 0, 1)
 *   rate     = min + (max - min) x position
 * Weak modifiers sit near the top of their range, strong ones near the bottom
 * (never zero), and higher difficulty nudges everything up.
 */
export function modifierRate(id: ModifierId, state: ProfileState, settings: ModifierSettings, goal: Goal): number {
  const [min, max] = LEVEL_RANGES[settings.levels[id]];
  const weak = clamp(weakness(state.keys[modKey(id)], modifierGoal(goal)) / 2, 0, 1);
  const position = clamp(MODIFIER_WEAKNESS_WEIGHT * weak + (1 - MODIFIER_WEAKNESS_WEIGHT) * state.difficulty, 0, 1);
  return min + (max - min) * position;
}

/**
 * Keeps at least half the words plain: if the rates add up to more than
 * MAX_DECORATED_SHARE, every rate is multiplied by MAX_DECORATED_SHARE / sum.
 */
export function capRates<T extends { rate: number }>(rates: T[]): T[] {
  const sum = rates.reduce((total, r) => total + r.rate, 0);
  if (sum <= MAX_DECORATED_SHARE) return rates;
  const scale = MAX_DECORATED_SHARE / sum;
  return rates.map((r) => ({ ...r, rate: r.rate * scale }));
}

export interface DecorateContext {
  rng: Rng;
  chars: CharacterData;
  settings: ModifierSettings;
  platform: Platform;
  /** Active modifiers and their rates, in MODIFIER_IDS order. */
  rates: { id: ModifierId; rate: number }[];
  /** Weakness of any single character (1 if never seen). */
  charScore: (ch: string) => number;
  /** Another word to join with (for dashes, slashes and similar). */
  extraWord: () => string;
  /** The last word before this batch, so sentences continue across batches. */
  previous?: string;
}

const DIGITS = "0123456789";
const SENTENCE_ENDS = ".!?";
const WRAPS: Record<string, string> = { "(": ")", "[": "]", "{": "}", "<": ">" };
const PREFIX_SYMBOLS = "@#$~^";
const SUFFIX_SYMBOLS = "%*";

/**
 * Applies the active modifiers to a batch of words, in place order:
 * accents, numbers, symbols, extra, caps, then punctuation. Each active
 * modifier draws one rng.next() per word to decide whether it applies.
 */
export function applyModifiers(words: RoundWord[], ctx: DecorateContext): RoundWord[] {
  const rate = (id: ModifierId) => ctx.rates.find((r) => r.id === id)?.rate;
  const { rng } = ctx;
  const pickWeighted = (options: readonly string[]) =>
    options[Math.max(0, rng.weightedIndex(options.map((o) => 0.5 + ctx.charScore(o))))];
  const number = (minDigits: number, maxDigits: number) => {
    const length = minDigits + rng.int(maxDigits - minDigits + 1);
    let text = "";
    for (let i = 0; i < length; i++) {
      const d = pickWeighted(i === 0 && length > 1 ? DIGITS.slice(1).split("") : DIGITS.split(""));
      text += d;
    }
    return text;
  };

  let sentenceStart = ctx.previous === undefined || SENTENCE_ENDS.includes(ctx.previous.slice(-1));
  const out: RoundWord[] = [];
  for (const original of words) {
    let text = original.text;
    let madeUp = original.madeUp;

    const accents = rate("accents");
    if (accents !== undefined && rng.next() < accents) {
      const loanwords = ctx.chars.loanwords;
      const scores = loanwords.map((w) => {
        let worst = 0;
        for (const ch of w) if (ctx.chars.accents[ch]) worst = Math.max(worst, ctx.charScore(ch));
        return 0.5 + worst;
      });
      text = loanwords[Math.max(0, rng.weightedIndex(scores))];
      madeUp = false;
    }

    const numbers = rate("numbers");
    if (numbers !== undefined && rng.next() < numbers) {
      const form = rng.int(3);
      if (form === 0) text = number(1, 4);
      else if (form === 1) text = `${text}${number(1, 2)}`;
      else if (rate("symbols") !== undefined) {
        const n = number(1, 3);
        text = [`$${n}`, `${n}%`, `#${n}`][rng.int(3)];
      } else text = number(1, 4);
      madeUp = false;
    }

    const symbols = rate("symbols");
    if (symbols !== undefined && rng.next() < symbols) {
      const opening = ctx.chars.symbols.filter((s) => !Object.values(WRAPS).includes(s));
      const sym = pickWeighted(opening);
      if (WRAPS[sym]) text = `${sym}${text}${WRAPS[sym]}`;
      else if (PREFIX_SYMBOLS.includes(sym)) text = `${sym}${text}`;
      else if (SUFFIX_SYMBOLS.includes(sym)) text = `${text}${sym}`;
      else text = `${text}${sym}${ctx.extraWord()}`;
    }

    const extra = rate("extra");
    if (extra !== undefined && rng.next() < extra) {
      const ch = pickWeighted(ctx.platform.extra);
      text = placeExtra(ch, text, ctx, number);
      madeUp = false;
    }

    const caps = rate("caps");
    if (caps !== undefined && rng.next() < caps) {
      text = ctx.settings.caps === "first" ? capitalizeFirst(text) : capitalizeAt(text, rng);
    }

    const punct = rate("punct");
    if (punct !== undefined) {
      if (ctx.settings.punct === "sentence") {
        if (sentenceStart) text = capitalizeFirst(text);
        sentenceStart = false;
        const r = rng.next();
        if (r < punct * 0.5) {
          const end = rng.next();
          text += end < 0.8 ? "." : end < 0.9 ? "!" : "?";
          sentenceStart = true;
        } else if (r < punct * 0.8) {
          text += ",";
        } else if (r < punct) {
          const q = rng.int(2) === 0 ? '"' : "'";
          text = `${q}${text}${q}`;
        }
      } else if (rng.next() < punct) {
        const p = pickWeighted(ctx.chars.punctuation);
        if (p === '"' || p === "'") text = `${p}${text}${p}`;
        else if (p === "-") text = `${text}-${ctx.extraWord()}`;
        else text += p;
      }
    }

    out.push({ text, madeUp });
  }
  return out;
}

function placeExtra(ch: string, word: string, ctx: DecorateContext, number: (a: number, b: number) => string): string {
  const info = ctx.chars.extra[ch];
  const small = () => String(1 + ctx.rng.int(20));
  switch (info?.place) {
    case "between":
      return `${word}${ch}${ctx.extraWord()}`;
    case "range": {
      const a = 1 + ctx.rng.int(20);
      return `${a}${ch}${a + 1 + ctx.rng.int(10)}`;
    }
    case "prefix":
      return `${ch}${word}`;
    case "alone":
      return ch;
    case "number-after":
      return `${number(1, 3)}${ch}`;
    case "number-before":
      return `${ch}${number(1, 3)}`;
    case "compare":
      return `${small()}${ch}${small()}`;
    case "question":
      return `${ch}${word}?`;
    case "exclaim":
      return `${ch}${word}!`;
    case "wrap":
      return `${ch}${word}${info.close ?? ch}`;
    default:
      return `${word}${ch}`;
  }
}

export function capitalizeFirst(text: string): string {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch.toLowerCase() !== ch.toUpperCase()) return text.slice(0, i) + ch.toUpperCase() + text.slice(i + 1);
  }
  return text;
}

/** Capitalizes one random letter (a-z only). */
function capitalizeAt(text: string, rng: Rng): string {
  const positions: number[] = [];
  for (let i = 0; i < text.length; i++) if (text[i] >= "a" && text[i] <= "z") positions.push(i);
  if (positions.length === 0) return text;
  const i = positions[rng.int(positions.length)];
  return text.slice(0, i) + text[i].toUpperCase() + text.slice(i + 1);
}

/** Extra characters a platform can type, for an OS or a touch layout, from the curated or full set. */
export function extraForSystem(
  chars: CharacterData,
  system: "mac" | "windows" | "windows-intl" | "linux" | { touchReachable: readonly string[] },
  options: { full: boolean; altCodes: boolean },
): string[] {
  return Object.entries(chars.extra)
    .filter(([ch, info]) => {
      if (!options.full && !info.curated) return false;
      if (typeof system === "object") return system.touchReachable.includes(ch) && (!info.close || system.touchReachable.includes(info.close));
      if (system === "mac") return !!info.mac;
      if (system === "windows-intl") return !!info.windowsIntl || (options.altCodes && !!info.altCode);
      if (system === "windows") return options.altCodes && !!info.altCode;
      return !!info.mac; // Linux: AltGr or Compose can type the same set as macOS.
    })
    .map(([ch]) => ch);
}
