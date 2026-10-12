# AdapType engine spec (phases 1 and 2)

This is the rulebook for the AdapType engine. The web version
(`engine/src`, TypeScript) is the reference implementation. A port (Swift,
Kotlin) is correct when it passes every file in `engine/vectors`.

All numbers are IEEE 754 doubles unless marked as 32-bit unsigned integers
(u32). Operations must happen in the order written here, so results match to
within 1e-9.

Tuning constants are named in `SCREAMING_CASE` and listed with their values in
[Constants](#constants).

## 1. Random numbers

Every random choice goes through one seeded generator, so the same seed gives
the same rounds on every platform.

### 1.1 hashString(text) → u32

32-bit FNV-1a over the string's UTF-16 code units:

```
hash = 0x811c9dc5
for each UTF-16 code unit c:
    hash = hash XOR c
    hash = (hash * 0x01000193) mod 2^32
```

### 1.2 deriveSeed(parts...) → u32

`hashString` of the parts converted to strings and joined with `|`. Integers
are written in plain decimal (`12345|3|0`).

### 1.3 Rng (Mulberry32)

State is one u32, initialized to the seed. `next()` returns a double in
[0, 1). All arithmetic is u32 (wrap on overflow; `imul` is the low 32 bits of
the product; `>>>` is a logical shift):

```
state = state + 0x6d2b79f5
t = state
t = imul(t XOR (t >>> 15), t OR 1)
t = t XOR (t + imul(t XOR (t >>> 7), t OR 61))
return (t XOR (t >>> 14)) / 4294967296
```

- `int(n)` = `floor(next() * n)`
- `weightedIndex(weights)`: `total` = sum of weights in order. If
  `total <= 0`, return -1. Draw `r = next() * total`, then walk the weights,
  adding each to a running total, and return the first index where
  `r < running`. If none (rounding), return the last index.

Vectors: `rng.json`.

## 2. Typing a round

A round is a target string (words joined by single spaces) and an error
mode. Input is a list of events: a character (with a time `t` in ms) or a
backspace (with `t`).

State: `typed` (list of characters), `records` (list of keystroke records),
the set of positions attempted, the set of positions whose first attempt was
wrong, `lastT` (time of the last event, or none), and `lastWasCleanFirst`
(false at the start).

The round is **done** when `len(typed) >= len(target)`. Events after that are
ignored.

**Backspace:** in `backspace` mode, remove the last typed character if any. In
all modes, set `lastT = t` and `lastWasCleanFirst = false`.

**Character `c`:**

1. `index = len(typed)`, `expected = target[index]`, `correct = (c == expected)`.
2. `first` = index has never been attempted.
3. `interval` = `t - lastT` if `lastT` exists, `lastWasCleanFirst` is true and
   `0 <= t - lastT <= MAX_INTERVAL_MS`; otherwise none.
4. Append the record `{index, expected, actual: c, t, correct, first, interval}`
   (plus `tap` for touch). Mark the index attempted. If `first` and not
   `correct`, remember the index as first-wrong.
5. Append `c` to `typed` if `correct`, or if the mode isn't `block`.
6. `lastT = t`, `lastWasCleanFirst = correct AND first`.

Modes:

| Mode | Wrong key | Backspace |
| --- | --- | --- |
| `backspace` | is typed; fix it yourself | removes the last character |
| `block` | not typed; you must press the right key | does nothing |
| `skip` | is typed and stays | does nothing |

**Metrics:**

- `correctChars` = positions where `typed[i] == target[i]`
- `keystrokes` = number of records; `correctKeystrokes` = records with `correct`
- `corrections` = first-wrong positions that are now typed correctly
- `elapsedMs` = last record's `t` minus first record's `t` (0 with fewer than
  two records)
- `wpm` = `correctChars / 5 / (elapsedMs / 60000)`, or 0 when `elapsedMs <= 0`
- `accuracy` = `correctKeystrokes / keystrokes`, or 1 with no keystrokes

Speed conversions: a per-key interval of `ms` is `12000 / ms` WPM, and a goal of
`wpm` is a per-key interval of `12000 / wpm` ms.

Vectors: `typing.json`.

## 3. Key and pair statistics

Each key (any target character, space included) and each letter pair has a
stat entry `{n, timedN, msAvg, errAvg}`, all starting at 0.

**Adding a sample** (`error` true/false, `interval` or none):

```
n = n + 1
errAvg = errAvg + max(MIN_AVG_WEIGHT, 1/n) * ((error ? 1 : 0) - errAvg)
if interval exists:
    timedN = timedN + 1
    msAvg = msAvg + max(MIN_AVG_WEIGHT, 1/timedN) * (interval - msAvg)
```

**Applying a round:** for each record in order, skipping records where `first`
is false:

1. Add a sample to the entry for `expected`, with `error = not correct`.
2. Add to this round's per-key entry `{n, correct, msTotal, msN}`: `n += 1`,
   `correct += 1` if correct, and if `interval` exists `msTotal += interval`,
   `msN += 1`.
3. If `index > 0` and both `target[index-1]` and `expected` are letters `a`-`z`,
   add the same sample to the pair entry keyed `target[index-1] + expected`.

**Key history:** after a round, each letter's per-key entry is appended to that
letter's history (letters in alphabetical order), keeping the last
`KEY_HISTORY_ROUNDS` entries.

Vectors: `stats.json`.

## 4. Weakness score

For a stat entry and a goal `{wpm, accuracy}`:

```
if entry is missing or n == 0: return 1
targetMs = 12000 / goal.wpm
speed   = timedN > 0 ? clamp(msAvg / targetMs - 1, 0, SPEED_SCORE_CAP) : 0
errors  = clamp(errAvg * ERROR_SCORE_SCALE, 0, ERROR_SCORE_CAP)
unknown = n < CONFIDENT_SAMPLES ? (CONFIDENT_SAMPLES - n) / CONFIDENT_SAMPLES : 0
return speed + errors + unknown
```

0 means at goal. Higher means more practice needed.

**Focus letter:** the most recently unlocked letter that isn't mastered (walk
`unlocked` from the end). None if all are mastered.

