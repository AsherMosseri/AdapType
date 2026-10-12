import { ArcadeGame, Rng, type ArcadeEvent } from "../src";

export interface Bot {
  /** Characters per second. */
  cps: number;
  /** Chance of a wrong key per keystroke. */
  errorRate: number;
  seed: number;
}

/**
 * Plays an arcade game: ticks every `step` seconds and types the word nearest
 * the bottom at the bot's speed. Returns every event in order.
 */
export function playBot(game: ArcadeGame, bot: Bot, seconds: number, step = 0.05): ArcadeEvent[] {
  const rng = new Rng(bot.seed);
  const events: ArcadeEvent[] = [];
  let budget = 0;
  for (let t = 0; t < seconds && !game.over; t += step) {
    events.push(...game.tick(step));
    budget += bot.cps * step;
    while (budget >= 1 && !game.over) {
      budget -= 1;
      let word = game.words.find((w) => w.id === game.target);
      if (!word) {
        word = [...game.words].sort((a, b) => b.y - a.y || a.id - b.id)[0];
        if (!word) break;
      }
      const ch = rng.next() < bot.errorRate ? "#" : word.text[word.typed];
      events.push(...game.input(ch, Math.round(game.time * 1000)));
    }
  }
  return events;
}
