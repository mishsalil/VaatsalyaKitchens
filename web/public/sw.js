/* Vaatsalya Kitchens service worker.
   - Push + notification + subscription handlers (the inevitable-push layer;
     registered from src/main.tsx / PushManager on first visit).
   - Runtime caching so the shell + menu work offline after the first visit:
       navigation → network-first, fall back to cached index.html
       /assets/*, sw.js, manifest, favicon → stale-while-revalidate
       /api/menu → stale-while-revalidate (menu works offline)
       other /api/* (GET) → network-first; mutations are never cached
   No external dependencies; the same file serves in dev and the built app. */

const SHELL_CACHE = 'vk-shell-v1';
const ASSET_CACHE = 'vk-assets-v1';
const API_CACHE = 'vk-api-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  // Drop stale cache versions on activate.
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => ![SHELL_CACHE, ASSET_CACHE, API_CACHE].includes(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never cache or intercept mutations

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cross-origin (fonts, etc.) pass through

  // Navigation requests: network-first, offline → cached SPA shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          cache.put('/', fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const cached = await cache.match('/');
          if (cached) return cached;
          return new Response('You are offline and this page is not cached yet.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      })()
    );
    return;
  }

  const path = url.pathname;
  const isAsset = path.startsWith('/assets/') || ['/sw.js', '/manifest.webmanifest', '/favicon.svg'].includes(path);
  const isMenuApi = path === '/api/menu';

  if (isAsset || isMenuApi) {
    // Stale-while-revalidate.
    event.respondWith(
      (async () => {
        const cache = await caches.open(isMenuApi ? API_CACHE : ASSET_CACHE);
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => null);
        return cached || (await network) || new Response('Offline', { status: 503 });
      })()
    );
    return;
  }

  // Other same-origin GET /api/*: network-first, fall back to cache if offline.
  if (path.startsWith('/api/')) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            const cache = await caches.open(API_CACHE);
            cache.put(req, res.clone()).catch(() => {});
          }
          return res;
        } catch {
          const cache = await caches.open(API_CACHE);
          const cached = await cache.match(req);
          if (cached) return cached;
          return new Response(JSON.stringify({ error: 'You are offline.' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      })()
    );
  }
});

/* ---- Push ---- */
self.addEventListener('push', (event) => {
  let title = 'Vaatsalya Kitchens';
  let body = 'You have an update.';
  let url = '/';
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data === 'object') {
      if (data.title) title = data.title;
      if (data.body) body = data.body;
      if (data.url) url = data.url;
    } else if (event.data) {
      body = event.data.text();
    }
  } catch {
    if (event.data) body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      vibrate: [80, 40, 80],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          if ('navigate' in client) await client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })()
  );
});

/* The browser refreshed/expired the subscription — re-subscribe and sync. */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const reg = await self.registration;
      const oldEndpoint = event.oldSubscription && event.oldSubscription.endpoint;
      try {
        const newSub = await reg.pushManager.subscribe({ userVisibleOnly: true });
        await sendSubscription(newSub, oldEndpoint);
      } catch {
        if (oldEndpoint) await unsubscribeEndpoint(oldEndpoint).catch(() => {});
      }
    })()
  );
});

async function sendSubscription(subscription, oldEndpoint) {
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (oldEndpoint) await unsubscribeEndpoint(oldEndpoint).catch(() => {});
}

async function unsubscribeEndpoint(endpoint) {
  await fetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ endpoint }),
  });
}