**Scores for a round:** for each unlocked letter, its weakness plus
`FOCUS_BONUS` if it's the focus letter. For each pair seen so far whose two
letters are both unlocked, its weakness (no focus bonus).

Until the player sets a goal, scoring uses the default goal 40 WPM, 95%.

Vectors: `scoring.json`.

## 5. Round generation

### 5.1 Word pool

Walk the word pack in rank order (index 0 is the most common word). Keep words
with length between `MIN_WORD_LENGTH` and the difficulty's `maxLength` (9.1)
whose letters are all unlocked. Stop at the difficulty's `poolCap` words.

### 5.2 Word weight

```
letterAvg = (sum of letter scores over the word's letters) / length
pairAvg   = length > 1 ? (sum of pair scores over adjacent pairs) / (length - 1) : 0
            (missing scores count as 0)
weight    = (BASE_WORD_WEIGHT + intensity * (letterAvg + pairAvg)) / (1 + rank / rankScale)
```

`intensity` and `rankScale` come from the difficulty level (9.1).

### 5.3 Made-up share

```
share = poolSize >= FULL_POOL ? 0 : min(MAX_MADE_UP_SHARE, 1 - poolSize / FULL_POOL)
```

### 5.4 Picking words

Start with an empty `used` set and `previous` (the last word of the previous
chunk, or empty). For each of `count` slots:

1. `useMadeUp` = pool is empty, or (`share > 0` and `next() < share`). Note
   that `next()` is drawn only when `share > 0` and the pool isn't empty.
2. If made up: see 5.5.
3. Otherwise: if `used` holds every pool index, clear it. Build weights where
   used indices and the word equal to `previous` get 0. `idx =
   weightedIndex(weights)`; if -1, `idx = int(poolSize)`. Add `idx` to `used`.
4. `previous` = the chosen word.

### 5.5 Made-up words

Vowels are `a e i o u y`. Split the unlocked letters into vowels and
consonants (keeping unlocked order). A letter's pick weight is
`0.5 + score` (score 0 if missing). `pick(list)` = `list[weightedIndex(weights)]`.

Repeat up to `MADE_UP_ATTEMPTS` times:

1. `length = MADE_UP_MIN_LENGTH + int(MADE_UP_MAX_LENGTH - MADE_UP_MIN_LENGTH + 1)`.
2. If there are no vowels or no consonants: pick `length` letters from all
   unlocked letters.
