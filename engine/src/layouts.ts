// Keyboard layouts: where each letter sits, which finger types it, which
// keys are neighbors, and the home-row unlock order. Stats are kept per
// layout, since the same letter is a different reach on each one.

/** Letter arrangements. QWERTY covers US, UK and US-International, which only differ in symbols. */
export type LayoutId = "qwerty" | "azerty" | "qwertz" | "dvorak" | "colemak" | "colemak-dh";

export interface KeyLayout {
  name: string;
  /** Top, home and bottom rows, ten key positions each (punctuation where a layout has it). */
  rows: readonly [string, string, string];
  /** Home row first, then top row, then bottom row. */
  homeRow: string;
}

/**
 * QWERTY keeps the home-row order it has always had. The others follow one
 * rule: the home row's home positions (columns 1-4 and 7-10, left to right),
 * then its two inner keys (column 6, then 5), then the top row's letters and
 * then the bottom row's, each by English letter frequency.
 */
export const KEY_LAYOUTS: Record<LayoutId, KeyLayout> = {
  qwerty: { name: "QWERTY", rows: ["qwertyuiop", "asdfghjkl;", "zxcvbnm,./"], homeRow: "asdfjklhgeriotuwypqncmvbxz" },
  azerty: { name: "AZERTY", rows: ["azertyuiop", "qsdfghjklm", "wxcvbn,;:!"], homeRow: "qsdfjklmhgetaoiruypzncwbvx" },
  qwertz: { name: "QWERTZ", rows: ["qwertzuiop", "asdfghjklö", "yxcvbnm,.-"], homeRow: "asdfjklhgetoiruwpqzncmybvx" },
  dvorak: { name: "Dvorak", rows: ["',.pyfgcrl", "aoeuidhtns", ";qjkxbmwvz"], homeRow: "aoeuhtnsdirlcfgypmwbvkjxqz" },
  colemak: { name: "Colemak", rows: ["qwfpgjluy;", "arstdhneio", "zxcvbkm,./"], homeRow: "arstneiohdluwfgypjqcmbvkxz" },
  "colemak-dh": { name: "Colemak-DH", rows: ["qwfpbjluy;", "arstgmneio", "zxcdvkh,./"], homeRow: "arstneiomgluwfypbjqhdcvkxz" },
};

export const LAYOUT_IDS = Object.keys(KEY_LAYOUTS) as LayoutId[];

/** Row and column of a key (lowercase letters and the layout's punctuation), or null. */
export function keyPosition(ch: string, layout: LayoutId = "qwerty"): [row: number, col: number] | null {
  const rows = KEY_LAYOUTS[layout].rows;
  for (let r = 0; r < rows.length; r++) {
    const c = rows[r].indexOf(ch);
    if (c >= 0) return [r, c];
  }
  return null;
}

/** Row offsets so neighbors line up like a staggered keyboard. */
const OFFSETS = [0, 0.25, 0.75];

/** Whether two keys are next to each other (including diagonals) on the layout. */
export function areNeighbors(a: string, b: string, layout: LayoutId = "qwerty"): boolean {
  const pa = keyPosition(a.toLowerCase(), layout);
  const pb = keyPosition(b.toLowerCase(), layout);
  if (!pa || !pb || (pa[0] === pb[0] && pa[1] === pb[1])) return false;
  const dy = Math.abs(pa[0] - pb[0]);
  const dx = Math.abs(pa[1] + OFFSETS[pa[0]] - (pb[1] + OFFSETS[pb[0]]));
  return dy <= 1 && dx <= 1;
}

/** Letters (a-z) in the given columns of the given rows, in row then column order. */
function lettersAt(layout: LayoutId, cols: readonly number[], rows: readonly number[] = [0, 1, 2]): string {
  let out = "";
  for (const r of rows) for (const c of cols) {
    const ch = KEY_LAYOUTS[layout].rows[r][c];
    if (ch >= "a" && ch <= "z") out += ch;
  }
  return out;
}

/** Letters typed with the left hand (columns 1-5): an uppercase one should use the right Shift. */
export function leftHandLetters(layout: LayoutId = "qwerty"): string {
  return lettersAt(layout, [0, 1, 2, 3, 4]);
}

/** Standard touch-typing fingers by column: pinky, ring, middle, two index columns per hand. */
export function fingerMap(layout: LayoutId = "qwerty"): Record<string, string> {
  return {
    "Left pinky": lettersAt(layout, [0]),
    "Left ring": lettersAt(layout, [1]),
    "Left middle": lettersAt(layout, [2]),
    "Left index": lettersAt(layout, [3, 4]),
    "Right index": lettersAt(layout, [5, 6]),
    "Right middle": lettersAt(layout, [7]),
    "Right ring": lettersAt(layout, [8]),
    "Right pinky": lettersAt(layout, [9]),
  };
}

/** Keyboard zones for people who don't touch-type: left (columns 1-3), center (4-7) and right (8-10) by row. */
export function zoneMap(layout: LayoutId = "qwerty"): Record<string, string> {
  const names = ["top row", "home row", "bottom row"];
  const out: Record<string, string> = {};
  for (const [side, cols] of [["Left", [0, 1, 2]], ["Center", [3, 4, 5, 6]], ["Right", [7, 8, 9]]] as const) {
    names.forEach((row, r) => {
      const letters = lettersAt(layout, cols, [r]);
      if (letters) out[`${side}, ${row}`] = letters;
    });
  }
  return out;
}

/**
 * Thumbs when holding a phone with two thumbs. Phone keyboards center the
 * shorter bottom row, so the left thumb takes columns 1-5 of the top and
 * middle rows but only columns 1-4 of the bottom row.
 */
export function thumbMap(layout: LayoutId = "qwerty"): Record<string, string> {
  return {
    "Left thumb": lettersAt(layout, [0, 1, 2, 3, 4], [0, 1]) + lettersAt(layout, [0, 1, 2, 3], [2]),
    "Right thumb": lettersAt(layout, [5, 6, 7, 8, 9], [0, 1]) + lettersAt(layout, [4, 5, 6, 7, 8, 9], [2]),
  };
}

/**
 * Screen zones on a phone keyboard: left, middle and right by row. The top
 * and middle rows split at columns 1-3, 4-7 and 8-10; the centered bottom
 * row at columns 1-2, 3-5 and 6-10.
 */
export function screenZoneMap(layout: LayoutId = "qwerty"): Record<string, string> {
  const splits = [
    [[0, 1, 2], [3, 4, 5, 6], [7, 8, 9]],
    [[0, 1, 2], [3, 4, 5, 6], [7, 8, 9]],
    [[0, 1], [2, 3, 4], [5, 6, 7, 8, 9]],
  ];
  const names = ["top row", "middle row", "bottom row"];
  const out: Record<string, string> = {};
  names.forEach((row, r) => {
    (["Left", "Middle", "Right"] as const).forEach((side, i) => {
      const letters = lettersAt(layout, splits[r][i], [r]);
      if (letters) out[`${side}, ${row}`] = letters;
    });
  });
  return out;
}

/** The letters of each row, for drawing a keyboard (heatmaps, the on-screen keyboard). */
export function letterRows(layout: LayoutId = "qwerty"): [string, string, string] {
  return KEY_LAYOUTS[layout].rows.map((row) => [...row].filter((c) => c >= "a" && c <= "z").join("")) as [string, string, string];
}
