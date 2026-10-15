// Screen reader announcements through two live regions, one polite and one
// assertive. Off when the accessibility setting is off.
let enabled = true;
let polite: HTMLElement | null = null;
let assertive: HTMLElement | null = null;

export function configureAnnounce(on: boolean): void {
  enabled = on;
}

function region(kind: "polite" | "assertive"): HTMLElement {
  const el = document.createElement("div");
  el.className = "sr-only";
  el.setAttribute("aria-live", kind);
  el.setAttribute("aria-atomic", "true");
  document.body.append(el);
  return el;
}

/** Says text to screen readers. Urgent text (mistakes) interrupts; the rest waits its turn. */
export function announce(text: string, urgent = false): void {
  if (!enabled || !text) return;
  const el = urgent ? (assertive ??= region("assertive")) : (polite ??= region("polite"));
  // Clearing first makes the same text announce again.
  el.textContent = "";
  window.setTimeout(() => (el.textContent = text), 30);
}

/** The word that starts at or contains `position` in `text`. */
export function wordAt(text: string, position: number): string {
  let start = position;
  while (start > 0 && text[start - 1] !== " ") start--;
  let end = text.indexOf(" ", position);
  if (end < 0) end = text.length;
  return text.slice(start, end);
}

/** How a character is read out: spaces and punctuation by name. */
export function spoken(ch: string): string {
  const names: Record<string, string> = { " ": "space", ".": "period", ",": "comma", "'": "apostrophe", '"': "quote", "-": "dash", "?": "question mark", "!": "exclamation mark", ";": "semicolon", ":": "colon" };
  return names[ch] ?? (ch >= "A" && ch <= "Z" ? `capital ${ch}` : ch);
}
