// Challenge a friend: links, and the dialog that shares them.
import {
  challengeGhost,
  ChallengeError,
  cleanName,
  CHALLENGE_MAX_NAME,
  decodeChallenge,
  encodeChallenge,
  makeChallenge,
  replayEvents,
  type Challenge,
  type ChallengeSource,
  type TypingEvent,
  type TypingRound,
} from "../../engine/src";
import type { App } from "./app";
import { formatPercent, h, icon, ICONS } from "./dom";

/** Where a challenge goes in a link: after the #, so it never reaches a server. */
const LINK_PREFIX = "#c=";
/** Longer links make a QR code too dense to scan from a screen. */
const QR_MAX_LINK = 1800;

/** A finished round as a challenge, or null if it can't be raced (not finished). */
export function challengeFromRound(round: TypingRound, input: readonly TypingEvent[], source: ChallengeSource): Challenge | null {
  if (!round.done) return null;
  return makeChallenge(
    { target: round.target, errorMode: round.mode, catchUp: round.mode === "block" && round.catchUp, autoIndent: round.autoIndent, events: replayEvents(input) },
    source,
    "",
  );
}

export function challengeLink(ch: Challenge): string {
  return `${location.origin}${import.meta.env.BASE_URL}${LINK_PREFIX}${encodeChallenge(ch)}`;
}

export type LinkedChallenge = { challenge: Challenge; error?: undefined } | { challenge?: undefined; error: string };

/** The challenge in a page address's hash, if there is one. */
export function challengeInHash(hash: string): LinkedChallenge | null {
  if (!hash.startsWith(LINK_PREFIX)) return null;
  try {
    return { challenge: decodeChallenge(decodeURIComponent(hash.slice(LINK_PREFIX.length))) };
  } catch (e) {
    if (e instanceof ChallengeError) {
      return { error: e.newer ? "This challenge was made by a newer version of AdapType. Reload to update, then open the link again." : "This challenge link is damaged or cut off. Ask your friend to send it again." };
    }
    return { error: "This challenge link couldn't be read. Ask your friend to send it again." };
  }
}

/** A run's speed, accuracy and time, for telling a friend what to beat. */
export function runSummary(ch: Challenge): { wpm: number; accuracy: number; ms: number } {
  const ghost = challengeGhost(ch);
  return { wpm: ghost.metrics.wpm, accuracy: ghost.metrics.accuracy, ms: ghost.finishMs };
}

export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/**
 * A QR code as an SVG, dark on light whatever the theme (scanners need that),
 * or null when the link is too long. The QR library loads on first use.
 */
async function qrSvg(text: string): Promise<SVGSVGElement | null> {
  if (text.length > QR_MAX_LINK) return null;
  const { default: qrcode } = await import("qrcode-generator");
  let qr: ReturnType<typeof qrcode>;
  try {
    qr = qrcode(0, "L");
    qr.addData(text, "Byte");
    qr.make();
  } catch {
    return null;
  }
  const n = qr.getModuleCount();
  const quiet = 4;
  const size = n + quiet * 2;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("class", "qr-code");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "QR code for the challenge link");
  svg.setAttribute("shape-rendering", "crispEdges");
  const bg = document.createElementNS(ns, "rect");
  bg.setAttribute("width", String(size));
  bg.setAttribute("height", String(size));
  bg.setAttribute("fill", "#fff");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "#000");
  svg.append(bg, path);
  return svg;
}

/**
 * Opens the share dialog for a challenge: your name (optional, remembered),
 * then the share menu, Copy link, or a QR code.
 */
