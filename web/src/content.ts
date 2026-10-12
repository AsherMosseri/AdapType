import blocklistJson from "../../content/blocklist.json";
import packJson from "../../content/words-en.json";
import type { Blocklist, WordPack } from "../../engine/src";

export const pack: WordPack = { words: packJson.words };
export const blocklist: Blocklist = blocklistJson;
export const packCredits: string[] = packJson.credits;
