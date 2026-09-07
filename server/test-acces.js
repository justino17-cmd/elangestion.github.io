/* ══ RÉGRESSION DU CODE D'ACCÈS ═══════════════════════════════════════════════════════════
   Ce fichier existe parce qu'un essai bâclé a laissé passer un défaut grave : le code d'accès
   n'était écrit NULLE PART, et personne ne s'en est aperçu parce que la fixture partait d'un
   code déjà présent dans le fichier, sur un espace SANS champ « t ». Or toute entrée réelle
   porte un « t », et c'est ce chemin-là qui était cassé.
   Les cas ci-dessous sont donc ceux de la production : un espace avec « t », et DEUX noms pour
   un seul espace — la configuration qui faisait ressusciter un code révoqué.

   Usage :  node server/test-acces.js
   Il démarre un serveur isolé sur un port libre, dans un dossier temporaire. Il ne touche ni la
   production, ni la configuration du VPS. Sortie non nulle si un cas échoue.        */
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');

const PORT = 8199;
const BASE = 'http://127.0.0.1:' + PORT;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teamop-acces-'));
const data = path.join(dir, 'data');
fs.mkdirSync(data);

const sha = (p) => crypto.createHash('sha256').update(String(p)).digest('hex');
const MDP = 'essai-' + crypto.randomBytes(6).toString('hex');
fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
  vapidPublicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkTF6oDZoV8HGDzT9K1YfJTNqjcMhLU_pP6HqJdBnbfGwqNfhKW1CTk',
  vapidPrivateKey: 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls'
}));
fs.writeFileSync(path.join(dir, 'monitor.json'), JSON.stringify({
  issues: [], journal: [], archive: [],
  users: [{ nom: 'essai', email: 'essai@teamop.fr', hash: sha(MDP), role: 'patron', actif: true }]
}));
// DEUX noms, UN seul espace : « t » identique, c'est le cas de production
const blob = (t, n) => Buffer.from(JSON.stringify({ t, k: 'cle-' + t, n, a: 'justin', m: 'Biret!!' })).toString('base64').replace(/=+$/, '');
fs.writeFileSync(path.join(data, 'espaces.json'), JSON.stringify({
  entreprisedemo:       { nom: 'Entreprise Démo',       code: blob('demo-t1', 'Entreprise Démo'),       t: 'demo-t1', ts: Date.now() - 100000, par: 'essai', email: 'demo@exemple.fr' },
  entreprisedemoparis:  { nom: 'Entreprise Démo Paris', code: blob('demo-t1', 'Entreprise Démo Paris'), t: 'demo-t1', ts: Date.now(),          par: 'essai', email: '' },
  // une entreprise DÉJÀ fermée, avec un code encore en place : elle ne doit plus s'ouvrir
  entreprisefermee:     { nom: 'Entreprise Fermée',     code: blob('ferme-t9', 'Entreprise Fermée'),    t: 'ferme-t9', ts: Date.now(),         par: 'essai', email: 'ferme@exemple.fr' },
  // et une qu'on fera repartir à neuf
  entrepriseneuve:      { nom: 'Entreprise Neuve',      code: blob('neuve-t5', 'Entreprise Neuve'),     t: 'neuve-t5', ts: Date.now(),         par: 'essai', email: 'neuve@exemple.fr' }
}));
fs.writeFileSync(path.join(data, 'entreprises-fermees.json'), JSON.stringify({ emails: ['ferme@exemple.fr'], espaces: ['ferme-t9'] }));
fs.writeFileSync(path.join(data, 'acces.json'), JSON.stringify({
  'ferme-t9': { code: 'FERMEE1234', ts: Date.now(), par: 'essai', vu: 0 },
  'neuve-t5': { code: 'NEUVE12345', ts: Date.now(), par: 'essai', vu: 0 }
}));

let ko = 0, ok = 0;
const dit = (nom, vrai, detail) => { if (vrai) { ok++; console.log('  ✔ ' + nom); } else { ko++; console.log('  ✘ ' + nom + (detail ? '   → ' + detail : '')); } };
const post = async (chemin, corps, jeton) => {
  const h = { 'Content-Type': 'application/json' };
  if (jeton) h.Authorization = 'Bearer ' + jeton;
  const r = await fetch(BASE + chemin, { method: 'POST', headers: h, body: JSON.stringify(corps) });
  let j = {}; try { j = await r.json(); } catch (e) {}
  return { statut: r.status, ...j };
};
const surDisque = () => { try { return JSON.parse(fs.readFileSync(path.join(data, 'acces.json'), 'utf8')); } catch (e) { return null; } };

const srv = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
  env: { ...process.env, TEAMOP_CONFIG: path.join(dir, 'config.json'), TEAMOP_DATA: data, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe']
});
const fin = (code) => { try { srv.kill(); } catch (e) {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} process.exit(code); };

