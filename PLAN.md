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
  - Source (recommended, pending sign-off): the top words from **wordfreq**,
    checked against **SCOWL** so only real, correctly spelled words remain,
    then run through a profanity filter. See "Word list research" below.
  - Filter out offensive words and obscure proper nouns.
- **Code snippets:** symbols, brackets and keywords.
- **Quotes and sentences:** real phrases with punctuation and capitals.
- **Mixing:** pick one pack, or mix several with adjustable weights.

### Modifiers

Modifiers add symbols, punctuation and capitals on top of any pack. They are
placed at random, and each has its own on/off switch and frequency setting
(low, medium, high).

- **Capitalization:** two settings:
  - *First letter only:* random words start with a capital (`Apple`).
  - *Any letter:* random letters anywhere in a word are capitals (`apPle`).
- **Punctuation:** random `. , ! ? ; : ' " -` attached to words the way they
  appear in real text (`word,` `word.` `"word"`).
- **Symbols:** random `@ # $ % & * ( ) [ ] { } < > / \ | _ + = ~ ^` mixed in.
- **Numbers:** random `0-9`, alone or inside words and symbols (`42`, `v2`,
  `$15`). Its own modifier, separate from symbols.
- **Accented letters:** `é ñ ü ç å ø` and similar, typed with dead keys or
  Option on Mac, AltGr on Windows and Linux, and long-press on touch.
- **Extra characters:** characters behind Option and Option+Shift on Mac, or
  AltGr on Windows and Linux: `© ™ • – — … ≠ ± ° ¶ § ∞`. Each OS gets its own
  character map, because the same character sits on different keys (or isn't
  available) depending on the OS and layout. On a Windows US layout, which has
  no AltGr, the pool shrinks to what can be typed, with Alt codes as an
  optional advanced setting. On touch, these come from long-press menus.

The engine tracks these like any other key, so a weak `;` or a slow Shift gets
targeted too. Extra weaknesses it watches for:

- **Shift timing (physical):** slow or missed Shift presses, and using the
  wrong hand's Shift.
- **Layer switching (touch):** the cost of switching to the number and symbol
  keyboard and back.
- **Modifier chords:** Option, Option+Shift and AltGr combos, and the
  long-press delay on touch.

### Shortcut drill

Ctrl and Cmd combos don't type characters, so they get their own drill instead
of being a modifier. It can run as a separate round type or be mixed into
regular rounds.

- **Two styles, as a setting:**
  - *Shown combos:* displays `⌘ + Z` and you press it.
  - *Named actions:* displays "Undo" and you press the right combo for your OS.
  - Start with shown combos and switch to named actions once you know them.
- **Per OS:** Cmd on Mac, Ctrl on Windows and Linux.
- **Safe combos only:** some shortcuts can't be blocked by a web page or app
  (Cmd+W and Ctrl+W close the tab, Cmd+Q quits). The drill only uses combos
  that are safe to press on that platform, and each platform keeps its own
  allowlist.
- Tracked like keys: slow or wrong shortcuts come back more often.
- Physical keyboards only. Touch has no equivalent.

## Unlocking and calibration

### Gradual unlock

You start with about 6 letters. When you've mastered the current set, the next
letter unlocks. Mastery means reaching your speed goal and accuracy target on
every unlocked letter, measured over recent rounds rather than one lucky run.

- **Unlock order** is a setting:
  - *Most common first* (`e t a o i n s r ...`), so real words appear early.
  - *Home row first* (physical keyboards): home row, then top row, then
    bottom row. On touch, this falls back to most common first.
- Each newly unlocked letter gets extra attention for a while.
- Words in a round only use unlocked letters. Early on, when few real words
  fit, made-up drill words fill the gap.
- Unlocking is tracked per input profile and per keyboard layout.

### Modifier unlocks

After all letters are unlocked, modifiers unlock in stages: capitals, then
punctuation, then numbers, then symbols, then the last stage: accented
letters, extra characters and the shortcut drill. Any of them can also be
turned on early in settings.

### Calibration

- **First-launch test:** a 1-minute test, offered the first time each input
  profile (physical or touch) is used. It measures your speed and accuracy,
  suggests a speed goal, and **tests you out** of letters and modifiers you
  already handle well, so they start unlocked.
- **Skippable:** skip the test and AdapType calibrates silently from your
  first few rounds instead.
- **Silent tuning:** the engine keeps adjusting its picture of you as you
  play, test or no test.
- **Re-calibrate anytime** from settings, for example after a long break.

## How it adapts

All of these are planned. Phase 1 covers the first two, phase 2 adds the
difficulty curve, and phases 3 and 4 cover the rest.

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

## Speed goal

You set a target speed (for example 60 WPM), and optionally a target
accuracy. Goals are set separately for physical and touch, since phone speeds
are usually lower.

- **Pacing:** the difficulty curve aims for rounds that sit just below your
  goal, so you stretch toward it without being overwhelmed.
