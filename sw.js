/* OP GESTION — Service Worker (mode hors-ligne) */
const CACHE = 'elan-gestion-v594';
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
  'icons/plan-msg-premium.png',
  'sons/message.mp3',
  'sons/appel.mp3'
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
    /* un canal d'urgence ET un appel entrant sonnent toujours */
    const urgent = d.urgent === true || /^(🚨|📞)/.test(String(d.title || ''));
    const muet = !urgent && enSilence(sil);
    const appel = /^📞/.test(String(d.title || ''));
    const opts = {
      body: d.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      silent: muet,
      data: { url: d.url || '/app.html', appel: appel }
    };
    if (appel) {
      /* un appel : la notification RESTE affichée jusqu'à ce qu'on réponde
         ou qu'on refuse, avec ses deux boutons — comme un vrai téléphone */
      opts.requireInteraction = true;
      opts.tag = 'opmsg-appel';
      opts.renotify = true;
      opts.vibrate = muet ? [] : [400, 200, 400, 200, 400];
      opts.actions = [
        { action: 'repondre', title: '📞 Répondre' },
        { action: 'refuser', title: '✕ Refuser' }
      ];
    } else if (!muet) {
      opts.vibrate = undefined;
    } else {
      opts.vibrate = [];
    }
    return self.registration.showNotification(d.title || 'TeamOP', opts);
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const dd = e.notification.data || {};
  /* « Refuser » : on n'ouvre rien, l'appel deviendra un appel manqué */
  if (e.action === 'refuser') return;
  let url = dd.url || '/app.html';
  /* « Répondre » ou clic sur la fiche d'appel : on ouvre l'application
     directement sur l'appel en cours */
  if (dd.appel) url = '/messages.html?appel=1';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) { if ('focus' in w) { try { w.navigate(url); } catch (_) {} return w.focus(); } }
    return clients.openWindow(url);
  }));
});
