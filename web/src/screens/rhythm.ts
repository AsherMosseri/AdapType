import {
  applyArcadeRecords,
  DEFAULT_GOAL,
  planRound,
  recentAverage,
  recordScore,
  RHYTHM_BEATS_PER_BAR,
  RHYTHM_PHRASE_WORDS,
  RHYTHM_PHRASES,
  RhythmGame,
  rhythmMultiplier,
  updateCreatures,
  updateNemesis,
  type RhythmHit,
  type TypingEvent,
} from "../../../engine/src";
import { earn } from "../achievements";
import { announce } from "../announce";
import type { App, ScreenView } from "../app";
import { topBar } from "../components/topBar";
import { touchKeyboard } from "../components/touchKeyboard";
import { blocklist, characters, nemesisContent, pack } from "../content";
import { formatPercent, h } from "../dom";
import { attachPhysicalInput } from "../physicalInput";
import { currentTouchLayout } from "../platform";
import { audioClock, playDrum, type DrumKind } from "../sound";
import { practicePack } from "../wordPacks";
import { gameOverPanel } from "./arcadeResults";

/** Pixels between notes on the track. */
const NOTE_PX = 22;
/** Drums are scheduled this far ahead of the music, in ms. */
const LOOKAHEAD_MS = 120;
/** What each judgment says by the box. */
const JUDGMENT_TEXT = { perfect: "Perfect", good: "Good", miss: "Miss" } as const;

/**
 * Rhythm mode: words scroll toward a line, and each character should be typed
 * as it crosses, on the beat of a drum loop. Perfect, good or miss for each
 * key; combos raise the multiplier; clean phrases raise the tempo.
 */
