import {
  BOSS_DEFEAT_BONUS,
  BOSS_EVERY,
  BOSS_FALL_SECONDS,
  BOSS_HEAL_PER_ERROR,
  BOSS_HP,
  BOSS_PHASE2_SPEED,
  BOSS_SECONDS,
  COMBO_BONUS,
  COMBO_MAX_MULTIPLIER,
  COMBO_STEP,
  DOUBLE_SECONDS,
  ERROR_RUN_FOR_LIFE,
  FALL_SECONDS_MIN,
  FALL_SECONDS_START,
  FALLING_SPEEDUP,
  HEALTH_PER_CLEAN_WORD,
  HEALTH_PER_ERROR,
  HEALTH_PER_LANDED,
  MAX_INTERVAL_MS,
  MAX_ON_SCREEN,
  POINTS_PER_CHAR,
  POWERUP_EVERY,
  SLOW_FACTOR,
  SLOW_SECONDS,
  SPAWN_SECONDS_MIN,
  SPAWN_SECONDS_START,
  START_LIVES,
  SURVIVAL_SPEEDUP,
  TOUCH_SPEED_FACTOR,
  WEAK_WORD_BONUS,
  WORDS_PER_LEVEL,
} from "./constants";
import { capitalizeFirst } from "./modifiers";
import type { Rng } from "./rng";
import type { KeystrokeRecord, LivesMode, PowerUpKind, RoundWord } from "./types";

export const POWER_UPS: readonly PowerUpKind[] = ["slow", "clear", "shield", "double"];

export interface ArcadeConfig {
  mode: "falling" | "survival";
  /** Falling words always uses "lives"; survival uses the player's setting. */
  lives: LivesMode;
  touch: boolean;
  /** Letters whose words earn the weak-key bonus. */
  weakKeys: readonly string[];
  /** The nemesis letter, if any: every other boss is the nemesis. */
  nemesisKey: string | null;
}

export interface WordSource {
  next(kind: "normal" | "powerup" | "boss", bossKey?: string | null): RoundWord;
}

export interface FallingWord {
  id: number;
  text: string;
  madeUp: boolean;
  /** 0..1 across the play area. */
  x: number;
  /** 0 at the top, 1 when it lands. */
  y: number;
  fallSeconds: number;
  typed: number;
  /** Errors made while this word was targeted. */
  errors: number;
  powerUp: PowerUpKind | null;
  boss: boolean;
  /** Position of the word in the game's keystroke log (set when targeted). */
  offset: number;
}

export interface BossState {
  hp: number;
  maxHp: number;
  timeLeft: number;
  phase: 1 | 2;
  /** The nemesis letter when the nemesis is the boss. */
  nemesis: string | null;
}

export type ArcadeEvent =
  | { type: "spawn"; id: number }
  | { type: "lock"; id: number }
  | { type: "correct"; id: number }
  | { type: "error"; id: number | null; expected: string | null; actual: string }
  | { type: "cleared"; id: number; points: number; powerUp: PowerUpKind | null }
  | { type: "landed"; id: number }
  | { type: "damage"; lives: number; health: number }
  | { type: "shieldUsed" }
  | { type: "powerUp"; kind: PowerUpKind }
  | { type: "levelUp"; level: number }
  | { type: "bossStart"; nemesis: string | null }
  | { type: "bossPhase2" }
  | { type: "bossHit"; hp: number }
  | { type: "bossDefeated"; bonus: number }
  | { type: "bossEscaped" }
  | { type: "gameOver" };

/**
 * Falling words and survival, as a deterministic simulation: the caller
 * advances time with tick(dt) and sends keystrokes with input(char, t).
 * Wrong keys don't advance a word (like the "block" error mode).
 */
