/* Vérifie le Devis IA sur Gemini, sur le code RÉELLEMENT LIVRÉ.

   Deux choses comptent ici, et une seule est technique.

   La technique : quand la clé est refusée, le serveur doit le DIRE. Google répond 400
   pour une clé morte, pas 401 — un code qu'on confondrait avec « requête malformée ».
   Ce contrôle appelle la vraie API de Google, avec une clé volontairement fausse.

   L'autre : le nom et l'adresse d'un client ne doivent pas partir chez un tiers. Sur
   le palier gratuit, Google se réserve le droit d'exploiter ce qu'il reçoit. On
   vérifie donc, dans le code livré, que ni l'application ni le serveur ne les envoient.

   Usage : node scripts/verifier-devis-gemini.js   (depuis la racine du dépôt) */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const RACINE = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(RACINE, 'server', 'index.js'), 'utf8');
const APP = fs.readFileSync(path.join(RACINE, 'app.html'), 'utf8');

let echecs = 0, reussites = 0;
function verifie(titre, condition, detail) {
  if (condition) { reussites++; console.log('  ✓ ' + titre); }
  else { echecs++; console.log('  ✗ ' + titre + (detail ? '\n      → ' + detail : '')); }
}

/* ── Ce qui ne doit PAS partir ─────────────────────────────────────────────────── */
console.log("\nCe que le client garde pour lui");
const envoi = APP.match(/body:JSON\.stringify\(\{team:syncTeam\(\)[^}]*\}\)\}\);/);
verifie("l'application n'envoie plus le client au générateur",
  !!envoi && !/client:/.test(envoi[0]), envoi && envoi[0].slice(0, 160));
const deb = SRC.indexOf("app.post('/api/devis/generer'");
const route = SRC.slice(deb, deb + 3000);
verifie('le serveur ne lit pas de client dans le corps reçu',
  !/client:\s*cli/.test(route), (route.match(/.{0,60}client:.{0,60}/) || [''])[0]);
verifie("… et n'en transmet pas au générateur",
  !/cli \?/.test(route), (route.match(/.{0,60}cli \?.{0,60}/) || [''])[0]);

/* ── L'appel réel à Google, avec une clé volontairement fausse ─────────────────── */
console.log('\nQuand Google refuse la clé');
const m = SRC.match(/async function geminiGenere\(sys, texte, schema\) \{[\s\S]*?\n\}/);
if (!m) { console.error('geminiGenere introuvable dans server/index.js'); process.exit(1); }
const geminiGenere = new Function('config', 'fetch', m[0] + `
  ;function geminiConf(){ return config.gemini || {}; }
  ;function geminiModele(){ return String(geminiConf().modele || 'gemini-3.7-flash'); }
  ;return geminiGenere;`)(
  { gemini: { cleApi: 'cle-volontairement-fausse', modele: 'gemini-3.7-flash' } }, fetch);

(async () => {
  let err = null;
  try { await geminiGenere('sys', 'texte', { type: 'object', properties: {} }); }
  catch (e) { err = e; }
  verifie('une clé fausse lève bien une erreur', !!err, 'aucune erreur levée');
  verifie('… reconnue comme un problème de CLÉ, pas de requête',
    !!(err && err.geminiCle), err && ('geminiCle=' + err.geminiCle + ' · ' + err.message));
  verifie('… et pas confondue avec un quota ou un modèle absent',
    !!(err && !err.geminiQuota && !err.geminiModele),
    err && ('quota=' + err.geminiQuota + ' modele=' + err.geminiModele));

  /* ── La route se tait proprement tant qu'aucune clé n'est posée ──────────────── */
  console.log("\nQuand aucune clé n'est configurée");
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'teamop-gem-'));
  const DATA = path.join(TMP, 'data'); fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(path.join(TMP, 'config.json'), JSON.stringify({
    contactEmail: 'contact@teamop.fr',
    vapidPublicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkFbx3gJHtLoRlqPZ6dcMYNqK5AqQwqPDbmXjqSlP8kfxLZlHDvfNbo',
    vapidPrivateKey: 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls'
  }));
  const PORT = 20000 + (process.pid % 20000);
  const serveur = spawn(process.execPath, ['server/index.js'], {
    cwd: RACINE,
    env: Object.assign({}, process.env, { TEAMOP_CONFIG: path.join(TMP, 'config.json'), TEAMOP_DATA: DATA, PORT: String(PORT) }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let sortie = '';
  serveur.stdout.on('data', d => { sortie += d; });
  serveur.stderr.on('data', d => { sortie += d; });

  const BASE = 'http://127.0.0.1:' + PORT;
  for (let i = 0; i < 60; i++) {
    try { await fetch(BASE + '/api/espaces/etat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"t":"x"}' }); break; }
    catch (e) { await new Promise(r => setTimeout(r, 120)); }
  }
  const r = await fetch(BASE + '/api/devis/generer', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team: 'x', demande: 'dératisation restaurant 200 m2' })
  });
  const txt = await r.text();
  verifie('la route le dit franchement (503)', r.status === 503, r.status + ' · ' + txt.slice(0, 120));
  verifie('… et nomme le script qui répare', /set-gemini\.sh/.test(txt), txt.slice(0, 160));
  const etat = await fetch(BASE + '/api/devis/etat').then(x => x.json()).catch(() => ({}));
  verifie("… et l'état n'annonce pas « actif » sans clé", etat && etat.actif === false, JSON.stringify(etat));

  console.log('\n' + (echecs ? '✗ ' + echecs + ' échec(s)' : '✓ ' + reussites + ' vérifications, aucun échec'));
  serveur.kill();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(echecs ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
