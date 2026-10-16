// Installing AdapType as an app, and updating it: registers the service
// worker (production builds only), tells the app when a new version is ready,
// and keeps the browser's install prompt for the Settings button.

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let registration: ServiceWorkerRegistration | null = null;
let installPrompt: InstallPromptEvent | null = null;
let updateWaiting = false;
/** Set when we asked the new version to take over, so the switch reloads the page. */
let switching = false;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((fn) => fn());

/** Calls fn whenever the update or install state changes. Returns a function that stops it. */
export function onPwaChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True when a new version has downloaded and is waiting for a reload. */
export function updateReady(): boolean {
  return updateWaiting;
}

/** Switches to the waiting version (the page reloads), or reloads if there's none. */
export async function applyUpdate(): Promise<void> {
  const reg = registration;
  if (reg) {
    try {
      await reg.update();
    } catch {
      // Offline: use whatever is already waiting.
    }
    const waiting = reg.waiting;
    if (waiting) {
      switching = true;
      waiting.postMessage({ type: "skip-waiting" });
      return;
    }
  }
  location.reload();
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (switching) location.reload();
  });
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
      registration = reg;
      const waitFor = (worker: ServiceWorker | null) => {
        if (!worker) return;
        const check = () => {
          // Only an update counts: on the very first visit there's no older version to replace.
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            updateWaiting = true;
            notify();
          }
        };
        check();
        worker.addEventListener("statechange", check);
      };
      waitFor(reg.waiting);
      reg.addEventListener("updatefound", () => waitFor(reg.installing));
      // Check for a new version now and then, and when the app comes back to the front.
      setInterval(() => reg.update().catch(() => undefined), 60 * 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => undefined);
      });
    } catch {
      // No offline support in this browser (or private mode); the app still works online.
    }
  });
  if (isInstalled()) navigator.storage?.persist?.().catch(() => undefined);
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event as InstallPromptEvent;
  notify();
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  navigator.storage?.persist?.().catch(() => undefined);
  notify();
});

/** Running as an installed app (from the home screen or an app window). */
export function isInstalled(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** iPhone and iPad, where installing is done from Safari's Share menu. */
export function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** True when the browser offers its own install prompt (Chrome, Edge, Android). */
export function canPromptInstall(): boolean {
  return installPrompt !== null;
}

/** Shows the browser's install prompt. Returns true if it was accepted. */
export async function promptInstall(): Promise<boolean> {
  const prompt = installPrompt;
  if (!prompt) return false;
  installPrompt = null;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  notify();
  return outcome === "accepted";
}