3. Otherwise: `vowelNext = next() < 0.5`, `clustered = false`. For `i` in
   `0..length-1`:
   - `from` = vowels if `vowelNext`, else consonants. If `from` has more than one
     letter and the text isn't empty, remove the text's last letter from `from`.
   - Append `pick(from)`.
   - If `vowelNext`: `vowelNext = false`. Else if not `clustered` and `i > 0`
     and `next() < CONSONANT_CLUSTER_CHANCE`: `clustered = true` (stay on
     consonants). Else `vowelNext = true`.
4. If the text isn't blocked (5.6), stop.

If every attempt was blocked, the word is the first unlocked letter repeated
`MADE_UP_MIN_LENGTH` times. The word is marked made-up unless it appears in
the word pack.

### 5.6 Blocklist

A text is blocked if it equals a word in `blocklist.words` or contains any
string in `blocklist.roots`.

### 5.7 Seeds

Each round's generator is `Rng(deriveSeed(profileSeed, roundCounter, chunk))`.
`chunk` is 0 for the first batch of words; timed and endless rounds ask for
more batches with chunk 1, 2, and so on.

### 5.8 Modifiers

After the words are picked, active modifiers are applied with the same
generator (section 10). Calibration rounds never use modifiers.

### 5.9 Calibration words

Take the first `CALIBRATION_WORD_POOL` words from the pack with a length
between `MIN_WORD_LENGTH` and `MAX_WORD_LENGTH`. For each slot, pick
`pool[int(poolSize)]`; if it equals the previous word, take the next word in
the pool (wrapping around).

Vectors: `generate.json`.

## 6. Unlocking

Unlock orders:

- `frequency`: `etaoinshrdlcumwfgypbvkjxqz`
- `homeRow`: `asdfjklhgeriotuwypqncmvbxz`

A new profile unlocks the first `START_LETTERS` letters of its order.

### 6.1 Mastery

A letter meets mastery when its history has at least `MASTERY_ROUNDS` entries
and, summing the last `MASTERY_ROUNDS` entries:

- `n >= MASTERY_MIN_SAMPLES` and `msN > 0`
- `correct / n >= goal.accuracy`
- `msTotal / msN <= 12000 / goal.wpm`

Mastery is permanent once reached.

### 6.2 Unlock check (after each practice round)

1. For each unlocked letter in order that isn't mastered and meets mastery,
   mark it mastered.
2. If calibration status isn't `silent` and every unlocked letter is mastered,
   unlock the next letter in the order that isn't unlocked yet (at most one per
   check).

### 6.3 Changing the unlock order

The unlocked set becomes, in the new order's sequence, every letter that is
among the first `START_LETTERS` or is mastered. Then run the unlock check.

Vectors: `profile.json`.

## 7. Calibration

### 7.1 Test

The test is a timed round of calibration words (5.9). Calibration rounds
update stats like any round but don't run the unlock check.

### 7.2 Test-out

A letter tests out when its stats have `n >= TEST_OUT_MIN_SAMPLES`,
`timedN >= TEST_OUT_MIN_TIMED`, `1 - errAvg >= goal.accuracy` and
`msAvg <= 12000 / goal.wpm`.

Applying test-out: walk the unlock order. A letter is unlocked if it tests out,
is among the first `START_LETTERS`, or was already unlocked. Letters that test
out are also marked mastered. Then run the unlock check (6.2).

`finishCalibrationTest(goal)` sets the goal, sets status to `done`, and applies
test-out.

### 7.3 Skipping the test (silent calibration)

Status becomes `silent` with `SILENT_CALIBRATION_ROUNDS` rounds left. While
rounds are left, rounds use calibration words. Each completed silent round with
at least one keystroke counts down; when it reaches 0, status becomes `done`
and test-out is applied.

### 7.4 Suggested goal

`clamp(round(measuredWpm * 1.2 / 5) * 5, 15, 150)`, rounding halves up.

## 8. Completing a round

1. Apply the records to stats (section 3, plus 10.2 with character data).
   Append letter entries and `mod:` entries to history.
2. Touch: append each record's tap to its expected key's tap list, keeping the
   last `MAX_TAPS_PER_KEY`.
3. If the round had keystrokes, append a summary `{at, wpm, accuracy,
   durationMs, chars, corrections, calibration}`, keeping the last
   `MAX_ROUNDS_KEPT`.