export function shareChallenge(app: App, base: Challenge, options: { title?: string; lead?: string } = {}): void {
  const settings = app.data.settings;
  const run = runSummary(base);
  const current = () => ({ ...base, name: cleanName(nameInput.value) });
  const status = h("p", { class: "fine share-status", role: "status" });
  const qrArea = h("div", { class: "qr-area" });
  const nameInput = h("input", { type: "text", id: "challenge-name", value: settings.challengeName, maxlength: String(CHALLENGE_MAX_NAME), autocomplete: "nickname", spellcheck: "false" }) as HTMLInputElement;
  nameInput.addEventListener("change", () => {
    settings.challengeName = cleanName(nameInput.value);
    nameInput.value = settings.challengeName;
    app.persist();
    if (qrButton.getAttribute("aria-expanded") === "true") void showQr();
  });

  const shareText = () => {
    const ch = current();
    return `${ch.name ? `${ch.name} challenges you` : "A typing challenge"}: can you beat ${Math.round(run.wpm)} WPM in ${seconds(run.ms)}? Race my ghost on AdapType.`;
  };
  const canShare = typeof navigator.share === "function";
  const shareButton = canShare
    ? h(
        "button",
        {
          type: "button",
          class: "button primary",
          onclick: async () => {
            try {
              await navigator.share({ title: "AdapType challenge", text: shareText(), url: challengeLink(current()) });
              status.textContent = "Sent.";
            } catch (e) {
              if ((e as Error).name !== "AbortError") status.textContent = "Couldn't open the share menu. Copy the link instead.";
            }
          },
        },
        icon([...ICONS.share]),
        "Share",
      )
    : null;
  const copyButton = h(
    "button",
    {
      type: "button",
      class: canShare ? "button" : "button primary",
      onclick: async () => {
        const link = challengeLink(current());
        try {
          await navigator.clipboard.writeText(link);
          status.textContent = "Link copied. Paste it in a message to your friend.";
        } catch {
          linkField.hidden = false;
          linkField.value = link;
          linkField.select();
          status.textContent = "Couldn't copy by itself. The link is selected below; copy it from there.";
        }
      },
    },
    icon([...ICONS.copy]),
    "Copy link",
  );
  const qrButton = h("button", { type: "button", class: "button", "aria-expanded": "false", onclick: () => (qrButton.getAttribute("aria-expanded") === "true" ? hideQr() : void showQr()) }, icon([...ICONS.qr]), "QR code");
  const linkField = h("textarea", { class: "link-field", readonly: true, rows: "3", "aria-label": "Challenge link", hidden: true }) as HTMLTextAreaElement;

  async function showQr(): Promise<void> {
    qrButton.setAttribute("aria-expanded", "true");
    let svg: SVGSVGElement | null = null;
    try {
      svg = await qrSvg(challengeLink(current()));
    } catch {
      qrArea.replaceChildren(h("p", { class: "fine" }, "Couldn't make a QR code. Share or copy the link instead."));
      return;
    }
    if (qrButton.getAttribute("aria-expanded") !== "true") return;
    qrArea.replaceChildren(svg ? h("div", { class: "qr-frame" }, svg) : h("p", { class: "fine" }, "This text is too long for a QR code. Share or copy the link instead."));
    if (svg) qrArea.append(h("p", { class: "fine" }, "Scan it with the camera on the phone next to you."));
  }
  function hideQr(): void {
    qrArea.replaceChildren();
    qrButton.setAttribute("aria-expanded", "false");
  }

  const closeButton = h("button", { type: "button", class: "icon-button", "aria-label": "Close", onclick: () => dialog.close() }, icon([...ICONS.close]));
  const dialog = h(
    "dialog",
    { class: "share-sheet", "aria-labelledby": "share-title" },
    h("div", { class: "menu-head" }, h("h2", { id: "share-title" }, options.title ?? "Challenge a friend"), closeButton),
    h(
      "p",
      null,
      options.lead ?? "Your friend races your ghost on the same text.",
      " ",
      h("strong", null, `To beat: ${Math.round(run.wpm)} WPM, ${formatPercent(run.accuracy)} accuracy, ${seconds(run.ms)}.`),
    ),
    h("div", { class: "field" }, h("label", { for: "challenge-name" }, "Your name ", h("span", { class: "fine" }, "(optional, shown to your friend)")), nameInput),
    h("div", { class: "actions wrap" }, shareButton, copyButton, qrButton),
    status,
    linkField,
    qrArea,
    h("p", { class: "fine" }, "The link holds the text and your keystrokes. Nothing goes through a server."),
  );
  // Keys typed here stay here: results screens listen on the window for Enter.
  dialog.addEventListener("keydown", (e) => e.stopPropagation());
  dialog.addEventListener("click", (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });
  const opener = document.activeElement as HTMLElement | null;
  dialog.addEventListener("close", () => {
    settings.challengeName = cleanName(nameInput.value);
    app.persist();
    dialog.remove();
    opener?.focus({ preventScroll: true });
  });
  document.body.append(dialog);
  dialog.showModal();
  (shareButton ?? copyButton).focus();
}

/**
 * A "Challenge a friend" button for a finished run, or null when the run
 * can't be raced. In a sticky action bar on a narrow screen it shows just
 * its icon (class "compact").
 */
export function challengeButton(app: App, ch: Challenge | null): HTMLElement | null {
  if (!ch) return null;
  return h(
    "button",
    { type: "button", class: "button compact", "aria-label": "Challenge a friend", title: "Challenge a friend", onclick: () => shareChallenge(app, ch) },
    icon([...ICONS.flag]),
    h("span", { class: "button-label" }, "Challenge a friend"),
  );
}
