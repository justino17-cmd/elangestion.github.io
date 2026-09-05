/* Vérifie PROPOSE sur le code RÉELLEMENT LIVRÉ.

   Ce qui compte ici n'est pas la qualité du correctif — aucun test ne peut la garantir —
   mais ce que la route refuse de laisser passer, et ce qu'elle ne sait pas faire :

     • un correctif qui casse la page ne doit jamais atteindre une proposition (c'est la
       page blanche du 3 septembre 2026) ;
     • une correction d'app.html doit emporter la bêta régénérée ;
     • la route est réservée au patron ;
     • et rien, nulle part, ne fusionne.

   Les fonctions sont extraites du fichier livré et exécutées telles quelles.

   Usage : node scripts/verifier-propose.js   (depuis la racine du dépôt) */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const RACINE = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(RACINE, 'server', 'index.js'), 'utf8');

function extrait(nom, motif) {
  const m = SRC.match(motif);
  if (!m) { console.error(nom + ' introuvable dans server/index.js'); process.exit(1); }
  return m[0];
}
const pageAnalysable = new Function(extrait('pageAnalysable', /function pageAnalysable\(html\) \{[\s\S]*?\n\}/) + '; return pageAnalysable;')();
const betaDepuis = new Function('fs', 'path', 'require', 'DEPOT',
  extrait('betaDepuis', /function betaDepuis\(appHtml\) \{[\s\S]*?\n\}/) + '; return betaDepuis;')(fs, path, require, RACINE);

let echecs = 0, reussites = 0;
function verifie(titre, condition, detail) {
  if (condition) { reussites++; console.log('  ✓ ' + titre); }
  else { echecs++; console.log('  ✗ ' + titre + (detail ? '\n      → ' + detail : '')); }
}

console.log('\nUn correctif qui casse la page');
const pageSaine = '<html><script>function a(){ return 1; }</script><script>var b=2;</script></html>';
verifie('une page saine passe', pageAnalysable(pageSaine) === '', pageAnalysable(pageSaine));
/* Exactement la panne du 3 septembre : un « // » avale la fin de la ligne, accolade comprise. */
const pageCassee = '<html><script>function a(){ return 1; // le commentaire avale l\'accolade }</script></html>';
verifie('la panne du 3 septembre est rattrapée', pageAnalysable(pageCassee) !== '', 'aucune erreur signalée');
const pageAwait = '<html><script>const x = await fetch("/a");</script></html>';
verifie('un « await » à la racine reste accepté', pageAnalysable(pageAwait) === '', pageAnalysable(pageAwait));

console.log('\nLa bêta suit l\'application');
const app = fs.readFileSync(path.join(RACINE, 'app.html'), 'utf8');
const marque = 'zzMarqueDEssaiPropose';
const appCorrigee = app.replace('function toast(msg,ms){', 'function toast(msg,ms){ /* ' + marque + ' */');
verifie('l\'application d\'essai a bien été modifiée', appCorrigee !== app, 'aucun remplacement');
let beta = null, erreurBeta = '';
try { beta = betaDepuis(appCorrigee); } catch (e) { erreurBeta = e.message; }
verifie('la bêta se régénère depuis l\'application corrigée', !!beta, erreurBeta);
verifie('… elle emporte la correction', !!(beta && beta.indexOf(marque) > 0), 'marque absente de la bêta');
verifie('… et reste isolée (stockage propre à la bêta)', !!(beta && beta.indexOf("'elanB_gestion_v2'") > 0), 'isolation du stockage perdue');
verifie('… et isolée aussi côté synchro', !!(beta && beta.indexOf("FB_TEAM='elan-gestion-beta'") > 0), 'isolation de la synchro perdue');
/* Le générateur livré refuse une app qui perdrait l'isolation : ce refus doit remonter. */
let refus = '';
try { betaDepuis('<html>rien du tout</html>'); } catch (e) { refus = e.message; }
verifie('un générateur qui refuse fait échouer la proposition', refus !== '', 'aucune erreur levée');

console.log('\nCe que le serveur ne sait pas faire');
verifie('aucun appel de fusion dans le serveur',
  !/\/merge\b|merge_method/.test(SRC),
  (SRC.match(/.{0,60}merge.{0,60}/) || [''])[0]);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'teamop-prop-'));
