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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Les chiffres de la tour de contrôle ne sont JAMAIS gardés par le navigateur ──
//    Express ne pose qu'un ETag : sans cet en-tête, le navigateur s'autorise à réafficher
//    d'anciens chiffres sans même rappeler le serveur (revenu mensuel, impayés, e-mails
//    support, fiches clients…). Après un rechargement de page, la tour montrerait alors un
//    état périmé — par exemple « Stripe non configuré » alors que Stripe vient d'être relié.
//    Cela évite aussi de laisser des données privées de clients dans le cache disque.
app.use('/api/monitor', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

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
// noms d'applications lisibles pour les e-mails et le contrôle (les anciennes versions envoient encore « elan »)
const APPS_NOM = { elan: 'OP GESTION', 'elan-gestion': 'OP GESTION', elangestion: 'OP GESTION', opgestion: 'OP GESTION',
  opmessages: 'OP MESSAGES', opmsg: 'OP MESSAGES', messages: 'OP MESSAGES', espace: 'ESPACE CLIENT', site: 'SITE TEAM OP' };
function appLisible(a) { const k = String(a || '').toLowerCase().trim(); return APPS_NOM[k] || (k ? k.toUpperCase() : 'APPLICATION'); }

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
      subject: '🐛 Bug ' + appLisible(entry.app) + (entry.version !== '?' ? ' v' + entry.version : '') + ' — espace « ' + team + ' »',
      text: 'Une erreur vient d\'être signalée par l\'application d\'une entreprise.\n\nApplication : ' + appLisible(entry.app) + (entry.version !== '?' ? ' (v' + entry.version + ')' : '') + '\nEspace entreprise : ' + team + '\nErreur : ' + entry.msg + '\nFichier : ' + (entry.src || '—') + (entry.line ? ' ligne ' + entry.line : '') + '\nAppareil : ' + entry.ua + '\n\n' + (entry.stack ? 'Détail technique :\n' + entry.stack + '\n\n' : '') + 'Pour corriger : ouvre Claude Code et demande « corrige le bug signalé par la vigie ».'
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

// ═══════════════════════════════════════════════════════════════════════════
// 🗼 TOUR DE CONTRÔLE — surveillance technique des applications (bugs, lenteurs, réseau)
//    Les sentinelles clientes envoient des lots anonymisés sur /api/monitor/report ;
//    le tableau de bord privé tour.html consulte/administre via un token admin (set-admin.sh).
// ═══════════════════════════════════════════════════════════════════════════
const crypto = require('crypto');
const MONITOR_PATH = path.join(path.dirname(CONFIG_PATH), 'monitor.json');

let monIssues = [], monUsers = [], monJournal = [], monArchive = [];
try { const d = JSON.parse(fs.readFileSync(MONITOR_PATH, 'utf8')); monIssues = d.issues || []; monUsers = d.users || []; monJournal = d.journal || []; monArchive = d.archive || []; } catch (e) {}
// Rien n'est jamais perdu : ce qui sort de la liste vivante part dans l'archive.
function monArchiver(list) {
  if (!list.length) return;
  const vus = new Set(monArchive.map(i => i.id));
  list.forEach(i => { if (!vus.has(i.id)) monArchive.push(i); });
  monArchive.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0));
  if (monArchive.length > 5000) monArchive = monArchive.slice(0, 5000);
}
function monPurge() {
  const lim = Date.now() - 90 * 86400000;
  const vieux = monIssues.filter(i => i.statut === 'corrige' && (i.lastTs || 0) < lim);
  if (vieux.length) { monArchiver(vieux); monIssues = monIssues.filter(i => vieux.indexOf(i) < 0); }
  if (monIssues.length > 500) {   // cap de la liste vivante : le reste rejoint l'archive
    monIssues.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0));
    const actifs = monIssues.filter(i => i.statut === 'nouveau' || i.statut === 'encours');
    const autres = monIssues.filter(i => i.statut !== 'nouveau' && i.statut !== 'encours');
    const garde = actifs.slice(0, 500).concat(autres.slice(0, Math.max(0, 500 - actifs.length)));
    monArchiver(monIssues.filter(i => garde.indexOf(i) < 0));
    monIssues = garde;
  }
}
let monSaveTimer = null;
function monSave() {
  clearTimeout(monSaveTimer);
  monSaveTimer = setTimeout(() => {
    try { monPurge(); fs.writeFileSync(MONITOR_PATH, JSON.stringify({ issues: monIssues, users: monUsers, journal: monJournal, archive: monArchive })); } catch (e) { console.error('monitor save:', e.message); }
  }, 500);
}
monPurge();

const MON_TYPES = ['erreur', 'lenteur', 'reseau'];
const monStr = (v, n) => String(v == null ? '' : v).slice(0, n);
// réception des rapports des sentinelles (public, quota par IP via le limiteur global)
app.post('/api/monitor/report', express.text({ type: 'text/plain', limit: '200kb' }), (req, res) => {
  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }   // navigator.sendBeacon envoie en text/plain
    const reports = body && Array.isArray(body.reports) ? body.reports.slice(0, 40) : null;
    if (!reports || !reports.length) return res.status(400).json({ error: 'reports requis' });
    for (const r of reports) {
      if (!r || typeof r !== 'object') continue;
      const type = MON_TYPES.includes(r.type) ? r.type : 'erreur';
      const message = monStr(r.message, 300); if (!message) continue;
      const appName = monStr(r.app, 20) || 'inconnue';
      const signature = appName + '|' + (monStr(r.signature, 200) || (type + '|' + message.slice(0, 120)));
      const entNom = monStr(r.entreprise, 80) || 'inconnue';
      const entEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(monStr(r.email, 120)) ? monStr(r.email, 120).toLowerCase() : '';
      const appareil = monStr(r.appareil, 60) || '?';
      const count = Math.min(500, Math.max(1, parseInt(r.count, 10) || 1));
      const now = Date.now();
      let issue = monIssues.find(i => i.signature === signature);
      if (!issue) {
        issue = { id: 'i' + crypto.randomBytes(6).toString('hex'), signature, app: appName, version: monStr(r.version, 12), categorie: monStr(r.categorie, 40) || 'Général', type, message, stack: monStr(r.stack, 600), src: monStr(r.src, 200), line: parseInt(r.line, 10) || 0, entreprises: [], appareils: {}, count: 0, firstTs: now, lastTs: now, statut: 'nouveau', notes: '', mailEnvoye: false };
        monIssues.push(issue);
      }
      issue.count += count; issue.lastTs = now;
      if (monStr(r.version, 12)) issue.version = monStr(r.version, 12);
      if (issue.statut === 'corrige' || issue.statut === 'ignore') { if (issue.statut === 'corrige') { issue.statut = 'nouveau'; issue.mailEnvoye = false; } }   // un « corrigé » qui revient redevient nouveau
      let ent = issue.entreprises.find(e => e.nom === entNom);
      if (!ent) { ent = { nom: entNom, email: entEmail, count: 0, lastTs: now }; if (issue.entreprises.length < 60) issue.entreprises.push(ent); }
      ent.count += count; ent.lastTs = now; if (entEmail && !ent.email) ent.email = entEmail;
      if (Object.keys(issue.appareils).length < 20 || issue.appareils[appareil]) issue.appareils[appareil] = (issue.appareils[appareil] || 0) + count;
    }
    monSave();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e.message || e).slice(0, 200) }); }
});

