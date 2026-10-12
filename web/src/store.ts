// Saved data: one JSON document in localStorage, with a version number so
// later phases can migrate it.
import { createProfile, type ErrorMode, type InputProfile, type ProfileState, type RoundType } from "../../engine/src";

export const DATA_VERSION = 1;
const STORAGE_KEY = "adaptype";
const CODE_PREFIX = "ADAPTYPE1:";

export interface Settings {
  activeProfile: InputProfile;
  round: RoundType;
  errorMode: ErrorMode;
}

export interface AppData {
  version: number;
  settings: Settings;
  profiles: Partial<Record<InputProfile, ProfileState>>;
}

export function defaultData(activeProfile: InputProfile): AppData {
  return {
    version: DATA_VERSION,
    settings: { activeProfile, round: { kind: "words", count: 25 }, errorMode: "backspace" },
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
  return data as unknown as AppData;
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
