/* OP GESTION — Service Worker (mode hors-ligne) */
const CACHE = 'elan-gestion-v553';
const ASSETS = [
  './',
  'index.html',
  'applications.html',
  'elan.html',
  'opmessages.html',
  'metiers.html',
  'tarifs.html',
  'pourquoi.html',
  'creer.html',
  'recap-abonnement.html',
  'mentions-legales.html',
  'merci.html',
  'espace.html',
  'messages.html',
  'app.html',
  'fond-anime-teamop.js',
  'manifest.webmanifest',
  'manifest-teamop.webmanifest',
  'manifest-opmsg.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/plan-gestion.png',
  'icons/plan-gestion-pro.png',
  'icons/plan-gestion-business.png',
  'icons/plan-gestion-premium.png',
  'icons/plan-msg.png',
  'icons/plan-msg-pro.png',
  'icons/plan-msg-premium.png'
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
  // tour.html (Tour de contrôle, page privée) : jamais mise en cache, toujours fraîche
  if (new URL(req.url).pathname.endsWith('/tour.html')) return;
  // Stratégie : réseau d'abord, repli sur le cache (utile hors-ligne)
  // Pour les pages HTML : on contourne aussi le cache HTTP du navigateur
  // afin que les mises à jour arrivent immédiatement.
  const isDoc = req.mode === 'navigate' || req.destination === 'document';
  e.respondWith(
    fetch(isDoc ? new Request(req.url, { cache: 'no-store' }) : req)
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

/* ── Notifications push ── */
/* Heures de silence : réglage posé par OP MESSAGES dans une petite base
   locale — la seule mémoire lisible ici, application fermée. Pendant la
   plage choisie la notification arrive SANS son ni vibration. */
function lireSilence() {
  return new Promise(res => {
    try {
      const o = indexedDB.open('opmsg_prefs', 1);
      o.onupgradeneeded = e => { const db = e.target.result; if (!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs'); };
      o.onerror = () => res(null);
      o.onsuccess = e => {
        const db = e.target.result;
        try {
          const r = db.transaction('prefs', 'readonly').objectStore('prefs').get('silence');
          r.onsuccess = () => res(r.result || null);
          r.onerror = () => res(null);
        } catch (_) { res(null); }
      };
    } catch (_) { res(null); }
  });
}
function enSilence(v) {
  if (!v || !v.on) return false;
  const n = new Date(), m = n.getHours() * 60 + n.getMinutes();
  const p = t => { const x = String(t || '').split(':'); return (+x[0] || 0) * 60 + (+x[1] || 0); };
  const de = p(v.de), a = p(v.a);
  return de <= a ? (m >= de && m < a) : (m >= de || m < a);
}
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch (_) { d = { title: 'TeamOP', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(lireSilence().then(sil => {
    /* un canal d'urgence sonne toujours, silence ou pas */
    const urgent = d.urgent === true || /^🚨/.test(String(d.title || ''));
    const muet = !urgent && enSilence(sil);
    return self.registration.showNotification(d.title || 'TeamOP', {
      body: d.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      silent: muet,
      vibrate: muet ? [] : undefined,
      data: { url: d.url || '/app.html' }
    });
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
