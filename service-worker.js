/* Vaatsalya Kitchens service worker: push notifications + a small
   static-asset cache so the shell loads fast on repeat visits. */

const CACHE = "vk-static-v1";
const STATIC_ASSETS = ["css/style.css", "assets/logo.jpg", "assets/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first for the static assets above only; everything else goes to network.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  if (!STATIC_ASSETS.some((a) => url.pathname.endsWith("/" + a))) return;

  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request))
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Vaatsalya Kitchens", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Vaatsalya Kitchens", {
      body: data.body || "",
      icon: data.icon || "assets/icon-192.png",
      badge: data.icon || "assets/icon-192.png",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url || "/");
    })
  );
});
