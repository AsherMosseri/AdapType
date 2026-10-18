import { DEFAULT_GOAL, type ArcadeMode, type LivesMode, type ScoreEntry } from "../../../engine/src";
import type { App, ScreenView } from "../app";
import { nemesisFace } from "../components/nemesisFace";
import { topBar } from "../components/topBar";
import { formatPercent, h } from "../dom";

const MODES: { id: ArcadeMode; title: string; body: string }[] = [
  { id: "falling", title: "Falling words", body: "Words drop from the top. Start typing any of them and the game locks on. Three lives; a boss every fifth level." },
  { id: "survival", title: "Survival", body: "Falling words that keep speeding up until you break. Pick how you can lose below." },
  { id: "ghost", title: "Ghost race", body: "Race your own best run on the same text. Beat it and your run becomes the new ghost." },
  { id: "rival", title: "Rival", body: "Race an opponent through adaptive text. Pick how fast it runs below." },
  { id: "rhythm", title: "Rhythm", body: "Words scroll to a beat. Type each letter as it crosses the line; keep the combo going and the tempo climbs." },
];

const LIVES: { id: LivesMode; label: string; hint: string }[] = [
  { id: "lives", label: "3 lives", hint: "Lose one for each word that lands or three errors in a row." },
  { id: "health", label: "Health bar", hint: "Errors chip away, clean words heal a little." },
  { id: "hardcore", label: "Hardcore", hint: "One mistake ends it." },
];

/** Arcade: the four modes with best scores, their settings, and the nemesis. */
export function arcadeScreen(app: App): ScreenView {
  const state = app.profile;
  const settings = app.data.settings;
  const best = (mode: ArcadeMode): ScoreEntry | undefined => state.arcade.scores[mode]?.[0];

  const modeCard = (m: (typeof MODES)[number]) => {
    const top = best(m.id);
    const scoreText = !top
      ? "No score yet"
      : m.id === "ghost" || m.id === "rival"
        ? `Best ${Math.round(top.wpm)} WPM, ${formatPercent(top.accuracy)}`
        : `Best ${top.score.toLocaleString()} points, level ${top.level}`;
    const play = () =>
      m.id === "falling" || m.id === "survival" ? app.go({ name: "arcade-game", mode: m.id }) : m.id === "rhythm" ? app.go({ name: "rhythm" }) : app.go({ name: "race", kind: m.id });
    let extra: HTMLElement | null = null;
    if (m.id === "survival") {
      extra = segmented("lives", LIVES.map((l) => ({ id: l.id, label: l.label, hint: l.hint })), settings.arcadeLives, (v) => {
        settings.arcadeLives = v as LivesMode;
        app.persist();
      });
    } else if (m.id === "rival") {
      const custom = h("input", { type: "number", id: "rival-wpm", min: "10", max: "200", step: "5", value: String(settings.rivalPace.kind === "custom" ? settings.rivalPace.wpm : (state.goal ?? DEFAULT_GOAL).wpm), "aria-label": "Rival speed in WPM", class: "wpm-input" });
      custom.addEventListener("change", () => {
        const wpm = Math.min(200, Math.max(10, Math.round(Number(custom.value)) || 40));
        custom.value = String(wpm);
        settings.rivalPace = { kind: "custom", wpm };
        app.persist();
      });
      extra = h(
        "div",
        { class: "rival-pace" },
        segmented(
          "rival",
          [
            { id: "ahead", label: "Just ahead", hint: "About 5% faster than you, catching up if you pull away." },
            { id: "goal", label: "At goal", hint: `Races at your goal, ${(state.goal ?? DEFAULT_GOAL).wpm} WPM.` },
            { id: "custom", label: "Custom", hint: "A speed you pick." },
          ],
          settings.rivalPace.kind,
          (v) => {
            settings.rivalPace = v === "custom" ? { kind: "custom", wpm: Number(custom.value) || 40 } : { kind: v as "ahead" | "goal" };
            app.persist();
            app.go({ name: "arcade" });
          },
        ),
        settings.rivalPace.kind === "custom" ? h("label", { class: "inline-field", for: "rival-wpm" }, custom, " WPM") : null,
      );
    } else if (m.id === "ghost" && state.arcade.ghost) {
      extra = h(
        "p",
        { class: "fine" },
        `Your ghost: ${Math.round(state.arcade.ghost.wpm)} WPM. `,
        h("a", { href: "#", onclick: (e: Event) => { e.preventDefault(); app.go({ name: "race", kind: "ghost", newText: true }); } }, "Race on new text"),
      );
    }
    return h(
      "section",
      { class: "panel mode-card" },
      h("div", { class: "mode-head" }, h("h2", null, m.title), h("span", { class: "mode-best" }, scoreText)),
      h("p", null, m.body),
      extra,
      h("div", { class: "actions" }, h("button", { type: "button", class: "button primary", onclick: play }, "Play")),
      scoreList(state.arcade.scores[m.id] ?? [], m.id),
    );
  };

  const nemesis = state.arcade.nemesis;
  const nemesisCard = h(
    "section",
    { class: "panel nemesis-card" },
    h("h2", null, "Your nemesis"),
    nemesis
      ? h(
          "div",
          { class: "nemesis" },
          nemesisFace(nemesis, 88),
          h(
            "div",
            null,
            h("p", { class: "nemesis-name" }, nemesis.name),
            h("p", null, `Your weakest key, ${nemesis.key}, since ${new Date(nemesis.since).toLocaleDateString()}. It shows up as every other boss. Get ${nemesis.key} to your goal to defeat it.`),
          ),
        )
      : h("p", { class: "panel-lead" }, "No nemesis yet. Once a key stays well short of your goal for a while, it becomes a character you can defeat."),
    state.arcade.hall.length ? h("p", { class: "fine" }, `${state.arcade.hall.length} defeated so far. See them in Progress.`) : null,
  );

  const el = h(
    "div",
    { class: "screen" },
    topBar(app, { back: () => app.go({ name: "practice" }), backLabel: "Practice" }),
    h(
      "main",
      { class: "arcade" },
      h("h1", { tabindex: "-1" }, "Arcade"),
      h("p", { class: "lead" }, "Games that still learn from you: words lean on your weak keys, and your typing here counts toward your stats at half weight."),
      nemesisCard,
      h("div", { class: "mode-grid" }, MODES.map(modeCard)),
    ),
  );
  return { el };
}