export class ArcadeGame {
  readonly config: ArcadeConfig;
  time = 0;
  level = 1;
  score = 0;
  combo = 0;
  maxCombo = 0;
  lives = START_LIVES;
  health = 1;
  shield = false;
  slowUntil = -1;
  doubleUntil = -1;
  words: FallingWord[] = [];
  target: number | null = null;
  boss: BossState | null = null;
  cleared = 0;
  landed = 0;
  errors = 0;
  keystrokes = 0;
  correctKeystrokes = 0;
  over = false;
  /** All targeted words joined by spaces; record indexes point into it. */
  log = "";
  readonly records: KeystrokeRecord[] = [];

  private readonly source: WordSource;
  private readonly rng: Rng;
  private nextId = 1;
  private levelCleared = 0;
  private sinceSpawn: number;
  private sincePowerUp = 0;
  private errorRun = 0;
  private bossCount = 0;
  private readonly attempted = new Set<number>();
  private lastT: number | null = null;
  private lastClean = false;

  constructor(config: ArcadeConfig, source: WordSource, rng: Rng) {
    this.config = { ...config, lives: config.mode === "falling" ? "lives" : config.lives };
    this.source = source;
    this.rng = rng;
    this.sinceSpawn = this.spawnSeconds();
  }

  /** Seconds for a normal word to fall at the current level. */
  fallSeconds(): number {
    const speedup = this.config.mode === "survival" ? SURVIVAL_SPEEDUP : FALLING_SPEEDUP;
    const base = Math.max(FALL_SECONDS_MIN, FALL_SECONDS_START * Math.pow(speedup, this.level - 1));
    return this.config.touch ? base / TOUCH_SPEED_FACTOR : base;
  }

  spawnSeconds(): number {
    const speedup = this.config.mode === "survival" ? SURVIVAL_SPEEDUP : FALLING_SPEEDUP;
    const base = Math.max(SPAWN_SECONDS_MIN, SPAWN_SECONDS_START * Math.pow(speedup, this.level - 1));
    return this.config.touch ? base / TOUCH_SPEED_FACTOR : base;
  }

  get slowed(): boolean {
    return this.time < this.slowUntil;
  }

  get doubled(): boolean {
    return this.time < this.doubleUntil;
  }

  /** 1 + min(COMBO_MAX_MULTIPLIER - 1, floor(combo / COMBO_STEP) x COMBO_BONUS). */
  comboMultiplier(): number {
    return 1 + Math.min(COMBO_MAX_MULTIPLIER - 1, Math.floor(this.combo / COMBO_STEP) * COMBO_BONUS);
  }

  wpm(): number {
    return this.time > 0 ? this.correctKeystrokes / 5 / (this.time / 60) : 0;
  }

  accuracy(): number {
    return this.keystrokes > 0 ? this.correctKeystrokes / this.keystrokes : 1;
  }

  /** Advances time: boss timer, falling, landing, then spawning. */
  tick(dt: number): ArcadeEvent[] {
    const events: ArcadeEvent[] = [];
    if (this.over) return events;
    this.time += dt;

    if (this.boss) {
      this.boss.timeLeft -= dt;
      if (this.boss.timeLeft <= 0) {
        this.words = this.words.filter((w) => !w.boss);
        if (this.target !== null && !this.words.some((w) => w.id === this.target)) this.target = null;
        this.boss = null;
        events.push({ type: "bossEscaped" });
        this.damage(events, HEALTH_PER_LANDED);
        if (this.over) return events;
        this.levelUp(events);
      }
    }

    const factor = this.slowed ? SLOW_FACTOR : 1;
    const landed: FallingWord[] = [];
    for (const w of this.words) {
      w.y += (dt / w.fallSeconds) * factor;
      if (w.y >= 1) landed.push(w);
    }
    for (const w of landed) {
      this.words = this.words.filter((x) => x.id !== w.id);
      if (this.target === w.id) this.target = null;
      this.landed += 1;
      this.combo = 0;
      events.push({ type: "landed", id: w.id });
      if (w.boss && this.boss) this.boss.hp = Math.min(this.boss.maxHp, this.boss.hp + 1);
      this.damage(events, HEALTH_PER_LANDED);
      if (this.over) return events;
    }

    if (this.boss) {
      if (!this.words.some((w) => w.boss)) this.spawn(events, "boss");
    } else {
      this.sinceSpawn += dt;
      if (this.sinceSpawn >= this.spawnSeconds() && this.words.length < MAX_ON_SCREEN) {
        this.sinceSpawn = 0;
        this.spawn(events, this.sincePowerUp >= POWERUP_EVERY ? "powerup" : "normal");
      }
    }
    return events;
  }

