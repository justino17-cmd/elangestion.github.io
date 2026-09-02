/* OP GESTION — Service Worker (mode hors-ligne) */
const CACHE = 'elan-gestion-v751';
const ASSETS = [
  './',
  'index.html',
  'connexion.html',
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

/* Précache ressource par ressource : une coupure sur un fichier ne vide pas tout le cache. */
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(ASSETS.map(a => c.add(a).catch(() => {})))));
});

/* À l'activation : ce qui manque dans le nouveau cache est repris de l'ancien (jamais d'appareil
   sans copie hors ligne), puis l'ancien est supprimé. */
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    let neuf = null; try { neuf = await caches.open(CACHE); } catch (_) {}
    for (const k of keys) {
      if (k === CACHE) continue;
      try {
        if (neuf) {
          const vieux = await caches.open(k);
          for (const r of await vieux.keys()) {
            if (await neuf.match(r)) continue;
            const rep = await vieux.match(r);
            if (rep) await neuf.put(r, rep);
          }
        }
      } catch (_) {}
      try { await caches.delete(k); } catch (_) {}
    }
    await self.clients.claim();
  })());
});

/* Prévenir les onglets ouverts qu'une version plus fraîche est arrivée. */
function annonceMaj(chemin) {
  return clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(ws => { ws.forEach(w => { try { w.postMessage({ op: 'maj', chemin: chemin }); } catch (_) {} }); })
    .catch(() => {});
}

/* Deux réponses sont-elles la même version ? Par les en-têtes quand le serveur les donne
   (GitHub Pages : etag), sinon en comparant le texte. */
function memeVersion(a, b) {
  const ea = a.headers.get('etag'), eb = b.headers.get('etag');
  if (ea && eb) return Promise.resolve(ea === eb);
  const la = a.headers.get('last-modified'), lb = b.headers.get('last-modified');
  if (la && lb && la !== lb) return Promise.resolve(false);
  return Promise.all([a.text(), b.text()]).then(([x, y]) => x === y).catch(() => true);
}

const pageHorsLigne = () => new Response(
  '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hors ligne</title></head>' +
  '<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0f1729;color:#eef2fa;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px">' +
  '<div><div style="font-size:42px">📡</div><h1 style="font-size:20px;margin:12px 0 6px">Cette page n\'est pas disponible hors ligne</h1>' +
  '<p style="color:#93a9d4;font-size:14px">Reconnecte-toi à internet, ou <a href="app.html" style="color:#34d399">ouvre l\'application</a>.</p></div></body></html>',
  { status: 503, headers: { 'Content-Type': 'text/html;charset=utf-8' } });

/* « Mettre à jour » : la page demande la version fraîche AVANT de se recharger.
   On la télécharge en ignorant tout cache, on la range, puis on répond ; une navigation
   qui arrive pendant ce téléchargement l'attend, et la page fraîche est servie du cache
   sans second téléchargement. */
