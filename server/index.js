// Serveur TeamOP — notifications push + e-mails automatiques
// Config lue dans /opt/teamop/config.json (générée par install.sh)
const fs = require('fs');
const path = require('path');
const express = require('express');
const webpush = require('web-push');

const CONFIG_PATH = process.env.TEAMOP_CONFIG || '/opt/teamop/config.json';
const DATA_DIR = process.env.TEAMOP_DATA || '/opt/teamop/data';
const SUBS_PATH = path.join(DATA_DIR, 'subscriptions.json');

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
fs.mkdirSync(DATA_DIR, { recursive: true });

webpush.setVapidDetails('mailto:' + (config.contactEmail || 'contact@teamop.fr'), config.vapidPublicKey, config.vapidPrivateKey);

// ── stockage des abonnements push : { endpoint: {sub, teamId, userId, userName, ts} }
let subs = {};
try { subs = JSON.parse(fs.readFileSync(SUBS_PATH, 'utf8')); } catch (e) {}
let saveTimer = null;
function saveSubs() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(SUBS_PATH, JSON.stringify(subs)); } catch (e) { console.error('save subs:', e.message); }
  }, 300);
}

// ── e-mail (optionnel : rempli dans config.json → smtp)
let mailer = null;
if (config.smtp && config.smtp.host) {
  const nodemailer = require('nodemailer');
  mailer = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port || 465,
    secure: (config.smtp.port || 465) === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass }
  });
}

const app = express();
app.use(express.json({ limit: '6mb' })); // large : les e-mails peuvent porter un PDF en pièce jointe (base64)

