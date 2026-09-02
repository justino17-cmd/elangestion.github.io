/* ELAN GESTION — Service Worker (mode hors-ligne) */
const CACHE = 'elan-gestion-v330';
const ASSETS = [
  './',
  'index.html',
  'elan.html',
  'espace.html',
  'messages.html',
  'app.html',
  'css/app.css',
  'data/data.js',
  'js/a11y-labels.js',
  'js/app.js',
  'manifest.webmanifest',
  'manifest-teamop.webmanifest',
  'manifest-opmsg.webmanifest',
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

// Stratégie : stale-while-revalidate.
//
// L'ancienne version faisait « réseau d'abord » avec cache:'no-store' sur les
// documents, ce qui contournait délibérément le cache HTTP : chaque navigation
// retéléchargeait la page en entier avant d'afficher quoi que ce soit. Sur le
// gros fichier applicatif, cela coûtait plusieurs centaines de kilo-octets à
// chaque ouverture, y compris quand rien n'avait changé.
//
// Ici, on répond immédiatement depuis le cache et on revalide en arrière-plan.
// L'intention d'origine — que les mises à jour arrivent vite — est préservée
// autrement : quand la revalidation ramène un contenu différent, on prévient
// les pages ouvertes (message 'sw-updated'), à charge pour l'app de proposer
// le rechargement.
function sameOrigin(req) {
  try { return new URL(req.url).origin === self.location.origin; } catch (_) { return false; }
}

async function notifyUpdated(url) {
  const ws = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const w of ws) w.postMessage({ type: 'sw-updated', url });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (!sameOrigin(req)) return;   // tiers (CDN, Firebase) : laissé au navigateur

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);

    const network = fetch(req).then(async res => {
      if (res && res.ok) {
        const before = cached ? await cached.clone().text().catch(() => null) : null;
        const copy = res.clone();
        await cache.put(req, res.clone()).catch(() => {});
        if (before !== null) {
          const after = await copy.text().catch(() => null);
          if (after !== null && after !== before) notifyUpdated(req.url).catch(() => {});
        }
      }
      return res;
    }).catch(() => null);

    // Cache d'abord quand on l'a ; sinon on attend le réseau ; en tout
    // dernier recours, la coquille de l'application.
    if (cached) { network.catch(() => {}); return cached; }
    const res = await network;
    return res || (await cache.match('app.html')) || Response.error();
  })());
});

/* ── Notifications push ── */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch (_) { d = { title: 'TeamOP', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'TeamOP', {
    body: d.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: d.url || '/app.html' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/app.html';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) { if ('focus' in w) { try { w.navigate(url); } catch (_) {} return w.focus(); } }
    return clients.openWindow(url);
  }));
});