let majEnCours = null;      // promesse du téléchargement forcé en cours
let majFraiche = '';        // adresse dont la copie en cache vient d'être rafraîchie de force
let forcerFraisJusqua = 0;  // secours : la prochaine navigation attend le réseau si le forçage a échoué
self.addEventListener('message', e => {
  const d = (e && e.data) || {};
  if (d.op !== 'maj-forcer') return;
  const port = e.ports && e.ports[0];
  const dire = (m) => { try { if (port) port.postMessage(m); } catch (_) {} };
  dire({ op: 'maj-recu' });
  const url = new URL(d.url || 'app.html', self.location.href).href.split('?')[0];
  const travail = fetch(url, { cache: 'reload' })
    .then(res => { if (!res || !res.ok) throw new Error('réseau'); return caches.open(CACHE).then(c => c.put(url, res.clone())); })
    .then(() => { majFraiche = url; forcerFraisJusqua = 0; }, () => { majFraiche = ''; forcerFraisJusqua = Date.now() + 30000; })
    .then(() => { if (majEnCours === travail) majEnCours = null; dire({ op: 'maj-ok' }); });
  majEnCours = travail;
  if (e.waitUntil) e.waitUntil(travail);
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // tour.html (Tour de contrôle, page privée) : jamais mise en cache, toujours fraîche
  if (url.pathname.endsWith('/tour.html')) return;
  // beta.html (canal d'essai) : jamais mise en cache — la bêta est toujours la dernière poussée
  if (url.pathname.endsWith('/beta.html')) return;
  if (url.pathname.endsWith('/messages-beta.html')) return;   // canal d'essai OP MESSAGES : toujours la dernière poussée
  if (url.pathname.endsWith('/dev.html')) return;   // portail bêta de l'équipe : jamais en cache, toujours frais
  if (url.origin !== self.location.origin) return;   // le reste du web ne nous regarde pas

  const isDoc = req.mode === 'navigate' || req.destination === 'document';

  /* ══ LES PAGES : LA VERSION FRAÎCHE D'ABORD ══
     Une PAGE (app.html, messages.html…) part chercher la version fraîche en
     premier. Si le réseau répond dans les 2 secondes — le cas normal — on
     sert la toute dernière version : une correction livrée arrive TOUT DE
     SUITE, sans double rechargement.
     Si le réseau traîne ou manque, la copie gardée s'affiche instantanément
     comme avant, et on prévient (bandeau « Mise à jour disponible ») dès que
     la version fraîche est bien rangée. */
  if (isDoc) {
    /* la page est rangée sous son adresse sans paramètres (index.html?hub=1 → index.html) */
    const cle = req.url.split('?')[0];
    e.respondWith((async () => {
      if (majEnCours) { try { await majEnCours; } catch (_) {} }
      /* juste après « Mettre à jour » : la copie rangée EST la fraîche, on la sert sans re-télécharger */
      if (majFraiche === cle) { majFraiche = ''; const g = await caches.match(cle); if (g) return g; }
      const forcer = Date.now() < forcerFraisJusqua;
      if (forcer) forcerFraisJusqua = 0;

      const garde = await caches.match(cle);
      const temoin = garde ? garde.clone() : null;   // copie pour comparer plus tard (le corps servi ne se relit pas)
      let enCache = Promise.resolve(false);
      const frais = fetch(req).then(res => {
        if (res && res.ok) {
          const copie = res.clone();
          enCache = caches.open(CACHE).then(c => c.put(cle, copie)).then(() => true, () => false);
        }
        return res;
      }).catch(() => null);

      if (!garde) {
        const r = await frais;
        if (r) return r;
        return url.pathname.endsWith('/app.html') ? ((await caches.match('app.html')) || pageHorsLigne()) : pageHorsLigne();
      }

      /* course : le réseau a 2 secondes pour gagner (15 en secours après « Mettre à jour ») */
      const patience = new Promise(r => setTimeout(() => r(null), forcer ? 15000 : 2000));
      const r = await Promise.race([frais, patience]);
      if (r && r.ok) return r;                       // ← la version fraîche
      /* le réseau traîne : on sert la copie, et on préviendra si ça change —
         seulement une fois la version fraîche bien rangée, sinon le bouton
         « Mettre à jour » resservirait l'ancienne copie et le bandeau reviendrait */
      frais.then(res => {
        if (!res || !res.ok || !temoin) return;
        return memeVersion(temoin, res.clone()).then(meme => { if (!meme) return enCache.then(ok => { if (ok) annonceMaj(url.pathname); }); });
      }).catch(() => {});
      return garde;
    })());
    return;
  }

  /* ══ LE RESTE (sons, icônes, images) : la copie d'abord, c'est instantané ══ */
  e.respondWith(
    caches.match(req).then(garde => {
      const frais = fetch(req).then(res => {
        if (res && res.ok) {
          const copie = res.clone();
          caches.open(CACHE).then(c => c.put(req, copie)).catch(() => {});
        }
        return res;
      }).catch(() => null);

      if (garde) { frais; return garde; }          // ← instantané
      return frais.then(r => r || caches.match('app.html'));
    })
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
    /* si l'application est ouverte quelque part (même en arrière-plan), on la
       prévient : pour un appel, elle fera sonner SA sonnerie immédiatement */
    const prevenir = clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(ws => { ws.forEach(w => { try { w.postMessage({ op: 'push', appel: appel, titre: d.title || '' }); } catch (_) {} }); })
      .catch(() => {});
    return Promise.all([
      self.registration.showNotification(d.title || 'TeamOP', opts),
      prevenir
    ]);
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
