import { fingerprint, type Fingerprint, type Trait } from "../../../engine/src";
import type { App, Screen, ScreenView } from "../app";
import { creatureSvg, STAGE_NAMES } from "../components/creature";
import { topBar } from "../components/topBar";
import { characters } from "../content";
import { formatPercent, h } from "../dom";
import { keyboardRows } from "../keyboardRows";

export const TRAIT_LABELS: Record<Trait, string> = {
  steady: "Steady rhythm",
  bursty: "Bursty rhythm",
  precise: "Precise",
  daring: "Fast and loose",
  fixer: "Fixes every slip",
  "presses-on": "Presses on",
  "at-goal": "At goal speed",
};

const W = 1200;
const HEIGHT = 675;

/** Colors from the current theme, so the card matches what you see. */
function palette() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    bg: v("--bg"),
    surface: v("--surface"),
    ink: v("--ink"),
    muted: v("--muted"),
    line: v("--line"),
    accent: v("--accent"),
    accentInk: v("--accent-ink"),
    accentSoft: v("--accent-soft"),
    heat: [v("--heat-strong"), v("--heat-ok"), v("--heat-weak"), v("--heat-weakest")],
    ui: getComputedStyle(document.body).fontFamily,
    mono: v("--font-mono"),
  };
}

/** Draws an inline SVG onto a canvas by copying its computed colors onto the elements first. */
async function svgImage(svg: SVGSVGElement): Promise<HTMLImageElement> {
  const holder = h("div", { class: "offscreen", "aria-hidden": "true" });
  holder.append(svg);
  document.body.append(holder);
  for (const node of [svg, ...svg.querySelectorAll<SVGElement>("*")]) {
    const s = getComputedStyle(node);
    for (const prop of ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "opacity", "font-family", "font-size", "font-weight"]) {
      node.setAttribute(prop, s.getPropertyValue(prop));
    }
  }
  const data = new XMLSerializer().serializeToString(svg);
  holder.remove();
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data)}`;
  await img.decode();
  return img;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, hh, r);
}

async function drawCard(canvas: HTMLCanvasElement, card: Fingerprint, goalWpm: number, rows: readonly (string | null)[][]): Promise<void> {
  await document.fonts.ready;
  const p = palette();
  const ctx = canvas.getContext("2d")!;
  canvas.width = W;
  canvas.height = HEIGHT;
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, HEIGHT);
  roundRect(ctx, 32, 32, W - 64, HEIGHT - 64, 28);
  ctx.fillStyle = p.surface;
  ctx.fill();
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = p.ink;
  ctx.font = `800 34px ${p.ui}`;
  ctx.fillText("Adap", 76, 104);
  const adap = ctx.measureText("Adap").width;
  ctx.fillStyle = p.accent;
  ctx.fillText("Type", 76 + adap, 104);
  ctx.fillStyle = p.muted;
  ctx.font = `600 22px ${p.ui}`;
  ctx.fillText(`TYPING FINGERPRINT · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}`, 76, 140);

  // Speed and accuracy.
  ctx.fillStyle = p.ink;
  ctx.font = `800 132px ${p.ui}`;
  const wpm = String(Math.round(card.wpm));
  ctx.fillText(wpm, 70, 290);
  const wpmW = ctx.measureText(wpm).width;
  ctx.font = `600 34px ${p.ui}`;
  ctx.fillStyle = p.muted;
  ctx.fillText("WPM", 82 + wpmW, 290);
  ctx.font = `600 30px ${p.ui}`;
  ctx.fillStyle = p.ink;
  ctx.fillText(`${formatPercent(card.accuracy)} accuracy · goal ${goalWpm} WPM`, 76, 340);

  // Traits as chips.
  let x = 76;
  let y = 372;
  ctx.font = `600 24px ${p.ui}`;
  for (const t of card.traits) {
    const label = TRAIT_LABELS[t];
    const w = ctx.measureText(label).width + 36;
    if (x + w > 640) {
      x = 76;
      y += 52;
    }
    roundRect(ctx, x, y, w, 42, 21);
    ctx.fillStyle = p.accentSoft;
    ctx.fill();
    ctx.fillStyle = p.accent;
    ctx.fillText(label, x + 18, y + 29);
    x += w + 10;
  }

  // Best and worst keys.
  const keyRow = (title: string, keys: string[], top: number, strong: boolean) => {
    ctx.fillStyle = p.muted;
    ctx.font = `600 20px ${p.ui}`;
    ctx.fillText(title.toUpperCase(), 76, top);
    keys.forEach((k, i) => {
      roundRect(ctx, 76 + i * 70, top + 14, 58, 58, 12);
      ctx.fillStyle = strong ? p.heat[0] : p.heat[3];
      ctx.fill();
      ctx.fillStyle = p.ink;
      ctx.font = `700 32px ${p.mono}`;
      ctx.textAlign = "center";
      ctx.fillText(k, 76 + i * 70 + 29, top + 54);
      ctx.textAlign = "left";
    });
    if (keys.length === 0) {
      ctx.fillStyle = p.muted;
      ctx.font = `400 22px ${p.ui}`;
      ctx.fillText("Not enough data yet", 76, top + 50);
    }
  };
  keyRow("Strongest keys", card.best, 466, true);
  keyRow("Needs work", card.worst, 556, false);

  // Mini heatmap.
  const kx = 690;
  const ky = 110;
  const size = 40;
  rows.forEach((row, r) => {
    row.forEach((k, i) => {
      if (k === null) return;
      const left = kx + r * (size * 0.5) + i * (size + 6);
      const top = ky + r * (size + 6);
      const w = card.heat[k];
      roundRect(ctx, left, top, size, size, 8);
      ctx.fillStyle = w === undefined ? p.bg : w < 0.25 ? p.heat[0] : w < 0.75 ? p.heat[1] : w < 1.5 ? p.heat[2] : p.heat[3];
      ctx.fill();
      ctx.fillStyle = w === undefined ? p.muted : p.ink;
      ctx.font = `600 20px ${p.mono}`;
      ctx.textAlign = "center";
      ctx.fillText(k, left + size / 2, top + 27);
      ctx.textAlign = "left";
    });
  });

  // Creatures.
  ctx.fillStyle = p.muted;
  ctx.font = `600 20px ${p.ui}`;
  ctx.fillText("MOST EVOLVED", 690, 300);
  if (card.creatures.length === 0) {
    ctx.font = `400 22px ${p.ui}`;
    ctx.fillText("No creatures met yet", 690, 340);
  }
  for (const [i, c] of card.creatures.entries()) {
    const img = await svgImage(creatureSvg(c.traits, c.stage, { size: 140, health: c.health, legend: c.key }));
    const left = 690 + i * 150;
    ctx.drawImage(img, left, 320, 140, 140);
    ctx.fillStyle = p.ink;
    ctx.font = `700 26px ${p.mono}`;
    ctx.textAlign = "center";
    ctx.fillText(c.key, left + 70, 500);
    ctx.fillStyle = p.muted;
    ctx.font = `500 20px ${p.ui}`;
    ctx.fillText(STAGE_NAMES[c.stage!], left + 70, 528);
    ctx.textAlign = "left";
  }
  ctx.fillStyle = p.muted;
  ctx.font = `400 20px ${p.ui}`;
  ctx.fillText(`From your last ${card.rounds} ${card.rounds === 1 ? "round" : "rounds"}`, 690, 600);
}

/** A shareable image of how you type. */
export function cardScreen(app: App, screen: Screen): ScreenView {
  const returnTo = screen.name === "card" ? screen.returnTo : undefined;
  const state = app.profile;
  const card = fingerprint(state, Date.now(), characters);
  const goalWpm = state.goal?.wpm ?? 40;
  const canvas = h("canvas", { class: "card-canvas", width: String(W), height: String(HEIGHT), role: "img" });
  const summary = [
    `${Math.round(card.wpm)} WPM, ${formatPercent(card.accuracy)} accuracy.`,
    card.traits.length ? `Traits: ${card.traits.map((t) => TRAIT_LABELS[t].toLowerCase()).join(", ")}.` : "",
    card.best.length ? `Strongest keys: ${card.best.join(" ")}. Needs work: ${card.worst.join(" ")}.` : "",
    card.creatures.length ? `Most evolved creatures: ${card.creatures.map((c) => `${c.key} (${STAGE_NAMES[c.stage!].toLowerCase()})`).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  canvas.setAttribute("aria-label", `Typing fingerprint card. ${summary}`);
  const status = h("p", { class: "fine", role: "status" });

  const blob = () => new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"));
  const fileName = "adaptype-fingerprint.png";
  const save = async () => {
    const url = URL.createObjectURL(await blob());
    const a = h("a", { href: url, download: fileName });
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = "Saved.";
  };
  const copy = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob() })]);
      status.textContent = "Copied. Paste it anywhere that takes images.";
    } catch {
      status.textContent = "This browser can't copy images. Use Save image instead.";
    }
  };
  const share = async () => {
    try {
      const file = new File([await blob()], fileName, { type: "image/png" });
      await navigator.share({ files: [file], title: "My typing fingerprint" });
    } catch (e) {
      if ((e as Error).name !== "AbortError") status.textContent = "Couldn't share. Use Save image instead.";
    }
  };
  const canShareFiles = (() => {
    try {
      return !!navigator.canShare?.({ files: [new File([""], fileName, { type: "image/png" })] });
    } catch {
      return false;
    }
  })();

  const main = h(
    "main",
    { class: "card-screen" },
    h("h1", { tabindex: "-1" }, "Fingerprint card"),
    h("p", { class: "lead" }, "How you type, on one image: speed, style, your strongest and weakest keys, and your most evolved creatures."),
    h("div", { class: "card-frame" }, canvas),
    h(
      "div",
      { class: "actions wrap" },
      canShareFiles ? h("button", { type: "button", class: "button primary", onclick: share }, "Share") : null,
      h("button", { type: "button", class: canShareFiles ? "button" : "button primary", onclick: save }, "Save image"),
      "ClipboardItem" in window ? h("button", { type: "button", class: "button", onclick: copy }, "Copy image") : null,
    ),
    status,
    h("p", { class: "fine" }, summary),
  );
  void drawCard(canvas, card, goalWpm, keyboardRows(state.layout));
  const el = h("div", { class: "screen" }, topBar(app, { back: () => (returnTo ? app.go(returnTo) : app.go({ name: "progress" })), backLabel: "Back" }), main);
  return { el };
}