// CORS — uniquement le site TeamOP
const ORIGINS = config.origins || ['https://teamop.fr', 'https://www.teamop.fr'];
app.use((req, res, next) => {
  const o = req.headers.origin;
  if (o && ORIGINS.includes(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// anti-abus très simple : 120 requêtes / minute / IP
const hits = new Map();
setInterval(() => hits.clear(), 60000).unref();
app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?';
  const n = (hits.get(ip) || 0) + 1;
  hits.set(ip, n);
  if (n > 120) return res.status(429).json({ error: 'trop de requêtes' });
  next();
});

// ── codes de sécurité (actions sensibles : remise à zéro, etc.) ──
const codes = new Map();
app.post('/api/sendcode', async (req, res) => {
  const { teamId, email, purpose } = req.body || {};
  if (!teamId || !email) return res.status(400).json({ error: 'teamId et email requis' });
  if (!mailer) return res.status(503).json({ error: 'email_off' });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  codes.set(teamId + '|' + (purpose || 'reset'), { code, email, exp: Date.now() + 10 * 60000, tries: 0 });
  try {
    await mailer.sendMail({
      from: config.smtp.from || config.smtp.user, to: email,
      subject: 'TeamOP — code de confirmation : ' + code,
      text: 'Votre code de confirmation TeamOP : ' + code + '\n\nIl expire dans 10 minutes.\nSi vous n\'êtes pas à l\'origine de cette demande, ignorez ce message et vérifiez la sécurité de votre compte.'
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/checkcode', (req, res) => {
  const { teamId, code, purpose } = req.body || {};
  const k = (teamId || '') + '|' + (purpose || 'reset');
  const c = codes.get(k);
  if (!c || Date.now() > c.exp) return res.status(400).json({ ok: false, error: 'expiré' });
  c.tries = (c.tries || 0) + 1;
  if (c.tries > 5) { codes.delete(k); return res.status(429).json({ ok: false, error: 'trop d\'essais' }); }
  if (String(code) !== c.code) return res.status(400).json({ ok: false, error: 'code incorrect' });
  codes.delete(k);
  res.json({ ok: true });
});

let lastRefus = null;   // dernier refus d'envoi d'e-mail (diagnostic) : { ts, raison }
app.get('/health', (req, res) => res.json({ ok: true, v: 5, histo: true, subs: Object.keys(subs).length, email: !!mailer, atts: true, boite: !!(config.imap && config.imap.user), boiteAddr: (config.imap && config.imap.user) || '', stripe: !!(config.stripe && config.stripe.secretKey), bugs1h: bugTimes.filter(t => t > Date.now() - 3600000).length, bugs24h: bugTimes.filter(t => t > Date.now() - 86400000).length, lastRefus }));

// ── Stripe : liste des tarifs actifs (lecture seule — les prix sont publics sur le site)
app.get('/api/stripe/prices', async (req, res) => {
  try {
    const sk = config.stripe && config.stripe.secretKey;
    if (!sk) return res.status(501).json({ error: 'stripe non configuré' });
    const r = await fetch('https://api.stripe.com/v1/prices?active=true&limit=100&expand[]=data.product', { headers: { Authorization: 'Bearer ' + sk } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: 'stripe erreur' });
    res.json({ prices: (d.data || []).map(p => ({ id: p.id, montant: p.unit_amount, devise: p.currency, periode: p.recurring && p.recurring.interval, produit: p.product && p.product.name })) });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

// ── Stripe : création d'une page de paiement avec la quantité déjà réglée + champ code promo
//    Le site envoie { price, quantity, ref? } ; la clé secrète vit uniquement dans /opt/teamop/config.json (set-stripe.sh)
app.post('/api/stripe/checkout', async (req, res) => {
  try {
    const sk = config.stripe && config.stripe.secretKey;
    if (!sk) return res.status(501).json({ error: 'stripe non configuré' });
    const { price, quantity, ref } = req.body || {};
    if (!/^price_[A-Za-z0-9]+$/.test(String(price || ''))) return res.status(400).json({ error: 'tarif invalide' });
    const qty = Math.min(50, Math.max(1, parseInt(quantity, 10) || 1));
    const p = new URLSearchParams();
    p.append('mode', 'subscription');
    p.append('line_items[0][price]', String(price));
    p.append('line_items[0][quantity]', String(qty));
    p.append('allow_promotion_codes', 'true');
    p.append('success_url', 'https://teamop.fr/merci.html');
    p.append('cancel_url', 'https://teamop.fr/recap-abonnement.html');
    if (typeof ref === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(ref)) p.append('client_reference_id', ref);
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: 'Bearer ' + sk, 'Content-Type': 'application/x-www-form-urlencoded' }, body: p.toString() });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) return res.status(502).json({ error: (d.error && d.error.message) || 'stripe erreur' });
    res.json({ url: d.url });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

// ── Vigie : les applications signalent leurs erreurs JavaScript (par espace entreprise, anonyme)
//    → e-mail d'alerte immédiat à l'admin de la plateforme, journal consultable, compteur dans /health
const BUGS_PATH = path.join(DATA_DIR, 'bugs.jsonl');
let bugTimes = [];
try { // recharge les dernières 24 h au démarrage
  const tail = fs.readFileSync(BUGS_PATH, 'utf8').trim().split('\n').slice(-500);
  const lim = Date.now() - 86400000;
  tail.forEach(l => { try { const e = JSON.parse(l); if (e.ts > lim) bugTimes.push(e.ts); } catch (e) {} });
} catch (e) {}
const bugSeen = new Map();   // hash d'erreur -> date du dernier e-mail (anti-spam)
const bugQuota = new Map();  // espace -> quota horaire
app.post('/api/bug', (req, res) => {
  const { teamId, app: appName, version, msg, src, line, stack, ua } = req.body || {};
  if (!msg) return res.status(400).json({ error: 'msg requis' });
  const team = String(teamId || 'inconnu').slice(0, 60);
  const q = bugQuota.get(team) || { count: 0, reset: Date.now() + 3600000 };
  if (Date.now() > q.reset) { q.count = 0; q.reset = Date.now() + 3600000; }
  if (q.count >= 20) return res.json({ ok: true, muted: true });
  q.count++; bugQuota.set(team, q);
  const entry = { ts: Date.now(), team, app: String(appName || '?').slice(0, 20), version: String(version || '?').slice(0, 12), msg: String(msg).slice(0, 300), src: String(src || '').slice(0, 200), line: parseInt(line) || 0, stack: String(stack || '').slice(0, 800), ua: String(ua || '').slice(0, 150) };
  try { fs.appendFileSync(BUGS_PATH, JSON.stringify(entry) + '\n'); } catch (e) {}
  bugTimes.push(entry.ts); if (bugTimes.length > 2000) bugTimes = bugTimes.slice(-1000);
  const hash = entry.app + '|' + entry.version + '|' + entry.msg.slice(0, 120);
  if (mailer && Date.now() - (bugSeen.get(hash) || 0) > 6 * 3600000) {
    bugSeen.set(hash, Date.now());
    const to = config.alertEmail || config.contactEmail || 'contact@teamop.fr';
    mailer.sendMail({
      from: config.smtp.from || config.smtp.user, to,
      subject: '🐛 Bug ' + entry.app.toUpperCase() + (entry.version !== '?' ? ' v' + entry.version : '') + ' — espace « ' + team + ' »',
      text: 'Une erreur vient d\'être signalée par l\'application d\'une entreprise.\n\nApplication : ' + entry.app + (entry.version !== '?' ? ' (v' + entry.version + ')' : '') + '\nEspace entreprise : ' + team + '\nErreur : ' + entry.msg + '\nFichier : ' + (entry.src || '—') + (entry.line ? ' ligne ' + entry.line : '') + '\nAppareil : ' + entry.ua + '\n\n' + (entry.stack ? 'Détail technique :\n' + entry.stack + '\n\n' : '') + 'Pour corriger : ouvre Claude Code et demande « corrige le bug signalé par la vigie ».'
    }).catch(e => console.error('bug mail:', e.message));
  }
  res.json({ ok: true });
});
// ── 📥 Boîte Commandes intégrée : les réponses des fournisseurs arrivent DANS l'application ──
//    Les bons partent avec Reply-To = la boîte commandes ; le serveur la relève toutes les 2 min,
//    rattache chaque réponse au bon (n° BC-… dans l'objet/le texte) et pousse une notification à l'équipe.
const REPLIES_PATH = path.join(DATA_DIR, 'replies.jsonl');
const SENTMAP_PATH = path.join(DATA_DIR, 'sentmap.jsonl');
let sentMap = [];
try { sentMap = fs.readFileSync(SENTMAP_PATH, 'utf8').trim().split('\n').map(l => JSON.parse(l)).slice(-2000); } catch (e) {}
function rememberSent(teamId, bonNum, to) {
  const e = { ts: Date.now(), teamId: String(teamId).slice(0, 80), bonNum: String(bonNum).slice(0, 30).toUpperCase(), to: String(to || '').toLowerCase().slice(0, 120) };
  sentMap.push(e); if (sentMap.length > 3000) sentMap = sentMap.slice(-2000);
  try { fs.appendFileSync(SENTMAP_PATH, JSON.stringify(e) + '\n'); } catch (_) {}
}
// ── Boîtes mail connectées (plusieurs par équipe, relevées par le serveur) ──
const MAILBOX_PATH = path.join(DATA_DIR, 'mailboxes.json');
let mailboxes = {};   // clé "boxId" -> { id, teamId, email, pass, name, imapHost, imapPort, smtpHost, smtpPort }
try { mailboxes = JSON.parse(fs.readFileSync(MAILBOX_PATH, 'utf8')); } catch (e) {}
// migration éventuelle depuis l'ancien format "teamId|userId"
for (const k of Object.keys(mailboxes)) { const b = mailboxes[k]; if (!b.id) { b.id = 'mb' + Math.random().toString(36).slice(2, 9); mailboxes[b.id] = b; delete mailboxes[k]; } }
function saveMailboxes() { try { fs.writeFileSync(MAILBOX_PATH, JSON.stringify(mailboxes)); } catch (e) {} }
// Détection automatique des serveurs selon le domaine
function mailServers(email) {
  const dom = String(email || '').split('@')[1] || '';
  const P = { host: 'ssl0.ovh.net', imap: 993, smtp: 465 };
  if (/gmail\.com|googlemail\.com/i.test(dom)) return { imapHost: 'imap.gmail.com', imapPort: 993, smtpHost: 'smtp.gmail.com', smtpPort: 465 };
  if (/outlook|hotmail|live\.|msn\.com/i.test(dom)) return { imapHost: 'outlook.office365.com', imapPort: 993, smtpHost: 'smtp.office365.com', smtpPort: 587 };
  if (/orange\.fr|wanadoo/i.test(dom)) return { imapHost: 'imap.orange.fr', imapPort: 993, smtpHost: 'smtp.orange.fr', smtpPort: 465 };
  if (/free\.fr/i.test(dom)) return { imapHost: 'imap.free.fr', imapPort: 993, smtpHost: 'smtp.free.fr', smtpPort: 465 };
  if (/sfr\.fr|neuf\.fr/i.test(dom)) return { imapHost: 'imap.sfr.fr', imapPort: 993, smtpHost: 'smtp.sfr.fr', smtpPort: 465 };
  if (/yahoo\./i.test(dom)) return { imapHost: 'imap.mail.yahoo.com', imapPort: 993, smtpHost: 'smtp.mail.yahoo.com', smtpPort: 465 };
  return { imapHost: P.host, imapPort: P.imap, smtpHost: 'ssl0.ovh.net', smtpPort: 465 };   // OVH & domaines pro par défaut
}
// Connecter / tester une boîte (une équipe peut en connecter plusieurs)
app.post('/api/mailbox/connect', async (req, res) => {
  const { teamId, email, pass, name } = req.body || {};
  if (!teamId || !email || !pass) return res.status(400).json({ error: 'champs requis manquants' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) return res.status(400).json({ error: 'adresse invalide' });
  const srv = mailServers(email);
  try {
    const nodemailer = require('nodemailer');
    const t = nodemailer.createTransport({ host: srv.smtpHost, port: srv.smtpPort, secure: srv.smtpPort === 465, auth: { user: email, pass } });
    await t.verify();
  } catch (e) { return res.status(400).json({ error: 'Connexion envoi (SMTP) refusée : ' + String(e.message || e).slice(0, 140) + '. Pour Gmail/Outlook, utilise un « mot de passe d\'application ».' }); }
  try {
    const { ImapFlow } = require('imapflow');
    const c = new ImapFlow({ host: srv.imapHost, port: srv.imapPort, secure: true, auth: { user: email, pass }, logger: false });
    await c.connect(); await c.logout();
  } catch (e) { return res.status(400).json({ error: 'Connexion réception (IMAP) refusée : ' + String(e.message || e).slice(0, 140) }); }
  // remplace une éventuelle boîte de même adresse dans la même équipe
  const ex = Object.values(mailboxes).find(b => b.teamId === teamId && b.email.toLowerCase() === String(email).toLowerCase());
  const id = ex ? ex.id : ('mb' + Math.random().toString(36).slice(2, 9));
  mailboxes[id] = { id, teamId, email: String(email), pass: String(pass), name: String(name || '').slice(0, 80), ...srv, ts: Date.now() };
  saveMailboxes();
  res.json({ ok: true, id, email });
  importHistorique(mailboxes[id]).catch(() => {});   // les anciens mails de la boîte arrivent dans l'app (en arrière-plan)
});
app.post('/api/mailbox/disconnect', (req, res) => {
  const { teamId, id } = req.body || {}; const b = mailboxes[id];
  if (b && b.teamId === teamId) { delete mailboxes[id]; saveMailboxes(); }
  res.json({ ok: true });
});
// liste des boîtes d'une équipe (sans mot de passe)
app.get('/api/mailboxes', (req, res) => {
  const teamId = String(req.query.teamId || '');
  const list = Object.values(mailboxes).filter(b => b.teamId === teamId).map(b => ({ id: b.id, email: b.email, name: b.name, imapHost: b.imapHost, smtpHost: b.smtpHost }));
  res.json({ mailboxes: list });
});

// Message-ID déjà enregistrés (évite les doublons entre l'import d'historique et la relève)
let seenMids = new Set();
try { fs.readFileSync(REPLIES_PATH, 'utf8').trim().split('\n').forEach(l => { try { const r = JSON.parse(l); if (r.mid) seenMids.add(r.mid); } catch (_) {} }); } catch (e) {}
// 📜 Import de l'historique d'une boîte à sa connexion : les ~60 derniers mails (lus ou non)
//    arrivent dans l'app avec leur vraie date — sans notification, sans toucher aux drapeaux lu/non-lu.
async function importHistorique(b, limit = 60) {
  const { ImapFlow } = require('imapflow'); const { simpleParser } = require('mailparser'); let client;
  try {
    client = new ImapFlow({ host: b.imapHost, port: b.imapPort || 993, secure: true, auth: { user: b.email, pass: b.pass }, logger: false });
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const total = (client.mailbox && client.mailbox.exists) || 0;
      if (total) {
        const range = Math.max(1, total - limit + 1) + ':*';
        let n = 0;
        for await (const msg of client.fetch(range, { envelope: true, source: { maxLength: 150000 } })) {
          const env = msg.envelope || {};
          const mid = String(env.messageId || '').slice(0, 200);
          if (mid && seenMids.has(mid)) continue;
          let text = '';
          try { const p = await simpleParser(msg.source); text = String(p.text || '').slice(0, 2000); } catch (e) {}
          const from = ((env.from || [])[0] || {});
          const subj = String(env.subject || '');
          const m = (subj + ' ' + text).match(/BC-\d{4}-\d{2,4}/i);
          const entry = { ts: env.date ? new Date(env.date).getTime() : Date.now(), teamId: b.teamId, boite: b.email, bonNum: m ? m[0].toUpperCase() : '', from: String(from.address || '').toLowerCase(), fromName: String(from.name || '').slice(0, 80), subject: subj.slice(0, 200), text, mid, histo: 1 };
          try { fs.appendFileSync(REPLIES_PATH, JSON.stringify(entry) + '\n'); n++; } catch (_) {}
          if (mid) seenMids.add(mid);
        }
        console.log('historique importé:', b.email, '(' + n + ' mails)');
      }
    } finally { lock.release(); }
    await client.logout();
    if (b.id && mailboxes[b.id]) { mailboxes[b.id].histoDone = true; saveMailboxes(); }   // une seule fois par boîte
  } catch (e) { console.error('histo', b.email + ':', e.message); try { if (client) client.close(); } catch (_) {} }
}
let boiteBusy = false;
async function releveUneBoite(cfg, tag) {   // cfg = {host/port/user/pass} ; tag = {teamId, userId} pour le rattachement
  const { ImapFlow } = require('imapflow'); let client;
  try {
    client = new ImapFlow({ host: cfg.host, port: cfg.port || 993, secure: true, auth: { user: cfg.user, pass: cfg.pass }, logger: false });
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const nouveaux = [];
      for await (const msg of client.fetch({ seen: false }, { envelope: true, source: true })) nouveaux.push(msg);
      for (const msg of nouveaux) {
        const mid = String((msg.envelope || {}).messageId || '').slice(0, 200);
        if (mid && seenMids.has(mid)) { try { await client.messageFlagsAdd(msg.seq, ['\\Seen']); } catch (_) {} continue; }   // déjà importé via l'historique
        let text = '';
        try { const { simpleParser } = require('mailparser'); const p = await simpleParser(msg.source); text = String(p.text || '').slice(0, 2000); } catch (e) {}
        const env = msg.envelope || {}; const from = ((env.from || [])[0] || {});
        const fromAddr = String(from.address || '').toLowerCase();
        const subj = String(env.subject || '');
        const m = (subj + ' ' + text).match(/BC-\d{4}-\d{2,4}/i);
        const bonNum = m ? m[0].toUpperCase() : '';
        let teamId = tag ? tag.teamId : '';
        if (!teamId) { let map = bonNum ? sentMap.slice().reverse().find(x => x.bonNum === bonNum) : null; if (!map) map = sentMap.slice().reverse().find(x => x.to === fromAddr); if (map) { teamId = map.teamId; } }
        const entry = { ts: Date.now(), teamId, boite: tag ? tag.email : '', bonNum, from: fromAddr, fromName: String(from.name || '').slice(0, 80), subject: subj.slice(0, 200), text, mid };
        try { fs.appendFileSync(REPLIES_PATH, JSON.stringify(entry) + '\n'); } catch (_) {}
        if (mid) seenMids.add(mid);
        try { await client.messageFlagsAdd(msg.seq, ['\\Seen']); } catch (_) {}
        if (teamId) {
          const payload = JSON.stringify({ title: '📥 Nouveau message' + (bonNum ? ' — ' + bonNum : ''), body: ((entry.fromName || fromAddr) + ' : ' + subj).slice(0, 240), url: '/app.html#v=boiteMail' });
          const targets = Object.values(subs).filter(s => s.teamId === teamId);
          for (const t of targets) { try { await webpush.sendNotification(t.sub, payload); } catch (e) { if (e.statusCode === 404 || e.statusCode === 410) { delete subs[t.sub.endpoint]; saveSubs(); } } }
        }
      }
    } finally { lock.release(); }
    await client.logout();
  } catch (e) { console.error('releve', (cfg.user || '') + ':', e.message); try { if (client) client.close(); } catch (_) {} }
}
async function releveBoite() {
  if (boiteBusy) return; boiteBusy = true;
  try {
    if (config.imap && config.imap.user && config.imap.pass) await releveUneBoite({ host: config.imap.host || 'ssl0.ovh.net', port: config.imap.port || 993, user: config.imap.user, pass: config.imap.pass }, null);
    for (const k of Object.keys(mailboxes)) { const b = mailboxes[k];
      if (!b.histoDone) await importHistorique(b).catch(() => {});   // boîtes connectées avant cette mise à jour : historique importé au premier passage
      await releveUneBoite({ host: b.imapHost, port: b.imapPort, user: b.email, pass: b.pass }, { teamId: b.teamId, email: b.email }); }
  } catch (e) { console.error('releveBoite:', e.message); }
  boiteBusy = false;
}
setInterval(() => { releveBoite().catch(() => {}); }, 120000);
setTimeout(() => { releveBoite().catch(() => {}); }, 8000);
// réponses d'une équipe (les 100 dernières)
app.get('/api/replies', (req, res) => {
  const teamId = String(req.query.teamId || ''); if (!teamId) return res.status(400).json({ error: 'teamId requis' });
  let list = [];
  try { list = fs.readFileSync(REPLIES_PATH, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(r => r.teamId === teamId).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 200); } catch (e) {}
  res.json({ replies: list });
});
// journal des bugs (protégé par la clé API du serveur)
app.get('/api/bugs', (req, res) => {
  if ((req.query.key || '') !== config.apiKey) return res.status(403).json({ error: 'clé invalide' });
  let list = [];
  try { list = fs.readFileSync(BUGS_PATH, 'utf8').trim().split('\n').slice(-200).map(l => JSON.parse(l)).reverse(); } catch (e) {}
  res.json({ bugs: list });
});
app.get('/api/vapid', (req, res) => res.json({ key: config.vapidPublicKey }));

// abonnement push d'un appareil
app.post('/api/subscribe', (req, res) => {
  const { sub, teamId, userId, userName } = req.body || {};
  if (!sub || !sub.endpoint || !teamId) return res.status(400).json({ error: 'sub et teamId requis' });
  subs[sub.endpoint] = { sub, teamId: String(teamId).slice(0, 80), userId: String(userId || '').slice(0, 80), userName: String(userName || '').slice(0, 80), ts: Date.now() };
  saveSubs();
  res.json({ ok: true });
});

app.post('/api/unsubscribe', (req, res) => {
  const ep = req.body && req.body.endpoint;
  if (ep && subs[ep]) { delete subs[ep]; saveSubs(); }
  res.json({ ok: true });
});

// envoi d'une notification à une équipe (tous ses appareils abonnés)
app.post('/api/notify', async (req, res) => {
  const { teamId, title, body, url, exceptUserId, userIds } = req.body || {};
  if (!teamId || !title) return res.status(400).json({ error: 'teamId et title requis' });
  const payload = JSON.stringify({
    title: String(title).slice(0, 120),
    body: String(body || '').slice(0, 300),
    url: String(url || '/app.html').slice(0, 200)
  });
  const targets = Object.values(subs).filter(s =>
    s.teamId === teamId &&
    (!exceptUserId || s.userId !== exceptUserId) &&
    (!Array.isArray(userIds) || userIds.length === 0 || userIds.includes(s.userId))
  );
  let sent = 0, dead = 0;
  await Promise.all(targets.map(async t => {
    try { await webpush.sendNotification(t.sub, payload); sent++; }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { delete subs[t.sub.endpoint]; dead++; }
    }
  }));
  if (dead) saveSubs();
  res.json({ ok: true, sent, removed: dead });
});

// envoi d'e-mail métier (rapports, avis, devis…) — TOUJOURS via la boîte de l'entreprise (fournie par l'app),
// jamais via l'adresse TeamOP (réservée aux codes de sécurité)
const mailQuota = new Map();
app.post('/api/sendmail', async (req, res) => {
  const { teamId, to, subject, text, smtp, brand, atts, meta, useMailbox } = req.body || {};
  if (!teamId || !to || !subject) return res.status(400).json({ error: 'teamId, to et subject requis' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to))) return res.status(400).json({ error: 'destinataire invalide' });
  const teamConnue = Object.values(subs).some(s => s.teamId === teamId);
  if (!teamConnue) {
    // Espace sans appareil abonné aux notifications : envoi autorisé quand même,
    // mais quota serré par adresse IP (anti-abus). Notifications activées = quota complet.
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?';
    const qi = mailQuota.get('ip:' + ip) || { count: 0, reset: Date.now() + 3600000 };
    if (Date.now() > qi.reset) { qi.count = 0; qi.reset = Date.now() + 3600000; }
    if (qi.count >= 30) { lastRefus = { ts: Date.now(), raison: 'quota IP (espace sans notifications)' }; return res.status(429).json({ error: 'quota horaire atteint (30 e-mails/h) — réessaie dans une heure' }); }
    qi.count++; mailQuota.set('ip:' + ip, qi);
  } else {
    const q = mailQuota.get(teamId) || { count: 0, reset: Date.now() + 3600000 };
    if (Date.now() > q.reset) { q.count = 0; q.reset = Date.now() + 3600000; }
    if (q.count >= 30) { lastRefus = { ts: Date.now(), raison: 'quota équipe (30/h)' }; return res.status(429).json({ error: 'quota horaire atteint (30 e-mails/h)' }); }
    q.count++; mailQuota.set(teamId, q);
  }
  const msg = { to, subject: String(subject).slice(0, 200), text: String(text || '').slice(0, 10000) };
  // Pièces jointes (ex : bon de commande en PDF) — max 3 fichiers, ~4 Mo au total (base64)
  if (Array.isArray(atts) && atts.length) {
    let total = 0; const list = [];
    for (const a of atts.slice(0, 3)) {
      const content = String((a && a.content) || '');
      if (!content || !/^[A-Za-z0-9+/=]+$/.test(content)) continue;
      total += content.length;
      list.push({ filename: (String((a && a.filename) || 'document.pdf').replace(/[^\w. ()-]/g, '').slice(0, 80)) || 'document.pdf', content, encoding: 'base64' });
    }
    if (total > 5500000) return res.status(413).json({ error: 'pièces jointes trop volumineuses (max ~4 Mo)' });
    if (list.length) msg.attachments = list;
  }
  // Boîte connectée choisie à l'envoi : le serveur a le mot de passe, l'app ne l'envoie jamais
  const mb = (useMailbox && useMailbox.id && mailboxes[useMailbox.id] && mailboxes[useMailbox.id].teamId === teamId) ? mailboxes[useMailbox.id] : null;
  try {
    if (mb) {
      const nodemailer = require('nodemailer');
      const t = nodemailer.createTransport({ host: mb.smtpHost, port: mb.smtpPort, secure: mb.smtpPort === 465, auth: { user: mb.email, pass: mb.pass } });
      const dn = String((brand && brand.name) || mb.name || '').replace(/["<>\r\n]/g, '').slice(0, 80);
      await t.sendMail({ from: dn ? '"' + dn + '" <' + mb.email + '>' : mb.email, ...msg });
    } else if (smtp && smtp.user && smtp.pass && smtp.host) {
      // Mode avancé : boîte de l'entreprise / de l'utilisateur
      const nodemailer = require('nodemailer');
      const port = parseInt(smtp.port) || 465;
      const t = nodemailer.createTransport({ host: String(smtp.host).slice(0, 100), port, secure: port === 465, auth: { user: String(smtp.user).slice(0, 120), pass: String(smtp.pass).slice(0, 200) } });
      await t.sendMail({ from: String(smtp.from || smtp.user).slice(0, 160), ...msg });
    } else {
      // Mode simple : la plateforme envoie au nom de l'entreprise (Reply-To vers elle)
      if (!mailer) return res.status(503).json({ error: 'email_off' });
      const name = String((brand && brand.name) || 'TeamOP').replace(/["<>\r\n]/g, '').slice(0, 80);
      const replyTo = (brand && brand.replyTo && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(brand.replyTo))) ? String(brand.replyTo) : undefined;
      const addr = (config.smtp.from || config.smtp.user).match(/<([^>]+)>/) ? (config.smtp.from || config.smtp.user).match(/<([^>]+)>/)[1] : (config.smtp.user);
      await mailer.sendMail({ from: '"' + name + '" <' + addr + '>', replyTo, ...msg });
    }
    if (meta && (meta.bonNum || meta.track)) rememberSent(teamId, meta.bonNum || '', to);   // pour rattacher la future réponse
    res.json({ ok: true });
  } catch (e) { lastRefus = { ts: Date.now(), raison: 'SMTP: ' + String(e.message || e).slice(0, 200) }; res.status(500).json({ error: e.message }); }
});

// envoi d'e-mail (rapports, avis de passage) — nécessite la config smtp
app.post('/api/email', async (req, res) => {
  if (!mailer) return res.status(503).json({ error: "e-mail non configuré sur le serveur (config.json → smtp)" });
  const { key, to, subject, text, html } = req.body || {};
  if (key !== config.apiKey) return res.status(403).json({ error: 'clé invalide' });
  if (!to || !subject) return res.status(400).json({ error: 'to et subject requis' });
  try {
    await mailer.sendMail({ from: config.smtp.from || config.smtp.user, to, subject: String(subject).slice(0, 200), text, html });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '127.0.0.1', () => console.log('TeamOP API sur 127.0.0.1:' + PORT));
