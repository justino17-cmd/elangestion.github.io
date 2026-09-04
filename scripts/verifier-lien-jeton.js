/* Vérifie, sur le serveur RÉELLEMENT LIVRÉ (server/index.js, démarré tel quel), que le
   nom d'une entreprise ne rend plus sa clé d'équipe.

   Le serveur est lancé dans un dossier temporaire, avec un annuaire semé à la main :
   on interroge ses vraies routes en HTTP. Rien n'est réécrit ni simulé — un test qui
   rejoue une copie du code ne prouve rien sur le code qui part en production.

   Usage : node scripts/verifier-lien-jeton.js   (depuis la racine du dépôt) */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

/* Un port fixe se heurte à ce qui tourne déjà sur la machine, et deux suites lancées à la
   suite se marchent dessus. Le numéro du processus donne un port propre à chaque exécution. */
const PORT = 20000 + (process.pid % 20000);
const BASE = 'http://127.0.0.1:' + PORT;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'teamop-essai-'));
const DATA = path.join(TMP, 'data');
fs.mkdirSync(DATA, { recursive: true });

/* Un espace comme la Tour en fabrique : le code porte t, k, le nom, l'identifiant
   administrateur — et « m », le mot de passe provisoire EN CLAIR, tel qu'un annuaire
   d'avant le correctif en contenait. On vérifie aussi qu'il en disparaît au démarrage. */
const T = 'gci-4f2a', K = 'cle-equipe-tres-secrete-24';
const codeClair = Buffer.from(JSON.stringify(
  { t: T, k: K, n: 'GCI', a: 'julien', m: 'Dupont!!', e: 'patron@gci.fr' }), 'utf8')
  .toString('base64').replace(/=+$/, '');
fs.writeFileSync(path.join(DATA, 'espaces.json'), JSON.stringify({
  gci: { nom: 'GCI', code: codeClair, t: T, ts: Date.now(), email: 'patron@gci.fr' }
}));

fs.writeFileSync(path.join(TMP, 'config.json'), JSON.stringify({
  contactEmail: 'contact@teamop.fr',
  vapidPublicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkFbx3gJHtLoRlqPZ6dcMYNqK5AqQwqPDbmXjqSlP8kfxLZlHDvfNbo',
  vapidPrivateKey: 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls',
  /* un SMTP volontairement injoignable : l'envoi doit échouer SANS que la réponse HTTP
     change — sinon le seul délai dirait qui est client de TEAM OP */
  smtp: { host: '127.0.0.1', port: 2, user: 'x@teamop.fr', pass: 'x', from: 'x@teamop.fr' }
}));

let echecs = 0, reussites = 0;
function verifie(titre, condition, detail) {
  if (condition) { reussites++; console.log('  ✓ ' + titre); }
  else { echecs++; console.log('  ✗ ' + titre + (detail ? '\n      → ' + detail : '')); }
}
const poste = async (route, corps) => {
  const r = await fetch(BASE + route, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://teamop.fr' },
    body: JSON.stringify(corps) });
  let j = null; const txt = await r.text();
  try { j = JSON.parse(txt); } catch (e) {}
  return { statut: r.status, j, txt };
};
const sha256 = (s) => require('crypto').createHash('sha256').update(String(s)).digest('hex');

const serveur = spawn(process.execPath, ['server/index.js'], {
  env: Object.assign({}, process.env, { TEAMOP_CONFIG: path.join(TMP, 'config.json'), TEAMOP_DATA: DATA, PORT: String(PORT) }),
  stdio: ['ignore', 'pipe', 'pipe']
});
let sortie = '';
serveur.stdout.on('data', d => { sortie += d; });
serveur.stderr.on('data', d => { sortie += d; });

async function attendre() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + '/api/espaces/etat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"t":"x"}' }); if (r.status) return true; }
    catch (e) { await new Promise(r => setTimeout(r, 120)); }
  }
  return false;
}