// ── auth de la tour : comptes individuels {id, nom, hash, role:'patron'|'collaborateur', actif}
//    stockés dans monitor.json (le premier compte patron est créé par server/set-admin.sh).
//    POST /api/monitor/login {nom, pass} → token de session 24 h en mémoire, lié à l'utilisateur.
const monTokens = new Map();          // token -> { exp, userId, nom, role }
const monLoginTries = new Map();      // ip -> { count, reset }
const monLock = new Map();            // ident -> { fails, until } : 5 échecs consécutifs = verrou 15 min
const monHash = p => crypto.createHash('sha256').update(String(p)).digest('hex');
setInterval(() => { const now = Date.now(); for (const [t, s] of monTokens) if (now > s.exp) monTokens.delete(t); }, 600000).unref();
function monUA(req) {   // appareil simplifié pour le journal (jamais l'UA complet)
  const u = String(req.headers['user-agent'] || '');
  const ap = /iPhone|iPad|iPod/i.test(u) ? 'iPhone' : (/Android/i.test(u) ? 'Android' : 'PC');
  const nv = /Edg\//.test(u) ? 'Edge' : (/OPR\//.test(u) ? 'Opera' : (/Chrome\//.test(u) ? 'Chrome' : (/Firefox\//.test(u) ? 'Firefox' : (/Safari\//.test(u) ? 'Safari' : (/curl/i.test(u) ? 'curl' : 'autre')))));
  return ap + ' · ' + nv;
}
function monLog(ident, ok, req, motif) {   // journal des connexions (réussies ET échouées)
  monJournal.push({ ts: Date.now(), qui: monStr(ident, 120), ok: !!ok, appareil: monUA(req), motif: monStr(motif, 60) });
  if (monJournal.length > 300) monJournal = monJournal.slice(-300);
  monSave();
}
app.post('/api/monitor/login', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?';
  const q = monLoginTries.get(ip) || { count: 0, reset: Date.now() + 3600000 };
  if (Date.now() > q.reset) { q.count = 0; q.reset = Date.now() + 3600000; }
  if (q.count >= 10) return res.status(429).json({ error: 'trop d\'essais — réessaie dans une heure' });
  q.count++; monLoginTries.set(ip, q);
  const nom = monStr((req.body || {}).nom, 120).trim();
  const ident = (monStr((req.body || {}).email, 120).trim() || nom).toLowerCase();   // connexion par nom OU par e-mail
  const pass = monStr((req.body || {}).pass, 200);
  // verrou anti force brute : 5 échecs consécutifs sur un identifiant = 15 minutes
  const lk = monLock.get(ident);
  if (lk && lk.until > Date.now()) { monLog(ident, false, req, 'verrouillé'); return res.status(429).json({ error: 'accès temporairement verrouillé (15 min) après plusieurs échecs' }); }
  const echec = (motif) => { const l = monLock.get(ident) || { fails: 0, until: 0 }; l.fails++; if (l.fails >= 5) { l.until = Date.now() + 15 * 60000; l.fails = 0; } monLock.set(ident, l); monLog(ident, false, req, motif); };
  let user = null;
  if (monUsers.length) {
    const u = monUsers.find(x => x.nom.toLowerCase() === ident || String(x.email || '').toLowerCase() === ident);
    if (!u || !pass || monHash(pass) !== u.hash) { echec('identifiants'); return res.status(403).json({ error: 'nom ou mot de passe incorrect' }); }
    if (!u.actif) { echec('compte désactivé'); return res.status(403).json({ error: 'accès désactivé — vois avec le patron' }); }
    user = u;
  } else {
    // repli : ancien mot de passe unique (config.adminPassHash) tant qu'aucun compte n'existe
    const hash = config.adminPassHash || (config.adminToken ? monHash(config.adminToken) : '');
    if (!hash) return res.status(501).json({ error: 'accès non configuré (lance server/set-admin.sh sur le serveur)' });
    if (!pass || monHash(pass) !== hash) { echec('identifiants'); return res.status(403).json({ error: 'nom ou mot de passe incorrect' }); }
    user = { id: 'u0', nom: nom || 'Patron', role: 'patron' };
  }
  const token = crypto.randomBytes(24).toString('hex');
  monTokens.set(token, { exp: Date.now() + 24 * 3600000, userId: user.id, nom: user.nom, role: user.role });
  monLoginTries.delete(ip); monLock.delete(ident);
  monLog(user.nom, true, req, '');
  res.json({ ok: true, token, exp: 24 * 3600, nom: user.nom, role: user.role });
});
function monAdmin(req, res, next) {
  const m = /^Bearer\s+([a-f0-9]{48})$/.exec(String(req.headers.authorization || ''));
  const s = m && monTokens.get(m[1]);
  if (!s || Date.now() > s.exp) return res.status(401).json({ error: 'session expirée — reconnecte-toi' });
  const u = monUsers.length ? monUsers.find(x => x.id === s.userId) : null;
  if (monUsers.length && (!u || !u.actif)) return res.status(401).json({ error: 'accès désactivé — reconnecte-toi' });
  req.tourUser = { id: s.userId, nom: (u ? u.nom : s.nom), role: (u ? u.role : s.role) };
  next();
}
function monPatron(req, res, next) {
  if (!req.tourUser || req.tourUser.role !== 'patron') return res.status(403).json({ error: 'réservé au patron' });
  next();
}
// Variante stricte pour la gestion des comptes : TOUTE tentative sans token patron valide → 403.
// La création de comptes n'existe par AUCUNE autre voie (pas d'auto-inscription).
function monPatronStrict(req, res, next) {
  const m = /^Bearer\s+([a-f0-9]{48})$/.exec(String(req.headers.authorization || ''));
  const s = m && monTokens.get(m[1]);
  if (!s || Date.now() > s.exp) return res.status(403).json({ error: 'réservé au patron' });
  const u = monUsers.length ? monUsers.find(x => x.id === s.userId) : null;
  if (monUsers.length && (!u || !u.actif)) return res.status(403).json({ error: 'réservé au patron' });
  req.tourUser = { id: s.userId, nom: (u ? u.nom : s.nom), role: (u ? u.role : s.role) };
  if (req.tourUser.role !== 'patron') return res.status(403).json({ error: 'réservé au patron' });
  next();
}

// ── gestion de l'équipe Tour (patron uniquement pour créer/désactiver/supprimer)
app.get('/api/monitor/users', monPatronStrict, (req, res) => {
  res.json({ users: monUsers.map(u => ({ id: u.id, nom: u.nom, email: u.email || '', role: u.role, actif: !!u.actif, ts: u.ts || 0, creePar: u.creePar || '' })) });
});
// journal des connexions (réussies et échouées) — visible par le patron dans la section Équipe
app.get('/api/monitor/journal', monPatronStrict, (req, res) => {
  res.json({ journal: monJournal.slice(-100).reverse() });
});
app.post('/api/monitor/users', monPatronStrict, (req, res) => {
  const nom = monStr((req.body || {}).nom, 60).trim();
  const email = monStr((req.body || {}).email, 120).trim().toLowerCase();
  const pass = monStr((req.body || {}).pass, 200);
  if (!nom || pass.length < 8) return res.status(400).json({ error: 'nom requis et mot de passe de 8 caractères minimum' });
  // e-mail FACULTATIF : les collaborateurs se connectent avec leur nom d'utilisateur seul (décision patron)
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'e-mail invalide (ou laisse le champ vide)' });
  if (monUsers.some(u => u.nom.toLowerCase() === nom.toLowerCase() || (email && String(u.email || '').toLowerCase() === email))) return res.status(409).json({ error: 'ce nom (ou cet e-mail) existe déjà' });
  if (monUsers.length >= 30) return res.status(400).json({ error: 'trop de comptes (30 max)' });
  const u = { id: 'u' + crypto.randomBytes(5).toString('hex'), nom, email, hash: monHash(pass), role: 'collaborateur', actif: true, ts: Date.now(), creePar: req.tourUser.nom };
  monUsers.push(u); monSave();
  res.json({ ok: true, user: { id: u.id, nom: u.nom, email: u.email, role: u.role, actif: true } });
});
app.post('/api/monitor/users/toggle', monPatronStrict, (req, res) => {
  const u = monUsers.find(x => x.id === (req.body || {}).id);
  if (!u) return res.status(404).json({ error: 'compte introuvable' });
  if (u.role === 'patron') return res.status(400).json({ error: 'le compte patron ne peut pas être désactivé' });
  u.actif = !u.actif; monSave();
  res.json({ ok: true, actif: u.actif });
});
app.post('/api/monitor/users/delete', monPatronStrict, (req, res) => {
  const id = (req.body || {}).id;
  const u = monUsers.find(x => x.id === id);
  if (!u) return res.status(404).json({ error: 'compte introuvable' });
  if (u.role === 'patron') return res.status(400).json({ error: 'le compte patron ne peut pas être supprimé' });
  monUsers = monUsers.filter(x => x.id !== id); monSave();
  res.json({ ok: true });
});

// liste des problèmes + compteurs (admin)
app.get('/api/monitor/issues', monAdmin, (req, res) => {
  monPurge();
  const compteurs = { nouveau: 0, encours: 0, corrige: 0, ignore: 0 };
  const entSet = new Set();
  for (const i of monIssues) { compteurs[i.statut] = (compteurs[i.statut] || 0) + 1; for (const e of i.entreprises || []) if (e.nom && e.nom !== 'inconnue') entSet.add(e.nom); }
  res.json({ issues: monIssues.slice().sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0)), compteurs, entreprises: entSet.size });
});

