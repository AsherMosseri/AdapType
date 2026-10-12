import type { App, Screen, ScreenView } from "../app";
import { topBar } from "../components/topBar";
import { h } from "../dom";

export function aboutScreen(app: App, screen: Screen): ScreenView {
  const returnTo = screen.name === "about" ? screen.returnTo : undefined;
  const back = () => (returnTo ? app.go(returnTo) : app.home());
  const link = (href: string, text: string) => h("a", { href, target: "_blank", rel: "noopener" }, text);

  const el = h(
    "div",
    { class: "screen" },
    topBar(app, { back, noSettings: true }),
    h(
      "main",
      { class: "about prose" },
      h("h1", { tabindex: "-1" }, "About AdapType"),
      h(
        "p",
        null,
        "AdapType is a typing game that learns your weak spots. It times every keystroke, scores each key and letter pair by speed and accuracy, and builds each round from words that lean on what needs work.",
      ),
      h("p", null, "Your progress stays in this browser. Nothing is uploaded."),
      h("h2", null, "Word list"),
      h(
        "p",
        null,
        "The 10,000 practice words come from ",
        link("https://github.com/rspeer/wordfreq", "wordfreq"),
        " by Robyn Speer, which ranks words by how often they're used across many sources. The word list is shared under the ",
        link("https://creativecommons.org/licenses/by-sa/4.0/", "CC BY-SA 4.0"),
        " license, like the wordfreq data it comes from.",
      ),
      h(
        "p",
        null,
        "Words are checked against the ",
        link("https://github.com/en-wl/wordlist", "English Speller Database (SCOWL)"),
        ", copyright 2000-2026 Kevin Atkinson, so only real, correctly spelled words appear.",
      ),
      h("h2", null, "Fonts"),
      h("p", null, "Atkinson Hyperlegible Next and Atkinson Hyperlegible Mono, from the Braille Institute, under the SIL Open Font License."),
    ),
  );
  return { el };
}
