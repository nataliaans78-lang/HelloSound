const CACHE_NAME = "echoglow-v5";
const scopePath = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const withScope = (path) => `${scopePath}${path}`;
const ASSETS = [
  withScope("/app/"),
  withScope("/app/index.html"),
  withScope("/manifest.webmanifest"),
  withScope("/icons/icon-192.png"),
  withScope("/icons/icon-512.png"),
  withScope("/icons/icon-512-maskable.png")
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : null))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