// changement de statut (admin) — « corrige » déclenche l'e-mail automatique aux entreprises touchées
app.post('/api/monitor/status', monAdmin, async (req, res) => {
  const { id, statut, note } = req.body || {};
  if (!['nouveau', 'encours', 'corrige', 'ignore'].includes(statut)) return res.status(400).json({ error: 'statut invalide' });
  if (statut === 'ignore' && req.tourUser.role !== 'patron') return res.status(403).json({ error: '« Ignorer » est réservé au patron' });
  const issue = monIssues.find(i => i.id === id);
  if (!issue) return res.status(404).json({ error: 'problème introuvable' });
  issue.statut = statut;
  issue.par = req.tourUser.nom;   // qui a agi en dernier (affiché « En cours — Karim »)
  if (note) issue.notes = ((issue.notes ? issue.notes + '\n' : '') + monStr(note, 300)).slice(-1000);
  const ACTION = { nouveau: 'Remis en « nouveau »', encours: 'Prise en charge', corrige: 'Marqué corrigé', ignore: 'Ignoré' };
  issue.historique = (issue.historique || []).concat([{ ts: Date.now(), par: req.tourUser.nom, action: ACTION[statut], note: monStr(note, 300) }]).slice(-30);
  let mails = 0, mailsSimules = 0;
  if (statut === 'corrige' && !issue.mailEnvoye) {
    const dests = (issue.entreprises || []).filter(e => e.email);
    const sujet = 'Votre application a été améliorée ✅';
    const texte = 'Bonjour,\n\nNotre système de surveillance a détecté puis corrigé un dysfonctionnement mineur sur ' + (issue.categorie || 'votre application') + '. Votre application est déjà à jour — vous n\'avez rien à faire.\n\n— L\'équipe TEAM OP';
    for (const d of dests) {
      if (mailer) {
        try { await mailer.sendMail({ from: config.smtp.from || config.smtp.user, to: d.email, subject: sujet, text: texte }); mails++; }
        catch (e) { console.error('monitor mail', d.email + ':', e.message); }
      } else { mailsSimules++; console.log('monitor mail (simulé, smtp non configuré) →', d.email, '·', sujet); }
    }
    issue.mailEnvoye = true;
  }
  monSave();
  res.json({ ok: true, issue, mails, mailsSimules });
});

// santé globale (admin) : reprend /health + uptime + répartition des problèmes
app.get('/api/monitor/sante', monAdmin, (req, res) => {
  const compteurs = { nouveau: 0, encours: 0, corrige: 0, ignore: 0 };
  for (const i of monIssues) compteurs[i.statut] = (compteurs[i.statut] || 0) + 1;
  res.json({ ok: true, uptime: Math.round(process.uptime()), subs: Object.keys(subs).length, email: !!mailer, boite: !!(config.imap && config.imap.user), stripe: !!(config.stripe && config.stripe.secretKey), bugs1h: bugTimes.filter(t => t > Date.now() - 3600000).length, bugs24h: bugTimes.filter(t => t > Date.now() - 86400000).length, lastRefus, issues: compteurs, issuesTotal: monIssues.length });
});

