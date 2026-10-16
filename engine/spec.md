# AdapType engine spec (phases 1 to 7)

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

### 2.1 Catching up in block mode

In `block` mode a round catches up when you've moved on past a letter, so a
late or skipped letter doesn't leave you stuck. Two extra pieces of state:
`ahead` (text, empty at the start) and `refill` (an index and a character, or
none).

Before step 1, for a character `c` at `index`: if `refill` is set, take it and
clear it; if its index is `index - 1`, `c` equals its character and `c` isn't
`target[index]`, ignore the keystroke (no record) apart from setting
`lastT = t` and `lastWasCleanFirst = false`. This lets you press a letter
again that was just filled in.

After step 6:

- **Correct, with `ahead` not empty (a late letter):** append each character
  of `ahead` to `typed`, marking each new index attempted. Set `refill` to the
  last new index and its character, and clear `ahead`.
- **Correct, `ahead` empty:** nothing more.
- **Wrong:** let `next = ahead + c`. If `target` continues with `next` right
  after `index` (from `index + 1`), set `ahead = next`. Otherwise, if it
  continues with `c` there, set `ahead = c`; otherwise clear `ahead`. If
  `len(ahead) >= CATCH_UP_KEYS`, the letter at `index` is **missed**:
  - Append `ahead[0]` to `typed` (the position stays wrong).
  - For `k` from 0, append `ahead[k]` to `typed` at `index + 1 + k`. For
    `k >= 1`, rewrite the record of that keystroke (the last `len(ahead)`
    records, in order) to `{index: index + 1 + k, expected: target[index + 1 + k],
    correct: true, first: (that index not yet attempted), interval: none}`.
  - Mark each `index + 1 + k` attempted, clear `ahead`, and set
    `lastWasCleanFirst = true`.

So typing "teh" for "the " counts one error on h and continues at the space;
typing "te " skips h (missed) and continues after the space. A run recorded
before this existed replays without it (section 31).

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

Then, if the active rates add up to more than `MAX_DECORATED_SHARE`, every
rate is multiplied by `MAX_DECORATED_SHARE / sum`, so at least half the words
stay plain.

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

## 14. Phase 3 changes to earlier sections

- **Moving averages (3):** `addSample` takes a weight factor (default 1). The
  step weight is 1 for the first sample, otherwise
  `max(MIN_AVG_WEIGHT, 1/n) * factor`. Rounds played while the session is
  fatigued use `TIRED_WEIGHT`.
- **Per-round entries (3):** each pair sample is also counted in the round's
  per-key entries under `pair:<xy>` (used by reviews, not history).
- **Metrics (2):** `firstErrors` = positions whose first attempt was wrong.
- **Scores (4):** letters add `hesitationBonus` (15.2), `REVIEW_BONUS` when due
  (16), and on touch `DRIFT_BONUS` when the key's taps drift (19.2). Pairs add
  `REVIEW_BONUS` when due. Reviews count only when the caller passes `now`.
- **Word weights (5.2):** real words' weights are multiplied by the error
  drill bonus (17.3).
- **Made-up words (5.3-5.5):** the made-up share is
  `min(madeUpCap, MAX_MADE_UP_SHARE, 1 - poolSize / FULL_POOL)` (the cap is
  ignored when no real word fits). Practice rounds use the pronounceable
  builder (20), falling back to 5.5 when it returns nothing.
- **Planning (5.7):** with fatigue, the difficulty used is
  `clamp(difficulty - FATIGUE_EASE, 0, 1)`. After the words are picked (and
  before modifiers), in the first batch only, each due review word (16.3)
  whose letters are all unlocked replaces `words[int(count)]`, up to
  `REVIEW_WORDS`.
- **Summaries (8):** add `consistency` (18), `firstErrors`, and `warmup`.
  Warm-up rounds don't change difficulty or the recent average.
- **Difficulty (9.2):** a round played while fatigued, or the round where
  fatigue starts, can't raise difficulty (the up step becomes 0).

## 15. Sessions, fatigue and hesitation

### 15.1 Sessions

`beginSession(now)` starts a new session when there's none or
`now - lastAt > SESSION_GAP_MS`: id + 1, rounds 0, empty history, no
baseline, not fatigued, warm-up not done, grip carried over on touch.

After each non-calibration round with keystrokes: `rounds += 1`,
`lastAt = at`, the round's WPM and accuracy are appended (last
`SESSION_HISTORY` kept). Once `rounds >= FATIGUE_BASELINE_ROUNDS`, the baseline
is the average of the first `FATIGUE_BASELINE_ROUNDS` rounds (set once).

### 15.2 Fatigue

With a baseline and `rounds >= FATIGUE_MIN_ROUNDS`, let `recent` be the
average of the last `FATIGUE_RECENT_ROUNDS` rounds.

- Not fatigued, and `recent.wpm < baseline.wpm * FATIGUE_WPM_DROP` or
  `recent.accuracy < baseline.accuracy - FATIGUE_ACCURACY_DROP`: fatigue
  starts.
- Fatigued, and `recent.wpm >= baseline.wpm * RECOVER_WPM` and
  `recent.accuracy >= baseline.accuracy - RECOVER_ACCURACY_DROP`: recovered.

Vectors: `session.json`.

### 15.3 Hesitation

Before a round's stats are applied, for each first-attempt record with an
interval whose key has at least `HESITATION_MIN_SAMPLES` timed samples: it's
a hesitation when `interval > max(HESITATION_MIN_MS, HESITATION_FACTOR *
msAvg)`. Each judgment adds a sample (error = hesitation, no interval) to
`hesitations[key]`.

`hesitationBonus = min(HESITATION_SCORE_CAP, errAvg * HESITATION_SCORE_SCALE)`
once `n >= CONFIDENT_SAMPLES`, else 0. Key detail adds the reason `hesitant`
when the rate is above `HESITANT_RATE` (with `CONFIDENT_SAMPLES` judgments),
and `review` when the key is due.

Vectors: `hesitation.json`.

## 16. Spaced repetition

