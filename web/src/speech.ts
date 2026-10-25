// Reading aloud for spelling by ear, with the device's own voices (free, no
// download, and on most devices they work offline). Voices load
// asynchronously, so callers wait for them with voicesReady.
import type { Settings } from "./store";

/** Normal and slower speaking rates. */
const RATE = 0.9;
const SLOW_RATE = 0.55;

const synth = (): SpeechSynthesis | null => (typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null);

/** English voices on this device, US first, then others, each group by name. */
export function englishVoices(): SpeechSynthesisVoice[] {
  const s = synth();
  if (!s) return [];
  const rank = (v: SpeechSynthesisVoice) => (v.lang.toLowerCase().replace("_", "-").startsWith("en-us") ? 0 : 1);
  return s
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith("en"))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** The English voices, once the device has listed them (or after timeoutMs with whatever there is). */
export function voicesReady(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  const s = synth();
  if (!s) return Promise.resolve([]);
  const now = englishVoices();
  if (now.length > 0) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      s.removeEventListener("voiceschanged", done);
      resolve(englishVoices());
    };
    const timer = window.setTimeout(done, timeoutMs);
    s.addEventListener("voiceschanged", done);
  });
}

/** The voice picked in Settings if it's still on this device, else the device's default English voice. */
function pickVoice(settings: Settings): SpeechSynthesisVoice | null {
  const voices = englishVoices();
  return voices.find((v) => v.voiceURI === settings.voice) ?? voices.find((v) => v.default) ?? voices[0] ?? null;
}

/** Says text, cutting off anything still being said. Returns false when there's no voice. */
export function speak(text: string, settings: Settings, options: { slow?: boolean } = {}): boolean {
  const s = synth();
  const voice = pickVoice(settings);
  if (!s || !voice) return false;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = options.slow ? SLOW_RATE : RATE;
  s.speak(u);
  return true;
}

export function stopSpeaking(): void {
  synth()?.cancel();
}
