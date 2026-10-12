import {
  DAY_MS,
  DEFAULT_GOAL,
  drift,
  FINGERS,
  groupBreakdown,
  LETTERS,
  SCREEN_ZONES,
  THUMBS,
  topMissedWords,
  UNLOCK_ORDERS,
  wpmToMs,
  ZONES,
  type ErrorType,
  type GroupScore,
  type ProfileState,
} from "../../../engine/src";
import type { App, Screen, ScreenView } from "../app";
import { speedHistory } from "../components/charts";
import { topBar } from "../components/topBar";
import { formatPercent, h } from "../dom";
import { QWERTY_ROWS } from "../keyboardLayout";

/** Longer-term stats: speed, mistakes, reviews, keys, fingers or thumbs, and tap drift. */
export function progressScreen(app: App, screen: Screen): ScreenView {
  const returnTo = screen.name === "progress" ? screen.returnTo : undefined;
  const state = app.profile;
  const goal = state.goal ?? DEFAULT_GOAL;
  const practice = state.rounds.filter((r) => !r.calibration);

  const main = h(
    "main",
    { class: "progress" },
    h("h1", { tabindex: "-1" }, "Progress"),
    practice.length === 0
      ? h("p", { class: "lead" }, "Play a few rounds and your speed history, mistakes and reviews show up here.")
      : h(
          "section",
          { class: "panel" },
          h("h2", null, "Speed"),
          h("p", { class: "panel-lead" }, `Your last ${Math.min(30, practice.length)} rounds against your goal of ${goal.wpm} WPM. Hover a point for details.`),
          speedHistory(practice, goal.wpm),
        ),
    reviewsPanel(state),
    mistakesPanel(state),
    handsPanel(app, state),
    state.profile === "touch" ? driftPanel(state) : null,
    keysPanel(state),
  );
  const back = () => (returnTo ? app.go(returnTo) : app.home());
  const el = h("div", { class: "screen" }, topBar(app, { back, noSettings: true }), main);
  return { el };
}

function reviewsPanel(state: ProfileState): HTMLElement {
  const now = Date.now();
  const items = Object.values(state.reviews).sort((a, b) => a.due - b.due || (a.target < b.target ? -1 : 1));
  const when = (due: number, sessionRound: number | null) => {
    const rounds = state.session?.rounds ?? 0;
    if (sessionRound !== null && sessionRound > rounds) return `${sessionRound - rounds} ${sessionRound - rounds === 1 ? "round" : "rounds"} from now`;
    if (due <= now || (sessionRound !== null && sessionRound <= rounds)) return "due now";
    const days = Math.ceil((due - now) / DAY_MS);
    return days === 1 ? "tomorrow" : `in ${days} days`;
  };
  const label = { key: "key", pair: "pair", word: "word" } as const;
  return h(
    "section",
    { class: "panel" },
    h("h2", null, "Review schedule"),
    items.length === 0
      ? h("p", { class: "panel-lead" }, "Nothing to review. Missed keys, letter pairs and words show up here and come back on a growing schedule: tomorrow, then in 3 days, a week, two weeks and a month.")
      : h(
          "div",
          null,
          h("p", { class: "panel-lead" }, `${items.length} ${items.length === 1 ? "item" : "items"}. Each success pushes it further out; a miss brings it back sooner.`),
          h(
            "ul",
            { class: "schedule" },
            items.slice(0, 24).map((item) =>
              h("li", null, h("span", { class: "sched-target" }, item.target), h("span", { class: "sched-kind" }, label[item.kind]), h("span", { class: "sched-when" }, when(item.due, item.sessionRound))),
            ),
          ),
          items.length > 24 ? h("p", { class: "fine" }, `And ${items.length - 24} more.`) : null,
        ),
  );
}

function mistakesPanel(state: ProfileState): HTMLElement | null {
  const missed = topMissedWords(state, 12);
  const totals: Partial<Record<ErrorType, number>> = {};
  for (const counts of Object.values(state.errorCounts)) {
    for (const [t, n] of Object.entries(counts)) totals[t as ErrorType] = (totals[t as ErrorType] ?? 0) + (n ?? 0);
  }
  const names: Record<ErrorType, string> = { swap: "Swaps", neighbor: "Neighbor keys", double: "Extra doubles", "missed-double": "Missed doubles", skipped: "Skipped letters", case: "Wrong capitals", other: "Other" };
  const typeRows = (Object.keys(names) as ErrorType[]).filter((t) => totals[t]).map((t) => h("li", null, h("span", null, names[t]), h("span", { class: "num" }, String(totals[t]))));
  if (missed.length === 0 && typeRows.length === 0) return null;
  return h(
    "section",
    { class: "panel" },
    h("h2", null, "Mistakes"),
    missed.length
      ? h("div", null, h("h3", null, "Most-missed words"), h("ul", { class: "word-chips" }, missed.map((m) => h("li", null, m.word, h("span", { class: "num" }, `${m.misses}×`)))))
      : null,
    typeRows.length ? h("div", null, h("h3", null, "Error types"), h("ul", { class: "count-list" }, typeRows)) : null,
  );
}

/** Bars on a fixed scale (a score of 2 fills the bar), so "all at goal" looks like it. */
function groupList(groups: GroupScore[], unit: string): HTMLElement {
  const max = 2;
  return h(
    "ul",
    { class: "group-list" },
    groups.map((g, i) =>
      h(
        "li",
        { class: i === 0 ? "weakest" : "" },
        h("span", { class: "group-name" }, g.name),
        h("span", { class: "meter" }, h("span", { style: { width: `${Math.round(Math.min(1, g.score / max) * 100)}%` } })),
        h("span", { class: "num" }, `${g.samples} ${unit}`),
      ),
    ),
  );
}