  /** One keystroke. Spaces are ignored when no word is targeted. */
  input(char: string, t: number): ArcadeEvent[] {
    const events: ArcadeEvent[] = [];
    if (this.over) return events;
    if (this.target === null) {
      if (char === " ") return events;
      let best: FallingWord | null = null;
      for (const w of this.words) {
        if (w.text[0] !== char) continue;
        if (!best || w.y > best.y || (w.y === best.y && w.id < best.id)) best = w;
      }
      if (!best) {
        this.keystrokes += 1;
        this.lastT = t;
        this.lastClean = false;
        events.push({ type: "error", id: null, expected: null, actual: char });
        this.error(events, null);
        return events;
      }
      this.target = best.id;
      best.offset = this.log.length + (this.log.length > 0 ? 1 : 0);
      this.log += (this.log.length > 0 ? " " : "") + best.text;
      events.push({ type: "lock", id: best.id });
    }
    const word = this.words.find((w) => w.id === this.target)!;
    const expected = word.text[word.typed];
    const correct = char === expected;
    this.record(word, expected, char, correct, t);
    this.keystrokes += 1;
    if (correct) {
      this.correctKeystrokes += 1;
      this.errorRun = 0;
      word.typed += 1;
      events.push({ type: "correct", id: word.id });
      if (word.typed === word.text.length) this.clear(events, word);
    } else {
      word.errors += 1;
      events.push({ type: "error", id: word.id, expected, actual: char });
      this.error(events, word);
    }
    return events;
  }

  private record(word: FallingWord, expected: string, actual: string, correct: boolean, t: number): void {
    const index = word.offset + word.typed;
    const first = !this.attempted.has(index);
    let interval: number | null = null;
    if (this.lastT !== null && this.lastClean) {
      const gap = t - this.lastT;
      if (gap >= 0 && gap <= MAX_INTERVAL_MS) interval = gap;
    }
    this.records.push({ index, expected, actual, t, correct, first, interval });
    this.attempted.add(index);
    this.lastT = t;
    this.lastClean = correct && first;
  }

  private error(events: ArcadeEvent[], word: FallingWord | null): void {
    this.errors += 1;
    this.combo = 0;
    this.errorRun += 1;
    if (word?.boss && this.boss) this.boss.hp = Math.min(this.boss.maxHp, this.boss.hp + BOSS_HEAL_PER_ERROR);
    const mode = this.config.lives;
    if (mode === "hardcore") this.damage(events, 0);
    else if (mode === "health") this.damage(events, HEALTH_PER_ERROR);
    else if (this.errorRun >= ERROR_RUN_FOR_LIFE) {
      this.errorRun = 0;
      this.damage(events, 0);
    }
  }

  /** Costs a life (lives), health (health mode) or the game (hardcore), unless the shield absorbs it. */
  private damage(events: ArcadeEvent[], healthCost: number): void {
    if (this.shield) {
      this.shield = false;
      events.push({ type: "shieldUsed" });
      return;
    }
    const mode = this.config.lives;
    if (mode === "hardcore") this.lives = 0;
    else if (mode === "health") this.health = Math.max(0, Math.round((this.health - healthCost) * 1000) / 1000);
    else this.lives -= 1;
    events.push({ type: "damage", lives: this.lives, health: this.health });
    if (this.lives <= 0 || this.health <= 0) {
      this.over = true;
      events.push({ type: "gameOver" });
    }
  }

