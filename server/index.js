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

// Le serveur n'écoute que sur 127.0.0.1, derrière un proxy : sans ceci, toutes
// les requêtes auraient la même IP (celle du proxy) et l'anti-abus plus bas
// serait inopérant. « 1 » = un seul intermédiaire de confiance devant nous.
app.set('trust proxy', 1);

app.use(express.json({ limit: '6mb' })); // large : les e-mails peuvent porter un PDF en pièce jointe (base64)

// CORS — uniquement le site TeamOP
const ORIGINS = config.origins || ['https://teamop.fr', 'https://www.teamop.fr'];
app.use((req, res, next) => {
  const o = req.headers.origin;
  if (o && ORIGINS.includes(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    /* Tout en-tête personnalisé DOIT figurer ici. L'app est servie par teamop.fr et appelle
       api.teamop.fr : une origine différente, donc un en-tête hors liste blanche déclenche une
       requête préalable que le navigateur refuse — et il bloque l'appel réel, silencieusement.
       Un test en ligne de commande ne peut pas l'attraper : CORS n'existe que dans le navigateur.
       X-Teamop-Kh porte la preuve de possession de la clé d'équipe sur les routes mail. */
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Teamop-Devis, X-Teamop-Kh');
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
/*    La même raison vaut, mot pour mot, pour les routes qui rendent de la correspondance :
      corps d'e-mails de fournisseurs, adresses des boîtes connectées, fiches clients. Sans
      cet en-tête, Express ne pose qu'un ETag et ces réponses se rangent dans le cache disque
      du navigateur — et dans celui de tout intermédiaire sur le chemin. */
app.use(['/api/replies', '/api/mailboxes', '/api/clients/sync'], (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
/* ── Journal des e-mails sortants + copie dans la boîte contact ──
   Chaque envoi est noté (date, destinataire, sujet) pour l'onglet Journal de la
   Tour, et reçoit une copie cachée (bcc) dans la boîte contact — SAUF les mails
   contenant des codes secrets, jamais copiés. */
const MAILS_PATH = path.join(DATA_DIR, 'mails-envoyes.json');
let mailsLog = []; try { mailsLog = JSON.parse(fs.readFileSync(MAILS_PATH, 'utf8')); } catch (e) {}
/* Rend VRAI si l'écriture a eu lieu. Sans ça, la suppression totale annonçait un ménage
   fait alors que le disque avait refusé : au redémarrage, mailsLog se rechargeait avec les
   courriers de l'entreprise effacée. C'est le motif de fermesSave(). */
function mailsSave() { try { fs.writeFileSync(MAILS_PATH, JSON.stringify(mailsLog)); return true; } catch (e) { console.error('mails save:', e.message); return false; } }
/* Journaux système (journalctl) : ils sont lus par plus de monde que la Tour et gardés plus
   longtemps. Une adresse entière, un lien de connexion ou un code n'y ont rien à faire —
   on n'y met qu'une forme masquée, assez pour reconnaître une ligne, pas pour la rejouer. */
function masqueMail(a) {
  const s = String(a || '').trim();
  const i = s.indexOf('@');
  if (i < 1) return s ? '(adresse)' : '';
  return s[0] + '***@' + s.slice(i + 1);
}
/* Une entrée du journal des e-mails. Un secret n'y entre JAMAIS — ni par le texte, ni par
   l'OBJET : c'est par l'objet que le code de confirmation était conservé en clair. */
function mailsJournal(to, sujet, txt, secret, trace) {
  try {
    mailsLog.unshift({ ts: Date.now(), a: String(to || ''),
      sujet: secret ? '(objet confidentiel)' : String(sujet || '').slice(0, 140),
      txt: secret ? (trace ? String(trace).slice(0, 400) : '(contenu confidentiel — code de sécurité ou mot de passe, jamais conservé)') : String(txt || '').slice(0, 2000) });
    if (mailsLog.length > 300) mailsLog.length = 300; mailsSave();
  } catch (e) {}
}
function mailerEnvoi(opts) {
  // confidentiel : code de sécurité ou mot de passe → jamais journalisé ni copié
  const secret = opts.confidentiel === true || /code/i.test(String(opts.subject || ''));
  // trace : ce qu'on garde d'un e-mail confidentiel (destinataire, lien envoyé, espace…) — jamais le secret lui-même
  mailsJournal(opts.to, opts.subject, opts.text, secret, opts.trace);
  const o2 = Object.assign({}, opts); delete o2.confidentiel; delete o2.trace; delete o2.diffusion;
  try {
    const moi = String(config.notifDemandes || (config.smtp && (config.smtp.from || config.smtp.user)) || '').toLowerCase();
    /* La copie à soi-même est utile pour un envoi unitaire — on garde une trace de ce qu'on a
       écrit à un client. Elle devient nuisible sur une diffusion : l'annonce revient UNE FOIS PAR
       ENTREPRISE dans la boîte support. Avec deux entreprises c'est déjà deux copies ; avec
       cinquante, les vrais messages clients sont noyés. */
    if (moi && !secret && !opts.diffusion && String(opts.to || '').toLowerCase() !== moi) o2.bcc = moi;
  } catch (e) {}
  // Une diffusion (annonce) doit offrir une sortie : les messageries lisent cet
  // en-tête, et son absence pèse dans le classement en spam.
  if (opts.diffusion) o2.headers = Object.assign({}, o2.headers, { 'List-Unsubscribe': '<mailto:contact@teamop.fr?subject=Stop%20annonces>' });
  return mailer.sendMail(o2);
}

// ── Anti-abus : deux paliers ────────────────────────────────────────────────
//
//  Palier large pour toute l'API, palier strict pour ce qui coûte cher ou
//  engage de l'argent : paiement, envoi de code par courriel, assistant IA.
//
//  Le palier strict reste à 20/min et non plus bas : nos clients sont des
//  entreprises dont plusieurs salariés partagent une seule IP publique.
const PLAFOND_GLOBAL = 120;    // requêtes / minute / IP
const PLAFOND_STRICT = 20;     // idem, sur les routes sensibles
const MAX_IP_SUIVIES = 20000;  // borne mémoire (voir plus bas)

/* « espaces/(ouvrir|relance) » et non « espaces » tout court : /api/espaces/etat est appelé à
   chaque reprise d'onglet par une entreprise en attente de paiement, et le palier strict est
   partagé par IP entre toutes ces familles — plusieurs salariés derrière une seule IP de bureau
   l'épuiseraient pour l'assistant devis en même temps. */
/* « espaces/comptes » n'y figure PAS, et c'est un choix : les routes serrées partagent 20
   requêtes par minute et par IP, or ce dépôt part de chaque appareil qui se connecte —
   toute une équipe qui arrive le matin derrière la même box les épuiserait. Il est déjà
   borné par son quota horaire à lui, il exige la clé d'équipe, et il coûte peu. */
const ROUTES_SENSIBLES = /^\/api\/(stripe|devis|sendcode|mdp|beta|espaces\/(ouvrir|connexion|relance|libre))/;

let compteurs = new Map();
setInterval(() => { compteurs = new Map(); }, 60000).unref();

function tropDeRequetes(res) {
  res.setHeader('Retry-After', '60');
  return res.status(429).json({ error: 'trop de requêtes' });
}

app.use((req, res, next) => {
  // Sous attaque, l'adversaire fait varier son identité : sans borne, la table
  // grossit jusqu'à saturer la mémoire du serveur. On repart de zéro plutôt.
  if (compteurs.size > MAX_IP_SUIVIES) compteurs = new Map();

  // req.ip, et non l'en-tête brut : X-Forwarded-For est fourni par le client,
  // qui peut le préfixer à volonté pour obtenir une clé neuve à chaque requête
  // et ne jamais atteindre la limite. Avec « trust proxy », Express ne retient
  // que la valeur ajoutée par notre propre proxy.
  const ip = req.ip || '?';

  const global = (compteurs.get('g:' + ip) || 0) + 1;
  compteurs.set('g:' + ip, global);
  if (global > PLAFOND_GLOBAL) return tropDeRequetes(res);

  if (ROUTES_SENSIBLES.test(req.path)) {
    const strict = (compteurs.get('s:' + ip) || 0) + 1;
    compteurs.set('s:' + ip, strict);
    if (strict > PLAFOND_STRICT) return tropDeRequetes(res);
  }

  next();
});

// ── codes de sécurité (actions sensibles : remise à zéro, etc.) ──
const codes = new Map();
// Mot de passe oublié : nous fabriquons le lien et nous envoyons l'e-mail.
// La réponse est TOUJOURS la même, compte existant ou non — sinon cette route
// deviendrait un moyen de savoir qui travaille dans quelle entreprise.
app.post('/api/mdp/lien', async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return res.status(400).json({ error: 'email_invalide' });
  if (!fbAdminCle) return res.status(503).json({ error: 'firebase_off' });
  if (!mailer) return res.status(503).json({ error: 'email_off' });

  // la page de retour ne peut être que chez nous
  const brut = String((req.body || {}).suite || '');
  const suite = /^https:\/\/(www\.)?teamop\.fr\/[A-Za-z0-9._~\-\/]{0,120}$/.test(brut) ? brut : 'https://teamop.fr/espace.html';

  // On demande le lien à l'Identity Toolkit sans qu'il envoie l'e-mail lui-même
  // (returnOobLink), avec la clé de service que le serveur utilise déjà ailleurs.
  let oob = null;
  try {
    const tok = await fbAdminJeton();
    if (!tok) return res.status(503).json({ error: 'firebase_off' });
    const r = await fbAdminFetch('https://identitytoolkit.googleapis.com/v1/projects/' + FB_PROJET + '/accounts:sendOobCode',
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType: 'PASSWORD_RESET', email: email, returnOobLink: true }) }, tok);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = String((j.error && j.error.message) || r.status);
      // compte inconnu : on répond comme pour un succès, sans rien envoyer
      if (/EMAIL_NOT_FOUND/i.test(msg)) return res.json({ ok: true });
      console.error('mdp/lien :', msg.slice(0, 120));
      return res.status(500).json({ error: 'echec' });
    }
    // compte inconnu : Google répond 200 sans lien — sa propre protection contre
    // l'énumération. On répond comme pour un succès, sans rien envoyer.
    if (!j.oobLink) return res.json({ ok: true });
    oob = new URL(String(j.oobLink)).searchParams.get('oobCode');
  } catch (e) {
    console.error('mdp/lien :', String((e && e.message) || e).slice(0, 120));
    return res.status(500).json({ error: 'echec' });
  }
  if (!oob) return res.status(500).json({ error: 'echec' });

  const lien = 'https://teamop.fr/reinit.html?mode=resetPassword&oobCode=' + encodeURIComponent(oob) +
               '&continueUrl=' + encodeURIComponent(suite);
  try {
    await mailerEnvoi({
      // le lien vaut le mot de passe : il ne va ni au journal, ni en copie
      confidentiel: true, trace: 'lien de réinitialisation → ' + masqueMail(email),
      from: config.smtp.from || config.smtp.user, to: email,
      subject: 'TEAM OP — réinitialisez votre mot de passe',
      text: 'Bonjour,\n\nvous avez demandé à réinitialiser votre mot de passe TEAM OP.\n\n' + lien +
            '\n\nCe lien ne sert qu\'une fois et expire dans une heure.\nSi vous n\'êtes pas à l\'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.\n\n— L\'équipe TEAM OP · teamop.fr',
      html: mailTeamOP({ chip: 'Sécurité', chipBg: '#FFF3E0', chipColor: '#B26E12',
        titre: 'Réinitialisez votre mot de passe 🔑',
        corpsHtml: 'Bonjour,<br>vous avez demandé un nouveau mot de passe. Le bouton ci-dessous vous mène à la page où le choisir.',
        blocHtml: '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F7FB;border:1px solid #E3E8F1;border-radius:12px"><tr><td style="padding:14px 18px;font-size:13px;line-height:1.7;color:#4A5A7A">Ce lien ne sert <b>qu\'une fois</b> et expire dans <b>une heure</b>. Si vous n\'êtes pas à l\'origine de cette demande, ignorez cet e-mail : votre mot de passe reste inchangé.</td></tr></table>',
        boutonTxt: 'Choisir mon mot de passe', boutonUrl: lien })
    });
  } catch (e) { console.error('mdp/lien envoi :', String(e.message || e).slice(0, 120)); return res.status(500).json({ error: 'echec' }); }
  res.json({ ok: true });
});
app.post('/api/sendcode', async (req, res) => {
  const { teamId, email, purpose } = req.body || {};
  if (!teamId || !email) return res.status(400).json({ error: 'teamId et email requis' });
  if (!mailer) return res.status(503).json({ error: 'email_off' });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  codes.set(teamId + '|' + (purpose || 'reset'), { code, email, exp: Date.now() + 10 * 60000, tries: 0 });
  try {
    await mailerEnvoi({
      // le code ne voyage PAS dans l'objet : l'objet est conservé au journal, le corps ne l'est pas
      confidentiel: true, trace: 'code de confirmation → ' + masqueMail(email) + ' · espace ' + String(teamId).slice(0, 40),
      from: config.smtp.from || config.smtp.user, to: email,
      subject: 'TeamOP — votre code de confirmation',
      text: 'Votre code de confirmation TeamOP : ' + code + '\n\nIl expire dans 10 minutes.\nSi vous n\'êtes pas à l\'origine de cette demande, ignorez ce message et vérifiez la sécurité de votre compte.',
      html: mailTeamOP({ chip: 'Sécurité', chipBg: '#FFF3E0', chipColor: '#B26E12', titre: 'Votre code de confirmation 🔐',
        corpsHtml: 'Bonjour,<br>voici le code demandé dans votre application. Il ne sert qu\'une fois.',
        blocHtml: MAIL_BLOCS.code(code) + '<div style="font-size:12.5px;color:#93A2BF;padding-top:14px">Si vous n\'êtes pas à l\'origine de cette demande, ignorez ce message et vérifiez la sécurité de votre compte.</div>' })
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// le compte n'a pas d'e-mail : le code part à l'adresse de l'ENTREPRISE (l'annuaire),
// et le responsable le transmet — jamais à une adresse tapée librement.
app.post('/api/sendcode-entreprise', async (req, res) => {
  const { teamId, purpose, login } = req.body || {};
  if (!teamId) return res.status(400).json({ error: 'teamId requis' });
  if (!mailer) return res.status(503).json({ error: 'email_off' });
  const e = Object.values(espacesReg).find(x => {
    if (x.t) return x.t === teamId;
    try { return String(JSON.parse(Buffer.from(x.code, 'base64').toString('utf8')).t || '') === teamId; } catch (err) { return false; }
  });
  if (!e || !e.email) return res.status(404).json({ error: 'entreprise_inconnue' });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  codes.set(teamId + '|' + (purpose || 'reset'), { code, email: e.email, exp: Date.now() + 10 * 60000, tries: 0 });
  try {
    const loginSafe = monStr(login, 40).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    await mailerEnvoi({
      // idem : le code reste dans le corps (jamais journalisé), l'objet n'en porte rien
      confidentiel: true, trace: 'code de confirmation (équipe) → ' + masqueMail(e.email) + ' · @' + monStr(login, 40),
      from: config.smtp.from || config.smtp.user, to: e.email,
      subject: 'TeamOP — un code de confirmation pour votre équipe',
      text: 'Un membre de votre équipe (identifiant « ' + monStr(login, 40) + ' ») a oublié son mot de passe OP GESTION, et son compte n\'a pas d\'adresse e-mail enregistrée.\n\nCode de confirmation à lui transmettre : ' + code + '\n\nIl expire dans 10 minutes. Si personne dans votre équipe n\'est à l\'origine de cette demande, ignorez ce message.',
      html: mailTeamOP({ chip: 'Sécurité', chipBg: '#FFF3E0', chipColor: '#B26E12', titre: 'Un code pour votre équipe 🔐',
        corpsHtml: 'Bonjour,<br>ce code arrive à l\'adresse de l\'entreprise, car le compte concerné n\'a pas d\'adresse e-mail enregistrée.',
        blocHtml: MAIL_BLOCS.transmettre(loginSafe) + '<div style="height:14px"></div>' + MAIL_BLOCS.code(code) + '<div style="font-size:12.5px;color:#93A2BF;padding-top:14px">Si personne dans votre équipe n\'est à l\'origine de cette demande, ignorez ce message.</div>' }) });
    const masque = String(e.email).replace(/^(.{2})[^@]*(@.*)$/, '$1•••$2');
    res.json({ ok: true, envoye: masque });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
app.get('/health', (req, res) => res.json({ ok: true, v: 5, histo: true, annonce: ANNONCE.version, uptime: Math.round(process.uptime()), subs: Object.keys(subs).length, email: !!mailer, atts: true, boite: !!(config.imap && config.imap.user), stripe: !!(config.stripe && config.stripe.secretKey), bugs1h: bugTimes.filter(t => t > Date.now() - 3600000).length, bugs24h: bugTimes.filter(t => t > Date.now() - 86400000).length, lastRefus,
  /* Quatre entiers agrégés : ils disent si la porte des routes mail peut se fermer,
     et ne disent rien de personne — ni adresse, ni espace, ni contenu. Sans eux,
     la suite se déciderait à l'aveugle : /api/mail/cles est protégée par une clé de
     serveur que Justin n'a pas. « absent » et « inconnu » à zéro = on peut fermer. */
  cles: { valide: cleEquipeVu.valide, absent: cleEquipeVu.absent, invalide: cleEquipeVu.invalide,
          inconnu: cleEquipeVu.inconnu, depuis: cleEquipeVu.depuis, parRoute: cleEquipeParRoute } }));

// ── Assistant devis : l'agent qui compose un devis à partir d'une conversation.
//    Il ne fait que parler à Claude ; c'est OP GESTION qui enregistre le devis
//    et produit le PDF. Sans clé Anthropic dans config.json, la route répond 503
//    et le reste du serveur fonctionne normalement.
try {
  require('./agent-devis').monterAgentDevis(app, config, DATA_DIR);
} catch (e) {
  console.error('assistant devis non monté :', e.message);
}

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
  const team = String(teamId || 'inconnu').slice(0, 80);   // 80 comme entFermes : à 60, un teamId long passait le garde-fou
  /* Un espace supprimé ne se laisse pas ressusciter par un appareil resté hors ligne :
     sans ce garde-fou, il réapparaît avec les identifiants et les noms de ses salariés.
     On répond ok — l'appareil n'a rien fait de mal, et /api/espaces/etat lui dira de se
     vider — mais on n'écrit RIEN. */
  if (entFermes.espaces.includes(team)) return res.json({ ok: true, ferme: true });
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
    mailerEnvoi({
      from: config.smtp.from || config.smtp.user, to,
      subject: '🐛 Bug ' + appLisible(entry.app) + (entry.version !== '?' ? ' v' + entry.version : '') + ' — espace « ' + team + ' »',
      text: 'Une erreur vient d\'être signalée par l\'application d\'une entreprise.\n\nApplication : ' + appLisible(entry.app) + (entry.version !== '?' ? ' (v' + entry.version + ')' : '') + '\nEspace entreprise : ' + team + '\nErreur : ' + entry.msg + '\nFichier : ' + (entry.src || '—') + (entry.line ? ' ligne ' + entry.line : '') + '\nAppareil : ' + entry.ua + '\n\n' + (entry.stack ? 'Détail technique :\n' + entry.stack + '\n\n' : '') + 'Pour corriger : ouvre Claude Code et demande « corrige le bug signalé par la vigie ».',
      html: mailTeamOP({ chip: 'Vigie', chipBg: '#FDECEC', chipColor: '#C22B2B', titre: '🐛 Bug signalé — ' + appLisible(entry.app),
        corpsHtml: 'Une erreur vient d\'être signalée par l\'application d\'une entreprise. Le détail complet est dans l\'encart ci-dessous.',
        blocHtml: MAIL_BLOCS.vigie(Object.assign({}, entry, { app: appLisible(entry.app) })) + '<div style="font-size:12.5px;color:#93A2BF;padding-top:14px">Pour corriger : ouvre Claude Code et demande « corrige le bug signalé par la vigie ».</div>',
        boutonTxt: 'Ouvrir la Tour de contrôle', boutonUrl: 'https://teamop.fr/tour.html' })
    }).catch(e => console.error('bug mail:', e.message));
  }
  res.json({ ok: true });
});
/* ── 📬 Une inscription sur le site prévient l'équipe ──
   espace.html crée le compte directement chez Firebase et écrit la fiche dans Firestore :
   le serveur ne voyait donc RIEN passer, et personne n'était prévenu qu'un client venait
   de s'inscrire. Cette route ne fait qu'une chose, envoyer l'alerte — elle n'écrit aucun
   fichier et ne rend aucune donnée.
   Le destinataire est TOUJOURS l'adresse de l'équipe fixée en configuration, jamais une
   adresse fournie par l'appelant : une route ouverte qui écrirait à qui on lui dit serait
   un relais à spam offert à Internet. Le quota par IP borne le reste — au pire du bruit
   dans la boîte de l'équipe, et seulement dix fois par heure. */
const compteQuota = new Map();
app.post('/api/nouveau-compte', (req, res) => {
  const b = req.body || {};
  const email = monStr(b.email, 160).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'adresse invalide' });
  if (compteQuota.size > 5000) compteQuota.clear();
  if (!quotaOk(compteQuota, 'ip:' + (req.ip || '?'), 10, 3600000)) return res.json({ ok: true, muted: true });
  const prenom = monStr(b.prenom, 60).trim(), nom = monStr(b.nom, 60).trim();
  const societe = monStr(b.company, 120).trim();
  const qui = ((prenom + ' ' + nom).trim() || '(nom non renseigné)');
  /* Rien de tout cela ne part dans les journaux : ce sont des données personnelles,
     elles ne vont que dans l'e-mail adressé à l'équipe. */
  if (mailer) {
    const to = config.alertEmail || config.contactEmail || 'contact@teamop.fr';
    mailerEnvoi({
      from: config.smtp.from || config.smtp.user, to,
      subject: '🎉 Nouveau compte sur teamop.fr — ' + (societe || qui),
      text: 'Un compte vient d\'être créé sur l\'espace client.\n\nEntreprise : ' + (societe || '—')
        + '\nPersonne : ' + qui + '\nAdresse : ' + email
        + '\n\nLa fiche est dans la Tour de contrôle, onglet Entreprises.',
      html: mailTeamOP({ chip: 'Inscription', chipBg: '#E8F5EE', chipColor: '#0A7A52',
        titre: '🎉 Nouveau compte — ' + (societe || qui),
        corpsHtml: 'Un compte vient d\'être créé sur l\'espace client de teamop.fr.',
        blocHtml: '<div style="font-size:14px;line-height:1.9">'
          + '<b>Entreprise :</b> ' + (societe || '—') + '<br>'
          + '<b>Personne :</b> ' + qui + '<br>'
          + '<b>Adresse :</b> ' + email + '</div>',
        boutonTxt: 'Ouvrir la Tour de contrôle', boutonUrl: 'https://teamop.fr/tour.html' })
    }).catch(e => console.error('mail nouveau compte:', e.message));
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
/* ══ PREUVE DE POSSESSION DE LA CLÉ D'ÉQUIPE — PHASE 1 : ON OBSERVE, ON NE REFUSE RIEN ══
   Le teamId n'autorise rien et ne l'a jamais pu : il voyage dans les URL, donc dans les
   journaux nginx, l'historique du navigateur et l'en-tête Referer ; il est écrit en clair
   dans le localStorage de chaque appareil ; et il ne se révoque pas — un ancien salarié ou
   un téléphone revendu le gardent à vie. Les six routes ci-dessous s'en contentaient
   pourtant : lire les messages reçus, lister les boîtes, ENVOYER depuis la boîte de
   l'entreprise, la déconnecter, en connecter une, s'abonner aux notifications. Connaître
   le teamId suffisait pour les six.

   Rien de neuf n'est inventé pour refermer : la preuve existe déjà des deux côtés. app.html
   détient la clé de synchro et sait en calculer le sha256 (« kh »), et /api/espaces/comptes
   vérifie déjà ce kh contre la clé de l'espace. Le verdict est rendu par cleEquipeVerdict(),
   défini plus bas avec espaceParT() dont il dépend.

   POURQUOI ON N'EXIGE ENCORE RIEN. cleEquipeVerdict() s'appuie sur espaceParT(), qui ne
   trouve que ce qui est inscrit dans espacesReg — le registre alimenté à la main, quand
   cnxData, lui, se remplit tout seul à chaque connexion. Des entreprises actives et payantes
   ont donc un t sans entrée d'annuaire. Refuser d'emblée les renverrait en 403, que
   loadMailReplies() (app.html) avale dans son catch : Réception vide, aucun message d'erreur.
   C'est exactement le mode de panne silencieuse que ce dépôt a déjà payé. On mesure d'abord
   — /api/mail/cles, protégée — et on ne ferme que lorsque le compte « sans preuve » est à
   zéro pour les espaces vivants. */
app.use(['/api/replies', '/api/mailboxes', '/api/mailbox/connect', '/api/mailbox/disconnect', '/api/sendmail', '/api/subscribe', '/api/notify'], cleEquipeObserve);

/* Le nombre d'essais de connexion à une boîte, par IP et par heure. La route tente un
   SMTP puis un IMAP chez le fournisseur et RENVOIE son message d'erreur : sans borne,
   c'est un banc d'essai de mots de passe contre Gmail ou Outlook, relayé par l'IP du VPS —
   donc c'est la réputation de TeamOP qui se fait brûler. Même forme que lienQuota. */
let connectQuota = new Map();

app.post('/api/mailbox/connect', async (req, res) => {
  if (connectQuota.size > 5000) connectQuota = new Map();
  if (!quotaOk(connectQuota, 'ip:' + (req.ip || '?'), 20, 3600000))
    return res.status(429).json({ error: 'trop d\'essais de connexion — réessaie dans une heure' });
  /* Ce contrôle ne ferme la porte qu'aux teamId INVENTÉS — et encore, cnxData s'inscrit
     tout seul par /api/connexions, qui est publique. Brancher une boîte sur le teamId d'une
     VRAIE entreprise reste possible, et verse jusqu'à 60 messages de l'attaquant dans sa
     Réception avant de pousser une notification à tous ses appareils. Ne pas croire cette
     ligne suffisante : elle élève la marche, le quota au-dessus fait le vrai travail. */
  {
    const tCo = String((req.body || {}).teamId || '').slice(0, 80);
    const connu = !!espaceParT(tCo) || Object.values(subs).some(x => x.teamId === tCo) || !!cnxData[tCo];
    if (!connu) {
      /* Pas de teamId ici non plus : /health est publique. */
      lastRefus = { ts: Date.now(), raison: 'mailbox/connect : espace inconnu' };
      return res.status(403).json({ error: 'espace inconnu du serveur' });
    }
  }
  /* Bornes posées AVANT la vérification SMTP/IMAP, pas au moment d'écrire : ce qui est
     vérifié doit être exactement ce qui est enregistré — tronquer après coup stockerait
     un mot de passe qui ne s'authentifie plus. Sans ces bornes, express.json({limit:'6mb'})
     laisse écrire plusieurs mégaoctets par appel dans mailboxes.json, réécrit en entier à
     chaque saveMailboxes(). */
  const _b = req.body || {};
  const teamId = String(_b.teamId || '').slice(0, 80);
  const email = String(_b.email || '').slice(0, 160);
  const pass = String(_b.pass || '').slice(0, 200);
  const name = String(_b.name || '').slice(0, 80);
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
    c.on('error', () => {});   // une erreur émise en événement tuerait le processus : on l'absorbe, l'échec est déjà traité par le try/catch
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
    client.on('error', () => {});   // une erreur émise en événement tuerait le processus : on l'absorbe, l'échec est déjà traité par le try/catch
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
          /* Même course qu'en relève : releveBoite() appelle importHistorique AVANT
             releveUneBoite, et une passe déjà lancée réécrirait ~60 corps de messages d'un
             espace qu'on vient de supprimer. entFermes est écrit en premier : on le lit. */
          if (b.teamId && entFermes.espaces.includes(b.teamId)) { if (mid) seenMids.add(mid); continue; }
          try { fs.appendFileSync(REPLIES_PATH, JSON.stringify(entry) + '\n'); n++; } catch (_) {}
          if (mid) seenMids.add(mid);
        }
        console.log('historique importé:', masqueMail(b.email), '(' + n + ' mails)');
      }
    } finally { lock.release(); }
    await client.logout();
    if (b.id && mailboxes[b.id]) { mailboxes[b.id].histoDone = true; saveMailboxes(); }   // une seule fois par boîte
  } catch (e) { console.error('histo', masqueMail(b.email) + ':', e.message); try { if (client) client.close(); } catch (_) {} }
}
let boiteBusy = false;
async function releveUneBoite(cfg, tag) {   // cfg = {host/port/user/pass} ; tag = {teamId, userId} pour le rattachement
  const { ImapFlow } = require('imapflow'); let client;
  try {
    client = new ImapFlow({ host: cfg.host, port: cfg.port || 993, secure: true, auth: { user: cfg.user, pass: cfg.pass }, logger: false });
    client.on('error', () => {});   // une erreur émise en événement tuerait le processus : on l'absorbe, l'échec est déjà traité par le try/catch
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
        /* PIÈGE LATENT, PAS UNE FUITE EN COURS — à lire avant de simplifier.
           Ce bloc n'est atteint que si tag est nul, c'est-à-dire pour la seule boîte commandes
           partagée de config.imap (ligne ~560) ; une boîte connectée par une entreprise porte
           déjà son tag.teamId, et importHistorique écrit b.teamId. Or config.imap n'est pas
           configuré en production (/health : "boite":false), donc ce chemin est mort aujourd'hui.
           Il s'arme à la première boîte partagée configurée, et c'est là que le rattachement
           d'origine devenait dangereux : il retenait le PREMIER indice venu. Le numéro de bon
           ne vaut rien seul — nextNum() est un compteur local à chaque entreprise, toutes
           démarrent à BC-2026-001, donc deux clients portent couramment le même numéro.
           L'adresse d'expéditeur non plus : deux entreprises de nettoyage partagent leurs
           fournisseurs. D'où la règle ci-dessous : un indice n'est retenu que s'il ne désigne
           QU'UNE équipe, sinon teamId reste vide. Un message non rattaché reste invisible dans
           l'app ; un message mal rattaché part chez un concurrent avec son corps et une
           notification push, sans laisser trace d'erreur. */
        if (!teamId) {
          const seuleEquipe = (liste) => { const eq = new Set(liste.map(x => x.teamId)); return eq.size === 1 ? liste[liste.length - 1].teamId : ''; };
          const conjoint = bonNum ? sentMap.filter(x => x.bonNum === bonNum && x.to === fromAddr) : [];
          if (conjoint.length) teamId = seuleEquipe(conjoint);
          if (!teamId && bonNum) teamId = seuleEquipe(sentMap.filter(x => x.bonNum === bonNum));
          if (!teamId) teamId = seuleEquipe(sentMap.filter(x => x.to === fromAddr));
        }
        const entry = { ts: Date.now(), teamId, boite: tag ? tag.email : '', bonNum, from: fromAddr, fromName: String(from.name || '').slice(0, 80), subject: subj.slice(0, 200), text, mid };
        /* Une relève en vol réécrit ce qu'une suppression totale vient de purger. releveBoite()
           capture Object.keys(mailboxes) puis boucle avec await : supprimer la boîte du registre
           n'interrompt PAS la passe déjà lancée, dont la configuration est une copie locale. Elle
           allait jusqu'au bout et réécrivait le corps du message d'un client effacé — parfois après
           la purge. Pire : purgeJournal lit-filtre-renomme, donc les lignes ajoutées entre-temps par
           une AUTRE entreprise étaient perdues. entFermes est écrit en PREMIER par la suppression :
           le lire ici referme la fenêtre de lui-même. */
        const ferme = entry.teamId && entFermes.espaces.includes(entry.teamId);
        if (!ferme) { try { fs.appendFileSync(REPLIES_PATH, JSON.stringify(entry) + '\n'); } catch (_) {} }
        if (mid) seenMids.add(mid);
        /* On marque quand même le message comme lu, y compris pour un espace fermé : sinon la
           relève suivante le relirait indéfiniment. */
        try { await client.messageFlagsAdd(msg.seq, ['\\Seen']); } catch (_) {}
        if (ferme) continue;
        if (teamId) {
          const payload = JSON.stringify({ title: '📥 Nouveau message' + (bonNum ? ' — ' + bonNum : ''), body: ((entry.fromName || fromAddr) + ' : ' + subj).slice(0, 240), url: '/app.html#v=boiteMail' });
          const targets = Object.values(subs).filter(s => s.teamId === teamId);
          for (const t of targets) { try { await webpush.sendNotification(t.sub, payload); } catch (e) { if (e.statusCode === 404 || e.statusCode === 410) { delete subs[t.sub.endpoint]; saveSubs(); } } }
        }
      }
    } finally { lock.release(); }
    await client.logout();
  } catch (e) { console.error('releve', masqueMail(cfg.user) + ':', e.message); try { if (client) client.close(); } catch (_) {} }
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
  /* Un espace supprimé ne se laisse pas ressusciter par un appareil resté hors ligne :
     sans ce garde-fou, il réapparaît avec les identifiants et les noms de ses salariés.
     On répond ok — l'appareil n'a rien fait de mal, et /api/espaces/etat lui dira de se
     vider — mais on n'écrit RIEN. */
  if (entFermes.espaces.includes(String(teamId).slice(0, 80))) return res.json({ ok: true, ferme: true });
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
    /* L'adresse partait telle quelle dans la notification, et sw.js la passe à
       w.navigate() / clients.openWindow() sans la relire. N'importe qui pouvait donc
       pousser « Votre session a expiré » sur les téléphones de terrain d'une entreprise,
       vers son propre domaine. On n'accepte plus qu'un chemin interne — vérifié :
       l'application n'envoie jamais que '/app.html', '/espace.html' ou '/messages.html'.
       Le « pas deux barres » exclut « //ailleurs.example », qui est une adresse absolue. */
    url: (function () {
      /* On RÉSOUT l'adresse au lieu de la filtrer. Une expression régulière ne suffit pas :
         les navigateurs traitent « \ » comme « / » et retirent tabulation, saut de ligne et
         retour chariot AVANT d'analyser — si bien que « /\evil.com » et « / » suivi d'une
         tabulation passaient un test « commence par une seule barre » et menaient pourtant
         chez l'attaquant. Vérifié sur les quatre formes. En résolvant contre notre propre
         origine et en n'acceptant que ce qui y reste, les quatre tombent d'un coup. */
      try {
        const abs = new URL(String(url || '/app.html').slice(0, 200), 'https://teamop.fr');
        if (abs.origin !== 'https://teamop.fr') return '/app.html';
        /* Pas de fragment : app.html lit « #entreprise=CODE » et rejoint l'espace
           correspondant, en rechargeant la page. Une notification pointant là ferait
           basculer l'appareil d'un salarié sur l'espace de qui l'a poussée. Vérifié :
           l'application n'envoie jamais de fragment, seulement '/app.html' ou
           '/espace.html'. */
        return (abs.pathname + abs.search).slice(0, 200);
      } catch (e) { return '/app.html'; }
    })()
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
// 30 e-mails/heure par espace ; un espace sans appareil abonné aux notifications
// est compté par adresse IP (anti-abus). Renvoie le message de refus, ou null.
// (prefixe/max : un compteur à part, par ex. pour les e-mails d'accès, qui ne rogne pas celui des documents)
function mailQuotaRefus(req, teamId, prefixe, max) {
  prefixe = prefixe || ''; max = max || 30;
  const teamConnue = Object.values(subs).some(s => s.teamId === teamId);
  const cle = prefixe + (teamConnue ? teamId : 'ip:' + (req.ip || '?'));   // req.ip, jamais l'en-tête brut : il se falsifie
  const q = mailQuota.get(cle) || { count: 0, reset: Date.now() + 3600000 };
  if (Date.now() > q.reset) { q.count = 0; q.reset = Date.now() + 3600000; }
  if (q.count >= max) {
    const min = Math.max(1, Math.ceil((q.reset - Date.now()) / 60000));
    lastRefus = { ts: Date.now(), raison: (prefixe ? prefixe + ' ' : '') + (teamConnue ? 'quota équipe (' + max + '/h)' : 'quota IP (espace sans notifications)') };
    return 'quota horaire atteint (' + max + ' e-mails/h) — réessaie dans ' + min + ' min';
  }
  q.count++; mailQuota.set(cle, q);
  return null;
}
app.post('/api/sendmail', async (req, res) => {
  const { teamId, to, subject, text, smtp, brand, atts, meta, useMailbox } = req.body || {};
  if (!teamId || !to || !subject) return res.status(400).json({ error: 'teamId, to et subject requis' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to))) return res.status(400).json({ error: 'destinataire invalide' });
  /* ── L'ESPACE DOIT AU MOINS EXISTER ──
     Le seul contrôle était « teamId non vide » : n'importe quelle chaîne ouvrait les trois
     modes d'envoi, dont celui qui expédie depuis le serveur mail de TeamOP, authentifié SPF
     et DKIM. Le garde-fou est celui de /api/compte/identifiants (commentaire
     « Anti-hameçonnage » plus bas), posé ici pour couvrir AUSSI le mode « boîte connectée » —
     le plus grave des trois, puisqu'il envoie depuis la vraie adresse de l'entreprise avec
     son propre mot de passe.

     ⚠️ CE QUE ÇA NE FERME PAS, ET IL FAUT LE SAVOIR : cnxData s'inscrit tout seul par
     /api/connexions, qui est publique — deux requêtes suffisent à faire exister un espace
     inventé. Et le nom d'expéditeur reste `brand.name`, choisi par l'appelant : avec
     n'importe quel teamId accepté, on peut toujours signer du nom qu'on veut. Ce contrôle
     élève la marche, il ne referme pas la porte. La vraie fermeture demande que chaque
     entreprise ait son propre teamId — aujourd'hui toutes celles restées sur la clé par
     défaut partagent « elan-gestion ». C'est un chantier à part, et c'est LE chantier.

     Posé AVANT le quota : sinon un refus consommerait quand même un jeton, et on pourrait
     épuiser l'heure d'envoi d'une entreprise par des requêtes toutes refusées. */
  {
    const tEnv = String(teamId).slice(0, 80);
    const connu = !!espaceParT(tEnv) || Object.values(subs).some(x => x.teamId === tEnv) || !!cnxData[tEnv];
    if (!connu) {
      /* Pas de teamId dans lastRefus : /health est publique, et un teamId est la seule clé
         d'accès aux routes de messagerie. Le motif suffit au diagnostic. La règle vaut pour TOUS les
         lastRefus, pas seulement celui-ci : ni identifiant, ni slug, ni adresse — un motif générique. */
      lastRefus = { ts: Date.now(), raison: 'sendmail : espace inconnu' };
      /* Le libellé évite les mots que l'application prend pour un problème d'identifiants —
         sinon on enverrait un client changer son mot de passe pour rien. */
      return res.status(403).json({ error: 'espace inconnu du serveur' });
    }
  }
  const refus = mailQuotaRefus(req, teamId);
  if (refus) return res.status(429).json({ error: refus });
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
      await mailerEnvoi({ from: '"' + name + '" <' + addr + '>', replyTo, ...msg });
    }
    if (meta && (meta.bonNum || meta.track)) rememberSent(teamId, meta.bonNum || '', to);   // pour rattacher la future réponse
    res.json({ ok: true });
  } catch (e) { lastRefus = { ts: Date.now(), raison: 'SMTP: ' + String(e.message || e).slice(0, 200) }; res.status(500).json({ error: e.message }); }
});

// Accès d'un compte créé par l'entreprise : identifiant + mot de passe provisoire + lien de connexion
// de l'entreprise (le lien met l'appareil sur le bon espace). Le mot de passe n'est jamais journalisé.
app.post('/api/compte/identifiants', async (req, res) => {
  const { teamId, to, prenom, entreprise, login, mdp, lien, par } = req.body || {};
  if (!teamId || !to || !login || !mdp) return res.status(400).json({ error: 'teamId, to, login et mdp requis' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to))) return res.status(400).json({ error: 'destinataire invalide' });
  if (!mailer) return res.status(503).json({ error: 'email_off' });
  const t = String(teamId).slice(0, 80);
  // Anti-hameçonnage : cette route envoie un e-mail officiel avec un lien d'espace → seulement pour un espace
  // que le serveur connaît (annuaire, ou appareils abonnés aux notifications), jamais pour un espace inventé.
  const esp = espaceParT(t);
  const espaceConnu = !!esp || Object.values(subs).some(s => s.teamId === t);
  if (!espaceConnu) { lastRefus = { ts: Date.now(), raison: 'accès : espace inconnu' }; return res.status(403).json({ error: 'espace inconnu du serveur — transmets les accès toi-même' }); }
  const refus = mailQuotaRefus(req, t, 'acces:', 20);
  if (refus) return res.status(429).json({ error: refus });
  const net = (s, n) => String(s || '').replace(/[<>\r\n]/g, '').trim().slice(0, n);
  const ent = net(entreprise, 80) || net(esp && esp.nom, 80), pre = net(prenom, 60), id = net(login, 60), pwd = net(mdp, 60), qui = net(par, 80);
  // rien qui ressemble à une adresse web ou à un numéro dans les champs libres (auto-liés par les clients mail)
  if (/\s/.test(id) || /\s/.test(pwd) || /https?:|www\./i.test(id + ' ' + pwd + ' ' + pre + ' ' + ent + ' ' + qui)) return res.status(400).json({ error: 'champs invalides' });
  // Lien fourni par l'app : accepté seulement s'il est TeamOP et, pour un lien d'espace #entreprise=CODE, si le code
  // désigne bien CET espace (t identique) — sinon on l'ignore.
  let lienApp = '', cleApp = '';
  if (/^https:\/\/teamop\.fr\/(app|beta|connexion)\.html([#?][A-Za-z0-9+/=_.&%#?-]*)?$/.test(String(lien || ''))) {
    const l = String(lien).slice(0, 700); const m = l.match(/#entreprise=([A-Za-z0-9+/=_-]{8,})/);
    if (m) { try { const o = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')); if (o && o.t === t) { lienApp = l; cleApp = String(o.k || ''); } } catch (e) {} }
    else if (!/#e=/.test(l)) lienApp = l;   // connexion.html / app.html sans espace
  }
  // Espace de l'annuaire → lien de connexion (teamop.fr/app.html#entreprise=CODE)… sauf si la clé a changé depuis
  // l'inscription : le code de l'annuaire serait périmé, le lien de l'app (clé actuelle) fait foi.
  let cleAnn = ''; try { if (esp && esp.code) cleAnn = String(JSON.parse(Buffer.from(esp.code, 'base64').toString('utf8')).k || ''); } catch (e) {}
  const annuaireOk = !!(esp && esp.slug && esp.code) && (!cleApp || !cleAnn || cleApp === cleAnn);
  /* Le lien porte le CODE de l'espace, jamais son nom : un nom se devine (il est sur le
     camion et sur les factures), un code non. Voir /api/espaces/relance. */
  const url = annuaireOk ? lienEspaceCode(esp) : (lienApp || 'https://teamop.fr/connexion.html');
  const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const entTxt = ent ? ' « ' + ent + ' »' : '';
  // ce que l'écran de connexion affichera vraiment : le nom porté par le lien (annuaire si #e=…, sinon celui de l'app)
  const nomEcran = annuaireOk ? net(esp.nom, 80) : ent;
  const ecranTxt = nomEcran ? ' « ' + nomEcran + ' »' : '';
  const lienEspace = /#(e|entreprise)=/.test(url);   // un lien d'espace met l'appareil sur l'entreprise ; connexion.html, non
  const explique = lienEspace
    ? 'Cliquez dessus : l\'application se met sur l\'espace de l\'entreprise et affiche « Vous allez vous connecter à l\'entreprise' + ecranTxt + ' ». Entrez alors votre identifiant et votre mot de passe provisoire.'
    : 'Ouvrez l\'application avec ce lien, puis entrez votre identifiant et votre mot de passe provisoire.';
  // Taper le nom ne connecte plus : il fait RENVOYER ce lien à l'adresse de l'entreprise.
  const sansLien = annuaireOk ? '(Lien perdu ? Sur teamop.fr → Se connecter, tapez le nom de l\'entreprise' + ecranTxt + ' : le lien est renvoyé à son adresse e-mail.)' : '';
  try {
    await mailerEnvoi({ confidentiel: true, trace: 'accès @' + id + ' → ' + url + ' · espace ' + t + (qui ? ' · par ' + qui : ''), from: config.smtp.from || config.smtp.user, to,
      subject: 'Vos accès OP GESTION' + (ent ? ' — ' + ent : ''),
      text: 'Bonjour' + (pre ? ' ' + pre : '') + ',\n\n' + (qui ? qui + ' vous a créé' : 'Votre entreprise vous a créé') + ' un compte OP GESTION' + (ent ? ' (' + ent + ')' : '') + '.\n\n'
        + 'Identifiant : ' + id + '\nMot de passe provisoire : ' + pwd + '\n\n'
        + 'Votre lien de connexion' + (lienEspace ? ' — c\'est celui de l\'entreprise' + entTxt : '') + ' :\n' + url + '\n'
        + explique + '\n' + (sansLien ? sansLien + '\n' : '')
        + '\nÀ votre première connexion, l\'application vous fera choisir votre propre mot de passe.\n\n— TEAM OP · teamop.fr',
      html: mailTeamOP({ chip: 'Bienvenue', titre: 'Vos accès OP GESTION' + (ent ? ' · ' + ent : ''),
        corpsHtml: 'Bonjour' + (pre ? ' ' + x(pre) : '') + ',<br>' + (qui ? '<b>' + x(qui) + '</b> vous a créé' : 'votre entreprise vous a créé') + ' un compte sur l\'application OP GESTION' + (ent ? ' de <b>' + x(ent) + '</b>' : '') + '.<br><br>'
          + '<b>Votre lien de connexion</b>' + (lienEspace ? ' — c\'est celui de l\'entreprise' + x(entTxt) : '') + ' :<br><a href="' + x(url) + '" style="color:#34A97E">' + x(url.replace('https://', '')) + '</a><br>'
          + '<span style="font-size:13px">' + x(explique).replace('« Vous allez vous connecter à l\'entreprise' + x(ecranTxt) + ' »', '« <b>Vous allez vous connecter à l\'entreprise' + x(ecranTxt) + '</b> »')
          + (sansLien ? '<br><span style="color:#8fa3c8">' + x(sansLien) + '</span>' : '') + '</span>',
        blocHtml: MAIL_BLOCS.acces(x(id), x(pwd)),
        frise: [
          { titre: 'Compte créé', sous: qui ? 'par ' + qui : 'par votre entreprise', fait: true },
          { titre: 'Connectez-vous', sous: 'avec le lien', fait: false },
          { titre: 'Votre mot de passe', sous: 'choisi à la 1re connexion', fait: false }
        ],
        boutonTxt: 'Ouvrir mon application', boutonUrl: url }) });
    res.json({ ok: true, lien: url, entreprise: ent });
  } catch (e) { lastRefus = { ts: Date.now(), raison: 'SMTP: ' + String(e.message || e).slice(0, 200) }; res.status(500).json({ error: e.message }); }
});

/* ── Gabarit d'e-mail TEAM OP (modèle « Suivi ») : logo, pastille d'état, frise,
   boutons. Sert à tous les e-mails automatiques envoyés aux clients. ── */
// ── Gabarit des e-mails TEAM OP ─────────────────────────────────────────────
//  Tableaux imbriqués et styles en ligne : la seule chose que TOUS les clients
//  de messagerie rendent pareil. Le logo est chargé depuis teamop.fr, jamais
//  joint : une pièce jointe pèse dans le filtre anti-spam, et Exchange affichait
//  l'image jointe à sa taille native (1024 px) en ignorant width/height. La
//  taille est fixée trois fois (attributs, style, max-width) pour cette raison.
//  Le mode sombre est déclaré (color-scheme) et pris en charge par des règles
//  !important : c'est ainsi qu'Apple Mail et Outlook l'appliquent.
const MAIL_POLICE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MAIL_STYLE = '<style>' +
  ':root{color-scheme:light dark;supported-color-schemes:light dark}' +
  'body{margin:0;padding:0;-webkit-text-size-adjust:100%}' +
  'a{color:#1E7A4E}' +
  '@media (prefers-color-scheme:dark){' +
    '.m-fond{background:#0D1624!important}' +
    '.m-carte{background:#16203A!important;border-color:#243154!important}' +
    '.m-fort,.m-fort b{color:#EAEEF7!important}' +
    '.m-texte{color:#B6C2D9!important}.m-texte b{color:#EAEEF7!important}' +
    '.m-muet{color:#8B9AB8!important}' +
    '.m-pied{border-color:#243154!important;color:#8B9AB8!important}.m-pied a{color:#4FD196!important}' +
    '.m-bloc{background:#0F1830!important;border-color:#243154!important;color:#B6C2D9!important}.m-bloc b{color:#EAEEF7!important}' +
    '.m-btn{background:#2EB872!important;color:#06231A!important}' +
    '.m-btn2{color:#B6C2D9!important}' +
    '.m-chip{background:#1B2542!important;color:#B6C2D9!important}' +
  '}' +
  '@media (max-width:600px){.m-int{padding-left:20px!important;padding-right:20px!important}}' +
  '</style>';
function mailTeamOP(o) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const int = (haut, bas) => 'padding:' + haut + 'px 36px ' + bas + 'px';
  // Le pré-en-tête : la ligne grise sous l'objet dans la boîte de réception.
  const pre = o.preentete || String(o.corpsHtml || '').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').slice(0, 110);
  const etapes = (o.frise || []).map((e, i) =>
    '<td width="' + Math.floor(100 / (o.frise.length || 1)) + '%" class="m-texte" style="border-top:3px solid ' + (e.fait ? '#1E7A4E' : '#E4E8F0') + ';padding-top:9px;font-size:12.5px;color:' + (e.fait ? '#17233B' : '#8593AB') + '"><b>' + (e.fait && i === 0 ? '✔ ' : '') + esc(e.titre) + '</b><br><span class="m-muet" style="color:#8593AB">' + esc(e.sous) + '</span></td>').join('');
  const bouton = o.boutonTxt ? '<a href="' + esc(o.boutonUrl) + '" class="m-btn" style="display:inline-block;background:#1E7A4E;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;line-height:20px;padding:13px 22px;border-radius:12px;font-family:' + MAIL_POLICE + '">' + esc(o.boutonTxt) + '</a>' : '';
  const bouton2 = o.bouton2Txt ? '<a href="' + esc(o.bouton2Url) + '" class="m-btn2" style="display:inline-block;color:#4A5A7A;text-decoration:none;font-size:14px;line-height:20px;padding:13px 16px;font-family:' + MAIL_POLICE + '">' + esc(o.bouton2Txt) + '</a>' : '';
  const desabo = o.desabo ? ' · <a href="mailto:contact@teamop.fr?subject=Stop%20annonces" style="color:#8593AB">ne plus recevoir les annonces</a>' : '';
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>' + esc(o.titre) + '</title>' + MAIL_STYLE + '</head>' +
    '<body class="m-fond" style="margin:0;padding:0;background:#F2F4F8">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">' + esc(pre) + '&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="m-fond" style="background:#F2F4F8"><tr><td align="center" style="padding:32px 12px">' +
    '<table role="presentation" width="560" cellpadding="0" cellspacing="0" class="m-carte" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:16px;border:1px solid #E4E8F0;font-family:' + MAIL_POLICE + '">' +
    // en-tête : logo TEAM OP (34 px) + mot-marque, puce de contexte à droite
    '<tr><td class="m-int" style="' + int(26, 0) + '"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td><table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
    '<td width="34" style="width:34px"><img src="https://teamop.fr/icons/teamop-192.png" width="34" height="34" alt="TEAM OP" style="width:34px;height:34px;max-width:34px;border-radius:9px;display:block;border:0"></td>' +
    '<td class="m-fort" style="padding-left:11px;font-family:' + MAIL_POLICE + ';font-weight:700;font-size:15px;letter-spacing:.07em;color:#17233B">TEAM OP</td>' +
    '</tr></table></td>' +
    (o.chip ? '<td align="right"><span class="m-chip" style="display:inline-block;background:' + (o.chipBg || '#EAF4EE') + ';color:' + (o.chipColor || '#1E7A4E') + ';font-size:12px;font-weight:600;line-height:16px;padding:5px 11px;border-radius:100px;letter-spacing:.01em">' + esc(o.chip) + '</span></td>' : '') +
    '</tr></table></td></tr>' +
    '<tr><td class="m-int m-fort" style="' + int(26, 0) + ';font-size:22px;line-height:28px;font-weight:700;letter-spacing:-.01em;color:#17233B">' + esc(o.titre) + '</td></tr>' +
    '<tr><td class="m-int m-texte" style="' + int(10, 0) + ';font-size:15px;line-height:24px;color:#4A5A7A">' + o.corpsHtml + '</td></tr>' +
    (o.blocHtml ? '<tr><td class="m-int" style="' + int(20, 0) + '">' + o.blocHtml + '</td></tr>' : '') +
    (etapes ? '<tr><td class="m-int" style="' + int(24, 0) + '"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' + etapes + '</tr></table></td></tr>' : '') +
    ((bouton || bouton2) ? '<tr><td class="m-int" style="' + int(26, 8) + '">' + bouton + bouton2 + '</td></tr>' : '<tr><td style="height:8px;line-height:8px;font-size:0">&nbsp;</td></tr>') +
    '<tr><td class="m-int m-pied" style="' + int(18, 22) + ';border-top:1px solid #EDF0F5;font-size:12px;line-height:18px;color:#8593AB">TEAM OP · la suite de gestion des pros du terrain · <a href="https://teamop.fr" style="color:#1E7A4E;text-decoration:none">teamop.fr</a>' + desabo + '</td></tr>' +
    '</table>' +
    '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%"><tr><td class="m-muet" style="padding:14px 8px 0;font-size:11.5px;line-height:17px;color:#8593AB;font-family:' + MAIL_POLICE + '">Vous recevez cet e-mail parce que vous avez un compte TEAM OP.</td></tr></table>' +
    '</td></tr></table></body></html>';
}

/* ── Encarts réutilisables des e-mails TeamOP (galerie validée par Justin) ── */
const MAIL_BLOCS = {
  // Un bloc = une table à fond très léger et bord fin ; en mode sombre les
  // classes m-bloc reprennent la main (voir MAIL_STYLE).
  cadre: (html, fond, bord, couleur) => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="m-bloc" style="background:' + (fond || '#F6F8FB') + ';border:1px solid ' + (bord || '#E4E8F0') + ';border-radius:12px;color:' + (couleur || '#4A5A7A') + '"><tr><td style="padding:16px 18px;font-size:14px;line-height:22px;font-family:' + MAIL_POLICE + '">' + html + '</td></tr></table>',
  code: (c) => '<div align="center"><div class="m-bloc" style="display:inline-block;background:#F6F8FB;border:1.5px dashed #C9D3E3;border-radius:14px;padding:18px 34px;font-family:\'SF Mono\',Menlo,Consolas,\'Courier New\',monospace;font-size:32px;line-height:38px;font-weight:700;letter-spacing:10px;color:#17233B">' + String(c).split('').join(' ') + '</div><div class="m-muet" style="font-size:12px;line-height:18px;color:#8593AB;padding-top:10px">Ce code expire dans <b>10 minutes</b> · 5 essais maximum</div></div>',
  transmettre: (login) => MAIL_BLOCS.cadre('👤 À transmettre à <b>' + login + '</b> — ce membre de votre équipe a oublié son mot de passe et son compte n\'a pas d\'adresse e-mail.', '#FFF8EC', '#F2DFB6', '#7A5A17'),
  ident: (a, m) => MAIL_BLOCS.cadre('<b>Vos identifiants de départ</b><br>Identifiant : <b style="font-family:\'SF Mono\',Menlo,Consolas,monospace">' + a + '</b> <span class="m-muet" style="color:#8593AB">(votre prénom)</span><br>Mot de passe provisoire : <b style="font-family:\'SF Mono\',Menlo,Consolas,monospace">' + m + '</b> <span class="m-muet" style="color:#8593AB">(votre nom + « !! »)</span>', '#EEF7F2', '#CFE6D8', '#17233B') + '<div class="m-muet" style="font-size:12px;line-height:18px;color:#8593AB;padding-top:8px">À votre première connexion, l\'application vous fait choisir votre vrai mot de passe — ensuite ce sont vos identifiants pour toujours.</div>',
  acces: (a, m) => MAIL_BLOCS.cadre('<b>Vos identifiants</b><br>Identifiant : <b style="font-family:\'SF Mono\',Menlo,Consolas,monospace">' + a + '</b><br>Mot de passe provisoire : <b style="font-family:\'SF Mono\',Menlo,Consolas,monospace">' + m + '</b>', '#EEF7F2', '#CFE6D8', '#17233B') + '<div class="m-muet" style="font-size:12px;line-height:18px;color:#8593AB;padding-top:8px">À votre première connexion, l\'application vous fait choisir votre vrai mot de passe — ensuite ce sont vos identifiants pour toujours.</div>',
  promo: (c, f, fin) => MAIL_BLOCS.cadre('<b>🎁 Code ' + c + ' activé</b><br>Formule <b>' + f + '</b> offerte jusqu\'au <b>' + fin + '</b><br><span class="m-muet" style="color:#8593AB;font-size:12.5px">Aucune carte bancaire requise · un rappel avant la fin</span>', '#F4F0FB', '#DDD3F0', '#3F2B66'),
  echeance: (fin) => MAIL_BLOCS.cadre('<b>⏳ Votre période offerte se termine le ' + fin + '</b><br><span style="font-size:13px">Vos données ne bougent pas, quoi qu\'il arrive — mais sans abonnement, l\'application repassera en formule Gratuit.</span>', '#FFF6EE', '#F5D9BC', '#7A4A17'),
  vigie: (e2) => { const x = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;'); return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#16203A;border-radius:12px"><tr><td style="padding:16px 20px;font-family:\'SF Mono\',Menlo,Consolas,\'Courier New\',monospace;font-size:12px;line-height:20px;color:#D7E2F2">App : ' + x(e2.app) + ' (v' + x(e2.version) + ')<br>Espace : ' + x(e2.team) + '<br>Erreur : ' + x(e2.msg) + '<br>Fichier : ' + x(e2.src || '—') + (e2.line ? ' · ligne ' + e2.line : '') + '<br>Appareil : ' + x(String(e2.ua).slice(0, 90)) + (e2.stack ? '<br><br><span style="color:#8B9AB8">' + x(e2.stack).replace(/\n/g, '<br>') + '</span>' : '') + '</td></tr></table>'; }
};
const FORMULE_LBL2 = { gratuit: 'Gratuit', pro: 'Pro', business: 'Business', premium: 'Business Premium' };
// avis « ton code est activé » — envoyé UNE fois, à l'adresse de l'entreprise
function mailPromoActive(teamT, code, finLe, formule) {
  try {
    if (!mailer || !teamT) return;
    const e = Object.values(espacesReg).find(x => {
      if (x.t) return x.t === teamT;
      try { return String(JSON.parse(Buffer.from(x.code, 'base64').toString('utf8')).t || '') === teamT; } catch (err) { return false; }
    });
    if (!e || !e.email) return;
    const lbl = FORMULE_LBL2[formule] || formule || 'Business Premium';
    const finFr = /^\d{4}-\d{2}-\d{2}$/.test(String(finLe)) ? String(finLe).split('-').reverse().join('/') : String(finLe || '');
    mailerEnvoi({ from: config.smtp.from || config.smtp.user, to: e.email,
      subject: '🎁 Votre code est activé — TEAM OP',
      text: 'Bonjour,\n\nvotre code promo ' + code + ' vient d\'être activé : formule ' + lbl + ' offerte jusqu\'au ' + finFr + ', sans carte bancaire.\n\n— TEAM OP · teamop.fr',
      html: mailTeamOP({ chip: 'Cadeau', chipBg: '#F1EBFC', chipColor: '#6D3FC4', titre: 'Votre code est activé 🎁',
        corpsHtml: 'Bonjour,<br>bonne nouvelle : votre code promo vient d\'être activé sur votre espace.',
        blocHtml: MAIL_BLOCS.promo(code, lbl, finFr),
        boutonTxt: 'Ouvrir mon application', boutonUrl: 'https://teamop.fr/app.html' })
    }).catch(() => {});
  } catch (err) {}
}
// envoi d'e-mail (rapports, avis de passage) — nécessite la config smtp
app.post('/api/email', async (req, res) => {
  if (!mailer) return res.status(503).json({ error: "e-mail non configuré sur le serveur (config.json → smtp)" });
  const { key, to, subject, text, html } = req.body || {};
  if (key !== config.apiKey) return res.status(403).json({ error: 'clé invalide' });
  if (!to || !subject) return res.status(400).json({ error: 'to et subject requis' });
  try {
    await mailerEnvoi({ from: config.smtp.from || config.smtp.user, to, subject: String(subject).slice(0, 200), text, html });
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
      /* Tri à l'entrée : un « gel » de plus d'une minute n'est pas un gel.
         Sur les 9 incidents ouverts du 3 septembre, l'un annonçait « Interface figée pendant
         1 633 855 ms » — 27 minutes. Un navigateur ne gèle pas 27 minutes : l'appareil a été
         mis en veille, et le compteur a continué de tourner. Ces faux positifs noyaient les
         vrais problèmes clients, au point que l'écran d'accueil annonçait « tout est à jour ».
         La règle est volontairement objective : aucune interprétation, juste une durée
         physiquement impossible. Tout le reste continue d'arriver comme avant. */
      /* ── LE TRIEUR ────────────────────────────────────────────────────────────────────
         Trois règles mécaniques, sans jugement, appliquées avant que l'incident atteigne la
         Tour. Rien n'est supprimé : tout est enregistré, simplement classé hors de « à
         traiter » pour que les vrais problèmes clients ne soient plus noyés. Chaque classement
         est consultable dans la Surveillance, filtre par statut — un tri qu'on ne peut pas
         relire est un tri auquel on ne peut pas se fier. */
      const gel = /fig[ée]e? pendant (\d+)\s*ms/i.exec(message);
      // 1. Un « gel » de plus d'une minute est une mise en veille de l'appareil, pas un blocage.
      const veille = !!(gel && parseInt(gel[1], 10) > 60000);
      // 2. Ce que rapporte l'équipe en développant n'est pas un problème client. La liste vient
      //    de config.json (interneEmails / interneEspaces) : aucune adresse n'est devinée ici.
      const internes = (config.interneEmails || []).map(x => String(x).toLowerCase());
      const espacesInternes = (config.interneEspaces || []).map(x => String(x).toLowerCase());
      const interne = (!!entEmail && internes.indexOf(entEmail) >= 0)
        || espacesInternes.indexOf(String(monStr(r.espace, 80) || '').toLowerCase()) >= 0;
      // 3. Transitoires connus : ils se résolvent seuls au rechargement suivant.
      const transitoire = /Failed to update a ServiceWorker|ServiceWorker.*(register|update).*(fail|error)|NetworkError when attempting to fetch|Load failed/i.test(message);
      const triage = veille ? 'veille' : (interne ? 'interne' : (transitoire ? 'transitoire' : ''));
      let issue = monIssues.find(i => i.signature === signature);
      if (!issue) {
        issue = { id: 'i' + crypto.randomBytes(6).toString('hex'), signature, app: appName, version: monStr(r.version, 12), categorie: monStr(r.categorie, 40) || 'Général', type, message, stack: monStr(r.stack, 600), src: monStr(r.src, 200), line: parseInt(r.line, 10) || 0, entreprises: [], appareils: {}, count: 0, firstTs: now, lastTs: now, statut: triage || 'nouveau', triage: triage || undefined, notes: '', mailEnvoye: false };
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
/* ── Les applications de la Tour ─────────────────────────────────────────────────────────────
   Un compte de la Tour ne voit que les applications qu'on lui a ouvertes : OP GESTION, OP MESSAGES,
   ou les deux. Un TABLEAU de clés, pas des booléens — ce serveur s'est déjà fait piéger par un
   booléen relâché ({"opMessages":"false"} OUVRAIT l'application, voir /espaces/apps) ; une liste se
   filtre contre une liste blanche, il n'y a pas de « faux qui vaut vrai ». Les clés sont celles
   qu'écrit déjà /api/connexions et que porte le hash de la Tour (#gestion/…, #messages/…). */
const TOUR_APPS = ['gestion', 'messages'];
const TOUR_APP_NOM = { gestion: 'OP GESTION', messages: 'OP MESSAGES' };
/* Les rapports d'incident portent des étiquettes historiques (« elan », « opmsg »…) : cette table
   les rattache à une application. Une étiquette absente vaut OP GESTION — l'application qui existe. */
const TOUR_APP_DES_TAGS = { opgestion: 'gestion', elan: 'gestion', 'elan-gestion': 'gestion', elangestion: 'gestion', espace: 'gestion', stripe: 'gestion', inconnue: 'gestion', opmessages: 'messages', opmsg: 'messages', messages: 'messages' };
const monAppDeTag = t => TOUR_APP_DES_TAGS[String(t || '').toLowerCase()] || 'gestion';
/* Seule source de vérité sur ce qu'un compte peut ouvrir. Le patron a TOUT, par calcul et non par
   donnée : son champ apps est ignoré ici et refusé à l'écriture — on ne peut pas se retirer une
   application par erreur, et set-admin.sh n'a rien à écrire. Un compte SANS champ vaut ['gestion']
   seulement : OP MESSAGES s'ouvre par un geste du patron, tracé, jamais par défaut. Rien à réécrire
   dans monitor.json — le champ n'apparaît qu'au premier réglage (migration paresseuse, comme
   opMessages sur l'annuaire). Le compte de repli {id:'u0', role:'patron'} passe par ici aussi. */
function monApps(u) {   // u : entrée de monUsers, ou la session de repli du jeton
  if (!u || u.role === 'patron') return TOUR_APPS.slice();
  const l = Array.isArray(u.apps) ? u.apps.filter(a => TOUR_APPS.includes(a)) : [];
  return l.length ? [...new Set(l)] : ['gestion'];
}
/* Lecture d'une liste d'applications venue du client → { apps } ou { error }. Une clé inconnue est
   REFUSÉE, pas ignorée en silence : le contraire du booléen relâché. Une liste vide aussi — couper
   un accès, c'est users/toggle, pas une liste sans rien. */
function monAppsLire(v) {
  if (!Array.isArray(v)) return { error: 'apps : une liste d\'applications est attendue' };
  if (v.some(a => typeof a !== 'string')) return { error: 'apps : des noms d\'application sont attendus' };   // String(['gestion']) vaut 'gestion' : sans ce test, [['gestion']] passait
  const l = [...new Set(v)];
  const inconnue = l.find(a => !TOUR_APPS.includes(a));
  if (inconnue !== undefined) return { error: 'application inconnue : ' + monStr(inconnue, 20) };
  if (!l.length) return { error: 'au moins une application' };
  return { apps: l };
}
const monTokens = new Map();          // token -> { exp, userId, nom, role, apps } — apps n'y est qu'un instantané, voir monAdmin
// les sessions de la Tour survivent aux redémarrages du serveur
const TOKENS_PATH = path.join(DATA_DIR, 'tour-sessions.json');
try { for (const [t, v] of JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'))) if (v && v.exp > Date.now()) monTokens.set(t, v); } catch (e) {}
function monTokensSave() { try { fs.writeFileSync(TOKENS_PATH, JSON.stringify([...monTokens].filter(([, v]) => v.exp > Date.now()))); } catch (e) {} }
const monLoginTries = new Map();      // ip -> { count, reset }
const monLock = new Map();            // ident -> { fails, until } : 5 échecs consécutifs = verrou 15 min
const monHash = p => crypto.createHash('sha256').update(String(p)).digest('hex');
setInterval(() => { const now = Date.now(); let ch = false; for (const [t, s] of monTokens) if (now > s.exp) { monTokens.delete(t); ch = true; } if (ch) monTokensSave(); }, 600000).unref();
function monUA(req) {   // appareil simplifié pour le journal (jamais l'UA complet)
  const u = String(req.headers['user-agent'] || '');
  const ap = /iPhone|iPad|iPod/i.test(u) ? 'iPhone' : (/Android/i.test(u) ? 'Android' : 'PC');
  const nv = /Edg\//.test(u) ? 'Edge' : (/OPR\//.test(u) ? 'Opera' : (/Chrome\//.test(u) ? 'Chrome' : (/Firefox\//.test(u) ? 'Firefox' : (/Safari\//.test(u) ? 'Safari' : (/curl/i.test(u) ? 'curl' : 'autre')))));
  return ap + ' · ' + nv;
}
function monLog(ident, ok, req, motif, apps) {   // journal des connexions (réussies ET échouées) ; apps : ce que le compte ouvre, sur les réussites
  monJournal.push(Object.assign({ ts: Date.now(), qui: monStr(ident, 120), ok: !!ok, appareil: monUA(req), motif: monStr(motif, 60) }, apps ? { apps: monStr(apps, 40) } : {}));
  if (monJournal.length > 300) monJournal = monJournal.slice(-300);
  monSave();
}
app.post('/api/monitor/login', (req, res) => {
  const ip = req.ip || '?';   // req.ip, jamais l'en-tête brut : nginx AJOUTE à la valeur reçue, donc .split(',')[0] rend celle de l'appelant
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
  const duree = (req.body || {}).rester ? 30 * 24 * 3600000 : 24 * 3600000;   // « rester connecté » : 30 jours
  const apps = monApps(user);
  monTokens.set(token, { exp: Date.now() + duree, userId: user.id, nom: user.nom, role: user.role, apps });
  monTokensSave();
  monLoginTries.delete(ip); monLock.delete(ident);
  monLog(user.nom, true, req, '', apps.join('+'));
  res.json({ ok: true, token, exp: 24 * 3600, nom: user.nom, role: user.role, apps });
});
/* Quelle application possède une route. Tout ce qui n'est pas listé est OP GESTION : c'est
   l'application qui existe, et une route oubliée doit être REFUSÉE à un compte OP MESSAGES,
   jamais ouverte par défaut. Un compte limité à OP MESSAGES ne peut atteindre que COMMUN + MESSAGES.
   Pourquoi une table ici plutôt qu'un middleware par route : il y a plus de 80 routes /api/monitor
   (mail.js compris) ; en poser un par route, c'est autant d'occasions d'en oublier une, et l'oubli
   OUVRIRAIT. Ici l'oubli FERME, et se voit : le compte reçoit un 403 avec le champ app.
   ⚠ Une route /api/monitor nouvelle doit dire son application — ici, pas ailleurs. */
/* Ce qui est COMMUN se limite à ce qu'un compte OP MESSAGES peut légitimement voir : sa session, l'équipe,
   les incidents (filtrés), la santé, la liste des entreprises (projetée), et la LECTURE de la boîte support.
   Tout le courrier (mail/*, 16 routes de mail.js) est GESTION : la boîte contient les liens de connexion
   envoyés aux entreprises, et ses dossiers se lisent librement — une lecture de « Envoyés » y trouverait la
   clé d'équipe de n'importe quelle cliente. Les écritures support (répondre, envoyer, retirer, marquer)
   engagent l'adresse officielle : GESTION aussi. /mails (journal des e-mails, adresses des clientes) : GESTION. */
const ROUTES_COMMUNES = /^\/api\/monitor\/(login|moi|users(\/.*)?|journal|issues(\/archive)?|status|expliquer|proposer|sante|support\/(box|mails|envoyes)|entreprises)$/;
const ROUTES_MESSAGES = /^\/api\/monitor\/(espaces\/apps|messages(\/.*)?)$/;
function monAppDeRoute(req) {
  /* Le chemin DÉCLARÉ de la route (req.route.path), pas l'URL reçue : Express accepte
     « /API/MONITOR/ESPACES/APPS/ » pour la même route, et une table qui lirait l'URL brute
     classerait cette variante en GESTION — ouvrant une route MESSAGES à un compte qui n'a que
     GESTION. Repli sur l'URL normalisée si le garde était un jour monté hors d'une route.
     ⚠ mail.js déclare ses chemins EN ENTIER ('/api/monitor/mail/boites', monté sur app) : c'est ce qui
     rend req.route.path complet ici. S'il devenait un express.Router() monté sur '/api/monitor/mail',
     req.route.path vaudrait '/boites', la table ne le reconnaîtrait plus et tout tomberait en GESTION —
     ça ferme, mais ça casserait la Tour sans un mot. */
  const p = String(req.route && typeof req.route.path === 'string' ? req.route.path : req.path).toLowerCase().replace(/\/+$/, '');
  return ROUTES_COMMUNES.test(p) ? null : (ROUTES_MESSAGES.test(p) ? 'messages' : 'gestion');
}
function monAppRefuse(req, res) {   // vrai si la réponse est partie
  const a = monAppDeRoute(req);
  if (!a || req.tourUser.apps.includes(a)) return false;
  res.status(403).json({ error: 'Cette action appartient à la Tour ' + TOUR_APP_NOM[a] + ' — ton compte n’y a pas accès.', app: a });
  return true;
}
/* Même chose pour un incident : /issues est filtré à la lecture, mais /status, /expliquer et
   /proposer prennent un id — filtrer la lecture et laisser l'écriture ouverte serait une passoire. */
function monIssueRefuse(req, res, issue) {
  const a = monAppDeTag(issue.app);
  if (req.tourUser.apps.includes(a)) return false;
  res.status(403).json({ error: 'Cet incident appartient à la Tour ' + TOUR_APP_NOM[a] + ' — ton compte n’y a pas accès.', app: a });
  return true;
}
function monAdmin(req, res, next) {
  const m = /^Bearer\s+([a-f0-9]{48})$/.exec(String(req.headers.authorization || ''));
  const s = m && monTokens.get(m[1]);
  if (!s || Date.now() > s.exp) return res.status(401).json({ error: 'session expirée — reconnecte-toi' });
  /* « s.userId && » n'est pas superflu : sans lui, une session sans identifiant s'accroche au
     PREMIER compte dépourvu de champ « id » et lui emprunte son rôle — un compte simple
     décrocherait ainsi les droits du patron. Aucune route n'en crée aujourd'hui, mais une
     édition à la main de monitor.json suffirait. */
  const u = (monUsers.length && s.userId) ? monUsers.find(x => x.id === s.userId) : null;
  if (monUsers.length && (!u || !u.actif)) return res.status(401).json({ error: 'accès désactivé — reconnecte-toi' });
  /* apps se relit dans monUsers à CHAQUE requête, jamais dans le jeton : sinon un compte privé
     d'OP MESSAGES la garderait jusqu'à 30 jours (« rester connecté »). Même règle que role et actif. */
  req.tourUser = { id: s.userId, nom: (u ? u.nom : s.nom), role: (u ? u.role : s.role), apps: monApps(u || s) };
  if (monAppRefuse(req, res)) return;
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
  /* « s.userId && » n'est pas superflu : sans lui, une session sans identifiant s'accroche au
     PREMIER compte dépourvu de champ « id » et lui emprunte son rôle — un compte simple
     décrocherait ainsi les droits du patron. Aucune route n'en crée aujourd'hui, mais une
     édition à la main de monitor.json suffirait. */
  const u = (monUsers.length && s.userId) ? monUsers.find(x => x.id === s.userId) : null;
  if (monUsers.length && (!u || !u.actif)) return res.status(403).json({ error: 'réservé au patron' });
  req.tourUser = { id: s.userId, nom: (u ? u.nom : s.nom), role: (u ? u.role : s.role), apps: monApps(u || s) };   // apps relu dans monUsers, voir monAdmin
  if (monAppRefuse(req, res)) return;   // avant le rôle : « c'est l'autre Tour » est la réponse la plus utile, et la Tour relit /moi dessus
  if (req.tourUser.role !== 'patron') return res.status(403).json({ error: 'réservé au patron' });
  next();
}

/* Ce que le compte connecté a le droit d'ouvrir, relu dans monUsers. La Tour l'appelle quand sa
   session vient du stockage — sans ça, un collaborateur qui a reçu OP MESSAGES hier ne la verrait
   qu'à sa prochaine connexion — et quand un 403 porte un champ app : ses droits ont changé. */
app.get('/api/monitor/moi', monAdmin, (req, res) => {
  res.json({ ok: true, id: req.tourUser.id, nom: req.tourUser.nom, role: req.tourUser.role, apps: req.tourUser.apps });
});
// ── gestion de l'équipe Tour (patron uniquement pour créer/désactiver/supprimer)
app.get('/api/monitor/users', monPatronStrict, (req, res) => {
  res.json({ users: monUsers.map(u => ({ id: u.id, nom: u.nom, email: u.email || '', role: u.role, actif: !!u.actif, ts: u.ts || 0, creePar: u.creePar || '', apps: monApps(u), appsPar: u.appsPar || '', appsTs: u.appsTs || 0 })) });
});
// journal des connexions (réussies et échouées) — visible par le patron dans la section Équipe
app.get('/api/monitor/mails', monAdmin, (req, res) => { res.json({ ok: true, mails: mailsLog.slice(0, 120) }); });
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
  // apps facultatif : sans lui, le compte n'a qu'OP GESTION. Mêmes règles que users/apps.
  let apps = null;
  if ((req.body || {}).apps !== undefined) { const l = monAppsLire((req.body || {}).apps); if (l.error) return res.status(400).json({ error: l.error }); apps = l.apps; }
  const u = { id: 'u' + crypto.randomBytes(5).toString('hex'), nom, email, hash: monHash(pass), role: 'collaborateur', actif: true, ts: Date.now(), creePar: req.tourUser.nom };
  if (apps) { u.apps = apps; u.appsPar = req.tourUser.nom; u.appsTs = u.ts; }
  monUsers.push(u); monSave();
  res.json({ ok: true, user: { id: u.id, nom: u.nom, email: u.email, role: u.role, actif: true, apps: monApps(u) } });
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
/* Régler les applications d'un compte. Immédiat pour lui — le garde-fou relit monUsers à chaque
   requête, pas le jeton. Un compte inactif peut en recevoir : le patron prépare avant de rouvrir. */
app.post('/api/monitor/users/apps', monPatronStrict, (req, res) => {
  const u = monUsers.find(x => x.id === (req.body || {}).id);
  if (!u) return res.status(404).json({ error: 'compte introuvable' });
  if (u.role === 'patron') return res.status(400).json({ error: 'le patron a toutes les applications' });
  const l = monAppsLire((req.body || {}).apps);
  if (l.error) return res.status(400).json({ error: l.error });
  u.apps = l.apps; u.appsPar = req.tourUser.nom; u.appsTs = Date.now(); monSave();
  console.log('Tour :', req.tourUser.nom, 'règle les applications de', u.nom, ':', l.apps.join('+'));   // compte d'équipe, pas une donnée client
  res.json({ ok: true, id: u.id, apps: l.apps });
});

// ── Accès d'essai à la bêta (teamop.fr/beta.html) ──
//    La bêta est une page publique. Sans ceci, elle se laissait ouvrir avec le compte de
//    départ admin / 1234, comme n'importe quelle installation neuve — et son espace de
//    synchro, chiffré avec la clé par défaut de l'application, se lisait avec. Les accès
//    d'essai se créent donc ICI, par le patron, et se coupent d'un clic : un accès coupé
//    ne passe plus la porte, même s'il connaît encore son mot de passe.
//    Ils ne vivent nulle part ailleurs : ni dans Firestore, ni dans le fichier de l'app.
const BETA_PATH = path.join(DATA_DIR, 'beta-comptes.json');
let betaComptes = [];
try { betaComptes = JSON.parse(fs.readFileSync(BETA_PATH, 'utf8')) || []; } catch (e) {}
function betaSave() { try { fs.writeFileSync(BETA_PATH, JSON.stringify(betaComptes)); } catch (e) { console.error('beta save:', e.message); } }
// Le chantier — ce que la personne teste — n'est pas décoratif : un accès bêta sans raison
// écrite est un accès qu'on n'ose plus couper parce qu'on ne sait plus à quoi il servait.
const betaPublic = c => ({ id: c.id, login: c.login, nom: c.nom, chantier: c.chantier || '', actif: !!c.actif, ts: c.ts || 0, creePar: c.creePar || '', derniere: c.derniere || 0 });
app.get('/api/monitor/beta', monPatronStrict, (req, res) => { res.json({ comptes: betaComptes.map(betaPublic) }); });
app.post('/api/monitor/beta', monPatronStrict, (req, res) => {
  const login = monStr((req.body || {}).login, 40).trim().toLowerCase();
  const nom = monStr((req.body || {}).nom, 60).trim();
  const pass = monStr((req.body || {}).pass, 200);
  const chantier = monStr((req.body || {}).chantier, 120).trim();
  if (!/^[a-z0-9._@-]{3,40}$/.test(login)) return res.status(400).json({ error: 'identifiant : 3 à 40 caractères, lettres, chiffres, . _ @ -' });
  if (pass.length < 8) return res.status(400).json({ error: 'mot de passe de 8 caractères minimum' });
  if (betaComptes.some(c => c.login === login)) return res.status(409).json({ error: 'cet identifiant existe déjà' });
  if (betaComptes.length >= 50) return res.status(400).json({ error: 'trop d\'accès d\'essai (50 max)' });
  const c = { id: 'b' + crypto.randomBytes(5).toString('hex'), login, nom: nom || login, chantier, hash: monHash(pass), actif: true, ts: Date.now(), creePar: req.tourUser.nom };
  betaComptes.push(c); betaSave();
  res.json({ ok: true, compte: betaPublic(c) });
});
// Un chantier se termine et un autre commence sans que l'accès change de main : il doit se
// réécrire, sinon la seule façon de le corriger serait de supprimer l'accès et de le rouvrir.
app.post('/api/monitor/beta/chantier', monPatronStrict, (req, res) => {
  const c = betaComptes.find(x => x.id === (req.body || {}).id);
  if (!c) return res.status(404).json({ error: 'accès introuvable' });
  c.chantier = monStr((req.body || {}).chantier, 120).trim(); betaSave();
  res.json({ ok: true, compte: betaPublic(c) });
});
app.post('/api/monitor/beta/toggle', monPatronStrict, (req, res) => {
  const c = betaComptes.find(x => x.id === (req.body || {}).id);
  if (!c) return res.status(404).json({ error: 'accès introuvable' });
  c.actif = !c.actif; betaSave();
  res.json({ ok: true, actif: c.actif });
});
app.post('/api/monitor/beta/delete', monPatronStrict, (req, res) => {
  const id = (req.body || {}).id;
  if (!betaComptes.some(x => x.id === id)) return res.status(404).json({ error: 'accès introuvable' });
  betaComptes = betaComptes.filter(x => x.id !== id); betaSave();
  res.json({ ok: true });
});
// La porte elle-même. Publique (la bêta l'appelle depuis le navigateur), donc bornée comme
// /api/monitor/login : même verrou par identifiant, et /api/beta figure dans ROUTES_SENSIBLES
// pour le plafond par adresse. Réponse identique pour un identifiant inconnu et un mauvais
// mot de passe : la route ne doit pas dire quels accès existent.
app.post('/api/beta/login', (req, res) => {
  const login = monStr((req.body || {}).login, 40).trim().toLowerCase();
  const pass = monStr((req.body || {}).pass, 200);
  const ident = 'bêta:' + login;
  const lk = monLock.get(ident);
  if (lk && lk.until > Date.now()) { monLog(ident, false, req, 'verrouillé'); return res.status(429).json({ error: 'accès temporairement verrouillé (15 min) après plusieurs échecs' }); }
  const echec = (motif) => { const l = monLock.get(ident) || { fails: 0, until: 0 }; l.fails++; if (l.fails >= 5) { l.until = Date.now() + 15 * 60000; l.fails = 0; } monLock.set(ident, l); monLog(ident, false, req, motif); };
  const c = betaComptes.find(x => x.login === login);
  if (!c || !pass || monHash(pass) !== c.hash) { echec('identifiants'); return res.status(403).json({ error: 'identifiant ou mot de passe incorrect' }); }
  if (!c.actif) { echec('accès désactivé'); return res.status(403).json({ error: 'cet accès d\'essai a été coupé depuis la Tour de contrôle' }); }
  c.derniere = Date.now(); betaSave();
  monLock.delete(ident); monLog(ident, true, req, '');
  res.json({ ok: true, login: c.login, nom: c.nom });
});
// Un appareil resté connecté redemande si sa porte est toujours ouverte : « coupé » depuis
// la Tour doit fermer aussi les sessions déjà ouvertes. Même réponse pour un accès inconnu.
app.post('/api/beta/etat', (req, res) => {
  const login = monStr((req.body || {}).login, 40).trim().toLowerCase();
  const c = betaComptes.find(x => x.login === login);
  res.json({ ouvert: !!(c && c.actif) });
});

/* ── Annuaire des espaces entreprise : « nom d'entreprise » → code de connexion ──
   Rempli depuis la Tour (patron) quand un lien de connexion est généré. Permet la
   connexion à la Organilog : l'utilisateur tape le nom de son entreprise dans l'app,
   le serveur lui rend le code d'espace, puis identifiant + mot de passe. */
const ESPACES_PATH = path.join(DATA_DIR, 'espaces.json');
let espacesReg = {};
try { espacesReg = JSON.parse(fs.readFileSync(ESPACES_PATH, 'utf8')); } catch (e) {}
const espSlug = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
/* \u2500\u2500 Le code d'espace ne porte PLUS de mot de passe en clair \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   Le code est du base64, pas du chiffrement : tout ce qu'il contient est lisible par qui
   l'obtient. Le champ \u00ab m \u00bb y transportait le mot de passe provisoire de
   l'administrateur EN CLAIR : un nom d'entreprise suffisait donc \u00e0 r\u00e9cup\u00e9rer un
   identifiant et le mot de passe qui va avec.
   Le champ ne peut pas simplement dispara\u00eetre : c'est lui qui permet \u00e0 l'application, \u00e0
   la premi\u00e8re connexion, de reconna\u00eetre le mot de passe provisoire annonc\u00e9 par e-mail.
   On le remplace donc par \u00ab mh \u00bb, son empreinte SHA-256 \u2014 exactement ce que l'application
   comparait d\u00e9j\u00e0 (elle hachait \u00ab m \u00bb de son c\u00f4t\u00e9). Le mot de passe lui-m\u00eame ne circule
   plus que dans l'e-mail adress\u00e9 \u00e0 l'int\u00e9ress\u00e9.
   NB : \u00ab k \u00bb (cl\u00e9 d'\u00e9quipe) reste dans le code, l'appareil en a besoin pour rejoindre
   l'espace. C'est une divulgation distincte, \u00e0 traiter par un lien \u00e0 jeton \u2014 voir le
   rapport. Cette fonction ferme la fuite du mot de passe, pas celle-l\u00e0. */
const mdpEmpreinte = (p) => crypto.createHash('sha256').update(String(p)).digest('hex');
function codeMdpHache(code) {
  try {
    const o = JSON.parse(Buffer.from(String(code || ''), 'base64').toString('utf8'));
    if (!o || typeof o !== 'object' || !o.m) return String(code || '');
    o.mh = mdpEmpreinte(o.m); delete o.m;
    return Buffer.from(JSON.stringify(o), 'utf8').toString('base64').replace(/=+$/, '');
  } catch (e) { return String(code || ''); }
}
/* Reprise au d\u00e9marrage : les codes d\u00e9j\u00e0 enregistr\u00e9s portent le mot de passe en clair \u2014
   corriger le code neuf sans reprendre l'annuaire laisserait la fuite enti\u00e8re sur tous
   les espaces existants, qui sont pr\u00e9cis\u00e9ment ceux qui ont des donn\u00e9es. */
(function repriseMdpAnnuaire() {
  let n = 0;
  for (const slug of Object.keys(espacesReg)) {
    const e = espacesReg[slug];
    if (!e || !e.code) continue;
    const propre = codeMdpHache(e.code);
    if (propre !== e.code) { e.code = propre; n++; }
  }
  if (n) {
    try { fs.writeFileSync(ESPACES_PATH, JSON.stringify(espacesReg)); } catch (e) {}
    console.log('annuaire : mot de passe remplac\u00e9 par son empreinte dans', n, 'code(s) d\'espace');
  }
})();
app.post('/api/monitor/espaces', monPatronStrict, (req, res) => {
  const nom = monStr((req.body || {}).nom, 80).trim();
  const code = codeMdpHache(monStr((req.body || {}).code, 4000).trim());
  const slug = espSlug(nom);
  if (!slug || !code) return res.status(400).json({ error: 'nom et code requis' });
  let t = '';
  try { const o = JSON.parse(Buffer.from(code, 'base64').toString('utf8')); t = String(o.t || ''); } catch (e) {}
  const prev = espacesReg[slug] || {};
  // un nom = une seule entreprise : refus si le nom est déjà pris par un AUTRE espace
  if (prev.t && t && prev.t !== t) return res.status(409).json({ error: 'Ce nom est déjà utilisé par une autre entreprise — choisis une variante (ex. ajoute la ville)' });
  /* Le code d'accès ne figure PAS ici : il vit dans son propre registre, indexé par l'identifiant
     d'équipe (voir /api/espaces/ouvrir). Le reporter depuis « prev » ressuscitait un code révoqué
     dès qu'on rouvrait le panneau d'un ancien nom du même espace. */
  /* « origine » sépare deux choses qu'on confondait dans la Tour : un accès que TEAM OP
     ouvre pour lui-même (essai, démonstration) et l'espace d'une entreprise qui s'est
     inscrite sur le site. Les deux vivent dans le même annuaire — c'est voulu, ce sont de
     vrais espaces — mais les mélanger à l'écran, c'est risquer de supprimer un client en
     croyant faire le ménage. Seul l'appelant sait : la fiche d'un client ne l'envoie pas. */
  const origine = ((req.body || {}).origine === 'tour') ? 'tour' : (prev.origine || 'site');
  /* « opMessages » se reporte, comme la formule. Cette route reconstruit l'entrée de zéro, et
     elle est appelée par « Revoir le lien de connexion » aussi bien que par l'ouverture d'un
     accès : sans ce report, redonner son lien à une entreprise lui REFERMAIT OP MESSAGES —
     sans erreur, sans journal, sans que rien à l'écran ne le dise. Mesuré par le gardien. */
  espacesReg[slug] = { nom, code, t, ts: Date.now(), par: req.tourUser.nom, origine, email: monStr((req.body || {}).email, 120).toLowerCase() || prev.email || '',
    opMessages: prev.opMessages,
    formule: prev.formule, quantite: prev.quantite, formulePar: prev.formulePar, formuleTs: prev.formuleTs };
  try { fs.writeFileSync(ESPACES_PATH, JSON.stringify(espacesReg)); } catch (e) {}
  res.json({ ok: true, slug });
});
// le patron attribue la formule d'un espace (Gratuit/Pro/Business/Premium × quantité)
app.post('/api/monitor/espaces/formule', monPatronStrict, (req, res) => {
  const slug = espSlug(monStr((req.body || {}).nom, 80));   // borné : voir /api/espaces/ouvrir
  const e = espacesReg[slug];
  if (!e) return res.status(404).json({ error: 'Espace inconnu — génère d\'abord son « Lien de connexion » (fiche entreprise)' });
  const f = monStr((req.body || {}).formule, 20);
  if (!['gratuit', 'pro', 'business', 'premium'].includes(f)) return res.status(400).json({ error: 'formule inconnue' });
  const q = Math.max(1, Math.min(50, parseInt((req.body || {}).quantite, 10) || 1));
  e.formule = f; e.quantite = q; e.formulePar = req.tourUser.nom; e.formuleTs = Date.now();
  try { if (!e.t) { const o = JSON.parse(Buffer.from(e.code, 'base64').toString('utf8')); e.t = String(o.t || ''); } } catch (err) {}
  try { fs.writeFileSync(ESPACES_PATH, JSON.stringify(espacesReg)); } catch (err) {}
  console.log('Tour :', req.tourUser.nom, 'attribue', f, '×' + q, 'à', slug);
  // le « Mon espace » du client reflète l'attribution : accès activé + abonnement affiché
  if (e.email) fbMajFicheClient(e.email, { status: 'fourni', apps: ['elan'], plan: FORMULE_LBL[f] || f, planStatus: 'actif' }).catch(() => {});
  res.json({ ok: true, slug, formule: f, quantite: q });
});
// ── L'abonnement réglé à la main par le patron (fiche entreprise de la Tour) : formule, places,
//    statut et date de fin. Il PRIME sur les portes automatiques (Stripe, code promo). ──
const ABO_STATUTS = ['auto', 'actif', 'essai', 'impaye', 'suspendu', 'annule'];
app.post('/api/monitor/espaces/abonnement', monPatronStrict, (req, res) => {
  const b = req.body || {};
  const slug = espSlug(b.nom);
  const e = espacesReg[slug];
  if (!e) return res.status(404).json({ error: 'Espace inconnu — génère d\'abord son « Lien de connexion » (fiche entreprise)' });
  const f = monStr(b.formule, 20);
  if (!['gratuit', 'pro', 'business', 'premium'].includes(f)) return res.status(400).json({ error: 'formule inconnue' });
  const st = monStr(b.statut, 12) || 'auto';
  if (!ABO_STATUTS.includes(st)) return res.status(400).json({ error: 'statut inconnu' });
  const fin = monStr(b.fin, 10);
  if (fin && !/^\d{4}-\d{2}-\d{2}$/.test(fin)) return res.status(400).json({ error: 'date de fin invalide (AAAA-MM-JJ)' });
  const q = Math.max(1, Math.min(50, parseInt(b.quantite, 10) || 1));
  e.formule = f; e.quantite = q; e.formulePar = req.tourUser.nom; e.formuleTs = Date.now();
  e.aboStatut = st === 'auto' ? '' : st; e.aboFin = fin; e.aboPar = req.tourUser.nom; e.aboTs = Date.now();
  try { if (!e.t) { const o = JSON.parse(Buffer.from(e.code, 'base64').toString('utf8')); e.t = String(o.t || ''); } } catch (err) {}
  try { fs.writeFileSync(ESPACES_PATH, JSON.stringify(espacesReg)); } catch (err) {}
  console.log('Tour :', req.tourUser.nom, 'règle l\'abonnement de', slug, ':', f, '×' + q, st, fin || '');
  // la fiche client (site « Mon espace ») reflète le réglage
  const ps = { auto: 'actif', actif: 'actif', essai: 'essai', impaye: 'impaye', suspendu: 'impaye', annule: 'annule' }[st] || 'actif';
  if (e.email) fbMajFicheClient(e.email, { status: 'fourni', apps: ['elan'], plan: FORMULE_LBL[f] || f, planStatus: ps, planFin: fin }).catch(() => {});
  res.json({ ok: true, slug, formule: f, quantite: q, statut: e.aboStatut || 'auto', fin });
});
// payé ? — le réglage manuel du patron d'abord ; sinon trois portes : formule gratuite, code promo actif, abonnement Stripe actif
const espStripeCache = { ts: 0, data: null };
async function espacePaye(e) {
  if (!e || !e.formule) return { paye: false, motif: 'aucune formule' };
  if (e.aboStatut) {   // réglé à la main dans la Tour
    const auj = new Date().toISOString().slice(0, 10);
    if (e.aboStatut === 'actif' || e.aboStatut === 'essai') {
      if (e.aboFin && e.aboFin < auj) return { paye: false, motif: (e.aboStatut === 'essai' ? 'essai' : 'abonnement') + ' terminé le ' + e.aboFin + ' (réglé par ' + (e.aboPar || 'TEAM OP') + ')', finLe: e.aboFin };
      return { paye: true, motif: (e.aboStatut === 'essai' ? 'essai offert' : 'abonnement activé') + ' par ' + (e.aboPar || 'TEAM OP') + (e.aboFin ? ' (jusqu\'au ' + e.aboFin + ')' : ''), finLe: e.aboFin || '' };
    }
    return { paye: false, motif: { impaye: 'impayé', suspendu: 'suspendu', annule: 'annulé' }[e.aboStatut] + ' (réglé par ' + (e.aboPar || 'TEAM OP') + ')' };
  }
  if (e.formule === 'gratuit') return { paye: true, motif: 'gratuit' };
  try {   // rattrapage : un code demandé à la demande d'accès mais jamais compté (espace recréé…) s'active ici
    if (e.codePromo && e.t) {
      const c = String(e.codePromo).toUpperCase();
      const p = (config.promos || []).find(x => String(x.code || '').trim().toUpperCase() === c);
      const u0 = promoUsages[c] || { n: 0, equipes: {} };
      if (p && !u0.equipes[e.t] && !(p.maxUtilisations && u0.n >= p.maxUtilisations)) {
        const dF = new Date(); dF.setMonth(dF.getMonth() + Math.max(1, Number(p.mois) || 1));
        u0.n++; u0.equipes[e.t] = { date: new Date().toISOString().slice(0, 10), finLe: dF.toISOString().slice(0, 10) };
        promoUsages[c] = u0; savePromoUsages();
        console.log('code promo', c, 'activé en rattrapage pour', e.t);
        mailPromoActive(e.t, c, dF.toISOString().slice(0, 10), ['pro', 'business', 'premium'].includes(p.formule) ? p.formule : 'premium');
      }
    }
  } catch (err) {}
  try {   // code promo : compté par espace (teamId = identifiant de l'espace)
    for (const [code, u] of Object.entries(promoUsages || {})) {
      const eq = u && u.equipes && u.equipes[e.t];
      if (eq && eq.finLe && eq.finLe >= new Date().toISOString().slice(0, 10)) return { paye: true, motif: 'code promo ' + code + ' (jusqu\'au ' + eq.finLe + ')', promoCode: code, finLe: eq.finLe };
    }
  } catch (err) {}
  const sk = config.stripe && config.stripe.secretKey;
  if (sk && e.email) {
    try {
      if (Date.now() - espStripeCache.ts > 5 * 60000 || !espStripeCache.data) { espStripeCache.data = await stripeAbosBruts(sk); espStripeCache.ts = Date.now(); }
      const abo = (espStripeCache.data || []).find(sb => ['active', 'trialing', 'past_due'].includes(sb.status) &&
        sb.customer && typeof sb.customer === 'object' && String(sb.customer.email || '').toLowerCase() === e.email);
      if (abo) return { paye: true, motif: 'abonnement Stripe (' + abo.status + ')', echeance: abo.current_period_end ? new Date(abo.current_period_end * 1000).toISOString().slice(0, 10) : '' };
    } catch (err) { console.error('espacePaye stripe:', err.message); }
  }
  return { paye: false, motif: 'aucun paiement ni code promo' };
}
// liste complète des espaces (formule attribuée, payé/promo) — pour l'onglet Abonnements de la Tour
app.get('/api/monitor/espaces/liste', monAdmin, async (req, res) => {
  const sortie = [];
  for (const [slug, e] of Object.entries(espacesReg)) {
    let p = { paye: false, motif: '' };
    try { p = await espacePaye(e); } catch (err) {}
    sortie.push({ slug, nom: e.nom || slug, email: e.email || '', formule: e.formule || '', quantite: e.quantite || 1,
      paye: p.paye, motif: p.motif, promoCode: p.promoCode || '', finLe: p.finLe || '', echeance: p.echeance || '', attribueLe: e.formuleTs || 0, par: e.formulePar || '',
      // qui a ouvert l'espace et quand : la Tour en a besoin pour lister les accès publics
      ouvertLe: e.ts || 0, ouvertPar: e.par || '', t: espaceT(e), resume: cnxResume(espaceT(e)),
      /* Deux états que la Tour ne pouvait pas connaître : un accès coupé ressemblait à un accès
         ouvert, et rien ne disait si l'entreprise savait déjà se connecter sans son lien. */
      suspendu: entFermes.espaces.includes(espaceT(e)),
      /* Quelles applications sont OUVERTES à cette entreprise (décidé), à ne pas confondre avec
         celles qu'elle utilise vraiment — celles-là se lisent dans « resume.apps ».
         On lit l'entrée EFFECTIVE (espaceAJour), pas l'entrée brute de la boucle : un espace
         porte plusieurs noms, et lire chacun séparément affichait le même espace « ouvert » sur
         une ligne et « fermé » sur l'autre. Les autres champs passent déjà par espaceT(e). */
      opMessages: !!((espaceAJour(slug) || e).opMessages),
      /* Un accès coupé d'ici se rouvre ; une entreprise fermée définitivement, non. Les
         confondre à l'écran ferait cliquer « Rouvrir » sur une fermeture, et croire à un bogue
         quand le serveur refuse. */
      ferme: entFermes.espaces.includes(espaceT(e)) && !(entFermes.suspendus || []).includes(espaceT(e)),
      /* Repli pour les entrées d'avant « origine » : une adresse connue du fichier clients
         est une entreprise inscrite sur le site ; les autres sont des accès ouverts d'ici.
         Ce n'est qu'un repli — dès qu'un espace est réenregistré, le champ fait foi. */
      origine: e.origine || ((e.email && clientsData[String(e.email).toLowerCase()]) ? 'site' : 'tour'),
      annuaire: (() => { const a = comptesReg[espaceT(e)]; return (a && a.c) ? Object.keys(a.c).length : 0; })(),
      /* L'identifiant de départ vit DÉJÀ dans le code de l'espace (champ « a »). La Tour le
         redemandait à chaque fois et proposait « admin » par défaut, alors que le serveur l'a
         sous la main : elle n'a plus à deviner. Le mot de passe, lui, n'y est pas — seulement
         son empreinte, et c'est voulu.
         Au PATRON seulement : cette route est ouverte aux collaborateurs, et le commentaire
         d'/api/espaces/lien promet que cet identifiant ne sort que contre une preuve de
         possession de la clé d'équipe. Le servir plus largement ferait mentir cette promesse,
         pour un champ qui n'alimente qu'une action réservée au patron. */
      ident: (req.tourUser && req.tourUser.role === 'patron')
        ? (() => { try { return String(JSON.parse(Buffer.from(e.code, 'base64').toString('utf8')).a || ''); } catch (err) { return ''; } })()
        : '',
      aboStatut: e.aboStatut || 'auto', aboFin: e.aboFin || '' });
  }
  sortie.sort((a, b) => (b.attribueLe || 0) - (a.attribueLe || 0));
  res.json({ ok: true, espaces: sortie });
});
// statut complet d'un espace, côté contrôle
app.post('/api/monitor/espaces/statut', monAdmin, async (req, res) => {
  const slug = espSlug(monStr((req.body || {}).nom, 80));   // borné : voir /api/espaces/ouvrir
  const e = espacesReg[slug];
  if (!e) return res.status(404).json({ error: 'Espace inconnu — génère d\'abord son lien de connexion' });
  const p = await espacePaye(e);
  res.json({ ok: true, formule: e.formule || '', quantite: e.quantite || 1, email: e.email || '', paye: p.paye, motif: p.motif, aboStatut: e.aboStatut || 'auto', aboFin: e.aboFin || '', finLe: p.finLe || '' });
});
// ── Activité par onglet (anonyme : noms d'écrans + compteurs, par espace) ──
const USAGE_PATH = path.join(DATA_DIR, 'usage.json');
let usageData = {}; try { usageData = JSON.parse(fs.readFileSync(USAGE_PATH, 'utf8')); } catch (e) {}
let usageTimer = null;
function usageSave() { clearTimeout(usageTimer); usageTimer = setTimeout(() => { try { fs.writeFileSync(USAGE_PATH, JSON.stringify(usageData)); } catch (e) {} }, 800); }
app.post('/api/usage', (req, res) => {
  const b = req.body || {};
  const t = monStr(b.t, 80); if (!t) return res.status(400).json({ error: 't requis' });
  /* Un espace supprimé ne se laisse pas ressusciter par un appareil resté hors ligne :
     sans ce garde-fou, il réapparaît avec les identifiants et les noms de ses salariés.
     On répond ok — l'appareil n'a rien fait de mal, et /api/espaces/etat lui dira de se
     vider — mais on n'écrit RIEN. */
  if (entFermes.espaces.includes(t)) return res.json({ ok: true, ferme: true });
  const vues = (b.vues && typeof b.vues === 'object' && !Array.isArray(b.vues)) ? b.vues : {};
  if (Object.keys(usageData).length >= 3000 && !usageData[t]) return res.json({ ok: true });
  const u = usageData[t] = usageData[t] || { vues: {}, total: 0, dernier: 0, version: '' };
  let n = 0;
  for (const [k, v] of Object.entries(vues)) {
    if (n++ > 80) break;
    const key = monStr(k, 30).replace(/[^a-zA-Z0-9]/g, ''); const q = Math.min(500, parseInt(v, 10) || 0);
    if (!key || q <= 0) continue;
    if (Object.keys(u.vues).length >= 80 && !u.vues[key]) continue;
    u.vues[key] = (u.vues[key] || 0) + q; u.total += q;
  }
  u.dernier = Date.now(); u.version = monStr(b.version, 12) || u.version;
  usageSave(); res.json({ ok: true });
});
// la Tour lit l'activité par onglet d'une entreprise, et ses problèmes ouverts
/* ══ LE DOSSIER D'UNE ENTREPRISE — tout ce qu'on sait d'elle, en un seul appel ═══════════
   Jusqu'ici il fallait ouvrir quatre écrans pour se faire une idée d'un client : son
   activité ici, ses connexions là, ses erreurs dans un journal protégé par une AUTRE clé
   que la session de la Tour (donc invisible depuis la console), son code promo nulle part.
   On jugeait donc une entreprise sur des morceaux, et on ratait le principal : ses bugs.

   Cette route rend le dossier complet pour UNE entreprise. Elle ne rend rien de plus que ce
   que la Tour affiche déjà ailleurs — même niveau d'accès (monAdmin), pas de nouvelle
   divulgation : c'est un regroupement, pas une ouverture. Tout est borné pour que la
   réponse reste lisible : 25 erreurs, 40 connexions, 12 écrans les plus vus. */
app.post('/api/monitor/entreprise/dossier', monAdmin, (req, res) => {
  const nom = monStr((req.body || {}).nom, 80);
  const slug = espSlug(nom);
  const e = espacesReg[slug];
  if (!e) return res.status(404).json({ error: 'Espace inconnu — génère d\'abord son lien de connexion' });
  let t = e.t; try { if (!t) t = String(JSON.parse(Buffer.from(e.code, 'base64').toString('utf8')).t || ''); } catch (err) {}
  if (!t) return res.status(404).json({ error: 'Espace sans identifiant technique' });

  // ── Ce qu'ils utilisent
  const u = usageData[t] || { vues: {}, total: 0, dernier: 0, version: '' };
  const vues = Object.entries(u.vues || {}).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => ({ vue: k, n: v }));

  // ── Qui se connecte, et qui n'y arrive pas
  const evts = (cnxData[t] || []).slice(0, 40).map(x => ({
    ts: x.ts, ev: x.ev, login: x.login || '', role: x.role || '', version: x.version || '',
    app: x.app || '', via: x.via || '', motif: x.motif || '', appareil: x.appareil || x.dev || ''
  }));
  /* Les échecs de connexion sont sortis à part : c'est le signal « quelqu'un chez eux
     n'arrive pas à entrer », et c'est exactement ce qu'on veut voir sans fouiller. */
  const echecs = evts.filter(x => x.ev === 'echec').slice(0, 15);

  // ── Ce qui plante chez eux. Le journal des bugs est indexé par teamId : on le filtre.
  let erreurs = [];
  try {
    erreurs = fs.readFileSync(BUGS_PATH, 'utf8').trim().split('\n')
      .map(l => { try { return JSON.parse(l); } catch (err) { return null; } })
      .filter(b => b && b.team === t)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 25)
      .map(b => ({ ts: b.ts, app: b.app, version: b.version, msg: b.msg, src: b.src, line: b.line, ua: b.ua }));
  } catch (err) {}

  // ── Formule offerte par code promo : elle ne passe pas par Stripe, donc elle n'apparaît
  //    dans aucun écran d'abonnement. Sans elle, on croit le client « sans formule ».
  const aujourdhui = new Date().toISOString().slice(0, 10);
  let promo = null;
  for (const [code, us] of Object.entries(promoUsages || {})) {
    const x = us && us.equipes && us.equipes[t];
    if (x && x.finLe) { const actif = x.finLe >= aujourdhui; if (actif || !promo) promo = { code, depuis: x.date || '', finLe: x.finLe, actif }; if (actif) break; }
  }

  /* ── QUI TRAVAILLE CHEZ EUX ──
     Deux sources, et aucune ne suffit seule. L'annuaire (comptesReg) liste les identifiants
     qui PEUVENT se connecter — mais rien d'autre : ni nom, ni rôle. C'est voulu, un annuaire
     de connexion n'est pas un fichier du personnel. Les connexions (cnxData), elles, disent
     qui s'est connecté RÉELLEMENT, avec quel rôle, quelle version et depuis combien
     d'appareils. On croise les deux : on obtient la liste des comptes, et pour chacun s'il
     s'en sert ou pas. Un identifiant qui n'a jamais servi est une information — c'est souvent
     un compte oublié, ou quelqu'un qui n'arrive pas à entrer. */
  const annu = (comptesReg[t] && comptesReg[t].c) || {};
  const parLogin = {};
  for (const l of Object.keys(annu)) parLogin[l] = { login: l, dansAnnuaire: true, nom: (annu[l] && annu[l].n) || '', attente: ordreAttente(t, l), supprime: ordreFait(t, l), derniere: 0, role: '', version: '', appareils: 0, echecs: 0, connexions: 0 };
  const devs = {};
  for (const x of (cnxData[t] || [])) {
    const l = String(x.login || '').toLowerCase().trim(); if (!l) continue;
    const o = parLogin[l] || (parLogin[l] = { login: l, dansAnnuaire: false, nom: '', attente: ordreAttente(t, l), supprime: ordreFait(t, l), derniere: 0, role: '', version: '', appareils: 0, echecs: 0, connexions: 0 });
    if (x.ev === 'echec') { o.echecs++; continue; }
    if (x.ev === 'bloque' || x.ev === 'refus') { o.bloques = (o.bloques || 0) + 1; continue; }   // la porte a joué : ce n'est ni une connexion ni un échec de mot de passe
    o.connexions++;
    if ((x.ts || 0) > o.derniere) { o.derniere = x.ts || 0; o.role = x.role || o.role; o.version = x.version || o.version; if (x.nom) o.nom = x.nom; }
    if (x.dev) { (devs[l] = devs[l] || new Set()).add(x.dev); }
  }
  for (const l of Object.keys(parLogin)) parLogin[l].appareils = devs[l] ? devs[l].size : 0;
  const utilisateurs = Object.values(parLogin).sort((a, b) => (b.derniere || 0) - (a.derniere || 0)).slice(0, 60);

  res.json({
    ok: true, t, slug,
    espace: { nom: e.nom || slug, formule: e.formule || '', opMessages: !!e.opMessages, suspendu: entFermes.espaces.includes(t) },
    usage: { total: u.total || 0, dernier: u.dernier || 0, version: u.version || '', vues },
    connexions: { resume: cnxResume(t), evenements: evts, echecs },
    utilisateurs, erreurs, promo,
    sauvegarde: { n: sauvListe(t).length, derniere: (sauvListe(t)[0] || 0), possible: !!(espaceParT(t) && espaceParT(t).code) },
    bannis: (ordresData[t] || []).filter(o => o.banni !== false).map(o => ({ login: o.login, ts: o.ts, fait: o.fait || 0, par: o.par || '' }))
  });
});

app.post('/api/monitor/espaces/activite', monAdmin, (req, res) => {
  const slug = espSlug(monStr((req.body || {}).nom, 80));   // borné : voir /api/espaces/ouvrir
  const e = espacesReg[slug];
  if (!e) return res.status(404).json({ error: 'Espace inconnu — génère d\'abord son lien de connexion' });
  let t = e.t; try { if (!t) t = String(JSON.parse(Buffer.from(e.code, 'base64').toString('utf8')).t || ''); } catch (err) {}
  const u = usageData[t] || { vues: {}, total: 0, dernier: 0, version: '' };
  const vues = Object.entries(u.vues).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => ({ vue: k, n: v }));
  const bugs = (monIssues || []).filter(i => i.statut !== 'corrige' && i.statut !== 'ignore' && (i.entreprises || []).some(x => x.nom === e.nom)).length;
  res.json({ ok: true, vues, total: u.total, dernier: u.dernier, version: u.version, bugs });
});
// ── Connexions des applications, par espace : qui se connecte, quand, depuis quel appareil,
//    avec quelle version, par quel chemin (lien, nom d'entreprise, session gardée) — et les
//    échecs. L'application envoie un événement à chaque connexion ; la Tour lit le tout. ──
const CNX_PATH = path.join(DATA_DIR, 'connexions.json');
let cnxData = {}; try { cnxData = JSON.parse(fs.readFileSync(CNX_PATH, 'utf8')); } catch (e) {}
let cnxTimer = null;
function cnxSave() { clearTimeout(cnxTimer); cnxTimer = setTimeout(() => { try { fs.writeFileSync(CNX_PATH, JSON.stringify(cnxData)); } catch (e) {} }, 800); }
app.post('/api/connexions', (req, res) => {
  const b = req.body || {};
  const t = monStr(b.t, 80); if (!t) return res.status(400).json({ error: 't requis' });
  /* Un espace supprimé ne se laisse pas ressusciter par un appareil resté hors ligne :
     sans ce garde-fou, il réapparaît avec les identifiants et les noms de ses salariés.
     On répond ok — l'appareil n'a rien fait de mal, et /api/espaces/etat lui dira de se
     vider — mais on n'écrit RIEN. */
  if (entFermes.espaces.includes(t)) return res.json({ ok: true, ferme: true });
  if (Object.keys(cnxData).length >= 3000 && !cnxData[t]) return res.json({ ok: true });
  const ev = { ts: Date.now(), ev: ['connexion', 'echec', 'session', 'deconnexion', 'bloque', 'refus'].includes(b.ev) ? b.ev : 'connexion',
    login: monStr(b.login, 40), nom: monStr(b.nom, 60), role: monStr(b.role, 16), version: monStr(b.version, 12), app: monStr(b.app, 12) || 'gestion',
    via: monStr(b.via, 16), appareil: monStr(b.appareil, 20), os: monStr(b.os, 20), nav: monStr(b.nav, 20), pwa: !!b.pwa,
    dev: monStr(b.dev, 24), motif: monStr(b.motif, 80) };
  const l = cnxData[t] = cnxData[t] || [];
  l.unshift(ev); if (l.length > 500) l.length = 500;
  cnxSave(); res.json({ ok: true });
});
/* Effacer les tentatives sur des identifiants qui n'existent pas — ELAN, 9 septembre 2026.
   Cinq identifiants tapés pendant la panne (zampa, admin, antho13…) restaient affichés dans le
   dossier de l'entreprise comme des utilisateurs : ils n'étaient que des échecs de connexion
   dans ce journal. Le patron les efface d'ici. Seuls les identifiants ABSENTS de l'annuaire sont
   touchés : les échecs d'un vrai compte sont une information (mot de passe oublié), on les garde. */
app.post('/api/monitor/connexions/effacer-tentatives', monPatronStrict, (req, res) => {
  const b = req.body || {};
  const t = monStr(b.t, 80); if (!t) return res.status(400).json({ error: 't requis' });
  const voulus = Array.isArray(b.logins) ? b.logins.map(x => monStr(x, 40).toLowerCase().trim()).filter(Boolean).slice(0, 100) : [];
  if (!voulus.length) return res.status(400).json({ error: 'logins requis' });
  const annu = (comptesReg[t] && comptesReg[t].c) || {};
  const cibles = new Set(voulus.filter(l => !Object.prototype.hasOwnProperty.call(annu, l)));
  const gardes = voulus.filter(l => !cibles.has(l));
  const avant = (cnxData[t] || []).length;
  cnxData[t] = (cnxData[t] || []).filter(x => !(x.ev === 'echec' && cibles.has(String(x.login || '').toLowerCase().trim())));
  const n = avant - cnxData[t].length;
  if (n) cnxSave();
  monLog((req.tourUser && req.tourUser.nom) || 'patron', true, req, 'tentatives effacées : ' + n);   // ni identifiant ni espace : rien de personnel au journal
  res.json({ ok: true, effacees: n, ignores: gardes });
});
/* ══ LES ORDRES DE LA TOUR — supprimer un compte depuis la Tour (Justin, 10 septembre 2026) ══
   La base d'une entreprise est chiffrée : ce serveur ne peut pas y retirer un compte. La Tour
   ORDONNE — après un code reçu par mail, « pour éviter l'erreur » — et le premier appareil de
   l'entreprise qui s'ouvre EXÉCUTE, puis confirme. Entre les deux, la porte est déjà fermée :
   l'identifiant sort de l'annuaire et n'y rentre plus tant que l'ordre est en attente. */
const ORDRES_PATH = path.join(DATA_DIR, 'ordres.json');
let ordresData = {};
try { ordresData = JSON.parse(fs.readFileSync(ORDRES_PATH, 'utf8')) || {}; } catch (e) {}
/* Un ordre que personne n'a exécuté en 30 jours : l'entreprise n'ouvre plus l'application, ou le
   compte n'existe plus nulle part — dans les deux cas il n'a plus rien à faire ici. */
/* Relecture du gardien, 10 septembre 2026 : l'acquittement vient d'un appareil qui détient la clé
   d'équipe — y compris celui de la personne qu'on supprime. Il ne peut donc rien ROUVRIR : un
   identifiant supprimé depuis la Tour reste banni de l'annuaire tant que le patron ne le
   réautorise pas, et l'ordre continue d'être servi sept jours après le premier acquittement,
   pour que chaque appareil l'exécute (supprimer un compte absent ne coûte rien). */
for (const t of Object.keys(ordresData)) { ordresData[t] = (ordresData[t] || []).filter(o => o && o.login).slice(-500); if (!ordresData[t].length) delete ordresData[t]; }
function ordreBanni(t, login) { return (ordresData[t] || []).some(o => o.login === login && o.banni !== false); }
function ordresServis(t) { const lim = Date.now() - 7 * 86400000; return (ordresData[t] || []).filter(o => o.banni !== false && (!o.fait || o.fait > lim)).map(o => o.login); }
function ordresSave() { try { const tmp = ORDRES_PATH + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(ordresData)); fs.renameSync(tmp, ORDRES_PATH); return true; } catch (e) { console.error('ordres.json non écrit :', e.message); return false; } }
function ordreAttente(t, login) { return (ordresData[t] || []).some(o => o.login === login && !o.fait && o.banni !== false); }
function ordreFait(t, login) { return (ordresData[t] || []).some(o => o.login === login && o.fait && o.banni !== false); }
/* La clé d'équipe, comme pour l'annuaire : kh = sha256 de la clé. null = espace inconnu, false = mauvaise clé. */
function espaceCleOk(t, kh) {
  const e = espaceParT(t); if (!e || !e.code) return null;
  let cle = ''; try { cle = String(JSON.parse(Buffer.from(e.code, 'base64').toString('utf8')).k || ''); } catch (err) {}
  if (!cle || !/^[0-9a-f]{64}$/.test(String(kh || '')) || crypto.createHash('sha256').update(cle).digest('hex') !== kh) return false;
  return true;
}
app.post('/api/monitor/compte/supprimer', monPatronStrict, async (req, res) => {
  const b = req.body || {};
  const t = monStr(b.t, 80), login = monStr(b.login, 40).toLowerCase().trim();
  if (!t || !login) return res.status(400).json({ error: 't et login requis' });
  const e = espaceParT(t); if (!e) return res.status(404).json({ error: 'espace inconnu' });
  const annu = (comptesReg[t] && comptesReg[t].c) || {};
  const connu = Object.prototype.hasOwnProperty.call(annu, login) || (cnxData[t] || []).some(x => String(x.login || '').toLowerCase().trim() === login && x.ev !== 'echec');
  if (!connu) return res.status(404).json({ error: 'compte inconnu de cet espace' });
  const cle = 'c:' + t + ':' + login;
  const codeRecu = monStr(b.code, 10).trim();
  if (!codeRecu) {   // 1er temps : le code part par mail
    if (!mailer) return res.status(503).json({ error: 'e-mail non configuré — impossible d\'envoyer le code' });
    if (retraitCodes.size > 500) for (const [k, v] of retraitCodes) if (Date.now() > v.exp) retraitCodes.delete(k);   // balayage des codes périmés
    const code = String(crypto.randomInt(100000, 1000000));
    retraitCodes.set(cle, { code, exp: Date.now() + 10 * 60000, tries: 0 });
    const dest = config.notifDemandes || config.smtp.from || config.smtp.user;
    try {
      await mailerEnvoi({ from: config.smtp.from || config.smtp.user, to: dest,
        confidentiel: true, trace: 'code de suppression de compte · espace ' + t.slice(0, 12),   // ni l'identifiant ni le code au journal
        subject: '🗑 Code de confirmation — suppression du compte « ' + login + ' » chez ' + espNomPropre(e),
        text: 'Tu es sur le point de SUPPRIMER le compte « ' + login + ' » de l\'entreprise ' + espNomPropre(e) + '.\n\nCode de confirmation : ' + code + '\n\nValable 10 minutes. Après validation : l\'identifiant est retiré de l\'annuaire tout de suite (la personne ne peut plus entrer), et le compte est supprimé de l\'application au premier appareil de l\'entreprise qui s\'ouvre.\n\nSi ce n\'est pas toi, ignore ce message : rien ne se passe sans le code.' });
    } catch (err) { return res.status(500).json({ error: 'envoi du code impossible : ' + String(err.message).slice(0, 120) }); }
    return res.json({ ok: true, codeEnvoye: true, dest: masqueMail(dest) });
  }
  const c = retraitCodes.get(cle);   // 2e temps : le code revient
  if (!c || Date.now() > c.exp) { retraitCodes.delete(cle); return res.status(400).json({ error: 'code expiré — relance la suppression' }); }
  if (c.code !== codeRecu) { c.tries++; if (c.tries >= 5) retraitCodes.delete(cle); return res.status(400).json({ error: 'code incorrect' }); }
  retraitCodes.delete(cle);
  const l = ordresData[t] = ordresData[t] || [];
  l.forEach(o => { if (o.login === login) o.banni = false; });   // un ancien ordre réautorisé ne compte plus : celui-ci prend le relais
  l.push({ login, ts: Date.now(), par: (req.tourUser && req.tourUser.nom) || '', fait: 0 });
  ordresSave();
  if (comptesReg[t] && comptesReg[t].c && Object.prototype.hasOwnProperty.call(comptesReg[t].c, login)) { delete comptesReg[t].c[login]; comptesReg[t].maj = Date.now(); comptesEcrire(); }
  monLog((req.tourUser && req.tourUser.nom) || 'patron', true, req, 'suppression de compte ordonnée');
  res.json({ ok: true, attente: true });
});
/* ══ LES COPIES DE SAUVEGARDE — le filet demandé par Justin le 9 septembre 2026 ══
   « Il faudrait une sauvegarde sur le cloud de chaque chose qu'ils font, pour chaque entreprise. »
   Le nuage ne garde qu'un document, le dernier. Ici on garde des COPIES DATÉES du bloc CHIFFRÉ
   que l'application pousse — on ne peut pas le lire, on n'a pas la clé, et ça doit rester ainsi.
   Une par appareil toutes les 30 minutes au plus (c'est l'application qui se retient), et le
   serveur ne garde que ce qui compte : une par heure sur 24 h, une par jour sur 30 jours.
   La restauration se fait DANS l'application, qui seule sait déchiffrer : elle télécharge une
   copie, la lit, et remet ce qui manque — une collection à la fois — sans toucher au reste. */
const SAUV_DIR = path.join(DATA_DIR, 'sauvegardes');
try { fs.mkdirSync(SAUV_DIR, { recursive: true }); } catch (e) {}
const sauvDossier = t => path.join(SAUV_DIR, String(t).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80));
function sauvListe(t) {
  try { return fs.readdirSync(sauvDossier(t)).filter(f => /^\d{13}\.json$/.test(f)).map(f => parseInt(f, 10)).sort((a, b) => b - a); } catch (e) { return []; }
}
/* Rotation : on garde la plus récente de chaque heure sur 24 h, puis la plus récente de chaque
   jour sur 30 jours. Le reste part. */
function sauvElaguer(t) {
  const l = sauvListe(t); if (!l.length) return;
  const now = Date.now(), garder = new Set(), vuH = new Set(), vuJ = new Set();
  for (const ts of l) {   // du plus récent au plus ancien : le premier vu par créneau est gardé
    const age = now - ts;
    if (age < 86400000) { const h = Math.floor(ts / 3600000); if (!vuH.has(h)) { vuH.add(h); garder.add(ts); } }
    else if (age < 30 * 86400000) { const j = Math.floor(ts / 86400000); if (!vuJ.has(j)) { vuJ.add(j); garder.add(ts); } }
  }
  for (const ts of l) if (!garder.has(ts)) { try { fs.unlinkSync(path.join(sauvDossier(t), ts + '.json')); } catch (e) {} }
}
let sauvQuota = new Map();
/* Ce que les trois routes refusent, avant tout : l'espace de repli (ses deux clés sont écrites
   dans app.html — une copie de lui serait lisible par n'importe qui, relecture du gardien du
   10 septembre 2026), un espace fermé (« le blocage d'abord », comme les 14 autres endroits),
   une clé fausse. */
function sauvRefus(t, kh) {
  if (ESPACES_INTOUCHABLES.includes(t)) return { code: 403, error: 'pas de copie pour l\'espace de repli' };
  if (entFermes.espaces.includes(t)) return { code: 403, error: 'espace fermé' };
  const ok = espaceCleOk(t, kh); if (ok === null) return { code: 404, error: 'espace inconnu' }; if (!ok) return { code: 403, error: 'clé d\'équipe incorrecte' };
  return null;
}
app.post('/api/espaces/sauvegarde', (req, res) => {
  const b = req.body || {}; const t = monStr(b.t, 80), kh = monStr(b.kh, 64).toLowerCase();
  if (!t) return res.status(400).json({ error: 't requis' });
  const refus = sauvRefus(t, kh); if (refus) return res.status(refus.code).json({ error: refus.error });
  if (sauvQuota.size > 5000) sauvQuota = new Map();
  if (!quotaOk(sauvQuota, 't:' + t, 60, 3600000)) return res.status(429).json({ error: 'trop de copies — réessaie plus tard' });
  const enc = String(b.enc || ''), iv = String(b.iv || ''), salt = String(b.salt || '');
  if (!enc || !iv || !salt || enc.length > 3000000 || iv.length > 128 || salt.length > 128) return res.status(400).json({ error: 'bloc chiffré requis (3 Mo au plus)' });
  const ts = Date.now();
  try {
    fs.mkdirSync(sauvDossier(t), { recursive: true });
    const tmp = path.join(sauvDossier(t), ts + '.json.tmp');
    fs.writeFileSync(tmp, JSON.stringify({ ts, enc, iv, salt, ver: monStr(b.ver, 12), by: monStr(b.dev, 24) }));
    fs.renameSync(tmp, path.join(sauvDossier(t), ts + '.json'));
    sauvElaguer(t);
  } catch (e) { console.error('sauvegarde non écrite :', e.message); return res.status(500).json({ error: 'copie non enregistrée' }); }
  res.json({ ok: true, ts, n: sauvListe(t).length });
});
app.post('/api/espaces/sauvegardes', (req, res) => {
  const b = req.body || {}; const t = monStr(b.t, 80), kh = monStr(b.kh, 64).toLowerCase();
  if (!t) return res.status(400).json({ error: 't requis' });
  const refus = sauvRefus(t, kh); if (refus) return res.status(refus.code).json({ error: refus.error });
  if (!quotaOk(sauvQuota, 'l:' + t, 120, 3600000)) return res.status(429).json({ error: 'trop de lectures — réessaie plus tard' });
  const l = sauvListe(t).map(ts => { let taille = 0; try { taille = fs.statSync(path.join(sauvDossier(t), ts + '.json')).size; } catch (e) {} return { ts, taille }; });
  res.json({ ok: true, copies: l });
});
app.post('/api/espaces/sauvegarde/lire', (req, res) => {
  const b = req.body || {}; const t = monStr(b.t, 80), kh = monStr(b.kh, 64).toLowerCase(); const ts = parseInt(b.ts, 10);
  if (!t || !isFinite(ts)) return res.status(400).json({ error: 't et ts requis' });
  const refus = sauvRefus(t, kh); if (refus) return res.status(refus.code).json({ error: refus.error });
  if (!quotaOk(sauvQuota, 'l:' + t, 120, 3600000)) return res.status(429).json({ error: 'trop de lectures — réessaie plus tard' });
  if (!sauvListe(t).includes(ts)) return res.status(404).json({ error: 'copie introuvable' });
  try { const j = JSON.parse(fs.readFileSync(path.join(sauvDossier(t), ts + '.json'), 'utf8')); res.json({ ok: true, copie: j }); }
  catch (e) { res.status(500).json({ error: 'copie illisible' }); }
});
/* L'application demande ses ordres : au démarrage, au retour au premier plan, tous les quarts d'heure. */
app.post('/api/espaces/ordres', (req, res) => {
  const b = req.body || {}; const t = monStr(b.t, 80), kh = monStr(b.kh, 64).toLowerCase();
  if (!t) return res.status(400).json({ error: 't requis' });
  if (entFermes.espaces.includes(t)) return res.status(403).json({ error: 'espace fermé' });
  const ok = espaceCleOk(t, kh); if (ok === null) return res.status(404).json({ error: 'espace inconnu' }); if (!ok) return res.status(403).json({ error: 'clé d\'équipe incorrecte' });
  res.json({ ok: true, suppressions: ordresServis(t) });
});
app.post('/api/espaces/ordre-fait', (req, res) => {
  const b = req.body || {}; const t = monStr(b.t, 80), kh = monStr(b.kh, 64).toLowerCase();
  if (!t) return res.status(400).json({ error: 't requis' });
  const ok = espaceCleOk(t, kh); if (ok === null) return res.status(404).json({ error: 'espace inconnu' }); if (!ok) return res.status(403).json({ error: 'clé d\'équipe incorrecte' });
  const faits = new Set((Array.isArray(b.logins) ? b.logins : []).map(x => monStr(x, 40).toLowerCase().trim()).filter(Boolean));
  let n = 0; for (const o of (ordresData[t] || [])) { if (!o.fait && faits.has(o.login)) { o.fait = Date.now(); n++; } }
  if (n) { ordresSave(); console.log('ordre de suppression exécuté :', n, 'compte(s) · espace', t.slice(0, 12)); }
  res.json({ ok: true, n });
});
/* Le patron peut rendre un identifiant à l'entreprise (un nouveau salarié qui porte le même) :
   c'est la seule façon de lever le ban — jamais un appareil. */
app.post('/api/monitor/compte/reautoriser', monPatronStrict, (req, res) => {
  const b = req.body || {}; const t = monStr(b.t, 80), login = monStr(b.login, 40).toLowerCase().trim();
  if (!t || !login) return res.status(400).json({ error: 't et login requis' });
  let n = 0; for (const o of (ordresData[t] || [])) { if (o.login === login && o.banni !== false) { o.banni = false; n++; } }
  if (!n) return res.status(404).json({ error: 'aucun ban pour cet identifiant' });
  ordresSave(); monLog((req.tourUser && req.tourUser.nom) || 'patron', true, req, 'identifiant réautorisé');
  res.json({ ok: true });
});
/* Résumé lisible d'un espace : dernière connexion, utilisateurs et appareils actifs, échecs, versions */
function cnxResume(t) {
  const l = cnxData[t] || []; const now = Date.now(), j7 = now - 7 * 86400000, j30 = now - 30 * 86400000, h24 = now - 86400000;
  const ok = l.filter(e => e.ev === 'connexion' || e.ev === 'session');
  const u7 = new Set(ok.filter(e => e.ts > j7 && e.login).map(e => e.login)), u30 = new Set(ok.filter(e => e.ts > j30 && e.login).map(e => e.login));
  const d7 = new Set(ok.filter(e => e.ts > j7 && e.dev).map(e => e.dev));
  const echecs24 = l.filter(e => e.ev === 'echec' && e.ts > h24).length;
  const versions = {}; const vuDev = new Set();
  ok.forEach(e => { if (!e.dev || vuDev.has(e.dev) || !e.version) return; vuDev.add(e.dev); versions[e.version] = (versions[e.version] || 0) + 1; });
  const apps = {}; ok.forEach(e => { if (e.ts > j30) apps[e.app || 'gestion'] = (apps[e.app || 'gestion'] || 0) + 1; });
  const appareils = {}; ok.forEach(e => { if (e.ts > j30 && e.appareil) appareils[e.appareil] = (appareils[e.appareil] || 0) + 1; });
  const dern = ok[0] || null;
  return { total: l.length, derniere: dern ? dern.ts : 0, dernierLogin: dern ? dern.login : '', utilisateurs7: u7.size, utilisateurs30: u30.size, appareils7: d7.size,
    echecs24, connexions7: ok.filter(e => e.ts > j7).length, versions, apps, appareils };
}
// la Tour : détail des connexions d'une entreprise
app.post('/api/monitor/espaces/connexions', monAdmin, (req, res) => {
  const slug = espSlug(monStr((req.body || {}).nom, 80));   // borné : voir /api/espaces/ouvrir
  const e = espacesReg[slug];
  let t = e ? e.t : ''; try { if (e && !t) t = String(JSON.parse(Buffer.from(e.code, 'base64').toString('utf8')).t || ''); } catch (err) {}
  if (!t) t = monStr((req.body || {}).t, 80);
  if (!t) return res.status(404).json({ error: 'Espace inconnu — génère d\'abord son lien de connexion' });
  res.json({ ok: true, t, resume: cnxResume(t), evenements: (cnxData[t] || []).slice(0, parseInt((req.body || {}).n, 10) || 60) });
});
// la Tour : toutes les entreprises d'un coup, triées par dernière connexion
/* ══ TOUTES LES ENTREPRISES, UNE SEULE LISTE ════════════════════════════════════════════
   Le vrai problème de la console n'était pas d'afficher : c'était de RETROUVER. Une même
   entreprise pouvait exister dans quatre endroits sans apparaître dans les trois autres :
     · clientsData  — remplis à la première connexion sur le site, et là seulement ;
     · espacesReg   — les espaces dont on a généré le lien ;
     · cnxData      — TOUT espace qui s'est connecté un jour, annuaire ou pas. La source la
                      plus complète, et la seule qui voyait les « espaces hors annuaire » ;
     · Firebase     — les comptes créés sur le site, même sans espace derrière.
   D'où des entreprises visibles dans un écran et absentes de l'autre, et l'impression que la
   console en perdait. Ici on part de cnxData et espacesReg réunis — rien de ce qui a vécu ne
   peut manquer — et on accroche à chaque ligne de quoi décider sans changer d'écran :
   formule, code promo et son échéance, activité, échecs de connexion, erreurs.
   Le journal des bugs est lu UNE fois et compté par espace : une lecture par entreprise
   aurait relu un fichier de plusieurs mégaoctets autant de fois qu'il y a de clients. */
app.get('/api/monitor/entreprises', monAdmin, (req, res) => {
  const aujourdhui = new Date().toISOString().slice(0, 10);

  // 1. les erreurs, comptées en une passe
  const erreursPar = {};
  try {
    for (const l of fs.readFileSync(BUGS_PATH, 'utf8').trim().split('\n')) {
      try { const b = JSON.parse(l); if (b && b.team) erreursPar[b.team] = (erreursPar[b.team] || 0) + 1; } catch (err) {}
    }
  } catch (err) {}

  // 2. les codes promo, indexés par espace
  const promoPar = {};
  for (const [code, u] of Object.entries(promoUsages || {})) {
    for (const [t, x] of Object.entries((u && u.equipes) || {})) {
      if (!x || !x.finLe) continue;
      const actif = x.finLe >= aujourdhui;
      if (!promoPar[t] || (actif && !promoPar[t].actif)) promoPar[t] = { code, finLe: x.finLe, actif, depuis: x.date || '' };
    }
  }

  // 3. les comptes du site, indexés par adresse
  const compteParMail = {};
  for (const [mail, c] of Object.entries(clientsData || {})) compteParMail[String(mail).toLowerCase()] = c;

  /* La clé par défaut d'app.html. Elle est servie publiquement par GitHub Pages, donc la
     connaître ici n'ajoute AUCUN secret — c'est justement le problème qu'elle pose. On ne s'en
     sert que pour RÉPONDRE À UNE QUESTION : cet espace a-t-il sa propre clé, ou partage-t-il
     celle que tout le monde peut lire ? ⛔ Ne JAMAIS la modifier, ici ou ailleurs : elle
     déchiffre les données de toutes les entreprises qui n'en ont pas reçu d'autre. */
  const CLE_PAR_DEFAUT = 'ELAN-GESTION-7F3A9C2E-cloud-2026';
  /* Vrai quand l'espace porte une clé qui n'est PAS celle-là. On rend un booléen, jamais la
     clé : cette route est en monAdmin, un cran sous le patron. */
  const cleePropre = (e) => {
    if (!e || !e.code) return false;
    try { const k = String(JSON.parse(Buffer.from(e.code, 'base64').toString('utf8')).k || ''); return !!k && k !== CLE_PAR_DEFAUT; } catch (err) { return false; }
  };
  const vus = new Set(); const liste = [];
  const pousser = (t, slug, e) => {
    if (!t || vus.has(t)) return; vus.add(t);
    const r = cnxResume(t);
    const mail = String((e && e.email) || '').toLowerCase();
    const cli = mail ? compteParMail[mail] : null;
    liste.push({
      t, slug: slug || '',
      nom: (e && e.nom) || slug || '',
      email: mail,
      /* D'où elle vient décide ce qu'on a le droit d'en faire : une cliente inscrite sur le
         site ne se supprime pas comme un espace d'essai qu'on s'est ouvert. */
      origine: e ? (e.origine || (cli ? 'site' : 'tour')) : 'hors-annuaire',
      dansAnnuaire: !!e,
      formule: (e && e.formule) || (cli && cli.formule) || '',
      opMessages: !!(e && e.opMessages),
      /* La question qui décide du chantier « un teamId par entreprise » : celles qui ont déjà
         leur clé n'ont rien à migrer. Booléen seulement — la clé ne sort pas d'ici. */
      cleePropre: cleePropre(e),
      suspendu: entFermes.espaces.includes(t),
      promo: promoPar[t] || null,
      metier: (cli && cli.metier) || '',
      derniere: r.derniere || 0,
      utilisateurs7: r.utilisateurs7 || 0,
      appareils7: r.appareils7 || 0,
      echecs24: r.echecs24 || 0,
      versions: r.versions || {},
      erreurs: erreursPar[t] || 0,
      comptesAnnuaire: Object.keys((comptesReg[t] && comptesReg[t].c) || {}).length
    });
  };
  for (const [slug, e] of Object.entries(espacesReg)) {
    let t = e.t; try { if (!t) t = String(JSON.parse(Buffer.from(e.code, 'base64').toString('utf8')).t || ''); } catch (err) {}
    pousser(t, slug, e);
  }
  /* Les espaces qui se sont connectés sans être dans l'annuaire : ce sont eux qu'on « perdait ».
     Ils existent, ils ont des utilisateurs et parfois des erreurs — les ignorer, c'est croire
     que la console montre tout alors qu'elle montre la moitié. */
  for (const t of Object.keys(cnxData)) pousser(t, '', null);

  liste.sort((a, b) => (b.derniere || 0) - (a.derniere || 0));
  /* Un compte sans OP GESTION ne voit de l'annuaire que ce qui sert OP MESSAGES : les entreprises
     où elle est ouverte, avec de quoi les reconnaître ; les autres réduites au nom — il faut pouvoir
     en ouvrir une. Formule, promo, clé, versions, erreurs, échecs : jamais à ce compte. */
  if (!req.tourUser.apps.includes('gestion')) {
    const proj = liste.map(x => x.opMessages
      ? { t: x.t, slug: x.slug, nom: x.nom, email: x.email, opMessages: true, suspendu: x.suspendu, origine: x.origine, derniere: x.derniere }
      : { t: x.t, slug: x.slug, nom: x.nom, opMessages: false });
    return res.json({ ok: true, entreprises: proj, total: proj.length, opMessages: proj.filter(x => x.opMessages).length });
  }
  res.json({
    ok: true, entreprises: liste, total: liste.length,
    horsAnnuaire: liste.filter(x => !x.dansAnnuaire).length,
    avecErreurs: liste.filter(x => x.erreurs > 0).length,
    avecEchecs: liste.filter(x => x.echecs24 > 0).length
  });
});

app.get('/api/monitor/connexions', monAdmin, (req, res) => {
  const vus = new Set(); const sortie = [];
  for (const [slug, e] of Object.entries(espacesReg)) {
    let t = e.t; try { if (!t) t = String(JSON.parse(Buffer.from(e.code, 'base64').toString('utf8')).t || ''); } catch (err) {}
    if (!t || vus.has(t)) continue; vus.add(t);
    sortie.push({ slug, nom: e.nom || slug, t, formule: e.formule || '', resume: cnxResume(t) });
  }
  for (const t of Object.keys(cnxData)) { if (vus.has(t)) continue; vus.add(t); sortie.push({ slug: '', nom: '(espace hors annuaire) ' + t, t, formule: '', resume: cnxResume(t) }); }
  sortie.sort((a, b) => (b.resume.derniere || 0) - (a.resume.derniere || 0));
  const now = Date.now(); const tous = [].concat(...Object.values(cnxData));
  res.json({ ok: true, espaces: sortie, global: { connexions24: tous.filter(e => e.ts > now - 86400000 && e.ev !== 'echec').length, echecs24: tous.filter(e => e.ts > now - 86400000 && e.ev === 'echec').length, actives7: sortie.filter(x => x.resume.derniere > now - 7 * 86400000).length } });
});
// repartir à neuf : libère le nom et EFFACE l'ancien espace (données Firestore comprises),
// SANS bloquer l'entreprise — elle repart aussitôt sur un espace propre et vide
app.post('/api/monitor/espaces/renaitre', monPatronStrict, async (req, res) => {
  const slug = espSlug(monStr((req.body || {}).nom, 80));   // borné : voir /api/espaces/ouvrir
  const e = espacesReg[slug];
  if (!e) return res.json({ ok: true, rien: true });
  let t = e.t; try { if (!t) t = String(JSON.parse(Buffer.from(e.code, 'base64').toString('utf8')).t || ''); } catch (err) {}
  if (t && accesReg[t]) { delete accesReg[t]; accesEcrire(); }   // l'espace repart à neuf : son code aussi
  if (t && comptesReg[t]) { delete comptesReg[t]; comptesEcrire(); }   // et son annuaire de connexion : sinon d'anciens identifiants ouvrent le nouvel espace
  delete espacesReg[slug];
  try { fs.writeFileSync(ESPACES_PATH, JSON.stringify(espacesReg)); } catch (err) {}
  let efface = false;
  if (t) {
    let tok = await fbAdminJeton(), viaAdmin = !!tok;
    if (!tok) { try {
      const r0 = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + ((config.firebase && config.firebase.apiKey) || 'AIzaSyAbah03sO4f4LyNhvmig0Pn00lz1sHSpT8'),
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"returnSecureToken":true}' });
      tok = ((await r0.json().catch(() => ({}))).idToken) || '';
    } catch (err) {} }
    if (tok) { try {
      const r = await fbAdminFetch('https://firestore.googleapis.com/v1/projects/' + FB_PROJET + '/databases/(default)/documents/elan_teams/' + encodeURIComponent(t), { method: 'DELETE' }, tok);
      efface = r.ok;
    } catch (err) { console.error('renaitre effacement :', err.message); } }
  }
  console.log('Tour :', req.tourUser.nom, 'fait repartir « ' + slug + ' » à neuf — ancien espace', t, efface ? 'effacé' : 'NON effacé');
  res.json({ ok: true, ancien: t, efface });
});
// le patron active un code promo pour une entreprise, directement depuis la Tour
app.post('/api/monitor/espaces/promo', monPatronStrict, (req, res) => {
  const slug = espSlug(monStr((req.body || {}).nom, 80));   // borné : voir /api/espaces/ouvrir
  const e = espacesReg[slug];
  if (!e) return res.status(404).json({ error: 'Espace inconnu — génère d\'abord son lien de connexion' });
  let t = e.t; try { if (!t) t = String(JSON.parse(Buffer.from(e.code, 'base64').toString('utf8')).t || ''); } catch (err) {}
  if (!t) return res.status(400).json({ error: 'espace illisible' });
  const c = monStr((req.body || {}).code, 40).trim().toUpperCase();
  if (!c) return res.status(400).json({ error: 'Entre le code promo' });
  const p = (config.promos || []).find(x => String(x.code || '').trim().toUpperCase() === c);
  if (!p) return res.status(404).json({ error: 'Code promo inconnu' });
  for (const [c2, u2] of Object.entries(promoUsages || {})) {   // un seul code à la fois
    const eq2 = u2 && u2.equipes && u2.equipes[t];
    if (c2 !== c && eq2 && eq2.finLe && eq2.finLe >= new Date().toISOString().slice(0, 10))
      return res.status(409).json({ error: 'Un code (« ' + c2 + ' ») est déjà actif pour cette entreprise jusqu\'au ' + eq2.finLe });
  }
  const u = promoUsages[c] || { n: 0, equipes: {} };
  let finLe;
  if (u.equipes[t]) finLe = u.equipes[t].finLe;
  else {
    if (p.maxUtilisations && u.n >= p.maxUtilisations) return res.status(410).json({ error: 'Ce code a atteint son maximum d\'utilisations' });
    const d = new Date(); d.setMonth(d.getMonth() + Math.max(1, Number(p.mois) || 1));
    finLe = d.toISOString().slice(0, 10);
    u.n++; u.equipes[t] = { date: new Date().toISOString().slice(0, 10), finLe }; promoUsages[c] = u; savePromoUsages();
    mailPromoActive(t, c, finLe, ['pro', 'business', 'premium'].includes(p.formule) ? p.formule : 'premium');
  }
  e.codePromo = c;
  const f = ['pro', 'business', 'premium'].includes(p.formule) ? p.formule : 'premium';
  if (!e.formule || e.formule === 'gratuit') { e.formule = f; e.quantite = e.quantite || 1; e.formulePar = req.tourUser.nom + ' (code)'; e.formuleTs = Date.now(); }
  try { fs.writeFileSync(ESPACES_PATH, JSON.stringify(espacesReg)); } catch (err) {}
  console.log('Tour :', req.tourUser.nom, 'active le code', c, 'pour', slug, '→ fin', finLe);
  res.json({ ok: true, code: c, formule: e.formule, finLe });
});
// le patron envoie au client son lien + identifiants de départ (bel e-mail TeamOP)
// ── 📣 ANNONCE DE MISE À JOUR : un e-mail à TOUTES les entreprises ──
//    Le texte de l'annonce vit ici ; le patron déclenche l'envoi depuis la Tour.
//    Une seule adresse par entreprise (dédoublonnée), tout passe par le beau
//    gabarit TeamOP et le journal des e-mails.
const ANNONCE = {
  version: '572',
  sujet: '🔗 Votre entreprise a maintenant son adresse',
  intro: 'Bonjour,<br>votre application OP GESTION vient d\'être mise à jour — elle est déjà active, il suffit de la rouvrir (ou de toucher « Mettre à jour » si la bannière apparaît).',
  points: [
    ['🔗 Une adresse pour votre entreprise', 'Jusqu\'ici, se connecter demandait le lien reçu par e-mail — et le perdre, c\'était perdre l\'accès. Votre entreprise a désormais SON adresse : chacun y va, tape son identifiant et son mot de passe, et arrive dans votre espace. Sur n\'importe quel téléphone, sans rien à conserver. Vous la trouvez dans l\'e-mail de bienvenue, ou nous vous la redonnons.'],
    ['👥 Chaque personne avec ses propres identifiants', 'Ce n\'est plus un lien partagé par toute l\'équipe, mais le compte de chacun — celui que vous créez dans Utilisateurs. Retirer quelqu\'un de la liste lui ferme la porte, sur tous ses appareils, sans rien changer pour les autres.'],
    ['🔴 La couleur dit la même chose partout', 'En touchant une notification, les produits concernés s\'entourent d\'un anneau : rouge pour ce qui sort ou ce qui manque, vert pour ce qui arrive. « Stock bas » et « Box à réapprovisionner » l\'annonçaient en vert — la couleur qui se lit « tout va bien » — alors qu\'ils disent l\'inverse.'],
    ['🔍 Trouver une rubrique sans la chercher', 'Le menu compte jusqu\'à quarante rubriques. Un champ discret en haut les filtre à la frappe : tapez « box », vous avez les box ; validez, vous y êtes.'],
    ['🔒 La box dit ce qui attend le DR', 'Quand vos mouvements passent par la validation du DR, les quantités ne bougeaient pas et rien ne l\'expliquait. La fiche annonce maintenant ce qui est en attente, sur chaque ligne, avec de quoi retirer un produit ou tout annuler.']
  ],
  fin: 'Rien d\'autre ne change : mêmes données, mêmes écrans, mêmes habitudes. Votre lien actuel continue de fonctionner.'
};
app.post('/api/monitor/annonce', monPatronStrict, async (req, res) => {
  if (!mailer) return res.status(503).json({ error: 'e-mail non configuré sur le serveur' });
  // une adresse par entreprise, la plus récente gagne
  const parMail = new Map();
  for (const [slug, e] of Object.entries(espacesReg)) {
    const ad = String(e.email || '').toLowerCase().trim();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ad)) parMail.set(ad, e.nom || slug);
  }
  if (!parMail.size) return res.status(404).json({ error: 'aucune entreprise avec une adresse e-mail' });
  const blocs = ANNONCE.points.map(([t, d]) =>
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F7FB;border:1px solid #E3E8F1;border-radius:12px;margin-bottom:10px"><tr><td style="padding:14px 18px">' +
    '<div style="font-size:14px;font-weight:800;color:#17233B;padding-bottom:4px">' + t + '</div>' +
    '<div style="font-size:13px;line-height:1.7;color:#4A5A7A">' + d + '</div></td></tr></table>').join('');
  const texte = 'Bonjour,\n\nvotre application OP GESTION vient de recevoir une mise à jour (v' + ANNONCE.version + ') :\n\n' +
    ANNONCE.points.map(([t, d]) => '• ' + t.replace(/^[^ ]+ /, '') + ' — ' + d.replace(/<[^>]+>/g, '')).join('\n') +
    '\n\nElle est déjà active : rouvrez simplement l\'application.\n\n— L\'équipe TEAM OP · teamop.fr';
  let envoyes = 0, refus = 0;
  for (const [ad, nom] of parMail) {
    try {
      await mailerEnvoi({ diffusion: true, from: config.smtp.from || config.smtp.user, to: ad,
        subject: ANNONCE.sujet, text: texte,
        html: mailTeamOP({ desabo: true, chip: 'Mise à jour', chipBg: '#E7F0FE', chipColor: '#1D4ED8',
          titre: 'Du nouveau dans votre application 🆕',
          corpsHtml: ANNONCE.intro,
          blocHtml: blocs,
          boutonTxt: 'Ouvrir mon application', boutonUrl: 'https://teamop.fr/app.html',
          bouton2Txt: 'Mon espace client', bouton2Url: 'https://teamop.fr/espace.html' }) });
      envoyes++;
    } catch (err) { refus++; console.error('annonce →', ad, ':', String(err.message || err).slice(0, 120)); }
  }
  console.log('Tour :', req.tourUser.nom, 'a envoyé l\'annonce v' + ANNONCE.version, '→', envoyes, 'entreprises', refus ? ('(' + refus + ' refus)') : '');
  res.json({ ok: true, envoyes, refus, version: ANNONCE.version });
});
app.post('/api/monitor/espaces/mail-acces', monPatronStrict, async (req, res) => {
  if (!mailer) return res.status(503).json({ error: 'e-mail non configuré sur le serveur' });
  const slug = espSlug(monStr((req.body || {}).nom, 80));   // borné : voir /api/espaces/ouvrir
  const e = espacesReg[slug];
  if (!e) return res.status(404).json({ error: 'Espace inconnu — génère d\'abord son lien de connexion' });
  if (!e.email) return res.status(400).json({ error: 'aucun e-mail enregistré pour cette entreprise' });
  if (!e.code) return res.status(400).json({ error: 'cet espace n\'a pas de code de connexion — régénère son lien' });
  let a = '', m = '';
  try { const o = JSON.parse(Buffer.from(e.code, 'base64').toString('utf8')); a = String(o.a || ''); m = String(o.m || ''); } catch (err) {}
  const lien = lienEspaceCode(e);
  /* L'ADRESSE, et pas seulement le lien. Le lien sert UNE fois — c'est la première connexion,
     celle qui n'a pas encore de compte. Ensuite, c'est l'adresse qu'on donne à toute l'équipe :
     chacun y tape son identifiant et son mot de passe, sur n'importe quel téléphone. L'e-mail
     doit dire les deux, sinon le client garde le lien comme un trésor et rappelle dès qu'il
     le perd — c'est exactement ce qu'on vient de corriger. */
  const adresse = 'teamop.fr/e/' + (e.slug || slug);
  const co = (a && m)
    ? '• Identifiant : ' + a + ' (votre prénom)\n• Mot de passe provisoire : ' + m + ' (votre nom + « !! »)\nÀ votre première connexion, l\'application vous fait choisir votre vrai mot de passe — ensuite ce sont vos identifiants pour toujours.\n'
    : 'Connectez-vous avec vos identifiants habituels.\n';
  const texte = 'Bonjour,\n\nVotre espace « ' + e.nom + ' » est prêt.\n\n1) VOTRE PREMIÈRE CONNEXION — ce lien :\n' + lien + '\n\n' + co
    + '\n2) ENSUITE, ET POUR TOUTE VOTRE ÉQUIPE — l\'adresse de votre entreprise :\n' + adresse
    + '\n\nC\'est elle qu\'on donne aux équipes : chacun y va, tape SON identifiant et SON mot de passe, et arrive dans votre espace. Aucun lien à conserver, aucun code à retenir, sur n\'importe quel téléphone. Mettez-la en favori.\nVous créez les comptes de votre équipe dans Utilisateurs.\n\n— L\'équipe TEAM OP · teamop.fr';
  const coHtml = (a && m)
    ? MAIL_BLOCS.ident(a, m) + '<br>'
    : 'Connectez-vous avec vos <b>identifiants habituels</b>.<br>';
  const html = mailTeamOP({
    chip: 'Accès prêt',
    titre: 'Votre lien de connexion 🔗',
    corpsHtml: 'Bonjour,<br>votre espace « <b>' + e.nom + '</b> » est prêt.<br><br><b>1) Votre première connexion — ce lien :</b><br><a href="' + lien + '" style="color:#34A97E">' + lien.replace('https://', '') + '</a><br><br>' + coHtml
      + '<br><b>2) Ensuite, et pour toute votre équipe — l\'adresse de votre entreprise :</b><br><a href="https://' + adresse + '" style="color:#34A97E;font-size:17px;font-weight:700">' + adresse + '</a><br><span style="color:#8fa3c8;font-size:13px">Chacun y va, tape son identifiant et son mot de passe, et arrive dans votre espace — sur n\'importe quel téléphone, sans lien à conserver. Mettez-la en favori.</span><br>',
    frise: [
      { titre: 'Espace prêt', sous: 'par TEAM OP', fait: true },
      { titre: '1re connexion', sous: 'avec le lien', fait: false },
      { titre: 'Votre équipe', sous: 'par ' + adresse, fait: false }
    ],
    boutonTxt: 'Ouvrir mon application', boutonUrl: lien,
    bouton2Txt: 'Mon espace client', bouton2Url: 'https://teamop.fr/espace.html'
  });
  try {
    /* confidentiel : ce courriel porte le lien de connexion (donc la clé qui déchiffre les données de
       l'espace) ET le mot de passe provisoire. Sans ce drapeau, mailerEnvoi en gardait 2000 caractères
       dans mails-envoyes.json et en glissait une copie dans la boîte support — deux endroits où la clé
       d'une entreprise n'a rien à faire. Sa relance, plus bas, le disait déjà ; celui-ci l'avait oublié. */
    await mailerEnvoi({ confidentiel: true, trace: 'lien de connexion + accès provisoires · espace ' + slug,
      from: config.smtp.from || config.smtp.user, to: e.email,
      subject: '🔗 Votre lien de connexion — TEAM OP', text: texte, html });
    console.log('Tour :', req.tourUser.nom, 'a envoyé le lien de', slug, '→', masqueMail(e.email));
    // son « Mon espace » passe à Accès activé · OP GESTION active (+ abonnement si formule posée)
    fbMajFicheClient(e.email, Object.assign({ status: 'fourni', apps: ['elan'] },
      e.formule ? { plan: FORMULE_LBL[e.formule] || e.formule, planStatus: 'actif' } : {})).catch(() => {});
    res.json({ ok: true, envoye: e.email });
  } catch (err) { res.status(500).json({ error: 'envoi impossible : ' + String(err.message).slice(0, 120) }); }
});
// l'app d'un espace demande sa formule attribuée (public — ne révèle que la formule)
/* Fiche d'un espace de l'annuaire à partir de son identifiant d'équipe (avec son nom de lien) */
function espaceParT(t) {
  if (!t) return null;
  const slugs = Object.keys(espacesReg).filter(s => { const x = espacesReg[s];
    if (x.t) return x.t === t;
    try { const o = JSON.parse(Buffer.from(x.code, 'base64').toString('utf8')); return String(o.t || '') === t; } catch (err) { return false; } });
  if (!slugs.length) return null;
  const slug = slugs.sort((a, b) => (espacesReg[b].ts || 0) - (espacesReg[a].ts || 0))[0];   // plusieurs noms pour le même espace : le plus récent
  return Object.assign({ slug }, espacesReg[slug]);
}

/* ── Verdict de clé d'équipe : la mécanique derrière le point de passage de la famille mail.
   Même vérification que /api/espaces/comptes, en un seul endroit plutôt que recopiée, et
   comparée en temps constant comme memeSecret() d'agent-devis.js — un !== sur une empreinte
   se mesure. Quatre verdicts, et ils ne disent pas la même chose :
     valide   — la clé est prouvée ;
     absent   — aucun kh envoyé (une version d'app.html antérieure à la phase 2) ;
     invalide — un kh envoyé qui ne correspond pas : à regarder de près ;
     inconnu  — l'espace n'est pas dans espacesReg, donc on ne PEUT PAS vérifier. C'est le
                verdict décisif : tant qu'il n'est pas à zéro, fermer la porte couperait la
                Réception d'entreprises parfaitement légitimes. */
/* Ces quatre compteurs disent si la porte peut se fermer. Ils vivent en mémoire et
   repartent à zéro au redémarrage — c'est assez pour la mesure visée, et ça évite d'écrire
   un fichier de plus. Ils sont exposés dans /health, agrégés : quatre entiers ne disent
   rien de personne — ni adresse, ni espace, ni contenu. Sans cela, la suite se déciderait
   à l'aveugle, /api/mail/cles étant protégée par une clé que Justin n'a pas. */
const cleEquipeVu = { valide: 0, absent: 0, invalide: 0, inconnu: 0, depuis: Date.now() };
const cleEquipeParEspace = new Map();   // t -> { slug, valide, absent, invalide, inconnu, vu }
const cleEquipeParRoute = Object.create(null);   // route -> { valide, absent, invalide, inconnu }

function cleEquipeVerdict(t, kh) {
  const khn = String(kh || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(khn)) return 'absent';
  const e = espaceParT(String(t || ''));
  if (!e || !e.code) return 'inconnu';
  let cle = '';
  try { cle = String(JSON.parse(Buffer.from(e.code, 'base64').toString('utf8')).k || ''); } catch (err) {}
  if (!cle) return 'inconnu';
  const attendu = Buffer.from(crypto.createHash('sha256').update(cle).digest('hex'));
  const recu = Buffer.from(khn);
  return (attendu.length === recu.length && crypto.timingSafeEqual(attendu, recu)) ? 'valide' : 'invalide';
}

/* Le point de passage lui-même. Il compte et laisse passer — req.cleEquipe est posé pour la
   phase 3, où les routes s'en serviront pour refuser. Rien n'est écrit dans les journaux :
   ni adresse, ni objet, ni corps. Le comptage reste en mémoire et se lit par une route
   protégée ; il repart donc à zéro au redémarrage, ce qui suffit pour la mesure visée. */
function cleEquipeObserve(req, res, next) {
  const src = (req.method === 'GET') ? (req.query || {}) : (req.body || {});
  const t = String(src.teamId || src.t || '');
  /* Uniquement l'en-tête. Le lire aussi dans la requête (donc dans « ?kh= ») le ferait
     entrer dans les journaux d'accès nginx et dans l'historique du navigateur — exactement
     ce que le commentaire d'app.html jure d'éviter. Vérifié : l'application n'envoie que
     l'en-tête. */
  const v = cleEquipeVerdict(t, req.headers['x-teamop-kh'] || '');
  cleEquipeVu[v]++;
  /* Ventilé par route, sinon le critère « absent à zéro » est inatteignable : espace.html et
     messages.html appellent /api/subscribe et /api/notify sans jamais envoyer de kh, et leur
     bruit noierait la mesure des routes de messagerie — la seule qui décide de la fermeture. */
  const rt = String(req.baseUrl || req.path || '').replace(/^\/api\//, '').slice(0, 24) || '?';
  const parR = cleEquipeParRoute[rt] || (cleEquipeParRoute[rt] = { valide: 0, absent: 0, invalide: 0, inconnu: 0 });
  parR[v]++;
  if (t) {
    if (cleEquipeParEspace.size > 3000) cleEquipeParEspace.clear();   // borne mémoire, comme comptesQuota
    const e = cleEquipeParEspace.get(t) || { slug: '', valide: 0, absent: 0, invalide: 0, inconnu: 0 };
    if (!e.slug) { const x = espaceParT(t); e.slug = x ? x.slug : '(hors annuaire)'; }
    e[v]++; e.vu = Date.now();
    cleEquipeParEspace.set(t, e);
  }
  req.cleEquipe = v;
  next();
}

/* ⚠️ POUR LA PHASE SUIVANTE, QUAND ON REFUSERA VRAIMENT : le refus de /api/replies ne doit
   PAS être du JSON. loadMailReplies() (app.html) fait « const d = await r.json();
   _mailReplies = d.replies || [] » — un refus en JSON se parse donc sans erreur, la liste
   devient VIDE au lieu de NULLE, et l'écran affiche « 📭 Aucun message » au lieu de
   « 📥 Réception indisponible ». Le client ne verrait pas une panne, il verrait sa
   correspondance disparue. Répondre en text/plain fait rejeter r.json(), tomber dans le
   catch, et affiche le vrai message — sans toucher à app.html.

   Ce que la phase 1 sert à lire. Protégée par la clé du serveur, comme /api/bugs.
   « inconnu » et « absent » non nuls = fermer maintenant casserait ces espaces. */
app.get('/api/mail/cles', (req, res) => {
  if ((req.query.key || '') !== config.apiKey) return res.status(403).json({ error: 'clé invalide' });
  const espaces = Array.from(cleEquipeParEspace.entries())
    .map(([t, e]) => ({ t, slug: e.slug, valide: e.valide, absent: e.absent, invalide: e.invalide, inconnu: e.inconnu, vu: e.vu }))
    .sort((a, b) => (b.vu || 0) - (a.vu || 0)).slice(0, 300);
  res.json({ total: cleEquipeVu, espaces });
});
app.post('/api/espaces/etat', (req, res) => {
  const t = monStr((req.body || {}).t, 80);
  if (!t) return res.status(400).json({ error: 't requis' });
  const e = espaceParT(t);
  if (entFermes.espaces.includes(t)) return res.json({ ok: true, ferme: true });
  /* OP MESSAGES ne fait plus partie des formules d'OP GESTION. C'est une application à part,
     avec son propre abonnement : on l'ouvre entreprise par entreprise depuis la Tour, et son
     absence ici veut dire « pas accordée ». Le défaut est donc FERMÉ, pour tout le monde —
     mélanger les deux applications, c'est mélanger deux abonnements et deux connexions.
     Ce champ est rendu sur les deux chemins qui décrivent un espace VIVANT — celui qui part
     avant la formule compris : l'y oublier laissait la messagerie ouverte chez toute entreprise
     sans formule attribuée. Le chemin « ferme » sort plus haut sans le rendre, et c'est juste :
     l'application y vide son stockage et se recharge avant même de regarder ce champ. */
  const opMessages = !!(e && e.opMessages);
  const versionMin = versionsCfg.min, enLigne = versionsCfg.enLigne;
  if (!e || !e.formule) return res.json({ ok: true, opMessages, versionMin, enLigne });
  espacePaye(e).then(p => res.json({ ok: true, formule: e.formule, quantite: e.quantite || 1, paye: p.paye, motif: p.motif, opMessages, versionMin, enLigne }))
    .catch(() => res.json({ ok: true, formule: e.formule, quantite: e.quantite || 1, paye: false, motif: 'vérification impossible', opMessages, versionMin, enLigne }));
});
/* ── Création AUTOMATIQUE d'un espace à la demande d'application ──
   Dès qu'un client fait une demande sur teamop.fr, son espace est créé, inscrit à
   l'annuaire, et le lien lui est envoyé par e-mail. Sa première connexion se fait
   avec l'e-mail + le mot de passe de son compte TeamOP (le code embarque a = e-mail).
   Si son e-mail a déjà un espace, on le RÉUTILISE : le lien pointe sur ses vraies
   données, jamais sur un espace vide. */
const formuleDeLabel = (s) => {
  s = String(s || '').toLowerCase();
  if (s.includes('premium')) return 'premium';
  if (s.includes('business')) return 'business';
  if (s.includes('pro')) return 'pro';
  if (s.includes('gratuit')) return 'gratuit';
  return '';
};
function espaceAutoPour(email, entreprise, formuleLabel, users, lienVoulu, prenomC, nomFamC) {
  email = String(email || '').toLowerCase();
  let slug = Object.keys(espacesReg).find(s => (espacesReg[s].email || '').toLowerCase() === email);
  let e, neuf = false, ident = '', mdpProv = '';
  if (slug) { e = espacesReg[slug]; }
  else {
    // le client a choisi le nom de son lien de connexion (vérifié disponible côté site) —
    // sinon on part du nom d'entreprise
    const voulu = String(lienVoulu || '').trim().slice(0, 60);
    slug = espSlug(voulu) || espSlug(entreprise) || espSlug(email.split('@')[0]) || ('ent' + crypto.randomBytes(3).toString('hex'));
    const base = slug; let n = 2;
    while (espacesReg[slug]) slug = base + n++;   // nom déjà pris par une autre entreprise → variante
    const t = 'ent-' + crypto.randomBytes(8).toString('hex');
    const k = crypto.randomBytes(24).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || crypto.randomBytes(12).toString('hex');
    const nom = (espSlug(voulu) && slug === espSlug(voulu) ? voulu : String(entreprise || '').trim().slice(0, 80)) || email;
    // identifiants de départ : identifiant = prénom, mot de passe provisoire = Nom + « !! »
    // (l'application fait choisir le vrai mot de passe à la première connexion)
    const cap = (x) => x ? x.charAt(0).toUpperCase() + x.slice(1) : '';
    ident = (espSlug(prenomC) || 'admin').slice(0, 20);
    mdpProv = (cap(espSlug(nomFamC)) || 'Teamop') + '!!';
    // « mh », pas « m » : le mot de passe provisoire part par e-mail (mdpProv est rendu à l'appelant),
    // le code ne porte que son empreinte — de quoi le reconnaître, pas de quoi le lire
    const code = Buffer.from(JSON.stringify({ t, k, n: nom, a: ident, mh: mdpEmpreinte(mdpProv), e: email }), 'utf8').toString('base64').replace(/=+$/, '');
    e = espacesReg[slug] = { nom, code, t, ts: Date.now(), par: 'auto (demande)', origine: 'site', email };
    neuf = true;
  }
  const f = formuleDeLabel(formuleLabel);
  if (f) {
    e.formule = f; e.quantite = Math.max(1, Math.min(50, parseInt(users, 10) || 1));
    e.formulePar = 'auto (demande)'; e.formuleTs = Date.now();
  }
  try { fs.writeFileSync(ESPACES_PATH, JSON.stringify(espacesReg)); } catch (err) {}
  let t = e.t;
  try { if (!t) t = String(JSON.parse(Buffer.from(e.code, 'base64').toString('utf8')).t || ''); } catch (err) {}
  return { slug, nom: e.nom, formule: e.formule || '', quantite: e.quantite || 1, neuf, t, ident, mdp: mdpProv };
}
/* nom d'entreprise présentable (jamais une adresse e-mail mise là faute de mieux) */
function espNomPropre(e) { const n = String((e && e.nom) || '').trim(); return (n && !/@/.test(n) && n.toLowerCase() !== String((e && e.email) || '').toLowerCase()) ? n : ''; }
/* ── Le nom d'une entreprise ne rend plus sa clé d'équipe ──────────────────────────────
   /api/espaces/trouver rendait le code d'espace — donc « k », la clé qui ouvre les
   données de l'entreprise — à qui tapait son NOM. Un nom se lit sur un camion, une
   facture, un devis : ce n'est pas un secret, et il ne doit pas en garder un.
   La route est retirée. Trois routes la remplacent, chacune ne rendant que le strict
   nécessaire à ce qu'elle sert :
     • /relance     — renvoie le lien de connexion à l'adresse DÉJÀ enregistrée pour
                      l'entreprise. Il faut donc sa boîte aux lettres, plus seulement
                      son nom. La réponse est la même que l'entreprise existe ou non :
                      sinon la route deviendrait l'annuaire des clients de TEAM OP.
     • /libre       — un oui/non de disponibilité, pour le formulaire d'inscription.
     • /verifie-nom — « ce nom est-il celui de l'équipe t ? », demandé par un appareil
                      qui est DÉJÀ dans l'espace t. Rien n'en sort que ce booléen. */
const relanceQuota = new Map();
function quotaOk(map, cle, max, fenetre) {
  const q = map.get(cle) || { n: 0, reset: Date.now() + fenetre };
  if (Date.now() > q.reset) { q.n = 0; q.reset = Date.now() + fenetre; }
  q.n++; map.set(cle, q);
  return q.n <= max;
}
/* Plusieurs inscriptions peuvent porter le même espace : la plus récente fait foi. */
function espaceAJour(slug) {
  let e = espacesReg[slug]; if (!e) return null;
  try { const t = e.t || String(JSON.parse(Buffer.from(e.code, 'base64').toString('utf8')).t || ''); const r = espaceParT(t); if (r && r.code) e = r; } catch (err) {}
  return e;
}
/* Identifiant d'équipe porté par un espace de l'annuaire. */
function espaceT(e) {
  if (!e) return '';
  if (e.t) return String(e.t);
  try { return String(JSON.parse(Buffer.from(e.code, 'base64').toString('utf8')).t || ''); } catch (err) { return ''; }
}
/* Le lien de connexion d'un espace porte le CODE (#entreprise=…), jamais le nom
   (#e=nom) : un nom se devine, un code non. Le mot de passe provisoire n'y figure
   pas — codeMdpHache l'a remplacé par son empreinte. */
function lienEspaceCode(e) { return 'https://teamop.fr/app.html#entreprise=' + codeMdpHache(e.code); }
/* ══ OUVRIR SON ESPACE AVEC UN CODE D'ACCÈS ═══════════════════════════════════════════════
   Taper le nom de l'entreprise ne peut pas suffire : le lien de connexion porte la CLÉ qui
   déchiffre les données de l'espace (syncKey la dérive en PBKDF2), et un nom se lit sur un
   camion, une facture, un devis. Mais l'aller-retour par e-mail était un cul-de-sac : une
   entreprise dont la boîte n'est plus relevée ne pouvait plus entrer du tout.
   D'où ce code : dix caractères que le responsable donne à ses équipes et renouvelle depuis la
   Tour. Le nom AVEC le code rend le lien, et l'application demande ensuite identifiant et mot
   de passe, comme avant.
   DIX et non six : à six, 31⁶ ≈ 8,9·10⁸, et seul le compteur par espace tenait la force brute —
   ce qui obligeait à le serrer, donc à laisser n'importe qui verrouiller un espace en tapant à
   côté. À dix, 31¹⁰ ≈ 8,2·10¹⁴ : la force brute n'est plus le sujet. L'alphabet écarte O/0 et
   I/1/L — ce code se dicte au téléphone, depuis un chantier.

   IL VIT DANS SON PROPRE REGISTRE, indexé par l'identifiant d'ÉQUIPE (t), et non dans
   espacesReg indexé par slug. Deux raisons, toutes deux mesurées :
   · espaceAJour() ne rend pas l'objet du registre mais une COPIE (espaceParT termine par un
     Object.assign) : écrire dessus n'écrivait nulle part, et le code affiché au patron n'a
     jamais existé côté serveur — la Tour en montrait un neuf à chaque ouverture, aucun ne
     fonctionnait, et « Renouveler » ne révoquait rien.
   · un même espace peut porter PLUSIEURS noms dans l'annuaire. Rangé par nom, un code révoqué
     ressuscitait dès que le patron rouvrait le panneau d'un ancien nom. Un espace, un code. */
const ACCES_PATH = path.join(DATA_DIR, 'acces.json');
let accesReg = {};
/* Un registre illisible se dit : sinon on repart avec {} en silence, tous les codes morts, et
   personne ne l'apprend avant qu'un client appelle. */
try { accesReg = JSON.parse(fs.readFileSync(ACCES_PATH, 'utf8')); }
catch (e) { if (e.code !== 'ENOENT') console.error('acces.json illisible — registre vide :', e.message); }
/* Écriture ATOMIQUE : writeFileSync sur le fichier final peut laisser un JSON tronqué si le
   disque se remplit ou si le service tombe au mauvais moment — et un registre tronqué, c'est
   tous les codes de tous les clients perdus. On écrit à côté, puis on renomme : rename est
   atomique, le fichier est toujours entier. Rend true si c'est écrit, pour que l'appelant
   puisse refuser plutôt que d'annoncer une révocation qui n'a pas eu lieu. */
function accesEcrire() {
  try {
    const tmp = ACCES_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(accesReg));
    fs.renameSync(tmp, ACCES_PATH);
    return true;
  } catch (e) { console.error('acces.json non écrit :', e.message); return false; }
}
let accesTimer = null;
function accesSave() {   // différée : la route publique n'écrit qu'une date de dernier usage
  clearTimeout(accesTimer);
  accesTimer = setTimeout(accesEcrire, 800);
  if (accesTimer.unref) accesTimer.unref();
}
const ACCES_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ACCES_LONGUEUR = 10;
function accesNeuf() {
  let c = '';
  const buf = crypto.randomBytes(ACCES_LONGUEUR);
  for (let i = 0; i < ACCES_LONGUEUR; i++) c += ACCES_ALPHABET[buf[i] % ACCES_ALPHABET.length];
  return c;
}
const accesNorm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/* Bornée et purgée, comme « compteurs » : sans cela, une clé par nom inventé s'accumule sans
   fin, et la route étant publique, c'est de la mémoire offerte à qui la demande. */
let ouvrirQuota = new Map();
setInterval(() => { ouvrirQuota = new Map(); }, 3600000).unref();
/* Le compteur par ESPACE n'est plus tenu du tout : il ne bornait rien (le code fait dix
   caractères, c'est lui qui protège, pas un compteur), il ne servait qu'à remplir la table —
   et une table pleine remettait à zéro les compteurs par IP, qui eux comptent vraiment.
   Ce qui reste utile, c'est de VOIR une entreprise se faire tâter : on compte les échecs par
   espace pour le journal, dans une table à part, et on le dit une fois passé un seuil. */
let echecsEspace = new Map();
setInterval(() => { echecsEspace = new Map(); }, 3600000).unref();
app.post('/api/espaces/ouvrir', (req, res) => {
  /* Les deux entrées sont bornées AVANT tout traitement : espSlug fait un normalize('NFD') qui,
     sur les 6 Mo qu'accepte express.json, bloquerait la boucle d'événements. */
  const slug = espSlug(monStr((req.body || {}).nom, 80));
  const donne = accesNorm(monStr((req.body || {}).acces, 32));
  if (!slug || !donne) return res.status(400).json({ error: 'Nom de l\'entreprise et code d\'accès requis' });
  if (ouvrirQuota.size > 5000) ouvrirQuota = new Map();
  const ip = req.ip || '?';   // jamais l'en-tête brut : il est fourni par le client
  if (!quotaOk(ouvrirQuota, 'ip:' + ip, 60, 3600000))
    return res.status(429).json({ error: 'Trop d\'essais — réessaie dans une heure, ou fais-toi renvoyer le lien par e-mail.' });
  const e = espaceAJour(slug);
  const t = e ? espaceT(e) : '';
  const enr = t ? accesReg[t] : null;
  /* Une seule et même réponse quand ça ne marche pas, quelle qu'en soit la raison : sinon
     l'écran dirait qui est client de TEAM OP et qui ne l'est pas. */
  const refus = () => res.status(403).json({ error: 'Nom d\'entreprise ou code d\'accès incorrect.' });
  /* Une entreprise fermée ne se rouvre pas par ce chemin. /api/espaces/etat le vérifiait déjà ;
     ici, l'oublier laissait un ex-client — ou quiconque a reçu le code — continuer d'obtenir la
     clé de ses anciennes données. */
  if (t && entFermes.espaces.includes(t)) return res.status(403).json({ error: 'Nom d\'entreprise ou code d\'accès incorrect.' });
  const bon = (() => {
    if (!e || !e.code || !enr || !enr.code) return false;
    const attendu = Buffer.from(accesNorm(enr.code));
    const recu = Buffer.from(donne);
    // comparaison à durée constante : le temps de réponse ne doit pas trahir un préfixe correct
    return attendu.length === recu.length && crypto.timingSafeEqual(attendu, recu);
  })();
  /* Le compteur par espace ne compte QUE les échecs, et il est consulté APRÈS la vérification.
     Autrement, trente requêtes à vide sur un nom d'entreprise — qui est public — fermaient la
     porte à tous ses salariés pendant une heure, code correct en main. C'est le plafond par IP
     qui borne la force brute, et dix caractères la rendent hors de portée de toute façon. */
  if (!bon) {
    /* On ne compte QUE les espaces qui existent. Compter aussi les noms inventés laissait
       l'attaquant remplir la table en variant le nom à chaque requête, donc la faire purger,
       donc remettre à zéro le compteur de l'espace qu'il attaquait vraiment : l'alerte ne
       partait jamais. La clé n'est plus fournie par l'appelant. */
    if (t) {
      if (echecsEspace.size > 5000) echecsEspace = new Map();
      const n = (echecsEspace.get(t) || 0) + 1;
      echecsEspace.set(t, n);
      if (n === 20) console.warn('code d\'accès : 20 échecs en une heure sur l\'espace', t);
    }
    return refus();
  }
  /* Ce qu'on rend porte déjà « k », la clé des données. On en retire l'adresse e-mail de
     l'entreprise (e) : c'est la coordonnée d'un tiers, elle n'a rien à faire dans une réponse
     rendue contre un code partagé.
     « a » et « mh » RESTENT, et c'est un choix mesuré, pas un oubli. Sans « mh », l'application
     renomme bien le compte d'amorçage avec « a » mais laisse son mot de passe à celui du
     démarrage — sha256('1234'). Un espace neuf ouvert par ce chemin se serait donc ouvert avec
     « prénom / 1234 », pendant que la Tour affiche au patron un tout autre mot de passe
     provisoire.
     Que « mh » vaille peu est vrai et il faut le dire sans se raconter d'histoire : c'est un
     SHA-256 NU (mdpEmpreinte) d'une valeur devinable en un essai — mdpProv fabrique « Nom!! » à
     partir du nom de famille, celui-là même que l'appelant vient de taper. Ce n'est donc pas
     « l'empreinte d'un secret à usage unique ». Si on le rend quand même, c'est que pour arriver
     ici il faut DÉJÀ le code à dix caractères, et que la réponse porte « k » : qui casserait
     « mh » a déjà les données. Le vrai problème est ailleurs — un mot de passe provisoire
     prévisible et une empreinte sans sel — et c'est une dette à traiter pour elle-même. */
  let rendu = codeMdpHache(e.code);
  try {
    const o = JSON.parse(Buffer.from(rendu, 'base64').toString('utf8'));
    delete o.e;
    rendu = Buffer.from(JSON.stringify(o), 'utf8').toString('base64').replace(/=+$/, '');
  } catch (err) {}
  enr.vu = Date.now(); accesSave();
  /* Ni IP ni nom : l'IP est une donnée personnelle et se falsifie, et pour une entreprise
     individuelle le nom commercial EST le nom de la personne. L'identifiant d'équipe suffit à
     retrouver l'espace si on doit enquêter. */
  console.log('espace ouvert par code · espace', t);
  res.json({ ok: true, code: rendu });
});
/* Le patron lit ou renouvelle le code d'accès. Tout passe par l'identifiant d'ÉQUIPE : un espace,
   un code, quel que soit le nom par lequel on arrive. */
app.post('/api/monitor/espaces/acces', monPatronStrict, (req, res) => {
  const slug = espSlug(monStr((req.body || {}).slug || (req.body || {}).nom, 80));
  const e = espaceAJour(slug);
  const t = e ? espaceT(e) : '';
  if (!e || !t) return res.status(404).json({ error: 'Espace inconnu — génère d\'abord son « Lien de connexion » (fiche entreprise)' });
  let enr = accesReg[t];
  if (!enr || !enr.code || enr.code.length !== ACCES_LONGUEUR || (req.body || {}).regenerer) {
    const avant = enr;
    enr = accesReg[t] = { code: accesNeuf(), ts: Date.now(), par: req.tourUser.nom, vu: 0 };
    /* Si l'écriture échoue, on ne dit surtout pas que c'est fait : le patron dicterait un code
       qui mourrait au prochain redémarrage, en croyant l'ancien révoqué. */
    if (!accesEcrire()) {
      if (avant) accesReg[t] = avant; else delete accesReg[t];
      return res.status(500).json({ error: 'Le code n\'a pas pu être enregistré — rien n\'a changé. Réessaie.' });
    }
    console.log('Tour :', req.tourUser.nom, ((req.body || {}).regenerer ? 'renouvelle' : 'crée'), 'le code d\'accès de l\'espace', t);
  }
  res.json({ ok: true, slug, acces: enr.code, ts: enr.ts || 0, par: enr.par || '', vu: enr.vu || 0 });
});
/* ══ CHANGER LES IDENTIFIANTS DE DÉPART D'UN ESPACE ═══════════════════════════════════════
   Justin ouvre un accès depuis la Tour, oublie le mot de passe, et n'a aucun moyen de le
   reprendre. On le lui rend — MAIS seulement tant que personne ne s'est connecté.
   La raison n'est pas un excès de prudence : après la première connexion, le mot de passe réel
   vit dans les données CHIFFRÉES de l'espace, que le serveur ne peut ni lire ni écrire. Le
   « mot de passe provisoire » n'est qu'une amorce, lue une seule fois par l'application au
   tout premier démarrage. Le réécrire après coup ne changerait rien et ferait mentir l'écran :
   on refuse et on dit pourquoi. */
app.post('/api/monitor/espaces/identifiants', monPatronStrict, (req, res) => {
  const slug = espSlug(monStr((req.body || {}).slug || (req.body || {}).nom, 80));
  const e = espaceAJour(slug);
  if (!e || !e.code) return res.status(404).json({ error: 'Espace inconnu' });
  const t = espaceT(e);
  /* Sans identifiant d'équipe, on ne peut PAS savoir si l'espace a servi : cnxResume('') rend
     un compteur vide, donc « jamais connecté », donc on écrirait. « Je ne sais pas » doit
     refuser. */
  if (!t) return res.status(409).json({ error: 'Cet espace n\'a pas d\'identifiant d\'équipe lisible : impossible de savoir s\'il a déjà servi, donc impossible de changer ses identifiants sans risque.' });
  const vu = cnxResume(t);
  if (vu.derniere) return res.status(409).json({
    error: 'Cet espace a déjà servi (dernière connexion enregistrée) : son mot de passe vit désormais dans ses données chiffrées, le serveur ne peut plus le changer. C\'est à la personne de passer par « mot de passe oublié » dans l\'application.' });
  const ident = monStr((req.body || {}).ident, 40).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const mdp = monStr((req.body || {}).mdp, 200);
  if (!ident || mdp.length < 8) return res.status(400).json({ error: 'Un identifiant et un mot de passe d\'au moins 8 caractères sont requis' });
  let o;
  try { o = JSON.parse(Buffer.from(e.code, 'base64').toString('utf8')); } catch (err) { o = null; }
  /* Le test du TYPE n'est pas de la coquetterie : sans « use strict », écrire une propriété sur
     un primitif (un code qui décoderait vers 123) échoue SANS lever, puis on réécrirait le code
     avec ce primitif — « t » et « k » perdus, données de l'entreprise irrécupérables. Le voisin
     codeMdpHache porte déjà exactement cette garde. */
  if (!o || typeof o !== 'object' || Array.isArray(o) || !o.t || !o.k)
    return res.status(500).json({ error: 'Code d\'espace illisible ou incomplet — rien n\'a été touché.' });
  o.a = ident; o.mh = mdpEmpreinte(mdp); delete o.m;
  const neuf = Buffer.from(JSON.stringify(o), 'utf8').toString('base64').replace(/=+$/, '');
  /* On écrit sur l'entrée VIVANTE du registre, pas sur la copie que rend espaceAJour. */
  const vraiSlug = e.slug || slug;
  if (!espacesReg[vraiSlug]) return res.status(500).json({ error: 'Entrée d\'annuaire introuvable' });
  /* On mémorise l'ancien code AVANT de muter : si l'écriture échoue, le serveur servirait le
     nouveau jusqu'au redémarrage tout en répondant « rien n'a changé ». Le patron croirait
     l'opération annulée. Même motif que /api/monitor/espaces/acces. */
  const avant = espacesReg[vraiSlug].code;
  espacesReg[vraiSlug].code = neuf;
  try { fs.writeFileSync(ESPACES_PATH, JSON.stringify(espacesReg)); }
  catch (err) {
    espacesReg[vraiSlug].code = avant;
    console.error('identifiants : espaces.json non écrit :', err.message);
    return res.status(500).json({ error: 'Enregistrement impossible — rien n\'a changé.' });
  }
  console.log('Tour :', req.tourUser.nom, 'change les identifiants de départ de l\'espace', t);
  res.json({ ok: true, ident: ident, lien: 'https://teamop.fr/app.html#entreprise=' + neuf });
});
/* ══ SE CONNECTER AVEC SON IDENTIFIANT, SANS LIEN NI CODE ═══════════════════════════════════
   Le problème posé, en clair : le lien (#entreprise=…) et le code d'accès à dix caractères
   sont des secrets D'ENTREPRISE. Qui les perd — un salarié qui se déconnecte, un téléphone
   remplacé, un navigateur vidé — n'a plus de porte du tout et doit rappeler son patron.
   Organilog demande une adresse d'entreprise, puis l'identifiant et le mot de passe de la
   personne. C'est exactement ce qu'on met en place ici.

   L'obstacle était réel et il faut le nommer : les comptes (identifiant, mot de passe) vivent
   dans les données CHIFFRÉES de l'espace, que le serveur ne sait pas lire. Il ne pouvait donc
   rien vérifier. La solution n'est pas de déchiffrer — ce serait renoncer au chiffrement —
   c'est de faire DÉPOSER par l'application un VÉRIFICATEUR : pour chaque compte, un sel et
   PBKDF2(empreinte du mot de passe, sel, 120 000 tours). Le serveur ne peut ni en tirer le mot
   de passe, ni s'en servir ailleurs ; il peut seulement répondre « oui, c'est bien celui-là ».

   Ce qu'il rend en cas de succès, c'est le code de l'espace — donc « k », la clé des données.
   C'est EXACTEMENT ce que rend déjà /api/espaces/ouvrir contre le code à dix caractères, et ce
   que porte le lien de connexion. La nouveauté n'est donc pas la divulgation, c'est sa
   CONDITION : un mot de passe personnel, révocable compte par compte, au lieu d'un secret
   partagé par toute l'entreprise et impossible à retirer à une seule personne.

   Ce que ça ne fait pas, et qu'il ne faut pas se raconter : tant qu'une entreprise n'a pas
   ouvert l'application au moins une fois avec cette version, son annuaire est vide et ce
   chemin ne marche pas pour elle. Le code d'accès reste donc en place — c'est le filet, pas
   le chemin normal. */
const COMPTES_PATH = path.join(DATA_DIR, 'comptes.json');
let comptesReg = {};
/* Illisible se dit, comme pour acces.json : repartir de {} en silence, c'est renvoyer toutes
   les entreprises au code d'accès sans que personne ne l'apprenne. */
try { comptesReg = JSON.parse(fs.readFileSync(COMPTES_PATH, 'utf8')); }
catch (e) { if (e.code !== 'ENOENT') console.error('comptes.json illisible — annuaire de connexion vide :', e.message); }
function comptesEcrire() {   // ATOMIQUE : tmp + rename, même motif que acces.json
  try {
    const tmp = COMPTES_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(comptesReg));
    fs.renameSync(tmp, COMPTES_PATH);
    return true;
  } catch (e) { console.error('comptes.json non écrit :', e.message); return false; }
}
const CNX_ITER = 120000;   // le même chiffre que syncKey() dans l'application — un seul réglage à retenir
/* L'application dépose son annuaire de connexion. Elle prouve qu'elle détient la clé d'équipe,
   exactement comme /api/espaces/lien : sans cela, n'importe qui écraserait l'annuaire d'une
   entreprise avec ses propres vérificateurs et entrerait chez elle. */
let comptesQuota = new Map();
setInterval(() => { comptesQuota = new Map(); }, 3600000).unref();
app.post('/api/espaces/comptes', (req, res) => {
  const b = req.body || {};
  const t = monStr(b.t, 80), kh = monStr(b.kh, 64).toLowerCase();
  if (!t || !/^[0-9a-f]{64}$/.test(kh)) return res.status(400).json({ error: 't et kh requis' });
  if (comptesQuota.size > 5000) comptesQuota = new Map();
  if (!quotaOk(comptesQuota, 'ip:' + (req.ip || '?'), 120, 3600000))
    return res.status(429).json({ error: 'trop de dépôts — réessaie plus tard' });
  const e = espaceParT(t);
  if (!e || !e.code) return res.status(404).json({ error: 'espace inconnu' });
  let cle = '';
  try { cle = String(JSON.parse(Buffer.from(e.code, 'base64').toString('utf8')).k || ''); } catch (err) {}
  if (!cle || crypto.createHash('sha256').update(cle).digest('hex') !== kh)
    return res.status(403).json({ error: 'clé d\'équipe incorrecte' });
  if (entFermes.espaces.includes(t)) return res.status(403).json({ error: 'espace fermé' });
  const recu = Array.isArray(b.comptes) ? b.comptes.slice(0, 300) : null;
  if (!recu) return res.status(400).json({ error: 'comptes requis' });
  /* Même porte que le nuage : une version sous le minimum ne dépose plus l'annuaire — c'est
     par ce chemin qu'un appareil périmé remplaçait 11 comptes par 3 (comptes.json est remplacé
     en entier). Une version d'avant ce verrou n'envoie pas `ver` : elle passe tant qu'aucun
     minimum n'est exigé, plus jamais ensuite. */
  if (versionsCfg.min) {
    const ver = parseInt(String(b.ver || '').replace(/[^0-9]/g, ''), 10) || 0;
    if (ver < versionsCfg.min) return res.status(426).json({ error: 'version trop ancienne — mets l\'application à jour', min: versionsCfg.min });
  }
  /* Le strict nécessaire, plus le NOM depuis le 10 septembre 2026 — décision de Justin : dans la
     Tour, sous l'identifiant, on doit lire qui c'est (deux « florent », impossible de savoir
     lequel supprimer). Ni adresse, ni téléphone : ça reste un annuaire de connexion, pas un
     fichier du personnel. */
  /* Sans prototype : rien de ce qu'on écrit ici ne doit pouvoir devenir « __proto__ » ou
     « constructor » du côté lecture. Les trois noms sont refusés en plus, explicitement — un
     compte ne s'appelle pas ainsi, et les garder ne servirait qu'à piéger la route voisine. */
  const table = Object.create(null);
  const INTERDITS = ['__proto__', 'constructor', 'prototype'];
  for (const c of recu) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) continue;
    const login = monStr(c.login, 40).toLowerCase().trim();
    const sel = monStr(c.s, 32).toLowerCase(), emp = monStr(c.e, 64).toLowerCase();
    if (!login || INTERDITS.includes(login)) continue;
    if (!/^[0-9a-f]{32}$/.test(sel) || !/^[0-9a-f]{64}$/.test(emp)) continue;
    if (ordreBanni(t, login)) continue;   // supprimé depuis la Tour : la porte reste fermée tant que le patron ne réautorise pas
    table[login] = { s: sel, e: emp, n: monStr(c.n, 60).trim() };
  }
  /* Un annuaire vide ne remplace JAMAIS un annuaire garni : un bogue de l'application, une
     synchro pas encore descendue, et toute l'entreprise se retrouvait dehors sans rien avoir
     fait. Effacer un annuaire se fait en fermant l'espace, pas par accident. */
  const avant = comptesReg[t];
  if (!Object.keys(table).length) {
    if (avant && avant.c && Object.keys(avant.c).length)
      return res.status(409).json({ error: 'annuaire vide refusé — l\'ancien est conservé' });
    /* On envoyait des comptes et il n'en reste aucun : dire « ok » ferait croire l'annuaire
       déposé alors que la connexion par identifiant ne marchera pas. */
    if (recu.length) return res.status(400).json({ error: 'aucun compte exploitable dans l\'envoi' });
    return res.json({ ok: true, n: 0 });
  }
  const neuf = { maj: Date.now(), c: table };
  // on n'écrit que si le contenu a bougé : la route est appelée à chaque connexion
  if (avant && JSON.stringify(avant.c) === JSON.stringify(table)) return res.json({ ok: true, n: Object.keys(table).length, inchange: true });
  comptesReg[t] = neuf;
  if (!comptesEcrire()) {
    if (avant) comptesReg[t] = avant; else delete comptesReg[t];
    return res.status(500).json({ error: 'annuaire non enregistré' });
  }
  console.log('annuaire de connexion :', Object.keys(table).length, 'compte(s) pour l\'espace', t);
  res.json({ ok: true, n: Object.keys(table).length });
});
let cnxQuota = new Map();
setInterval(() => { cnxQuota = new Map(); }, 3600000).unref();
let cnxEchecs = new Map();
setInterval(() => { cnxEchecs = new Map(); }, 3600000).unref();
app.post('/api/espaces/connexion', async (req, res) => {
  const b = req.body || {};
  // borné AVANT espSlug : son normalize('NFD') sur plusieurs Mo gèle la boucle d'événements
  const slug = espSlug(monStr(b.nom, 80));
  const login = monStr(b.login, 40).toLowerCase().trim();
  const h = monStr(b.h, 64).toLowerCase();
  if (!slug || !login || !/^[0-9a-f]{64}$/.test(h))
    return res.status(400).json({ error: 'Nom de l\'entreprise, identifiant et mot de passe requis' });
  if (cnxQuota.size > 5000) cnxQuota = new Map();
  const ip = req.ip || '?';   // req.ip, jamais l'en-tête brut : il est fourni par le client
  /* On compte les ÉCHECS, pas les connexions. Compter tout mettait dehors ce qu'on veut
     justement servir : une équipe de trente personnes qui arrive à 7 h derrière la même box en
     4G épuise soixante requêtes en quelques minutes, mots de passe corrects en main. La force
     brute, elle, ne produit que des échecs — c'est eux qu'il faut borner. Le plafond par minute
     des routes sensibles (PLAFOND_STRICT) borne séparément le coût de calcul. */
  const echecsIp = cnxQuota.get('ip:' + ip);
  if (echecsIp && Date.now() < echecsIp.reset && echecsIp.n > 60)
    return res.status(429).json({ error: 'Trop d\'essais infructueux — réessaie dans une heure.' });
  const e = espaceAJour(slug);
  const t = e ? espaceT(e) : '';
  const refus = () => res.status(403).json({ error: 'Entreprise, identifiant ou mot de passe incorrect.' });
  /* Clé d'équipe périmée (constatée par /api/espaces/lien) : le code de l'annuaire ne
     déchiffre plus les données. Rendre « k » quand même ferait entrer la personne dans un
     espace vide, sans un mot d'explication. */
  if (e && e.slug && espacesReg[e.slug] && espacesReg[e.slug].clePerimee)
    return res.status(409).json({ motif: 'cle_perimee',
      error: 'L\'espace de cette entreprise est à réinscrire chez TEAM OP — contacte-nous, la connexion ne peut pas aboutir.' });
  const ann = (t && !entFermes.espaces.includes(t)) ? comptesReg[t] : null;
  /* « Pas encore activé » est rendu AUSSI pour un nom qui n'existe pas. Sans cela, la
     différence entre les deux réponses dirait qui est client de TEAM OP. Rendu pour les deux,
     le message ne dit rien de plus qu'il ne faut, et il évite qu'une personne s'acharne une
     heure sur un mot de passe pourtant juste. */
  if (!e || !e.code || !t || !ann || !ann.c || !Object.keys(ann.c).length)
    return res.status(409).json({ motif: 'sans-annuaire',
      error: 'Cette entreprise ne connaît pas encore la connexion par identifiant. Utilise son code d\'accès une première fois — ensuite, ton identifiant suffira.' });
  /* hasOwnProperty, et JAMAIS ann.c[login] directement : « ann.c » vient d'un JSON, c'est un
     objet ordinaire. ann.c['__proto__'] rend Object.prototype et ann.c['constructor'] rend la
     fonction Object — tous deux « truthy », dont le champ « e » vaut undefined. Buffer.from
     lève alors, hors du try, dans un gestionnaire async qu'Express 4 ne rattrape pas : le
     processus meurt. Une requête non authentifiée, un nom d'entreprise, et toute l'API tombe.
     Mesuré : « __proto__ » et « constructor » tuaient le serveur, les autres membres de
     Object.prototype survivaient au .toLowerCase(). */
  const brut = Object.prototype.hasOwnProperty.call(ann.c, login) ? ann.c[login] : null;
  /* Et on vérifie la FORME avant de s'en servir : un registre abîmé à la main ne doit pas
     pouvoir faire lever Buffer.from non plus. Ce qui ne ressemble pas à un vérificateur n'en
     est pas un — on le traite comme un identifiant inconnu. */
  const enr = (brut && typeof brut === 'object' && !Array.isArray(brut)
    && /^[0-9a-f]{32}$/.test(String(brut.s || '')) && /^[0-9a-f]{64}$/.test(String(brut.e || ''))) ? brut : null;
  /* Le calcul se fait TOUJOURS, même pour un identifiant inconnu, et sur un sel jetable :
     autrement le temps de réponse dirait quels identifiants existent dans l'entreprise. */
  let bon = false;
  try {
    const sel = Buffer.from(enr ? enr.s : crypto.randomBytes(16).toString('hex'), 'hex');
    const calc = await new Promise((ok, ko) =>
      crypto.pbkdf2(h, sel, CNX_ITER, 32, 'sha256', (err, d) => err ? ko(err) : ok(d)));
    if (enr) {
      const attendu = Buffer.from(enr.e, 'hex');
      bon = attendu.length === calc.length && crypto.timingSafeEqual(attendu, calc);
    }
  } catch (err) {
    // filet de dernier recours : cette route ne doit JAMAIS pouvoir emporter le processus
    console.error('connexion : vérification impossible —', err.message);
    return res.status(500).json({ error: 'Vérification impossible — réessaie.' });
  }
  if (!bon) {
    quotaOk(cnxQuota, 'ip:' + ip, 60, 3600000);   // c'est ici, et seulement ici, qu'un essai se compte
    /* Compté APRÈS vérification et par espace existant seulement — même raisonnement que
       /api/espaces/ouvrir : sinon n'importe qui verrouille un espace en tapant à côté. */
    if (cnxEchecs.size > 5000) cnxEchecs = new Map();
    const n = (cnxEchecs.get(t) || 0) + 1;
    cnxEchecs.set(t, n);
    if (n === 20) console.warn('connexion par identifiant : 20 échecs en une heure sur l\'espace', t);
    return refus();
  }
  /* Ce qu'on rend est le code de l'espace, amputé de « e » — l'adresse e-mail de l'entreprise
     est la coordonnée d'un tiers. « a » et « mh » restent, pour la même raison qu'à
     /api/espaces/ouvrir : sans « mh », un espace neuf s'ouvrirait avec sha256('1234'). */
  let rendu = codeMdpHache(e.code);
  try {
    const o = JSON.parse(Buffer.from(rendu, 'base64').toString('utf8'));
    delete o.e;
    rendu = Buffer.from(JSON.stringify(o), 'utf8').toString('base64').replace(/=+$/, '');
  } catch (err) {}
  // ni IP ni identifiant : l'identifiant d'équipe suffit à enquêter, le reste est personnel
  console.log('espace ouvert par identifiant · espace', t);
  res.json({ ok: true, code: rendu, nom: espNomPropre(e) });
});
/* espaces.json porte le « k » de TOUS les clients : une écriture tronquée (disque plein,
   service coupé au mauvais moment) les perd tous d'un coup. On écrit à côté puis on renomme,
   comme acces.json et comptes.json. Rend false plutôt que de lever, pour que l'appelant puisse
   revenir en arrière au lieu d'annoncer un enregistrement qui n'a pas eu lieu. */
function espacesEcrire() {
  try {
    const tmp = ESPACES_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(espacesReg));
    fs.renameSync(tmp, ESPACES_PATH);
    return true;
  } catch (e) { console.error('espaces.json non écrit :', e.message); return false; }
}
/* ══ LES APPLICATIONS OUVERTES À UNE ENTREPRISE ═════════════════════════════════════════════
   OP MESSAGES est sorti des formules d'OP GESTION : ce n'est plus une case d'un forfait, c'est
   une application à part qu'on ouvre à qui la demande. Une seule route, un seul drapeau — pas
   de seconde liste à tenir à jour à côté de l'annuaire, qui finirait par diverger.
   Ce que ça change chez le client : la rangée « SUITE » d'OP GESTION n'apparaît que si c'est
   ouvert. Fermé, OP GESTION redevient OP GESTION, et rien d'autre. */
app.post('/api/monitor/espaces/apps', monPatronStrict, (req, res) => {
  const slug = espSlug(monStr((req.body || {}).slug || (req.body || {}).nom, 80));   // borné : voir /api/espaces/ouvrir
  const e = espaceAJour(slug);
  const t = e ? espaceT(e) : '';
  if (!e || !t) return res.status(404).json({ error: 'Espace inconnu, ou sans identifiant d\'équipe lisible' });
  /* On écrit sur l'entrée VIVANTE du registre, pas sur la copie que rend espaceAJour — c'est
     exactement l'erreur qui avait rendu le code d'accès invisible côté serveur. */
  const vraiSlug = e.slug || slug;
  if (!espacesReg[vraiSlug]) return res.status(500).json({ error: 'Entrée d\'annuaire introuvable' });
  /* Comparaison stricte, pas « !! » : avec un booléen relâché, {"opMessages":"false"} OUVRAIT
     l'application. Sur une option facturée à part, la direction de l'échec doit être la
     fermeture, jamais l'ouverture. */
  const veut = (req.body || {}).opMessages === true;
  const avant = espacesReg[vraiSlug].opMessages;
  if (veut) espacesReg[vraiSlug].opMessages = true; else delete espacesReg[vraiSlug].opMessages;
  if (!espacesEcrire()) {
    if (avant) espacesReg[vraiSlug].opMessages = avant; else delete espacesReg[vraiSlug].opMessages;
    return res.status(500).json({ error: 'Enregistrement impossible — rien n\'a changé.' });
  }
  console.log('Tour :', req.tourUser.nom, (veut ? 'ouvre' : 'ferme'), 'OP MESSAGES pour l\'espace', t);
  res.json({ ok: true, slug: vraiSlug, opMessages: veut });
});
/* ══ L'ÉTAT D'OP MESSAGES ══════════════════════════════════════════════════════════════════
   L'application est en travaux : ses collections sont sorties du projet elan-gestion, la bascule
   vers son propre projet attend une configuration web. La Tour OP MESSAGES le dit tel quel — on
   n'invente pas de chiffres pour remplir un écran, l'état explicite EST l'information. Le jour de
   la bascule, le patron le déclare ici, et l'accueil cesse d'afficher « en travaux ». Sans fichier,
   c'est en travaux : on ne prétend jamais qu'elle marche. */
const OPMSG_PATH = path.join(DATA_DIR, 'opmessages.json');
const OPMSG_DEFAUT = { enTravaux: true, depuis: '2026-09-10', note: 'Les collections sont sorties du projet elan-gestion ; bascule vers le projet OP MESSAGES en attente de sa configuration web.', projet: '' };
function opmsgLire() {
  let d = null; try { d = JSON.parse(fs.readFileSync(OPMSG_PATH, 'utf8')); } catch (e) {}
  const e = Object.assign({}, OPMSG_DEFAUT, d && typeof d === 'object' ? d : {});
  e.enTravaux = e.enTravaux !== false;   // comparaison stricte, même raison que /espaces/apps : seul un vrai « false » sort des travaux
  return e;
}
function opmsgOuvertes() {   // entreprises où OP MESSAGES est ouverte, une fois chacune
  const vus = new Set();
  for (const e of Object.values(espacesReg)) { if (e && e.opMessages === true) { const t = espaceT(e); if (t) vus.add(t); } }
  return vus.size;
}
app.get('/api/monitor/messages/etat', monAdmin, (req, res) => {
  const e = opmsgLire();
  res.json({ ok: true, enTravaux: e.enTravaux, depuis: e.depuis, note: e.note, projet: monStr(e.projet, 80), entreprisesOuvertes: opmsgOuvertes(), par: monStr(e.par, 60), ts: e.ts || 0 });
});
app.post('/api/monitor/messages/etat', monPatronStrict, (req, res) => {
  const b = req.body || {};
  const enTravaux = b.enTravaux !== false;
  const projet = monStr(b.projet, 80).trim();
  // sortir des travaux sans projet, c'est prétendre qu'elle marche sans savoir où
  if (!enTravaux && !/^[a-z0-9][a-z0-9-]{3,79}$/.test(projet)) return res.status(400).json({ error: 'nom du projet requis (minuscules, chiffres, tirets) pour sortir des travaux' });
  const avant = opmsgLire();
  const etat = { enTravaux, depuis: avant.depuis, note: avant.note, projet: projet || (enTravaux ? monStr(avant.projet, 80) : ''), par: req.tourUser.nom, ts: Date.now() };
  try { fs.writeFileSync(OPMSG_PATH + '.tmp', JSON.stringify(etat)); fs.renameSync(OPMSG_PATH + '.tmp', OPMSG_PATH); } catch (e) { return res.status(500).json({ error: 'Enregistrement impossible — rien n\'a changé.' }); }
  console.log('Tour :', req.tourUser.nom, enTravaux ? 'remet OP MESSAGES en travaux' : 'déclare OP MESSAGES en service sur le projet ' + projet);
  res.json({ ok: true, enTravaux, projet: etat.projet, entreprisesOuvertes: opmsgOuvertes() });
});
/* ══ RENOMMER UN ESPACE — donc changer son ADRESSE ══════════════════════════════════════════
   Le nom de l'espace n'est pas décoratif : c'est teamop.fr/ce-nom, l'adresse que l'entreprise
   donne à ses équipes et met en favori. La changer se fait donc les yeux ouverts — l'ancienne
   cesse de fonctionner le jour même. Le nom voyage aussi DANS le code de l'espace (champ « n »),
   que l'application affiche : on le met à jour, sinon l'écran de connexion garderait l'ancien.
   Les appareils déjà connectés ne bougent pas : eux ne se servent que de « t » et « k ». */
app.post('/api/monitor/espaces/renommer', monPatronStrict, (req, res) => {
  const slug = espSlug(monStr((req.body || {}).slug || (req.body || {}).nom, 80));
  /* espaceAJour, PAS espacesReg[slug] : un même espace porte plusieurs noms dans l'annuaire
     (voir espaceParT) et c'est l'entrée la plus récente qui fait foi. Lire l'entrée du slug
     tapé renommait une entrée pendant que le serveur en servait une autre — le renommage
     répondait « fait » et l'ancien nom continuait de marcher. Mesuré par le gardien. */
  const e = espaceAJour(slug);
  if (!e || !e.code) return res.status(404).json({ error: 'Espace inconnu' });
  const nom = monStr((req.body || {}).nouveau, 80).trim();
  const neufSlug = espSlug(nom);
  if (!nom || !neufSlug) return res.status(400).json({ error: 'Il faut un nom qui contienne des lettres ou des chiffres' });
  const t = espaceT(e);
  if (!t) return res.status(409).json({ error: 'Cet espace n\'a pas d\'identifiant d\'équipe lisible : impossible de le renommer sans risque.' });
  const occupe = espacesReg[neufSlug];
  if (occupe && espaceT(occupe) !== t)
    return res.status(409).json({ error: 'teamop.fr/' + neufSlug + ' est déjà l\'adresse d\'une autre entreprise — choisis une variante.' });
  let code = e.code;
  try {
    const o = JSON.parse(Buffer.from(e.code, 'base64').toString('utf8'));
    /* Même garde qu'à /identifiants : sans « use strict », écrire sur un primitif échoue en
       silence et on réenregistrerait un code sans « t » ni « k » — données perdues. */
    if (o && typeof o === 'object' && !Array.isArray(o) && o.t && o.k) {
      o.n = nom;
      code = Buffer.from(JSON.stringify(o), 'utf8').toString('base64').replace(/=+$/, '');
    }
  } catch (err) {}
  /* TOUS les anciens noms de cet espace s'en vont : sans cela « l'ancienne adresse cesse de
     fonctionner » serait faux, et l'écran de la Tour le promet. */
  const anciens = Object.keys(espacesReg).filter(x => x !== neufSlug && espaceT(espacesReg[x]) === t);
  const avant = {}; anciens.concat([neufSlug]).forEach(x => { avant[x] = espacesReg[x]; });
  anciens.forEach(x => { delete espacesReg[x]; });
  const copie = Object.assign({}, e, { nom, code });
  delete copie.slug;   // espaceAJour peut rendre une copie porteuse de « slug » : il n'a rien à faire dans l'annuaire
  espacesReg[neufSlug] = copie;
  if (!espacesEcrire()) {
    // remise en place exacte : sinon le serveur servirait le nouveau nom jusqu'au redémarrage
    Object.keys(avant).forEach(x => { if (avant[x] === undefined) delete espacesReg[x]; else espacesReg[x] = avant[x]; });
    return res.status(500).json({ error: 'Enregistrement impossible — rien n\'a changé.' });
  }
  console.log('Tour :', req.tourUser.nom, 'renomme l\'espace', t, '→', neufSlug, '(' + anciens.length + ' ancien(s) nom(s) retiré(s))');
  res.json({ ok: true, slug: neufSlug, nom, anciens: anciens.length, adresse: 'https://teamop.fr/e/' + neufSlug, lien: lienEspaceCode(copie) });
});
/* ══ SUSPENDRE OU ROUVRIR UN ACCÈS, DEPUIS LA TOUR ══════════════════════════════════════════
   Couper un accès sans rien effacer. C'est le pendant de « Couper » sur un accès bêta, et la
   différence compte : ici l'espace porte de vraies données. Suspendre les LAISSE en place —
   côté Firestore rien n'est touché — mais les appareils reliés se vident à leur prochain
   lancement (forfaitServeurSync lit « ferme » et efface le stockage local). Rouvrir rend
   l'espace ; les appareils devront repasser par le lien ou le code, leurs données les y
   attendent. Effacer pour de bon, c'est « Repartir à neuf » (/renaitre), pas cette route. */
app.post('/api/monitor/espaces/suspendre', monPatronStrict, (req, res) => {
  const slug = espSlug(monStr((req.body || {}).slug || (req.body || {}).nom, 80));
  const e = espaceAJour(slug);
  const t = e ? espaceT(e) : '';
  if (!e || !t) return res.status(404).json({ error: 'Espace inconnu, ou sans identifiant d\'équipe lisible' });
  const rouvrir = !!(req.body || {}).rouvrir;
  /* DEUX états, pas un. « entFermes.espaces » sert aussi à la FERMETURE DÉFINITIVE d'une
     entreprise (/api/monitor/clients/retirer), qui exige un code de confirmation par e-mail.
     Sans liste à part, « Rouvrir » défaisait cette fermeture-là en un clic — et rendait à
     nouveau le lien porteur de « k ». On ne rouvre donc que ce qu'on a suspendu d'ici. */
  if (!Array.isArray(entFermes.suspendus)) entFermes.suspendus = [];
  if (rouvrir && !entFermes.suspendus.includes(t))
    return res.status(409).json({ error: 'Cet espace n\'a pas été suspendu depuis la Tour : il a été fermé définitivement (fermeture d\'entreprise). Ce bouton ne défait pas une fermeture — elle demande un code de confirmation par e-mail.' });
  const avant = entFermes.espaces.slice(), avantS = entFermes.suspendus.slice();
  if (rouvrir) {
    entFermes.espaces = entFermes.espaces.filter(x => x !== t);
    entFermes.suspendus = entFermes.suspendus.filter(x => x !== t);
  } else {
    if (!entFermes.espaces.includes(t)) entFermes.espaces.push(t);
    if (!entFermes.suspendus.includes(t)) entFermes.suspendus.push(t);
  }
  /* Si l'écriture échoue, on ne dit pas que c'est fait : le serveur appliquerait la coupure
     jusqu'au redémarrage, puis l'oublierait — et le patron croirait l'accès fermé. */
  if (!fermesSave()) { entFermes.espaces = avant; entFermes.suspendus = avantS; return res.status(500).json({ error: 'Rien n\'a été enregistré — réessaie.' }); }
  console.log('Tour :', req.tourUser.nom, (rouvrir ? 'rouvre' : 'suspend'), 'l\'espace', t);
  res.json({ ok: true, suspendu: !rouvrir });
});
app.post('/api/espaces/relance', (req, res) => {
  // borné AVANT espSlug : son normalize('NFD') sur 6 Mo gèle la boucle d'événements, donc toute l'API
  const slug = espSlug(monStr((req.body || {}).nom, 80));
  if (!slug) return res.status(400).json({ error: 'Indique le nom de ton entreprise' });
  const ip = req.ip || '?';   // req.ip, jamais l'en-tête brut : nginx AJOUTE à la valeur reçue, donc .split(',')[0] rend celle de l'appelant
  if (!quotaOk(relanceQuota, 'ip:' + String(ip).split(',')[0].trim(), 10, 3600000))
    return res.status(429).json({ error: 'Trop de demandes — réessaie dans une heure' });
  /* La réponse part AVANT l'envoi : ni le texte ni le délai ne doivent laisser deviner
     si l'entreprise est cliente de TEAM OP. */
  res.json({ ok: true, envoye: true });
  const e = espaceAJour(slug);
  if (!e || !e.email || !e.code || e.clePerimee || !mailer) return;
  if (!quotaOk(relanceQuota, 'esp:' + slug, 5, 3600000)) return;
  const lien = lienEspaceCode(e);
  const nom = espNomPropre(e) || e.nom || '';
  const entTxt = nom ? ' « ' + nom + ' »' : '';
  const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  mailerEnvoi({
    confidentiel: true, trace: 'relance du lien de connexion · espace ' + slug,
    from: config.smtp.from || config.smtp.user, to: e.email,
    subject: '🔗 Votre lien de connexion — TEAM OP',
    text: 'Bonjour,\n\nQuelqu\'un vient de demander le lien de connexion de votre entreprise'
      + entTxt + ' sur teamop.fr.\n\nVotre lien :\n' + lien + '\n\n'
      + 'Ouvrez-le sur l\'appareil à connecter, puis entrez votre identifiant et votre mot de passe.\n'
      + 'Ce lien donne accès aux données de l\'entreprise : ne le transmettez qu\'à vos employés.\n\n'
      + 'Si vous n\'êtes à l\'origine d\'aucune demande, ignorez ce message — rien n\'a changé.\n\n— TEAM OP · teamop.fr',
    html: mailTeamOP({
      chip: 'Lien de connexion',
      titre: 'Votre lien de connexion 🔗',
      corpsHtml: 'Bonjour,<br>quelqu\'un vient de demander le lien de connexion de votre entreprise'
        + x(entTxt) + ' sur teamop.fr.<br><br><b>Votre lien :</b><br>'
        + '<a href="' + x(lien) + '" style="color:#34A97E;word-break:break-all">' + x(lien.replace('https://', '')) + '</a><br><br>'
        + '<span style="font-size:13px">Ouvrez-le sur l\'appareil à connecter, puis entrez votre identifiant et votre mot de passe.<br>'
        + 'Ce lien donne accès aux données de l\'entreprise : <b>ne le transmettez qu\'à vos employés</b>.</span><br><br>'
        + '<span style="color:#8fa3c8;font-size:13px">Si vous n\'êtes à l\'origine d\'aucune demande, ignorez ce message — rien n\'a changé.</span>',
      boutonTxt: 'Ouvrir mon application', boutonUrl: lien,
      bouton2Txt: 'Mon espace client', bouton2Url: 'https://teamop.fr/espace.html'
    })
  }).catch((err) => console.error('relance lien', slug, ':', String(err && err.message || err).slice(0, 120)));
});
/* Disponibilité d'un nom de lien, pour le formulaire d'inscription : un oui/non, rien d'autre. */
app.post('/api/espaces/libre', (req, res) => {
  const slug = espSlug(monStr((req.body || {}).nom, 80));   // borné : voir /api/espaces/ouvrir
  if (!slug) return res.status(400).json({ error: 'Indique un nom' });
  /* OUI, c'est un oracle : cette route dit publiquement si une entreprise est déjà cliente de
     TEAM OP. C'est assumé — le formulaire d'inscription en a besoin pour refuser un nom déjà
     pris avant que la personne ait tout saisi. Mais il faut le savoir : le message uniforme de
     /api/espaces/ouvrir ne cache donc PAS la clientèle, il cache seulement le code. Le jour où
     l'on voudra vraiment la cacher, c'est ici qu'il faudra un jeton de formulaire, pas là-bas. */
  res.json({ ok: true, libre: !espacesReg[slug] });
});
/* « Ce nom est-il celui de l'équipe t ? » — pour un appareil déjà dans l'espace t, qui
   fait confirmer à son porteur qu'il tape bien le nom de SON entreprise. Le booléen ne
   révèle rien : il faut déjà connaître t, et t seul ne mène à aucun nom. */
app.post('/api/espaces/verifie-nom', (req, res) => {
  const t = monStr((req.body || {}).t, 80), slug = espSlug(monStr((req.body || {}).nom, 80));
  if (!t || !slug) return res.status(400).json({ error: 't et nom requis' });
  const tEsp = espaceT(espaceAJour(slug));
  res.json({ ok: true, correspond: !!tEsp && tEsp === t });
});
/* Le lien de connexion d'un espace (teamop.fr/app.html#entreprise=CODE), pour l'application de l'entreprise :
   t = identifiant d'équipe, kh = empreinte SHA-256 de la clé d'équipe (jamais la clé elle-même).
   Le nom et le lien ne sont rendus QUE si l'empreinte est celle de la clé de l'annuaire : sans
   preuve de clé, rien n'est révélé (un identifiant d'équipe seul ne doit mener à aucun nom). */
const lienQuota = new Map();
app.post('/api/espaces/lien', (req, res) => {
  const t = monStr((req.body || {}).t, 80), kh = monStr((req.body || {}).kh, 64).toLowerCase();
  if (!t || !/^[0-9a-f]{64}$/.test(kh)) return res.status(400).json({ error: 't et kh requis' });
  const q = lienQuota.get(t) || { n: 0, reset: Date.now() + 3600000 };
  if (Date.now() > q.reset) { q.n = 0; q.reset = Date.now() + 3600000; }
  if (++q.n > 30) return res.status(429).json({ error: 'trop de demandes — réessaie plus tard' });
  lienQuota.set(t, q);
  const e = espaceParT(t);
  const refus = () => res.status(404).json({ error: 'lien lisible pas encore activé pour cet espace' });
  if (!e || !e.slug || !e.code) return refus();
  let cleAnn = '', identAdmin = '';
  try { const o = JSON.parse(Buffer.from(e.code, 'base64').toString('utf8')); cleAnn = String(o.k || ''); identAdmin = String(o.a || ''); } catch (err) {}
  if (!cleAnn) return refus();
  if (crypto.createHash('sha256').update(cleAnn).digest('hex') !== kh) {
    // l'appareil a une autre clé que l'annuaire : le code de l'annuaire est périmé → le site cesse de le servir
    if (!espacesReg[e.slug].clePerimee) { espacesReg[e.slug].clePerimee = Date.now(); try { fs.writeFileSync(ESPACES_PATH, JSON.stringify(espacesReg)); } catch (err) {} lastRefus = { ts: Date.now(), raison: 'clé d\'équipe changée pour un espace inscrit — à réinscrire dans la Tour (le journal dit lequel)' }; console.warn('espace', e.slug, ': clé d\'équipe changée — lien de l\'annuaire périmé'); }
    return res.status(404).json({ error: 'la clé d\'équipe a changé depuis l\'inscription chez TEAM OP — l\'espace est à réinscrire dans la Tour', motif: 'cle_changee' });
  }
  if (espacesReg[e.slug].clePerimee) { delete espacesReg[e.slug].clePerimee; try { fs.writeFileSync(ESPACES_PATH, JSON.stringify(espacesReg)); } catch (err) {} }
  // identAdmin : l'identifiant déclaré administrateur à la création de l'espace. Il n'est rendu
  // qu'ici, c'est-à-dire contre une preuve de possession de la clé d'équipe — jamais par une
  // route ouverte. L'application s'en sert pour qu'un patron ne puisse pas être déclassé.
  /* Le lien rendu porte le code, pas le nom : celui qui le reçoit a prouvé qu'il détient
     la clé d'équipe, mais le lien qu'il ira coller ne doit se deviner par personne. */
  res.json({ ok: true, slug: e.slug, nom: espNomPropre(e), lien: lienEspaceCode(e), cleOk: true, nomExact: espSlug(e.nom) === e.slug, identAdmin });
});

// ── Fermeture totale d'une entreprise (patron) : code de confirmation par e-mail,
//    puis retrait de la liste, du nom, du lien, de la formule — et les applications
//    des appareils reliés se vident toutes seules à leur prochain lancement. ──
const FERMES_PATH = path.join(DATA_DIR, 'entreprises-fermees.json');
let entFermes = { emails: [], espaces: [], suspendus: [] };
try { entFermes = JSON.parse(fs.readFileSync(FERMES_PATH, 'utf8')); } catch (e) {}
/* Les fichiers d'avant la suspension depuis la Tour n'ont pas ce champ. Vide et non
   « tout » : ce qui s'y trouvait déjà vient d'une fermeture d'entreprise, et ne doit
   surtout pas devenir réouvrable d'un clic. */
if (!Array.isArray(entFermes.emails)) entFermes.emails = [];
if (!Array.isArray(entFermes.espaces)) entFermes.espaces = [];
if (!Array.isArray(entFermes.suspendus)) entFermes.suspendus = [];
function fermesSave() { try { fs.writeFileSync(FERMES_PATH, JSON.stringify(entFermes)); return true; } catch (e) { console.error('entreprises-fermees.json non écrit :', e.message); return false; } }
/* ══ LA VERSION MINIMALE ET LE MODE EN LIGNE — réglés depuis la Tour, 9 septembre 2026 ══
   Ce qui a détruit les comptes d'ELAN : un appareil en vieille version qui réécrit toute la base
   toutes les deux minutes. On ne met pas à jour un appareil qu'on ne tient pas ; on lui ferme la
   porte. `min` est le numéro de version en dessous duquel le nuage refuse d'écrire — la règle
   Firestore le lit dans teamop_config/version, que ce serveur écrit avec sa clé d'administration.
   L'application le lit aussi ici (/api/version) pour se bloquer avant même de tenter.
   `enLigne` ne vaut plus que « enLigne » : l'application ne travaille qu'en ligne, sans option
   (Justin, 9 septembre 2026 : « on oublie le hors ligne complètement »). Le champ reste rendu
   pour les v616 qui le lisent encore. */
const VERSIONS_PATH = path.join(DATA_DIR, 'versions.json');
let versionsCfg = { min: 0, enLigne: 'enLigne', maj: 0, par: '' };
try { Object.assign(versionsCfg, JSON.parse(fs.readFileSync(VERSIONS_PATH, 'utf8')) || {}); } catch (e) {}
versionsCfg.min = Math.max(0, parseInt(versionsCfg.min, 10) || 0);
versionsCfg.enLigne = 'enLigne';   // plus d'autre valeur possible
function versionsSave() { try { const tmp = VERSIONS_PATH + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(versionsCfg)); fs.renameSync(tmp, VERSIONS_PATH); return true; } catch (e) { console.error('versions.json non écrit :', e.message); return false; } }
/* Le document que la règle de sécurité lit. Écrit par la clé admin (qui passe outre les règles) ;
   sans clé, le réglage vit quand même côté serveur — l'application s'y conforme d'elle-même,
   seule la porte du nuage reste ouverte aux versions d'avant. */
async function versionsPousserFirestore() {
  const tok = await fbAdminJeton();
  if (!tok) return { fait: false, motif: 'clé admin absente sur le serveur' };
  try {
    const r = await fbAdminFetch(fsBase() + '/teamop_config/version?updateMask.fieldPaths=min&updateMask.fieldPaths=maj',
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { min: { integerValue: String(versionsCfg.min) }, maj: { integerValue: String(versionsCfg.maj || 0) } } }) }, tok);
    if (!r.ok) { const t = await r.text().catch(() => ''); console.error('teamop_config/version : Firestore répond', r.status, t.slice(0, 120)); return { fait: false, motif: 'Firestore répond ' + r.status }; }
    return { fait: true };
  } catch (e) { console.error('teamop_config/version :', e.message); return { fait: false, motif: e.message }; }
}
/* La version réellement en ligne : on va la lire sur teamop.fr. C'est ce que la Tour affiche et ce
   que « Exiger la dernière version » exige.
   Le cache était d'un quart d'heure : après une publication, la Tour annonçait encore l'ancienne
   version pendant quinze minutes — et surtout « Exiger la dernière version » exigeait ce chiffre
   périmé, sans le dire. Signalé par Justin le 10 septembre 2026, la Tour montrant v625 alors que
   teamop.fr servait v626. Une minute suffit : cette route n'est appelée que par la Tour, c'est-à-dire
   par le patron, quelques fois par jour — et « Exiger » relit toujours, sans cache (frais). */
const versionLigne = { v: 0, ts: 0, encours: null };
function versionEnLigne(frais) {
  if (!frais && versionLigne.v && Date.now() - versionLigne.ts < 60000) return Promise.resolve(versionLigne.v);
  if (versionLigne.encours) return versionLigne.encours;   // une lecture est déjà en cours : elle est fraîche par construction
  versionLigne.encours = (async () => {
    try {
      const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch('https://teamop.fr/app.html', { signal: ctrl.signal, headers: { 'Cache-Control': 'no-cache' } });
      clearTimeout(tm);
      const t = r.ok ? await r.text() : '';
      const m = /const APP_VERSION = '([0-9]+)'/.exec(t);
      if (m) { versionLigne.v = parseInt(m[1], 10) || 0; versionLigne.ts = Date.now(); }
    } catch (e) { console.error('version en ligne illisible :', e.message); }
    versionLigne.encours = null;
    return versionLigne.v;
  })();
  return versionLigne.encours;
}
/* Public et sans espace : un numéro et un mode, rien d'autre. L'application l'appelle au
   démarrage, à chaque retour au premier plan, et tous les quarts d'heure. */
app.get('/api/version', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, min: versionsCfg.min, enLigne: versionsCfg.enLigne });
});
app.get('/api/monitor/version', monAdmin, async (req, res) => {
  const enLigne = await versionEnLigne();
  /* Qui est encore en dessous : par espace, les appareils DISTINCTS vus sur 7 jours avec une
     version inférieure au minimum — c'est la liste de ceux que la porte bloque. */
  const j7 = Date.now() - 7 * 86400000; const sous = [];
  for (const t of Object.keys(cnxData)) {
    const devs = new Map();
    for (const x of (cnxData[t] || [])) { if ((x.ts || 0) < j7 || !x.dev) continue; const v = parseInt(String(x.version || '').replace(/[^0-9]/g, ''), 10) || 0; if (!devs.has(x.dev) || (x.ts || 0) > devs.get(x.dev).ts) devs.set(x.dev, { v, ts: x.ts || 0 }); }
    let n = 0; for (const d of devs.values()) if (versionsCfg.min && d.v < versionsCfg.min) n++;
    if (n) { const e = espaceParT(t); sous.push({ t, nom: e ? espNomPropre(e) : '', n }); }
  }
  res.json({ ok: true, min: versionsCfg.min, enLigne: versionsCfg.enLigne, maj: versionsCfg.maj || 0, par: versionsCfg.par || '', versionEnLigne: enLigne, sous, cleAdmin: !!fbAdminCle });
});
app.post('/api/monitor/version-min', monPatronStrict, async (req, res) => {
  const b = req.body || {};
  let min = parseInt(b.min, 10);
  /* « Exiger la dernière version » : celle qui est SERVIE à l'instant, jamais un reste de cache.
     Si teamop.fr n'a pas pu être lu, on refuse : exiger un numéro périmé, c'est bloquer les appareils
     déjà à jour et laisser passer ceux qu'on voulait pousser — une erreur muette et coûteuse. */
  if (b.min === 'ligne') {
    min = await versionEnLigne(true);
    if (!min || Date.now() - versionLigne.ts > 60000) return res.status(503).json({ error: 'La version en ligne n\'a pas pu être lue sur teamop.fr — réessaie dans un instant, ou tape le numéro à la main.' });
  }
  if (!isFinite(min) || min < 0 || min > 99999) return res.status(400).json({ error: 'min : un entier entre 0 et 99999, ou « ligne »' });
  const enLigne = 'enLigne';   // le hors ligne n'est plus une option : le paramètre est ignoré
  versionsCfg.min = min; versionsCfg.enLigne = enLigne; versionsCfg.maj = Date.now(); versionsCfg.par = (req.tourUser && req.tourUser.nom) || '';
  if (!versionsSave()) return res.status(500).json({ error: 'réglage non enregistré' });
  const fsr = await versionsPousserFirestore();
  monLog((req.tourUser && req.tourUser.nom) || 'patron', true, req, 'version minimale v' + min + ' · ' + enLigne + (fsr.fait ? '' : ' · Firestore KO'));
  console.log('version minimale exigée :', min, '· mode', enLigne, '· Firestore', fsr.fait ? 'à jour' : ('NON (' + fsr.motif + ')'));
  res.json({ ok: true, min, enLigne, firestore: fsr });
});
const retraitCodes = new Map();   // email -> { code, exp, tries }
// retirer une entreprise de la liste (patron uniquement — pour les entrées de test ; tracé)
/* ── Clé d'administration Firebase (facultative) : /opt/teamop/firebase-admin.json ──
   Clé de compte de service (console Firebase → ⚙️ Paramètres du projet → Comptes de
   service → « Générer une nouvelle clé privée »). Quand elle est posée sur le serveur,
   la fermeture d'une entreprise supprime AUSSI son compte du site (espace client),
   sa fiche et sa messagerie — plus rien n'est enregistré nulle part. */
const FB_ADMIN_PATH = process.env.TEAMOP_FB_ADMIN || '/opt/teamop/firebase-admin.json';
let fbAdminCle = null;
try { fbAdminCle = JSON.parse(fs.readFileSync(FB_ADMIN_PATH, 'utf8')); } catch (e) {}
const fbAdminTok = { jeton: '', exp: 0 };
async function fbAdminJeton() {
  if (!fbAdminCle || !fbAdminCle.client_email || !fbAdminCle.private_key) return '';
  if (fbAdminTok.jeton && Date.now() < fbAdminTok.exp) return fbAdminTok.jeton;
  try {
    const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const jwtSans = b64u({ alg: 'RS256', typ: 'JWT' }) + '.' + b64u({
      iss: fbAdminCle.client_email, aud: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit',
      iat: now, exp: now + 3600 });
    const sig = crypto.createSign('RSA-SHA256').update(jwtSans).sign(fbAdminCle.private_key).toString('base64url');
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + jwtSans + '.' + sig });
    const j = await r.json().catch(() => ({}));
    if (!j.access_token) { console.error('clé admin firebase : jeton refusé', j.error || r.status); return ''; }
    fbAdminTok.jeton = j.access_token; fbAdminTok.exp = Date.now() + 50 * 60000;
    return j.access_token;
  } catch (e) { console.error('clé admin firebase :', e.message); return ''; }
}
const fsBase = () => 'https://firestore.googleapis.com/v1/projects/' + FB_PROJET + '/databases/(default)/documents';
async function fbAdminFetch(url, opts, tok) {
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 10000);
  try { return await fetch(url, Object.assign({}, opts, { headers: Object.assign({ 'Authorization': 'Bearer ' + tok }, (opts || {}).headers || {}), signal: ctrl.signal })); }
  finally { clearTimeout(tm); }
}
// supprime le compte du site (connexion) + fiche + messagerie d'un client — via la clé admin
async function fbSupprimerCompteSite(email) {
  const tok = await fbAdminJeton();
  if (!tok) return { fait: false, motif: 'clé admin absente sur le serveur' };
  try {
    const rl = await fbAdminFetch('https://identitytoolkit.googleapis.com/v1/projects/' + FB_PROJET + '/accounts:lookup',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: [email] }) }, tok);
    const jl = await rl.json().catch(() => ({}));
    const uid = jl.users && jl.users[0] && jl.users[0].localId;
    if (!uid) return { fait: false, motif: 'aucun compte du site avec cet e-mail' };
    let pageTok = '', n = 0;   // messagerie : les messages un par un, puis le fil, puis la fiche
    for (let tour = 0; tour < 20; tour++) {
      const rm = await fbAdminFetch(fsBase() + '/teamop_threads/' + uid + '/msgs?pageSize=300' + (pageTok ? '&pageToken=' + encodeURIComponent(pageTok) : ''), { method: 'GET' }, tok);
      const jm = await rm.json().catch(() => ({}));
      for (const d of (jm.documents || [])) { await fbAdminFetch('https://firestore.googleapis.com/v1/' + d.name, { method: 'DELETE' }, tok); n++; }
      pageTok = jm.nextPageToken || ''; if (!pageTok) break;
    }
    await fbAdminFetch(fsBase() + '/teamop_threads/' + uid, { method: 'DELETE' }, tok);
    await fbAdminFetch(fsBase() + '/teamop_requests/' + uid, { method: 'DELETE' }, tok);
    const rd = await fbAdminFetch('https://identitytoolkit.googleapis.com/v1/projects/' + FB_PROJET + '/accounts:delete',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: uid }) }, tok);
    if (!rd.ok) return { fait: false, motif: 'suppression du compte refusée (HTTP ' + rd.status + ')' };
    return { fait: true, motif: 'compte du site + fiche + messagerie supprimés (' + n + ' message(s))' };
  } catch (e) { return { fait: false, motif: String(e.message).slice(0, 120) }; }
}
/* Met à jour la fiche « Mon espace » du client (Firestore, via la clé admin) :
   demande acceptée → badge « Accès activé », application OP GESTION active,
   abonnement affiché. Sans la clé admin, on passe silencieusement. */
async function fbMajFicheClient(email, champs) {
  const tok = await fbAdminJeton();
  if (!tok) return false;
  try {
    const rl = await fbAdminFetch('https://identitytoolkit.googleapis.com/v1/projects/' + FB_PROJET + '/accounts:lookup',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: [email] }) }, tok);
    const jl = await rl.json().catch(() => ({}));
    const uid = jl.users && jl.users[0] && jl.users[0].localId;
    if (!uid) return false;
    const fields = {};
    for (const [k, v] of Object.entries(champs)) {
      fields[k] = Array.isArray(v) ? { arrayValue: { values: v.map(x => ({ stringValue: String(x) })) } } : { stringValue: String(v) };
    }
    const mask = Object.keys(champs).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
    const r = await fbAdminFetch(fsBase() + '/teamop_requests/' + uid + '?' + mask,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) }, tok);
    if (r.ok) console.log('fiche espace client mise à jour →', masqueMail(email), Object.keys(champs).join(','));
    else console.error('fiche espace client HTTP', r.status, '→', masqueMail(email));
    return r.ok;
  } catch (e) { console.error('fiche espace client :', e.message); return false; }
}
const FORMULE_LBL = { gratuit: 'Gratuit', pro: 'Pro', business: 'Business', premium: 'Business Premium' };
app.post('/api/monitor/clients/retirer', monPatronStrict, async (req, res) => {
  const email = monStr((req.body || {}).email, 120).toLowerCase();
  if (!clientsData[email]) return res.status(404).json({ error: 'entreprise introuvable' });
  const codeRecu = monStr((req.body || {}).code, 10).trim();
  if (!codeRecu) {   // 1er temps : on envoie le code de confirmation au patron
    if (!mailer) return res.status(503).json({ error: 'e-mail non configuré — impossible d\'envoyer le code' });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    retraitCodes.set(email, { code, exp: Date.now() + 10 * 60000, tries: 0 });
    const dest = config.notifDemandes || config.smtp.from || config.smtp.user;
    try {
      await mailerEnvoi({ from: config.smtp.from || config.smtp.user, to: dest,
        /* Comme pour la suppression totale : le code n'échappait au journal des e-mails que
           parce que mailerEnvoi teste /code/i sur l'objet. Reformuler cet objet ferait tomber
           un code à 6 chiffres dans un fichier lisible en monAdmin. On le dit explicitement
           plutôt que de dépendre d'un mot. */
        confidentiel: true, trace: 'code de fermeture d\'entreprise · ' + masqueMail(email),
        subject: '🗑 Code de confirmation — fermeture de « ' + (clientsData[email].entreprise || email) + ' »',
        text: 'Tu es sur le point de FERMER DÉFINITIVEMENT l\'entreprise « ' + (clientsData[email].entreprise || email) + ' » (' + email + ').\n\nCode de confirmation : ' + code + '\n\nValable 10 minutes. Après validation : plus de nom, plus de lien, plus de formule, et les applications de ses appareils se vident à leur prochain lancement.\nSi ce n\'est pas toi, ignore ce message.' });
    } catch (e) { return res.status(500).json({ error: 'envoi du code impossible : ' + String(e.message).slice(0, 120) }); }
    console.log('Tour : code de fermeture envoyé pour', masqueMail(email), '→', masqueMail(dest));
    return res.json({ ok: true, codeEnvoye: true, dest: masqueMail(dest) });
  }
  const c = retraitCodes.get(email);
  if (!c || Date.now() > c.exp) { retraitCodes.delete(email); return res.status(400).json({ error: 'code expiré — recommence' }); }
  c.tries++; if (c.tries > 5) { retraitCodes.delete(email); return res.status(429).json({ error: 'trop d\'essais — recommence' }); }
  if (codeRecu !== c.code) return res.status(400).json({ error: 'code incorrect (' + (6 - c.tries) + ' essai(s) restants)' });
  retraitCodes.delete(email);
  // fermeture effective : liste, annuaire (nom + lien + formule), et blocage des espaces reliés
  if (!entFermes.emails.includes(email)) entFermes.emails.push(email);
  const espacesAEffacer = [];
  for (const [slug, e] of Object.entries(espacesReg)) {
    if ((e.email || '').toLowerCase() === email) {
      let t = e.t;
      try { if (!t) t = String(JSON.parse(Buffer.from(e.code, 'base64').toString('utf8')).t || ''); } catch (err) {}
      if (t) { if (!entFermes.espaces.includes(t)) entFermes.espaces.push(t); espacesAEffacer.push(t);
        delete accesReg[t]; delete comptesReg[t]; }   // le code d'accès ET l'annuaire de connexion s'en vont avec l'espace, sinon ils ouvrent encore
      delete espacesReg[slug];
    }
  }
  /* Les trois écritures se testent. Un disque plein les fait échouer ENSEMBLE : sans ce contrôle,
     la route répondait « fermée » pendant que rien n'était écrit, et au redémarrage l'entreprise
     revenait, code d'accès compris. On préfère dire que ça n'a pas marché. */
  let ecrit = true;
  try { fs.writeFileSync(ESPACES_PATH, JSON.stringify(espacesReg)); } catch (e) { ecrit = false; console.error('fermeture : espaces.json non écrit :', e.message); }
  if (!accesEcrire()) ecrit = false;
  if (!comptesEcrire()) ecrit = false;
  if (!fermesSave()) ecrit = false;
  if (!ecrit) return res.status(500).json({ error: 'La fermeture n\'a pas pu être enregistrée — rien n\'est garanti. Vérifie le serveur avant de recommencer.' });
  delete clientsData[email]; cliSave();
  // Effacement DÉFINITIF des données chiffrées de l'entreprise sur Firestore :
  // plus rien n'est enregistré, la place est libérée. (Les appareils reliés se
  // vident de toute façon au prochain lancement via le blocage entFermes.)
  const FB_CLE = (config.firebase && config.firebase.apiKey) || 'AIzaSyAbah03sO4f4LyNhvmig0Pn00lz1sHSpT8';
  let effaces = 0;
  // Les règles Firestore exigent un utilisateur connecté : jeton anonyme jetable,
  // supprimé sitôt l'effacement terminé.
  let jeton = '', jetonAdmin = false;
  if (espacesAEffacer.length) {
    jeton = await fbAdminJeton(); jetonAdmin = !!jeton;   // la clé admin passe au-dessus des règles
    if (!jeton) try {
      const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + FB_CLE,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"returnSecureToken":true}' });
      const j = await r.json().catch(() => ({}));
      jeton = j.idToken || '';
      if (!jeton) console.error('effacement firestore : jeton anonyme refusé (active la connexion Anonyme dans Firebase)');
    } catch (e) { console.error('effacement firestore jeton :', e.message); }
  }
  for (const t of espacesAEffacer) {
    try {
      const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch('https://firestore.googleapis.com/v1/projects/' + FB_PROJET + '/databases/(default)/documents/elan_teams/' + encodeURIComponent(t) + '?key=' + FB_CLE,
        { method: 'DELETE', headers: jeton ? { 'Authorization': 'Bearer ' + jeton } : {}, signal: ctrl.signal });
      clearTimeout(tm);
      if (r.ok) effaces++; else console.error('effacement firestore', t, ': HTTP', r.status);
    } catch (e) { console.error('effacement firestore', t, ':', e.message); }
  }
  if (jeton && !jetonAdmin) { try { await fetch('https://identitytoolkit.googleapis.com/v1/accounts:delete?key=' + FB_CLE,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: jeton }) }); } catch (e) {} }
  // et le compte créé sur le site (connexion espace client) : supprimé aussi, si la clé admin est là
  const compteSite = await fbSupprimerCompteSite(email);
  console.log('Tour :', req.tourUser.nom, 'a FERMÉ l\'entreprise', masqueMail(email), '— données effacées :', effaces + '/' + espacesAEffacer.length, '· compte du site :', compteSite.motif);
  res.json({ ok: true, supprime: true, espaces: espacesAEffacer.length, donneesEffacees: effaces, compteSite });
});

/* ══ SUPPRIMER UNE ENTREPRISE, PARTOUT ═══════════════════════════════════════════
   « Repartir à neuf » et « Fermer définitivement » existaient déjà, mais aucune des deux
   ne supprime tout, et l'une des deux ne supprime rien du tout à long terme :

   · /clients/retirer est indexée par E-MAIL et exige clientsData[email]. Un espace ouvert
     depuis la Tour, ou repéré par ses seules connexions, ne peut donc pas être supprimé.
   · /espaces/renaitre efface le document Firestore MAIS N'AJOUTE RIEN À entFermes. Or
     app.html (vers la ligne 5131) dit, au premier instantané : « équipe vide → on amorce
     avec nos données », et repousse toute sa base chiffrée. Le premier appareil qui rouvre
     REMET donc tout — sous un identifiant que l'annuaire ne connaît plus. C'est ainsi que
     naissent les « espaces hors annuaire » qu'on ne sait plus rattacher à personne.

   Ces deux routes-ci sont indexées par TEAMID : c'est la seule clé que toutes les sources
   partagent (l'annuaire connaît le slug, les comptes du site l'e-mail, les connexions rien
   d'autre que le t). Elles restent en place : celle-ci ne les remplace pas, elle couvre le
   cas qu'aucune ne couvre — « supprime tout, partout ».

   L'ORDRE DES OPÉRATIONS N'EST PAS ARBITRAIRE :
     1. entFermes EN PREMIER. C'est ce qui fait que /api/espaces/etat répond ferme:true et
        que les appareils se vident au lieu de repousser leurs données. Sans ça, tout le
        reste est défait par le premier client qui rouvre son application.
     2. Les boîtes mail ENSUITE. releveBoite() itère mailboxes toutes les 120 s : tant
        qu'elles sont là, le serveur continue de se connecter aux boîtes professionnelles
        d'une entreprise supprimée et de réécrire dans replies.jsonl ce qu'on vient d'en
        retirer. Elles portent aussi les mots de passe IMAP/SMTP en clair.
     3. Le reste dans n'importe quel ordre, mais l'annuaire EN DERNIER parmi les registres :
        il est le seul à relier nom, slug, teamId, e-mail et clé d'équipe. L'effacer d'abord
        rendrait le reste inatteignable. */

/* Résout TOUTES les identités d'un espace à partir de son seul teamId, et compte ce qu'il
   y a à perdre. Aucune écriture — c'est aussi ce qui alimente l'aperçu avant suppression,
   et ce qui permet de VÉRIFIER après coup que tout est bien parti. */
function entInventaire(t) {
  const slugs = [], emails = new Set(); let nom = '';
  for (const [slug, e] of Object.entries(espacesReg)) {
    if (espaceT(e) !== t) continue;
    slugs.push(slug);
    if (e.email) emails.add(String(e.email).toLowerCase());
    if (!nom) nom = espNomPropre(e) || '';
  }
  const boites = Object.entries(mailboxes).filter(([, b]) => b && b.teamId === t).map(([id]) => id);
  /* Les adresses qui peuvent figurer dans les archives de courrier : celles de l'annuaire,
     PLUS celle de la boîte reliée. Un espace hors annuaire n'a pas d'entrée dans espacesReg
     — c'est le cas précis pour lequel la route de suppression existe — mais il a souvent une
     boîte, et son adresse est exactement celle qu'on retrouve dans mails-envoyes.json.
     Ensemble SÉPARÉ de emails, qui pilote aussi la suppression du compte du site : on ne
     veut pas effacer un compte de site parce qu'une boîte porte la même adresse. */
  const adressesCourrier = new Set(emails);
  for (const [, b] of Object.entries(mailboxes)) if (b && b.teamId === t && b.email) adressesCourrier.add(String(b.email).toLowerCase());
  /* MAIS la déduplication des boîtes est scopée par teamId (voir /api/mailbox/connect) : la
     MÊME adresse peut vivre sous DEUX teamId à la fois, et rien ne purge jamais une entrée
     périmée. Le cas n'est pas tordu, c'est l'usage même de cette route : une entreprise dont
     l'espace a été recréé — ancien teamId devenu hors annuaire — et qui a rebranché sa boîte.
     Purger sur cette adresse effacerait les archives de son espace VIVANT, sans retour
     possible (tmp+rename, aucune copie). On les ÉCARTE de la purge et on le DIT : mieux vaut
     sous-purger et l'annoncer que sur-purger en silence. */
  const partagees = [...adressesCourrier].filter(a =>
    Object.values(mailboxes).some(b => b && b.teamId !== t && String(b.email || '').toLowerCase() === a));
  const aPurger = [...adressesCourrier].filter(a => partagees.indexOf(a) < 0);
  /* Un compte du site sous l'adresse d'une BOÎTE (donc hors annuaire) : la suppression n'y
     touche pas — on n'efface pas un compte dont on ne peut pas prouver l'appartenance. On le
     signale pour que « 0 compte du site » ne se lise pas comme « il n'en reste aucun ». */
  const comptesSiteHorsAnnuaire = Object.values(clientsData)
    .filter(c => c && !emails.has(String(c.email || '').toLowerCase()) && aPurger.indexOf(String(c.email || '').toLowerCase()) >= 0)
    .map(c => String(c.email).toLowerCase());
  const abos = Object.entries(subs).filter(([, x]) => x && x.teamId === t).map(([ep]) => ep);
  let bugs = 0;
  try { for (const l of fs.readFileSync(BUGS_PATH, 'utf8').trim().split('\n')) { try { const b = JSON.parse(l); if (b && b.team === t) bugs++; } catch (err) {} } } catch (err) {}
  let reponses = 0;
  try { for (const l of fs.readFileSync(REPLIES_PATH, 'utf8').trim().split('\n')) { try { const r = JSON.parse(l); if (r && r.teamId === t) reponses++; } catch (err) {} } } catch (err) {}
  /* sentmap.jsonl garde, pour chaque bon de commande envoyé, l'adresse du CLIENT DE
     L'ENTREPRISE. C'est son carnet d'adresses : le laisser derrière une « suppression
     totale » serait garder des données personnelles de tiers. Et il sert au rattachement
     des réponses (voir releveBoite) : une ligne oubliée ré-étiquette un message entrant
     avec un teamId supprimé et le réécrit dans replies.jsonl qu'on vient de purger. */
  let bonsEnvoyes = 0;
  try { for (const l of fs.readFileSync(SENTMAP_PATH, 'utf8').trim().split('\n')) { try { const x = JSON.parse(l); if (x && x.teamId === t) bonsEnvoyes++; } catch (err) {} } } catch (err) {}
  const promos = [];
  for (const [code, u] of Object.entries(promoUsages || {})) if (u && u.equipes && u.equipes[t]) promos.push(code);
  const cnx = cnxData[t] || [];
  const usage = usageData[t] || null;
  /* comptesAnnuaire est une PREUVE, pas un indice : comptesReg[t] ne peut être écrit que par
     /api/espaces/comptes, qui refuse si l'espace n'existe pas et si l'empreinte de la clé
     d'équipe ne correspond pas. Un espace hors annuaire qui en porte A DONC ÉTÉ un vrai
     espace, avec de vrais comptes — son entrée d'annuaire a été perdue, pas inventée. */
  const comptes = Object.keys((comptesReg[t] && comptesReg[t].c) || {}).length;
  const comptesSite = Object.values(clientsData).filter(c => c && emails.has(String(c.email || '').toLowerCase())).length;
  /* Les deux archives de courrier, comptées ici parce que la suppression les efface
     désormais : un aperçu qui annonce moins que ce qui part n'est plus un aperçu. */
  const purgeSet = new Set(aPurger);
  const mailsEnvoyes = mailsLog.filter(m => m && purgeSet.has(String(m.a || '').toLowerCase())).length;
  const mailsRecus = supportMails.filter(m => m && purgeSet.has(String(m.from || '').toLowerCase())).length;
  const mailsEcrits = supportEnvoyes.filter(m => m && purgeSet.has(String(m.to || '').toLowerCase())).length;
  return {
    t, nom, slugs, emails: [...emails], adressesCourrier: aPurger, partagees, comptesSiteHorsAnnuaire,
    dansAnnuaire: slugs.length > 0,
    dejaFerme: entFermes.espaces.includes(t),
    boites: boites.length, abonnesPush: abos.length,
    codeAcces: !!accesReg[t], comptesAnnuaire: comptes, copiesSauvegarde: sauvListe(t).length,
    devisIA: !!devisAcces[t],
    connexions: cnx.length,
    premiere: cnx.length ? (cnx[cnx.length - 1].ts || 0) : 0,
    derniere: cnx.length ? (cnx[0].ts || 0) : 0,
    ecransOuverts: (usage && usage.total) || 0,
    erreurs: bugs, reponsesMail: reponses, bonsEnvoyes, promos,
    comptesSite, mailsEnvoyes, mailsRecus, mailsEcrits,
    /* OP MESSAGES est hors de portée : sa collection Firestore (op_companies) est créée
       avec un identifiant auto-généré, sans lien avec le teamId, et le serveur ne le
       connaît pas. On le SIGNALE plutôt que de laisser croire qu'il part avec le reste. */
    opMessages: Object.values(espacesReg).some(e => espaceT(e) === t && e.opMessages),
    _boites: boites, _abos: abos
  };
}

/* Les deux espaces par défaut de l'application ne sont PAS des entreprises : syncTeam()
   (app.html:5096) rend `localStorage.elan_sync_team || FB_TEAM`, et FB_TEAM vaut
   'elan-gestion' dans app.html, 'elan-gestion-beta' dans beta.html. Tout appareil qui n'a
   rejoint aucun espace signale donc là — y compris un visiteur qui rate une connexion. Ils
   apparaissent dans la Tour comme des entreprises ordinaires, ce qu'ils ne sont pas.
   Les supprimer serait doublement catastrophique : `elan_teams/elan-gestion` est le document
   PARTAGÉ de toutes les entreprises sans clé personnalisée (le périmètre de
   SYNC_SECRET_DEFAULT, voir CLAUDE.md), et les ajouter à entFermes viderait TOUS leurs
   appareils au prochain lancement. Le refus explique, sinon on le prend pour une panne. */
const ESPACES_INTOUCHABLES = ['elan-gestion', 'elan-gestion-beta'];
const REFUS_INTOUCHABLE = 'Cet identifiant n\'est pas une entreprise : c\'est l\'espace par défaut de l\'application. '
  + 'Tout appareil qui n\'a rejoint aucun espace y signale ses connexions, et ses données sont partagées par toutes '
  + 'les entreprises qui n\'ont jamais reçu de clé personnalisée. Le supprimer les effacerait toutes à la fois.';

/* L'aperçu : ce qui va disparaître, sans que rien ne disparaisse. Le patron doit voir
   l'ampleur AVANT de taper le nom, pas après — et pouvoir relancer l'aperçu ensuite pour
   vérifier que tout est à zéro. */
app.post('/api/monitor/entreprise/apercu-suppression', monPatronStrict, (req, res) => {
  const t = monStr((req.body || {}).t, 80).trim();
  if (!t) return res.status(400).json({ error: 'identifiant d\'espace manquant' });
  if (ESPACES_INTOUCHABLES.includes(t)) return res.status(403).json({ error: REFUS_INTOUCHABLE });
  const inv = entInventaire(t);
  delete inv._boites; delete inv._abos;
  /* Un espace qui porte des comptes de connexion, un code d'accès ou de l'usage a
     forcément été un vrai espace : on le dit, pour qu'un ménage d'essais ne devienne pas
     la suppression d'un client dont on a perdu le nom. */
  inv.aVecu = !!(inv.comptesAnnuaire || inv.codeAcces || inv.ecransOuverts || inv.comptesSite);
  res.json({ ok: true, apercu: inv });
});

app.post('/api/monitor/entreprise/supprimer', monPatronStrict, async (req, res) => {
  const t = monStr((req.body || {}).t, 80).trim();
  if (!t) return res.status(400).json({ error: 'identifiant d\'espace manquant' });
  if (ESPACES_INTOUCHABLES.includes(t)) return res.status(403).json({ error: REFUS_INTOUCHABLE });
  const inv = entInventaire(t);
  const etiquette = inv.nom || t;

  const codeRecu = monStr((req.body || {}).code, 10).trim();
  if (!codeRecu) {   // 1er temps : le code part par e-mail, comme pour une fermeture
    if (!mailer) return res.status(503).json({ error: 'e-mail non configuré — impossible d\'envoyer le code' });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    /* Indexé par teamId, PAS par e-mail : deux espaces sans adresse se marcheraient dessus,
       et c'est justement le cas des espaces hors annuaire qu'on cherche à nettoyer. */
    retraitCodes.set('t:' + t, { code, exp: Date.now() + 10 * 60000, tries: 0 });
    const dest = config.notifDemandes || config.smtp.from || config.smtp.user;
    const detail = [
      inv.dansAnnuaire ? inv.slugs.length + ' entrée(s) d\'annuaire' : 'aucune entrée d\'annuaire',
      inv.comptesAnnuaire + ' compte(s) de connexion',
      (inv.copiesSauvegarde || 0) + ' copie(s) de sauvegarde chiffrée(s)',
      inv.boites + ' boîte(s) mail reliée(s)',
      inv.abonnesPush + ' appareil(s) abonné(s) aux notifications',
      inv.connexions + ' connexion(s) enregistrée(s)',
      inv.erreurs + ' erreur(s)',
      inv.ecransOuverts + ' écran(s) ouvert(s)',
      inv.comptesSite + ' compte(s) du site',
      inv.mailsEnvoyes + ' e-mail(s) envoyé(s) archivé(s)',
      inv.mailsRecus + ' e-mail(s) reçu(s) archivé(s)',
      inv.mailsEcrits + ' e-mail(s) écrit(s) au client, archivé(s)'
    ].join('\n· ')
    + ((inv.partagees || []).length
        ? '\n\nCE QUI RESTE, ET C\'EST VOLONTAIRE : ' + inv.partagees.join(', ')
          + ' — cette adresse est ENCORE la boîte d\'un autre espace. Ses archives de courrier ne\n'
          + 'sont donc pas effacées : elles appartiennent aussi à cet espace-là, qui vit toujours.'
        : '')
    + ((inv.comptesSiteHorsAnnuaire || []).length
        ? '\n\nUn compte du site existe sous ' + inv.comptesSiteHorsAnnuaire.map(masqueMail).join(', ')
          + ', hors annuaire de cet espace. Il n\'est PAS fermé — on ne ferme pas un compte dont\n'
          + 'on ne peut pas prouver l\'appartenance. À faire à part, depuis la fiche du client.'
        : '')
    + (inv.opMessages
        /* Décision de Justin, à ne pas réécrire : OP MESSAGES est encore en développement,
           on ne la supprime pas. Elle est simplement SÉPARÉE d'OP GESTION. La version qui
           disait « à supprimer à part » invitait au contraire. */
        ? '\n\nOP MESSAGES N\'EST PAS TOUCHÉ, ET C\'EST VOULU : l\'application est encore en '
          + 'développement et ne doit pas être supprimée. Ses conversations, ses salons et ses pièces '
          + 'jointes vivent dans un espace séparé d\'OP GESTION et y restent.'
        : '');
    try {
      await mailerEnvoi({ from: config.smtp.from || config.smtp.user, to: dest,
        confidentiel: true, trace: 'code de suppression totale · espace ' + t,
        subject: '🗑 Code de confirmation — suppression totale de « ' + etiquette + ' »',
        text: 'Tu es sur le point de SUPPRIMER TOTALEMENT l\'espace « ' + etiquette + ' » (' + t + ').\n\n'
          + 'Ce qui va être effacé :\n· ' + detail + '\n\n'
          + 'Code de confirmation : ' + code + '\n\nValable 10 minutes.\n\n'
          + 'Après validation, rien n\'est récupérable : les données chiffrées sont détruites côté Firestore, '
          + 'et les applications des appareils se vident à leur prochain lancement.\nSi ce n\'est pas toi, ignore ce message.' });
    } catch (e) { return res.status(500).json({ error: 'envoi du code impossible : ' + String(e.message).slice(0, 120) }); }
    console.log('Tour : code de suppression totale envoyé pour', t, '→', masqueMail(dest));
    /* Masqué comme dans le journal juste au-dessus : la Tour n'a besoin que de reconnaître
       la boîte, pas de l'afficher en entier. */
    return res.json({ ok: true, codeEnvoye: true, dest: masqueMail(dest), apercu: (delete inv._boites, delete inv._abos, inv) });
  }

  const c = retraitCodes.get('t:' + t);
  if (!c || Date.now() > c.exp) { retraitCodes.delete('t:' + t); return res.status(400).json({ error: 'code expiré — recommence' }); }
  c.tries++; if (c.tries > 5) { retraitCodes.delete('t:' + t); return res.status(429).json({ error: 'trop d\'essais — recommence' }); }
  if (codeRecu !== c.code) return res.status(400).json({ error: 'code incorrect (' + (6 - c.tries) + ' essai(s) restants)' });
  retraitCodes.delete('t:' + t);

  const fait = {};

  // ── 1. LE BLOCAGE D'ABORD. Sans lui, le premier appareil qui rouvre repousse toute sa
  //       base chiffrée et défait tout ce qui suit. Voir app.html vers la ligne 5131.
  if (!entFermes.espaces.includes(t)) entFermes.espaces.push(t);
  for (const m of inv.emails) if (!entFermes.emails.includes(m)) entFermes.emails.push(m);
  const fermesOk = fermesSave();
  if (!fermesOk) return res.status(500).json({ error: 'Le blocage de l\'espace n\'a pas pu être enregistré — RIEN n\'a été supprimé. Vérifie le serveur (disque plein ?) avant de recommencer.' });
  fait.bloque = true;

  // ── 2. LES BOÎTES MAIL. releveBoite() les relit toutes les 120 s : tant qu'elles sont là,
  //       le serveur se reconnecte et réécrit dans replies.jsonl ce qu'on va en retirer.
  //       Elles portent aussi les mots de passe IMAP/SMTP en clair.
  for (const id of inv._boites) delete mailboxes[id];
  /* saveMailboxes() avale son erreur. Or c'est le fichier qui porte les mots de passe
     IMAP/SMTP EN CLAIR : répondre « supprimé » alors qu'ils sont encore sur le disque est
     exactement ce qu'il ne faut pas faire. On relit pour en être sûr. */
  let ecrit = true;
  if (inv._boites.length) {
    saveMailboxes();
    try { const relu = JSON.parse(fs.readFileSync(MAILBOX_PATH, 'utf8'));
      if (Object.values(relu).some(b => b && b.teamId === t)) ecrit = false;
    } catch (e) { ecrit = false; }
    if (!ecrit) console.error('suppression : mailboxes.json non écrit — mots de passe encore présents pour', t);
  }
  fait.boites = inv._boites.length;

  // ── 3. Les abonnements aux notifications : ils portent le NOM des salariés, et sans ça
  //       le serveur continue de pousser sur les téléphones d'une entreprise supprimée.
  for (const ep of inv._abos) delete subs[ep];
  if (inv._abos.length) saveSubs();
  fait.abonnesPush = inv._abos.length;

  // ── 4. Les registres indexés par teamId.
  if (accesReg[t]) { delete accesReg[t]; if (!accesEcrire()) ecrit = false; }
  fait.codeAcces = !!inv.codeAcces;
  if (comptesReg[t]) { delete comptesReg[t]; if (!comptesEcrire()) ecrit = false; }
  fait.comptesAnnuaire = inv.comptesAnnuaire;
  if (usageData[t]) { delete usageData[t]; usageSave(); }
  try { fs.rmSync(sauvDossier(t), { recursive: true, force: true }); } catch (e) { ecrit = false; console.error('suppression : copies de sauvegarde non effacées :', e.message); }   // « plus rien n'est enregistré nulle part » doit rester vrai
  if (ordresData[t]) { delete ordresData[t]; ordresSave(); }
  fait.ecransOuverts = inv.ecransOuverts;
  if (cnxData[t]) { delete cnxData[t]; cnxSave(); }
  fait.connexions = inv.connexions;
  if (devisAcces[t]) { delete devisAcces[t]; saveDevisAcces(); }
  fait.devisIA = !!inv.devisIA;
  if (inv.promos.length) { for (const code of inv.promos) { if (promoUsages[code] && promoUsages[code].equipes) delete promoUsages[code].equipes[t]; } savePromoUsages(); }
  fait.promos = inv.promos.length;

  // ── 5. L'annuaire EN DERNIER parmi les registres : il est le seul à relier nom, slug,
  //       teamId, e-mail et clé d'équipe. TOUS les slugs qui portent ce t, pas seulement
  //       celui qu'on connaît — un espace renommé en laisse plusieurs, chacun contenant la
  //       clé d'équipe en clair dans son code base64.
  for (const slug of inv.slugs) delete espacesReg[slug];
  /* espacesEcrire() et pas writeFileSync : le commentaire de cette fonction dit pourquoi —
     espaces.json porte le « k » de TOUS les clients, une écriture tronquée les perd tous
     d'un coup. Écrire à côté puis renommer est la seule façon de ne pas transformer une
     suppression ratée en panne générale. */
  if (inv.slugs.length && !espacesEcrire()) ecrit = false;
  fait.entreesAnnuaire = inv.slugs.length;

  /* usageSave(), cnxSave() et saveSubs() écrivent 300 à 800 ms plus tard. Sur un espace
     sans adresse — le cas exact pour lequel cette route existe — la suite ne prend pas
     forcément ce temps-là, et un redémarrage dans cette fenêtre rechargerait usage.json et
     connexions.json AVEC l'espace supprimé dedans, identifiants des salariés compris.
     On force donc l'écriture tout de suite. */
  try { fs.writeFileSync(USAGE_PATH, JSON.stringify(usageData)); } catch (e) { ecrit = false; console.error('suppression : usage.json non écrit :', e.message); }
  try { fs.writeFileSync(CNX_PATH, JSON.stringify(cnxData)); } catch (e) { ecrit = false; console.error('suppression : connexions.json non écrit :', e.message); }
  try { fs.writeFileSync(SUBS_PATH, JSON.stringify(subs)); } catch (e) { ecrit = false; console.error('suppression : subscriptions.json non écrit :', e.message); }

  // ── 6. Les journaux : réécrits sans les lignes de cet espace. Faits après les boîtes,
  //       sinon la relève en réécrit pendant qu'on nettoie.
  /* Rend le nombre de lignes retirées, ou NULL si la purge a échoué. La distinction n'est
     pas cosmétique : sans elle, un fichier trop gros pour être lu d'un coup renvoyait 0, et
     « 0 erreur retirée » se lit comme « il n'y en avait pas » alors que la purge n'a pas eu
     lieu du tout. Un échec doit se voir. */
  const purgeJournal = (chemin, garde) => {
    let n = 0;
    try {
      if (!fs.existsSync(chemin)) return 0;
      const lignes = fs.readFileSync(chemin, 'utf8').split('\n');
      const restant = lignes.filter(l => { if (!l.trim()) return false; try { if (!garde(JSON.parse(l))) { n++; return false; } } catch (err) {} return true; });
      /* tmp + rename : un journal de plusieurs mégaoctets réécrit en place peut être tronqué
         par une coupure au mauvais moment, et il n'y a pas de seconde copie. */
      fs.writeFileSync(chemin + '.tmp', restant.length ? restant.join('\n') + '\n' : '');
      fs.renameSync(chemin + '.tmp', chemin);
    } catch (e) { console.error('purge', chemin, ':', e.message); return null; }
    return n;
  };
  fait.erreurs = purgeJournal(BUGS_PATH, b => !(b && b.team === t));
  fait.reponsesMail = purgeJournal(REPLIES_PATH, r => !(r && r.teamId === t));
  fait.bonsEnvoyes = purgeJournal(SENTMAP_PATH, x => !(x && x.teamId === t));
  /* Le même carnet vit AUSSI en mémoire : le purger sur disque sans le purger ici le
     laisserait servir jusqu'au prochain redémarrage. */
  try { sentMap = sentMap.filter(x => !(x && x.teamId === t)); } catch (e) {}
  /* Les DEUX archives de courrier. Elles échappaient à la suppression : après un ménage
     annoncé « rien n'est récupérable », un utilisateur Tour NON PATRON (GET /api/monitor/mails
     est en monAdmin, un cran sous le monPatronStrict qui a autorisé la suppression) lisait
     encore l'adresse complète et 2 000 caractères de correspondance de l'entreprise effacée.
     Ce n'est pas une fuite vers Internet : c'est un effacement incomplet, et l'e-mail envoyé
     au patron promet l'inverse. Les deux carnets vivent en mémoire ET sur disque. */
  /* L'annuaire ET la boîte reliée, MOINS les adresses qu'une autre équipe utilise encore
     (voir entInventaire) : ces dernières sont écartées de la purge et annoncées à part.
     LIMITE QUI RESTE : un espace hors annuaire ET sans boîte reliée ne laisse aucune adresse
     à filtrer — l'aperçu annonce alors honnêtement 0. Les réponses de clients, purgées par
     teamId, partent quand même. */
  const adrSuppr = new Set((inv.adressesCourrier || inv.emails).map(m => String(m).toLowerCase()));
  const avantMails = mailsLog.length;
  mailsLog = mailsLog.filter(m => !adrSuppr.has(String((m && m.a) || '').toLowerCase()));
  fait.mailsEnvoyes = avantMails - mailsLog.length;
  /* Écriture FORCÉE et synchrone, comme les trois voisines juste au-dessus : supSave() est
     débouncée de 400 ms, donc son écriture partirait APRÈS la réponse HTTP et un échec serait
     hors de portée. Et mailsSave() rend désormais un booléen : un disque plein doit faire
     tomber ecrit, pas passer pour un succès. */
  if (!mailsSave()) ecrit = false;
  const avantRecus = supportMails.length;
  supportMails = supportMails.filter(m => !adrSuppr.has(String((m && m.from) || '').toLowerCase()));
  fait.mailsRecus = avantRecus - supportMails.length;
  try { fs.writeFileSync(SUPPORT_MAILS_PATH, JSON.stringify(supportMails)); } catch (e) { ecrit = false; console.error('suppression : support-mails.json non écrit :', e.message); }
  /* La TROISIÈME archive : ce que la Tour a écrit AU client. Même défaut, même niveau
     d'accès (GET /api/monitor/support/envoyes est en monAdmin), même promesse trahie. */
  const avantEcrits = supportEnvoyes.length;
  supportEnvoyes = supportEnvoyes.filter(m => !adrSuppr.has(String((m && m.to) || '').toLowerCase()));
  fait.mailsEcrits = avantEcrits - supportEnvoyes.length;
  try { fs.writeFileSync(SUPPORT_ENVOYES_PATH, JSON.stringify(supportEnvoyes)); } catch (e) { ecrit = false; console.error('suppression : support-envoyes.json non écrit :', e.message); }

  // ── 7. Les comptes du site, chez Firebase.
  fait.comptesSite = [];
  for (const m of inv.emails) {
    if (clientsData[m]) { delete clientsData[m]; cliSave(); }
    const r = await fbSupprimerCompteSite(m);
    fait.comptesSite.push({ email: masqueMail(m), motif: r.motif });
  }

  // ── 8. Les données chiffrées, chez Firestore. En dernier : c'est la seule opération qui
  //       peut échouer pour une raison extérieure (réseau, jeton), et tout le reste doit
  //       déjà être fait pour qu'un échec ici ne laisse pas un demi-ménage.
  const FB_CLE = (config.firebase && config.firebase.apiKey) || 'AIzaSyAbah03sO4f4LyNhvmig0Pn00lz1sHSpT8';
  let jeton = await fbAdminJeton(); const jetonAdmin = !!jeton;
  if (!jeton) try {
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + FB_CLE,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"returnSecureToken":true}' });
    const j = await r.json().catch(() => ({}));
    jeton = j.idToken || '';
  } catch (e) { console.error('suppression firestore jeton :', e.message); }
  fait.donneesEffacees = false;
  try {
    const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch('https://firestore.googleapis.com/v1/projects/' + FB_PROJET + '/databases/(default)/documents/elan_teams/' + encodeURIComponent(t) + '?key=' + FB_CLE,
      { method: 'DELETE', headers: jeton ? { 'Authorization': 'Bearer ' + jeton } : {}, signal: ctrl.signal });
    clearTimeout(tm);
    fait.donneesEffacees = r.ok;
    if (!r.ok) console.error('suppression firestore', t, ': HTTP', r.status);
  } catch (e) { console.error('suppression firestore', t, ':', e.message); }
  if (jeton && !jetonAdmin) { try { await fetch('https://identitytoolkit.googleapis.com/v1/accounts:delete?key=' + FB_CLE,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: jeton }) }); } catch (e) {} }

  console.log('Tour :', req.tourUser.nom, 'a SUPPRIMÉ TOTALEMENT l\'espace', t,
    '— annuaire', fait.entreesAnnuaire, '· boîtes', fait.boites, '· push', fait.abonnesPush,
    '· connexions', fait.connexions, '· erreurs', fait.erreurs, '· Firestore', fait.donneesEffacees ? 'effacé' : 'ÉCHEC');

  /* Le reste est parti, mais on ne dit pas « tout est propre » si une écriture a échoué :
     un ménage à moitié fait qu'on croit terminé est pire qu'un ménage annoncé incomplet. */
  /* Une purge qui rend null a ÉCHOUÉ — ce n'est pas la même chose que « rien à purger ».
     Sans cette distinction, un journal trop gros pour être lu d'un coup faisait répondre
     « tout est propre ». */
  const purgeRatee = fait.erreurs === null || fait.reponsesMail === null || fait.bonsEnvoyes === null;
  if (purgeRatee) ecrit = false;
  res.json({ ok: true, supprime: true, t, nom: inv.nom, fait, ecrit,
    avertissement: ecrit && fait.donneesEffacees ? '' :
      'Une partie n\'a pas pu être écrite ou effacée — relance l\'aperçu de suppression pour voir ce qu\'il reste.' });
});

// liste des problèmes + compteurs (admin)
app.get('/api/monitor/issues', monAdmin, (req, res) => {
  monPurge();
  /* Filtré par application AVANT tout calcul : compteurs et entreprises se comptent sur ce que le
     compte a le droit de voir — sinon un compte OP MESSAGES apprendrait combien d'incidents
     OP GESTION existent, et chez qui. Forger la requête n'y change rien : le filtre est ici. */
  const vis = monIssues.filter(i => req.tourUser.apps.includes(monAppDeTag(i.app)));
  const compteurs = { nouveau: 0, encours: 0, corrige: 0, ignore: 0 };
  const entSet = new Set();
  for (const i of vis) { compteurs[i.statut] = (compteurs[i.statut] || 0) + 1; for (const e of i.entreprises || []) if (e.nom && e.nom !== 'inconnue') entSet.add(e.nom); }
  res.json({ issues: vis.slice().sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0)), compteurs, entreprises: entSet.size });
});

// changement de statut (admin) — « corrige » déclenche l'e-mail automatique aux entreprises touchées
app.post('/api/monitor/status', monAdmin, async (req, res) => {
  const { id, statut, note } = req.body || {};
  if (!['nouveau', 'encours', 'corrige', 'ignore'].includes(statut)) return res.status(400).json({ error: 'statut invalide' });
  if (statut === 'ignore' && req.tourUser.role !== 'patron') return res.status(403).json({ error: '« Ignorer » est réservé au patron' });
  const issue = monIssues.find(i => i.id === id);
  if (!issue) return res.status(404).json({ error: 'problème introuvable' });
  if (monIssueRefuse(req, res, issue)) return;
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
        try { await mailerEnvoi({ from: config.smtp.from || config.smtp.user, to: d.email, subject: sujet, text: texte }); mails++; }
        catch (e) { console.error('monitor mail', masqueMail(d.email) + ':', e.message); }
      } else { mailsSimules++; console.log('monitor mail (simulé, smtp non configuré) →', masqueMail(d.email), '·', sujet); }
    }
    issue.mailEnvoye = true;
  }
  monSave();
  res.json({ ok: true, issue, mails, mailsSimules });
});


/* ══════════ EXPLIQUE — d'un incident à sa cause, en français ══════════
   Un incident dit CE QUI a cassé. Il ne dit pas pourquoi, et c'est tout le travail :
   « Interface figée », « Cannot read properties of undefined » — il faut ensuite ouvrir
   le fichier, trouver la ligne, comprendre. Cette route fait ce chemin-là.

   Deux règles la tiennent :
     • L'extrait de code vient du DÉPÔT, lu ici, jamais du modèle. On lui donne le code
       à lire ; il ne l'invente pas. Quand la trace ne désigne aucun fichier du dépôt,
       la route le dit au lieu de fabriquer un emplacement plausible.
     • Elle n'écrit rien dans l'application. Elle pose une explication à côté de
       l'incident, dans la console — et cette explication est datée, signée du
       collaborateur qui l'a demandée, et relisible. Une explication qu'on ne peut pas
       relire est une explication à laquelle on ne peut pas se fier. */
const DEPOT = path.resolve(__dirname, '..');
/* Le fichier désigné par une trace de sentinelle : un seul nom, à la racine du dépôt,
   et rien d'autre — pas de chemin, pas de remontée, pas d'autre extension. */
function monSource(src, ligne) {
  const n = parseInt(ligne, 10) || 0;
  let f = String(src || '').trim();
  try { if (/^https?:\/\//i.test(f)) f = new URL(f).pathname; } catch (e) {}
  f = f.replace(/^\/+/, '').split('?')[0].split('#')[0];
  if (!/^[a-z0-9._-]+\.(html|js)$/i.test(f)) return null;
  const p = path.join(DEPOT, f);
  if (p !== path.join(DEPOT, path.basename(p)) || !fs.existsSync(p)) return null;
  let lignes;
  try { lignes = fs.readFileSync(p, 'utf8').split('\n'); } catch (e) { return null; }
  if (!n || n > lignes.length) return { fichier: f, ligne: 0, extrait: '' };
  const d = Math.max(1, n - 12), fin = Math.min(lignes.length, n + 12);
  const extrait = lignes.slice(d - 1, fin)
    .map((l, i) => String(d + i).padStart(6) + (d + i === n ? ' ▶ ' : ' │ ') + l.slice(0, 300)).join('\n');
  return { fichier: f, ligne: n, extrait };
}
const EXPLIQUE_SCHEMA = {
  type: 'object',
  properties: {
    cause: { type: 'string' },
    ou: { type: 'string' },
    verifier: { type: 'string' },
    confiance: { type: 'string', enum: ['haute', 'moyenne', 'faible'] }
  },
  required: ['cause', 'ou', 'verifier', 'confiance'],
  additionalProperties: false
};
const EXPLIQUE_QUOTA_PATH = path.join(DATA_DIR, 'explique-quota.json');
/* Un compteur PAR APPLICATION. /api/monitor/report est publique : n'importe qui peut fabriquer des incidents
   étiquetés OP MESSAGES, et un compte messages les expliquer — avec un seul compteur, il aurait vidé le quota
   du jour de la Tour gestion. L'ancien fichier { jour, n } se relit comme le compteur de gestion. */
let expliqueQuota = { jour: '', n: {} };
try { const q = JSON.parse(fs.readFileSync(EXPLIQUE_QUOTA_PATH, 'utf8')); expliqueQuota = { jour: q.jour || '', n: (q.n && typeof q.n === 'object') ? q.n : { gestion: +q.n || 0 } }; } catch (e) {}
function expliqueUtilises(appli) {
  const auj = new Date().toISOString().slice(0, 10);
  if (expliqueQuota.jour !== auj) expliqueQuota = { jour: auj, n: {} };
  return expliqueQuota.n[appli] || 0;
}
function expliqueCompte(appli) { expliqueUtilises(appli); expliqueQuota.n[appli] = (expliqueQuota.n[appli] || 0) + 1; try { fs.writeFileSync(EXPLIQUE_QUOTA_PATH, JSON.stringify(expliqueQuota)); } catch (e) {} }
const EXPLIQUE_MAX = 40;   // par application et par jour
app.post('/api/monitor/expliquer', monAdmin, async (req, res) => {
  try {
    if (!devisActif()) return res.status(503).json({ error: 'Clé Claude non configurée sur le serveur (config.json → anthropic.cleApi)' });
    const issue = monIssues.find(i => i.id === (req.body || {}).id);
    if (!issue) return res.status(404).json({ error: 'incident introuvable' });
    if (monIssueRefuse(req, res, issue)) return;
    if (issue.explication && !(req.body || {}).refaire) return res.json({ ok: true, explication: issue.explication, deja: true });
    const appliQ = monAppDeTag(issue.app);
    if (expliqueUtilises(appliQ) >= EXPLIQUE_MAX) return res.status(429).json({ error: 'Quota du jour atteint (' + EXPLIQUE_MAX + ' explications) — réessaie demain' });

    const s = monSource(issue.src, issue.line);
    const sys = "Tu expliques la cause d'un incident survenu dans une application web de gestion d'interventions, à un artisan qui n'est pas développeur mais qui lit du code quand on le lui montre. Réponds en français, sobrement, sans jargon inutile.\n"
      + "« cause » : deux ou trois phrases qui disent POURQUOI cela s'est produit. Pas de reformulation du message d'erreur — la cause.\n"
      + "« ou » : le fichier et la ligne, repris EXACTEMENT de l'extrait fourni. Si aucun extrait n'est fourni, ou si l'extrait ne montre pas la cause, écris « emplacement non déterminé » — n'invente jamais un fichier ni un numéro de ligne.\n"
      + "« verifier » : ce qu'un humain doit regarder ou reproduire pour confirmer, en une phrase.\n"
      + "« confiance » : « haute » seulement si l'extrait montre la cause noir sur blanc ; « faible » si tu raisonnes sans voir le code fautif. Une explication plausible mais invérifiable est de confiance faible, dis-le.";
    const contexte = 'Incident\n'
      + '- application : ' + (issue.app || '?') + (issue.version ? ' v' + issue.version : '') + '\n'
      + '- type : ' + (issue.type || '?') + ' · rubrique : ' + (issue.categorie || '?') + '\n'
      + '- message : ' + (issue.message || '') + '\n'
      + '- vu ' + (issue.count || 1) + ' fois, sur ' + Object.keys(issue.appareils || {}).length + ' appareil(s)\n'
      + (issue.stack ? '- trace :\n' + issue.stack + '\n' : '')
      + (s && s.extrait
        ? '\nCode du dépôt autour de ' + s.fichier + ':' + s.ligne + ' (▶ = la ligne désignée) :\n' + s.extrait + '\n'
        : '\nAucun extrait de code : la trace ne désigne pas un fichier du dépôt' + (issue.src ? ' (elle indique « ' + String(issue.src).slice(0, 120) + ' »)' : '') + '.\n');

    const msg = await getAnthropic().messages.create({
      model: 'claude-sonnet-5', max_tokens: 2000, system: sys,
      output_config: { format: { type: 'json_schema', schema: EXPLIQUE_SCHEMA } },
      messages: [{ role: 'user', content: contexte }]
    });
    if (msg.stop_reason === 'refusal') return res.status(422).json({ error: 'Explication refusée' });
    const txt = (msg.content.find(b => b.type === 'text') || {}).text || '';
    let e; try { e = JSON.parse(txt); } catch (err) { return res.status(502).json({ error: 'Réponse illisible, réessaie' }); }
    expliqueCompte(appliQ);
    issue.explication = {
      cause: monStr(e.cause, 900), ou: monStr(e.ou, 200), verifier: monStr(e.verifier, 400),
      confiance: ['haute', 'moyenne', 'faible'].includes(e.confiance) ? e.confiance : 'faible',
      /* le fichier et la ligne réellement OUVERTS ici — c'est cela qui fait foi, pas ce
         que le modèle en a redit */
      fichier: s ? s.fichier : '', ligne: s ? s.ligne : 0, codeLu: !!(s && s.extrait),
      ts: Date.now(), par: req.tourUser.nom
    };
    issue.historique = (issue.historique || []).concat([{ ts: Date.now(), par: req.tourUser.nom, action: 'Cause expliquée', note: issue.explication.ou }]).slice(-30);
    monSave();
    console.log('Tour :', req.tourUser.nom, 'a demandé la cause de', issue.id, '→', issue.explication.confiance, issue.explication.ou);
    res.json({ ok: true, explication: issue.explication, restants: Math.max(0, EXPLIQUE_MAX - expliqueUtilises()) });
  } catch (err) {
    const st = err && err.status;
    if (st === 401) return res.status(502).json({ error: 'Clé Claude refusée par Anthropic — expirée ou incomplète. Sur le serveur : bash server/set-claude.sh' });
    if (st === 429 || st === 529) return res.status(503).json({ error: 'Service IA saturé — réessaie dans une minute' });
    console.error('expliquer :', err && err.message);
    res.status(500).json({ error: 'Erreur du serveur' });
  }
});


/* ══════════ PROPOSE — d'une cause à une correction, soumise au patron ══════════
   EXPLIQUE dit pourquoi. PROPOSE écrit le correctif et ouvre une proposition sur
   GitHub. Elle ne fusionne rien : ce fichier n'appelle nulle part la fusion, et
   la proposition part en brouillon. Rien ne va en production sans une main humaine.

   Quatre verrous, dans cet ordre :
     1. Il faut une cause déjà établie, et le code doit avoir été RÉELLEMENT LU pour
        l'établir. Corriger sur une intuition, c'est corriger au hasard.
     2. L'ancre du remplacement doit se trouver UNE SEULE FOIS dans le fichier. Zéro,
        le modèle a inventé du code qui n'existe pas ; deux, on ne sait pas laquelle
        il visait. Dans les deux cas on s'arrête.
     3. Le fichier corrigé doit encore s'analyser. C'est la panne du 3 septembre 2026 :
        un « // » au milieu d'une ligne avait avalé une accolade, app.html avait cessé
        de parser, et la page est restée blanche chez toutes les entreprises. Un
        correctif qui casse le fichier ne doit jamais atteindre une proposition.
     4. app.html commande beta.html : on régénère la bêta avec le générateur livré
        (beta-build.js, exécuté tel quel), sinon la vérification d'intégration
        signalerait à juste titre une bêta désynchronisée.

   La clé GitHub vit UNIQUEMENT dans /opt/teamop/config.json → "github" :
     "github": { "token": "…", "depot": "compte/TeamOP" }
   Sans elle, la route se tait proprement : PROPOSE reste inerte. */
const PROPOSE_SCHEMA = {
  type: 'object',
  properties: {
    titre: { type: 'string' },
    pourquoi: { type: 'string' },
    fichier: { type: 'string' },
    avant: { type: 'string' },
    apres: { type: 'string' },
    verifier: { type: 'string' },
    risque: { type: 'string', enum: ['faible', 'moyen', 'eleve'] }
  },
  required: ['titre', 'pourquoi', 'fichier', 'avant', 'apres', 'verifier', 'risque'],
  additionalProperties: false
};
function ghConf() { return config.github || {}; }
function ghActif() { return !!(ghConf().token && ghConf().depot); }
async function gh(chemin, options) {
  const r = await fetch('https://api.github.com/repos/' + ghConf().depot + chemin, Object.assign({
    headers: {
      'Authorization': 'Bearer ' + ghConf().token,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'teamop-propose',
      'Content-Type': 'application/json'
    }
  }, options || {}));
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) {}
  if (!r.ok) { const e = new Error('GitHub ' + r.status + ' : ' + ((j && j.message) || txt.slice(0, 200))); e.statutGh = r.status; throw e; }
  return j;
}
/* Chaque bloc <script> d'une page doit rester analysable — même contrôle que
   scripts/verifier-syntaxe.js, qui existe précisément à cause de la page blanche.
   new Function COMPILE le code sans jamais l'exécuter : c'est ce qu'on veut ici, savoir
   si le navigateur saura lire la page, sans faire tourner une ligne du correctif. */
function pageAnalysable(html) {
  const BLOC = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m, n = 0;
  while ((m = BLOC.exec(html))) {
    n++;
    try { new Function(m[1]); }
    catch (e) {
      try { new Function('return (async () => {' + m[1] + '})'); }
      catch (e2) { return 'bloc <script> n°' + n + ' : ' + e2.message; }
    }
  }
  return '';
}
/* beta.html est GÉNÉRÉE depuis app.html. On ne réécrit pas ses règles ici : on exécute
   le générateur livré, en lui donnant l'app corrigée à lire et en captant ce qu'il écrit.
   Ses propres refus (isolation du stockage, de l'espace de synchro) restent actifs. */
function betaDepuis(appHtml) {
  const src = fs.readFileSync(path.join(DEPOT, 'beta-build.js'), 'utf8');
  let sortie = null;
  const fauxFs = {
    readFileSync: (f, e) => (String(f).endsWith('app.html') ? appHtml : fs.readFileSync(f, e)),
    writeFileSync: (f, d) => { if (String(f).endsWith('beta.html')) sortie = d; }
  };
  new Function('require', 'console', 'process', src)(
    (n) => (n === 'fs' ? fauxFs : require(n)),
    { log: () => {}, error: (m) => { throw new Error(String(m)); } },
    { exit: (c) => { if (c) throw new Error('beta-build.js a refusé la génération'); } }
  );
  if (!sortie) throw new Error('beta-build.js n\'a rien produit');
  return sortie;
}
app.post('/api/monitor/proposer', monPatronStrict, async (req, res) => {
  try {
    if (!devisActif()) return res.status(503).json({ error: 'Clé Claude non configurée sur le serveur (config.json → anthropic.cleApi)' });
    if (!ghActif()) return res.status(503).json({ error: 'Dépôt GitHub non configuré sur le serveur (config.json → github.token et github.depot)' });
    const issue = monIssues.find(i => i.id === (req.body || {}).id);
    if (!issue) return res.status(404).json({ error: 'incident introuvable' });
    if (monIssueRefuse(req, res, issue)) return;
    const e = issue.explication;
    if (!e) return res.status(400).json({ error: 'Cherche d\'abord la cause : on ne corrige pas un incident qu\'on n\'a pas compris' });
    if (!e.codeLu || !e.fichier) return res.status(400).json({ error: 'La cause a été établie sans lire le code — pas de correctif automatique là-dessus' });
    if (issue.proposition && !(req.body || {}).refaire) return res.json({ ok: true, proposition: issue.proposition, deja: true });

    const s = monSource(e.fichier, e.ligne);
    if (!s || !s.extrait) return res.status(400).json({ error: 'Le fichier de la cause n\'est plus lisible dans le dépôt' });
    const lignes = fs.readFileSync(path.join(DEPOT, s.fichier), 'utf8').split('\n');
    const d = Math.max(1, s.ligne - 40), fin = Math.min(lignes.length, s.ligne + 40);
    const large = lignes.slice(d - 1, fin).map((l, i) => String(d + i) + ' │ ' + l).join('\n');

    const sys = "Tu corriges un défaut dans une application web française (JavaScript dans des pages HTML d'un seul fichier, sans build ni framework). Le style existant fait loi : mêmes conventions, mêmes noms en français, mêmes commentaires expliquant le POURQUOI. Pas de refactorisation, pas d'amélioration au passage — la plus petite correction qui traite la cause, et rien d'autre.\n"
      + "« avant » : le fragment EXACT à remplacer, copié caractère pour caractère depuis le code fourni (sans les numéros de ligne ni la barre verticale). Il doit être assez long pour n'apparaître QU'UNE FOIS dans le fichier, et assez court pour ne rien emporter d'inutile.\n"
      + "« apres » : ce fragment corrigé. Il doit rester du JavaScript valide au même endroit.\n"
      + "« pourquoi » : deux ou trois phrases expliquant ce que le correctif change et pourquoi cela traite la cause.\n"
      + "« verifier » : comment un humain confirme que c'est réglé, concrètement.\n"
      + "« risque » : « faible » si le correctif ne touche qu'un chemin d'exécution étroit ; « eleve » s'il touche du code partagé ou une donnée persistée.\n"
      + "Si le code fourni ne suffit pas pour corriger sûrement, renvoie « avant » et « apres » identiques : c'est la façon de dire que tu ne corriges pas à l'aveugle.";
    const contexte = 'Incident : ' + (issue.message || '') + '\n'
      + 'Cause établie : ' + (e.cause || '') + '\n'
      + 'Emplacement : ' + s.fichier + ' ligne ' + s.ligne + '\n'
      + (issue.stack ? 'Trace :\n' + issue.stack + '\n' : '')
      + '\nCode du dépôt (' + s.fichier + ', lignes ' + d + ' à ' + fin + ') :\n' + large;

    const msg = await getAnthropic().messages.create({
      model: 'claude-sonnet-5', max_tokens: 8000, system: sys,
      output_config: { format: { type: 'json_schema', schema: PROPOSE_SCHEMA } },
      messages: [{ role: 'user', content: contexte }]
    });
    if (msg.stop_reason === 'refusal') return res.status(422).json({ error: 'Correctif refusé' });
    const txt = (msg.content.find(b => b.type === 'text') || {}).text || '';
    let p; try { p = JSON.parse(txt); } catch (err) { return res.status(502).json({ error: 'Réponse illisible, réessaie' }); }

    // ── verrou 2 : l'ancre, une fois et une seule ──
    if (!p.avant || p.avant === p.apres) return res.status(422).json({ error: 'Aucun correctif sûr à partir de ce code — la cause reste à traiter à la main' });
    if (p.avant.length > 4000) return res.status(422).json({ error: 'Correctif trop large pour être proposé automatiquement' });
    const avantFichier = fs.readFileSync(path.join(DEPOT, s.fichier), 'utf8');
    const occurrences = avantFichier.split(p.avant).length - 1;
    if (occurrences !== 1) return res.status(422).json({
      error: occurrences === 0
        ? 'Le fragment à remplacer ne se trouve pas dans le fichier — correctif écarté'
        : 'Le fragment à remplacer apparaît ' + occurrences + ' fois — on ne sait pas lequel viser, correctif écarté'
    });
    const apresFichier = avantFichier.replace(p.avant, p.apres);

    // ── verrou 3 : le fichier corrigé s'analyse encore ──
    const fichiers = {};
    if (/\.html$/i.test(s.fichier)) {
      const casse = pageAnalysable(apresFichier);
      if (casse) return res.status(422).json({ error: 'Correctif écarté : il rend ' + s.fichier + ' inanalysable (' + casse + ')' });
    } else {
      try { new (require('vm').Script)(apresFichier, { filename: s.fichier }); }
      catch (err) { return res.status(422).json({ error: 'Correctif écarté : il rend ' + s.fichier + ' inanalysable (' + err.message + ')' }); }
    }
    fichiers[s.fichier] = apresFichier;
    // ── verrou 4 : la bêta suit l'app ──
    if (s.fichier === 'app.html') {
      try { fichiers['beta.html'] = betaDepuis(apresFichier); }
      catch (err) { return res.status(422).json({ error: 'Correctif écarté : la bêta ne se régénère pas (' + err.message + ')' }); }
    }

    // ── la proposition, en brouillon ──
    const branche = 'propose/' + issue.id + '-' + Date.now().toString(36);
    const base = await gh('/git/ref/heads/main');
    await gh('/git/refs', { method: 'POST', body: JSON.stringify({ ref: 'refs/heads/' + branche, sha: base.object.sha }) });
    for (const nomF of Object.keys(fichiers)) {
      const actuel = await gh('/contents/' + encodeURIComponent(nomF) + '?ref=main');
      await gh('/contents/' + encodeURIComponent(nomF), {
        method: 'PUT',
        body: JSON.stringify({
          message: monStr(p.titre, 120) + '\n\nIncident #' + String(issue.id).slice(-6) + ' — proposition ouverte depuis la Tour par ' + req.tourUser.nom + '.',
          content: Buffer.from(fichiers[nomF], 'utf8').toString('base64'),
          branch: branche, sha: actuel.sha
        })
      });
    }
    const corps = '## Ce qui ne va pas\n\n' + (issue.message || '') + '\n\n'
      + '_Incident #' + String(issue.id).slice(-6) + ' · vu ' + (issue.count || 1) + ' fois sur '
      + Object.keys(issue.appareils || {}).length + ' appareil(s) · ' + (issue.categorie || '') + '_\n\n'
      + '## La cause\n\n' + (e.cause || '') + '\n\n`' + s.fichier + '` ligne ' + s.ligne + '\n\n'
      + '## Ce que change ce correctif\n\n' + (p.pourquoi || '') + '\n\n'
      + '## À vérifier avant de fusionner\n\n' + (p.verifier || '') + '\n\n'
      + '```\nnode scripts/verifier-syntaxe.js\nnode scripts/verifier-lien-jeton.js\nnode scripts/verifier-explique.js\n```\n\n'
      + '## Ce que cette proposition n\'a pas fait\n\n'
      + '- Elle n\'est **pas** fusionnée, et rien dans le serveur ne peut la fusionner.\n'
      + '- Le correctif a été écrit par Claude à partir du code du dépôt ; il a été vérifié analysable, pas vérifié juste. Risque annoncé : **' + (p.risque || '?') + '**.\n'
      + '- Personne n\'a exécuté l\'application avec ce correctif.\n\n'
      + '---\nProposition ouverte depuis la Tour de contrôle par **' + req.tourUser.nom + '** le '
      + new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + '.\n';
    const pr = await gh('/pulls', {
      method: 'POST',
      body: JSON.stringify({ title: monStr(p.titre, 120), head: branche, base: 'main', body: corps, draft: true })
    });

    issue.proposition = {
      url: pr.html_url, numero: pr.number, branche: branche,
      titre: monStr(p.titre, 120), pourquoi: monStr(p.pourquoi, 900), verifier: monStr(p.verifier, 400),
      risque: ['faible', 'moyen', 'eleve'].includes(p.risque) ? p.risque : 'moyen',
      fichiers: Object.keys(fichiers), ts: Date.now(), par: req.tourUser.nom
    };
    issue.historique = (issue.historique || []).concat([{ ts: Date.now(), par: req.tourUser.nom, action: 'Correction proposée', note: '#' + pr.number + ' ' + monStr(p.titre, 120) }]).slice(-30);
    monSave();
    console.log('Tour :', req.tourUser.nom, 'a proposé une correction pour', issue.id, '→', pr.html_url);
    res.json({ ok: true, proposition: issue.proposition });
  } catch (err) {
    const st = err && err.status;
    if (st === 401) return res.status(502).json({ error: 'Clé Claude refusée par Anthropic — expirée ou incomplète. Sur le serveur : bash server/set-claude.sh' });
    if (st === 429 || st === 529) return res.status(503).json({ error: 'Service IA saturé — réessaie dans une minute' });
    if (err && err.statutGh) return res.status(502).json({ error: err.message });
    console.error('proposer :', err && err.message);
    res.status(500).json({ error: 'Erreur du serveur' });
  }
});

// santé globale (admin) : reprend /health + uptime + répartition des problèmes
app.get('/api/monitor/sante', monAdmin, (req, res) => {
  const vis = monIssues.filter(i => req.tourUser.apps.includes(monAppDeTag(i.app)));   // même filtre que /issues : des chiffres qui contredisent la liste ne servent personne
  const compteurs = { nouveau: 0, encours: 0, corrige: 0, ignore: 0 };
  for (const i of vis) compteurs[i.statut] = (compteurs[i.statut] || 0) + 1;
  res.json({ ok: true, uptime: Math.round(process.uptime()), subs: Object.keys(subs).length, email: !!mailer, boite: !!(config.imap && config.imap.user), stripe: !!(config.stripe && config.stripe.secretKey), bugs1h: bugTimes.filter(t => t > Date.now() - 3600000).length, bugs24h: bugTimes.filter(t => t > Date.now() - 86400000).length, lastRefus, issues: compteurs, issuesTotal: vis.length });
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
    client.on('error', () => {});   // une erreur émise en événement tuerait le processus : on l'absorbe, l'échec est déjà traité par le try/catch
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
    c.on('error', () => {});   // une erreur émise en événement tuerait le processus : on l'absorbe, l'échec est déjà traité par le try/catch
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
    const tr = nodemailer.createTransport({ host: supportBox.smtpHost, port: supportBox.smtpPort, secure: supportBox.smtpPort === 465, auth: { user: supportBox.email, pass: supportBox.pass }, connectionTimeout: 9000, greetingTimeout: 9000 });
    // le beau modèle TeamOP (logo, mise en page) — le texte brut reste en secours
    const echap = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = mailTeamOP({
      chip: 'Message', chipBg: '#F1EBFC', chipColor: '#6D3FC4',
      titre: obj,
      corpsHtml: echap(corps).replace(/\n/g, '<br>'),
      boutonTxt: 'Mon espace client', boutonUrl: 'https://teamop.fr/espace.html',
      bouton2Txt: 'Répondre à TEAM OP', bouton2Url: 'mailto:' + supportBox.email
    });
    await tr.sendMail({ from: '"TEAM OP" <' + supportBox.email + '>', to: dest, subject: obj, text: corps, html,
      attachments: [] });
  } catch (e) { return res.status(500).json({ error: 'envoi refusé : ' + String(e.message || e).slice(0, 140) }); }
  mailsJournal(dest, obj, corps, false, '');
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
  if (entFermes.emails.includes(email)) return res.status(410).json({ error: 'compte fermé par TeamOP' });
  if (Object.keys(clientsData).length >= 2000 && !clientsData[email]) return res.json({ ok: true });   // cap silencieux
  const prev = clientsData[email] || {};
  const demandes = (Array.isArray(b.demandes) ? b.demandes.slice(0, 20) : []).map(d => ({
    app: monStr(d && d.app, 60), formule: monStr(d && d.formule, 40), statut: monStr(d && d.statut, 20), date: parseInt(d && d.date, 10) || 0, besoin: monStr(d && d.besoin, 200), users: monStr(d && d.users, 10),
    code: monStr(d && d.code, 40), lien: monStr(d && d.lien, 60) }));
  clientsData[email] = {
    email, nom: monStr(b.nom, 80), prenom: monStr(b.prenom, 40) || prev.prenom || '', nomFam: monStr(b.nomFam, 40) || prev.nomFam || '',
    tel: monStr(b.tel, 30) || prev.tel || '', entreprise: monStr(b.entreprise, 80),
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
  // Un code promo activé sur le SITE se relaie à l'espace de l'application :
  // même échéance, l'app se débloque toute seule à sa prochaine vérification.
  try {
    const pc = monStr(b.promoCode, 40).toUpperCase(), pf = monStr(b.promoFin, 10);
    if (pc && /^\d{4}-\d{2}-\d{2}$/.test(pf)) {
      const esp = Object.values(espacesReg).find(x => (x.email || '').toLowerCase() === email);
      let tEsp = esp && esp.t;
      if (esp && !tEsp) { try { tEsp = String(JSON.parse(Buffer.from(esp.code, 'base64').toString('utf8')).t || ''); } catch (e2) {} }
      if (tEsp) {
        const u = promoUsages[pc] || { n: 0, equipes: {} };
        if (!u.equipes[tEsp]) { u.n++; u.equipes[tEsp] = { date: new Date().toISOString().slice(0, 10), finLe: pf }; promoUsages[pc] = u; savePromoUsages(); console.log('code promo du site relayé →', pc, tEsp, 'fin', pf);
          const pDef = (config.promos || []).find(x => String(x.code || '').trim().toUpperCase() === pc);
          mailPromoActive(tEsp, pc, pf, (pDef && ['pro', 'business', 'premium'].includes(pDef.formule)) ? pDef.formule : 'premium'); }
        else if (pf > (u.equipes[tEsp].finLe || '')) { u.equipes[tEsp].finLe = pf; savePromoUsages(); }
      }
    }
  } catch (e) {}
  // Nouvelle demande d'application → e-mail au patron (destinataire : config.notifDemandes,
  // sinon l'expéditeur SMTP). Au plus 1 mail par demande nouvellement apparue.
  try {
    const avant = (prev.demandes || []).length;
    if (mailer && demandes.length > avant) {
      const dest = (config.notifDemandes || config.smtp.from || config.smtp.user);
      const nv = demandes.slice(avant);
      // ── Circuit automatique : l'espace est créé (ou retrouvé) tout de suite,
      //    le lien part au client, et le patron reçoit le récapitulatif complet.
      const dFormule = [...nv].reverse().find(d => formuleDeLabel(d.formule)) || {};
      const dCode = [...nv].reverse().find(d => d.code) || {};
      const dLien = [...nv].reverse().find(d => d.lien) || {};
      const dUsers = [...nv].reverse().find(d => d.users) || {};
      // code teste : c'est LUI qui dit la formule à laquelle le client a droit
      let promoDef = null;
      if (dCode.code) {
        const c = String(dCode.code).trim().toUpperCase();
        const p = (config.promos || []).find(x => String(x.code || '').trim().toUpperCase() === c);
        if (p) promoDef = { code: c, formule: ['pro', 'business', 'premium'].includes(p.formule) ? p.formule : 'premium', mois: Math.max(1, Number(p.mois) || 1), max: p.maxUtilisations };
      }
      const cli = clientsData[email];
      const prenomC = cli.prenom || String(cli.nom || '').trim().split(/\s+/)[0] || '';
      const nomFamC = cli.nomFam || String(cli.nom || '').trim().split(/\s+/).slice(1).join(' ') || '';
      const auto = espaceAutoPour(email, cli.entreprise || cli.nom || '',
        promoDef ? promoDef.formule : dFormule.formule, dUsers.users, dLien.lien, prenomC, nomFamC);
      // lien de bienvenue : il porte le code de l'espace, pas son nom (voir /api/espaces/relance)
      const eAuto = espacesReg[auto.slug];
      const lien = (eAuto && eAuto.code) ? lienEspaceCode(eAuto) : 'https://teamop.fr/connexion.html';
      // activation du code pour cet espace : la formule est offerte, sans carte bancaire
      let promoActif = null;
      if (promoDef) { const eEsp = espacesReg[auto.slug];
        if (eEsp && eEsp.codePromo !== promoDef.code) { eEsp.codePromo = promoDef.code;
          try { fs.writeFileSync(ESPACES_PATH, JSON.stringify(espacesReg)); } catch (err) {} } }
      if (promoDef && auto.t) {
        const u = promoUsages[promoDef.code] || { n: 0, equipes: {} };
        const deja = u.equipes[auto.t];
        if (deja) promoActif = Object.assign({}, promoDef, { finLe: deja.finLe });
        else if (!(promoDef.max && u.n >= promoDef.max)) {
          const dF = new Date(); dF.setMonth(dF.getMonth() + promoDef.mois);
          const finLe = dF.toISOString().slice(0, 10);
          u.n++; u.equipes[auto.t] = { date: new Date().toISOString().slice(0, 10), finLe };
          promoUsages[promoDef.code] = u; savePromoUsages();
          promoActif = Object.assign({}, promoDef, { finLe });
        }
      }
      const promoLib = promoActif ? ({ pro: 'Pro', business: 'Business', premium: 'Business Premium' }[promoActif.formule] || promoActif.formule) : '';
      // les demandes qui viennent d'arriver sont marquées traitées (le lien est parti)
      for (let i = avant; i < demandes.length; i++) clientsData[email].demandesTraitees[i] = { par: 'auto — lien envoyé', ts: Date.now() };
      cliSave();
      const texte = 'Nouvelle demande d\'application sur teamop.fr\n\n' +
        'Entreprise : ' + (clientsData[email].entreprise || clientsData[email].nom || email) + '\n' +
        'Contact : ' + (clientsData[email].nom || '—') + '\n' +
        'E-mail : ' + email + '\n' +
        'Téléphone : ' + (clientsData[email].tel || 'non renseigné') + '\n\n' +
        nv.map(d => '• ' + (d.app || 'Application') + (d.formule ? ' — formule « ' + d.formule + ' »' : ' — formule non précisée') + (d.users ? '\n  Utilisateurs souhaités : ' + d.users : '') + (d.besoin && d.besoin !== 'x' ? '\n  Besoin : ' + d.besoin : '')).join('\n') +
        '\n\n── Traité automatiquement ──\n' +
        (auto.neuf ? 'Espace créé : « ' + auto.nom + ' »\n' : 'Espace EXISTANT retrouvé : « ' + auto.nom + ' » (ses données sont conservées)\n') +
        'Lien envoyé au client : ' + lien + '\n' +
        'Nom à taper sur la page de connexion : « ' + auto.nom + ' »\n' +
        (auto.neuf ? 'Première connexion : identifiant « ' + auto.ident + ' » · mot de passe provisoire « ' + auto.mdp + ' » (son nom + !!) — l\'app lui fait choisir son vrai mot de passe.\n'
                   : 'Connexion : ses identifiants habituels.\n') +
        (promoActif ? '🎁 Code teste « ' + promoActif.code + ' » activé : ' + promoLib + ' offert jusqu\'au ' + promoActif.finLe + ' — espace débloqué SANS paiement.'
          : (dCode.code && !promoDef ? '⚠️ Code « ' + dCode.code + ' » INCONNU — ignoré.\n' : '') +
            (auto.formule ? 'Formule enregistrée : ' + auto.formule + ' × ' + auto.quantite + ' — se débloque au paiement (ou code promo).'
                          : 'Formule non précisée par le client → à attribuer dans ta Tour (Abonnements).')) +
        '\n\nTout est visible dans ta Tour de contrôle : https://teamop.fr/tour.html';
      mailerEnvoi({ from: config.smtp.from || config.smtp.user, to: dest,
        subject: '📥 Demande traitée automatiquement — ' + (clientsData[email].entreprise || email), text: texte })
        .then(() => console.log('mail demande envoyé →', masqueMail(dest), '(' + nv.map(d => d.app).join(', ') + ')'))
        .catch(e => console.error('mail demande:', e.message));
      // e-mail au client : son lien de connexion, généré automatiquement
      const premiereCo = auto.neuf
        ? 'Première connexion :\n• Identifiant : ' + auto.ident + ' (votre prénom)\n• Mot de passe provisoire : ' + auto.mdp + ' (votre nom + « !! »)\n' +
          'À votre première connexion, l\'application vous fait choisir votre vrai mot de passe — ensuite, ce sont vos identifiants pour toujours.\n'
        : 'Connectez-vous avec vos identifiants habituels.\n';
      const accuse = 'Bonjour,\n\n' +
        'Bonne nouvelle : votre espace « ' + auto.nom + ' » est prêt.\n\n' +
        'Votre lien de connexion :\n' + lien + '\n' +
        '(ou tapez « ' + auto.nom + ' » sur teamop.fr/connexion.html)\n\n' + premiereCo +
        (promoActif ? '\n🎁 Votre code « ' + promoActif.code + ' » est activé : formule ' + promoLib + ' offerte jusqu\'au ' + promoActif.finLe + ' — aucune carte bancaire requise.\n' : '') +
        '\nEnsuite, créez les comptes de vos collègues dans Administration → Utilisateurs.\n\n' +
        '— L\'équipe TEAM OP · teamop.fr';
      const premiereCoHtml = auto.neuf
        ? MAIL_BLOCS.ident(auto.ident, auto.mdp) + '<br><br>'
        : 'Connectez-vous avec vos <b>identifiants habituels</b>.<br><br>';
      const payer = promoActif
        ? '🎁 Votre code « ' + promoActif.code + ' » est activé : formule <b>' + promoLib + '</b> offerte jusqu\'au <b>' + promoActif.finLe + '</b> — aucune carte bancaire requise.<br>'
        : (auto.formule && auto.formule !== 'gratuit')
        ? '💳 Votre formule « ' + (dFormule.formule || auto.formule) + ' » s\'activera dès le paiement de votre abonnement (Mon espace client → Mon abonnement). En attendant, l\'application fonctionne en mode Découverte.<br>'
        : '';
      const accuseHtml = mailTeamOP({
        chip: 'Accès prêt',
        titre: 'Votre application est prête 🎉',
        corpsHtml: 'Bonjour,<br>bonne nouvelle : votre espace « <b>' + auto.nom + '</b> » est prêt.<br><br>' +
          '<b>Votre lien de connexion :</b><br><a href="' + lien + '" style="color:#34A97E">' + lien.replace('https://', '') + '</a><br>' +
          '<span style="color:#8fa3c8;font-size:13px">(ou tapez « <b>' + auto.nom + '</b> » sur teamop.fr → Se connecter)</span><br><br>' +
          premiereCoHtml +
          'Ensuite, créez les comptes de vos collègues dans <b>Administration → Utilisateurs</b>.<br>' + payer,
        frise: [
          { titre: 'Reçue', sous: 'aujourd\'hui', fait: true },
          { titre: 'Acceptée', sous: 'espace créé', fait: true },
          { titre: 'Connectez-vous', sous: 'avec votre lien', fait: false }
        ],
        boutonTxt: 'Ouvrir mon application', boutonUrl: lien,
        bouton2Txt: 'Mon espace client', bouton2Url: 'https://teamop.fr/espace.html'
      });
      mailerEnvoi({ from: config.smtp.from || config.smtp.user, to: email,
        subject: '🔗 Votre lien de connexion est prêt — TEAM OP', text: accuse, html: accuseHtml })
        .then(() => console.log('lien de connexion envoyé →', masqueMail(email))   /* jamais le lien : il porte la clé d'équipe */)
        .catch(e => console.error('mail lien:', e.message));
      // et son « Mon espace » sur le site passe à : Accès activé · OP GESTION active · abonnement affiché
      const planLbl = promoActif ? promoLib : (dFormule.formule || FORMULE_LBL[auto.formule] || '');
      fbMajFicheClient(email, Object.assign({ status: 'fourni', apps: ['elan'] },
        planLbl ? { plan: planLbl, planStatus: 'actif' } : {})).catch(() => {});
    }
  } catch (e) { console.error('notif demande:', e && e.message); }
  res.json({ ok: true });
});
// lecture depuis le contrôle (patron ET collaborateurs)
/* ══ LES VRAIS COMPTES DU SITE, LUS CHEZ FIREBASE ══════════════════════════════════════
   /api/monitor/clients ci-dessous est bâtie sur clientsData, qui ne se remplit qu'à la
   PREMIÈRE CONNEXION d'une entreprise. Un compte créé sur espace.html et jamais utilisé
   pour ouvrir un espace n'y figure donc pas : il existe chez Firebase et n'apparaît NULLE
   PART dans la Tour. C'est ce trou qui rendait le ménage impossible — on retrouvait ces
   comptes dans le trousseau de son navigateur, plus dans la console.

   Cette route interroge Firebase directement, et ne rend que ce qu'il faut pour trier :
   l'adresse, les dates, et si un espace lui est rattaché. Firebase ne rend pas les mots de
   passe et on ne demande rien d'autre. Réservée à la Tour (monAdmin) : ce sont des adresses
   de clients réels. */
app.get('/api/monitor/comptes-site', monAdmin, async (req, res) => {
  const tok = await fbAdminJeton();
  if (!tok) return res.status(503).json({ error: 'clé admin Firebase absente sur le serveur (firebase-admin.json)' });
  /* Les fiches d'inscription, lues EN UNE PASSE puis croisées par uid. Une requête par
     compte aurait fait des centaines d'allers-retours ; et sans elles on n'a que l'adresse,
     alors qu'il faut le nom de la personne et son entreprise pour supprimer sans se tromper. */
  const fiches = {};
  const val = f => f && (f.stringValue !== undefined ? f.stringValue
    : f.integerValue !== undefined ? f.integerValue
    : f.timestampValue !== undefined ? f.timestampValue : '');
  try {
    let pt = '';
    for (let tour = 0; tour < 20; tour++) {
      const r = await fbAdminFetch(fsBase() + '/teamop_requests?pageSize=300' + (pt ? '&pageToken=' + encodeURIComponent(pt) : ''), { method: 'GET' }, tok);
      if (!r.ok) break;                       // pas de fiches lisibles : on continue sans, l'adresse seule vaut mieux que rien
      const j = await r.json().catch(() => ({}));
      for (const d of (j.documents || [])) {
        const uid = String(d.name || '').split('/').pop();
        const f = d.fields || {};
        fiches[uid] = {
          nom: String(val(f.name) || ((val(f.prenom) + ' ' + val(f.nom)).trim())).slice(0, 80),
          societe: String(val(f.company) || '').slice(0, 80),
          statut: String(val(f.status) || '').slice(0, 30)
        };
      }
      pt = j.nextPageToken || ''; if (!pt) break;
    }
  } catch (e) { /* sans fiches, la liste reste utilisable : on ne bloque pas dessus */ }

  const comptes = []; let anonymes = 0; let pageTok = '';
  try {
    for (let tour = 0; tour < 20; tour++) {
      const url = 'https://identitytoolkit.googleapis.com/v1/projects/' + FB_PROJET
        + '/accounts:batchGet?maxResults=500' + (pageTok ? '&nextPageToken=' + encodeURIComponent(pageTok) : '');
      const r = await fbAdminFetch(url, { method: 'GET' }, tok);
      if (!r.ok) return res.status(502).json({ error: 'Firebase a refusé la lecture (HTTP ' + r.status + ')' });
      const j = await r.json().catch(() => ({}));
      for (const u of (j.users || [])) {
        const mail = String(u.email || '').trim().toLowerCase();
        /* ⛔ LES COMPTES ANONYMES NE SONT PAS DES PERSONNES — ne jamais les lister ici.
           app.html ouvre une session anonyme par appareil (syncAuth), parce que les règles
           Firestore exigent un utilisateur connecté pour synchroniser. Il y en a donc autant
           que d'appareils chez les clients : ils n'ont ni adresse, ni nom, et EN SUPPRIMER UN
           COUPERAIT LA SYNCHRO DE L'APPAREIL CORRESPONDANT. Ils sont comptés, pas montrés. */
        if (!mail) { anonymes++; continue; }
        const fi = fiches[u.localId] || {};
        comptes.push({
          email: mail,
          nom: fi.nom || '',
          societe: fi.societe || '',
          statut: fi.statut || '',
          cree: Number(u.createdAt || 0) || 0,
          derniere: Number(u.lastLoginAt || 0) || 0,
          verifie: !!u.emailVerified,
          desactive: !!u.disabled,
          /* Le point décisif pour trier : ce compte porte-t-il une entreprise avec des
             données, ou n'est-ce qu'un compte d'essai qu'on peut effacer sans rien perdre ? */
          entreprise: clientsData[mail] ? (clientsData[mail].entreprise || clientsData[mail].nom || '') : '',
          aUnEspace: !!clientsData[mail]
        });
      }
      pageTok = j.nextPageToken || ''; if (!pageTok) break;
    }
  } catch (e) { return res.status(502).json({ error: 'lecture Firebase impossible : ' + String(e.message).slice(0, 120) }); }
  comptes.sort((a, b) => (b.cree || 0) - (a.cree || 0));
  res.json({ comptes, total: comptes.length, anonymes });
});

/* Suppression d'un compte du site — patron seulement, et JAMAIS un compte qui porte une
   entreprise : celui-là passe par « Fermer définitivement », qui efface aussi son espace,
   son code d'accès et ses données chiffrées. Effacer le compte seul laisserait un espace
   orphelin que plus personne ne pourrait rouvrir. */
app.post('/api/monitor/comptes-site/supprimer', monPatronStrict, async (req, res) => {
  const email = monStr((req.body || {}).email, 160).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'adresse invalide' });
  if (clientsData[email]) return res.status(409).json({
    error: 'ce compte porte une entreprise — passe par « Fermer définitivement » dans Entreprises, qui efface aussi son espace et ses données'
  });
  const r = await fbSupprimerCompteSite(email);
  // Journal : l'adresse est masquée, on ne met pas de données personnelles dans les logs.
  console.log('compte site supprimé ' + masqueMail(email) + ' : ' + (r.fait ? 'ok' : 'échec — ' + r.motif));
  if (!r.fait) return res.status(400).json({ error: r.motif });
  res.json({ ok: true, detail: r.motif });
});

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
  const visible = i => req.tourUser.apps.includes(monAppDeTag(i.app));   // même filtre que /issues
  const archive = monArchive.filter(visible);
  res.json({ archive, total: archive.length, vivants: monIssues.filter(visible).length });
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
/* ── Le Devis IA tourne sur Gemini, pas sur Claude ────────────────────────────────
   Deux raisons. La première est le prix : Google offre un palier gratuit, et un devis
   n'a pas besoin du modèle le plus cher du marché — c'est de la rédaction structurée à
   partir de prix qu'on lui donne, pas du raisonnement difficile.
   La seconde suit de la première : sur ce palier gratuit, Google se réserve le droit
   d'exploiter ce qu'on lui envoie. On lui envoie donc le strict nécessaire pour
   chiffrer — la prestation — et RIEN qui identifie le client. Ni son nom, ni son
   adresse : ils ne servent pas à faire un prix, et ils ne sont pas à nous.
   La clé vit UNIQUEMENT dans /opt/teamop/config.json → "gemini" :
     "gemini": { "cleApi": "…", "modele": "gemini-3.7-flash" }
   Elle se pose avec server/set-gemini.sh, qui la vérifie avant de l'écrire. */
function geminiConf() { return config.gemini || {}; }
function geminiActif() { return !!geminiConf().cleApi; }
function geminiModele() { return String(geminiConf().modele || 'gemini-3.7-flash'); }
async function geminiGenere(sys, texte, schema) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
    + encodeURIComponent(geminiModele()) + ':generateContent?key=' + encodeURIComponent(geminiConf().cleApi);
  const r = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: texte }] }],
      systemInstruction: { parts: [{ text: sys }] },
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema }
    })
  });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) {}
  if (!r.ok) {
    /* Google répond 400 pour une clé invalide, pas 401 : on lit le motif plutôt que le
       code, sinon « clé morte » et « requête malformée » se confondent. */
    const motif = (j && j.error && (j.error.status || j.error.message)) || ('HTTP ' + r.status);
    const e = new Error(String(motif).slice(0, 200));
    e.geminiCle = /API_KEY_INVALID|API key not valid/i.test(txt);
    e.geminiQuota = r.status === 429 || /RESOURCE_EXHAUSTED/i.test(txt);
    e.geminiModele = r.status === 404 || /NOT_FOUND/i.test(txt);
    throw e;
  }
  const part = j && j.candidates && j.candidates[0] && j.candidates[0].content
    && j.candidates[0].content.parts && j.candidates[0].content.parts[0];
  const sortie = part && part.text;
  if (!sortie) throw new Error('réponse vide');
  return JSON.parse(sortie);
}
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
  /* L'application n'affiche le second bouton que si l'entreprise y a droit. */
  if (team) { rep.offre = devisOffre(team); rep.approfondi = devisActif() && devisTeamOk(team) && rep.offre === 'deux'; }
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

/* Génération d'un devis structuré par Claude — l'équivalent de geminiGenere.
   `output_config.format` impose le schéma, comme `responseSchema` chez Google :
   la réponse est du JSON conforme, pas du texte à deviner.
   Une seule clé alimente désormais tout : EXPLIQUE, PROPOSE, l'assistant et ce
   générateur. Une clé de moins à poser, à renouveler et à surveiller. */
/* Deux moteurs, une seule clé. Haiku est inclus dans l'abonnement ; Sonnet est
   le supplément payant. C'est le même appel — seul l'identifiant de modèle
   change, donc aucune dépendance ni panne supplémentaire à surveiller. */
const DEVIS_MOTEURS = {
  haiku:  { modele: 'claude-haiku-4-5-20251001', libelle: 'Haiku 4.5 · inclus' },
  sonnet: { modele: 'claude-sonnet-5',           libelle: 'Sonnet 5 · supplément' },
};
const DEVIS_MOTEUR_DEFAUT = 'haiku';
/* Trois offres possibles par entreprise :
     haiku  — inclus seulement
     sonnet — supplément seulement
     deux   — les deux, l'utilisateur choisit devis par devis */
const DEVIS_OFFRES = { haiku: 1, sonnet: 1, deux: 1 };
function devisOffre(team) {
  const x = devisAcces[String(team || '').trim().slice(0, 80)];
  const m = (x && x.moteur) || DEVIS_MOTEUR_DEFAUT;
  return DEVIS_OFFRES[m] ? m : DEVIS_MOTEUR_DEFAUT;
}
/* Deux étages de décision :
     — le patron ouvre (ou non) le supplément à une entreprise ;
     — l'utilisateur choisit ensuite, devis par devis, rapide ou approfondi.
   Sans supplément, « approfondi » est simplement ignoré : personne ne peut
   s'octroyer Sonnet en modifiant sa requête. */
function devisMoteurChoisi(team, profond) {
  const o = devisOffre(team);
  if (o === 'sonnet') return 'sonnet';
  if (o === 'deux') return profond ? 'sonnet' : DEVIS_MOTEUR_DEFAUT;
  return DEVIS_MOTEUR_DEFAUT;
}
function devisMoteur(team) {
  const t = devisAcces[String(team || '').trim().slice(0, 80)];
  const m = (t && t.moteur) || DEVIS_MOTEUR_DEFAUT;
  return DEVIS_MOTEURS[m] ? m : DEVIS_MOTEUR_DEFAUT;
}

async function claudeGenere(sys, texte, schema, moteur) {
  const m = DEVIS_MOTEURS[moteur] || DEVIS_MOTEURS[DEVIS_MOTEUR_DEFAUT];
  const msg = await getAnthropic().messages.create({
    model: m.modele, max_tokens: 4000, system: sys,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: texte }]
  });
  if (msg.stop_reason === 'refusal') { const e = new Error('demande refusée'); e.refus = true; throw e; }
  const txt = (msg.content.find(b => b.type === 'text') || {}).text || '';
  return JSON.parse(txt);
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
    if (!devisActif()) return res.status(503).json({ error: 'Devis IA non configuré sur le serveur — sur le serveur : bash server/set-claude.sh' });
    /* « client » n'est plus lu : le nom et l'adresse d'un client ne servent pas à faire
       un prix, et n'ont donc rien à faire chez un tiers. Le champ reste accepté dans le
       corps pour ne pas casser les applications déjà déployées ; il est ignoré. */
    const { code, team, demande, contexte } = req.body || {};
    const teamKey = String(team || '').trim().slice(0, 80);
    const okEquipe = devisTeamOk(teamKey);
    const okCode = !!(code && devisConf().secretDevis && String(code) === String(devisConf().secretDevis));
    if (!okEquipe && !okCode) return res.status(401).json({ error: "Devis IA non activé pour cette entreprise — demande l'activation à TeamOP" });
    if (!demande || String(demande).trim().length < 5) return res.status(400).json({ error: 'Décris la prestation à chiffrer' });
    if (devisUtilises() >= devisQuotaJour()) return res.status(429).json({ error: 'Quota du jour atteint (' + devisQuotaJour() + ' devis) — réessaie demain' });

    const sys = "Tu prépares des devis pour une entreprise française de gestion de nuisibles (dératisation, désinsectisation, désinfection, dépigeonnage) et petits travaux associés. À partir de la demande, produis un devis réaliste et sobre : des lignes claires (désignation précise, quantité, prix unitaire HT en euros, cohérent avec le marché français), la main d'œuvre et le déplacement en lignes séparées quand c'est pertinent, TVA 20 par défaut (10 seulement pour des travaux d'amélioration d'un logement de plus de 2 ans). « remarque » : 1 ou 2 phrases utiles pour le client (garantie, nombre de passages, conditions). Pas de lignes de remplissage.";
    const devis = await claudeGenere(sys,
      'Demande : ' + String(demande).slice(0, 2000)
        + (contexte ? '\nContexte : ' + String(contexte).slice(0, 1000) : ''),
      DEVIS_SCHEMA, devisMoteurChoisi(teamKey, (req.body || {}).profond));
    if (!devis || !Array.isArray(devis.lignes) || !devis.lignes.length) return res.status(502).json({ error: 'Réponse illisible, réessaie' });
    devisCompte();
    if (okEquipe) { const t = devisAcces[teamKey]; t.n = (t.n || 0) + 1; t.dernier = new Date().toISOString().slice(0, 10); saveDevisAcces(); }
    res.json({ ok: true, devis, restants: Math.max(0, devisQuotaJour() - devisUtilises()) });
  } catch (e) {
    if (e && e.refus) return res.status(422).json({ error: 'Demande refusée — reformule-la.' });
    if (e && e.geminiModele) return res.status(502).json({ error: 'Modèle Gemini introuvable — relance server/set-gemini.sh pour en choisir un disponible' });
    if (e && e.geminiQuota) return res.status(503).json({ error: 'Palier gratuit Gemini saturé pour le moment — réessaie dans quelques minutes' });
    console.error('devis IA:', e && e.message);
    res.status(500).json({ error: 'Erreur du serveur de devis' });
  }
});

// ── Tour de contrôle : activation du Devis IA entreprise par entreprise.
//    Le patron active/désactive un espace depuis tour.html — rien à donner aux clients.
/* Le patron pense en entreprises, pas en codes d'espace : on joint le nom à
   chaque code pour que la Tour de contrôle affiche « teamop teste » et non
   « justin ». Le code reste montré en second — il sert au dépannage. */
/* Toutes les entreprises connues, code d'espace et nom. Sans cette liste, le
   patron devait retrouver et retaper un code à la main — et se tromper, puisque
   celui qu'utilise l'application n'est pas forcément celui qu'il croit. */
function espacesConnus() {
  const out = []; const vus = new Set();
  /* Les espaces qui se connectent vraiment. cnxData est indexé par code
     d'équipe et se remplit à chaque connexion d'application : c'est la seule
     source réellement peuplée. espacesReg, lui, n'est alimenté que par une
     inscription manuelle que personne ne fait — d'où la liste vide. */
  for (const tc of Object.keys(cnxData)) {
    if (!tc || vus.has(tc)) continue;
    vus.add(tc);
    let e = null; try { e = espaceParT(tc); } catch (err) {}
    const nom = (e && espNomPropre(e)) || '';
    /* Sans nom d'entreprise, c'est un espace technique — environnement de test,
       ancienne bascule. Il n'a rien à faire dans une liste de clients. On ne le
       garde que s'il est déjà activé : couper un accès en cours par simple
       ménage d'affichage serait pire que le bruit. */
    if (!nom && !(devisAcces[tc] && devisAcces[tc].actif)) continue;
    let vu = null; try { vu = (cnxResume(tc) || {}).dernier || null; } catch (err) {}
    out.push({ t: tc, nom: nom, vu: vu });
  }
  for (const slug of Object.keys(espacesReg)) {
    let e = null;
    try { e = espaceAJour(slug) || espacesReg[slug]; } catch (err) { e = espacesReg[slug]; }
    let t = ''; try { t = espaceT(e); } catch (err) {}
    if (!t || vus.has(t)) continue;
    vus.add(t);
    out.push({ t: t, nom: espNomPropre(e) || slug });
  }
  /* Une entreprise déjà activée doit rester visible même si elle ne s'est
     jamais connectée depuis. */
  for (const tc of Object.keys(devisAcces)) {
    if (vus.has(tc)) continue;
    vus.add(tc);
    let e = null; try { e = espaceParT(tc); } catch (err) {}
    out.push({ t: tc, nom: (e && espNomPropre(e)) || '', vu: null });
  }
  out.sort(function (a, b) { return (a.nom || a.t).localeCompare(b.nom || b.t, 'fr'); });
  return out;
}
function nomsDesEspaces(codes) {
  const noms = {};
  for (const t of codes) {
    let e = null;
    try { e = espaceParT(t); } catch (err) {}
    noms[t] = (e && espNomPropre(e)) || '';
  }
  return noms;
}
app.get('/api/monitor/devisia', monAdmin, (req, res) => {
  res.json({ ok: true, cle: devisActif(), quotaJour: devisQuotaJour(), utilises: devisUtilises(), equipes: devisAcces, noms: nomsDesEspaces(Object.keys(devisAcces)), entreprises: espacesConnus() });
});
app.post('/api/monitor/devisia', monAdmin, (req, res) => {
  const b = req.body || {};
  const team = String(b.teamId || '').trim().slice(0, 80);
  if (!team) return res.status(400).json({ error: "code d'espace requis" });
  if (b.supprimer) delete devisAcces[team];
  else if (b.actif) devisAcces[team] = { ...(devisAcces[team] || {}), actif: true, depuis: (devisAcces[team] || {}).depuis || new Date().toISOString().slice(0, 10) };
  else if (devisAcces[team]) devisAcces[team].actif = false;
  if (b.moteur && DEVIS_OFFRES[b.moteur] && devisAcces[team]) devisAcces[team].moteur = b.moteur;
  saveDevisAcces();
  res.json({ ok: true, equipes: devisAcces, noms: nomsDesEspaces(Object.keys(devisAcces)) });
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

/* ── 🎁 Les codes promo, vus depuis la Tour ──────────────────────────────────────────────
   Les codes sont définis dans config.promos (sur le VPS) et leurs usages vivent dans
   promos-usages.json : quel espace, à quelle date, jusqu'à quand. Rien de tout cela
   n'apparaissait dans la console — on ne pouvait donc pas savoir qui bénéficiait d'une
   formule offerte, ni jusqu'à quand, ni combien d'utilisations restaient sur un code.

   Chaque usage est rendu avec le NOM de l'espace quand l'annuaire le connaît, parce qu'un
   identifiant « ent-a1b2c3… » ne dit rien à personne. Et « actif » se calcule ici, sur la
   date du jour : un code dont l'échéance est passée ne coûte plus rien et ne doit pas être
   compté comme une formule offerte en cours. */
app.get('/api/monitor/promos', monAdmin, (req, res) => {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const codes = (config.promos || []).map(p => {
    const c = String(p.code || '').trim().toUpperCase();
    const u = promoUsages[c] || { n: 0, equipes: {} };
    const usages = Object.entries(u.equipes || {}).map(([t, e]) => {
      const esp = espaceParT(t);
      return {
        t,
        nom: esp ? (esp.nom || esp.slug || '') : '',
        depuis: (e && e.date) || '',
        finLe: (e && e.finLe) || '',
        actif: !!(e && e.finLe && e.finLe >= aujourdhui)
      };
    }).sort((a, b) => String(b.finLe || '').localeCompare(String(a.finLe || '')));
    return {
      code: c,
      formule: p.formule || '',
      mois: Number(p.mois) || 1,
      maxUtilisations: Number(p.maxUtilisations) || 0,
      utilisations: Number(u.n) || 0,
      restantes: p.maxUtilisations ? Math.max(0, Number(p.maxUtilisations) - (Number(u.n) || 0)) : null,
      actifs: usages.filter(x => x.actif).length,
      usages
    };
  }).sort((a, b) => (b.actifs - a.actifs) || a.code.localeCompare(b.code));
  /* Un code peut avoir été retiré de la configuration alors que des espaces en profitent
     encore : sans cette reprise, ces espaces disparaîtraient de la vue tout en gardant leur
     formule offerte — exactement ce qu'on ne veut pas rater. */
  const connus = new Set(codes.map(c => c.code));
  for (const [c, u] of Object.entries(promoUsages || {})) {
    if (connus.has(c)) continue;
    const usages = Object.entries((u && u.equipes) || {}).map(([t, e]) => {
      const esp = espaceParT(t);
      return { t, nom: esp ? (esp.nom || esp.slug || '') : '', depuis: (e && e.date) || '', finLe: (e && e.finLe) || '', actif: !!(e && e.finLe && e.finLe >= aujourdhui) };
    });
    codes.push({ code: c, formule: '', mois: 0, maxUtilisations: 0, utilisations: Number(u.n) || 0, restantes: null,
      actifs: usages.filter(x => x.actif).length, usages, horsConfig: true });
  }
  res.json({ codes, total: codes.length, actifsTotal: codes.reduce((n, c) => n + c.actifs, 0) });
});

app.post('/api/promo/valider', (req, res) => {
  const { code, teamId, apercu } = req.body || {};
  const c = String(code || '').trim().toUpperCase();
  if (!c) return res.status(400).json({ error: 'Entre ton code promo' });
  const p = (config.promos || []).find(x => String(x.code || '').trim().toUpperCase() === c);
  if (!p) return res.status(404).json({ error: 'Code promo inconnu' });
  const u = promoUsages[c] || { n: 0, equipes: {} };
  const team = String(teamId || '').slice(0, 80);
  const deja = team && u.equipes[team];
  // un seul code à la fois par espace : si un AUTRE code est encore actif, refus clair
  if (team && !deja) {
    for (const [c2, u2] of Object.entries(promoUsages || {})) {
      const eq2 = u2 && u2.equipes && u2.equipes[team];
      if (c2 !== c && eq2 && eq2.finLe && eq2.finLe >= new Date().toISOString().slice(0, 10))
        return res.status(409).json({ error: 'Un code (« ' + c2 + ' ») est déjà actif sur cet espace jusqu\'au ' + eq2.finLe + ' — un seul code à la fois.' });
    }
  }
  if (!deja && p.maxUtilisations && u.n >= p.maxUtilisations) return res.status(410).json({ error: "Ce code a atteint son nombre maximum d'utilisations" });
  const mois = Math.max(1, Number(p.mois) || 1);
  let finLe;
  if (deja) {
    finLe = deja.finLe;   // le même code retape par la même équipe : on redonne la même échéance
  } else {
    const d = new Date(); d.setMonth(d.getMonth() + mois);
    finLe = d.toISOString().slice(0, 10);
    if (!apercu) { u.n++; if (team) u.equipes[team] = { date: new Date().toISOString().slice(0, 10), finLe }; promoUsages[c] = u; savePromoUsages();
      if (team) mailPromoActive(team, c, finLe, ['pro', 'business', 'premium'].includes(p.formule) ? p.formule : 'premium'); }
  }
  res.json({ ok: true, formule: ['pro', 'business', 'premium'].includes(p.formule) ? p.formule : 'premium', mois, finLe, dejaUtilise: !!deja });
});

// ── ⏳ Rappel d'échéance : 7 jours avant la fin d'une période offerte, l'entreprise
//    reçoit UN e-mail (modèle orange de la galerie) — jamais deux pour la même
//    échéance (drapeau rappelFin posé sur l'espace).
function rappelsEcheances() {
  try {
    if (!mailer) return;
    const auj = new Date().toISOString().slice(0, 10);
    const lim = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    let touche = false;
    for (const [code, u] of Object.entries(promoUsages || {})) {
      for (const [t, eq] of Object.entries((u && u.equipes) || {})) {
        if (!eq || !eq.finLe || eq.finLe < auj || eq.finLe > lim) continue;   // ni déjà passée, ni encore loin
        const e = Object.values(espacesReg).find(x => {
          if (x.t) return x.t === t;
          try { return String(JSON.parse(Buffer.from(x.code, 'base64').toString('utf8')).t || '') === t; } catch (err) { return false; }
        });
        if (!e || !e.email || e.rappelFin === eq.finLe) continue;   // pas d'adresse, ou déjà prévenu
        e.rappelFin = eq.finLe; touche = true;
        const finFr = eq.finLe.split('-').reverse().join('/');
        mailerEnvoi({ from: config.smtp.from || config.smtp.user, to: e.email,
          subject: '⏳ Votre période offerte se termine bientôt — TEAM OP',
          text: 'Bonjour,\n\nla période offerte par votre code « ' + code + ' » se termine le ' + finFr + '.\nVos données ne bougent pas, quoi qu\'il arrive — mais sans abonnement, l\'application repassera en formule Gratuit.\n\nPour continuer sans coupure : teamop.fr/espace.html → Mon abonnement.\n\n— TEAM OP · teamop.fr',
          html: mailTeamOP({ chip: 'Échéance', chipBg: '#FFF6EE', chipColor: '#B26E12', titre: 'Plus que quelques jours ⏳',
            corpsHtml: 'Bonjour,<br>un petit mot pour vous prévenir à l\'avance : la période offerte par votre code « <b>' + code + '</b> » touche à sa fin.',
            blocHtml: MAIL_BLOCS.echeance(finFr),
            boutonTxt: 'Choisir mon abonnement', boutonUrl: 'https://teamop.fr/espace.html',
            bouton2Txt: 'Ouvrir mon application', bouton2Url: 'https://teamop.fr/app.html' })
        }).then(() => console.log('rappel échéance envoyé →', masqueMail(e.email), '(fin ' + eq.finLe + ')'))
          .catch(err => console.error('rappel échéance:', err.message));
      }
    }
    if (touche) { try { fs.writeFileSync(ESPACES_PATH, JSON.stringify(espacesReg)); } catch (err) {} }
  } catch (e) { console.error('rappelsEcheances:', e.message); }
}
setTimeout(rappelsEcheances, 90 * 1000);      // un premier passage peu après le démarrage
setInterval(rappelsEcheances, 6 * 3600000);   // puis toutes les 6 heures

const PORT = process.env.PORT || 8080;
app.listen(PORT, '127.0.0.1', () => console.log('TeamOP API sur 127.0.0.1:' + PORT));