function segmented(name: string, choices: { id: string; label: string; hint: string }[], selected: string, onChange: (id: string) => void): HTMLElement {
  const hint = h("p", { class: "fine" }, choices.find((c) => c.id === selected)?.hint ?? "");
  return h(
    "div",
    { class: "field" },
    h(
      "div",
      { class: "segmented", role: "radiogroup", "aria-label": name },
      choices.map((c) => {
        const id = `${name}-${c.id}`;
        const input = h("input", { type: "radio", name, id, checked: c.id === selected });
        input.addEventListener("change", () => {
          hint.textContent = c.hint;
          onChange(c.id);
        });
        return h("label", { for: id }, input, h("span", null, c.label));
      }),
    ),
    hint,
  );
}

function scoreList(list: ScoreEntry[], mode: ArcadeMode): HTMLElement | null {
  if (list.length < 2) return null;
  const race = mode === "ghost" || mode === "rival";
  return h(
    "details",
    { class: "score-list" },
    h("summary", null, "Top scores"),
    h(
      "ol",
      null,
      list.map((e) =>
        h(
          "li",
          null,
          h("span", { class: "num" }, race ? `${Math.round(e.wpm)} WPM` : e.score.toLocaleString()),
          h("span", { class: "fine" }, race ? formatPercent(e.accuracy) : `level ${e.level}${e.lives ? `, ${e.lives}` : ""}`),
          h("span", { class: "fine" }, new Date(e.at).toLocaleDateString()),
        ),
      ),
    ),
  );
}