function groupLead(groups: GroupScore[]): string {
  if (groups[0].score < 0.25) return "All of them are at your goal. Longer bars would mean weaker spots.";
  return `Weakest first: ${groups[0].name.toLowerCase()} needs the most work. Longer bars are weaker.`;
}

function handsPanel(app: App, state: ProfileState): HTMLElement | null {
  const goal = state.goal ?? DEFAULT_GOAL;
  if (state.profile === "touch") {
    const grip = state.session?.grip ?? "two";
    const keys = state.gripKeys[grip] ?? {};
    const groups = groupBreakdown(grip === "two" ? THUMBS : SCREEN_ZONES, keys, goal);
    if (groups.length === 0) return null;
    return h(
      "section",
      { class: "panel" },
      h("h2", null, grip === "two" ? "Thumbs" : "Screen zones"),
      h("p", { class: "panel-lead" }, `${grip === "two" ? "Two-thumb" : "One-thumb"} grip. ${groupLead(groups)}`),
      groupList(groups, "presses"),
    );
  }
  const groups = groupBreakdown(state.touchTyping ? FINGERS : ZONES, state.keys, goal);
  if (groups.length === 0) return null;
  const ask =
    state.touchTyping === null
      ? h(
          "p",
          { class: "fine" },
          "Showing keyboard zones. If you touch-type, ",
          h("a", { href: "#", onclick: (e: Event) => { e.preventDefault(); state.touchTyping = true; app.persist(); app.go({ name: "progress" }); } }, "switch to fingers"),
          ".",
        )
      : null;
  return h(
    "section",
    { class: "panel" },
    h("h2", null, state.touchTyping ? "Fingers" : "Keyboard zones"),
    h("p", { class: "panel-lead" }, groupLead(groups)),
    groupList(groups, "presses"),
    ask,
  );
}

/** Where taps land on each key compared with its center. */
function driftPanel(state: ProfileState): HTMLElement | null {
  const grip = state.session?.grip;
  const taps = (grip && state.gripTaps[grip]) || state.taps;
  const rows = QWERTY_ROWS.map((row, i) =>
    h(
      "div",
      { class: `heat-row row-${i}` },
      [...row].map((letter) => {
        const d = drift(taps[letter]);
        const dot = d && d.taps >= 3 ? h("span", { class: d.offset > 0.22 ? "drift-dot far" : "drift-dot", style: { left: `${50 + Math.max(-45, Math.min(45, d.dx * 100))}%`, top: `${50 + Math.max(-45, Math.min(45, d.dy * 100))}%` } }) : null;
        const label = d ? `${letter}: average tap ${Math.round(Math.abs(d.dx) * 100)}% ${d.dx >= 0 ? "right" : "left"}, ${Math.round(Math.abs(d.dy) * 100)}% ${d.dy >= 0 ? "low" : "high"}, ${d.taps} taps` : `${letter}: no taps yet`;
        return h("div", { class: "drift-key", title: label, "aria-label": label, role: "listitem" }, h("span", { class: "drift-letter" }, letter), dot);
      }),
    ),
  );
  const any = LETTERS.split("").some((l) => (taps[l]?.length ?? 0) >= 3);
  if (!any) return null;
  return h(
    "section",
    { class: "panel" },
    h("h2", null, "Tap drift"),
    h("p", { class: "panel-lead" }, "Each dot is your average tap on that key. Red dots are far from center; those keys get extra practice."),
    h("div", { class: "drift-map", role: "list", "aria-label": "Average tap position per key" }, rows),
  );
}

function keysPanel(state: ProfileState): HTMLElement | null {
  const goal = state.goal ?? DEFAULT_GOAL;
  const goalMs = wpmToMs(goal.wpm);
  const letters = [...UNLOCK_ORDERS[state.unlockOrder]].filter((l) => state.keys[l]?.n);
  if (letters.length === 0) return null;
  const trend = (l: string) => {
    const hist = state.keyHistory[l] ?? [];
    if (hist.length < 2) return "";
    const ms = (e: { msTotal: number; msN: number }) => (e.msN ? e.msTotal / e.msN : null);
    const first = ms(hist[0]);
    const last = ms(hist[hist.length - 1]);
    if (first === null || last === null) return "";
    return last < first * 0.95 ? "faster" : last > first * 1.05 ? "slower" : "steady";
  };
  return h(
    "section",
    { class: "panel" },
    h("h2", null, "Keys"),
    h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        { class: "keys-table" },
        h("thead", null, h("tr", null, h("th", { scope: "col" }, "Key"), h("th", { scope: "col" }, "Presses"), h("th", { scope: "col" }, "Accuracy"), h("th", { scope: "col" }, "Avg time"), h("th", { scope: "col" }, "Pauses"), h("th", { scope: "col" }, "Lately"))),
        h(
          "tbody",
          null,
          letters.map((l) => {
            const k = state.keys[l];
            const hes = state.hesitations[l];
            return h(
              "tr",
              null,
              h("th", { scope: "row" }, l),
              h("td", null, String(k.n)),
              h("td", { class: 1 - k.errAvg < goal.accuracy ? "below" : "" }, formatPercent(1 - k.errAvg)),
              h("td", { class: k.timedN && k.msAvg > goalMs ? "below" : "" }, k.timedN ? `${Math.round(k.msAvg)} ms` : "–"),
              h("td", null, hes && hes.n >= 5 ? formatPercent(hes.errAvg) : "–"),
              h("td", null, trend(l)),
            );
          }),
        ),
      ),
    ),
    h("p", { class: "fine" }, `Goal: ${Math.round(goalMs)} ms per key and ${formatPercent(goal.accuracy)} accuracy. Values short of the goal are marked.`),
  );
}