(async () => {
  for (let i = 0; i < 40; i++) {
    try { await fetch(BASE + '/health'); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }
  const cx = await post('/api/monitor/login', { nom: 'essai', pass: MDP });
  if (!cx.token) { console.log('✘ connexion à la Tour impossible :', JSON.stringify(cx).slice(0, 120)); fin(1); }
  const T = cx.token;

  console.log('\n── le code est réellement enregistré ──');
  const a = await post('/api/monitor/espaces/acces', { slug: 'entreprisedemo' }, T);
  dit('un code de 10 caractères est rendu', /^[A-Z0-9]{10}$/.test(a.acces || ''), a.acces);
  dit('il est écrit sur le disque', (surDisque() || {})['demo-t1'] && surDisque()['demo-t1'].code === a.acces);
  dit('il est rangé par identifiant d\'ÉQUIPE, pas par nom', !!(surDisque() || {})['demo-t1']);

  console.log('\n── un espace, un seul code ──');
  const b = await post('/api/monitor/espaces/acces', { slug: 'entreprisedemo' }, T);
  dit('rouvrir le panneau rend le MÊME code', b.acces === a.acces, b.acces);
  const c = await post('/api/monitor/espaces/acces', { slug: 'entreprisedemoparis' }, T);
  dit('l\'autre nom du même espace rend le même code', c.acces === a.acces, c.acces);

  console.log('\n── le code ouvre vraiment ──');
  const o1 = await post('/api/espaces/ouvrir', { nom: 'Entreprise Démo', acces: a.acces });
  dit('par le premier nom', o1.statut === 200 && !!o1.code);
  const o2 = await post('/api/espaces/ouvrir', { nom: 'entreprise demo paris', acces: a.acces.toLowerCase() });
  dit('par le second nom, en minuscules', o2.statut === 200 && !!o2.code);
  if (o1.code) {
    const champs = Object.keys(JSON.parse(Buffer.from(o1.code, 'base64').toString('utf8')));
    dit('le blob garde t, k, a, mh (sans eux, l\'espace s\'ouvre avec 1234)', ['t', 'k', 'a', 'mh'].every(x => champs.includes(x)), champs.join(','));
    dit('le blob ne rend PAS l\'adresse e-mail de l\'entreprise', !champs.includes('e'), champs.join(','));
  }

  console.log('\n── la révocation tient ──');
  const n = await post('/api/monitor/espaces/acces', { slug: 'entreprisedemo', regenerer: true }, T);
  dit('renouveler donne un code différent', n.acces && n.acces !== a.acces);
  dit('l\'ancien code est refusé', (await post('/api/espaces/ouvrir', { nom: 'Entreprise Démo', acces: a.acces })).statut === 403);
  dit('le nouveau est accepté', (await post('/api/espaces/ouvrir', { nom: 'Entreprise Démo', acces: n.acces })).statut === 200);
  // rouvrir le panneau d'un AUTRE nom du même espace ne doit rien ressusciter
  await post('/api/monitor/espaces/acces', { slug: 'entreprisedemoparis' }, T);
  dit('l\'ancien code ne ressuscite pas par l\'autre nom', (await post('/api/espaces/ouvrir', { nom: 'Entreprise Démo', acces: a.acces })).statut === 403);

  console.log('\n── ce qui doit être refusé ──');
  dit('mauvais code', (await post('/api/espaces/ouvrir', { nom: 'Entreprise Démo', acces: 'ZZZZZZZZZZ' })).statut === 403);
  dit('entreprise inconnue, même message', (await post('/api/espaces/ouvrir', { nom: 'Nexiste Pas', acces: n.acces })).error === (await post('/api/espaces/ouvrir', { nom: 'Entreprise Démo', acces: 'ZZZZZZZZZZ' })).error);
  dit('nom sans code', (await post('/api/espaces/ouvrir', { nom: 'Entreprise Démo' })).statut === 400);
  dit('un nom de 6 Mo ne fait pas tomber le service', (await post('/api/espaces/ouvrir', { nom: 'a'.repeat(200000), acces: 'ZZZZZZZZZZ' })).statut === 403);

  console.log('\n── une entreprise fermée ne se rouvre pas ──');
  dit('son code, pourtant valide, est refusé', (await post('/api/espaces/ouvrir', { nom: 'Entreprise Fermée', acces: 'FERMEE1234' })).statut === 403);
  dit('avec le même message que partout ailleurs',
    (await post('/api/espaces/ouvrir', { nom: 'Entreprise Fermée', acces: 'FERMEE1234' })).error
    === (await post('/api/espaces/ouvrir', { nom: 'Entreprise Démo', acces: 'ZZZZZZZZZZ' })).error);

  console.log('\n── un espace qui repart à neuf perd son code ──');
  dit('le code marche avant', (await post('/api/espaces/ouvrir', { nom: 'Entreprise Neuve', acces: 'NEUVE12345' })).statut === 200);
  await post('/api/monitor/espaces/renaitre', { nom: 'Entreprise Neuve' }, T);
  dit('il est effacé du registre', !(surDisque() || {})['neuve-t5']);
  dit('et il n\'ouvre plus rien', (await post('/api/espaces/ouvrir', { nom: 'Entreprise Neuve', acces: 'NEUVE12345' })).statut !== 200);

  console.log('\n' + (ko ? '✘ ' + ko + ' cas en échec sur ' + (ok + ko) : '✔ ' + ok + ' cas, tous passés'));
  fin(ko ? 1 : 0);
})().catch(e => { console.log('✘ ' + e.message); fin(1); });
