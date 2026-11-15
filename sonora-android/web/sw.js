const CACHE = "sonora-shell-v10";
const BASE_URL = new URL("./", self.registration.scope);
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/audio/moonlit_drive.wav",
  "./assets/audio/small_hours.wav",
  "./assets/audio/blue_window.wav",
  "./assets/audio/sunday_light.wav",
  "./assets/audio/quiet_bloom.wav",
  "./assets/audio/soft_landing.wav",
  "./src/app.js",
  "./src/styles.css",
  "./src/data.js",
  "./src/utils.js",
  "./src/api/spotify.js",
  "./src/audio/engine.js",
  "./src/state/store.js",
  "./src/storage/database.js",
  "./src/ui/render.js",
  "./src/ui/lyrics.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then(async (cache) => {
    for (const asset of CORE) {
      try { await cache.add(new URL(asset, BASE_URL)); }
      catch (error) { console.warn(`Sonora could not cache ${asset} for offline use.`, error); }
    }
    await self.skipWaiting();
  }));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith("sonora-shell-") && key !== CACHE)
      .map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(BASE_URL.pathname)) return;
  event.respondWith(caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy))
          .catch((error) => console.warn("Sonora cache update failed.", error));
      }
      return response;
    }).catch((error) => {
      if (request.mode === "navigate") return caches.match(new URL("index.html", BASE_URL));
      throw error;
    });
  }));
});