4. `roundCounter += 1`.
5. If it was a calibration test: nothing else. If silent calibration is
   running: count down (7.3). Otherwise: run the unlock check (6.2 and 10.6),
   then, if the round had keystrokes, update the difficulty (9.2).

The results screen compares against the average WPM and accuracy of the last
`RECENT_ROUNDS` non-calibration rounds before this one.

## 9. Difficulty curve

Each profile has a `difficulty` from 0 to 1, starting at `DIFFICULTY_START`.

### 9.1 What it changes

```
maxLength = 5 + round(d * 5)
rankScale = 1000 + d * 5000
poolCap   = 1000 + round(d * 3000)
intensity = 0.5 + 1.5 * d
```

It also nudges modifier rates (10.4).

### 9.2 Updating it

After a practice round, take the last `DIFFICULTY_ROUNDS` non-calibration
rounds (no change with fewer). Average their WPM and accuracy.

- If `avgWpm / goal.wpm >= DIFFICULTY_UP_RATIO` and `avgAccuracy >= goal.accuracy`:
  change is `+DIFFICULTY_STEP`.
- Else if `avgWpm / goal.wpm < DIFFICULTY_DOWN_RATIO` or
  `avgAccuracy < goal.accuracy - DIFFICULTY_ACCURACY_SLACK`: change is
  `-DIFFICULTY_STEP`.
- New difficulty = `clamp(round((d + change) * 1000) / 1000, 0, 1)`.

Vectors: `difficulty.json`.

## 10. Modifiers

Modifiers: `caps`, `punct`, `numbers`, `symbols`, `accents`, `extra`, always
processed in that order (`MODIFIER_IDS`). The shortcut drill (`shortcuts`)
unlocks with them but isn't a modifier.

Character data comes from `content/characters.json` (punctuation, symbols,
accented letters, extra characters) and `content/loanwords.json`.

### 10.1 Character categories

For a character `c`, in this order: `a`-`z` letter; space; `A`-`Z` caps;
`0`-`9` numbers; in the punctuation list: punct; in the symbols list: symbols;
its lowercase form is an accented letter: accents; an extra character or the
closing character of one: extra; otherwise other.

### 10.2 Extra statistics

When applying a round with character data, for each first-attempt record:

- If its category is a modifier, add the same sample to the stat `mod:<id>`
  and count it in the round's per-key entry `mod:<id>`.
- If the record has a `shift` side and `expected` is `A`-`Z`: add a sample
  (no interval) to `shift:side` with error = the Shift was on the same side as
  the letter. Left-hand letters are `LEFT_HAND_LETTERS`; they should use the
  right Shift.
- If the record has `layer` (touch): add the sample to `touch:layer`.

### 10.3 Which modifiers are on

Each of the seven has a mode: `unlock` (on once unlocked), `on` (on now), or
`off`. Accents also need the platform to support them, and extra characters
need at least one extra character available on the platform.

### 10.4 Rates

The modifier goal is the player's goal with `wpm / MODIFIER_TIME_SLACK`.

```
[min, max] = LEVEL_RANGES[level]
weak       = clamp(weakness(stats["mod:<id>"], modifierGoal) / 2, 0, 1)
position   = clamp(MODIFIER_WEAKNESS_WEIGHT * weak + (1 - MODIFIER_WEAKNESS_WEIGHT) * difficulty, 0, 1)
rate       = min + (max - min) * position
```

### 10.5 Applying modifiers

Inputs: the words, the generator, active modifiers with rates, a character
score function (`weakness(stats[c], modifierGoal)`), and `extraWord()`, which
returns `pool[int(poolSize)].text` from the round's word pool (or the first
three unlocked letters joined if the pool is empty).

`pickWeighted(list)` = `list[weightedIndex(list.map(c => 0.5 + score(c)))]`.
`number(a, b)`: length `a + int(b - a + 1)`; each digit is `pickWeighted` from
`0`-`9`, except the first digit of a multi-digit number, picked from `1`-`9`.

`sentenceStart` starts true when there is no previous word or the previous word
ends with `.`, `!` or `?`.

For each word, in this order (a step runs only when that modifier is active;
"roll" means `next() < rate`):

