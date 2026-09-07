/* ══ RÉGRESSION DE LA CONNEXION PAR IDENTIFIANT ═══════════════════════════════════════════
   Ce chemin rend la CLÉ des données d'une entreprise contre un identifiant et un mot de passe.
   C'est la porte la plus sensible du serveur : elle mérite d'être éprouvée, pas essayée.

   Les cas ci-dessous portent sur ce qui, s'il lâchait, coûterait cher :
     · le dépôt de l'annuaire n'est possible qu'en prouvant la clé d'équipe (sinon n'importe
       qui écrase l'annuaire d'un client et entre chez lui) ;
     · un annuaire vide ne remplace jamais un annuaire garni (sinon un bogue de l'application
       met une entreprise entière dehors) ;
     · un mot de passe faux, un identifiant inconnu et une entreprise inexistante ne se
       distinguent pas par la réponse (sinon la route devient l'annuaire des clients) ;
     · l'annuaire d'une entreprise n'ouvre pas l'espace d'une autre ;
     · un espace suspendu ou reparti à neuf ne s'ouvre plus, annuaire ou pas.

   CE QUE CE FICHIER NE COUVRE PAS :
     · le calcul du vérificateur DANS LE NAVIGATEUR (WebCrypto). Il est éprouvé côté client,
       en navigateur ; ici on fabrique le même vérificateur avec le crypto de Node, ce qui
       vérifie le serveur, pas l'application.
     · le retour en arrière quand l'écriture échoue (disque plein).

   Usage :  node server/test-connexion.js                                                    */
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');

const PORT = 8198;
const BASE = 'http://127.0.0.1:' + PORT;
const TOURS = 120000;   // doit rester identique à CNX_ITER dans index.js et ANNUAIRE_TOURS dans app.html
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teamop-cnx-'));
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
  users: [{ id: 'u-essai', nom: 'essai', email: 'essai@teamop.fr', hash: sha(MDP), role: 'patron', actif: true }]
}));
/* Comme en production : DEUX noms pour un seul espace, un « t » sur chaque entrée, et un blob
   qui porte « e » (l'adresse de l'entreprise) pour qu'on puisse vérifier qu'elle n'en sort pas. */
const CLE = { 'demo-t1': 'cle-demo-aaaa', 'autre-t2': 'cle-autre-bbbb', 'neuve-t5': 'cle-neuve-cccc' };
const blob = (t, n) => Buffer.from(JSON.stringify({ t, k: CLE[t], n, a: 'justin', m: 'Biret!!', e: 'demo@exemple.fr' })).toString('base64').replace(/=+$/, '');
fs.writeFileSync(path.join(data, 'espaces.json'), JSON.stringify({
  entreprisedemo:      { nom: 'Entreprise Démo',       code: blob('demo-t1', 'Entreprise Démo'),       t: 'demo-t1',  ts: Date.now() - 100000, par: 'essai', email: 'demo@exemple.fr' },
  entreprisedemoparis: { nom: 'Entreprise Démo Paris', code: blob('demo-t1', 'Entreprise Démo Paris'), t: 'demo-t1',  ts: Date.now(),          par: 'essai', email: '' },
  autreboite:          { nom: 'Autre Boite',           code: blob('autre-t2', 'Autre Boite'),          t: 'autre-t2', ts: Date.now(),          par: 'essai', email: 'autre@exemple.fr' },
  entrepriseneuve:     { nom: 'Entreprise Neuve',      code: blob('neuve-t5', 'Entreprise Neuve'),     t: 'neuve-t5', ts: Date.now(),          par: 'essai', email: 'neuve@exemple.fr' }
}));

let ko = 0, ok = 0;
const dit = (nom, vrai, detail) => { if (vrai) { ok++; console.log('  ✔ ' + nom); } else { ko++; console.log('  ✘ ' + nom + (detail ? '   → ' + detail : '')); } };
/* Les routes sensibles acceptent 20 requêtes par minute et par IP (PLAFOND_STRICT). Cette
   suite en tape bien plus, d'affilée, depuis la même adresse : sans quoi elle mesurerait
   l'anti-abus au lieu de la connexion. On attend la minute suivante et on rejoue UNE fois —
   un 429 qui persiste reste donc un échec visible, ce qui est le but. */
