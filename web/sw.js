// AdapType's service worker: keeps the app on the device so it works offline.
// The build fills in VERSION and PRECACHE (see vite.config.ts). A new version
// installs in the background and waits; the page asks before switching to it.

const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const CACHE = `adaptype-${VERSION}`;
const INDEX = new URL("index.html", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((path) => new URL(path, self.registration.scope).href))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("adaptype-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// The page sends this when you choose to reload into the new version.
self.addEventListener("message", (event) => {
  if (event.data?.type === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  // Pages always come from this version's copy, so the page and its files match.
  if (request.mode === "navigate") {
    event.respondWith(caches.match(INDEX, { cacheName: CACHE }).then((cached) => cached ?? fetch(request)));
    return;
  }
  // Files: this version's copy first. Anything not stored ahead (such as font
  // subsets for other alphabets) is stored the first time it's used.
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok && response.type === "basic") cache.put(request, response.clone());
            return response;
          }),
      ),
    ),
  );
});