Items are keyed `key:<letter>`, `pair:<xy>`, `word:<word>` with `step`,
`due`, `sessionRound` and `lapses`. Intervals: `REVIEW_INTERVALS_DAYS`.

### 16.1 Due

An item is due when `due <= now`, or `sessionRound` is set and the session's
round count is at least `sessionRound`.

### 16.2 Updating after a round

Runs after stats, error analysis and the session update, for non-calibration
rounds with keystrokes. "Session rounds" means the count including this
round.

- **Lapse:** step 0, `due = at + 1 day`, `sessionRound = sessionRounds +
  REVIEW_SESSION_GAP`, lapses + 1.
- **Success:** if `sessionRound` is set and reached, clear it. If `due <= at`:
  step + 1; past the last interval the item is learned and removed; otherwise
  `due = at + interval[step]` days.
- **New item:** step 0, due tomorrow, `sessionRound = sessionRounds +
  REVIEW_SESSION_GAP`, lapses 0.

Keys (letters with at least `REVIEW_MIN_SAMPLES` presses this round), in
alphabetical order, then pairs (`pair:` entries with at least
`REVIEW_PAIR_MIN_SAMPLES`): the round is a success when
`correct / n >= goal.accuracy` and (`msN == 0` or
`msTotal / msN <= 1.1 * goalMs`). Scheduled items succeed or lapse.
Unscheduled ones join when the round wasn't a success, their overall stats
have at least `CONFIDENT_SAMPLES` samples, and their weakness is at least
`REVIEW_WEAKNESS`.

Words: split the target at spaces; each word (lowercased, letters only, 2+
letters) that was fully typed is clean or botched (any first-attempt error
inside it). Botched words, alphabetically: lapse or join. Then clean words
(unique, alphabetically) that are scheduled and not botched: succeed.

### 16.3 Planning

Due items, sorted by `due` then target. Keys and pairs get `REVIEW_BONUS`;
words are placed into the round (14).

Vectors: `reviews.json`.

## 17. Error types

### 17.1 Classification

For each first-attempt error record `r` at index `i` (expected `e`, actual
`a`, `prev = target[i-1]`, `next = target[i+1]`):

1. Skip it if the last listed error is a swap at `i - 1` and `a == prev`.
2. Skip it if a shift is active, `i == shift.index + 1` and
   `a == target[i + shift.dir]` (then `shift.index = i`). Otherwise clear the
   shift.
3. Type: `missed-double` if `e == prev` and `a == next`; else if `a == next`
   and `next != e`: `swap` when the next record is at `i + 1` and typed `e`,
   otherwise `skipped`; else `double` if `a == prev`; else `case` if they're
   the same letter ignoring case; else `neighbor` if adjacent on QWERTY; else
   `other`.
4. After `missed-double` or `skipped` set shift `{dir: +1, index: i}`; after
   `double` set `{dir: -1, index: i}`.

QWERTY adjacency: rows `qwertyuiop`, `asdfghjkl`, `zxcvbnm` with offsets 0,
0.25, 0.75. Two different letters are neighbors when their rows differ by at
most 1 and `|col_a + offset_a - (col_b + offset_b)| <= 1`.

### 17.2 Applying

For each classified error: count it in `errorCounts[e][type]`; count `a` in
`typos[e]`; for neighbors, count the two lowercase letters sorted in
`confusions`; for swaps where `e` and `next` are letters, add an error sample
(no interval) to `pairs[e + next]`. The word containing the error (lowercased,
letters only, 2+ letters, and in the pack when one is given) is counted once
per round in `missedWords` (keep the top `MAX_MISSED_WORDS` by count, ties
alphabetical).

If the round has errors, update the bias with weight `BIAS_WEIGHT` toward each
type's share of the round's errors: swap; double (double + missed-double);
neighbor.

### 17.3 Drills

The error drill bonus multiplies a real word's weight by `1 + bias.double`
when `bias.double >= DOUBLE_BIAS_MIN` and the word has a doubled letter, and
by `1 + CONFUSION_BONUS` when it contains both letters of one of the two most
frequent confusions with count at least `CONFUSION_MIN`.

Vectors: `errors.json`.

## 18. Rhythm

From the records with an interval: mean, population standard deviation,
median. `consistency = clamp(1 - sd / mean, 0, 1)` with at least
`RHYTHM_MIN_INTERVALS` intervals, else null. Stalls are records whose
interval is above `STALL_FACTOR * median`.

Vectors: `rhythm.json`.

## 19. Hands, grip and drift

### 19.1 Groups

Finger, zone, thumb and screen-zone groups are listed in `hands.ts`. A
group's score is the sample-weighted average weakness of its keys; groups
without samples are left out; weakest first.

### 19.2 Touch

- **Taps** are kept per key and per grip (last `MAX_TAPS_PER_KEY`). With a
  grip set, the round's records are also applied to that grip's key stats.
- **Drift:** the average tap offset; a key drifts with at least
  `DRIFT_MIN_TAPS` taps and an average distance above `DRIFT_THRESHOLD`.
- **Grip signal:** for each first-attempt record with an interval at index
  > 0 where it and the previous target character are letters, add the
  interval to "same" when both are on the same half of the keyboard
  (`qwertasdfgzxcv` is the left half), else "cross". With at least
  `GRIP_MIN_SAMPLES` of each, `ratio = avgCross / avgSame`. With grip "two"
  and ratio above `GRIP_ONE_RATIO`, suggest "one"; with grip "one" and ratio
  below `GRIP_TWO_RATIO`, suggest "two".

## 20. Pronounceable made-up words

### 20.1 Patterns

From the first `PHONOTACTIC_WORDS` pack words with 3+ letters, split into
alternating vowel (`a e i o u y`) and consonant groups. Count groups of at most
2 letters: the first group if it's consonants (onset), every vowel group
(nucleus), the last group if it's consonants (coda), and other consonant
groups (medial). Keep the top `PHONOTACTIC_TOP` of each, by count then
alphabetically.

### 20.2 Building a word

