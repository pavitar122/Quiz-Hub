// Quiz Hub service worker
// Required for Chrome to treat "Add to Home screen" as a real install
// (rather than a plain bookmark shortcut that always opens a new tab).

const CACHE_VERSION = "quiz-hub-v2";
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
// Cache-first for static assets.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses. They're dynamic and user-specific
  // (auth state, saved progress, etc.), so they must always be read
  // from the network. Previously these fell through to the generic
  // cache-first handler below, which meant /api/auth/me and
  // /api/progress could serve a stale cached response after reload
  // (e.g. showing a user as logged out, or showing old progress) even
  // though the cookie was still valid and progress had actually been
  // saved to the database.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((res) => res || caches.match("/")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request)
          .then((response) => {
            if (response && response.status === 200 && response.type === "basic") {
              const clone = response.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached)
    )
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
