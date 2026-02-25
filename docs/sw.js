const CACHE_NAME = "echoglow-v2";
const ASSETS = [
  "/EchoGlow/app/",
  "/EchoGlow/app/index.html",
  "/EchoGlow/manifest.webmanifest",
  "/EchoGlow/icons/icon-192.png",
  "/EchoGlow/icons/icon-512.png",
  "/EchoGlow/icons/icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const results = await Promise.allSettled(
      ASSETS.map((url) => cache.add(url))
    );
    results.forEach((r, i) => {
      if (r.status === "rejected") console.warn("SW cache failed:", ASSETS[i], r.reason);
    });
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  const isHtmlOrCss =
    req.mode === "navigate" || url.pathname.endsWith(".css");

  if (isHtmlOrCss) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
