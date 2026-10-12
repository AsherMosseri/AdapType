# AdapType Plan

A typing game that learns your weak spots and keeps targeting them. It starts
as a fun web project. Much later it becomes a micro-app inside a larger app,
ported to Swift and Kotlin.

Status: phase 1 built (web). Phases 2 to 7 planned.

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
placed at random, and each has its own on/off switch and frequency level.

**Frequency levels are ranges, and the engine adapts inside them:**

| Level | Share of words with that modifier |
| --- | --- |
| Low | up to 10% |
| Medium | up to 25% |
| High | up to 50% |
| Auto | the engine picks the range too |

If you're weak at a modifier, it moves toward the top of its range. Once you
handle it well, it drops toward the bottom, but never to zero, so the skill
doesn't fade. Even the highest level leaves at least half your words plain.

- **Capitalization:** two settings:
  - *First letter only:* random words start with a capital (`Apple`).
  - *Any letter:* random letters anywhere in a word are capitals (`apPle`).
- **Punctuation:** `. , ! ? ; : ' " -`, with two settings:
  - *Sentence-like:* periods end sentences and the next word gets a capital;
    commas and quotes go where real text has them.
  - *Fully random:* any punctuation attaches to any word.
- **Symbols:** random `@ # $ % & * ( ) [ ] { } < > / \ | _ + = ~ ^` mixed in.
- **Numbers:** random `0-9`, alone or inside words and symbols (`42`, `v2`,
  `$15`). Its own modifier, separate from symbols.
- **Accented letters:** real English loanwords such as `café`, `jalapeño`,
  `naïve`, `façade`, `über`, `résumé`, so the text reads naturally. Typed
  with dead keys or Option on Mac, AltGr on Windows and Linux, and
  long-press on touch.
- **Extra characters:** characters behind Option and Option+Shift on Mac, or
  AltGr on Windows and Linux. A curated set of about 20 useful ones by
  default (`— – … • © ™ ® ° ± ≠ ≤ ≥ × ÷ € £`), and a setting opens up the
  full OS map. Each OS gets its own
  character map, because the same character sits on different keys (or isn't
  available) depending on the OS and layout. On a Windows US layout, which has
  no AltGr, the pool shrinks to what can be typed, with Alt codes as an
  optional advanced setting. On touch, these come from long-press menus.

The engine tracks these like any other key, so a weak `;` or a slow Shift gets
targeted too. Extra weaknesses it watches for:

- **Shift timing (physical):** slow or missed Shift presses, and using the
  wrong hand's Shift.
- **Layer switching (touch):** the cost of switching to the number and symbol
  keyboard and back. The on-screen symbol layers match your device (iOS
  style on iPhone, Android style on Android), so practice carries over to
  your real keyboard.
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
- **Packs,** each switched on separately. The goal is to cover every
  shortcut worth knowing:
  - *Text editing:* editing, navigation, selection, formatting, find and save
  - *OS-wide:* macOS, Windows and Linux system shortcuts (switch apps,
    screenshots, search, lock screen, window management)
  - *Browser:* tabs, history, zoom, address bar, developer tools
  - *Popular apps:* separate packs added over time (for example VS Code,
    Google Docs, Figma, Slack)
- **Shortcuts the page can't safely catch** (Cmd+Q quits, Cmd+Tab switches
  apps, Ctrl+W closes the tab). Each platform keeps a list of what is safe,
  and the rest are handled like this:
  - *Keyboard lock in fullscreen:* Chrome and Edge let a fullscreen page
    capture more shortcuts, so you can press them for real. Safari and
    Firefox don't support this.
  - *Build-the-combo mode:* for shortcuts that can never be captured, you tap
    on-screen modifier chips (`⌘` `⇧` `⌥` `⌃` plus the key) instead of
    pressing them.
  - *Native apps:* the Swift and Kotlin ports capture whatever their OS
    allows.
- Tracked like keys: slow or wrong shortcuts come back more often.
- Physical keyboards only. Touch has no equivalent.

## Unlocking and calibration

### Gradual unlock

You start with about 6 letters. When you've mastered the current set, the next
letter unlocks. A letter is mastered when you reach your speed goal and 95%
accuracy on it across 3 recent rounds, so one lucky run doesn't count. The
next letter unlocks when every unlocked letter is mastered.

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

## Phase 1 in detail

### Tech and hosting

- **TypeScript + Vite**, no UI framework. The engine has no dependencies and
  never touches the page, so it can be reimplemented in Swift and Kotlin.
- **GitHub Pages**, deployed by a GitHub Actions workflow on every push to
  `main`. (Pages on a private repo needs a paid GitHub plan.)