Keep only the parts made of unlocked letters. With no nucleus or no medial,
return nothing. Part weights are `sqrt(count) * (1 + average letter score)`.
Up to `MADE_UP_ATTEMPTS` times: `syllables = 1 + int(MADE_UP_MAX_SYLLABLES)`;
an onset if any exist and `next() < 0.8`; a nucleus; then `syllables - 1`
times a medial and a nucleus; a coda if any exist and `next() < 0.6`. Accept
it if it's between `MADE_UP_MIN_LENGTH` and `MADE_UP_LONG_MAX` letters and
not blocked.

Vectors: `phonotactics.json`.

## 21. Warm-up

Targets: the `WARMUP_KEYS` highest-scoring unlocked letters with score at
least `FOCUS_KEY_MIN_SCORE` (ties by unlock order) and the `WARMUP_PAIRS`
highest pairs with score at least `FOCUS_PAIR_MIN_SCORE` (ties
alphabetical). A warm-up round adds `WARMUP_BONUS` to those scores. It's
offered at the start of a session (no rounds yet, not done) after at least 3
non-calibration rounds, when there are targets.

Vectors: `warmup.json`.

## 22. Saved data version 3

Profile version 3 adds `reviews`, `hesitations`, `errorCounts`, `typos`,
`confusions` (all empty), `errorBias` (all 0), `missedWords` (empty),
`session` (null), `touchTyping` (null), `gripKeys` and `gripTaps` (empty).

## 23. Arcade: falling words and survival

A deterministic simulation. The caller calls `tick(dt)` (seconds) and
`input(char, t)` (t in ms, for intervals). Each returns events in order.
Falling words always uses lives; survival uses the player's lives setting.

### 23.1 Speeds

With speedup `FALLING_SPEEDUP` (falling) or `SURVIVAL_SPEEDUP` (survival):

```
fallSeconds  = max(FALL_SECONDS_MIN,  FALL_SECONDS_START  * speedup^(level-1))
spawnSeconds = max(SPAWN_SECONDS_MIN, SPAWN_SECONDS_START * speedup^(level-1))
```

On touch, both are divided by `TOUCH_SPEED_FACTOR`. The spawn timer starts
full, so the first tick spawns a word.

### 23.2 tick(dt)

1. Nothing if the game is over. `time += dt`.
2. Boss timer: `timeLeft -= dt`; at 0 or below, boss words are removed (and
   the target if it was one), the boss ends (`bossEscaped`), damage with
   health cost `HEALTH_PER_LANDED` (23.5), then level up (23.6).
3. Every word moves `y += dt / fallSeconds * (SLOW_FACTOR while slowed, else
   1)`. Words with `y >= 1` land, in list order: removed, target cleared if
   it was the word, `landed += 1`, combo 0, a boss word heals the boss by 1
   (up to max), damage with cost `HEALTH_PER_LANDED`.
4. Spawning: during a boss, spawn a boss word when none is on screen.
   Otherwise `sinceSpawn += dt`; when it reaches `spawnSeconds` and fewer
   than `MAX_ON_SCREEN` words are up, reset it and spawn a power-up word if
   at least `POWERUP_EVERY` normal words spawned since the last power-up,
   else a normal word.

### 23.3 Spawning a word

The word source gives the text. A power-up word's kind is
`POWER_UPS[int(4)]` (slow, clear, shield, double) and resets the power-up
counter; a normal word adds 1 to it. A boss word is capitalized in phase 2
and falls in `BOSS_FALL_SECONDS` (divided by `BOSS_PHASE2_SPEED` in phase 2
and by the touch factor). `x = 0.5` for boss words, else
`0.08 + next() * 0.84`. Ids count up from 1.

### 23.4 input(char, t)

- With no target: a space does nothing. Otherwise target the word whose
  first character equals `char` with the largest `y` (ties: lowest id). Its
  log offset is the log length plus 1 if the log isn't empty; the log gets a
  space (if not empty) and the word. With no match: `keystrokes += 1`, the
  interval chain breaks, an `error` event, and the error rules (23.5).
- With a target: compare `char` with the next character. Record the
  keystroke (index = offset + typed, first-attempt and interval rules as in
  section 2). Correct: `typed += 1`, error run 0, and the word clears when
  complete. Wrong: the word's error count + 1, then the error rules. Wrong
  keys never advance a word.

### 23.5 Errors and damage

An error: `errors += 1`, combo 0, error run + 1, and a targeted boss word
heals the boss by `BOSS_HEAL_PER_ERROR`. Then: hardcore takes damage;
health mode takes damage with cost `HEALTH_PER_ERROR`; lives mode takes
damage only when the error run reaches `ERROR_RUN_FOR_LIFE` (and resets it).

Damage: a shield absorbs it and is used up. Otherwise hardcore sets lives to
0, health mode lowers health by the cost (rounded to 3 decimals), lives mode
loses a life. At 0 lives or 0 health the game is over.

### 23.6 Clearing, scoring, levels and bosses

On clearing a word: remove it, clear the target, combo + 1, cleared + 1.
Points:

```
points = POINTS_PER_CHAR * length * (1 + min(COMBO_MAX_MULTIPLIER - 1, floor(combo / COMBO_STEP) * COMBO_BONUS))
       * (1 + WEAK_WORD_BONUS if the lowercased word contains a weak key)
       * (2 for a boss word) * (2 while double points is on), rounded
```

Health mode heals `HEALTH_PER_CLEAN_WORD` (up to 1) for a word typed without
errors. Power-ups: slow sets `slowUntil = time + SLOW_SECONDS`; double sets
`doubleUntil = time + DOUBLE_SECONDS`; shield turns the shield on; clear
removes every non-boss word.

A boss word lowers boss HP by 1. At 0 the boss is defeated: score +
`BOSS_DEFEAT_BONUS` (doubled while double points is on), boss words
removed, level up. Otherwise, at or below half HP in phase 1 it enters
phase 2. A normal word counts toward the level; at `WORDS_PER_LEVEL` the
level goes up.

Level up: level + 1, level count 0. When the new level is a multiple of
`BOSS_EVERY`, a boss starts with `BOSS_HP` HP and `BOSS_SECONDS`; every
other boss (the 1st, 3rd...) is the nemesis when there is one.

