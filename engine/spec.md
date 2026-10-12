# AdapType engine spec (phase 1)

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
with length between `MIN_WORD_LENGTH` and `MAX_WORD_LENGTH` whose letters are
all unlocked. Stop at `MAX_POOL` words.

### 5.2 Word weight

```
letterAvg = (sum of letter scores over the word's letters) / length
pairAvg   = length > 1 ? (sum of pair scores over adjacent pairs) / (length - 1) : 0
            (missing scores count as 0)
weight    = (BASE_WORD_WEIGHT + letterAvg + pairAvg) / (1 + rank / RANK_SCALE)
```

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

### 5.8 Calibration words

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

The test is a timed round of calibration words (5.8). Calibration rounds
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

1. Apply the records to stats (section 3). Append letter entries to history.
2. Touch: append each record's tap to its expected key's tap list, keeping the
   last `MAX_TAPS_PER_KEY`.
3. If the round had keystrokes, append a summary `{at, wpm, accuracy,
   durationMs, chars, corrections, calibration}`, keeping the last
   `MAX_ROUNDS_KEPT`.
4. `roundCounter += 1`.
5. If it was a calibration test: nothing else. If silent calibration is
   running: count down (7.3). Otherwise: run the unlock check (6.2).

The results screen compares against the average WPM and accuracy of the last
`RECENT_ROUNDS` non-calibration rounds before this one.

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
| `MAX_WORD_LENGTH` | 8 |
| `MAX_POOL` | 2000 |
| `FULL_POOL` | 60 |
| `MAX_MADE_UP_SHARE` | 0.8 |
| `BASE_WORD_WEIGHT` | 0.2 |
| `RANK_SCALE` | 3000 |
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

## Test vectors

| File | Covers |
| --- | --- |
| `rng.json` | hashString, deriveSeed, Mulberry32 outputs, weightedIndex |
| `typing.json` | the typing state machine in all three modes, records, metrics |
| `stats.json` | applying a round to key and pair stats |
| `scoring.json` | weakness scores |
| `generate.json` | word pools, weights, made-up words (first 2,000 pack words) |
| `profile.json` | full sessions: calibration, test-out, practice rounds, unlocks |

Vectors that use the word pack use the first `packSize` words of
`content/words-en.json` version 1 and `content/blocklist.json`.