// ═══════════════════════════════════════════════════════════════════════════
// 📬 SUPPORT — boîte e-mail support gérée depuis le contrôle (réutilise ImapFlow/nodemailer).
//    Identifiants stockés côté serveur uniquement (jamais renvoyés au navigateur).
// ═══════════════════════════════════════════════════════════════════════════
const SUPPORT_BOX_PATH = path.join(DATA_DIR, 'support-box.json');
const SUPPORT_MAILS_PATH = path.join(DATA_DIR, 'support-mails.json');
let supportBox = null;    // { email, pass, imapHost, imapPort, smtpHost, smtpPort }
let supportMails = [];    // [{ id, mid, from, fromName, subject, text, ts, statut:'nouveau'|'traite'|'archive', reponses:[{ts,par,text}] }]
try { supportBox = JSON.parse(fs.readFileSync(SUPPORT_BOX_PATH, 'utf8')); } catch (e) {}
try { supportMails = JSON.parse(fs.readFileSync(SUPPORT_MAILS_PATH, 'utf8')); } catch (e) {}
const SUPPORT_ENVOYES_PATH = path.join(DATA_DIR, 'support-envoyes.json');
let supportEnvoyes = [];   // [{ id, to, subject, text, ts, par }] — les messages écrits depuis le contrôle
try { supportEnvoyes = JSON.parse(fs.readFileSync(SUPPORT_ENVOYES_PATH, 'utf8')); } catch (e) {}
let supSaveTimer = null;
function supSave() {
  clearTimeout(supSaveTimer);
  supSaveTimer = setTimeout(() => {
    try { if (supportMails.length > 300) supportMails = supportMails.sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 300); fs.writeFileSync(SUPPORT_MAILS_PATH, JSON.stringify(supportMails)); } catch (e) { console.error('support save:', e.message); }
    try { fs.writeFileSync(SUPPORT_ENVOYES_PATH, JSON.stringify(supportEnvoyes)); } catch (e) {}
  }, 400);
}
const supMids = new Set(supportMails.map(m => m.mid).filter(Boolean));
// HTML → texte lisible (beaucoup de mails n'ont AUCUNE version texte : sans ça le message paraissait vide)
function htmlEnTexte(h) {
  if (!h) return '';
  return String(h)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&[a-z#0-9]{2,8};/gi, ' ')
    .replace(/[ \t\u00a0]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function supEntry(env, corps, histo) {
  const from = ((env.from || [])[0] || {});
  const c = (corps && typeof corps === 'object') ? corps : { text: corps };
  const texte = String(c.text || '').trim() || htmlEnTexte(c.html);
  return { id: 'm' + crypto.randomBytes(6).toString('hex'), mid: String(env.messageId || '').slice(0, 200),
    from: String(from.address || '').toLowerCase().slice(0, 120), fromName: String(from.name || '').slice(0, 80),
    subject: String(env.subject || '(sans objet)').slice(0, 200),
    text: texte.slice(0, 12000),
    html: String(c.html || '').slice(0, 120000),                      // affiché dans un cadre isolé côté contrôle
    pieces: (Array.isArray(c.pieces) ? c.pieces : []).slice(0, 12),   // nom + taille des pièces jointes
    ts: env.date ? new Date(env.date).getTime() : Date.now(), statut: 'nouveau', reponses: [], histo: histo ? 1 : 0 };
}
// extraction complète d'un message (texte + HTML + pièces jointes)
async function supCorps(source) {
  try {
    const { simpleParser } = require('mailparser');
    const p = await simpleParser(source);
    return { text: String(p.text || ''), html: typeof p.html === 'string' ? p.html : '',
      pieces: (p.attachments || []).filter(a => a.filename).map(a => ({ nom: String(a.filename).slice(0, 120), taille: a.size || 0 })) };
  } catch (e) { return { text: '', html: '', pieces: [] }; }
}
let supportBusy = false;
async function releveSupport(importHisto) {   // même mécanique que la relève des boîtes commandes
  if (!supportBox || supportBusy) return; supportBusy = true;
  const { ImapFlow } = require('imapflow'); const { simpleParser } = require('mailparser'); let client;
  try {
    client = new ImapFlow({ host: supportBox.imapHost, port: supportBox.imapPort || 993, secure: true, auth: { user: supportBox.email, pass: supportBox.pass }, logger: false });
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      if (importHisto) {   // à la connexion : les ~30 derniers mails arrivent (sans toucher aux drapeaux)
        const total = (client.mailbox && client.mailbox.exists) || 0;
        if (total) {
          for await (const msg of client.fetch(Math.max(1, total - 29) + ':*', { envelope: true, source: { maxLength: 600000 } })) {
            const env = msg.envelope || {}; const mid = String(env.messageId || '').slice(0, 200);
            if (mid && supMids.has(mid)) continue;
            supportMails.push(supEntry(env, await supCorps(msg.source), true)); if (mid) supMids.add(mid);
          }
        }
      }
      const nouveaux = [];
      for await (const msg of client.fetch({ seen: false }, { envelope: true, source: { maxLength: 600000 } })) nouveaux.push(msg);
      for (const msg of nouveaux) {
        const env = msg.envelope || {}; const mid = String(env.messageId || '').slice(0, 200);
        if (mid && supMids.has(mid)) { try { await client.messageFlagsAdd(msg.seq, ['\\Seen']); } catch (_) {} continue; }
        supportMails.push(supEntry(env, await supCorps(msg.source)));
        if (mid) supMids.add(mid);
        try { await client.messageFlagsAdd(msg.seq, ['\\Seen']); } catch (_) {}
      }
      supSave();
    } finally { lock.release(); }
    await client.logout();
  } catch (e) { console.error('support releve:', e.message); try { if (client) client.close(); } catch (_) {} }
  supportBusy = false;
}
setInterval(() => { releveSupport().catch(() => {}); }, 120000);
setTimeout(() => { releveSupport().catch(() => {}); }, 12000);

// connexion de la boîte support (patron uniquement) — Zimbra OVH par défaut
app.post('/api/monitor/support/connect', monPatronStrict, async (req, res) => {
  const { email, pass, imapHost, imapPort, smtpHost, smtpPort } = req.body || {};
  if (!email || !pass) return res.status(400).json({ error: 'adresse et mot de passe requis' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) return res.status(400).json({ error: 'adresse invalide' });
  const box = { email: monStr(email, 120), pass: String(pass).slice(0, 200),
    imapHost: monStr(imapHost, 100) || 'imap.mail.ovh.net', imapPort: parseInt(imapPort, 10) || 993,
    smtpHost: monStr(smtpHost, 100) || 'smtp.mail.ovh.net', smtpPort: parseInt(smtpPort, 10) || 465, ts: Date.now() };
  try {
    const nodemailer = require('nodemailer');
    const t = nodemailer.createTransport({ host: box.smtpHost, port: box.smtpPort, secure: box.smtpPort === 465, auth: { user: box.email, pass: box.pass }, connectionTimeout: 9000, greetingTimeout: 9000 });
    await t.verify();
  } catch (e) { return res.status(400).json({ error: 'Connexion envoi (SMTP) refusée : ' + String(e.message || e).slice(0, 140) }); }
  try {
    const { ImapFlow } = require('imapflow');
    const c = new ImapFlow({ host: box.imapHost, port: box.imapPort, secure: true, auth: { user: box.email, pass: box.pass }, logger: false });
    await c.connect(); await c.logout();
  } catch (e) { return res.status(400).json({ error: 'Connexion réception (IMAP) refusée : ' + String(e.message || e).slice(0, 140) }); }
  // changement d'adresse : on retire les messages de l'ancienne boîte (ils restent dans la messagerie)
  if (supportBox && supportBox.email && supportBox.email.toLowerCase() !== box.email.toLowerCase()) {
    supportMails.length = 0;
    try { supSave(); } catch (e) {}
  }
  supportBox = box;
  try { fs.writeFileSync(SUPPORT_BOX_PATH, JSON.stringify(box)); } catch (e) {}
  res.json({ ok: true, email: box.email });
  releveSupport(true).catch(() => {});   // import de l'historique en arrière-plan
});
// état de la boîte (sans mot de passe, jamais)
app.get('/api/monitor/support/box', monAdmin, (req, res) => {
  res.json(supportBox ? { connected: true, email: supportBox.email, imapHost: supportBox.imapHost, smtpHost: supportBox.smtpHost } : { connected: false });
});
// liste des mails support
app.get('/api/monitor/support/mails', monAdmin, (req, res) => {
  const list = supportMails.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 200);
  res.json({ mails: list, nonTraites: supportMails.filter(m => m.statut === 'nouveau').length, connected: !!supportBox, email: supportBox ? supportBox.email : '' });
});
// réponse directe depuis le contrôle — envoyée par SMTP au nom de la boîte, tracée au nom de l'agent
app.post('/api/monitor/support/reply', monAdmin, async (req, res) => {
  if (!supportBox) return res.status(503).json({ error: 'boîte support non connectée' });
  const { id, text } = req.body || {};
  const mail = supportMails.find(m => m.id === id);
  if (!mail) return res.status(404).json({ error: 'mail introuvable' });
  const corps = String(text || '').slice(0, 8000);
  if (!corps.trim()) return res.status(400).json({ error: 'réponse vide' });
  try {
    const nodemailer = require('nodemailer');
    const t = nodemailer.createTransport({ host: supportBox.smtpHost, port: supportBox.smtpPort, secure: supportBox.smtpPort === 465, auth: { user: supportBox.email, pass: supportBox.pass }, connectionTimeout: 9000, greetingTimeout: 9000 });
    await t.sendMail({ from: '"TEAM OP" <' + supportBox.email + '>', to: mail.from, subject: (/^re\s*:/i.test(mail.subject) ? mail.subject : 'Re: ' + mail.subject).slice(0, 200), text: corps, inReplyTo: mail.mid || undefined, references: mail.mid || undefined });
  } catch (e) { return res.status(500).json({ error: 'envoi refusé : ' + String(e.message || e).slice(0, 140) }); }
  mail.reponses = (mail.reponses || []).concat([{ ts: Date.now(), par: req.tourUser.nom, text: corps.slice(0, 2000) }]).slice(-20);
  mail.statut = 'traite';
  supSave();
  res.json({ ok: true, mail });
});
// écrire un NOUVEAU message depuis le contrôle (vraie boîte mail : on n'est pas obligé de répondre à un mail reçu)
app.post('/api/monitor/support/envoyer', monAdmin, async (req, res) => {
  if (!supportBox) return res.status(503).json({ error: 'boîte support non connectée' });
  const { to, subject, text } = req.body || {};
  const dest = monStr(to, 200).trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dest.replace(/^.*</, '').replace(/>.*$/, ''))) return res.status(400).json({ error: 'adresse du destinataire invalide' });
  const obj = monStr(subject, 200).trim() || '(sans objet)';
  const corps = String(text || '').slice(0, 8000);
  if (!corps.trim()) return res.status(400).json({ error: 'message vide' });
  try {
    const nodemailer = require('nodemailer');
    const t = nodemailer.createTransport({ host: supportBox.smtpHost, port: supportBox.smtpPort, secure: supportBox.smtpPort === 465, auth: { user: supportBox.email, pass: supportBox.pass }, connectionTimeout: 9000, greetingTimeout: 9000 });
    await t.sendMail({ from: '"TEAM OP" <' + supportBox.email + '>', to: dest, subject: obj, text: corps });
  } catch (e) { return res.status(500).json({ error: 'envoi refusé : ' + String(e.message || e).slice(0, 140) }); }
  supportEnvoyes.unshift({ id: 'e' + crypto.randomBytes(5).toString('hex'), to: dest, subject: obj, text: corps.slice(0, 2000), ts: Date.now(), par: req.tourUser.nom });
  if (supportEnvoyes.length > 100) supportEnvoyes.length = 100;
  supSave();
  res.json({ ok: true });
});
// messages envoyés depuis le contrôle
app.get('/api/monitor/support/envoyes', monAdmin, (req, res) => res.json({ envoyes: supportEnvoyes.slice(0, 60) }));
// retirer un message de la page (il reste dans la messagerie)
app.post('/api/monitor/support/retirer', monAdmin, (req, res) => {
  const i = supportMails.findIndex(m => m.id === (req.body || {}).id);
  if (i < 0) return res.status(404).json({ error: 'mail introuvable' });
  supportMails.splice(i, 1); supSave();
  res.json({ ok: true });
});
// marquer traité / archiver / rouvrir
app.post('/api/monitor/support/marquer', monAdmin, (req, res) => {
  const { id, statut } = req.body || {};
  if (!['nouveau', 'traite', 'archive'].includes(statut)) return res.status(400).json({ error: 'statut invalide' });
  const mail = supportMails.find(m => m.id === id);
  if (!mail) return res.status(404).json({ error: 'mail introuvable' });
  mail.statut = statut; supSave();
  res.json({ ok: true, mail });
});