### 23.7 Metrics

`wpm = correctKeystrokes / 5 / (time / 60)`; accuracy is correct over all
keystrokes.

Vectors: `arcade.json` (every operation with its events, and the final
state).

## 24. Arcade words

Pool: unlocked-letter words up to `ARCADE_MAX_WORD_LENGTH` letters (pool cap
from the difficulty). Normal words come from `planRound` in batches of 20
(chunks 0, 1, 2...), with modifiers and reviews like practice.

- Power-up weights: `(0.1 + average letter score)^2` for words of at least
  `POWERUP_MIN_LENGTH` letters, else 0.
- Boss weights: for words of at least `BOSS_MIN_LENGTH` letters containing
  the boss key, average letter score `+ 2 * (boss key count / length)`; the
  boss key is the nemesis or else the highest-scoring unlocked letter.
- Picks use `weightedIndex` on the source's generator; when nothing fits, a
  normal word.

Weak keys for the scoring bonus: the top `WEAK_KEYS_FOR_BONUS` unlocked
letters with score above 0.

Vectors: `arcadeWords.json`.

## 25. Arcade results

A finished game applies its records over its log to stats with weight
`ARCADE_WEIGHT` (letters, pairs, modifiers) and to error analysis. It
doesn't touch history, mastery, unlocks, difficulty, reviews or sessions.
Games played + 1, round counter + 1.

Scores: each mode keeps its top `MAX_SCORES` entries. A new entry goes
before the first entry with a lower score (equal scores keep the earlier
one first); the rank is 1-based, or none when it falls off the list.

Vectors: `arcadeResults.json`.

## 26. Races

**Rival.** Pace `goal` (the goal WPM), `custom` (a chosen WPM) or `ahead`:
`RIVAL_AHEAD * (the player's live WPM once RIVAL_WARMUP_SECONDS have passed
and it's above 0, else the recent average)`, times `1 - RUBBER_BAND_STRENGTH`
when the rival is more than `RUBBER_BAND_CHARS` characters ahead or
`1 + RUBBER_BAND_STRENGTH` when as far behind. Each step:
`elapsed += dt`, `position += wpm * 5 * dt / 60`.

**Ghost.** From a finished, fully correct round: for each position, the time
of the last correct keystroke there minus the first keystroke's time, then
made non-decreasing. WPM uses the target length over the last time. The
ghost's position at a time is the number of times at or below it. A run
replaces the saved ghost when there is none, the text differs, or it's
faster.

Race rounds count toward stats like arcade games (25).

Vectors: `race.json`.

## 27. Nemesis

After each round or game: if there's a nemesis whose key has at least
`NEMESIS_MIN_SAMPLES` samples and weakness at most
`NEMESIS_DEFEAT_WEAKNESS`, it's defeated and joins the hall with the time.
Then, with no nemesis, the unlocked letter with the highest weakness among
those with at least `NEMESIS_MIN_SAMPLES` samples and weakness at least
`NEMESIS_MIN_WEAKNESS` (ties by unlock order) becomes the nemesis. Its name
is `names[key][hashString(profileSeed + key) mod count] + " the " +
uppercase key`, from `content/nemesis.json`. A taunt is `taunts[int(n)]`
with `{name}` and `{key}` filled in.

Profile version 4 adds `arcade`: empty scores, no ghost, no nemesis, empty
hall, 0 games.

Vectors: `nemesis.json`.

## 28. Key days

After every round, arcade game, race and daily challenge, each single
character typed (not space) adds its round results to `keyDays[key]`: an
entry `[day, n, correct, msTotal, msN]` with `day = floor(time / DAY_MS)`
(UTC days). Results on the same day as the newest entry merge into it;
otherwise a new entry is appended. Each key keeps its newest
`KEY_DAYS_KEPT` entries. Arcade and race results count at full size here
(the weight only applies to stats).

## 29. Key creatures

**Roster:** a–z, 0–9, then `characters.json` punctuation and symbols, in
that order. Letters use the goal; every other key uses the modifier goal
(goal WPM / `MODIFIER_TIME_SLACK`).

**Stages** earned by a key's stats (null when it has no samples):

- 3 legendary: n ≥ `CREATURE_LEGENDARY_SAMPLES`, timedN > 0, msAvg ≤
  `CREATURE_LEGENDARY_SPEED` × goal ms, errAvg ≤ `CREATURE_LEGENDARY_ERRORS`
- 2 grown: n ≥ `CREATURE_GROWN_SAMPLES` and weakness ≤ `CREATURE_GROWN_WEAKNESS`
- 1 baby: n ≥ `CREATURE_BABY_SAMPLES`
- 0 egg: otherwise

`updateCreatures` raises each saved stage to the earned one (stages never
fall) and reports changes to stage 1 or higher, in roster order.

**Health** = max(`CREATURE_MIN_HEALTH`, round2(skill × recency)):

- skill = clamp(1 − (weakness − GROWN_WEAKNESS) / (SICK_WEAKNESS − GROWN_WEAKNESS), 0, 1)
- recency = max(MIN_RECENCY, 1 − (1 − MIN_RECENCY) × max(0, days − GRACE_DAYS) / DECAY_DAYS)

`days` is today's day minus the key's newest key-days entry, or the last
round's day when it has none.

**Traits** (the same in every theme): with `h = hashString("creature:" + key)`,
body `[round, tall, wide, pear][h & 3]`, eyes `(h >>> 2) % 3 + 1`, top
`[none, ears, horns, antenna, tuft][(h >>> 4) % 5]`, pattern
`[plain, spots, stripes, belly][(h >>> 7) & 3]`, mouth
`[smile, fangs, open, beak][(h >>> 9) & 3]`, tail `(h >>> 11) & 1`, hue
`(h >>> 12) % 360`.

Vectors: `creatures.json`.

## 30. Forecasts

