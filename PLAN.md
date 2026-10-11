# AdapType Plan

A typing game that learns your weak spots and keeps targeting them. It starts
as a fun web project. Much later it becomes a micro-app inside a larger app,
ported to Swift and Kotlin.

Status: planning. No code yet.

## Principles

- **Engine first, UI second.** All the logic that learns from your typing and
  picks what to type next is plain, framework-free code. The UI is a thin
  layer on top, so each platform only has to rebuild the UI.
- **Touch and physical keyboards are both first-class.** Every feature is
  designed for both from day one, not retrofitted.
- **Private by default.** Progress lives on the device. Nothing is uploaded.
- **Short sessions work.** As a micro-app, a 30-second round has to be
  satisfying on its own.

## Architecture

| Piece | What it is |
| --- | --- |
| Engine | Framework-free logic: records keystrokes, scores weaknesses, generates rounds. |
| Engine spec | A written rulebook for the engine, precise enough to reimplement from. |
| Test vectors | Shared JSON cases (input keystrokes in, expected stats and choices out) that every port must pass. |
| Content packs | Shared JSON files read by every version. |
| Storage | Local only (browser storage on web, on-device storage in native apps). |
| UI | Per platform. Web first. |

Randomness in the engine uses a seeded generator, so the same seed and the
same history always produce the same round. This makes test vectors possible
and allows daily challenges without a server.

## Input: touch and physical keyboards

The engine sees an **input profile** for every session: `physical` or
`touch`. Stats are kept separately per profile, because weaknesses on a phone
are different from weaknesses on a laptop.

Each keystroke event records:

- the expected character and the character actually produced
- a timestamp (for speed, hesitation and rhythm)
- for touch: the tap position relative to the key's center, and the key
  geometry at that moment

**Key decision for touch:** system keyboards (iOS, Android, mobile browsers)
do not reveal where your finger landed, and they autocorrect. To learn from
touch typing properly, touch mode uses AdapType's **own on-screen keyboard**.
This gives tap positions, no autocorrect, and consistent layout across
platforms. A "use my system keyboard" option stays available, with fewer
touch-specific insights.

What changes per profile:

| Feature | Physical | Touch |
| --- | --- | --- |
| Finger tracking | Which finger is weakest (standard touch-typing map) | Which thumb, and which screen zone, is weakest |
| Common errors | Wrong neighbor key, swapped letters, doubled letters | Fat-finger neighbor hits, edge-of-key misses |
| Extra insight | Rhythm across hands | Tap drift: where your taps actually land on each key |

## Content

- **English words:** a pack of several thousand common words (target around
  10,000), ranked by frequency. Each word is stored with its rank so the
  engine can start with common words and widen out. The engine pre-indexes
  which letters and letter pairs each word contains, so it can quickly find
  words that hit your weak spots.
  - Source: a frequency-ranked list with a license that allows bundling in an
    app. Verify the license before adding it.
  - Filter out offensive words and obscure proper nouns.
- **Code snippets:** symbols, brackets and keywords.
- **Quotes and sentences:** real phrases with punctuation and capitals.
- **Mixing:** pick one pack, or mix several with adjustable weights.

## How it adapts

All of these are planned. Phase 1 covers the first two; the rest arrive in
phase 2.

1. **Weak keys:** letters you miss or hit slowly appear more often.
2. **Weak letter pairs:** awkward combinations (`br`, `ce`, `ny`) get drilled.
3. **Difficulty curve:** speed targets and word length rise and fall with
   performance.
4. **Mistake replay:** words you botched come back later.
5. **Finger tracking:** finds your weakest finger (or thumb, on touch) and
   drills its keys.
6. **Rhythm coaching:** spots uneven bursts and stalls, rewards steady typing.
7. **Fatigue detection:** notices you slowing down within a session and
   suggests a break or an easier round.
8. **Spaced repetition:** weak keys come back on a schedule until they stick.
9. **Hesitation detection:** catches keys you pause before, even when correct.
10. **Error-type analysis:** tells apart swapped letters, neighbor hits and
    doubled letters, and drills each differently.
11. **Ghost racer:** race a replay of your own best run.
12. **Smart warm-up:** each session opens with last session's trouble spots.

## Modes

- **Practice:** calm, endless, quietly adaptive.
- **Arcade:**
  - Falling words: type them before they land.
  - Survival: lives, and a speed that keeps climbing.
  - Ghost race: you against your best run.
  - Boss rounds: every few levels, a tough word built from your weakest keys.

## Feedback

- Live WPM and accuracy
- Keyboard heatmap of weak keys (and tap-drift map on touch)
- Combo streaks and personal-best celebrations
- Progress over time per key

## Settings

- **Theme:** retro terminal, cute and colorful, clean and minimal, mechanical
  keyboard
- **Content mix:** which packs, and how much of each
- **Sound:** key clicks and effects (combo chimes, error buzz), can be turned
  off
- **Input profile:** physical or touch, auto-detected with a manual override

## Ideas pool (not yet decided)

Features that typing trainers usually don't have. Pick which to promote into
the phases.

- **Explain the round:** the engine says why it chose this round ("You
  hesitate on `q`, and miss `br` 1 time in 4").
- **Tap-drift calibration (touch):** learns where your thumb really lands on
  each key and shows it as a map.
- **Pseudo-word drills:** when real words can't target a weakness well
  enough, generate pronounceable made-up words packed with the weak pairs.
- **Your own words:** paste your own text (notes, messages) and train on the
  words you actually use. Stays on the device.
- **Self-correction score:** counts errors you caught and fixed yourself, not
  just the final result.
- **Slow-motion replay:** replay a run with its real timing to see exactly
  where you stalled.
- **Key creatures:** each key is a little creature with a health bar that
  levels up as you improve. Collect them all.
- **Nemesis key:** your single worst key gets a name and personality, and
  becomes a recurring boss.
- **Rubber-band rival:** an opponent that always stays just slightly faster
  than you.
- **Improvement forecast:** "At this rate, `p` stops being a weak key in
  about 5 days."
- **Offline daily challenge:** the same daily round for everyone, built from
  a date-based seed, with no server needed.
- **Typing fingerprint card:** a shareable image of your strengths,
  weaknesses and style.
- **Accessibility modes:** dyslexia-friendly font, adjustable size, reduced
  motion, color-blind-safe heatmaps.
- **Keyboard layouts:** QWERTY, AZERTY, QWERTZ, Dvorak, Colemak.

## Phases

1. **Core**
   - Engine: keystroke recording, weak keys, weak pairs, input profiles
   - Engine spec and first test vectors
   - English word pack (several thousand words)
   - Practice mode on web, physical keyboard and the touch on-screen keyboard
   - One theme, keyboard heatmap, live WPM and accuracy
2. **Smarter engine:** adaptive features 3 to 12.
3. **Arcade:** falling words and survival first, then ghost race and boss
   rounds.
4. **Polish:** all four themes, sound, code and quote packs, chosen ideas
   from the pool.
5. **Port (far future):** Swift and Kotlin versions, verified against the
   test vectors. Not planned in detail yet.

## Open questions

- Which ideas from the pool to promote, and into which phase.
- Which word list to use, once its license is checked.
- How the micro-app will be embedded in the host app (web view, native
  screen, or both).