export function rhythmScreen(app: App): ScreenView {
  const state = app.profile;
  const settings = app.data.settings;
  const touch = settings.activeProfile === "touch";
  const goal = state.goal ?? DEFAULT_GOAL;
  const words = planRound(state, { pack: practicePack(app), blocklist, count: RHYTHM_PHRASES * RHYTHM_PHRASE_WORDS, now: Date.now(), madeUpCap: settings.madeUpCap }).words.map((w) => w.text);
  const phrases: string[] = [];
  for (let i = 0; i < words.length; i += RHYTHM_PHRASE_WORDS) phrases.push(words.slice(i, i + RHYTHM_PHRASE_WORDS).join(" "));
  const startWpm = recentAverage(state)?.wpm ?? goal.wpm;
  const game = new RhythmGame(phrases, startWpm);

  // The track: every note at its distance along the song; it slides left as the song plays.
  const strip = h("div", { class: "rhythm-strip" });
  const noteEls: HTMLElement[] = [];
  const hitLine = h("div", { class: "rhythm-hit-line" });
  const judgment = h("div", { class: "rhythm-judgment", "aria-hidden": "true" });
  const track = h("div", { class: "rhythm-track" }, h("div", { class: "rhythm-lane", "aria-hidden": "true" }, strip, hitLine, judgment));
  const scoreValue = h("span", { class: "stat-value" }, "0");
  const comboValue = h("span", { class: "stat-value" }, "0");
  const levelValue = h("span", { class: "stat-value" }, `1`);
  const tempoNote = h("span", { class: "fine" }, `${game.bpm} BPM`);
  const banner = h("p", { class: "rhythm-banner", "aria-live": "polite" });
  const startButton = h("button", { type: "button", class: "button primary", onclick: () => start() }, "Start");
  const startArea = h(
    "div",
    { class: "rhythm-start" },
    h("p", null, touch ? "Type each letter as it reaches the box." : "Type each letter as it reaches the box. Press any key to start."),
    startButton,
  );
  track.append(startArea);
  const result = h("div");

  const physical = touch
    ? null
    : attachPhysicalInput({
        onEvent: (e) => handle(e),
        onEscape: () => leave(),
        onCapsLock: () => undefined,
      });
  const layout = currentTouchLayout(settings);
  const keyboard = touch
    ? touchKeyboard({
        layout: layout.layout,
        layoutName: layout.name,
        onChar: (char, tap, layer, t) => handle({ kind: "char", char, t, tap, layer: layer || undefined }),
        onBackspace: () => undefined,
        isLocked: () => false,
      })
    : null;

  const main = h(
    "main",
    { class: "rhythm" },
    h("h1", { tabindex: "-1" }, "Rhythm"),
    h(
      "dl",
      { class: "live-stats rhythm-stats" },
      h("div", null, h("dt", null, "Score"), h("dd", null, scoreValue)),
      h("div", null, h("dt", null, "Combo"), h("dd", null, comboValue)),
      h("div", null, h("dt", null, "Level"), h("dd", null, levelValue, " ", tempoNote)),
    ),
    track,
    banner,
    settings.sound.on ? null : h("p", { class: "fine" }, "Sound is off, so there's no beat to hear. Turn it on in Settings, under Sound."),
    h("p", { class: "sr-only" }, `Type each letter on the beat. Text: ${game.text}`),
    physical?.el,
    result,
  );
  const el = h("div", { class: `screen practice-screen rhythm-screen${touch ? " touch" : ""}` }, topBar(app, { back: () => leave(), backLabel: "Arcade" }), main, keyboard);
  if (physical) main.addEventListener("pointerup", (e) => !(e.target as HTMLElement).closest("button, a, label") && physical.focus());

  /** Distance along the track at song time t: each tempo segment moves NOTE_PX per note. */
  function trackPos(t: number): number {
    let pos = 0;
    const segs = game.segments;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (t <= s.t) break;
      const end = Math.min(t, segs[i + 1]?.t ?? Infinity);
      pos += ((end - s.t) * NOTE_PX) / game.noteMs(s.level);
    }
    return pos;
  }

  /** Adds elements for notes scheduled since the last call (a phrase is scheduled when the one before ends). */
  function addNotes(): void {
    for (let i = noteEls.length; i < game.notes.length; i++) {
      const n = game.notes[i];
      const note = h("span", { class: `rhythm-note${n.char === " " ? " space" : ""}${i === 0 || game.notes[i - 1].phrase !== n.phrase ? " phrase-start" : ""}` }, n.char === " " ? "" : n.char);
      note.style.left = `${trackPos(n.t)}px`;
      noteEls.push(note);
      strip.append(note);
    }
  }
  addNotes();

  let songStart: number | null = null;
  let raf = 0;
  let scheduler = 0;
  let scheduledUntil = 0;
  let finished = false;
  let lastLevel = 1;
  let judgmentTimer = 0;

  function start(): void {
    if (songStart !== null || finished) return;
    songStart = performance.now();
    startArea.hidden = true;
    el.classList.add("running");
    scheduledUntil = 0;
    schedule();
    scheduler = window.setInterval(schedule, 25);
    raf = requestAnimationFrame(frame);
    (physical?.el ?? main).focus({ preventScroll: true });
  }

  /** Song time now. */
  const songNow = () => performance.now() - (songStart ?? performance.now());

  /** Schedules the drums for the next LOOKAHEAD_MS of the song on the audio clock. */
  function schedule(): void {
    const clock = audioClock();
    const now = songNow();
    const until = now + LOOKAHEAD_MS;
    const end = game.endT ?? Infinity;
    for (let s = 0; s < game.segments.length; s++) {
      const seg = game.segments[s];
      const segEnd = Math.min(game.segments[s + 1]?.t ?? Infinity, end);
      const beat = 60000 / seg.bpm;
      const eighth = beat / 2;
      // Each eighth in this segment that falls in the window.
      const first = Math.max(0, Math.ceil((Math.max(scheduledUntil, seg.t) - seg.t) / eighth - 1e-9));
      for (let k = first; ; k++) {
        const t = seg.t + k * eighth;
        if (t >= segEnd || t >= until) break;
        if (t < scheduledUntil) continue;
        if (clock) for (const drum of drumsAt(k, seg.level, t < game.barMs(1))) playDrum(drum, clock.now + (t - now) / 1000 - clock.latency);
      }
    }
    scheduledUntil = Math.min(until, end);
  }

  /** The drums on the k-th eighth of a segment: a count-in click, then kick, snare and hats (busier at higher levels). */
  function drumsAt(k: number, level: number, countIn: boolean): DrumKind[] {
    const step = k % (RHYTHM_BEATS_PER_BAR * 2);
    if (countIn) return step % 2 === 0 ? ["click"] : [];
    const out: DrumKind[] = [];
    if (step === 0 || step === 4 || (level >= 3 && step === 5)) out.push("kick");
    if (step === 2 || step === 6) out.push("snare");
    if (step % 2 === 0 || level >= 2) out.push("hat");
    return out;
  }

  function frame(): void {
    if (finished || songStart === null) return;
    const t = songNow();
    show(game.update(t));
    addNotes();
    strip.style.transform = `translateX(${-trackPos(t)}px)`;
    // The hit line pulses on each beat.
    const seg = game.segmentAt(t);
    const beat = 60000 / seg.bpm;
    const phase = (((t - seg.t) % beat) + beat) % beat / beat;
    hitLine.style.setProperty("--pulse", String(Math.max(0, 1 - phase * 2.5)));
    // Count in "1 2 3 4" over the first bar, then "Go!".
    if (t < game.barMs(1)) setBanner(`${Math.floor(t / beat) + 1}`, "count");
    else if (banner.dataset.kind === "count") setBanner("Go!", "go");
    if (game.done && t >= (game.endT ?? 0)) return finish();
    raf = requestAnimationFrame(frame);
  }

  function handle(event: TypingEvent): void {
    if (finished) return;
    if (songStart === null) {
      // On a keyboard, the first key starts the song (it isn't a note).
      if (!touch) start();
      return;
    }
    if (event.kind !== "char" || !event.char) return;
    show(game.input(event.char, event.t - songStart, { tap: event.tap, layer: event.layer, shift: event.shift }));
  }

  /** Marks judged notes and updates the score, combo and level. */
  function show(hits: RhythmHit[]): void {
    if (hits.length === 0) return;
    for (const hit of hits) {
      const note = noteEls[hit.note];
      if (!note) continue;
      note.classList.add(hit.kind);
      if (game.notes[hit.note].judged?.reason === "wrong") note.classList.add("wrong");
    }
    const last = hits[hits.length - 1];
    judgment.textContent = last.kind === "miss" ? "Miss" : `${JUDGMENT_TEXT[last.kind]}${game.combo >= 5 ? ` ×${game.combo}` : ""}`;
    judgment.className = `rhythm-judgment show ${last.kind}`;
    window.clearTimeout(judgmentTimer);
    judgmentTimer = window.setTimeout(() => judgment.classList.remove("show"), 350);
    scoreValue.textContent = game.score.toLocaleString();
    const mult = rhythmMultiplier(game.combo);
    comboValue.textContent = mult > 1 ? `${game.combo} ×${mult}` : String(game.combo);
    if (game.level !== lastLevel) {
      const up = game.level > lastLevel;
      lastLevel = game.level;
      levelValue.textContent = String(game.level);
      tempoNote.textContent = `${game.bpm} BPM`;
      setBanner(up ? `Level ${game.level}: faster!` : `Level ${game.level}: a little slower.`, "level");
      announce(banner.textContent ?? "");
    } else if (banner.dataset.kind !== "count" && hits.some((x) => game.notes[x.note].phrase > bannerPhrase)) {
      // "Go!" and level news stay up until the next phrase gets going.
      setBanner("", "");
    }
  }

  /** The phrase that was last judged when the banner was set: it clears once a later phrase is under way. */
  let bannerPhrase = -1;
  function setBanner(text: string, kind: string): void {
    if (banner.textContent !== text) banner.textContent = text;
    banner.dataset.kind = kind;
    bannerPhrase = game.cursor > 0 ? game.notes[game.cursor - 1].phrase : -1;
  }

  function finish(): void {
    finished = true;
    cancelAnimationFrame(raf);
    window.clearInterval(scheduler);
    const now = Date.now();
    applyArcadeRecords(state, game.text, game.records, { chars: characters, pack, at: now });
    updateCreatures(state, now, characters);
    state.arcade.games += 1;
    state.roundCounter += 1;
    const notes = game.notes.length;
    const hitRate = (game.counts.perfect + game.counts.good) / notes;
    const rank = recordScore(state, "rhythm", { score: game.score, level: game.topLevel, words: words.length, wpm: game.topWpm, accuracy: hitRate, at: now });
    const nemesisChange = updateNemesis(state, now, nemesisContent);
    const badges = earn(app, { kind: "rhythm", score: game.score, maxCombo: game.maxCombo, misses: game.counts.miss, notes });
    app.persist();
    keyboard?.remove();
    el.classList.remove("running");
    const verdict =
      game.counts.miss === 0
        ? "Full combo: not a single note missed!"
        : `Top level ${game.topLevel}, at ${game.bpmAt(game.topLevel)} BPM (${Math.round(game.topWpm)} WPM on the beat).`;
    result.replaceChildren(
      gameOverPanel(app, {
        title: "Song complete",
        verdict,
        rank,
        stats: [
          ["Score", game.score.toLocaleString()],
          ["Best combo", String(game.maxCombo)],
          ["On the beat", formatPercent(hitRate)],
          ["Perfect", String(game.counts.perfect)],
          ["Good", String(game.counts.good)],
          ["Missed", String(game.counts.miss)],
        ],
        nemesisChange,
        badges,
        again: { name: "rhythm" },
      }),
    );
    announce(`Song complete. ${game.score} points, best combo ${game.maxCombo}.`);
  }

  function leave(): void {
    if (!finished && game.records.length > 0) {
      // An unfinished song still counts toward key stats, without a score.
      finished = true;
      applyArcadeRecords(state, game.text, game.records, { chars: characters, pack, at: Date.now() });
      app.persist();
    }
    app.go({ name: "arcade" });
  }

  requestAnimationFrame(() => {
    strip.style.transform = `translateX(${-trackPos(0)}px)`;
  });
  announce("Rhythm. Type each letter as it reaches the line, on the beat.");
  return {
    el,
    focus: physical?.el ?? startButton,
    dispose: () => {
      finished = true;
      cancelAnimationFrame(raf);
      window.clearInterval(scheduler);
      window.clearTimeout(judgmentTimer);
      physical?.dispose();
    },
  };
}
