// Synthesized sound effects: no audio files, so nothing to license, and each
// theme gets its own set. Browsers only allow audio after a user gesture, so
// the audio context starts on the first tap or key press.
import type { SoundSettings, ThemeId } from "./store";

export type SoundKind = "key" | "error" | "combo" | "levelUp" | "bossHit" | "powerUp" | "success" | "beat";

type Wave = OscillatorType;
/** One oscillator note: wave, start and end pitch (Hz), length and delay (s), loudness 0..1. */
interface Tone {
  wave: Wave;
  from: number;
  to?: number;
  dur: number;
  delay?: number;
  gain: number;
}
/** A burst of filtered noise, for clicks and thumps. */
interface Noise {
  noise: true;
  filter: BiquadFilterType;
  freq: number;
  q?: number;
  dur: number;
  delay?: number;
  gain: number;
}
type Part = Tone | Noise;

const notes = (wave: Wave, freqs: number[], step: number, dur: number, gain: number): Tone[] =>
  freqs.map((f, i) => ({ wave, from: f, dur, delay: i * step, gain }));

/** Each theme's sound set. */
const SETS: Record<ThemeId, Record<SoundKind, Part[]>> = {
  clean: {
    key: [{ wave: "sine", from: 1900, to: 1500, dur: 0.018, gain: 0.12 }],
    error: [{ wave: "sine", from: 240, to: 170, dur: 0.14, gain: 0.35 }],
    combo: notes("sine", [1319, 1760], 0.07, 0.12, 0.25),
    levelUp: notes("sine", [523, 659, 784, 1047], 0.08, 0.16, 0.25),
    bossHit: [{ wave: "sine", from: 160, to: 70, dur: 0.18, gain: 0.5 }],
    powerUp: [{ wave: "sine", from: 600, to: 1600, dur: 0.22, gain: 0.25 }],
    success: notes("sine", [784, 988, 1175], 0.06, 0.22, 0.22),
    beat: [{ wave: "sine", from: 1000, dur: 0.03, gain: 0.3 }],
  },
  terminal: {
    key: [{ wave: "square", from: 1200, dur: 0.012, gain: 0.05 }],
    error: [{ wave: "square", from: 110, dur: 0.16, gain: 0.18 }],
    combo: notes("square", [880, 1320], 0.06, 0.06, 0.1),
    levelUp: notes("square", [440, 554, 659, 880], 0.07, 0.07, 0.1),
    bossHit: [{ wave: "square", from: 90, to: 60, dur: 0.14, gain: 0.2 }, { noise: true, filter: "lowpass", freq: 800, dur: 0.1, gain: 0.3 }],
    powerUp: notes("square", [660, 990, 1320, 1980], 0.035, 0.04, 0.08),
    success: notes("square", [660, 880, 1320], 0.08, 0.08, 0.1),
    beat: [{ wave: "square", from: 800, dur: 0.02, gain: 0.08 }],
  },
  cute: {
    key: [{ wave: "triangle", from: 1300, to: 1900, dur: 0.03, gain: 0.18 }],
    error: [{ wave: "triangle", from: 520, to: 260, dur: 0.18, gain: 0.35 }],
    combo: notes("triangle", [1568, 2093, 2637], 0.05, 0.1, 0.25),
    levelUp: notes("triangle", [784, 988, 1175, 1568, 1976], 0.06, 0.12, 0.25),
    bossHit: [{ wave: "triangle", from: 330, to: 140, dur: 0.2, gain: 0.45 }],
    powerUp: [{ wave: "triangle", from: 800, to: 2400, dur: 0.25, gain: 0.3 }],
    success: notes("triangle", [1047, 1319, 1568, 2093], 0.06, 0.16, 0.25),
    beat: [{ wave: "triangle", from: 1200, dur: 0.035, gain: 0.3 }],
  },
  mechanical: {
    key: [
      { noise: true, filter: "bandpass", freq: 2800, q: 1.2, dur: 0.022, gain: 0.5 },
      { wave: "sine", from: 190, to: 120, dur: 0.035, gain: 0.25 },
    ],
    error: [
      { noise: true, filter: "lowpass", freq: 600, dur: 0.06, gain: 0.5 },
      { wave: "square", from: 140, dur: 0.12, gain: 0.1 },
    ],
    combo: [
      { wave: "sine", from: 2093, dur: 0.25, gain: 0.15 },
      { wave: "sine", from: 3136, dur: 0.2, delay: 0.02, gain: 0.08 },
    ],
    levelUp: notes("sine", [1047, 1568, 2093], 0.09, 0.2, 0.15),
    bossHit: [
      { noise: true, filter: "lowpass", freq: 300, dur: 0.15, gain: 0.8 },
      { wave: "sine", from: 90, to: 50, dur: 0.2, gain: 0.4 },
    ],
    powerUp: [{ wave: "sine", from: 1200, to: 2400, dur: 0.18, gain: 0.15 }],
    success: notes("sine", [1568, 2093], 0.1, 0.3, 0.15),
    beat: [{ noise: true, filter: "highpass", freq: 3000, dur: 0.015, gain: 0.5 }],
  },
};

export type DrumKind = "kick" | "snare" | "hat" | "click";