1. **accents:** roll. On success, the word becomes a loanword chosen by
   `weightedIndex` with weights `0.5 + max score of its accented letters`. Not
   made up.
2. **numbers:** roll. On success, `form = int(3)`: 0 → `number(1, 4)`; 1 →
   word + `number(1, 2)`; 2 → if symbols are active, `n = number(1, 3)` and one
   of `$n`, `n%`, `#n` by `int(3)`, else `number(1, 4)`. Not made up.
3. **symbols:** roll. On success, `sym = pickWeighted(symbols without ) ] } >)`.
   Brackets `( [ { <` wrap the word with their closer; `@ # $ ~ ^` go before
   it; `% *` go after it; anything else joins: word + sym + `extraWord()`.
4. **extra:** roll. On success, `ch = pickWeighted(platform extra characters)`,
   placed by its `place`: between → word + ch + `extraWord()`; range →
   `a = 1 + int(20)`, then `a` + ch + `(a + 1 + int(10))`; prefix → ch + word;
   alone → ch; number-after → `number(1, 3)` + ch; number-before → ch +
   `number(1, 3)`; compare → `(1 + int(20))` + ch + `(1 + int(20))`; question →
   ch + word + `?`; exclaim → ch + word + `!`; wrap → ch + word + close; anything
   else → word + ch. Not made up.
5. **caps:** roll. On success: `first` capitalizes the first cased character;
   `any` capitalizes the character at `positions[int(len)]`, where positions
   are the indices of `a`-`z` characters.
6. **punct:**
   - `sentence` mode: if `sentenceStart`, capitalize the first cased character.
     Set `sentenceStart = false`. Draw `r = next()`. If `r < rate * 0.5`: draw
     `e = next()` and append `.` (e < 0.8), `!` (e < 0.9) or `?`, and set
     `sentenceStart = true`. Else if `r < rate * 0.8`: append `,`. Else if
     `r < rate`: wrap in `"` (when `int(2) == 0`) or `'`.
   - `random` mode: roll. On success, `p = pickWeighted(punctuation)`: quotes
     wrap the word; `-` joins word + `-` + `extraWord()`; anything else is
     appended.

Vectors: `modifiers.json`.

### 10.6 Modifier unlocks

Stages (`MODIFIER_STAGES`): caps; punct; numbers; symbols; then accents, extra
and shortcuts together.

In the unlock check, once every letter is unlocked and mastered and no letter
unlocked in this check:

1. For each unlocked modifier (not shortcuts) that isn't mastered: it's
   mastered when `stats["mod:<id>"]` has `n >= MODIFIER_MASTERY_SAMPLES`,
   `timedN >= MODIFIER_MASTERY_TIMED`, `1 - errAvg >= goal.accuracy` and
   `msAvg <= 12000 / modifierGoal.wpm`.
2. If every unlocked modifier (not shortcuts) is mastered, unlock every item of
   the next stage that isn't unlocked yet.

## 11. Explaining a round

- **Keys:** unlocked letters, except the focus letter, with score at least
  `FOCUS_KEY_MIN_SCORE` that appear in the round's lowercased text. Highest
  score first, ties by position in the unlocked list. Top 2.
- **Pairs:** scored pairs with score at least `FOCUS_PAIR_MIN_SCORE` that
  appear inside a lowercased word of the round. Highest first, ties
  alphabetical. Top 1.
- **New letter:** the focus letter (4).
- **Modifiers:** the active modifiers and their rates; **difficulty:** the
  current level.

**Key detail** reasons, in this order: `new` (it's the focus letter),
`unknown` (`n < CONFIDENT_SAMPLES`), `slow` (`msAvg > goalMs * 1.05` with timed
samples), `errors` (`errAvg > 1 - goal.accuracy`); `fine` when none apply.

Vectors: `explain.json`.

## 12. Shortcut drill

Shortcut packs live in `content/shortcuts-*.json`. Each shortcut has a Mac
combo and an "other" (Windows and Linux) combo. Two combos match when the keys
are equal ignoring case and the modifier sets are equal.

- **Stats:** `sc:<id>`. Each answered prompt adds a sample: error = the first
  attempt was wrong; interval = time from showing the prompt to the correct
  answer, if at most `SHORTCUT_MAX_MS`.
- **Goal:** `wpm = 12000 / SHORTCUT_TARGET_MS`, accuracy 0.9.
- **Planning:** generator `Rng(deriveSeed(profileSeed, "shortcuts",
  roundCounter))`. For each slot, weights are `0.2 + weakness(sc:<id>, goal)`,
  with the previous pick's weight set to 0; pick with `weightedIndex` (or
  `int(n)` if -1). Finishing a drill adds 1 to `roundCounter`.