// ═══════════════════════════════════════════════════════════════════════════
// 🏢 CLIENTS — les comptes clients vivent dans Firebase (espace.html) : le serveur ne les voit pas.
//    Synchronisation légère : espace.html pousse un résumé minimal à chaque visite du client
//    (email, entreprise, applications, demandes, abonnement, promo — JAMAIS de mot de passe).
//    Les données d'un client n'apparaissent donc qu'à partir de sa prochaine visite.
// ═══════════════════════════════════════════════════════════════════════════
const CLIENTS_PATH = path.join(DATA_DIR, 'clients.json');
let clientsData = {};   // email -> { email, nom, entreprise, inscrit, apps, demandes, plan, planStatus, promo, majTs, noteInterne, demandesTraitees }
try { clientsData = JSON.parse(fs.readFileSync(CLIENTS_PATH, 'utf8')); } catch (e) {}
let cliSaveTimer = null;
function cliSave() {
  clearTimeout(cliSaveTimer);
  cliSaveTimer = setTimeout(() => { try { fs.writeFileSync(CLIENTS_PATH, JSON.stringify(clientsData)); } catch (e) { console.error('clients save:', e.message); } }, 400);
}
// ── Preuve d'identité du client : le jeton de connexion Firebase envoyé par espace.html ──
//    Sans cette vérification, n'importe qui pourrait écraser la fiche d'un vrai client en
//    connaissant simplement son adresse e-mail. Le jeton est signé par Google : on contrôle
//    la signature avec les certificats publics de Google, puis on ne retient QUE l'e-mail
//    contenu dans le jeton — jamais celui envoyé dans le corps de la requête.
const FB_PROJET = (config.firebase && config.firebase.projectId) || 'elan-gestion';
const FB_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const fbCerts = { data: null, exp: 0, encours: null };
function fbCertificats() {
  if (fbCerts.data && Date.now() < fbCerts.exp) return Promise.resolve(fbCerts.data);
  if (!fbCerts.encours) {
    fbCerts.encours = (async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const r = await fetch(FB_CERTS_URL, { signal: ctrl.signal });
        if (!r.ok) throw new Error('certificats google HTTP ' + r.status);
        const d = await r.json();
        const m = String(r.headers.get('cache-control') || '').match(/max-age=(\d+)/);
        fbCerts.data = d; fbCerts.exp = Date.now() + (m ? parseInt(m[1], 10) * 1000 : 3600000);
        return d;
      } finally { clearTimeout(t); fbCerts.encours = null; }
    })();
  }
  return fbCerts.encours;
}
const fbB64 = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
async function fbVerifie(jeton) {
  const p = String(jeton || '').split('.');
  if (p.length !== 3) return null;
  let ent, corps;
  try { ent = JSON.parse(fbB64(p[0]).toString('utf8')); corps = JSON.parse(fbB64(p[1]).toString('utf8')); } catch (e) { return null; }
  if (!ent || ent.alg !== 'RS256' || !ent.kid || !corps) return null;
  const now = Math.floor(Date.now() / 1000);
  if (!(parseInt(corps.exp, 10) > now)) return null;                                              // jeton périmé
  if (parseInt(corps.iat, 10) > now + 300) return null;                                           // daté du futur
  if (corps.aud !== FB_PROJET || corps.iss !== 'https://securetoken.google.com/' + FB_PROJET) return null;
  if (!corps.sub) return null;
  const certs = await fbCertificats();
  const cert = certs && certs[ent.kid];
  if (!cert) return null;
  let cle = cert;
  try { if (crypto.X509Certificate) cle = new crypto.X509Certificate(cert).publicKey; } catch (e) { cle = cert; }
  if (!crypto.createVerify('RSA-SHA256').update(p[0] + '.' + p[1]).verify(cle, fbB64(p[2]))) return null;
  return corps;
}
// réception du résumé poussé par espace.html (signé par le client connecté ; données minimales validées)
app.post('/api/clients/sync', async (req, res) => {
  const b = req.body || {};
  let ident = null;
  try { ident = await fbVerifie(String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()); }
  catch (e) { console.error('clients sync jeton:', String(e && e.message || e).slice(0, 200)); ident = null; }
  if (!ident) return res.status(401).json({ error: 'connexion non vérifiée' });
  const email = monStr(ident.email, 120).trim().toLowerCase();   // l'e-mail vient du jeton signé, jamais du corps
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(401).json({ error: 'compte sans e-mail' });
  if (Object.keys(clientsData).length >= 2000 && !clientsData[email]) return res.json({ ok: true });   // cap silencieux
  const prev = clientsData[email] || {};
  const demandes = (Array.isArray(b.demandes) ? b.demandes.slice(0, 20) : []).map(d => ({
    app: monStr(d && d.app, 60), formule: monStr(d && d.formule, 40), statut: monStr(d && d.statut, 20), date: parseInt(d && d.date, 10) || 0, besoin: monStr(d && d.besoin, 200) }));
  clientsData[email] = {
    email, nom: monStr(b.nom, 80), entreprise: monStr(b.entreprise, 80),
    inscrit: parseInt(b.inscrit, 10) || prev.inscrit || Date.now(),
    apps: (Array.isArray(b.apps) ? b.apps.slice(0, 6) : []).map(a => monStr(a, 20)),
    demandes, plan: monStr(b.plan, 40), planStatus: monStr(b.planStatus, 20), promo: monStr(b.promo, 60),
    majTs: Date.now(),
    noteInterne: prev.noteInterne || '',            // les annotations internes du contrôle survivent aux synchros
    metier: prev.metier || '',                      // le métier est fixé depuis le contrôle, jamais par le client
    metierPar: prev.metierPar || '',
    demandesTraitees: prev.demandesTraitees || {}
  };
  cliSave();
  res.json({ ok: true });
});
// lecture depuis le contrôle (patron ET collaborateurs)
app.get('/api/monitor/clients', monAdmin, (req, res) => {
  const list = Object.values(clientsData).sort((a, b) => (b.majTs || 0) - (a.majTs || 0));
  res.json({ clients: list, total: list.length });
});
// métier du client : c'est lui qui décide du pack livré, et qui sépare les évolutions par métier
app.post('/api/monitor/clients/metier', monAdmin, (req, res) => {
  const email = monStr((req.body || {}).email, 120).toLowerCase();
  const c = clientsData[email];
  if (!c) return res.status(404).json({ error: 'client introuvable' });
  const met = monStr((req.body || {}).metier, 30);
  c.metier = met;
  c.metierPar = met ? (req.tourUser.nom + ' · ' + new Date().toLocaleDateString('fr-FR')) : '';
  cliSave();
  res.json({ ok: true, client: c });
});
// historique complet : tout ce qui est sorti de la liste vivante, jamais supprimé
app.get('/api/monitor/issues/archive', monAdmin, (req, res) => {
  res.json({ archive: monArchive, total: monArchive.length, vivants: monIssues.length });
});
// note interne sur un client (tracée)
app.post('/api/monitor/clients/note', monAdmin, (req, res) => {
  const email = monStr((req.body || {}).email, 120).toLowerCase();
  const c = clientsData[email];
  if (!c) return res.status(404).json({ error: 'client introuvable' });
  const note = monStr((req.body || {}).note, 500);
  c.noteInterne = note ? (note + '\n— ' + req.tourUser.nom + ', ' + new Date().toLocaleDateString('fr-FR')) : '';
  cliSave();
  res.json({ ok: true, client: c });
});
// marquer une demande d'accès traitée côté contrôle (suivi interne, tracé)
app.post('/api/monitor/clients/demande', monAdmin, (req, res) => {
  const email = monStr((req.body || {}).email, 120).toLowerCase();
  const c = clientsData[email];
  if (!c) return res.status(404).json({ error: 'client introuvable' });
  const idx = parseInt((req.body || {}).idx, 10);
  if (!(idx >= 0 && idx < (c.demandes || []).length)) return res.status(400).json({ error: 'demande introuvable' });
  c.demandesTraitees = c.demandesTraitees || {};
  if ((req.body || {}).traite === false) delete c.demandesTraitees[idx];
  else c.demandesTraitees[idx] = { par: req.tourUser.nom, ts: Date.now() };
  cliSave();
  res.json({ ok: true, client: c });
});

