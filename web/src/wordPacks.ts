// The word pack practice and the arcade draw from: English mixed with your
// own word packs, by weight. Cached until the mix changes.
import { mixWordPacks, type WordPack } from "../../engine/src";
import type { App } from "./app";
import { pack } from "./content";

let cacheKey = "";
let cached: WordPack = pack;

export function practicePack(app: App): WordPack {
  const english = app.data.settings.content.english;
  const custom = app.data.customPacks.filter((p) => p.weight > 0 && p.words.length > 0);
  if (custom.length === 0) return pack;
  const key = JSON.stringify([english, custom.map((c) => [c.id, c.weight, c.at])]);
  if (key !== cacheKey) {
    const mixed = mixWordPacks([{ words: pack.words, weight: english }, ...custom.map((c) => ({ words: c.words.map((w) => w[0]), weight: c.weight }))]);
    cached = mixed.words.length > 0 ? mixed : pack;
    cacheKey = key;
  }
  return cached;
}
