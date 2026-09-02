// Serveur TeamOP — notifications push + e-mails automatiques
// Config lue dans /opt/teamop/config.json (générée par install.sh)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const webpush = require('web-push');
const nodemailer = require('nodemailer');

const CONFIG_PATH = process.env.TEAMOP_CONFIG || '/opt/teamop/config.json';
const DATA_DIR = process.env.TEAMOP_DATA || '/opt/teamop/data';
const SUBS_PATH = path.join(DATA_DIR, 'subscriptions.json');

let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  console.error('Config illisible (' + CONFIG_PATH + ') : ' + e.message);
  console.error("Relancer server/install.sh, ou corriger le JSON à la main.");
  process.exit(1);
}
fs.mkdirSync(DATA_DIR, { recursive: true });

webpush.setVapidDetails('mailto:' + (config.contactEmail || 'contact@teamop.fr'), config.vapidPublicKey, config.vapidPrivateKey);

// ── stockage des abonnements push : { endpoint: {sub, teamId, userId, userName, ts} }
let subs = {};
try {
  subs = JSON.parse(fs.readFileSync(SUBS_PATH, 'utf8'));
} catch (e) {
  // ENOENT au premier démarrage = normal. Tout le reste est une corruption qu'il faut voir passer.
  if (e.code !== 'ENOENT') console.error('subscriptions.json illisible, on repart à vide :', e.message);
}
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
  mailer = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port || 465,
    secure: (config.smtp.port || 465) === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass }
  });
}

// ══════════════════════════════════════════════════════════════
//  Authentification par équipe
//
//  config.teamTokens : { "<motif d'équipe>": "<secret>" }
//  config.openTeams  : [ "<motif d'équipe>" ]  ← équipes VOLONTAIREMENT non authentifiées
//
//  Un motif est soit un teamId exact ("elan-gestion"), soit un préfixe
//  terminé par '*' ("opmsg-user-*"). Une équipe qui ne correspond à aucun
//  motif est refusée : la configuration est fail-closed par défaut.
//
//  openTeams existe parce que le push d'OP MESSAGES est structurellement
//  inauthentifiable par jeton partagé : l'expéditeur notifie un AUTRE
//  utilisateur (le 'opmsg-user-<uid>' du destinataire), donc un jeton lié au
//  destinataire devrait être connu de tous les expéditeurs — c'est-à-dire
//  public. Fermer ce trou demande d'authentifier l'expéditeur (ID Token
//  Firebase vérifié par firebase-admin). Tant que ce n'est pas fait, ces
//  équipes restent ouvertes, et le serveur le rappelle à chaque démarrage.
// ══════════════════════════════════════════════════════════════
const TEAM_TOKENS = config.teamTokens || {};
const OPEN_TEAMS = config.openTeams || [];

if (!Object.keys(TEAM_TOKENS).length && !OPEN_TEAMS.length) {
  console.error('Aucune équipe déclarée dans config.json (teamTokens / openTeams).');
  console.error('Lancer  bash server/set-team-token.sh  pour en générer une, puis redémarrer.');
  process.exit(1);
}

function matchPattern(teamId, pattern) {
  if (pattern.endsWith('*')) return teamId.startsWith(pattern.slice(0, -1));
  return teamId === pattern;
}
function teamSecret(teamId) {
  for (const p of Object.keys(TEAM_TOKENS)) if (matchPattern(teamId, p)) return TEAM_TOKENS[p];
  return null;
}
function teamIsOpen(teamId) {
  return OPEN_TEAMS.some(p => matchPattern(teamId, p));
}

// Comparaison à temps constant — évite de fuir le secret octet par octet.
function safeEqual(a, b) {
  const x = Buffer.from(String(a == null ? '' : a), 'utf8');
  const y = Buffer.from(String(b == null ? '' : b), 'utf8');
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function requireTeamAuth(req, res, next) {
  const teamId = String((req.body && req.body.teamId) || '');
  if (!teamId) return res.status(400).json({ error: 'teamId requis' });
  const secret = teamSecret(teamId);
  if (secret) {
    if (!safeEqual(req.headers['x-teamop-token'], secret)) return res.status(401).json({ error: 'jeton d\'équipe invalide' });
    return next();
  }
  if (teamIsOpen(teamId)) return next();
  return res.status(403).json({ error: 'équipe inconnue' });
}

const app = express();
app.use(express.json({ limit: '256kb' }));

// CORS — uniquement le site TeamOP
const ORIGINS = config.origins || ['https://teamop.fr', 'https://www.teamop.fr'];
app.use((req, res, next) => {
  const o = req.headers.origin;
  if (o && ORIGINS.includes(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-TeamOP-Token');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Origin vérifié côté serveur : le CORS n'est respecté que par les navigateurs,
// un client scripté l'ignore. Sur les routes qui ont un effet, on refuse
// franchement une origine non autorisée. Une requête sans Origin (curl, appel
// serveur à serveur) reste acceptée : la protection utile là est le jeton.
app.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  const o = req.headers.origin;
  if (o && !ORIGINS.includes(o)) return res.status(403).json({ error: 'origine non autorisée' });
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
// Limite par destinataire : sans elle, la seule borne est 120 req/min/IP, ce qui
// laisse inonder la boîte d'une victime de codes expédiés sous l'identité TeamOP.
const codeQuota = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, q] of codeQuota) if (now > q.reset) codeQuota.delete(k);
}, 600000).unref();

app.post('/api/sendcode', async (req, res) => {
  const { teamId, email, purpose } = req.body || {};
  if (!teamId || !email) return res.status(400).json({ error: 'teamId et email requis' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) return res.status(400).json({ error: 'adresse invalide' });
  if (!mailer) return res.status(503).json({ error: 'email_off' });

  const qk = String(email).toLowerCase() + '|' + String(teamId);
  const q = codeQuota.get(qk) || { count: 0, reset: Date.now() + 3600000 };
  if (Date.now() > q.reset) { q.count = 0; q.reset = Date.now() + 3600000; }
  if (q.count >= 5) return res.status(429).json({ error: 'trop de codes demandés, réessayer plus tard' });
  q.count++; codeQuota.set(qk, q);

  const code = String(crypto.randomInt(100000, 1000000));
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
  if (!safeEqual(String(code), c.code)) return res.status(400).json({ ok: false, error: 'code incorrect' });
  codes.delete(k);
  res.json({ ok: true });
});

app.get('/health', (req, res) => res.json({ ok: true, subs: Object.keys(subs).length, email: !!mailer }));
app.get('/api/vapid', (req, res) => res.json({ key: config.vapidPublicKey }));

// abonnement push d'un appareil
app.post('/api/subscribe', requireTeamAuth, (req, res) => {
  const { sub, teamId, userId, userName } = req.body || {};
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'sub requis' });
  subs[sub.endpoint] = { sub, teamId: String(teamId).slice(0, 80), userId: String(userId || '').slice(0, 80), userName: String(userName || '').slice(0, 80), ts: Date.now() };
  saveSubs();
  res.json({ ok: true });
});