### Project layout

```
engine/        framework-free engine (TypeScript)
  spec.md      engine rulebook for the ports
  vectors/     shared JSON test vectors
content/       word pack JSON + build script that generates it
web/           web UI (screens, on-screen keyboard, storage)
.github/       Pages deploy workflow
```

### Screens

1. **Welcome:** pick input profile (auto-detected), then take the calibration
   test or skip it.
2. **Calibration test:** 1 minute. Sets starting level, tests out known
   letters, suggests a goal.
3. **Goal picker:** shown after the test (with the suggested goal filled in),
   or on its own if the test was skipped.
4. **Practice:** the round, with live WPM and accuracy and the unlocked
   letters shown. Touch mode shows the on-screen keyboard.
5. **Results:** after each round (see below).
6. **Settings:** round type, error mode, unlock order, goal, input profile,
   re-calibrate, data.
7. **About:** credits for wordfreq and SCOWL.

### Rounds

A setting picks the round type:

- **Word count** (default 25 words)
- **Timed** (30 or 60 seconds)
- **Endless** (stats update live; stop anytime)

### Errors

A setting picks the error mode:

- **Backspace allowed (default):** errors stay until you backspace and fix
  them, like real typing. Corrections are recorded for the phase 3
  self-correction score.
- **Must fix to continue:** a wrong key blocks progress until the right one.
- **Mark and move on:** the error shows in red and you keep going.

### Touch keyboard

- AdapType's own keyboard, QWERTY in phase 1.
- Key pop-up above the thumb on each tap.
- Haptic tap where allowed. Android browsers support it; iPhone Safari does
  not, so iOS gets haptics only in the native port.
- Locked letters are dimmed but still register.
- Tap positions are recorded from day one, so the phase 3 tap-drift map
  starts with history.

### Results screen

- WPM and accuracy, with change compared to your recent average
- Keyboard heatmap of weak keys
- Unlock progress toward the next letter
- Goal bar: recent average against your speed goal

### Speed goal

- Set after calibration, or picked on first launch if the test is skipped.
- Separate goals for physical and touch.
- Accuracy target defaults to 95%.

### Weakness scoring (outline; the engine spec will define it exactly)

- For each key and each letter pair, keep a running average of time to press
  and an error rate, weighted toward recent rounds.
- Combine them into one weakness score per key and pair.
- Pick the next round's words by weighting words that contain high-scoring
  keys and pairs, using only unlocked letters. Fill gaps with made-up drill
  words.
- All randomness uses a seeded generator, so test vectors are reproducible.

### Saved data

- Stored in the browser, per input profile.
- **Reset:** one profile or everything, with an on-page confirmation step.
- **Export and import** as a file.
- **Copy as text code** to paste into another browser or device.
- The saved format has a version number so later phases can migrate it.

### Testing

- Unit tests for the engine.
- Shared JSON test vectors for weakness scoring, unlocking and round
  generation, which the Swift and Kotlin ports must also pass.
- UI checked by hand.

### Done when

- The game is playable on GitHub Pages on a laptop and on a phone.
- Letters unlock as you master them, and calibration can test you out.
- Progress survives a reload and can be exported, imported and reset.
- Engine tests and test vectors pass in CI.

## Phase 2 in detail

### Modifiers

- Capitalization (first letter only or any letter), punctuation
  (sentence-like or fully random), numbers, symbols, accented loanwords and
  extra characters (curated set, expandable).
- Frequency levels Low, Medium, High and Auto, each a range the engine
  adapts inside.
- Staged unlocks after all letters: capitals, punctuation, numbers, symbols,
  then accented letters, extra characters and shortcuts. Each has an
  "unlock early" switch.
- Per-OS character maps for accented letters and extra characters, with the
  OS auto-detected and a manual override.
- Shift timing, modifier chord timing and touch layer switching tracked as
  weaknesses.
- Touch symbol layers match the device (iOS or Android style).

### Shortcut drill

- Text-editing pack only. The OS, browser and app packs come in phase 6.
- Shown combos and named actions, as a setting.
- Keyboard lock in fullscreen where supported, and build-the-combo mode for
  everything else.

### Difficulty curve

Gentle: changes build over several rounds, so one bad round doesn't drop you
back. It adjusts four things, aiming for rounds just below your speed goal:

- word length
- word rarity (how far down the frequency list it reaches)
- modifier density (within each modifier's range)
- weak-spot intensity (how hard rounds lean on your weak keys)

### Explain the round

- **Before the round:** a one-line banner, for example "Focusing on `q` and
  `br`."
- **On results:** what was targeted and how you did on it.
- **Tap for detail:** tap a key on the heatmap to see its stats and why it's
  being targeted.
- **Tone matches the theme.** Phase 2 only has the clean and minimal theme,
  so it ships with a plain, factual tone. Terminal (terse), cute (playful)
  and mechanical keyboard tones arrive with their themes in phase 6.

### Done when

- Every modifier works on physical and touch, and adapts inside its range.
- The text-editing shortcut drill works in Chrome, Edge, Safari and
  Firefox, with build-the-combo mode covering what each browser can't catch.
- The difficulty curve and round explanations are covered by new engine test
  vectors.

## Phase 3 in detail

### Spaced repetition and mistake replay

- **Two timescales:** weak keys and pairs come back a few rounds later in the
  same session, and on a growing schedule across days (for example tomorrow,
  then in 3 days, then in a week). Each success stretches the gap; a miss
  shrinks it.
- **Botched words return** on the same schedule.
- **Mistakes list:** your most-missed words, on a new Progress screen.

### Smart warm-up

About 20 seconds on last session's trouble spots at the start of each
session, with a Skip button.

### Fatigue

The engine watches for speed and accuracy dropping across a session compared
with its start. When it spots fatigue, it:

- suggests a break ("You're slowing down. Take 5?")
- eases the next rounds until you recover
- offers to end with a session summary
- counts tired rounds less toward weakness scores, so fatigue doesn't look
  like weakness

### Rhythm coaching

- **Consistency score** on results: how even your typing was.
- **Rhythm graph:** the gap between each keystroke, so stalls stand out.
- **Metronome (optional):** a visual beat at your goal pace in phase 3; an
  audio beat arrives with sound in phase 6.
- **Live pulse:** a subtle glow that steadies when your rhythm is even.

### Hesitation

A hesitation is a pause noticeably longer than your own usual time for that
key, even if the key is correct. Hesitant keys get extra practice, and a key
that is accurate but hesitant is flagged as "needs confidence" rather than
"weak".

### Error types

- **Kinds:** swapped letters (`teh`), neighbor hits (`r` for `t`), doubled or
  missed double letters (`lettter`, `leter`), and skipped letters.
- **Breakdown on results:** for example "3 swaps, 2 neighbor hits, 1 double
  letter".
- **Targeted drills:** swaps get letter-pair drills, neighbor hits get
  precision drills, double-letter errors get rhythm drills.
- **Per-key detail:** tap a key on the heatmap to see which errors it causes
  and what you typed instead.

### Finger tracking (physical)

AdapType can't see your fingers, so it asks once whether you touch-type:

- **Yes:** it uses the standard touch-typing finger map and reports your
  weakest finger.
- **No:** it tracks by keyboard zone (left, center, right, and by row)
  instead.

### Thumb and tap drift (touch)

- **Grip:** a quick picker each session (one thumb or two), with
  auto-detection suggesting a change when your taps don't match. Stats are
  kept separately per grip.
- **Thumb tracking:** which thumb and which screen zone is weakest.
- **Drift map:** where your taps land on each key compared with its center.
- **Drift drills:** words using the keys you miss most at the edges.
- **Hit zones, as a setting:**
  - *Train (default):* keys stay fixed, so drills fix your aim and carry
    over to your real phone keyboard.
  - *Assist:* each key's tap area quietly shifts toward where you actually
    tap, for comfort.
- Raw tap positions are always recorded, whichever setting is on.

### Self-correction score

Results show how many errors you caught and fixed yourself, using the
corrections recorded since phase 1.

### Made-up drill words (full version)

- Pronounceable, built from real English sound patterns (`brenty`,
  `quolid`).
- Shown in a slightly different style so they don't look like typos.
- A ratio setting caps how many appear per round.
- Filtered so they never accidentally spell an offensive word.

### Progress screen (new)

A home for longer-term stats: the mistakes list, per-key history, finger or
thumb breakdown, the drift map, and spaced-repetition schedule ("`p` is due
again tomorrow").

### Done when

- Every feature above works on physical and touch where it applies.
- Spaced repetition, fatigue detection, hesitation and error-type
  classification are covered by new engine test vectors.
- Saved data from phase 2 migrates cleanly.

## Phase 4 in detail

### Modes

- **Falling words:** words drop from the top; type them before they land.
  Auto-targeting: start typing any visible word and the game locks onto the
  one matching your first letter.
- **Survival:** falling words with a speed that keeps climbing until you
  break. Lives are a setting:
  - *3 lives:* lose one per word that lands or per run of errors.
  - *Health bar:* errors chip away, clean streaks heal a little.
  - *Hardcore:* one mistake ends it.
- **Ghost race:** race your own best run on the same text. A faded ghost
  cursor moves through your text, and a small race track at the top shows
  both of you.
- **Rubber-band rival:** a race against an opponent whose speed is a
  setting: just ahead (about 5% faster than your recent pace, catching up if
  you pull away), at your goal speed, or a custom WPM.

### Levels and bosses

- Falling words and survival have levels. Speed rises each level, and every
  fifth level is a **boss round**.
- **Boss rounds:**
  - The boss has a health bar. Correct words deal damage; errors heal it.
  - Its words are packed with your weakest keys and pairs.
  - At half health it enters a second phase: faster, or with modifiers added.
  - A timer: beat it before time runs out.

### Nemesis key

- Your worst key becomes a character with a generated name and face
  (for example "Quentin the Q").
- It taunts you when it trips you up. In the clean theme the taunts are
  plain; theme-matched tones arrive in phase 6.
- It shows up as a boss from time to time.
- Master the key and the nemesis is defeated; your next-worst key takes its
  place.
- Defeated nemeses are kept as trophies in a "Hall of defeated" on the
  Progress screen.

### Scoring

- Local high scores: top 10 per mode, per input profile.
- Combo multiplier for clean streaks.
- Bonus points for words containing your weak keys.
- A small celebration animation for a personal best (static when reduced
  motion is on).

### Power-ups

Earned by typing: a glowing power-up word appears now and then, built from
your weak keys, and typing it triggers the power-up. Starting set:

- *Slow time:* everything falls slower for a few seconds.
- *Clear screen:* wipes all visible words.
- *Shield:* the next landed word or error costs nothing.
- *Double points:* for a few seconds.

### Learning from arcade

- Arcade play counts toward weak spots, but with less weight than practice,
  since pressure changes how you type.
- Modifiers follow your practice settings and levels.

### Touch

- **Portrait (default):** words fall in the space above the keyboard, slower
  to make up for the shorter distance.
- **Landscape (option):** a split keyboard on both sides with the play area
  in the middle.

### Done when

- All four modes, bosses, the nemesis and power-ups work on physical and
  touch (portrait and landscape).
- Arcade weighting and power-up word generation are covered by new engine
  test vectors.
- High scores and the hall of defeated survive a reload and are included in
  export and import.

## Phase 5 in detail

### Key creatures

- One creature per key, symbols included.
- **Stages:** egg, baby, grown, legendary, as the key improves.
- **Health reflects skill:** it drops if the key gets weak or goes
  unpracticed for a while, and recovers with practice.
- **Collection screen:** a grid of every creature, with ones you haven't met
  yet shown as silhouettes.
- **Drawn by code:** each key's creature has the same body and features in
  every theme, and the theme sets the drawing style. Phase 5 ships the clean
  theme's style; the other styles (pixel art for terminal, soft blobs for
  cute, keycap critters for mechanical) arrive with their themes in phase 6.

### Forecasts

- **What they predict:** when you'll reach your speed goal, when a weak key
  stops being weak, and when the next letter unlocks.
- **Honest about uncertainty:**
  - plenty of data: one estimate ("about 3 weeks")
  - some data: a range ("2 to 5 weeks")
  - too little data: no forecast ("Keep practicing to see a forecast")

### Slow-motion replay

- Playback at 0.25x, 0.5x, 1x and 2x.
- Hesitations and errors marked on a timeline you can jump to.
- Side-by-side comparison with your best run (the ghost).
- Keeps your last few runs plus personal bests.

### Offline daily challenge

- **Same for everyone:** the text is built from the date using the seeded
  generator, so every player and every version gets the same challenge with
  no server. The engine spec pins the generator and the word list version so
  the web, Swift and Kotlin versions always match.
- Uses all letters and a fixed set of modifiers, regardless of what you've
  unlocked, so results are comparable.
- **One scored attempt:** the first try counts; later tries are practice.
- **Streaks:** consecutive days played.
- **Shareable result:** copy a short text result, Wordle-style.

### Typing fingerprint card

- Best and worst keys, speed, accuracy, and style traits such as "steady" or
  "bursty".
- A mini keyboard heatmap.
- Your most evolved creatures.
- Rendered as an image you can save, copy, or share (using the phone's share
  sheet where available).

### Done when

- Creatures, forecasts, replays, the daily challenge and the fingerprint card
  work on physical and touch.
- The daily challenge's text for a set of sample dates is locked in test
  vectors, so every port produces the same challenge.
- Forecast ranges and creature stages are covered by engine test vectors.
- Replays, streaks and creatures are included in export and import.

## Phase 6 in detail

### Themes

- All four: clean and minimal, retro terminal, cute and colorful, mechanical
  keyboard.
- Each has a light and a dark version, following the device setting with a
  manual override.
- Each theme brings its own tone for round explanations and nemesis taunts
  (terminal terse, cute playful, mechanical matter-of-fact, clean plain), and
  its own creature drawing style.

### Sound

- Synthesized in code: tiny, no audio licensing, and easy to vary per theme.
- Key clicks, combo chimes, error buzz, level-up, boss hits, and the audio
  metronome beat.
- Each theme has its own sound set. Volume control and an off switch; sound
  starts only after your first tap or keypress, as browsers require.

### Content packs

- **Code:** Swift, Kotlin, JavaScript, TypeScript, Python, Java, C++, HTML and
  CSS, each a sub-pack you can switch on separately. More languages over
  time. Snippets are written for AdapType, so there are no licensing
  questions.
- **Quotes:** public-domain sources only (classic books, speeches, and
  similar), each credited.

### Your own words

- Paste text or import a `.txt` or `.md` file.
- **Words only:** AdapType keeps the word list and how often each word
  appears, not your original text.
- **Multiple custom packs,** each with a name (for example "Work" and
  "School"), mixable like any other pack.
- Stays on the device, and is included in export and import.

### Accessibility

- Dyslexia-friendly font option, with adjustable letter and line spacing.
- Adjustable text size, independent of the device setting.
- Color-blind-safe heatmap palettes, with patterns as well as color.
- Screen reader support: announces the current word, errors, and results.
- Reduced motion respected everywhere (already true since phase 1; audited
  here).

### Keyboard layouts

- QWERTY (US, UK, international), AZERTY, QWERTZ, Dvorak, Colemak and
  Colemak-DH.
- Every layout on both physical and the on-screen keyboard.
- Unlock order, finger maps and stats are kept per layout.
- Content stays English for now; other languages would be their own future
  word packs.

### Shortcut packs

- OS-wide (macOS, Windows, Linux) and browser packs.
- First app packs: VS Code, Google Docs and Sheets, Figma, Slack. More over
  time.

### Done when

- Every theme works in light and dark, with its tone, sounds and creature
  style.
- All packs, layouts and accessibility options work on physical and touch.
- An accessibility pass with a screen reader on desktop and phone.

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
   - Shortcut drill: text-editing pack, shown combos and named actions,
     keyboard lock and build-the-combo mode
   - Difficulty curve, with pacing toward your speed goal
   - Explain the round
3. **Smarter engine**
   - Mistake replay, spaced repetition, smart warm-up
   - Hesitation detection, error-type analysis
   - Finger and thumb tracking, rhythm coaching, fatigue detection
   - Tap-drift map, self-correction score
   - Made-up drill words (a simple version ships in phase 1 to support early
     unlocking)
   - Progress screen
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
   - All four themes, each in light and dark
   - Synthesized sound per theme (including the audio metronome)
   - Code pack (9 languages to start) and public-domain quote pack
   - Your own words, as named custom packs
   - Accessibility modes, keyboard layouts (physical and touch)
   - Shortcut packs: OS-wide, browser, and VS Code, Google Docs and Sheets,
     Figma, Slack
   - Theme-matched tones for round explanations and nemesis taunts
   - Theme-matched creature styles
7. **Port (far future):** Swift and Kotlin versions, verified against the
   test vectors. Not planned in detail yet.

## Word list research

| Source | License | Verdict |
| --- | --- | --- |
| [wordfreq](https://github.com/rspeer/wordfreq) | Data: CC BY-SA 4.0. Code: Apache. | **Recommended for ranking.** High-quality frequencies from many sources. Requires credit, and the word list file we ship must stay under CC BY-SA. Frozen at about 2021 data, which is fine for common words. |
| [SCOWL](https://github.com/en-wl/wordlist) | MIT-like | **Recommended as a filter.** No exact frequencies, but size tiers (35 small, 50 medium, higher means rarer) confirm real, correctly spelled words. |
| [google-10000-english](https://github.com/first20hours/google-10000-english) | Built on LDC data | **Avoid.** The author advises against commercial use without an LDC license. |
| [SUBTLEX-US](https://osf.io/djpqz) | Unclear | **Avoid for now.** Free for research. Broader permission is only reported secondhand. |

Decision (approved): take wordfreq's top English words, keep those found in SCOWL size 50 or
below, remove offensive words, and keep about 10,000. Credit wordfreq (and its
sources) and SCOWL on an About screen.

## Open questions

- How the micro-app will be embedded in the host app (web view, native
  screen, or both).
