/* K.Town — offline support. The menu and staff screens open even when the connection drops.
   Pages: network first (always the newest menu when online). Files: served from the cache, refreshed in the background. */
const CACHE = 'ktown-1.0.1';
const CORE = [
  './', 'index.html', 'firebase-config.js', 'manifest.webmanifest',
  'assets/css/base.css?v=1.0.1', 'assets/css/guest.css?v=1.0.1',
  'assets/js/vendor/preact-htm.js?v=1.0.1', 'assets/js/vendor/qrcode.js?v=1.0.1',
  'assets/js/core/icons.js?v=1.0.1', 'assets/js/core/util.js?v=1.0.1', 'assets/js/core/i18n.js?v=1.0.1',
  'assets/js/core/brand.js?v=1.0.1', 'assets/js/core/seed.js?v=1.0.1', 'assets/js/core/store.js?v=1.0.1',
  'assets/js/core/qr.js?v=1.0.1', 'assets/js/core/ui.js?v=1.0.1', 'assets/js/views/guest.js?v=1.0.1', 'assets/js/app.js?v=1.0.1',
  'assets/fonts/jost-latin-wght-normal.woff2', 'assets/fonts/cormorant-garamond-latin-500-italic.woff2',
  'assets/img/photos/cover-sunset.webp', 'assets/img/icons/favicon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('ktown-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/googleapis\.com$/.test(url.hostname)) return; // live database traffic is never cached
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); if (res.ok) caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')).then((r) => r || caches.match('./'))));
    return;
  }
  // The live-mode switch must never be stale: always ask the network first
  if (url.origin === self.location.origin && url.pathname.endsWith('/firebase-config.js')) {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; }).catch(() => caches.match(req)));
    return;
  }
  const sameOrigin = url.origin === self.location.origin;
  const firebaseSdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (!sameOrigin && !firebaseSdk) return;
  e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => {
    const net = fetch(req).then((res) => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  })));
});