// ═══════════════════════════════════════════════════════════════════════════
// 💳 STRIPE — lecture seule des abonnements et des paiements pour la tour de contrôle.
//    La clé secrète reste dans /opt/teamop/config.json (set-stripe.sh) : elle ne sort JAMAIS du serveur.
//    Résultats gardés 5 minutes en mémoire pour ne pas interroger Stripe à chaque ouverture de page.
//    Si Stripe ne répond pas : on renvoie le dernier résultat connu, sinon une liste vide + un message.
// ═══════════════════════════════════════════════════════════════════════════
const STRIPE_MON_TTL = 5 * 60000;   // fraîcheur du cache : 5 minutes
const STRIPE_MON_PAUSE = 60000;     // après un échec Stripe : on attend 1 minute avant de retenter
//   ts = date des chiffres en cache · echec = date du dernier échec · encours = appel déjà en route (deux
//   onglets ouverts n'interrogent Stripe qu'une seule fois)
const stripeMonCache = { abos: { ts: 0, data: null, echec: 0, encours: null }, paiements: { ts: 0, data: null, echec: 0, encours: null } };
const stripeEur = n => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
const STRIPE_INDISPO = 'Connexion à Stripe impossible pour le moment — réessaie dans quelques minutes.';
// journalisation sans jamais recopier un morceau de la clé Stripe dans les journaux du serveur
const stripeLog = e => String((e && e.message) || e).replace(/\b(sk|rk|pk)_[A-Za-z0-9_*]+/g, '[clé]').slice(0, 200);
// chiffres périmés : on les renvoie plutôt que rien, mais clairement marqués (la tour affiche leur date)
function stripeVieux(c, vide) {
  if (c.data) return Object.assign({}, c.data, { perime: true, majTs: c.ts, erreur: STRIPE_INDISPO });
  return Object.assign({}, vide, { erreur: STRIPE_INDISPO });
}
// un seul appel Stripe à la fois par jeu de données, et pas de nouvelle tentative pendant 1 minute après un échec
function stripeCache(c, vide, calcul, quoi) {
  if (c.data && !c.echec && Date.now() - c.ts < STRIPE_MON_TTL) return Promise.resolve(c.data);
  if (c.echec && Date.now() - c.echec < STRIPE_MON_PAUSE) return Promise.resolve(stripeVieux(c, vide));
  if (!c.encours) {
    c.encours = calcul()
      .then(out => { c.data = out; c.ts = Date.now(); c.echec = 0; return out; })
      .catch(e => { console.error(quoi + ':', stripeLog(e)); c.echec = Date.now(); return stripeVieux(c, vide); })
      .then(d => { c.encours = null; return d; }, e => { c.encours = null; throw e; });
  }
  return c.encours;
}

// appel GET vers l'API Stripe (même principe que /api/stripe/prices : Authorization Bearer + clé serveur)
async function stripeMonGet(url, sk) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);   // pas d'attente infinie si Stripe ne répond pas
  try {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + sk }, signal: ctrl.signal });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((d.error && d.error.message) || ('stripe HTTP ' + r.status));
    return d;
  } finally { clearTimeout(t); }
}
// le client peut arriver sous forme d'objet (expand) ou d'identifiant seul, et peut avoir été supprimé
function stripeClient(c) {
  if (!c || typeof c !== 'object' || c.deleted) return { nom: '', email: '' };
  return { nom: monStr(c.name, 120), email: monStr(c.email, 120) };
}

// ── Abonnements en cours + revenu mensuel récurrent
const STRIPE_ABOS_VIDE = { ok: true, configured: true, abos: [], mrr: 0, actifs: 0, impayes: 0 };
// Stripe ne renvoie que 100 abonnements par appel : on tourne les pages tant qu'il en reste
// (sinon, dès qu'une centaine d'abonnements auront existé, des abonnés actifs disparaîtraient sans bruit).
let stripeAbosDetail = null;   // niveau de détail accepté par ce compte Stripe (retenu pour ne pas retâtonner)
async function stripeAbosBruts(sk) {
  const base = 'https://api.stripe.com/v1/subscriptions?limit=100&status=all&expand[]=data.customer';
  // on demande le maximum de détails ; si le compte Stripe refuse une expansion, on redemande en dégradant
  const details = ['&expand[]=data.items.data.price.product&expand[]=data.discounts.coupon',
                   '&expand[]=data.items.data.price.product', ''];
  if (stripeAbosDetail !== null) details.unshift(stripeAbosDetail);
  let sfx = null, prem = null, dernErr = null;
  for (const o of details) {
    try { prem = await stripeMonGet(base + o, sk); sfx = o; break; } catch (e) { dernErr = e; }
  }
  if (sfx === null) throw dernErr || new Error('stripe abonnements');
  stripeAbosDetail = sfx;
  let tous = (prem.data || []).slice();
  let apres = tous.length ? tous[tous.length - 1].id : '';
  let encore = !!prem.has_more, pages = 0;
  while (encore && apres && ++pages < 10) {   // plafond de sécurité : 10 pages = 1000 abonnements
    const d2 = await stripeMonGet(base + sfx + '&starting_after=' + encodeURIComponent(apres), sk);
    const lot = d2.data || [];
    tous = tous.concat(lot);
    apres = lot.length ? lot[lot.length - 1].id : '';
    encore = !!d2.has_more;
  }
  return tous;
}
// périodicité lisible : « mois », « an », « 3 mois »… (interval_count > 1 : tarif trimestriel, semestriel, etc.)
function stripePeriode(inter, n) {
  const un = { month: 'mois', year: 'an', week: 'semaine', day: 'jour' }[inter];
  if (!un) return '';
  if (n <= 1) return un;
  return n + ' ' + (inter === 'month' ? 'mois' : inter === 'year' ? 'ans' : inter === 'week' ? 'semaines' : 'jours');
}
async function stripeAbosCalc(sk) {
  const bruts = await stripeAbosBruts(sk);
  let mrr = 0, actifs = 0, impayes = 0;
  const abos = bruts.map(s => {
    const items = (s.items && Array.isArray(s.items.data)) ? s.items.data : [];
    let montant = 0, mensuel = 0, periodicite = '', libelles = [];
    for (const it of items) {
      const px = it && it.price;
      if (!px) continue;
      const qte = Math.max(1, parseInt(it.quantity, 10) || 1);
      const ligne = ((parseInt(px.unit_amount, 10) || 0) / 100) * qte;
      montant += ligne;
      const inter = px.recurring && px.recurring.interval;
      const n = Math.max(1, parseInt(px.recurring && px.recurring.interval_count, 10) || 1);   // « tous les 3 mois » = 3
      // tout est ramené au mois pour le compteur « revenu mensuel »
      if (inter === 'month') mensuel += ligne / n;
      else if (inter === 'year') mensuel += ligne / (12 * n);
      else if (inter === 'week') mensuel += ligne * 52 / (12 * n);
      else if (inter === 'day') mensuel += ligne * 365 / (12 * n);
      if (!periodicite) periodicite = stripePeriode(inter, n);
      const nom = (px.product && typeof px.product === 'object' ? monStr(px.product.name, 80) : '') || monStr(px.nickname, 80);
      if (nom && libelles.indexOf(nom) === -1) libelles.push(nom);
    }
    // remises et codes promo (le paiement en ligne accepte les codes promo) : le montant affiché doit être celui payé
    const plein = montant;
    const rems = (Array.isArray(s.discounts) ? s.discounts : (s.discount ? [s.discount] : [])).map(x => x && x.coupon).filter(Boolean);
    for (const co of rems) {
      if (co.percent_off) montant *= (1 - co.percent_off / 100);
      else if (co.amount_off) montant = Math.max(0, montant - co.amount_off / 100);
    }
    if (plein > 0 && montant !== plein) mensuel *= (montant / plein);   // la remise vaut aussi pour le revenu mensuel
    const st = String(s.status || '');
    const statut = st === 'active' ? 'actif' : st === 'trialing' ? 'essai'
      : (st === 'past_due' || st === 'unpaid') ? 'impaye'
      : st === 'canceled' ? 'annule'
      : st.indexOf('incomplete') === 0 ? 'incomplet' : 'autre';
    if (statut === 'actif' || statut === 'essai') { actifs++; mrr += mensuel; }
    if (statut === 'impaye') impayes++;
    const cli = stripeClient(s.customer);
    // selon la version d'API, la fin de période est portée par l'abonnement ou par sa première ligne
    const fin = parseInt(s.current_period_end, 10) || parseInt(items[0] && items[0].current_period_end, 10) || 0;
    return { id: monStr(s.id, 60), clientNom: cli.nom, clientEmail: cli.email,
      formule: libelles.join(' + '), montant: stripeEur(montant), periodicite, statut,
      debut: (parseInt(s.start_date, 10) || 0) * 1000, prochaine: fin * 1000 };
  });
  return { ok: true, configured: true, abos, mrr: stripeEur(mrr), actifs, impayes };
}
app.get('/api/monitor/stripe/abos', monAdmin, async (req, res) => {
  const sk = config.stripe && config.stripe.secretKey;
  if (!sk) return res.json({ ok: true, configured: false, abos: [], mrr: 0, actifs: 0, impayes: 0 });
  try { res.json(await stripeCache(stripeMonCache.abos, STRIPE_ABOS_VIDE, () => stripeAbosCalc(sk), 'stripe abos')); }
  catch (e) { console.error('stripe abos:', stripeLog(e)); res.json(Object.assign({}, STRIPE_ABOS_VIDE, { erreur: STRIPE_INDISPO })); }
});