(async () => {
  if (!await attendre()) { console.error('le serveur n\'a pas démarré :\n' + sortie); process.exit(1); }

  console.log('\nLa route qui rendait la clé');
  const t1 = await poste('/api/espaces/trouver', { nom: 'GCI' });
  verifie('/api/espaces/trouver n\'existe plus', t1.statut === 404, 'statut ' + t1.statut);
  verifie('… et ne rend aucun code', !/[A-Za-z0-9+/]{40,}/.test(t1.txt), t1.txt.slice(0, 120));

  console.log('\nLe nom d\'une entreprise ne rend plus rien');
  const connue = await poste('/api/espaces/relance', { nom: 'GCI' });
  const inconnue = await poste('/api/espaces/relance', { nom: 'entreprise-qui-n-existe-pas' });
  verifie('/relance répond 200 pour une entreprise connue', connue.statut === 200, 'statut ' + connue.statut);
  verifie('… la même réponse, mot pour mot, pour une inconnue',
    connue.txt === inconnue.txt, 'connue=' + connue.txt + '  inconnue=' + inconnue.txt);
  verifie('… et ne contient ni la clé, ni le code, ni le nom',
    connue.txt.indexOf(K) < 0 && connue.txt.indexOf(codeClair) < 0 && connue.txt.indexOf(T) < 0 && !/GCI/i.test(connue.txt),
    connue.txt);

  console.log('\nCe que les autres routes ouvertes acceptent de dire');
  const prise = await poste('/api/espaces/libre', { nom: 'GCI' });
  const libre = await poste('/api/espaces/libre', { nom: 'un-nom-jamais-pris' });
  verifie('/libre : un nom déjà pris est signalé', prise.j && prise.j.libre === false, prise.txt);
  verifie('/libre : un nom libre est signalé', libre.j && libre.j.libre === true, libre.txt);
  verifie('/libre : rien d\'autre ne sort', prise.txt.indexOf(K) < 0 && prise.txt.indexOf(codeClair) < 0, prise.txt);

  const bon = await poste('/api/espaces/verifie-nom', { t: T, nom: 'GCI' });
  const mauvaisT = await poste('/api/espaces/verifie-nom', { t: 'autre-equipe', nom: 'GCI' });
  const nomInconnu = await poste('/api/espaces/verifie-nom', { t: T, nom: 'pas-cette-entreprise' });
  verifie('/verifie-nom : le bon couple répond oui', bon.j && bon.j.correspond === true, bon.txt);
  verifie('/verifie-nom : une autre équipe répond non', mauvaisT.j && mauvaisT.j.correspond === false, mauvaisT.txt);
  verifie('/verifie-nom : un nom inconnu répond non — comme un mauvais couple',
    nomInconnu.txt === mauvaisT.txt, 'inconnu=' + nomInconnu.txt + '  mauvais=' + mauvaisT.txt);
  verifie('/verifie-nom : rien d\'autre ne sort', bon.txt.indexOf(K) < 0 && bon.txt.indexOf(codeClair) < 0, bon.txt);

  console.log('\nLe lien de connexion');
  const lien = await poste('/api/espaces/lien', { t: T, kh: sha256(K) });
  verifie('/lien : rendu contre une preuve de clé', lien.statut === 200 && lien.j && lien.j.lien, lien.txt.slice(0, 160));
  verifie('… il porte le code, pas le nom', !!(lien.j && lien.j.lien && lien.j.lien.indexOf('#entreprise=') > 0 && lien.j.lien.indexOf('#e=') < 0), lien.j && lien.j.lien);
  const lienRefuse = await poste('/api/espaces/lien', { t: T, kh: sha256('mauvaise-cle') });
  verifie('… refusé sans la clé', lienRefuse.statut === 404, 'statut ' + lienRefuse.statut);

  console.log('\nLe mot de passe provisoire');
  const surDisque = JSON.parse(fs.readFileSync(path.join(DATA, 'espaces.json'), 'utf8'));
  const dedans = JSON.parse(Buffer.from(surDisque.gci.code, 'base64').toString('utf8'));
  verifie('l\'annuaire ne garde plus le mot de passe en clair', !dedans.m, JSON.stringify(dedans));
  verifie('… il n\'en reste que l\'empreinte', dedans.mh === sha256('Dupont!!'), String(dedans.mh));
  verifie('le lien rendu ne le porte pas non plus',
    !!(lien.j && lien.j.lien) && lien.j.lien.indexOf('Dupont') < 0, lien.j && lien.j.lien);

  console.log('\nL\'abus');
  let vu429 = false;
  for (let i = 0; i < 14; i++) { const r = await poste('/api/espaces/relance', { nom: 'GCI' }); if (r.statut === 429) { vu429 = true; break; } }
  verifie('/relance se ferme au-delà de dix demandes par heure', vu429, 'aucun 429 en 14 tentatives');

  console.log('\n' + (echecs ? '✗ ' + echecs + ' échec(s)' : '✓ ' + reussites + ' vérifications, aucun échec'));
  serveur.kill();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(echecs ? 1 : 0);
})().catch(e => { console.error(e); serveur.kill(); process.exit(1); });
