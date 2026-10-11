import { Rng, type TypingEvent } from "../src";

export interface Typist {
  /** Milliseconds per keystroke. */
  msPerKey: number;
  /** Chance of hitting a wrong key, then fixing it with backspace. */
  errorRate: number;
  seed: number;
}

/** Keystrokes a simulated typist makes for a target text, fixing errors with backspace. */
export function simulateTyping(target: string, typist: Typist, startT = 1000): TypingEvent[] {
  const rng = new Rng(typist.seed);
  const events: TypingEvent[] = [];
  let t = startT;
  for (const ch of target) {
    if (rng.next() < typist.errorRate) {
      const wrong = ch === "x" ? "z" : "x";
      t += typist.msPerKey;
      events.push({ kind: "char", char: wrong, t });
      t += typist.msPerKey;
      events.push({ kind: "backspace", t });
    }
    t += typist.msPerKey;
    events.push({ kind: "char", char: ch, t });
  }
  return events;
}