// ── Alerte automatique : un paiement en échec des 7 derniers jours devient un problème dans la tour
//    (même structure d'objet et même sauvegarde que /api/monitor/report, dédoublonnage par signature)
function stripeAlerteImpaye(paiements) {
  const lim = Date.now() - 7 * 86400000;
  let change = false;
  for (const p of paiements) {
    if (p.statut !== 'echec' || !(p.date > lim)) continue;
    const signature = 'stripe|paiement-echec|' + p.id;   // une entrée par facture : jamais de doublon
    const nom = p.clientNom || p.clientEmail || 'client inconnu';
    const quand = p.date || Date.now();
    let issue = monIssues.find(i => i.signature === signature);
    if (!issue) {
      issue = { id: 'i' + crypto.randomBytes(6).toString('hex'), signature, app: 'stripe', version: '',
        categorie: 'Paiements', type: 'reseau', message: monStr('Paiement en échec — ' + nom, 300),
        stack: '', src: '', line: 0, entreprises: [], appareils: {}, count: 1,
        firstTs: quand, lastTs: quand, statut: 'nouveau', notes: '', mailEnvoye: false };
      if (nom !== 'client inconnu') issue.entreprises.push({ nom: monStr(nom, 80), email: monStr(p.clientEmail, 120), count: 1, lastTs: quand });
      monIssues.push(issue); change = true;
    } else if ((issue.lastTs || 0) < quand) { issue.lastTs = quand; change = true; }
  }
  if (change) monSave();
}

// ── Derniers paiements (factures) + nombre d'échecs
const STRIPE_PAY_VIDE = { ok: true, configured: true, paiements: [], echecs: 0 };
const STRIPE_PAY_URL = 'https://api.stripe.com/v1/invoices?limit=50&expand[]=data.customer';
// une facture Stripe → une ligne de paiement (renvoie null pour ce qui n'est pas un paiement)
function stripePaiement(f) {
  if (!f || typeof f !== 'object') return null;
  const st = String(f.status || '');
  if (st === 'draft') return null;   // brouillon jamais envoyé : ce n'est pas un paiement
  let statut = st === 'paid' ? 'paye' : st === 'open' ? 'ouvert'
    : st === 'uncollectible' ? 'echec' : st === 'void' ? 'annule' : 'autre';   // « annulée » par vous ≠ échec de paiement
  if (f.attempted && !f.paid && statut !== 'paye' && statut !== 'annule') statut = 'echec';   // tentative de prélèvement refusée
  const cli = stripeClient(f.customer);
  const cents = parseInt(f.amount_paid, 10) || parseInt(f.amount_due, 10) || 0;
  const paidAt = parseInt(f.status_transitions && f.status_transitions.paid_at, 10) || 0;
  const lien = String(f.hosted_invoice_url || '');
  return { id: monStr(f.id, 60),
    clientNom: cli.nom || monStr(f.customer_name, 120), clientEmail: cli.email || monStr(f.customer_email, 120),
    montant: stripeEur(cents / 100), date: (paidAt || parseInt(f.created, 10) || 0) * 1000,
    statut, url: /^https:\/\//.test(lien) ? monStr(lien, 400) : '' };   // seule une vraie adresse Stripe est transmise
}
function stripePaiements(d) { return ((d && d.data) || []).map(stripePaiement).filter(Boolean); }
// factures encore impayées des 30 derniers jours : c'est là-dessus que se comptent les échecs et les alertes,
// pour qu'un impayé ne sorte pas du compteur simplement parce que 50 factures récentes sont passées devant.
function stripeImpayesUrl() {
  return 'https://api.stripe.com/v1/invoices?status=open&limit=100&expand[]=data.customer&created[gte]=' + Math.floor((Date.now() - 30 * 86400000) / 1000);
}
async function stripePaiementsCalc(sk) {
  const paiements = stripePaiements(await stripeMonGet(STRIPE_PAY_URL, sk));
  const parId = {};
  paiements.filter(p => p.statut === 'echec').forEach(p => { parId[p.id] = p; });
  try { stripePaiements(await stripeMonGet(stripeImpayesUrl(), sk)).forEach(p => { if (p.statut === 'echec') parId[p.id] = p; }); }
  catch (e) { console.error('stripe impayés:', stripeLog(e)); }   // liste affichée quand même : on garde les échecs déjà vus
  const echecs = Object.keys(parId);
  try { stripeAlerteImpaye(echecs.map(k => parId[k])); } catch (e) { console.error('stripe alerte:', stripeLog(e)); }
  return { ok: true, configured: true, paiements, echecs: echecs.length };
}
app.get('/api/monitor/stripe/paiements', monAdmin, async (req, res) => {
  const sk = config.stripe && config.stripe.secretKey;
  if (!sk) return res.json({ ok: true, configured: false, paiements: [], echecs: 0 });
  try { res.json(await stripeCache(stripeMonCache.paiements, STRIPE_PAY_VIDE, () => stripePaiementsCalc(sk), 'stripe paiements')); }
  catch (e) { console.error('stripe paiements:', stripeLog(e)); res.json(Object.assign({}, STRIPE_PAY_VIDE, { erreur: STRIPE_INDISPO })); }
});
// ── Veille : les impayés remontent tout seuls, même si personne n'ouvre la tour de contrôle du week-end
if (config.stripe && config.stripe.secretKey) {
  setInterval(() => {
    stripeMonGet(stripeImpayesUrl(), config.stripe.secretKey)
      .then(d => stripeAlerteImpaye(stripePaiements(d)))
      .catch(e => console.error('stripe veille:', stripeLog(e)));
  }, 15 * 60000).unref();
}

// ═══ MESSAGERIE COMPLÈTE (plusieurs boîtes : réception, envoi, dossiers, pièces jointes) ═══
try {
  const pousseNotif = async (titre, corps, url) => {
    const payload = JSON.stringify({ title: String(titre).slice(0, 120), body: String(corps || '').slice(0, 300), url: url || '/tour.html#support' });
    const cibles = Object.values(subs).filter(x => /^teamop-controle/.test(x.teamId || ''));
    for (const t of cibles) {
      try { await webpush.sendNotification(t.sub, payload); }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) { delete subs[t.sub.endpoint]; saveSubs(); } }
    }
    return cibles.length;
  };
  require('./mail')(app, { DATA_DIR, monAdmin, monPatronStrict, monStr, pousseNotif });
  console.log('messagerie : module chargé');
} catch (e) { console.error('messagerie indisponible :', e.message); }

/* ══════════ DEVIS IA — génération de devis par Claude ══════════
   La clé API vit UNIQUEMENT dans /opt/teamop/config.json → bloc "anthropic" :
     "anthropic": { "cleApi": "sk-ant-…", "secretDevis": "<code partagé à l'équipe>", "quotaJour": 100 }
   Elle ne transite jamais par le navigateur ni par le dépôt. L'app envoie le
   code d'équipe + la demande ; le serveur appelle Claude et renvoie les lignes. */
const DEVIS_QUOTA_PATH = path.join(DATA_DIR, 'devis-quota.json');
let devisQuota = { jour: '', n: 0 };
try { devisQuota = JSON.parse(fs.readFileSync(DEVIS_QUOTA_PATH, 'utf8')); } catch (e) {}
function devisConf() { return config.anthropic || {}; }
function devisActif() { return !!devisConf().cleApi; }
/* ── Accès par entreprise : activé depuis la Tour de contrôle — aucun code ni clé ne
   circule chez les clients. data/devis-acces.json : { "<espace>": { actif, depuis, n, dernier } }
   L'ancien code partagé (secretDevis) reste accepté en dépannage tant qu'il est configuré. */