**Trend.** Points `(x = day − today, y)`. With fewer than
`FORECAST_MIN_DAYS` points (or all x equal): none (data). Least squares
gives `y = a + b·x` and the slope's standard error
`se = sqrt(Σ residual² / (n − 2) / Σ (x − x̄)²)`. With direction `d` (+1 when
y rises toward the target, −1 when it falls): `gap = d·(target − a)`; gap ≤ 0
is reached. `rate = d·b`; rate ≤ 0 is none (flat). `days = gap / rate`,
`low = gap / (rate + se)`, `high = gap / (rate − se)` (infinite when
rate ≤ se). low > `FORECAST_MAX_DAYS`: none (far). With at least
`FORECAST_ESTIMATE_DAYS` points, `se ≤ FORECAST_ESTIMATE_SPREAD × rate` and
days ≤ max: estimate. Else high ≤ max: range. Else none (uncertain). Days
are rounded to 0.1.

**Speed goal.** Reached when the recent average (`RECENT_ROUNDS`) is at the
goal WPM. Otherwise the trend of each day's mean WPM, over practice rounds
(not calibration or warm-up) from the last `FORECAST_WINDOW_DAYS` days.

**A key.** Reached when its running msAvg ≤ goal ms and 1 − errAvg ≥ goal
accuracy (with timed samples). None (accuracy) when the window's key days
have accuracy below the goal. Otherwise the trend (direction −1) of each
day's msTotal / msN toward goal ms, over window days with msN ≥
`FORECAST_KEY_MIN_TIMED`.

**Next unlock.** Nothing when every letter is unlocked. Otherwise every
unlocked, unmastered letter's key forecast: the first none (in unlock
order) decides; with no estimates or ranges left it's reached; with only
estimates, an estimate of the largest; otherwise a range of the largest
low and largest high (estimates count as both).

Vectors: `forecast.json`.

## 31. Replays

A replay stores the target, error mode, whether block mode caught up
(`catchUp: true` on block-mode runs; section 2.1, absent on older runs, which
replay without it), and events `[ms, char]` where ms is
whole milliseconds after the first event (rounded) and `"\b"` is a
backspace. The target is cut at the first space at or after where the run
ended (or kept whole). WPM and accuracy come from feeding the events into a
fresh round. A moment `t` is shown by feeding events with time ≤ t.

Markers: every wrong keystroke (error) and every rhythm stall (hesitation,
section 18), sorted by time, then index, then kind.

Saving: the newest `REPLAYS_RECENT` runs, and the best `REPLAYS_BEST` by
WPM × accuracy (inserted before the first lower score; ties keep the earlier
run). Runs with fewer than 2 events aren't kept.

Vectors: `replay.json`.

## 32. Daily challenge

The text depends only on the date (`YYYY-MM-DD`, the player's local date)
and the word pack's id and version:

1. `rng = Rng(deriveSeed("daily", packId, packVersion, date))`.
2. Pool: the first `DAILY_POOL` pack words that are only a–z, between
   `DAILY_MIN_LENGTH` and `DAILY_MAX_LENGTH` letters, and not blocked, in
   pack order.
3. `DAILY_WORDS` words: each `pool[int(pool.length)]`; if it equals the
   previous word, one more pick replaces it.
4. Sentences, in order: length `DAILY_SENTENCE_MIN + int(MAX − MIN + 1)`
   (fewer if fewer words remain); then for each word but the last, a comma
   when `next() < DAILY_COMMA_CHANCE`. A sentence under 3 words joins the
   one before.
5. Capitalize each sentence's first letter, end it with "." (replacing a
   trailing comma), and join everything with spaces.

Word marks: per word typed (counting the space after it), `g` when every first attempt was right, `y`
when a first attempt was wrong but the word ended right, `r` when it ended
wrong. A daily attempt applies its records to stats (full weight), error
analysis and key days, not to unlocks, difficulty, rounds or sessions. Only
the first attempt on a date is kept (`DAILY_KEPT` dates). The streak counts
consecutive dates with a result back from today, or from yesterday when
today has none. The share text is the date, WPM and accuracy (rounded),
the streak when over 1, and the marks as 🟩🟨🟥 in rows of 10.

Vectors: `daily.json` (sample dates use the full pack, version 1).

## 33. Fingerprint card

From the last `RECENT_ROUNDS` non-calibration rounds: steady when mean
consistency ≥ `TRAIT_STEADY`, bursty when below `TRAIT_BURSTY`; precise when
recent accuracy ≥ `TRAIT_PRECISE`, daring when below `TRAIT_DARING`; fixer
when corrections / first errors ≥ `TRAIT_FIXER` and presses-on when ≤
`TRAIT_PRESSES_ON` (with at least 5 first errors); at-goal when recent WPM
is at the goal. Best letters: the 3 lowest weakness among letters with at
least `FINGERPRINT_MIN_SAMPLES` samples (ties: faster, then alphabetical);
worst: the 3 highest of the rest (ties: slower, then alphabetical). Top
creatures: up to 3 met ones by stage, then health, then roster order.

Profile version 5 adds empty `keyDays`, `creatures`, `replays` and `daily`.

Vectors: `fingerprint.json`.

## 34. Word packs: your own words and mixing

**From text.** Lowercase the text and split it on every character that
isn't a–z or an apostrophe. Drop tokens with an apostrophe and tokens
shorter than `CUSTOM_MIN_LENGTH` or longer than `CUSTOM_MAX_LENGTH`. Count
each word; sort by count (most first), then alphabetically; keep
`CUSTOM_MAX_WORDS`. Only these words and counts are stored, never the text.

**Mixing.** Packs with weight 0 or no words are left out. Each step, every
pack that still has unused words adds its weight to its credit; the one
with the most credit (ties: the earlier pack) gives its next word not
already taken and loses the total weight of the packs still in play.
Repeat until every pack is used up. The result is one pack, used wherever
the English pack would be (practice, arcade); the daily challenge always
uses the English pack alone.

Vectors: `packs.json`.

## 35. Passages: code and quotes

A passage is a whole text (code or a quote) typed as one round. Its weight
is `PASSAGE_BASE_WEIGHT` plus the mean character score over its characters
other than spaces and newlines: a letter (either case) scores its key score;
any other character its weakness against the modifier goal, capped at
`PASSAGE_CHAR_CAP`. A pick is `weightedIndex` over the weights, with recent
passages at 0 (unless every passage is recent).