- **Goal bar:** shows your recent average against the goal.
- **Forecast:** "At this rate you'll reach 60 WPM in about 3 weeks."
- **Rival at goal speed:** the rubber-band rival can be set to race at your
  goal speed instead of just ahead of you.
- **Next goal:** when you reach a goal, AdapType suggests the next one.

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
- **Modifiers:** capitalization (first letter only or any letter),
  punctuation, numbers, symbols, accented letters and extra characters, each
  with a frequency, plus "unlock early" switches
- **Shortcut drill:** on or off, shown combos or named actions
- **Unlock order:** most common first or home row first
- **Calibration:** re-run the test
- **Speed goal:** target WPM and accuracy, per input profile
- **Sound:** key clicks and effects (combo chimes, error buzz), can be turned
  off
- **Input profile:** physical or touch, auto-detected with a manual override

## Extra features

All of these are in the plan. The phase each one lands in is listed under
Phases below.

- **Explain the round:** the engine says why it chose this round ("You
  hesitate on `q`, and miss `br` 1 time in 4").
- **Tap-drift map (touch):** learns where your thumb really lands on each key
  and shows it as a map.
- **Made-up drill words:** when real words can't target a weakness well
  enough, generate pronounceable made-up words packed with the weak pairs.
- **Your own words:** paste your own text (notes, messages) and train on the
  words you actually use. Stays on the device.
- **Self-correction score:** credit for errors you caught and fixed yourself,
  not just the final result.
- **Slow-motion replay:** replay a run with its real timing to see exactly
  where you stalled.
- **Key creatures:** each key is a little creature with a health bar that
  levels up as you improve. Collect them all.
- **Nemesis key:** your single worst key gets a name and personality, and
  becomes a recurring boss.
- **Rubber-band rival:** an opponent that stays just slightly faster than you,
  or races at your goal speed.
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

This is a lot, and it's meant to be built over time. Each phase is playable on
its own; nothing waits for a later phase to be fun.

1. **Core: something to play**
   - Engine: keystroke recording, weak keys, weak pairs, input profiles
   - Engine spec and first test vectors
   - English word pack (several thousand words)
   - Practice mode on web, for physical keyboards and the touch on-screen
     keyboard
   - Gradual letter unlocking (both orders)
   - Calibration: first-launch test with test-out, skip option, silent
     tuning, re-calibrate
   - One theme, keyboard heatmap, live WPM and accuracy
   - Speed goal: set a target and see the goal bar
2. **Modifiers and goals**
   - Capitalization (first letter only or any letter), punctuation,
     numbers, symbols, with staged unlocks and "unlock early" switches
   - Shift timing and touch layer-switching tracking
   - Accented letters and extra characters, with per-OS character maps
   - Shortcut drill (shown combos and named actions, safe combos only)
   - Difficulty curve, with pacing toward your speed goal
   - Explain the round
3. **Smarter engine**
   - Mistake replay, spaced repetition, smart warm-up
   - Hesitation detection, error-type analysis
   - Finger and thumb tracking, rhythm coaching, fatigue detection
   - Tap-drift map, self-correction score
   - Made-up drill words (a simple version ships in phase 1 to support early
     unlocking)
4. **Arcade**
   - Falling words and survival
   - Ghost race and rubber-band rival
   - Boss rounds and the nemesis key
5. **Progress and personality**
   - Key creatures
   - Improvement and goal forecasts
   - Slow-motion replay
   - Offline daily challenge
   - Typing fingerprint card
6. **Polish and reach**
   - All four themes and sound
   - Code and quote packs, your own words
   - Accessibility modes, keyboard layouts
7. **Port (far future):** Swift and Kotlin versions, verified against the
   test vectors. Not planned in detail yet.

## Word list research

| Source | License | Verdict |
| --- | --- | --- |
| [wordfreq](https://github.com/rspeer/wordfreq) | Data: CC BY-SA 4.0. Code: Apache. | **Recommended for ranking.** High-quality frequencies from many sources. Requires credit, and the word list file we ship must stay under CC BY-SA. Frozen at about 2021 data, which is fine for common words. |
| [SCOWL](https://github.com/en-wl/wordlist) | MIT-like | **Recommended as a filter.** No exact frequencies, but size tiers (35 small, 50 medium, higher means rarer) confirm real, correctly spelled words. |
| [google-10000-english](https://github.com/first20hours/google-10000-english) | Built on LDC data | **Avoid.** The author advises against commercial use without an LDC license. |
| [SUBTLEX-US](https://osf.io/djpqz) | Unclear | **Avoid for now.** Free for research. Broader permission is only reported secondhand. |

Plan: take wordfreq's top English words, keep those found in SCOWL size 50 or
below, remove offensive words, and keep about 10,000. Credit wordfreq (and its
sources) and SCOWL on an About screen.

## Open questions

- Sign-off on the word list approach above.
- How the micro-app will be embedded in the host app (web view, native
  screen, or both).