const post = async (chemin, corps, jeton, rejoue) => {
  const h = { 'Content-Type': 'application/json' };
  if (jeton) h.Authorization = 'Bearer ' + jeton;
  const r = await fetch(BASE + chemin, { method: 'POST', headers: h, body: JSON.stringify(corps) });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (r.status === 429 && !rejoue) {
    await new Promise(x => setTimeout(x, 61000));
    return post(chemin, corps, jeton, true);
  }
  return { statut: r.status, ...j };
};
const annuaireDisque = () => { try { return JSON.parse(fs.readFileSync(path.join(data, 'comptes.json'), 'utf8')); } catch (e) { return null; } };
/* Le même vérificateur que l'application fabrique en WebCrypto : PBKDF2(empreinte, sel). */
const verif = (empreinte, selHex) =>
  crypto.pbkdf2Sync(empreinte, Buffer.from(selHex, 'hex'), TOURS, 32, 'sha256').toString('hex');
const compte = (login, motDePasse) => {
  const s = crypto.randomBytes(16).toString('hex');
  return { login, s, e: verif(sha(motDePasse), s) };
};

(async () => {
  try {
    const r = await fetch(BASE + '/health', { signal: AbortSignal.timeout(1500) });
    if (r.ok) {
      console.log('✘ le port ' + PORT + ' est déjà pris par un autre serveur.');
      console.log('  Ferme-le avant de relancer :  ps -eo pid,args | grep "[s]erver/index.js"');
      fs.rmSync(dir, { recursive: true, force: true });
      process.exit(1);
    }
  } catch (e) { /* rien n'écoute : c'est ce qu'on veut */ }
})();

const srv = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
  env: { ...process.env, TEAMOP_CONFIG: path.join(dir, 'config.json'), TEAMOP_DATA: data, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe']
});
if (process.env.BAVARD) { srv.stdout.on('data', d => process.stdout.write('[srv] ' + d)); srv.stderr.on('data', d => process.stdout.write('[srv!] ' + d)); }
const fin = (code) => { try { srv.kill(); } catch (e) {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} process.exit(code); };