/** Each theme's drum kit for rhythm mode. "click" counts in. */
const DRUMS: Record<ThemeId, Record<DrumKind, Part[]>> = {
  clean: {
    kick: [{ wave: "sine", from: 150, to: 50, dur: 0.22, gain: 0.6 }],
    snare: [
      { noise: true, filter: "bandpass", freq: 1800, q: 0.9, dur: 0.12, gain: 0.35 },
      { wave: "sine", from: 220, to: 180, dur: 0.06, gain: 0.15 },
    ],
    hat: [{ noise: true, filter: "highpass", freq: 7000, dur: 0.035, gain: 0.14 }],
    click: [{ wave: "sine", from: 1500, dur: 0.03, gain: 0.25 }],
  },
  terminal: {
    kick: [{ wave: "square", from: 110, to: 50, dur: 0.14, gain: 0.22 }],
    snare: [{ noise: true, filter: "lowpass", freq: 3000, dur: 0.09, gain: 0.3 }],
    hat: [{ noise: true, filter: "highpass", freq: 6000, dur: 0.025, gain: 0.12 }],
    click: [{ wave: "square", from: 1000, dur: 0.02, gain: 0.1 }],
  },
  cute: {
    kick: [{ wave: "triangle", from: 180, to: 70, dur: 0.18, gain: 0.55 }],
    snare: [
      { noise: true, filter: "bandpass", freq: 2500, dur: 0.07, gain: 0.3 },
      { wave: "triangle", from: 900, dur: 0.04, gain: 0.15 },
    ],
    hat: [{ wave: "triangle", from: 2600, dur: 0.03, gain: 0.1 }],
    click: [{ wave: "triangle", from: 1500, dur: 0.035, gain: 0.25 }],
  },
  mechanical: {
    kick: [
      { wave: "sine", from: 90, to: 45, dur: 0.28, gain: 0.7 },
      { noise: true, filter: "lowpass", freq: 200, dur: 0.05, gain: 0.4 },
    ],
    snare: [{ noise: true, filter: "bandpass", freq: 1500, q: 0.8, dur: 0.1, gain: 0.45 }],
    hat: [{ noise: true, filter: "highpass", freq: 9000, dur: 0.02, gain: 0.35 }],
    click: [{ noise: true, filter: "bandpass", freq: 3000, dur: 0.015, gain: 0.5 }],
  },
};

let settings: SoundSettings = { on: true, volume: 0.5, keyClicks: true };
let theme: ThemeId = "clean";
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let unlocked = false;

export function configureSound(next: SoundSettings, nextTheme: ThemeId): void {
  settings = next;
  theme = nextTheme;
  if (master) master.gain.value = settings.volume;
}

/** Starts audio on the first gesture, as browsers require. Call once at startup. */
export function armSound(): void {
  const unlock = () => {
    unlocked = true;
    ensureContext()?.resume().catch(() => undefined);
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.gain.value = settings.volume;
  master.connect(ctx.destination);
  noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.3), ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  // A fixed pseudo-random fill, so the noise sounds the same every time.
  let x = 12345;
  for (let i = 0; i < data.length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (x / 0x7fffffff) * 2 - 1;
  }
  return ctx;
}

export function playSound(kind: SoundKind): void {
  if (kind === "key" && !settings.keyClicks) return;
  const ac = runningContext();
  if (ac) playParts(ac, SETS[theme][kind], ac.currentTime);
}

/** The audio context when sound can play right now, or null. */
function runningContext(): AudioContext | null {
  if (!settings.on || settings.volume <= 0 || !unlocked) return null;
  const ac = ensureContext();
  return ac && master && ac.state === "running" ? ac : null;
}

/**
 * The audio clock for scheduling ahead: the current time in seconds and the
 * output latency (how late sound reaches the speakers). Null when sound
 * can't play.
 */
export function audioClock(): { now: number; latency: number } | null {
  const ac = runningContext();
  if (!ac) return null;
  return { now: ac.currentTime, latency: ac.outputLatency || ac.baseLatency || 0 };
}

/** Plays one of the theme's drums at an audio-clock time (seconds). */
export function playDrum(kind: DrumKind, at: number): void {
  const ac = runningContext();
  if (ac) playParts(ac, DRUMS[theme][kind], Math.max(at, ac.currentTime));
}

function playParts(ac: AudioContext, parts: readonly Part[], when: number): void {
  if (!master) return;
  for (const part of parts) {
    const start = when + (part.delay ?? 0);
    const end = start + part.dur;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(part.gain, start + Math.min(0.005, part.dur / 4));
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    env.connect(master);
    if ("noise" in part) {
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer;
      const filter = ac.createBiquadFilter();
      filter.type = part.filter;
      filter.frequency.value = part.freq;
      filter.Q.value = part.q ?? 0.7;
      src.connect(filter).connect(env);
      src.start(start);
      src.stop(end + 0.01);
    } else {
      const osc = ac.createOscillator();
      osc.type = part.wave;
      osc.frequency.setValueAtTime(part.from, start);
      if (part.to) osc.frequency.exponentialRampToValueAtTime(part.to, end);
      osc.connect(env);
      osc.start(start);
      osc.stop(end + 0.01);
    }
  }
}
