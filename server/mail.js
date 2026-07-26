/* ═══════════════════════════════════════════════════════════════════════════
   MESSAGERIE TEAM OP — moteur complet (plusieurs boîtes connectées en même temps)
   Réception (IMAP) : dossiers, liste paginée, lecture, pièces jointes, recherche,
                      lu/non lu, marquage, déplacement, corbeille.
   Envoi (SMTP)     : nouveau message, réponse, réponse à tous, transfert,
                      copie/copie cachée, pièces jointes, copie dans « Envoyés ».
   Brouillons       : enregistrés dans le dossier Brouillons de la boîte.
   Les mots de passe vivent UNIQUEMENT dans le fichier de données du serveur.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_PIECES = 12;
const MAX_PIECES_OCTETS = 12 * 1024 * 1024;   // 12 Mo au total pour un envoi
const PAR_PAGE = 30;

module.exports = function monterMessagerie(app, ctx) {
  const { DATA_DIR, monAdmin, monPatronStrict, monStr } = ctx;
  const BOITES_PATH = path.join(DATA_DIR, 'mail-boites.json');

  /* ── les boîtes connectées ─────────────────────────────────────────────── */
  let boites = [];   // [{ id, email, pass, imapHost, imapPort, smtpHost, smtpPort, nom, ts, par }]
  try { boites = JSON.parse(fs.readFileSync(BOITES_PATH, 'utf8')) || []; } catch (e) {}
  // reprise de l'ancienne boîte support unique, pour ne rien perdre
  try {
    const anc = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'support-box.json'), 'utf8'));
    if (anc && anc.email && !boites.some(b => b.email.toLowerCase() === String(anc.email).toLowerCase())) {
      boites.push({ id: 'b' + crypto.randomBytes(4).toString('hex'), email: anc.email, pass: anc.pass,
        imapHost: anc.imapHost || 'imap.mail.ovh.net', imapPort: anc.imapPort || 993,
        smtpHost: anc.smtpHost || 'smtp.mail.ovh.net', smtpPort: anc.smtpPort || 465,
        nom: 'TEAM OP', ts: anc.ts || Date.now(), par: 'reprise' });
      sauve();
    }
  } catch (e) {}
  function sauve() { try { fs.writeFileSync(BOITES_PATH, JSON.stringify(boites)); } catch (e) { console.error('mail boites:', e.message); } }
  function publique(b) { return { id: b.id, email: b.email, nom: b.nom || '', imapHost: b.imapHost, smtpHost: b.smtpHost, ts: b.ts || 0, par: b.par || '' }; }
  function trouve(id) { return boites.find(b => b.id === String(id || '')) || null; }

  /* ── connexions IMAP : une à la fois par boîte, refermée après usage ──── */
  const filesAttente = new Map();
  function enFile(id, tache) {
    const prec = filesAttente.get(id) || Promise.resolve();
    const suite = prec.then(tache, tache);
    filesAttente.set(id, suite.catch(() => {}));
    return suite;
  }
  async function avecImap(b, tache) {
    return enFile(b.id, async () => {
      const { ImapFlow } = require('imapflow');
      const client = new ImapFlow({ host: b.imapHost, port: b.imapPort || 993, secure: true,
        auth: { user: b.email, pass: b.pass }, logger: false, emitLogs: false });
      try {
        await client.connect();
        return await tache(client);
      } finally { try { await client.logout(); } catch (_) { try { client.close(); } catch (__) {} } }
    });
  }

  /* ── dossiers : rôles spéciaux reconnus (Envoyés, Brouillons, Corbeille…) ── */
  const ROLES = { '\\Sent': 'envoyes', '\\Drafts': 'brouillons', '\\Trash': 'corbeille', '\\Junk': 'indesirables', '\\Archive': 'archives' };
  const NOMS = { inbox: 'Réception', envoyes: 'Envoyés', brouillons: 'Brouillons', corbeille: 'Corbeille', indesirables: 'Indésirables', archives: 'Archives' };
  function roleDe(item) {
    if (item.specialUse && ROLES[item.specialUse]) return ROLES[item.specialUse];
    const p = String(item.path || '').toLowerCase();
    if (p === 'inbox') return 'inbox';
    if (/sent|envoy/.test(p)) return 'envoyes';
    if (/draft|brouillon/.test(p)) return 'brouillons';
    if (/trash|corbeille|deleted/.test(p)) return 'corbeille';
    if (/junk|spam|ind[eé]sirable/.test(p)) return 'indesirables';
    if (/archive/.test(p)) return 'archives';
    return '';
  }
  const cacheDossiers = new Map();   // id boîte -> { ts, liste }
  async function dossiersDe(b, frais) {
    const c = cacheDossiers.get(b.id);
    if (!frais && c && Date.now() - c.ts < 120000) return c.liste;
    const liste = await avecImap(b, async client => {
      const out = [];
      for (const item of await client.list()) {
        if (item.flags && item.flags.has && item.flags.has('\\Noselect')) continue;
        const role = roleDe(item);
        out.push({ chemin: item.path, nom: NOMS[role] || item.name || item.path, role: role });
      }
      // Réception d'abord, puis les dossiers spéciaux dans l'ordre habituel
      const ordre = ['inbox', 'envoyes', 'brouillons', 'archives', 'indesirables', 'corbeille'];
      out.sort((x, y) => {
        const a = ordre.indexOf(x.role), z = ordre.indexOf(y.role);
        if (a !== z) return (a < 0 ? 99 : a) - (z < 0 ? 99 : z);
        return String(x.nom).localeCompare(String(y.nom), 'fr');
      });
      return out;
    });
    cacheDossiers.set(b.id, { ts: Date.now(), liste });
    return liste;
  }
  async function cheminRole(b, role) {
    const d = (await dossiersDe(b)).find(x => x.role === role);
    return d ? d.chemin : null;
  }

  /* ── petits utilitaires ────────────────────────────────────────────────── */
  function pers(list) { return (list || []).map(a => ({ nom: String(a.name || '').slice(0, 80), adr: String(a.address || '').slice(0, 160) })); }
  function adr1(list) { const p = pers(list)[0] || {}; return { nom: p.nom || '', adr: (p.adr || '').toLowerCase() }; }
  function comptePieces(struct) {
    let n = 0;
    (function marche(p) {
      if (!p) return;
      if (Array.isArray(p.childNodes)) p.childNodes.forEach(marche);
      const d = p.disposition && String(p.disposition).toLowerCase();
      const nom = (p.dispositionParameters && p.dispositionParameters.filename) || (p.parameters && p.parameters.name);
      if ((d === 'attachment' || (nom && d !== 'inline')) && p.part) n++;
    })(struct);
    return n;
  }
  function htmlEnTexte(h) {
    if (!h) return '';
    return String(h).replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<head[\s\S]*?<\/head>/gi, ' ').replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&[a-z#0-9]{2,8};/gi, ' ')
      .replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* ═════════════════════ LES BOÎTES ═════════════════════ */
  app.get('/api/monitor/mail/boites', monAdmin, (req, res) => res.json({ boites: boites.map(publique) }));

  app.post('/api/monitor/mail/boites', monPatronStrict, async (req, res) => {
    const { email, pass, imapHost, imapPort, smtpHost, smtpPort, nom } = req.body || {};
    const adr = monStr(email, 160).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adr)) return res.status(400).json({ error: 'adresse invalide' });
    if (!pass) return res.status(400).json({ error: 'mot de passe requis' });
    if (boites.length >= 10 && !boites.some(b => b.email === adr)) return res.status(400).json({ error: '10 boîtes au maximum' });
    const b = { id: 'b' + crypto.randomBytes(4).toString('hex'), email: adr, pass: String(pass).slice(0, 200),
      imapHost: monStr(imapHost, 100) || 'imap.mail.ovh.net', imapPort: parseInt(imapPort, 10) || 993,
      smtpHost: monStr(smtpHost, 100) || 'smtp.mail.ovh.net', smtpPort: parseInt(smtpPort, 10) || 465,
      nom: monStr(nom, 60) || 'TEAM OP', ts: Date.now(), par: req.tourUser.nom };
    try {
      const nodemailer = require('nodemailer');
      await nodemailer.createTransport({ host: b.smtpHost, port: b.smtpPort, secure: b.smtpPort === 465,
        auth: { user: b.email, pass: b.pass }, connectionTimeout: 9000, greetingTimeout: 9000 }).verify();
    } catch (e) { return res.status(400).json({ error: "Connexion d'envoi (SMTP) refusée : " + String(e.message || e).slice(0, 140) }); }
    try {
      const { ImapFlow } = require('imapflow');
      const c = new ImapFlow({ host: b.imapHost, port: b.imapPort, secure: true, auth: { user: b.email, pass: b.pass }, logger: false });
      await c.connect(); await c.logout();
    } catch (e) { return res.status(400).json({ error: 'Connexion de réception (IMAP) refusée : ' + String(e.message || e).slice(0, 140) }); }
    const i = boites.findIndex(x => x.email === adr);
    if (i >= 0) { b.id = boites[i].id; boites[i] = b; } else boites.push(b);
    cacheDossiers.delete(b.id); sauve();
    res.json({ ok: true, boite: publique(b) });
  });

  app.post('/api/monitor/mail/boites/retirer', monPatronStrict, (req, res) => {
    const i = boites.findIndex(b => b.id === (req.body || {}).id);
    if (i < 0) return res.status(404).json({ error: 'boîte introuvable' });
    const email = boites[i].email;
    cacheDossiers.delete(boites[i].id);
    boites.splice(i, 1); sauve();
    res.json({ ok: true, email });
  });

  /* ═════════════════════ DOSSIERS ═════════════════════ */
  app.get('/api/monitor/mail/dossiers', monAdmin, async (req, res) => {
    const out = [];
    for (const b of boites) {
      try {
        const liste = await dossiersDe(b, String(req.query.frais || '') === '1');
        let nonLus = 0;
        try {
          nonLus = await avecImap(b, async client => {
            const inbox = (liste.find(x => x.role === 'inbox') || {}).chemin || 'INBOX';
            const l = await client.getMailboxLock(inbox);
            try { return (await client.search({ seen: false }, { uid: true })).length; } finally { l.release(); }
          });
        } catch (e) {}
        out.push({ boite: publique(b), dossiers: liste, nonLus });
      } catch (e) {
        out.push({ boite: publique(b), dossiers: [], nonLus: 0, erreur: String(e.message || e).slice(0, 140) });
      }
    }
    res.json({ boites: out });
  });

  /* ═════════════════════ LISTE DES MESSAGES ═════════════════════ */
  async function listeDe(b, dossier, page, q) {
    return avecImap(b, async client => {
      const chemin = dossier || 'INBOX';
      const lock = await client.getMailboxLock(chemin);
      try {
        let uids;
        if (q) {
          const t = String(q).slice(0, 120);
          uids = await client.search({ or: [{ subject: t }, { from: t }, { to: t }, { body: t }] }, { uid: true });
        } else {
          uids = await client.search({ all: true }, { uid: true });
        }
        uids = (uids || []).sort((x, y) => y - x);
        const total = uids.length;
        const tranche = uids.slice(page * PAR_PAGE, page * PAR_PAGE + PAR_PAGE);
        const messages = [];
        if (tranche.length) {
          for await (const m of client.fetch({ uid: tranche.join(',') }, { uid: true, envelope: true, flags: true, bodyStructure: true, size: true }, { uid: true })) {
            const env = m.envelope || {};
            const de = adr1(env.from), pour = pers(env.to);
            const fl = m.flags || new Set();
            messages.push({ uid: m.uid, dossier: chemin, boite: b.id,
              de: de.adr, deNom: de.nom, pour: pour.map(p => p.adr).slice(0, 5),
              objet: String(env.subject || '(sans objet)').slice(0, 200),
              ts: env.date ? new Date(env.date).getTime() : 0,
              lu: fl.has ? fl.has('\\Seen') : false, marque: fl.has ? fl.has('\\Flagged') : false,
              repondu: fl.has ? fl.has('\\Answered') : false,
              pieces: comptePieces(m.bodyStructure), taille: m.size || 0 });
          }
        }
        messages.sort((x, y) => (y.ts || 0) - (x.ts || 0));
        return { messages, total, page, pages: Math.max(1, Math.ceil(total / PAR_PAGE)) };
      } finally { lock.release(); }
    });
  }

  app.get('/api/monitor/mail/liste', monAdmin, async (req, res) => {
    const page = Math.max(0, Math.min(200, parseInt(req.query.page, 10) || 0));
    const q = monStr(req.query.q, 120).trim();
    // vue « toutes les boîtes » : les réceptions fusionnées
    if (!req.query.boite || req.query.boite === 'toutes') {
      let messages = [], total = 0; const erreurs = [];
      for (const b of boites) {
        try {
          const inbox = (await cheminRole(b, 'inbox')) || 'INBOX';
          const r = await listeDe(b, inbox, page, q);
          messages = messages.concat(r.messages); total += r.total;
        } catch (e) { erreurs.push(b.email + ' : ' + String(e.message || e).slice(0, 100)); }
      }
      messages.sort((x, y) => (y.ts || 0) - (x.ts || 0));
      return res.json({ messages: messages.slice(0, PAR_PAGE * 2), total, page, pages: Math.max(1, Math.ceil(total / PAR_PAGE)), fusion: true, erreurs });
    }
    const b = trouve(req.query.boite);
    if (!b) return res.status(404).json({ error: 'boîte introuvable' });
    try {
      const chemin = monStr(req.query.dossier, 200) || (await cheminRole(b, 'inbox')) || 'INBOX';
      res.json(await listeDe(b, chemin, page, q));
    } catch (e) { res.status(502).json({ error: 'boîte injoignable : ' + String(e.message || e).slice(0, 140) }); }
  });

  /* ═════════════════════ LECTURE D'UN MESSAGE ═════════════════════ */
  app.get('/api/monitor/mail/message', monAdmin, async (req, res) => {
    const b = trouve(req.query.boite);
    if (!b) return res.status(404).json({ error: 'boîte introuvable' });
    const chemin = monStr(req.query.dossier, 200) || 'INBOX';
    const uid = parseInt(req.query.uid, 10);
    if (!uid) return res.status(400).json({ error: 'message introuvable' });
    try {
      const out = await avecImap(b, async client => {
        const lock = await client.getMailboxLock(chemin);
        try {
          const msg = await client.fetchOne(String(uid), { uid: true, envelope: true, flags: true, source: { maxLength: 4000000 } }, { uid: true });
          if (!msg) return null;
          const { simpleParser } = require('mailparser');
          let p = {};
          try { p = await simpleParser(msg.source); } catch (e) {}
          const env = msg.envelope || {};
          const de = adr1(env.from);
          const texte = String(p.text || '').trim() || htmlEnTexte(typeof p.html === 'string' ? p.html : '');
          const pieces = (p.attachments || []).map((a, i) => ({ idx: i, nom: String(a.filename || 'piece-' + (i + 1)).slice(0, 140), taille: a.size || 0, type: String(a.contentType || '').slice(0, 80) }))
            .filter(a => a.nom).slice(0, MAX_PIECES);
          // à l'ouverture, le message est marqué lu (comme dans une vraie messagerie)
          if (!(msg.flags && msg.flags.has && msg.flags.has('\\Seen'))) { try { await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }); } catch (_) {} }
          return { uid, dossier: chemin, boite: b.id, boiteEmail: b.email,
            de: de.adr, deNom: de.nom, pour: pers(env.to), copie: pers(env.cc),
            objet: String(env.subject || '(sans objet)').slice(0, 300),
            ts: env.date ? new Date(env.date).getTime() : 0,
            texte: texte.slice(0, 40000), html: (typeof p.html === 'string' ? p.html : '').slice(0, 400000),
            pieces, mid: String(env.messageId || '').slice(0, 300),
            marque: msg.flags && msg.flags.has ? msg.flags.has('\\Flagged') : false };
        } finally { lock.release(); }
      });
      if (!out) return res.status(404).json({ error: 'message introuvable' });
      res.json(out);
    } catch (e) { res.status(502).json({ error: 'lecture impossible : ' + String(e.message || e).slice(0, 140) }); }
  });

  /* ═════════════════════ PIÈCE JOINTE ═════════════════════ */
  app.get('/api/monitor/mail/piece', monAdmin, async (req, res) => {
    const b = trouve(req.query.boite);
    if (!b) return res.status(404).json({ error: 'boîte introuvable' });
    const chemin = monStr(req.query.dossier, 200) || 'INBOX';
    const uid = parseInt(req.query.uid, 10), idx = parseInt(req.query.idx, 10);
    if (!uid || !(idx >= 0)) return res.status(400).json({ error: 'pièce introuvable' });
    try {
      const p = await avecImap(b, async client => {
        const lock = await client.getMailboxLock(chemin);
        try {
          const msg = await client.fetchOne(String(uid), { uid: true, source: { maxLength: 26000000 } }, { uid: true });
          if (!msg) return null;
          const { simpleParser } = require('mailparser');
          const parsed = await simpleParser(msg.source);
          const a = (parsed.attachments || [])[idx];
          if (!a) return null;
          return { nom: String(a.filename || 'piece'), type: String(a.contentType || 'application/octet-stream'), buf: a.content };
        } finally { lock.release(); }
      });
      if (!p) return res.status(404).json({ error: 'pièce introuvable' });
      res.setHeader('Content-Type', p.type);
      res.setHeader('Content-Disposition', 'attachment; filename="' + p.nom.replace(/[^\w.\- ]/g, '_') + '"');
      res.send(p.buf);
    } catch (e) { res.status(502).json({ error: 'téléchargement impossible' }); }
  });

  /* ═════════════════════ LU / NON LU / MARQUÉ ═════════════════════ */
  app.post('/api/monitor/mail/flag', monAdmin, async (req, res) => {
    const b = trouve((req.body || {}).boite);
    if (!b) return res.status(404).json({ error: 'boîte introuvable' });
    const { dossier, uid, lu, marque } = req.body || {};
    const u = parseInt(uid, 10);
    if (!u) return res.status(400).json({ error: 'message introuvable' });
    try {
      await avecImap(b, async client => {
        const lock = await client.getMailboxLock(monStr(dossier, 200) || 'INBOX');
        try {
          if (lu === true) await client.messageFlagsAdd(String(u), ['\\Seen'], { uid: true });
          if (lu === false) await client.messageFlagsRemove(String(u), ['\\Seen'], { uid: true });
          if (marque === true) await client.messageFlagsAdd(String(u), ['\\Flagged'], { uid: true });
          if (marque === false) await client.messageFlagsRemove(String(u), ['\\Flagged'], { uid: true });
        } finally { lock.release(); }
      });
      res.json({ ok: true });
    } catch (e) { res.status(502).json({ error: 'action impossible' }); }
  });

  /* ═════════════════════ DÉPLACER / CORBEILLE ═════════════════════ */
  app.post('/api/monitor/mail/deplacer', monAdmin, async (req, res) => {
    const b = trouve((req.body || {}).boite);
    if (!b) return res.status(404).json({ error: 'boîte introuvable' });
    const src = monStr((req.body || {}).dossier, 200) || 'INBOX';
    let dest = monStr((req.body || {}).vers, 200);
    const u = parseInt((req.body || {}).uid, 10);
    if (!u) return res.status(400).json({ error: 'message introuvable' });
    try {
      if ((req.body || {}).role) dest = (await cheminRole(b, monStr((req.body || {}).role, 20))) || dest;
      if (!dest) return res.status(400).json({ error: 'dossier de destination introuvable' });
      if (dest === src) return res.json({ ok: true, deja: true });
      await avecImap(b, async client => {
        const lock = await client.getMailboxLock(src);
        try { await client.messageMove(String(u), dest, { uid: true }); } finally { lock.release(); }
      });
      res.json({ ok: true, vers: dest });
    } catch (e) { res.status(502).json({ error: 'déplacement impossible : ' + String(e.message || e).slice(0, 120) }); }
  });

  // suppression : vers la corbeille ; déjà dans la corbeille → définitive
  app.post('/api/monitor/mail/supprimer', monAdmin, async (req, res) => {
    const b = trouve((req.body || {}).boite);
    if (!b) return res.status(404).json({ error: 'boîte introuvable' });
    const src = monStr((req.body || {}).dossier, 200) || 'INBOX';
    const u = parseInt((req.body || {}).uid, 10);
    if (!u) return res.status(400).json({ error: 'message introuvable' });
    try {
      const corbeille = await cheminRole(b, 'corbeille');
      const definitif = !corbeille || corbeille === src;
      await avecImap(b, async client => {
        const lock = await client.getMailboxLock(src);
        try {
          if (definitif) { await client.messageFlagsAdd(String(u), ['\\Deleted'], { uid: true }); try { await client.messageDelete(String(u), { uid: true }); } catch (_) {} }
          else await client.messageMove(String(u), corbeille, { uid: true });
        } finally { lock.release(); }
      });
      res.json({ ok: true, definitif });
    } catch (e) { res.status(502).json({ error: 'suppression impossible : ' + String(e.message || e).slice(0, 120) }); }
  });

  /* ═════════════════════ ENVOI ═════════════════════ */
  function piecesValides(list) {
    const out = [];
    let total = 0;
    for (const p of (Array.isArray(list) ? list : []).slice(0, MAX_PIECES)) {
      const nom = monStr(p && p.nom, 140).trim(); const b64 = String((p && p.b64) || '');
      if (!nom || !b64) continue;
      const buf = Buffer.from(b64, 'base64');
      total += buf.length;
      if (total > MAX_PIECES_OCTETS) throw new Error('pièces jointes trop lourdes (12 Mo au total)');
      out.push({ filename: nom, content: buf, contentType: monStr(p && p.type, 80) || undefined });
    }
    return out;
  }
  function adrListe(v) {
    return String(v || '').split(/[,;]/).map(x => x.trim()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.replace(/^.*</, '').replace(/>.*$/, ''))).slice(0, 20);
  }

  app.post('/api/monitor/mail/envoyer', monAdmin, async (req, res) => {
    const b = trouve((req.body || {}).boite) || boites[0];
    if (!b) return res.status(503).json({ error: 'aucune boîte connectée' });
    const to = adrListe((req.body || {}).a), cc = adrListe((req.body || {}).copie), bcc = adrListe((req.body || {}).copieCachee);
    if (!to.length && !cc.length) return res.status(400).json({ error: 'indiquez au moins un destinataire valide' });
    const objet = monStr((req.body || {}).objet, 300).trim() || '(sans objet)';
    const texte = String((req.body || {}).texte || '').slice(0, 60000);
    if (!texte.trim()) return res.status(400).json({ error: 'message vide' });
    let pieces;
    try { pieces = piecesValides((req.body || {}).pieces); }
    catch (e) { return res.status(400).json({ error: String(e.message) }); }

    const rep = (req.body || {}).enReponseA || null;   // { mid }
    const options = { from: '"' + (b.nom || 'TEAM OP') + '" <' + b.email + '>', to: to.join(', '),
      subject: objet, text: texte };
    if (cc.length) options.cc = cc.join(', ');
    if (bcc.length) options.bcc = bcc.join(', ');
    if (pieces.length) options.attachments = pieces;
    if (rep && rep.mid) { options.inReplyTo = String(rep.mid).slice(0, 300); options.references = String(rep.mid).slice(0, 300); }

    const nodemailer = require('nodemailer');
    // 1) le message brut, pour en garder une copie dans « Envoyés »
    let brut = null;
    try {
      const constructeur = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' });
      const info = await constructeur.sendMail(options);
      brut = info.message;
    } catch (e) {}
    // 2) l'envoi réel
    try {
      const t = nodemailer.createTransport({ host: b.smtpHost, port: b.smtpPort, secure: b.smtpPort === 465,
        auth: { user: b.email, pass: b.pass }, connectionTimeout: 12000, greetingTimeout: 12000 });
      await t.sendMail(options);
    } catch (e) { return res.status(500).json({ error: 'envoi refusé : ' + String(e.message || e).slice(0, 160) }); }
    // 3) copie dans « Envoyés » + le message d'origine passe en « répondu »
    let copieOk = false;
    try {
      const envoyes = await cheminRole(b, 'envoyes');
      if (envoyes && brut) await avecImap(b, async client => { await client.append(envoyes, brut, ['\\Seen']); copieOk = true; });
    } catch (e) {}
    if (rep && rep.dossier && rep.uid) {
      try { await avecImap(b, async client => { const l = await client.getMailboxLock(rep.dossier); try { await client.messageFlagsAdd(String(parseInt(rep.uid, 10)), ['\\Answered'], { uid: true }); } finally { l.release(); } }); } catch (e) {}
    }
    res.json({ ok: true, copieEnvoyes: copieOk, par: req.tourUser.nom });
  });

  /* ═════════════════════ BROUILLON ═════════════════════ */
  app.post('/api/monitor/mail/brouillon', monAdmin, async (req, res) => {
    const b = trouve((req.body || {}).boite) || boites[0];
    if (!b) return res.status(503).json({ error: 'aucune boîte connectée' });
    const options = { from: '"' + (b.nom || 'TEAM OP') + '" <' + b.email + '>',
      to: adrListe((req.body || {}).a).join(', '), subject: monStr((req.body || {}).objet, 300) || '(sans objet)',
      text: String((req.body || {}).texte || '').slice(0, 60000) };
    const cc = adrListe((req.body || {}).copie); if (cc.length) options.cc = cc.join(', ');
    try {
      const nodemailer = require('nodemailer');
      const info = await nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' }).sendMail(options);
      const brouillons = await cheminRole(b, 'brouillons');
      if (!brouillons) return res.status(501).json({ error: 'cette boîte n\'a pas de dossier Brouillons' });
      await avecImap(b, async client => { await client.append(brouillons, info.message, ['\\Draft', '\\Seen']); });
      res.json({ ok: true });
    } catch (e) { res.status(502).json({ error: 'brouillon non enregistré : ' + String(e.message || e).slice(0, 140) }); }
  });

  return { boites: () => boites.map(publique) };
};