Vectors: `shortcuts.json`.

## 13. Saved data versions

Profile version 2 adds `difficulty` (`DIFFICULTY_START`), `modsUnlocked` and
`modsMastered` (both empty). A version 1 profile is upgraded by adding those
fields.

## Constants

| Name | Value |
| --- | --- |
| `MAX_INTERVAL_MS` | 2000 |
| `MIN_AVG_WEIGHT` | 0.1 |
| `START_LETTERS` | 6 |
| `KEY_HISTORY_ROUNDS` | 5 |
| `MASTERY_ROUNDS` | 3 |
| `MASTERY_MIN_SAMPLES` | 10 |
| `SPEED_SCORE_CAP` | 2 |
| `ERROR_SCORE_SCALE` | 10 |
| `ERROR_SCORE_CAP` | 3 |
| `CONFIDENT_SAMPLES` | 5 |
| `FOCUS_BONUS` | 1 |
| `MIN_WORD_LENGTH` | 2 |
| `MAX_WORD_LENGTH` (calibration only) | 8 |
| `FULL_POOL` | 60 |
| `MAX_MADE_UP_SHARE` | 0.8 |
| `BASE_WORD_WEIGHT` | 0.2 |
| `MADE_UP_MIN_LENGTH` | 3 |
| `MADE_UP_MAX_LENGTH` | 6 |
| `MADE_UP_ATTEMPTS` | 20 |
| `CONSONANT_CLUSTER_CHANCE` | 0.25 |
| `CALIBRATION_WORD_POOL` | 500 |
| `SILENT_CALIBRATION_ROUNDS` | 2 |
| `TEST_OUT_MIN_SAMPLES` | 5 |
| `TEST_OUT_MIN_TIMED` | 3 |
| `MAX_ROUNDS_KEPT` | 100 |
| `MAX_TAPS_PER_KEY` | 50 |
| `RECENT_ROUNDS` | 10 |
| `LEVEL_RANGES` | low 0.03–0.10, medium 0.06–0.25, high 0.12–0.50, auto 0.03–0.50 |
| `MODIFIER_WEAKNESS_WEIGHT` | 0.7 |
| `MODIFIER_TIME_SLACK` | 1.5 |
| `MODIFIER_MASTERY_SAMPLES` | 15 |
| `MODIFIER_MASTERY_TIMED` | 5 |
| `LEFT_HAND_LETTERS` | `qwertasdfgzxcvb` |
| `DIFFICULTY_START` | 0.3 |
| `DIFFICULTY_STEP` | 0.05 |
| `DIFFICULTY_ROUNDS` | 3 |
| `DIFFICULTY_UP_RATIO` | 0.95 |
| `DIFFICULTY_DOWN_RATIO` | 0.8 |
| `DIFFICULTY_ACCURACY_SLACK` | 0.03 |
| `FOCUS_KEY_MIN_SCORE` | 0.3 |
| `FOCUS_PAIR_MIN_SCORE` | 0.5 |
| `SHORTCUT_TARGET_MS` | 1500 |
| `SHORTCUT_MAX_MS` | 10000 |

## Test vectors

| File | Covers |
| --- | --- |
| `rng.json` | hashString, deriveSeed, Mulberry32 outputs, weightedIndex |
| `typing.json` | the typing state machine in all three modes, records, metrics |
| `stats.json` | applying a round to key and pair stats |
| `scoring.json` | weakness scores |
| `generate.json` | word pools, weights, made-up words (first 2,000 pack words) |
| `profile.json` | full sessions: calibration, test-out, practice rounds, unlocks, and a modifier session |
| `modifiers.json` | applying modifiers, and modifier rates |
| `difficulty.json` | difficulty parameters and updates |
| `explain.json` | round explanations and key details |
| `shortcuts.json` | shortcut drill planning |

Vectors that use the word pack use the first `packSize` words of
`content/words-en.json` version 1 and `content/blocklist.json`.
