// Saved data: one JSON document in localStorage, with a version number so
// later phases can migrate it.
import {
  createProfile,
  DEFAULT_MADE_UP_CAP,
  DEFAULT_MODIFIER_SETTINGS,
  migrateProfile,
  type ErrorMode,
  type InputProfile,
  type LivesMode,
  type RivalPace,
  type ModifierSettings,
  type ProfileState,
  type RoundType,
} from "../../engine/src";

export const DATA_VERSION = 6;

export type OsChoice = "auto" | "mac" | "windows" | "windows-intl" | "linux";
export type TouchLayoutChoice = "auto" | "ios" | "android";
const STORAGE_KEY = "adaptype";
const CODE_PREFIX = "ADAPTYPE1:";

export interface Settings {
  activeProfile: InputProfile;
  round: RoundType;
  errorMode: ErrorMode;
  modifiers: ModifierSettings;
  /** Extra characters: the curated set of about 20, or the full map. */
  extraSet: "curated" | "full";
  os: OsChoice;
  /** Windows (US) only: allow characters typed with numpad Alt codes. */
  altCodes: boolean;
  touchLayout: TouchLayoutChoice;
  shortcutStyle: "shown" | "named";
  shortcutAnswer: "press" | "build";
  /** Phase 3. */
  warmup: boolean;
  metronome: boolean;
  livePulse: boolean;
  /** The most of a round that may be made-up words. */
  madeUpCap: number;
  /** Touch: train keeps keys fixed; assist shifts each key's tap area toward where you tap. */
  hitZones: "train" | "assist";
  /** Phase 4. */
  arcadeLives: LivesMode;
  rivalPace: RivalPace;
  /** Phase 6. */
  theme: ThemeId;
  /** Light or dark: follow the device, or a fixed choice. */
  colorMode: "auto" | "light" | "dark";
  a11y: A11ySettings;
  sound: SoundSettings;
}

export type ThemeId = "clean" | "terminal" | "cute" | "mechanical";

export interface A11ySettings {
  /** "theme" uses the theme's own fonts; "dyslexic" switches everything to OpenDyslexic. */
  font: "theme" | "dyslexic";
  /** 0 normal, 1 wide, 2 wider: letter spacing for the text you type. */
  letterSpacing: 0 | 1 | 2;
  /** 0 normal, 1 relaxed, 2 loose: line spacing for the text you type and for reading. */
  lineSpacing: 0 | 1 | 2;
  /** Text size in percent, independent of the device setting. */
  textSize: number;
  /** Heatmap colors: the theme's, or a color-blind-safe palette with patterns. */
  heatmap: "theme" | "colorblind";
  /** Motion: follow the device setting, or always reduce. */
  motion: "auto" | "reduce";
  /** Screen readers: announce the current word, errors and results. */
  announce: boolean;
}

export interface SoundSettings {
  on: boolean;
  /** 0..1 */
  volume: number;
  keyClicks: boolean;
}

export function defaultSettings(activeProfile: InputProfile): Settings {
  return {
    activeProfile,
    round: { kind: "words", count: 25 },
    errorMode: "backspace",
    modifiers: structuredClone(DEFAULT_MODIFIER_SETTINGS),
    extraSet: "curated",
    os: "auto",
    altCodes: false,
    touchLayout: "auto",
    shortcutStyle: "shown",
    shortcutAnswer: "press",
    warmup: true,
    metronome: false,
    livePulse: true,
    madeUpCap: DEFAULT_MADE_UP_CAP,
    hitZones: "train",
    arcadeLives: "lives",
    rivalPace: { kind: "ahead" },
    theme: "clean",
    colorMode: "auto",
    a11y: { font: "theme", letterSpacing: 0, lineSpacing: 0, textSize: 100, heatmap: "theme", motion: "auto", announce: true },
    sound: { on: true, volume: 0.5, keyClicks: true },
  };
}

export interface AppData {
  version: number;
  settings: Settings;
  profiles: Partial<Record<InputProfile, ProfileState>>;
}

export function defaultData(activeProfile: InputProfile): AppData {
  return {
    version: DATA_VERSION,
    settings: defaultSettings(activeProfile),
    profiles: {},
  };
}

export function detectProfile(): InputProfile {
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  const fine = window.matchMedia?.("(any-pointer: fine)").matches;
  return coarse && !fine ? "touch" : "physical";
}

export function newProfile(profile: InputProfile): ProfileState {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  return createProfile(profile, seed);
}

export function load(): AppData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parseData(raw);
  } catch {
    return null;
  }
}

/** Returns false if the browser refused to save (private mode, storage full). */
export function save(data: AppData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSaved(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing saved to clear.
  }
}

/** Parses and checks saved data. Throws with a readable message if it isn't AdapType data. */
export function parseData(text: string): AppData {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This isn't AdapType progress data.");
  }
  if (!isObject(data) || typeof data.version !== "number" || !isObject(data.settings) || !isObject(data.profiles)) {
    throw new Error("This isn't AdapType progress data.");
  }
  if (data.version > DATA_VERSION) {
    throw new Error("This progress comes from a newer version of AdapType. Reload the page to update, then try again.");
  }
  for (const key of ["physical", "touch"] as const) {
    const p = data.profiles[key];
    if (p !== undefined && (!isObject(p) || !Array.isArray(p.unlocked) || !isObject(p.keys))) {
      throw new Error("This progress data is damaged and can't be loaded.");
    }
  }
  return migrate(data as unknown as AppData);
}

/**
 * Upgrades older saved data: version 1 → 2 adds modifier, system and shortcut
 * settings; 2 → 3 adds practice settings; 3 → 4 arcade settings; 4 → 5
 * changes nothing here (profiles gain phase 5 data); 5 → 6 adds theme, color
 * mode, accessibility and sound. Missing settings take their defaults.
 * Profiles migrate in the engine.
 */
function migrate(data: AppData): AppData {
  const defaults = defaultSettings(data.settings.activeProfile ?? "physical");
  const saved = data.settings;
  data.settings = {
    ...defaults,
    ...saved,
    modifiers: { ...defaults.modifiers, ...saved.modifiers },
    a11y: { ...defaults.a11y, ...saved.a11y },
    sound: { ...defaults.sound, ...saved.sound },
  };
  for (const key of ["physical", "touch"] as const) {
    const p = data.profiles[key];
    if (p) data.profiles[key] = migrateProfile(p as unknown as Record<string, unknown>);
  }
  data.version = DATA_VERSION;
  return data;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A compact text code: prefix + base64 of gzipped JSON. */
export async function toCode(data: AppData): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const zipped = await transform(bytes, new CompressionStream("gzip"));
  return CODE_PREFIX + toBase64(zipped);
}

export async function fromCode(code: string): Promise<AppData> {
  const trimmed = code.replace(/\s+/g, "");
  if (!trimmed.startsWith(CODE_PREFIX)) throw new Error("That code doesn't start with ADAPTYPE1. Copy the whole code and try again.");
  let bytes: Uint8Array;
  try {
    bytes = await transform(fromBase64(trimmed.slice(CODE_PREFIX.length)), new DecompressionStream("gzip"));
  } catch {
    throw new Error("That code is incomplete or damaged. Copy the whole code and try again.");
  }
  return parseData(new TextDecoder().decode(bytes));
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
