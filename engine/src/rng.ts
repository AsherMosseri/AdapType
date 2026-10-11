// Seeded random numbers. Every random choice the engine makes goes through
// this, so the same seed always produces the same rounds on every platform.

/** 32-bit FNV-1a hash of a string's UTF-16 code units. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Combines parts into one seed: FNV-1a of the parts joined with "|". */
export function deriveSeed(...parts: (string | number)[]): number {
  return hashString(parts.join("|"));
}

/** Mulberry32: small, fast, and easy to reimplement with 32-bit integer math. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** A float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + (Math.imul(t ^ (t >>> 7), t | 61) >>> 0))) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** An integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /**
   * Picks an index with probability proportional to its weight.
   * Draws r = next() * total and returns the first index whose running total
   * exceeds r. Returns -1 if every weight is zero.
   */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w;
    if (total <= 0) return -1;
    const r = this.next() * total;
    let running = 0;
    for (let i = 0; i < weights.length; i++) {
      running += weights[i];
      if (r < running) return i;
    }
    return weights.length - 1;
  }
}
