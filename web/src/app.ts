import type { CreatureChange, KeystrokeRecord, NemesisChange, ProfileState, RoundExplanation, RoundOutcome } from "../../engine/src";
import type { RoundMetrics } from "../../engine/src/typing";
import { updateCreatures } from "../../engine/src";
import { characters } from "./content";
import { defaultData, detectProfile, load, newProfile, save, type AppData } from "./store";

export type Screen =
  | { name: "welcome" }
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
  /** A one-time message for the next practice screen (for example, letters unlocked by the test). */
  notice: string | null = null;
  private root: HTMLElement;
  private current: ScreenView | null = null;
  private renderers: Partial<Record<Screen["name"], ScreenRenderer>> = {};

  constructor(root: HTMLElement) {
    this.root = root;
    this.data = load() ?? defaultData(detectProfile());
    // Creatures follow stats; catch them up quietly (saved data from before phase 5 has none yet).
    for (const p of Object.values(this.data.profiles)) if (p) updateCreatures(p, Date.now(), characters);
  }

  register(name: Screen["name"], renderer: ScreenRenderer): void {
    this.renderers[name] = renderer;
  }

  /** The active input profile's state, created on first use. */
  get profile(): ProfileState {
    const key = this.data.settings.activeProfile;
    return (this.data.profiles[key] ??= newProfile(key));
  }

  /** Whether the active profile still needs its first-launch setup. */
  get needsSetup(): boolean {
    const p = this.data.profiles[this.data.settings.activeProfile];
    return !p || p.calibration === "none" || p.goal === null;
  }

  persist(): void {
    this.saving = save(this.data);
  }

  go(screen: Screen): void {
    this.current?.dispose?.();
    const render = this.renderers[screen.name];
    if (!render) throw new Error(`No screen named ${screen.name}`);
    const view = render(this, screen);
    this.current = view;
    this.root.replaceChildren(view.el);
    this.root.dataset.screen = screen.name;
    window.scrollTo(0, 0);
    (view.focus ?? (view.el.querySelector("h1") as HTMLElement | null))?.focus({ preventScroll: true });
  }

  /** Goes to setup or practice, whichever the active profile needs. */
  home(): void {
    this.go(this.needsSetup ? { name: "welcome" } : { name: "practice" });
  }
}