app.post('/api/unsubscribe', (req, res) => {
  const ep = req.body && req.body.endpoint;
  if (ep && subs[ep]) { delete subs[ep]; saveSubs(); }
  res.json({ ok: true });
});

// L'URL poussée est ouverte par le service worker au clic. Sans contrôle, une
// notification portant l'identité « TeamOP » peut amener l'utilisateur
// n'importe où : on n'accepte qu'un chemin relatif ou une origine autorisée.
function safePushUrl(url) {
  const u = String(url == null ? '/app.html' : url).slice(0, 200);
  if (u.startsWith('/') && !u.startsWith('//')) return u;
  try { if (ORIGINS.includes(new URL(u).origin)) return u; } catch (e) { /* URL illisible → défaut */ }
  return '/app.html';
}

// envoi d'une notification à une équipe (tous ses appareils abonnés)
app.post('/api/notify', requireTeamAuth, async (req, res) => {
  const { teamId, title, body, url, exceptUserId, userIds } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title requis' });
  const payload = JSON.stringify({
    title: String(title).slice(0, 120),
    body: String(body || '').slice(0, 300),
    url: safePushUrl(url)
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
app.post('/api/sendmail', requireTeamAuth, async (req, res) => {
  const { teamId, to, subject, text, smtp, brand } = req.body || {};
  if (!to || !subject) return res.status(400).json({ error: 'to et subject requis' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to))) return res.status(400).json({ error: 'destinataire invalide' });
  // Défense en profondeur : le jeton a déjà tranché, mais on garde l'exigence
  // qu'au moins un appareil de l'équipe soit abonné.
  if (!Object.values(subs).some(s => s.teamId === teamId)) return res.status(403).json({ error: 'équipe inconnue' });
  const q = mailQuota.get(teamId) || { count: 0, reset: Date.now() + 3600000 };
  if (Date.now() > q.reset) { q.count = 0; q.reset = Date.now() + 3600000; }
  if (q.count >= 30) return res.status(429).json({ error: 'quota horaire atteint (30 e-mails/h)' });
  q.count++; mailQuota.set(teamId, q);
  const msg = { to, subject: String(subject).slice(0, 200), text: String(text || '').slice(0, 10000) };
  try {
    if (smtp && smtp.user && smtp.pass && smtp.host) {
      // Mode avancé : boîte de l'entreprise / de l'utilisateur
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
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// envoi d'e-mail (rapports, avis de passage) — nécessite la config smtp
app.post('/api/email', async (req, res) => {
  if (!mailer) return res.status(503).json({ error: "e-mail non configuré sur le serveur (config.json → smtp)" });
  const { key, to, subject, text, html } = req.body || {};
  if (!safeEqual(key, config.apiKey)) return res.status(403).json({ error: 'clé invalide' });
  if (!to || !subject) return res.status(400).json({ error: 'to et subject requis' });
  try {
    await mailer.sendMail({ from: config.smtp.from || config.smtp.user, to, subject: String(subject).slice(0, 200), text, html });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, '127.0.0.1', () => {
    console.log('TeamOP API sur 127.0.0.1:' + PORT);
    const authed = Object.keys(TEAM_TOKENS);
    if (authed.length) console.log('Équipes authentifiées : ' + authed.join(', '));
    if (OPEN_TEAMS.length) console.warn('⚠️  Équipes SANS authentification : ' + OPEN_TEAMS.join(', ') + ' — voir le commentaire « Authentification par équipe » dans index.js.');
  });
}

module.exports = app;
// Exposé pour les tests : la neutralisation des URL poussées se vérifie
// directement, sans passer par l'envoi Web Push.
module.exports.safePushUrl = safePushUrl;