Passages are typed with **auto-indent**: after a correct newline, the spaces
that start the next line are filled in with no keystrokes recorded. A typed
passage applies its records to stats (full weight), error analysis and key
days, not to unlocks, difficulty, rounds or sessions, and joins
`recentPassages` (newest last, `PASSAGE_RECENT` kept).

Profile version 6 adds an empty `recentPassages`.

Vectors: `passages.json`.

## 36. Shortcut packs

A pack may be for one system only (`os`: mac, windows or linux). A shortcut
has a Mac combo, a combo for Windows and Linux, and optionally a Linux combo
that replaces it on Linux. Shortcut ids are unique across packs (packs added
in phase 6 prefix them, as in `vscode:comment`), so each keeps its own stats.

## 37. Keyboard layouts

Each profile has a `layout`: qwerty (also US-International and UK, which
only differ in symbols), azerty, qwertz, dvorak, colemak or colemak-dh. The
layout table gives three rows of ten key positions (top, home, bottom) and
a home-row unlock order:

| Layout | Rows | Home-row order |
| --- | --- | --- |
| qwerty | `qwertyuiop` `asdfghjkl;` `zxcvbnm,./` | `asdfjklhgeriotuwypqncmvbxz` |
| azerty | `azertyuiop` `qsdfghjklm` `wxcvbn,;:!` | `qsdfjklmhgetaoiruypzncwbvx` |
| qwertz | `qwertzuiop` `asdfghjklö` `yxcvbnm,.-` | `asdfjklhgetoiruwpqzncmybvx` |
| dvorak | `',.pyfgcrl` `aoeuidhtns` `;qjkxbmwvz` | `aoeuhtnsdirlcfgypmwbvkjxqz` |
| colemak | `qwfpgjluy;` `arstdhneio` `zxcvbkm,./` | `arstneiohdluwfgypjqcmbvkxz` |
| colemak-dh | `qwfpbjluy;` `arstgmneio` `zxcdvkh,./` | `arstneiomgluwfypbjqhdcvkxz` |

QWERTY keeps its original order. The others are: the home row's home
positions (columns 1-4, then 7-10), then column 6 and column 5, then the top
row's letters and the bottom row's, each by English frequency. The
frequency order is the same on every layout.

From the rows (letters only):

- **Neighbors** (error types, section 17): rows offset by 0, 0.25 and 0.75
  key; two keys are neighbors when they differ by at most one row and their
  offset columns by at most one.
- **Left hand** (Shift side): columns 1-5.
- **Fingers:** column 1 left pinky, 2 left ring, 3 left middle, 4-5 left
  index, 6-7 right index, 8 right middle, 9 right ring, 10 right pinky.
- **Zones:** left columns 1-3, center 4-7, right 8-10, per row.
- **Thumbs:** the left thumb takes columns 1-5 of the top and home rows and
  columns 1-4 of the bottom row; the right thumb the rest.
- **Screen zones:** top and middle rows split at 1-3, 4-7, 8-10; the bottom
  row at 1-2, 3-5, 6-10.

Profile version 7 adds `layout`, qwerty for existing profiles. Apps keep a
separate profile per input profile and layout, so a new layout starts with
its own calibration, unlocks and stats.

Vectors: `layouts.json`.

## 38. Achievements

A profile has `achievements`: `earned` (badge id → time earned), `counters`
(name → number, missing means 0) and `backfilled` (false at first).

Every activity reports an **event** with a **context**. The context is the
local date (`day`, YYYY-MM-DD) and hour (0 to 23), the theme, whether dark
mode is on and whether sound is on. Events:

- `round`, `passage`, `daily` (typing): `wpm`, `accuracy`, `chars` (typed
  correctly), `durationMs`, `consistency` (0..1, or none outside practice)
  and `words` (the words typed fully and correctly, lowercase: each run of
  non-space characters that ends at or before the position and is correct
  at every index).
