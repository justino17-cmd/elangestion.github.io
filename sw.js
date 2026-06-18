/* ELAN GESTION — Service Worker (mode hors-ligne) */
const CACHE = 'elan-gestion-v54';
const ASSETS = [
  'app.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Stratégie : réseau d'abord, repli sur le cache (utile hors-ligne)
  e.respondWith(
    fetch(req)
      .then(res => {
        const url = new URL(req.url);
        if (url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('app.html')))
  );
});
