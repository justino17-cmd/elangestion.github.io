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
app.use(express.json({ limit: '256kb' }));

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

app.get('/health', (req, res) => res.json({ ok: true, subs: Object.keys(subs).length, email: !!mailer }));
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

// envoi d'e-mail applicatif (rapports, avis, devis…) — réservé aux équipes ayant au moins un appareil abonné
const mailQuota = new Map();
app.post('/api/sendmail', async (req, res) => {
  if (!mailer) return res.status(503).json({ error: 'email_off' });
  const { teamId, to, subject, text } = req.body || {};
  if (!teamId || !to || !subject) return res.status(400).json({ error: 'teamId, to et subject requis' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to))) return res.status(400).json({ error: 'destinataire invalide' });
  if (!Object.values(subs).some(s => s.teamId === teamId)) return res.status(403).json({ error: 'équipe inconnue' });
  const q = mailQuota.get(teamId) || { count: 0, reset: Date.now() + 3600000 };
  if (Date.now() > q.reset) { q.count = 0; q.reset = Date.now() + 3600000; }
  if (q.count >= 30) return res.status(429).json({ error: 'quota horaire atteint (30 e-mails/h)' });
  q.count++; mailQuota.set(teamId, q);
  try {
    await mailer.sendMail({ from: config.smtp.from || config.smtp.user, to, subject: String(subject).slice(0, 200), text: String(text || '').slice(0, 10000) });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
