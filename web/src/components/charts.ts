// Small single-series charts: the rhythm graph and the speed history.
// Marks use the accent; stalls use the error color plus a label; text uses text colors.
import type { KeystrokeRecord, Rhythm, RoundSummary } from "../../../engine/src";
import { h } from "../dom";

const NS = "http://www.w3.org/2000/svg";

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, ...children: (Node | string)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(c);
  return el;
}

/** Drawing width close to the space the chart gets, so text in the chart stays near its real size on phones. */
function chartWidth(): number {
  return Math.round(Math.min(640, Math.max(300, (typeof window === "undefined" ? 640 : window.innerWidth) - 80)));
}

function title(text: string): SVGTitleElement {
  const t = document.createElementNS(NS, "title");
  t.textContent = text;
  return t;
}

/**
 * The gap before each keystroke as a bar, so stalls stand out. A dashed line
 * marks the goal pace. Hover a bar for its key and time.
 */
export function rhythmGraph(r: Rhythm, records: readonly KeystrokeRecord[], goalMs: number): HTMLElement {
  const W = chartWidth();
  const H = 140;
  const pad = { top: 18, right: 8, bottom: 20, left: 40 };
  // At least 3 px per bar: on narrow screens the graph shows the most recent keystrokes.
  const shown = r.intervals.slice(-Math.min(160, Math.floor((W - pad.left - pad.right) / 3)));
  const stalls = new Set(r.stalls);
  const top = Math.max(goalMs * 1.6, ...shown.map((x) => x.ms));
  const maxMs = Math.min(2000, Math.ceil(top / 100) * 100);
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const step = plotW / Math.max(1, shown.length);
  const gap = step > 6 ? 2 : 1;
  const barW = Math.max(1, step - gap);
  const y = (ms: number) => pad.top + plotH - (Math.min(ms, maxMs) / maxMs) * plotH;

  const chart = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": `Gap before each keystroke. ${r.stalls.length} stalls.` });
  // Recessive grid: baseline and the top value.
  chart.append(
    svg("line", { x1: pad.left, x2: W - pad.right, y1: y(0), y2: y(0), class: "axis" }),
    svg("text", { x: pad.left - 6, y: y(0) + 4, class: "tick", "text-anchor": "end" }, "0"),
    svg("text", { x: pad.left - 6, y: y(maxMs) + 4, class: "tick", "text-anchor": "end" }, `${maxMs}`),
    svg("text", { x: pad.left, y: pad.top - 8, class: "tick" }, "milliseconds before each key"),
  );
  shown.forEach((x, i) => {
    const rec = records[x.record];
    const height = Math.max(1, y(0) - y(x.ms));
    const stall = stalls.has(x.record);
    const key = rec?.expected === " " ? "space" : rec?.expected ?? "";
    const bar = svg("rect", {
      x: pad.left + i * step,
      y: y(0) - height,
      width: barW,
      height,
      rx: Math.min(2, barW / 2),
      class: stall ? "bar stall" : "bar",
    });
    bar.append(title(`${key}: ${Math.round(x.ms)} ms${stall ? " (stall)" : ""}${x.ms > maxMs ? `, shown cut off at ${maxMs}` : ""}`));
    chart.append(bar);
  });
  chart.append(
    svg("line", { x1: pad.left, x2: W - pad.right, y1: y(goalMs), y2: y(goalMs), class: "goal-line" }),
    svg("text", { x: W - pad.right, y: y(goalMs) - 5, class: "tick", "text-anchor": "end" }, `goal pace ${Math.round(goalMs)} ms`),
  );
  return h("div", { class: "chart-wrap" }, chart);
}

/** WPM of recent rounds against the goal, with the latest value labeled. Hover a point for its round. */
export function speedHistory(rounds: readonly RoundSummary[], goalWpm: number): HTMLElement {
  const W = chartWidth();
  const H = 170;
  const pad = { top: 20, right: 52, bottom: 22, left: 40 };
  const list = rounds.slice(-30);
  const maxWpm = Math.ceil(Math.max(goalWpm * 1.2, ...list.map((r) => r.wpm)) / 10) * 10;
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (list.length <= 1 ? plotW : (i / (list.length - 1)) * plotW);
  const y = (v: number) => pad.top + plotH - (v / maxWpm) * plotH;

  const chart = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": `Speed over your last ${list.length} rounds, against a goal of ${goalWpm} WPM.` });
  for (const v of [0, maxWpm / 2, maxWpm]) {
    chart.append(
      svg("line", { x1: pad.left, x2: pad.left + plotW, y1: y(v), y2: y(v), class: v === 0 ? "axis" : "grid" }),
      svg("text", { x: pad.left - 6, y: y(v) + 4, class: "tick", "text-anchor": "end" }, String(Math.round(v))),
    );
  }
  chart.append(
    svg("line", { x1: pad.left, x2: pad.left + plotW, y1: y(goalWpm), y2: y(goalWpm), class: "goal-line" }),
    svg("text", { x: pad.left + 4, y: y(goalWpm) - 5, class: "tick" }, `goal ${goalWpm}`),
  );
  if (list.length > 0) {
    const points = list.map((r, i) => `${x(i).toFixed(1)},${y(r.wpm).toFixed(1)}`);
    chart.append(
      svg("path", { d: `M${pad.left},${y(0)} L${points.join(" L")} L${x(list.length - 1)},${y(0)} Z`, class: "area" }),
      svg("polyline", { points: points.join(" "), class: "line" }),
    );
    list.forEach((r, i) => {
      const last = i === list.length - 1;
      const dot = svg("circle", { cx: x(i), cy: y(r.wpm), r: last ? 5 : 3.5, class: last ? "dot end" : "dot" });
      dot.append(title(`${Math.round(r.wpm)} WPM, ${Math.round(r.accuracy * 100)}% accurate${r.warmup ? " (warm-up)" : ""}`));
      chart.append(dot);
    });
    const lastR = list[list.length - 1];
    chart.append(svg("text", { x: x(list.length - 1) + 9, y: y(lastR.wpm) + 4, class: "value" }, `${Math.round(lastR.wpm)}`));
  }
  return h("div", { class: "chart-wrap" }, chart);
}