  private clear(events: ArcadeEvent[], word: FallingWord): void {
    this.words = this.words.filter((w) => w.id !== word.id);
    this.target = null;
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.cleared += 1;
    let points = POINTS_PER_CHAR * word.text.length * this.comboMultiplier();
    const lower = word.text.toLowerCase();
    if (this.config.weakKeys.some((k) => lower.includes(k))) points *= 1 + WEAK_WORD_BONUS;
    if (word.boss) points *= 2;
    if (this.doubled) points *= 2;
    points = Math.round(points);
    this.score += points;
    events.push({ type: "cleared", id: word.id, points, powerUp: word.powerUp });
    if (this.config.lives === "health" && word.errors === 0) this.health = Math.min(1, Math.round((this.health + HEALTH_PER_CLEAN_WORD) * 1000) / 1000);
    if (word.powerUp) this.applyPowerUp(events, word.powerUp);
    if (word.boss && this.boss) {
      this.boss.hp = Math.max(0, this.boss.hp - 1);
      events.push({ type: "bossHit", hp: this.boss.hp });
      if (this.boss.hp <= 0) {
        const bonus = BOSS_DEFEAT_BONUS * (this.doubled ? 2 : 1);
        this.score += bonus;
        this.boss = null;
        this.words = this.words.filter((w) => !w.boss);
        events.push({ type: "bossDefeated", bonus });
        this.levelUp(events);
      } else if (this.boss.phase === 1 && this.boss.hp <= this.boss.maxHp / 2) {
        this.boss.phase = 2;
        events.push({ type: "bossPhase2" });
      }
      return;
    }
    this.levelCleared += 1;
    if (!this.boss && this.levelCleared >= WORDS_PER_LEVEL) this.levelUp(events);
  }

  private applyPowerUp(events: ArcadeEvent[], kind: PowerUpKind): void {
    events.push({ type: "powerUp", kind });
    if (kind === "slow") this.slowUntil = this.time + SLOW_SECONDS;
    else if (kind === "double") this.doubleUntil = this.time + DOUBLE_SECONDS;
    else if (kind === "shield") this.shield = true;
    else {
      this.words = this.words.filter((w) => w.boss);
      if (this.target !== null && !this.words.some((w) => w.id === this.target)) this.target = null;
    }
  }

  private levelUp(events: ArcadeEvent[]): void {
    this.level += 1;
    this.levelCleared = 0;
    events.push({ type: "levelUp", level: this.level });
    if (this.level % BOSS_EVERY === 0) {
      this.bossCount += 1;
      const nemesis = this.config.nemesisKey && this.bossCount % 2 === 1 ? this.config.nemesisKey : null;
      this.boss = { hp: BOSS_HP, maxHp: BOSS_HP, timeLeft: BOSS_SECONDS, phase: 1, nemesis };
      events.push({ type: "bossStart", nemesis });
    }
  }

  private spawn(events: ArcadeEvent[], kind: "normal" | "powerup" | "boss"): void {
    const boss = kind === "boss";
    const word = this.source.next(kind, boss ? this.boss?.nemesis ?? null : null);
    let text = word.text;
    let fall = this.fallSeconds();
    if (boss) {
      const phase2 = this.boss?.phase === 2;
      if (phase2) text = capitalizeFirst(text);
      fall = (BOSS_FALL_SECONDS / (phase2 ? BOSS_PHASE2_SPEED : 1)) / (this.config.touch ? TOUCH_SPEED_FACTOR : 1);
    }
    let powerUp: PowerUpKind | null = null;
    if (kind === "powerup") {
      powerUp = POWER_UPS[this.rng.int(POWER_UPS.length)];
      this.sincePowerUp = 0;
    } else if (!boss) {
      this.sincePowerUp += 1;
    }
    const x = boss ? 0.5 : 0.08 + this.rng.next() * 0.84;
    const id = this.nextId++;
    this.words.push({ id, text, madeUp: word.madeUp, x, y: 0, fallSeconds: fall, typed: 0, errors: 0, powerUp, boss, offset: 0 });
    events.push({ type: "spawn", id });
  }
}
