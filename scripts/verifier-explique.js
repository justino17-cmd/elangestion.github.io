/* Vérifie EXPLIQUE sur le code RÉELLEMENT LIVRÉ.

   Le point sensible n'est pas l'explication elle-même — c'est ce que la route accepte
   d'ouvrir. Une trace de sentinelle est un texte venu du navigateur d'un client : si le
   nom de fichier qu'elle porte pouvait désigner autre chose qu'une page du dépôt, la
   console lirait des fichiers du serveur et les enverrait à un tiers.

   monSource est donc extrait du fichier livré et exécuté tel quel, pas réécrit ici.

   Usage : node scripts/verifier-explique.js   (depuis la racine du dépôt) */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const RACINE = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(RACINE, 'server', 'index.js'), 'utf8');

/* On prend la fonction LIVRÉE, du dépôt, sans la retoucher : un test qui rejoue sa
   propre copie ne dit rien de ce qui part en production. */
const m = SRC.match(/function monSource\(src, ligne\) \{[\s\S]*?\n\}/);
if (!m) { console.error('monSource introuvable dans server/index.js'); process.exit(1); }
const monSource = new Function('fs', 'path', 'DEPOT', m[0] + '; return monSource;')(fs, path, RACINE);

let echecs = 0, reussites = 0;
function verifie(titre, condition, detail) {
  if (condition) { reussites++; console.log('  ✓ ' + titre); }
  else { echecs++; console.log('  ✗ ' + titre + (detail ? '\n      → ' + detail : '')); }
}

console.log('\nCe que la route accepte d\'ouvrir');
const bon = monSource('https://teamop.fr/app.html', 100);
verifie('une page du dépôt est lue',
  !!(bon && bon.fichier === 'app.html' && bon.ligne === 100 && bon.extrait),
  JSON.stringify(bon && { f: bon.fichier, l: bon.ligne, n: (bon.extrait || '').length }));
verifie('… la ligne visée est marquée',
  !!(bon && bon.extrait.split('\n').some(l => /^\s*100 ▶ /.test(l))),
  (bon && bon.extrait || '').split('\n').slice(11, 13).join('\n'));
verifie('… avec son voisinage (25 lignes)',
  !!(bon && bon.extrait.split('\n').length === 25),
  String(bon && bon.extrait.split('\n').length));

console.log('\nCe qu\'elle refuse');
const refus = [
  ['une remontée de dossier', '../../../etc/passwd'],
  ['un chemin absolu', '/etc/passwd'],
  ['un chemin absolu déguisé en URL', 'https://teamop.fr/../../etc/passwd'],
  ['un fichier hors racine du dépôt', 'https://teamop.fr/server/index.js'],
  ['un sous-dossier', 'scripts/verifier-syntaxe.js'],
  ['un fichier inexistant', 'https://teamop.fr/nexistepas.html'],
  ['une autre extension', 'https://teamop.fr/icons/teamop-1024.png'],
  ['un nom vide', ''],
  ['un nom avec une espace', 'app .html']
];
for (const [titre, entree] of refus) {
  verifie(titre + ' → refusé', monSource(entree, 10) === null, JSON.stringify(monSource(entree, 10)));
}

console.log('\nLes cas limites');
const q = monSource('https://teamop.fr/app.html?v=557#haut', 5);
verifie('les paramètres et l\'ancre sont retirés', !!(q && q.fichier === 'app.html' && q.ligne === 5), JSON.stringify(q && q.fichier));
const trop = monSource('app.html', 99999999);
verifie('une ligne au-delà du fichier ne rend aucun extrait', !!(trop && trop.ligne === 0 && trop.extrait === ''), JSON.stringify(trop));
const sansLigne = monSource('app.html', 0);
verifie('sans numéro de ligne, aucun extrait inventé', !!(sansLigne && sansLigne.ligne === 0 && sansLigne.extrait === ''), JSON.stringify(sansLigne));

/* Sans clé Claude, la route doit se taire proprement — pas planter, pas répondre à moitié. */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'teamop-expl-'));
const DATA = path.join(TMP, 'data'); fs.mkdirSync(DATA, { recursive: true });
fs.writeFileSync(path.join(TMP, 'config.json'), JSON.stringify({
  contactEmail: 'contact@teamop.fr',
  /* repli d'accès de la Tour : l'empreinte SHA-256 du mot de passe d'essai ci-dessous */
  adminPassHash: require('crypto').createHash('sha256').update('mot-de-passe-essai').digest('hex'),
  vapidPublicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkFbx3gJHtLoRlqPZ6dcMYNqK5AqQwqPDbmXjqSlP8kfxLZlHDvfNbo',
  vapidPrivateKey: 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls'
}));
const PORT = 8795;
const serveur = spawn(process.execPath, ['server/index.js'], {
  cwd: RACINE,
  env: Object.assign({}, process.env, { TEAMOP_CONFIG: path.join(TMP, 'config.json'), TEAMOP_DATA: DATA, PORT: String(PORT) }),
  stdio: ['ignore', 'pipe', 'pipe']
});
let sortie = '';
serveur.stdout.on('data', d => { sortie += d; });
serveur.stderr.on('data', d => { sortie += d; });

(async () => {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch('http://127.0.0.1:' + PORT + '/api/espaces/etat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"t":"x"}' });
      break;
    } catch (e) { await new Promise(r => setTimeout(r, 120)); }
  }
  console.log('\nQuand la clé Claude n\'est pas configurée');
  const co = await fetch('http://127.0.0.1:' + PORT + '/api/monitor/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nom: 'Essai', pass: 'mot-de-passe-essai' })
  }).then(x => x.json());
  verifie('la Tour délivre une session', !!(co && co.token), JSON.stringify(co).slice(0, 140));
  const r = await fetch('http://127.0.0.1:' + PORT + '/api/monitor/expliquer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (co && co.token) },
    body: JSON.stringify({ id: 'i-inexistant' })
  });
  const txt = await r.text();
  verifie('la route le dit franchement (503), sans planter', r.status === 503, 'statut ' + r.status + ' · ' + txt.slice(0, 140));
  const sansJeton = await fetch('http://127.0.0.1:' + PORT + '/api/monitor/expliquer', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'x' })
  });
  verifie('… et reste fermée sans jeton de la Tour', sansJeton.status === 401 || sansJeton.status === 403, 'statut ' + sansJeton.status);

  console.log('\n' + (echecs ? '✗ ' + echecs + ' échec(s)' : '✓ ' + reussites + ' vérifications, aucun échec'));
  serveur.kill();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(echecs ? 1 : 0);
})().catch(e => { console.error(e, sortie); serveur.kill(); process.exit(1); });
