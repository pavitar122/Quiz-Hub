// Quiz Hub service worker
// Required for Chrome to treat "Add to Home screen" as a real install
// (rather than a plain bookmark shortcut that always opens a new tab).

const CACHE_VERSION = "quiz-hub-v4";
const CORE_ASSETS = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

// Network-first for page navigations (so content stays fresh),
// falling back to the cached shell when offline.
// Cache-first (stale-while-revalidate) for static assets.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API — dynamic/user-specific, must be network-only.
  // Previously we did event.respondWith(fetch(request)) which caused
  // "Failed to convert value to Response" when fetch rejected (offline).
  // By returning early we let the browser handle it natively.
  if (url.pathname.startsWith("/api/")) return;

  // Never intercept Next.js internals / HMR — in dev these are
  // versioned URLs like /_next/static/chunks/webpack.js?v=xxx and
  // hot-reloader requests. Caching them breaks Fast Refresh and
  // causes the exact "network error response: promise was rejected"
  // errors seen in the console. Let the browser fetch them directly.
  if (url.pathname.startsWith("/_next/")) return;
  if (url.pathname.startsWith("/__next")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          return networkResponse;
        } catch (err) {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match("/");
          if (fallback) return fallback;
          // Must return a real Response — returning undefined causes
          // "Failed to convert value to 'Response'" TypeError.
          return new Response("<h1>Offline</h1><p>App is offline and this page is not cached.</p>", {
            status: 503,
            statusText: "Offline",
            headers: { "Content-Type": "text/html" },
          });
        }
      })()
    );
    return;
  }

  // For everything else (icons, manifest, css, images): try cache first,
  // then network. Always return a Response — never undefined.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) {
        // Stale-while-revalidate: refresh cache in background without blocking
        fetch(request)
          .then((res) => {
            if (res && res.ok && res.type === "basic") {
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, res.clone()));
            }
          })
          .catch(() => {});
        return cached;
      }

      try {
        const networkResponse = await fetch(request);
        // Only cache successful basic responses
        if (networkResponse && networkResponse.ok && networkResponse.type === "basic") {
          const clone = networkResponse.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone)).catch(() => {});
        }
        return networkResponse;
      } catch (err) {
        // Both cache and network failed — return a synthetic error Response
        // instead of resolving to undefined (which throws TypeError).
        return new Response("", {
          status: 504,
          statusText: "Offline - not cached",
        });
      }
    })()
  );
});

// If the app is already open, focus/reuse that window instead of opening
// a new tab (extra safety net alongside manifest.json's launch_handler).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return self.clients.openWindow("/");
    })
  );
});