(async () => {
  for (let i = 0; i < 40; i++) {
    try { await fetch(BASE + '/health'); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }
  const cx = await post('/api/monitor/login', { nom: 'essai', pass: MDP });
  if (!cx.token) { console.log('✘ connexion à la Tour impossible :', JSON.stringify(cx).slice(0, 120)); fin(1); }
  const T = cx.token;

  const MARC = 'MotDePasse-Marc-1', SOPHIE = 'MotDePasse-Sophie-2', AILLEURS = 'MotDePasse-Ailleurs-3';
  const cMarc = compte('marc', MARC), cSophie = compte('sophie', SOPHIE);
  const cAilleurs = compte('marc', AILLEURS);   // même identifiant, autre entreprise : le piège

  console.log('\n── déposer l\'annuaire exige la clé d\'équipe ──');
  dit('sans preuve, refus', (await post('/api/espaces/comptes', { t: 'demo-t1', kh: sha('pas-la-bonne'), comptes: [cMarc] })).statut === 403);
  dit('rien n\'a été écrit', !annuaireDisque() || !annuaireDisque()['demo-t1']);
  const d1 = await post('/api/espaces/comptes', { t: 'demo-t1', kh: sha(CLE['demo-t1']), comptes: [cMarc, cSophie] });
  dit('avec la clé d\'équipe, accepté', d1.statut === 200 && d1.n === 2, JSON.stringify(d1).slice(0, 90));
  dit('et écrit sur le disque', !!(annuaireDisque() || {})['demo-t1'] && Object.keys(annuaireDisque()['demo-t1'].c).length === 2);
  dit('l\'annuaire ne garde QUE sel et vérificateur', Object.keys(annuaireDisque()['demo-t1'].c.marc).sort().join(',') === 'e,s');

  console.log('\n── un annuaire vide n\'efface jamais un annuaire garni ──');
  const vide = await post('/api/espaces/comptes', { t: 'demo-t1', kh: sha(CLE['demo-t1']), comptes: [] });
  dit('le dépôt vide est refusé', vide.statut === 409, String(vide.statut));
  dit('les deux comptes sont toujours là', Object.keys(annuaireDisque()['demo-t1'].c).length === 2);
  const sale = await post('/api/espaces/comptes', { t: 'demo-t1', kh: sha(CLE['demo-t1']), comptes: [{ login: 'x', s: 'trop-court', e: 'nawak' }] });
  dit('une entrée malformée ne passe pas et n\'écrase rien', sale.statut === 409 && Object.keys(annuaireDisque()['demo-t1'].c).length === 2);

  console.log('\n── la connexion par identifiant ouvre vraiment l\'espace ──');
  const c1 = await post('/api/espaces/connexion', { nom: 'Entreprise Démo', login: 'marc', h: sha(MARC) });
  dit('bon nom, bon identifiant, bon mot de passe', c1.statut === 200 && !!c1.code, JSON.stringify(c1).slice(0, 90));
  if (c1.code) {
    const champs = Object.keys(JSON.parse(Buffer.from(c1.code, 'base64').toString('utf8')));
    dit('le blob porte t, k, a, mh', ['t', 'k', 'a', 'mh'].every(x => champs.includes(x)), champs.join(','));
    dit('et PAS l\'adresse e-mail de l\'entreprise', !champs.includes('e'), champs.join(','));
    dit('ni le mot de passe provisoire en clair', !champs.includes('m'), champs.join(','));
    dit('la clé rendue est bien celle de CETTE entreprise',
      JSON.parse(Buffer.from(c1.code, 'base64').toString('utf8')).k === CLE['demo-t1']);
  }
  dit('en majuscules et avec des accents, ça marche aussi',
    (await post('/api/espaces/connexion', { nom: 'ENTREPRISE DÉMO', login: 'MARC', h: sha(MARC) })).statut === 200);
  dit('le second nom du même espace ouvre le même espace',
    (await post('/api/espaces/connexion', { nom: 'entreprise demo paris', login: 'sophie', h: sha(SOPHIE) })).statut === 200);

  console.log('\n── ce qui ne doit pas passer ──');
  const faux = await post('/api/espaces/connexion', { nom: 'Entreprise Démo', login: 'marc', h: sha('pas-le-bon') });
  dit('mauvais mot de passe : refus', faux.statut === 403);
  const inconnu = await post('/api/espaces/connexion', { nom: 'Entreprise Démo', login: 'personne', h: sha(MARC) });
  dit('identifiant inconnu : refus', inconnu.statut === 403);
  dit('et le MÊME message que le mauvais mot de passe', faux.error === inconnu.error, faux.error + ' / ' + inconnu.error);
  dit('mot de passe vide ou mal formé : refus net',
    (await post('/api/espaces/connexion', { nom: 'Entreprise Démo', login: 'marc', h: '' })).statut === 400);

  /* Ces deux identifiants-là ont TUÉ le serveur. « ann.c » vient d'un JSON : c'est un objet
     ordinaire, donc ann.c['__proto__'] rend Object.prototype et ann.c['constructor'] rend la
     fonction Object — truthy tous les deux, avec un champ « e » indéfini. Buffer.from levait,
     hors du try, dans un gestionnaire async qu'Express ne rattrape pas : processus mort, API
     entière tombée, sans authentification. La suite passait 36/36 en ignorant ces deux cas. */
  console.log('\n── un identifiant piégé ne fait pas tomber le serveur ──');
  for (const piege of ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty']) {
    const r = await post('/api/espaces/connexion', { nom: 'Entreprise Démo', login: piege, h: sha(MARC) });
    dit('« ' + piege +' » est refusé proprement', r.statut === 403, 'statut ' + r.statut);
  }
  dit('et le serveur répond toujours', (await fetch(BASE + '/health').then(r => r.ok).catch(() => false)));
  const dep = await post('/api/espaces/comptes', { t: 'demo-t1', kh: sha(CLE['demo-t1']), comptes: [compte('__proto__', 'x')] });
  dit('un compte nommé « __proto__ » n\'entre pas dans l\'annuaire', [400, 409].includes(dep.statut), 'statut ' + dep.statut);
  dit('et l\'annuaire est intact', Object.keys(annuaireDisque()['demo-t1'].c).length === 2);

  console.log('\n── la route ne dit pas qui est client de TEAM OP ──');
  const sansAnn = await post('/api/espaces/connexion', { nom: 'Autre Boite', login: 'marc', h: sha(MARC) });
  const inexistante = await post('/api/espaces/connexion', { nom: 'Societe Qui Nexiste Pas', login: 'marc', h: sha(MARC) });
  dit('une entreprise sans annuaire répond « pas encore activé »', sansAnn.statut === 409 && sansAnn.motif === 'sans-annuaire');
  dit('une entreprise INEXISTANTE répond exactement pareil',
    inexistante.statut === sansAnn.statut && inexistante.error === sansAnn.error, JSON.stringify(inexistante).slice(0, 90));

  console.log('\n── cloisonnement entre entreprises ──');
  await post('/api/espaces/comptes', { t: 'autre-t2', kh: sha(CLE['autre-t2']), comptes: [cAilleurs] });
  dit('« marc » existe des deux côtés avec deux mots de passe',
    (await post('/api/espaces/connexion', { nom: 'Autre Boite', login: 'marc', h: sha(AILLEURS) })).statut === 200);
  dit('le mot de passe de l\'un ne vaut pas chez l\'autre',
    (await post('/api/espaces/connexion', { nom: 'Autre Boite', login: 'marc', h: sha(MARC) })).statut === 403);
  const cA = await post('/api/espaces/connexion', { nom: 'Autre Boite', login: 'marc', h: sha(AILLEURS) });
  dit('et chacun reçoit SA clé, jamais celle du voisin',
    JSON.parse(Buffer.from(cA.code, 'base64').toString('utf8')).k === CLE['autre-t2']);

  console.log('\n── suspendre un accès depuis la Tour ──');
  dit('sans jeton, refus', (await post('/api/monitor/espaces/suspendre', { slug: 'entreprisedemo' })).statut === 403);
  const sus = await post('/api/monitor/espaces/suspendre', { slug: 'entreprisedemo' }, T);
  dit('le patron suspend', sus.statut === 200 && sus.suspendu === true, JSON.stringify(sus).slice(0, 90));
  dit('la connexion par identifiant ne passe plus',
    (await post('/api/espaces/connexion', { nom: 'Entreprise Démo', login: 'marc', h: sha(MARC) })).statut !== 200);
  dit('le code d\'accès non plus (même porte fermée)',
    (await post('/api/espaces/ouvrir', { nom: 'Entreprise Démo', acces: 'ZZZZZZZZZZ' })).statut === 403);
  dit('l\'application apprend que l\'espace est fermé', (await post('/api/espaces/etat', { t: 'demo-t1' })).ferme === true);
  const rou = await post('/api/monitor/espaces/suspendre', { slug: 'entreprisedemo', rouvrir: true }, T);
  dit('rouvrir rend l\'accès', rou.statut === 200 && rou.suspendu === false);
  dit('et la connexion remarche, sans avoir rien redéposé',
    (await post('/api/espaces/connexion', { nom: 'Entreprise Démo', login: 'marc', h: sha(MARC) })).statut === 200);

  /* Un espace porte PLUSIEURS noms dans l'annuaire (c'est la fixture, et c'est la production).
     Renommer en lisant espacesReg[slug] renommait une entrée pendant que le serveur en servait
     une autre : la route répondait « fait » et l'ancienne adresse continuait de marcher. */
  console.log('\n── renommer change vraiment l\'adresse, tous les anciens noms compris ──');
  const rn = await post('/api/monitor/espaces/renommer', { slug: 'entreprisedemo', nouveau: 'Nouveau Nom SAS' }, T);
  dit('le patron renomme', rn.statut === 200 && rn.slug === 'nouveaunomsas', JSON.stringify(rn).slice(0, 100));
  dit('la nouvelle adresse ouvre l\'espace',
    (await post('/api/espaces/connexion', { nom: 'Nouveau Nom SAS', login: 'marc', h: sha(MARC) })).statut === 200);
  dit('le nom rendu est le NOUVEAU',
    (await post('/api/espaces/connexion', { nom: 'nouveaunomsas', login: 'marc', h: sha(MARC) })).nom === 'Nouveau Nom SAS');
  dit('l\'ancienne adresse ne marche plus',
    (await post('/api/espaces/connexion', { nom: 'Entreprise Démo', login: 'marc', h: sha(MARC) })).statut !== 200);
  dit('l\'AUTRE ancien nom du même espace non plus',
    (await post('/api/espaces/connexion', { nom: 'entreprise demo paris', login: 'sophie', h: sha(SOPHIE) })).statut !== 200);
  dit('renommer vers l\'adresse d\'une autre entreprise est refusé',
    (await post('/api/monitor/espaces/renommer', { slug: 'nouveaunomsas', nouveau: 'Autre Boite' }, T)).statut === 409);

  /* OP MESSAGES est sorti des formules d'OP GESTION : c'est une application à part, ouverte
     entreprise par entreprise. Le DÉFAUT doit être fermé — un espace jamais touché ne doit pas
     ouvrir une seconde application, et surtout pas un second abonnement. */
  console.log('\n── OP MESSAGES s\'ouvre et se ferme par entreprise ──');
  const etat0 = await post('/api/espaces/etat', { t: 'autre-t2' });
  dit('par défaut, fermé', etat0.opMessages === false, JSON.stringify(etat0).slice(0, 80));
  dit('sans jeton, refus', (await post('/api/monitor/espaces/apps', { slug: 'autreboite', opMessages: true })).statut === 403);
  const ouv = await post('/api/monitor/espaces/apps', { slug: 'autreboite', opMessages: true }, T);
  dit('le patron ouvre', ouv.statut === 200 && ouv.opMessages === true, JSON.stringify(ouv).slice(0, 80));
  dit('l\'application l\'apprend par /api/espaces/etat', (await post('/api/espaces/etat', { t: 'autre-t2' })).opMessages === true);
  dit('c\'est écrit sur le disque', (() => { try { return JSON.parse(fs.readFileSync(path.join(data, 'espaces.json'), 'utf8')).autreboite.opMessages === true; } catch (e) { return false; } })());
  dit('la formule de l\'entreprise n\'a pas bougé', (() => { try { const x = JSON.parse(fs.readFileSync(path.join(data, 'espaces.json'), 'utf8')).autreboite; return x.formule === undefined || x.formule === null; } catch (e) { return false; } })());
  const fer = await post('/api/monitor/espaces/apps', { slug: 'autreboite', opMessages: false }, T);
  dit('le patron ferme', fer.statut === 200 && fer.opMessages === false);
  dit('et l\'application le voit', (await post('/api/espaces/etat', { t: 'autre-t2' })).opMessages === false);
  dit('un espace inconnu est refusé', (await post('/api/monitor/espaces/apps', { slug: 'nexistepas', opMessages: true }, T)).statut === 404);
  /* Le chemin qui sort AVANT la formule doit rendre le champ lui aussi : l'oublier laissait la
     messagerie affichée chez toute entreprise sans formule attribuée. */
  dit('un espace SANS formule rend quand même le champ', typeof (await post('/api/espaces/etat', { t: 'autre-t2' })).opMessages === 'boolean');

  /* Les deux défauts trouvés par le gardien, transformés en régressions.
     1) « Revoir le lien de connexion » repasse par /api/monitor/espaces, qui reconstruit
        l'entrée de zéro : sans report, le geste le plus banal de la Tour refermait une
        application facturée à part, en silence. */
  await post('/api/monitor/espaces/apps', { slug: 'autreboite', opMessages: true }, T);
  await post('/api/monitor/espaces', { nom: 'Autre Boite', code: blob('autre-t2', 'Autre Boite'), email: 'autre@exemple.fr' }, T);
  dit('réenregistrer l\'espace ne referme PAS OP MESSAGES',
    (await post('/api/espaces/etat', { t: 'autre-t2' })).opMessages === true);
  /* 2) « !! » sur le corps de la requête : {"opMessages":"false"} OUVRAIT l'application.
        Sur une option facturée, la direction de l'échec doit être la fermeture. */
  await post('/api/monitor/espaces/apps', { slug: 'autreboite', opMessages: false }, T);
  const flou = await post('/api/monitor/espaces/apps', { slug: 'autreboite', opMessages: 'false' }, T);
  dit('la chaîne « false » n\'ouvre pas', flou.opMessages === false, JSON.stringify(flou).slice(0, 70));
  const flou2 = await post('/api/monitor/espaces/apps', { slug: 'autreboite', opMessages: 1 }, T);
  dit('le nombre 1 n\'ouvre pas non plus', flou2.opMessages === false, JSON.stringify(flou2).slice(0, 70));
  dit('et l\'application le voit fermé', (await post('/api/espaces/etat', { t: 'autre-t2' })).opMessages === false);

  console.log('\n── un espace qui repart à neuf perd son annuaire ──');
  await post('/api/espaces/comptes', { t: 'neuve-t5', kh: sha(CLE['neuve-t5']), comptes: [compte('chef', 'Neuve-1234')] });
  dit('il s\'ouvre avant', (await post('/api/espaces/connexion', { nom: 'Entreprise Neuve', login: 'chef', h: sha('Neuve-1234') })).statut === 200);
  await post('/api/monitor/espaces/renaitre', { nom: 'Entreprise Neuve' }, T);
  dit('l\'annuaire est effacé du disque', !(annuaireDisque() || {})['neuve-t5']);
  dit('et l\'ancien identifiant n\'ouvre plus rien',
    (await post('/api/espaces/connexion', { nom: 'Entreprise Neuve', login: 'chef', h: sha('Neuve-1234') })).statut !== 200);

  /* « entFermes.espaces » sert AUSSI à la fermeture définitive d'une entreprise, qui exige un
     code de confirmation par e-mail. Sans liste séparée, « Rouvrir » la défaisait en un clic —
     et rendait à nouveau le lien porteur de « k ». */
  console.log('\n── « Rouvrir » ne défait pas une fermeture d\'entreprise ──');
  const rr = await post('/api/monitor/espaces/suspendre', { slug: 'autreboite', rouvrir: true }, T);
  dit('rouvrir un espace jamais suspendu d\'ici est refusé', rr.statut === 409, 'statut ' + rr.statut);

  /* Trois routes publiques ont déjà gelé l'API entière parce qu'elles passaient une entrée non
     bornée à espSlug (normalize('NFD') sur plusieurs Mo). Les deux nouvelles sont publiques :
     on mesure, on ne suppose pas. « é » et non « a » : c'est la décomposition qui coûte. */
  console.log('\n── une charge énorme ne gèle pas le serveur ──');
  const enorme = 'é'.repeat(2500000);
  for (const [chemin, corps] of [
    ['/api/espaces/connexion', { nom: enorme, login: enorme, h: sha('x') }],
    ['/api/espaces/comptes', { t: enorme, kh: enorme, comptes: [] }]
  ]) {
    const t0 = Date.now();
    await post(chemin, corps);
    const ms = Date.now() - t0;
    dit(chemin + ' répond vite malgré 5 Mo (' + ms + ' ms)', ms < 1500, ms + ' ms');
  }

  console.log('\n' + (ko ? '✘ ' + ko + ' cas en échec sur ' + (ok + ko) : '✔ ' + ok + ' cas, tous passés'));
  fin(ko ? 1 : 0);
})().catch(e => { console.log('✘ ' + e.message); fin(1); });
