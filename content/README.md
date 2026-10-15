# Content

Shared content packs, read by every version of AdapType (web now, Swift and
Kotlin later).

| File | What it is | License |
| --- | --- | --- |
| `words-en.json` | 10,000 common English words, most common first. | CC BY-SA 4.0 (derived from wordfreq) |
| `blocklist.json` | Words never shown in practice, also used to filter made-up words. | Part of AdapType |
| `characters.json`, `loanwords.json` | Punctuation, symbols, accented letters and extra characters, with how to type them. | Part of AdapType |
| `touch-layouts.json` | The on-screen keyboard layouts and long-press alternates. | Part of AdapType |
| `nemesis.json` | Nemesis names, taunts and defeat lines, in each theme's tone. | Part of AdapType |
| `code.json` | Code snippets in nine languages, written for AdapType. | Part of AdapType |
| `quotes.json` | Passages from public-domain works, each credited. | Public domain |
| `shortcuts-*.json` | Shortcut packs: text editing, macOS, Windows, Linux (GNOME), browser, VS Code, Google Docs and Sheets, Figma, Slack. | Part of AdapType |

## Credits

- Word frequencies from [wordfreq](https://github.com/rspeer/wordfreq) by
  Robyn Speer, licensed CC BY-SA 4.0. wordfreq draws on many sources; see its
  README for the full list. Because `words-en.json` is derived from wordfreq
  data, it is shared under the same CC BY-SA 4.0 license.
- Filtered with the [English Speller Database (SCOWL)](https://github.com/en-wl/wordlist),
  copyright 2000-2026 Kevin Atkinson, used under its MIT-like license.

## Rebuilding the word pack

See `build/build_words.py` for the exact steps.
