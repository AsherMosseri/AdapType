// Sound and screen reader feedback after each keystroke, shared by every
// screen where you type a text (practice, races, the daily challenge).
import type { KeystrokeRecord, TypingRound } from "../../engine/src";
import { announce, spoken, wordAt } from "./announce";
import { playSound } from "./sound";

/**
 * A click for a right key, a buzz and a spoken mistake for a wrong one, and
 * the next word read out when you move onto it.
 */
export function keystrokeFeedback(round: TypingRound, record: KeystrokeRecord | null, before: number): void {
  if (record) {
    if (record.correct) playSound("key");
    else {
      playSound("error");
      announce(`Mistake. Expected ${spoken(record.expected)}.`, true);
    }
  }
  const pos = round.position;
  if (pos !== before && !round.done && (pos === 0 || round.target[pos - 1] === " ")) announce(wordAt(round.target, pos));
}
