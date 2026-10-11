import type { RoundWord } from "../../../engine/src";
import type { TypingRound } from "../../../engine/src/typing";
import { h } from "../dom";

/**
 * Shows the round's text with typed, wrong and upcoming characters, and keeps
 * the current line in view (three lines visible).
 */
export class TypingView {
  readonly el: HTMLElement;
  private readonly inner: HTMLElement;
  private readonly chars: HTMLSpanElement[] = [];
  private lastPosition = 0;
  private wordCount = 0;

  constructor(words: RoundWord[]) {
    this.inner = h("div", { class: "typing-inner" });
    this.el = h("div", { class: "typing", "aria-hidden": "true" }, this.inner);
    this.addWords(words);
  }

  addWords(words: RoundWord[]): void {
    for (const word of words) {
      if (this.wordCount > 0) this.chars.push(this.addSpace());
      const wordEl = h("span", { class: word.madeUp ? "word made-up" : "word" });
      for (const ch of word.text) {
        const span = h("span", { class: "ch" }, ch);
        wordEl.append(span);
        this.chars.push(span);
      }
      this.inner.append(wordEl);
      this.wordCount++;
    }
    if (this.chars.length > 0) this.chars[this.lastPosition]?.classList.add("current");
  }

  private addSpace(): HTMLSpanElement {
    const span = h("span", { class: "ch space" }, " ");
    this.inner.append(span);
    return span;
  }

  /** Refreshes the characters around the old and new positions. */
  update(round: TypingRound): void {
    const pos = round.position;
    const from = Math.max(0, Math.min(pos, this.lastPosition) - 1);
    const to = Math.min(this.chars.length - 1, Math.max(pos, this.lastPosition) + 1);
    for (let i = from; i <= to; i++) {
      const span = this.chars[i];
      const typed = i < pos;
      span.classList.toggle("ok", typed && round.isCorrectAt(i));
      span.classList.toggle("bad", typed && !round.isCorrectAt(i));
      span.classList.toggle("current", i === pos);
    }
    this.lastPosition = pos;
    this.scroll();
  }

  /** Characters left after the current position. */
  remaining(round: TypingRound): number {
    return this.chars.length - round.position;
  }

  scroll(): void {
    const current = this.chars[Math.min(this.lastPosition, this.chars.length - 1)];
    const first = this.chars[0];
    if (!current || !first) return;
    const lineHeight = parseFloat(getComputedStyle(this.el).lineHeight) || current.offsetHeight || 1;
    // Keep the current line as the second visible line once past the first.
    const line = Math.round((current.offsetTop - first.offsetTop) / lineHeight);
    const offset = Math.max(0, line - 1) * lineHeight;
    this.inner.style.transform = `translateY(${-offset}px)`;
  }
}