- `arcade`: `score`, `level`, `lives`.
- `race`: `ghost` (a ghost race), `won` (true, false or none without an
  opponent) and `marginMs` (the opponent's finish time minus yours, or none).
- `drill`: a shortcut drill finished.
- `check`: nothing happened; only saved progress is looked at (at launch).

**recordAchievements(state, event, ctx, now):**

1. If not `backfilled`, backfill (below) and set `backfilled`.
2. For any event but `check`: count the day toward the streak (below), add 1
   to `theme:<theme>`, to `dark` if dark mode is on, and to `clack` if the
   theme is mechanical with sound on.
3. Typing events: add 1 to `rounds` (round only) or `passages` (passage only).
   With `accuracy >= goal accuracy` and `chars >= SPEED_MIN_CHARS`, raise
   `bestWpm` to `wpm`. With `accuracy >= ACCURATE_ROUND` and
   `chars >= SPEED_MIN_CHARS`, add 1 to `accurateRounds`. With
   `consistency >= STEADY_ROUND`, add 1 to `steadyRounds`. Add the number of
   "the" in `words` to `word:the`. A race that was won adds 1 to `racesWon`;
   a drill adds 1 to `drills`. The goal is the profile's, or `DEFAULT_GOAL`.
4. Go through the catalog in order. Every badge not yet earned whose
   condition holds is earned now (`earned[id] = now`). Return those ids.

**Streak days** use date numbers (days since 1970-01-01 of the calendar
date). For a day `d`: if `streakDay == d`, nothing. Otherwise `streak`
becomes `streak + 1` if `streakDay == d - 1`, or 1; then `streakDay = d` and
`bestStreak = max(bestStreak, streak)`.

**Backfill** (progress from before achievements): for each saved round that
isn't a calibration test, add 1 to `rounds` and apply the `bestWpm`,
`accurateRounds` and `steadyRounds` rules from step 3. For each daily result
at the goal accuracy, raise `bestWpm` to its wpm. Then count every day that
appears in `keyDays`, in increasing order, as a streak day.

**Catalog** (in order). Conditions on saved state are checked after every
event; conditions on "this event" only for that event.

| Id | Condition | Reward |
| --- | --- | --- |
| `speed-40`, `-60`, `-80`, `-100`, `-120` | `bestWpm >= 40`, 60, 80, 100, 120 | cursor:block, cursor:glow, effect:fireworks, cursor:rainbow, style:holo |
| `letters-half`, `letters-all` | 13, 26 unlocked letters (a to z) | cursor:underline, accessory:crown |
| `streak-3`, `-7`, `-30`, `-100` | `bestStreak >=` 3, 7, 30, 100 | effect:confetti, accessory:scarf, style:neon, none |
| `nemesis-1`, `nemesis-5` | at least 1, 5 defeated nemeses (`arcade.hall`) | effect:sparks, none |
| `creature-grown` | a creature at stage 2 or more | accessory:hat |
| `creature-legendary` | a creature at stage 3 | cursor:creature |
| `creatures-letters` | all 26 letter creatures at stage 2 or more | none |
| `accuracy-` bronze, silver, gold | `accurateRounds >=` 10, 50, 200 | none, accessory:glasses, style:gold |
| `rhythm-` | `steadyRounds >=` 5, 25, 100 | none, effect:bubbles, none |
| `arcade-` | best falling or survival score >= 1000, 5000, 15000 | none |
| `races-` | `racesWon >=` 1, 10, 50 | none |
| `daily-` | daily results saved >= 3, 15, 50 | none |
| `passages-` | `passages >=` 5, 25, 100 | none |
| `drills-` | `drills >=` 3, 15, 50 | none |
| `rounds-` | `rounds >=` 10, 100, 500 | none |
| `perfect` | this typing event: accuracy 1, `chars >= PERFECT_MIN_CHARS` | none |
| `night-owl` | this typing event at hour 2 or 3 | none |
| `early-bird` | this typing event at hour 5 | none |
| `the-1000` | `word:the >= 1000` | none |
| `photo-finish` | this race: ghost, lost, `marginMs < PHOTO_FINISH_MS` | none |
| `marathon` | this round: `durationMs >= MARATHON_MS` | none |
| `tortoise` | this round: accuracy 1, wpm < 20, `chars >= SPEED_MIN_CHARS` | none |
| `hardcore` | this arcade game: hardcore lives, level >= 5 | none |
| `theme-clean`, `-terminal`, `-cute` | `theme:<theme> >= THEME_ROUNDS` | none |
| `theme-mechanical` | `clack >= THEME_ROUNDS` | none |
| `theme-dark` | `dark >= THEME_ROUNDS` | none |

Rewards come only from skill milestones, never from secrets, themes or plain
counts. A profile's rewards are those of its earned badges; apps may offer
the rewards of every profile.

Profile version 8 adds `achievements` with nothing earned and `backfilled`
false, so the first event (usually `check` at launch) counts earlier
progress.

Vectors: `achievements.json`.

## Constants

| Name | Value |
| --- | --- |
| `MAX_INTERVAL_MS` | 2000 |
| `SPEED_MIN_CHARS`, `PERFECT_MIN_CHARS` | 50, 100 |
| `ACCURATE_ROUND`, `STEADY_ROUND`, `THEME_ROUNDS` | 0.97, 0.75, 20 |
| `PHOTO_FINISH_MS`, `MARATHON_MS` | 100, 600000 |
| `CATCH_UP_KEYS` | 2 |
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
| `MAX_DECORATED_SHARE` | 0.5 |
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
| `SESSION_GAP_MS` | 30 minutes |
| `SESSION_HISTORY` | 30 |
| `FATIGUE_BASELINE_ROUNDS`, `FATIGUE_RECENT_ROUNDS` | 2, 2 |
| `FATIGUE_MIN_ROUNDS` | 4 |
| `FATIGUE_WPM_DROP`, `FATIGUE_ACCURACY_DROP` | 0.88, 0.04 |
| `RECOVER_WPM`, `RECOVER_ACCURACY_DROP` | 0.95, 0.02 |
| `FATIGUE_EASE`, `TIRED_WEIGHT` | 0.15, 0.5 |
| `HESITATION_MIN_MS`, `HESITATION_FACTOR` | 350, 2.2 |
| `HESITATION_MIN_SAMPLES` | 5 |
| `HESITATION_SCORE_SCALE`, `HESITATION_SCORE_CAP` | 4, 1 |
| `HESITANT_RATE` | 0.15 |
| `BIAS_WEIGHT` | 0.2 |
| `DOUBLE_BIAS_MIN`, `CONFUSION_MIN`, `CONFUSION_BONUS` | 0.15, 3, 0.5 |
| `MAX_MISSED_WORDS` | 200 |
| `REVIEW_INTERVALS_DAYS` | 1, 3, 7, 14, 30 |
| `REVIEW_SESSION_GAP` | 2 |
| `REVIEW_WEAKNESS` | 1 |
| `REVIEW_MIN_SAMPLES`, `REVIEW_PAIR_MIN_SAMPLES` | 3, 2 |
| `REVIEW_BONUS`, `REVIEW_WORDS` | 1, 3 |
| `WARMUP_SECONDS`, `WARMUP_KEYS`, `WARMUP_PAIRS`, `WARMUP_BONUS` | 20, 3, 2, 2 |
| `RHYTHM_MIN_INTERVALS`, `STALL_FACTOR` | 5, 2 |
| `GRIP_MIN_SAMPLES`, `GRIP_TWO_RATIO`, `GRIP_ONE_RATIO` | 20, 0.9, 1.1 |
| `DRIFT_MIN_TAPS`, `DRIFT_THRESHOLD`, `DRIFT_BONUS` | 10, 0.22, 0.5 |
| `PHONOTACTIC_WORDS`, `PHONOTACTIC_TOP` | 5000, 40 |
| `MADE_UP_MAX_SYLLABLES`, `MADE_UP_LONG_MAX` | 3, 8 |
| `DEFAULT_MADE_UP_CAP` | 0.8 |
| `ARCADE_WEIGHT` | 0.5 |
| `WORDS_PER_LEVEL`, `BOSS_EVERY` | 10, 5 |
| `FALL_SECONDS_START`, `FALL_SECONDS_MIN` | 9, 2.5 |
| `SPAWN_SECONDS_START`, `SPAWN_SECONDS_MIN` | 2.4, 0.7 |
| `FALLING_SPEEDUP`, `SURVIVAL_SPEEDUP` | 0.92, 0.88 |
| `MAX_ON_SCREEN`, `TOUCH_SPEED_FACTOR` | 6, 0.75 |
| `START_LIVES`, `ERROR_RUN_FOR_LIFE` | 3, 3 |
| `HEALTH_PER_ERROR`, `HEALTH_PER_LANDED`, `HEALTH_PER_CLEAN_WORD` | 0.05, 0.2, 0.02 |
| `BOSS_HP`, `BOSS_SECONDS`, `BOSS_FALL_SECONDS` | 10, 60, 12 |
| `BOSS_PHASE2_SPEED`, `BOSS_HEAL_PER_ERROR`, `BOSS_DEFEAT_BONUS` | 1.5, 0.5, 500 |
| `BOSS_MIN_LENGTH`, `POWERUP_MIN_LENGTH`, `POWERUP_EVERY` | 5, 4, 8 |
| `SLOW_SECONDS`, `SLOW_FACTOR`, `DOUBLE_SECONDS` | 5, 0.5, 8 |
| `POINTS_PER_CHAR`, `COMBO_STEP`, `COMBO_BONUS`, `COMBO_MAX_MULTIPLIER` | 10, 5, 0.5, 4 |
| `WEAK_WORD_BONUS`, `WEAK_KEYS_FOR_BONUS` | 0.5, 3 |
| `MAX_SCORES`, `ARCADE_MAX_WORD_LENGTH` | 10, 10 |
| `RIVAL_AHEAD`, `RUBBER_BAND_CHARS`, `RUBBER_BAND_STRENGTH` | 1.05, 15, 0.3 |
| `RIVAL_WARMUP_SECONDS`, `RACE_WORDS` | 3, 30 |
| `NEMESIS_MIN_SAMPLES`, `NEMESIS_MIN_WEAKNESS`, `NEMESIS_DEFEAT_WEAKNESS` | 20, 1, 0.3 |
| `KEY_DAYS_KEPT` | 30 |
| `CREATURE_BABY_SAMPLES`, `CREATURE_GROWN_SAMPLES`, `CREATURE_LEGENDARY_SAMPLES` | 15, 40, 150 |
| `CREATURE_GROWN_WEAKNESS`, `CREATURE_SICK_WEAKNESS` | 0.3, 2 |
| `CREATURE_LEGENDARY_SPEED`, `CREATURE_LEGENDARY_ERRORS` | 0.8, 0.02 |
| `CREATURE_GRACE_DAYS`, `CREATURE_DECAY_DAYS`, `CREATURE_MIN_RECENCY`, `CREATURE_MIN_HEALTH` | 7, 30, 0.5, 0.05 |
| `FORECAST_WINDOW_DAYS`, `FORECAST_MIN_DAYS`, `FORECAST_ESTIMATE_DAYS` | 30, 3, 7 |
| `FORECAST_ESTIMATE_SPREAD`, `FORECAST_MAX_DAYS`, `FORECAST_KEY_MIN_TIMED` | 0.35, 365, 3 |
| `REPLAYS_RECENT`, `REPLAYS_BEST` | 5, 3 |
| `DAILY_WORDS`, `DAILY_POOL`, `DAILY_MIN_LENGTH`, `DAILY_MAX_LENGTH` | 30, 3000, 2, 10 |
| `DAILY_SENTENCE_MIN`, `DAILY_SENTENCE_MAX`, `DAILY_COMMA_CHANCE`, `DAILY_KEPT` | 5, 9, 0.12, 400 |
| `TRAIT_STEADY`, `TRAIT_BURSTY`, `TRAIT_PRECISE`, `TRAIT_DARING` | 0.55, 0.4, 0.97, 0.9 |
| `TRAIT_FIXER`, `TRAIT_PRESSES_ON`, `FINGERPRINT_MIN_SAMPLES` | 0.8, 0.3, 20 |
| `CUSTOM_MAX_WORDS`, `CUSTOM_MIN_LENGTH`, `CUSTOM_MAX_LENGTH` | 5000, 2, 20 |
| `PASSAGE_RECENT`, `PASSAGE_CHAR_CAP`, `PASSAGE_BASE_WEIGHT` | 8, 2, 0.2 |

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
| `errors.json` | error classification and analysis |
| `hesitation.json` | hesitation judgments |
| `session.json` | sessions, fatigue and grip suggestions |
| `reviews.json` | spaced repetition |
| `rhythm.json` | rhythm consistency and stalls |
| `phonotactics.json` | sound patterns and pronounceable words |
| `warmup.json` | warm-up targets and planning with review words |
| `arcade.json` | falling words and survival, operation by operation |
| `arcadeWords.json` | power-up and boss word weights and a word source |
| `arcadeResults.json` | arcade stats at reduced weight and high scores |
| `race.json` | rival pacing and ghost runs |
| `nemesis.json` | nemesis names, choice and defeat |
| `creatures.json` | creature roster, traits, stages, health and updates |
| `forecast.json` | trend forecasts, speed goal, key and unlock forecasts |
| `replay.json` | building, replaying, markers and keeping replays |
| `daily.json` | daily challenge text for sample dates, marks, streaks, share text |
| `fingerprint.json` | fingerprint card traits, best and worst keys, top creatures |
| `packs.json` | words from pasted text, and mixing packs by weight |
| `passages.json` | passage weights and picks, auto-indent, completion, Linux combos |
| `layouts.json` | every layout's rows, home-row order, hands, fingers, zones and neighbors |
| `achievements.json` | the badge ids, and events over several days with the badges each earns |

Vectors that use the word pack use the first `packSize` words of
`content/words-en.json` version 1 and `content/blocklist.json`.
