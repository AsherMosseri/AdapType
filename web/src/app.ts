import type { CreatureChange, KeystrokeRecord, LayoutId, NemesisChange, ProfileState, RoundExplanation, RoundOutcome } from "../../engine/src";
import type { RoundMetrics } from "../../engine/src/typing";
import { updateCreatures } from "../../engine/src";
import { configureAnnounce } from "./announce";
import { applyAppearance } from "./appearance";
import { characters } from "./content";
import { configureSound } from "./sound";
import { defaultData, detectProfile, familyOf, load, newProfile, profileKey, save, type AppData } from "./store";

export type Screen =
  | { name: "welcome" }
  | { name: "load-problem" }
  | { name: "calibration" }
  | { name: "goal"; measuredWpm?: number; from: "test" | "skip" }
  | { name: "practice"; skipWarmup?: boolean }
  | { name: "results"; outcome: RoundOutcome; metrics: RoundMetrics; calibrationTest: boolean; explanation?: RoundExplanation | null; warmup?: boolean; records?: KeystrokeRecord[]; nemesisChange?: NemesisChange | null; creatureChanges?: CreatureChange[]; replayRank?: number | null; replay?: boolean }
  | { name: "shortcuts" }
  | { name: "progress"; returnTo?: Screen }
  | { name: "session" }
  | { name: "arcade" }
  | { name: "arcade-game"; mode: "falling" | "survival" }
  | { name: "race"; kind: "ghost" | "rival"; newText?: boolean }
  | { name: "collection"; returnTo?: Screen }
  | { name: "replays"; returnTo?: Screen }
  | { name: "replay"; list: "recent" | "best"; index: number; returnTo?: Screen }
  | { name: "daily" }
  | { name: "card"; returnTo?: Screen }
  | { name: "words"; id?: string; returnTo?: Screen }
  | { name: "passages"; kind: "code" | "quotes" }
  | { name: "settings"; returnTo?: Screen }
  | { name: "about"; returnTo?: Screen };

export interface ScreenView {
  el: HTMLElement;
  /** Called when the screen is replaced. */
  dispose?: () => void;
  /** Element to focus after showing, for keyboard and screen reader users. */
  focus?: HTMLElement;
}

export type ScreenRenderer = (app: App, screen: Screen) => ScreenView;

export class App {
  data: AppData;
  /** False once a save fails, so the UI can say progress isn't being kept. */
  saving = true;
  /**
   * Set when saved progress exists but couldn't be read (for example, an
   * older copy of the page meeting data from a newer one). Nothing is saved
   * until it's resolved, so the progress isn't overwritten.
   */
  loadProblem: { message: string; newer: boolean } | null = null;
  /** A one-time message for the next practice screen (for example, letters unlocked by the test). */
  notice: string | null = null;
  /** The screen showing now. */
  screen: Screen | null = null;
  /** Called after each screen change (for page-level extras such as the update banner). */
  onNavigate: ((screen: Screen) => void) | null = null;
  private root: HTMLElement;
  private current: ScreenView | null = null;
  private renderers: Partial<Record<Screen["name"], ScreenRenderer>> = {};

  constructor(root: HTMLElement) {
    this.root = root;
    const loaded = load();
    if (loaded.problem !== undefined) this.loadProblem = { message: loaded.problem, newer: loaded.newer };
    this.data = loaded.data ?? defaultData(detectProfile());
    // Creatures follow stats; catch them up quietly (saved data from before phase 5 has none yet).
    for (const p of Object.values(this.data.profiles)) if (p) updateCreatures(p, Date.now(), characters);
    this.applyLook();
  }

  /** Applies theme, color mode, accessibility and sound settings. */
  applyLook(): void {
    applyAppearance(this.data.settings);
    configureSound(this.data.settings.sound, this.data.settings.theme);
    configureAnnounce(this.data.settings.a11y.announce);
  }

  register(name: Screen["name"], renderer: ScreenRenderer): void {
    this.renderers[name] = renderer;
  }

  /** The active input profile's layout (letter arrangement). */
  get layout(): LayoutId {
    return familyOf(this.data.settings.layouts[this.data.settings.activeProfile]);
  }

  /** Where the active profile is saved: one per input profile and layout. */
  get profileKey(): string {
    return profileKey(this.data.settings.activeProfile, this.layout);
  }

  /** The active profile's state for its layout, created on first use. */
  get profile(): ProfileState {
    return (this.data.profiles[this.profileKey] ??= newProfile(this.data.settings.activeProfile, this.layout));
  }

  /** Whether the active profile still needs its first-launch setup. */
  get needsSetup(): boolean {
    const p = this.data.profiles[this.profileKey];
    return !p || p.calibration === "none" || p.goal === null;
  }

  persist(): void {
    if (this.loadProblem) return;
    this.saving = save(this.data);
  }

  /** Gives up on saved progress that can't be read and starts fresh (a copy stays in the browser). */
  startOver(): void {
    this.loadProblem = null;
    this.data = defaultData(detectProfile());
    this.persist();
    this.applyLook();
    this.home();
  }

  go(screen: Screen): void {
    this.current?.dispose?.();
    const render = this.renderers[screen.name];
    if (!render) throw new Error(`No screen named ${screen.name}`);
    this.screen = screen;
    const view = render(this, screen);
    this.current = view;
    this.root.replaceChildren(view.el);
    this.root.dataset.screen = screen.name;
    window.scrollTo(0, 0);
    (view.focus ?? (view.el.querySelector("h1") as HTMLElement | null))?.focus({ preventScroll: true });
    this.onNavigate?.(screen);
  }

  /** Goes to setup or practice, whichever the active profile needs. */
  home(): void {
    if (this.loadProblem) return this.go({ name: "load-problem" });
    const pending = this.data.pendingTest;
    if (this.needsSetup && pending?.profileKey === this.profileKey) return this.go({ name: "goal", measuredWpm: pending.wpm, from: "test" });
    this.go(this.needsSetup ? { name: "welcome" } : { name: "practice" });
  }
}