const DATA = path.join(TMP, 'data'); fs.mkdirSync(DATA, { recursive: true });
const MDP = 'mot-de-passe-essai';
fs.writeFileSync(path.join(TMP, 'config.json'), JSON.stringify({
  contactEmail: 'contact@teamop.fr',
  adminPassHash: require('crypto').createHash('sha256').update(MDP).digest('hex'),
  /* clé factice : devisActif() ne regarde que sa présence — aucun appel n'est fait dans ce test */
  anthropic: { cleApi: 'cle-factice-pour-essai' },
  vapidPublicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkFbx3gJHtLoRlqPZ6dcMYNqK5AqQwqPDbmXjqSlP8kfxLZlHDvfNbo',
  vapidPrivateKey: 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls'
}));
/* Un port fixe se heurte à ce qui tourne déjà sur la machine, et deux suites lancées à la
   suite se marchent dessus. Le numéro du processus donne un port propre à chaque exécution. */
const PORT = 20000 + (process.pid % 20000);
const BASE = 'http://127.0.0.1:' + PORT;
const serveur = spawn(process.execPath, ['server/index.js'], {
  cwd: RACINE,
  env: Object.assign({}, process.env, { TEAMOP_CONFIG: path.join(TMP, 'config.json'), TEAMOP_DATA: DATA, PORT: String(PORT) }),
  stdio: ['ignore', 'pipe', 'pipe']
});
let sortie = '';
serveur.stdout.on('data', d => { sortie += d; });
serveur.stderr.on('data', d => { sortie += d; });

const poste = (route, corps, jeton) => fetch(BASE + route, {
  method: 'POST',
  headers: Object.assign({ 'Content-Type': 'application/json' }, jeton ? { Authorization: 'Bearer ' + jeton } : {}),
  body: JSON.stringify(corps)
});

(async () => {
  for (let i = 0; i < 60; i++) {
    try { await poste('/api/espaces/etat', { t: 'x' }); break; }
    catch (e) { await new Promise(r => setTimeout(r, 120)); }
  }

  console.log('\nQuand le dépôt GitHub n\'est pas configuré');
  const patron = await poste('/api/monitor/login', { nom: 'Patron', pass: MDP }).then(r => r.json());
  verifie('la Tour délivre une session patron', !!(patron && patron.token && patron.role === 'patron'), JSON.stringify(patron).slice(0, 120));
  const sansGh = await poste('/api/monitor/proposer', { id: 'x' }, patron.token);
  const txtGh = await sansGh.text();
  verifie('PROPOSE reste inerte, et le dit (503)', sansGh.status === 503 && /github/i.test(txtGh), sansGh.status + ' · ' + txtGh.slice(0, 140));

  console.log('\nCe que PROPOSE exige avant d\'écrire quoi que ce soit');
  /* On sème un incident réel en passant par la vraie route des sentinelles. */
  await fetch(BASE + '/api/monitor/report', {
    method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ reports: [{ type: 'erreur', message: 'Essai — incident sans cause établie', app: 'elan', src: 'https://teamop.fr/app.html', line: 100 }] })
  });
  const liste = await fetch(BASE + '/api/monitor/issues', { headers: { Authorization: 'Bearer ' + patron.token } }).then(r => r.json());
  const inc = (liste.issues || [])[0];
  verifie('l\'incident d\'essai est bien enregistré', !!inc, JSON.stringify(liste).slice(0, 140));

  console.log('\nLa route est réservée au patron');
  const collab = await poste('/api/monitor/users', { nom: 'Collegue', pass: 'mot-de-passe-collegue', role: 'collaborateur' }, patron.token).then(r => r.json());
  const sess2 = await poste('/api/monitor/login', { nom: 'Collegue', pass: 'mot-de-passe-collegue' }).then(r => r.json());
  if (sess2 && sess2.token) {
    const r2 = await poste('/api/monitor/proposer', { id: inc && inc.id }, sess2.token);
    verifie('un collaborateur est refusé (403)', r2.status === 403, 'statut ' + r2.status);
    const r3 = await poste('/api/monitor/expliquer', { id: inc && inc.id }, sess2.token);
    verifie('… mais il peut chercher la cause', r3.status !== 403, 'statut ' + r3.status);
  } else {
    verifie('un compte collaborateur a pu être créé', false, JSON.stringify(collab).slice(0, 160));
  }

  console.log('\n' + (echecs ? '✗ ' + echecs + ' échec(s)' : '✓ ' + reussites + ' vérifications, aucun échec'));
  serveur.kill();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(echecs ? 1 : 0);
})().catch(e => { console.error(e, sortie); serveur.kill(); process.exit(1); });