const DEVIS_ACCES_PATH = path.join(DATA_DIR, 'devis-acces.json');
let devisAcces = {};
try { devisAcces = JSON.parse(fs.readFileSync(DEVIS_ACCES_PATH, 'utf8')); } catch (e) {}
function saveDevisAcces() { try { fs.writeFileSync(DEVIS_ACCES_PATH, JSON.stringify(devisAcces)); } catch (e) {} }
function devisTeamOk(team) { const t = devisAcces[String(team || '').trim().slice(0, 80)]; return !!(t && t.actif); }
function devisQuotaJour() { return Number(devisConf().quotaJour) || 100; }
function devisUtilises() {
  const auj = new Date().toISOString().slice(0, 10);
  if (devisQuota.jour !== auj) devisQuota = { jour: auj, n: 0 };
  return devisQuota.n;
}
function devisCompte() { devisUtilises(); devisQuota.n++; try { fs.writeFileSync(DEVIS_QUOTA_PATH, JSON.stringify(devisQuota)); } catch (e) {} }

app.get('/api/devis/etat', (req, res) => {
  const team = String(req.query.team || '').trim().slice(0, 80);
  const rep = { ok: true, actif: devisActif(), quotaJour: devisQuotaJour(), utilises: devisUtilises(), restants: Math.max(0, devisQuotaJour() - devisUtilises()) };
  if (team) rep.equipe = devisActif() && devisTeamOk(team);
  res.json(rep);
});

let anthropicClient = null;
function getAnthropic() {
  if (!anthropicClient) {
    const Anthropic = require('@anthropic-ai/sdk');
    anthropicClient = new Anthropic({ apiKey: devisConf().cleApi });
  }
  return anthropicClient;
}

// Le schéma garantit une réponse JSON exploitable : mêmes champs que les lignes de devis de l'app
const DEVIS_SCHEMA = {
  type: 'object',
  properties: {
    titre: { type: 'string' },
    lignes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { designation: { type: 'string' }, qte: { type: 'number' }, pu: { type: 'number' } },
        required: ['designation', 'qte', 'pu'],
        additionalProperties: false
      }
    },
    tva: { type: 'number' },
    remarque: { type: 'string' }
  },
  required: ['titre', 'lignes', 'tva', 'remarque'],
  additionalProperties: false
};

app.post('/api/devis/generer', async (req, res) => {
  try {
    if (!devisActif()) return res.status(503).json({ error: "Devis IA non configuré sur le serveur (config.json → anthropic)" });
    const { code, team, demande, client: cli, contexte } = req.body || {};
    const teamKey = String(team || '').trim().slice(0, 80);
    const okEquipe = devisTeamOk(teamKey);
    const okCode = !!(code && devisConf().secretDevis && String(code) === String(devisConf().secretDevis));
    if (!okEquipe && !okCode) return res.status(401).json({ error: "Devis IA non activé pour cette entreprise — demande l'activation à TeamOP" });
    if (!demande || String(demande).trim().length < 5) return res.status(400).json({ error: 'Décris la prestation à chiffrer' });
    if (devisUtilises() >= devisQuotaJour()) return res.status(429).json({ error: 'Quota du jour atteint (' + devisQuotaJour() + ' devis) — réessaie demain' });

    const sys = "Tu prépares des devis pour une entreprise française de gestion de nuisibles (dératisation, désinsectisation, désinfection, dépigeonnage) et petits travaux associés. À partir de la demande, produis un devis réaliste et sobre : des lignes claires (désignation précise, quantité, prix unitaire HT en euros, cohérent avec le marché français), la main d'œuvre et le déplacement en lignes séparées quand c'est pertinent, TVA 20 par défaut (10 seulement pour des travaux d'amélioration d'un logement de plus de 2 ans). « remarque » : 1 ou 2 phrases utiles pour le client (garantie, nombre de passages, conditions). Pas de lignes de remplissage.";
    const msg = await getAnthropic().messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      system: sys,
      output_config: { format: { type: 'json_schema', schema: DEVIS_SCHEMA } },
      messages: [{
        role: 'user',
        content: 'Demande : ' + String(demande).slice(0, 2000)
          + (cli ? '\nClient : ' + String(cli).slice(0, 300) : '')
          + (contexte ? '\nContexte : ' + String(contexte).slice(0, 1000) : '')
      }]
    });
    if (msg.stop_reason === 'refusal') return res.status(422).json({ error: 'Génération refusée — reformule la demande' });
    const texte = (msg.content.find(b => b.type === 'text') || {}).text || '';
    let devis; try { devis = JSON.parse(texte); } catch (e) { return res.status(502).json({ error: 'Réponse illisible, réessaie' }); }
    devisCompte();
    if (okEquipe) { const t = devisAcces[teamKey]; t.n = (t.n || 0) + 1; t.dernier = new Date().toISOString().slice(0, 10); saveDevisAcces(); }
    res.json({ ok: true, devis, restants: Math.max(0, devisQuotaJour() - devisUtilises()) });
  } catch (e) {
    const status = e && e.status;
    if (status === 401) return res.status(502).json({ error: 'Clé API invalide côté serveur — vérifier config.json → anthropic.cleApi' });
    if (status === 429 || status === 529) return res.status(503).json({ error: 'Service IA saturé — réessaie dans une minute' });
    console.error('devis IA:', e && e.message);
    res.status(500).json({ error: 'Erreur du serveur de devis' });
  }
});

// ── Tour de contrôle : activation du Devis IA entreprise par entreprise.
//    Le patron active/désactive un espace depuis tour.html — rien à donner aux clients.
app.get('/api/monitor/devisia', monAdmin, (req, res) => {
  res.json({ ok: true, cle: devisActif(), quotaJour: devisQuotaJour(), utilises: devisUtilises(), equipes: devisAcces });
});
app.post('/api/monitor/devisia', monAdmin, (req, res) => {
  const b = req.body || {};
  const team = String(b.teamId || '').trim().slice(0, 80);
  if (!team) return res.status(400).json({ error: "code d'espace requis" });
  if (b.supprimer) delete devisAcces[team];
  else if (b.actif) devisAcces[team] = { ...(devisAcces[team] || {}), actif: true, depuis: (devisAcces[team] || {}).depuis || new Date().toISOString().slice(0, 10) };
  else if (devisAcces[team]) devisAcces[team].actif = false;
  saveDevisAcces();
  res.json({ ok: true, equipes: devisAcces });
});

/* ══════════ CODES PROMO — mois offerts, sans carte bancaire ══════════
   Les codes vivent dans /opt/teamop/config.json → "promos" :
     "promos": [ { "code": "BIENVENUE3", "formule": "premium", "mois": 3, "maxUtilisations": 50 } ]
   formule : pro | business | premium. Les usages sont comptés dans
   data/promos-usages.json — un même code ne compte qu'une fois par équipe. */
const PROMO_USAGE_PATH = path.join(DATA_DIR, 'promos-usages.json');
let promoUsages = {};
try { promoUsages = JSON.parse(fs.readFileSync(PROMO_USAGE_PATH, 'utf8')); } catch (e) {}
function savePromoUsages() { try { fs.writeFileSync(PROMO_USAGE_PATH, JSON.stringify(promoUsages)); } catch (e) {} }

app.post('/api/promo/valider', (req, res) => {
  const { code, teamId, apercu } = req.body || {};
  const c = String(code || '').trim().toUpperCase();
  if (!c) return res.status(400).json({ error: 'Entre ton code promo' });
  const p = (config.promos || []).find(x => String(x.code || '').trim().toUpperCase() === c);
  if (!p) return res.status(404).json({ error: 'Code promo inconnu' });
  const u = promoUsages[c] || { n: 0, equipes: {} };
  const team = String(teamId || '').slice(0, 80);
  const deja = team && u.equipes[team];
  if (!deja && p.maxUtilisations && u.n >= p.maxUtilisations) return res.status(410).json({ error: "Ce code a atteint son nombre maximum d'utilisations" });
  const mois = Math.max(1, Number(p.mois) || 1);
  let finLe;
  if (deja) {
    finLe = deja.finLe;   // le même code retape par la même équipe : on redonne la même échéance
  } else {
    const d = new Date(); d.setMonth(d.getMonth() + mois);
    finLe = d.toISOString().slice(0, 10);
    if (!apercu) { u.n++; if (team) u.equipes[team] = { date: new Date().toISOString().slice(0, 10), finLe }; promoUsages[c] = u; savePromoUsages(); }
  }
  res.json({ ok: true, formule: ['pro', 'business', 'premium'].includes(p.formule) ? p.formule : 'premium', mois, finLe, dejaUtilise: !!deja });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '127.0.0.1', () => console.log('TeamOP API sur 127.0.0.1:' + PORT));
