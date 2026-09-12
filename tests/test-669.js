/* ⛔ CE QUE CE FICHIER GARDE — il n'y a plus qu'UNE adresse et UN code. Le lien de première
   connexion est supprimé.

   Justin, 12 septembre 2026, après avoir vu la Tour lui afficher un lien qui ne correspondait
   pas à ELAN : « on va supprimer ces liens-là et garder que le lien qui se donne aux équipes ».

   ── POURQUOI C'EST PLUS QU'UN RANGEMENT ───────────────────────────────────────────────────
   Ce lien portait `k` dans son URL — LA CLÉ QUI DÉCHIFFRE TOUTES LES DONNÉES DE L'ENTREPRISE.
   Une URL est faite pour être transférée, photographiée, collée dans un groupe WhatsApp. Et il
   était fabriqué de travers dès qu'on ouvrait la Tour depuis un autre appareil : c'est ce qui a
   produit elan-d4v8, elan-tzl2 et elan-gq3k.

   ── ⚠️ CE QUE CE FICHIER DOIT PROUVER AVANT TOUT ──────────────────────────────────────────
   Retirer une porte n'est juste que si l'autre s'ouvre. Un test qui vérifierait seulement que
   le lien a disparu passerait au vert le jour où PLUS AUCUNE entreprise ne peut se connecter
   pour la première fois. La moitié de ce fichier sert donc à jouer le chemin de remplacement
   sur le VRAI serveur : code d'accès → l'espace s'ouvre, clé comprise.

   ── CE QUI NE DOIT PAS DISPARAÎTRE POUR AUTANT ────────────────────────────────────────────
   Les liens DÉJÀ ENVOYÉS sont entre les mains de gens qui travaillent. `/api/espaces/lien` et
   le traitement de `#entreprise=` dans app.html restent : on cesse d'en fabriquer, on ne casse
   pas ceux qui circulent. */

const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawn } = require('child_process');
const RACINE = path.join(__dirname, '..');
const TOUR = fs.readFileSync(path.join(RACINE, 'tour.html'), 'utf8');
const SRV = fs.readFileSync(path.join(RACINE, 'server', 'index.js'), 'utf8');
const APP = fs.readFileSync(path.join(RACINE, 'app.html'), 'utf8');

let ok = 0, ko = 0;
const v = (t, a, b) => { if (JSON.stringify(a) === JSON.stringify(b)) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + '\n      attendu : ' + JSON.stringify(b) + '\n      obtenu  : ' + JSON.stringify(a)); } };

console.log('Une adresse, un code — plus de lien qui transporte la clé');

/* ══ 1) LA TOUR N'AFFICHE PLUS AUCUN LIEN DE PREMIÈRE CONNEXION ═══════════════════════════ */
{
  /* ⛔ ON COMPTE LES ZONES, ON NE LES NOMME PLUS. La première version de ce contrôle cherchait
     « e.lien » — et elle est passée au vert alors que DEUX panneaux affichaient encore un lien :
     « Identifiants changés » et « Renommé », qui le tiraient de `r.d.lien`, un autre nom. Je ne
     les avais pas vus, et le test ne les voyait pas non plus. Une garde qui énumère ce qu'elle
     connaît ne protège que de ce qu'on avait déjà en tête.
     La forme « id="…-lien" » est celle de TOUTES les zones copiables de la Tour : en compter
     zéro attrape aussi le panneau que personne n'a encore écrit. */
  v('⛔ AUCUNE zone de la Tour n’affiche un lien', (TOUR.match(/id="[a-z-]*lien"/g) || []).length, 0);
  v('…et plus personne ne lit e.lien', /e\.lien/.test(TOUR), false);
  v('…ni r.d.lien', /r\.d\.lien/.test(TOUR), false);
  /* Contre-épreuve : les zones d'ADRESSE, elles, doivent rester — sinon on aurait « réussi »
     en vidant les panneaux. */
  v('…mais les zones d’adresse sont bien là', (TOUR.match(/id="[a-z-]*adr"/g) || []).length >= 3, true);
  v('⛔ plus aucun message type ne dit « clique ce lien »', /clique ce lien|en cliquant ton lien/.test(TOUR), false);
  /* L'adresse, elle, est partout : c'est elle qu'on donne aux équipes. */
  v('l’adresse reste sur la fiche entreprise', /id="lg-adr"/.test(TOUR), true);
  v('…et sur le panneau « formule acceptée »', /id="acc-adr"/.test(TOUR), true);
  v('le code d’accès devient la première connexion, pas « le filet »',
    /pour la TOUTE PREMIÈRE connexion/.test(TOUR), true);
  v('⛔ et on ne l’appelle plus « le filet »', /le filet : la toute première connexion/.test(TOUR), false);
}

/* ══ 2) LE MESSAGE NE PART JAMAIS SANS SON CODE ═══════════════════════════════════════════
   Le code arrive après le panneau (un aller-retour serveur). Poser le message tout de suite,
   c'était envoyer au client un courriel portant « __CODE__ » en toutes lettres — et aucun
   moyen d'entrer chez lui. C'est le piège que ce lot pouvait créer, pas celui qu'il corrige. */
{
  v('le message attend son code', /LG_MSG_MODELE=txt/.test(TOUR), true);
  v('⛔ le repère existe dans les deux messages types', (TOUR.match(/__CODE__/g) || []).length >= 3, true);
  v('il est remplacé quand le code arrive', /LG_MSG_MODELE\.replace\('__CODE__',code\|\|''\)/.test(TOUR), true);
  v('⛔ sans code, le bouton « ouvrir dans Mail » est désarmé',
    /a\.href='#'; a\.style\.opacity='\.45'; a\.style\.pointerEvents='none'/.test(TOUR), true);
  v('…et il dit pourquoi', /Il faut d\\'abord un code d\\'accès/.test(TOUR), true);
  /* DEUX panneaux posent ce message, dans deux zones différentes. Écrire #lg-msg en dur
     laissait l'autre avec « __CODE__ ». */
  v('⛔ la zone du message est choisie, pas écrite en dur', /getElementById\(LG_ZONE\|\|'lg-msg'\)/.test(TOUR), true);
  v('…et chaque panneau dit la sienne', (TOUR.match(/LG_ZONE='/g) || []).length >= 3, true);
  /* Le presse-papiers AUTOMATIQUE du panneau « formule » copiait le message dès l'affichage :
     il aurait copié « __CODE__ », et c'est ça que le patron aurait collé au client.
     ⚠️ La cible est la forme EXACTE de cette copie automatique — pas « writeText » en général.
     Deux autres appels subsistent et doivent subsister : le bouton « Copier » (tourCopie) et
     l'export de la liste d'adresses. Les deux partent d'un clic ; celui-ci partait tout seul. */
  v('⛔ plus de copie automatique avant que le code soit là',
    /try\{ navigator\.clipboard\.writeText\(txt\); \}catch\(e2\)\{\}/.test(TOUR), false);
  v('…mais le bouton « Copier » marche toujours', /function tourCopie\(/.test(TOUR), true);
}

/* ══ 3) « CODE INDISPONIBLE » NE SUFFIT PLUS ══════════════════════════════════════════════
   Trois mots, aucune piste — et c'est ce qu'affichait la fiche d'ELAN le 12 septembre. Tant
   que le lien existait, ce n'était qu'un filet muet ; c'est maintenant la seule porte. */
{
  v('l’échec dit ce que le serveur a répondu', /le serveur a répondu '\+\(\(r&&r\.status\)\|\|'\?'\)/.test(TOUR), true);
  v('un serveur injoignable se distingue d’un refus', /serveur injoignable — réessaie/.test(TOUR), true);
}

/* ══ 4) LES COURRIELS DU SERVEUR ═════════════════════════════════════════════════════════ */
{
  const mail = SRV.slice(SRV.indexOf("app.post('/api/monitor/espaces/mail-acces'"), SRV.indexOf("app.post('/api/monitor/espaces/mail-acces'") + 5000);
  v('⛔ le courriel d’accueil n’envoie plus de lien', /const lien = lienEspaceCode\(e\);/.test(mail), false);
  v('il envoie l’adresse et le code d’accès', /const acces = enrAcces\.code;/.test(mail), true);
  v('⛔ et il refuse de partir sans code plutôt que d’en envoyer un vide',
    /if \(!enrAcces\) return res\.status\(500\)/.test(mail), true);
  v('son bouton mène à l’adresse', /boutonUrl: 'https:\/\/' \+ adresse/.test(mail), true);

  const rel = SRV.slice(SRV.indexOf("app.post('/api/espaces/relance'"), SRV.indexOf("app.post('/api/espaces/relance'") + 4000);
  /* ⛔ Celle-ci est PUBLIQUE : n'importe qui tapant le nom d'une entreprise sur teamop.fr la
     déclenchait, et elle renvoyait la clé de déchiffrement par courriel. Elle renvoie
     désormais l'adresse, qui n'est pas un secret. Le code, lui, ne s'obtient que par le patron. */
  v('⛔ le secours « lien perdu » ne renvoie plus la clé', /lienEspaceCode/.test(rel), false);
  v('il renvoie l’adresse', /const adresse = 'teamop\.fr\/e\/'/.test(rel), true);
  v('…et il ne dicte pas le code d’accès dans un courriel déclenché par un inconnu',
    /acces/.test(rel), false);
}

/* ══ 4 bis) LES DEUX CHEMINS DU SITE — 12 septembre, décision de Justin : « fait les 3 » ═══
   Ils envoyaient encore un lien portant la clé, et ce ne sont pas de petits chemins :
   · /api/compte/identifiants part vers CHAQUE employé qu'un administrateur crée ;
   · le relais d'inscription part vers chaque entreprise qui s'abonne sur teamop.fr.
   Les deux cas ne se règlent pas pareil, et c'est tout l'intérêt de les distinguer : pour un
   employé, l'entreprise A DÉJÀ des comptes — l'adresse suffit. Pour une entreprise qui vient de
   s'inscrire, il n'y en a aucun — il faut le code d'accès. */
{
  const ident = SRV.slice(SRV.indexOf("app.post('/api/compte/identifiants'"), SRV.indexOf("app.post('/api/compte/identifiants'") + 4200);
  v('⛔ le courriel à un nouvel employé n’envoie plus de lien', /lienEspaceCode/.test(ident), false);
  v('il envoie l’adresse de l’entreprise', /const adrEsp = \(esp && esp\.slug\) \? \('https:\/\/teamop\.fr\/e\/' \+ esp\.slug\) : '';/.test(ident), true);
  /* ⚠️ Et il la donne dès qu'on a un slug, même si l'annuaire boite : envoyer quelqu'un sur
     connexion.html sans lui dire OÙ aller, c'est l'échouer à coup sûr. */
  v('…et il ne renvoie plus le lien fourni par l’application', /lienApp \|\| 'https:\/\/teamop\.fr\/connexion\.html'/.test(ident), false);

  /* ⚠️ BORNÉ PAR DU TEXTE, jamais par un nombre de caractères. Une fenêtre de 5 000 signes
     s'arrêtait AVANT la moitié du bloc : l'assertion passait au rouge sur du code parfaitement
     juste. C'est la leçon déjà écrite dans test-641, et elle vient de se reproduire. */
  const rDeb = SRV.indexOf('PLUS DE LIEN DE BIENVENUE');
  const rFin = SRV.indexOf('bouton2Url:', SRV.indexOf("L\\'adresse de votre entreprise est prête"));
  const relais = (rDeb >= 0 && rFin > rDeb) ? SRV.slice(rDeb, rFin) : '';
  /* Si le découpage rate, il le DIT : il ne passe pas au vert en ne regardant rien. */
  v('le bloc du relais est retrouvé, et entier', relais.length > 3000 && /accesCodeDe/.test(relais), true);
  v('⛔ le courriel d’inscription automatique n’envoie plus de lien', /lienEspaceCode/.test(relais), false);
  v('il envoie l’adresse', /const adrAuto = auto\.slug \? \('teamop\.fr\/e\/' \+ auto\.slug\) : '';/.test(relais), true);
  /* ⛔ Un espace qui vient d'être créé n'a AUCUN compte : sans code d'accès, l'adresse seule
     ne s'ouvre pas. C'est le cas où oublier le code ferme la porte à un client tout neuf. */
  v('⛔ …ET le code d’accès, parce que l’espace est neuf', /const accesAuto = enrAuto \? enrAuto\.code : '';/.test(relais), true);
  v('⛔ et si le code manque, il ne fait pas semblant', /Écrivez-nous pour recevoir votre code d\\'accès/.test(relais), true);
}

/* ══ 5) CE QUI DOIT SURVIVRE — les liens DÉJÀ entre les mains des gens ════════════════════ */
{
  v('app.html comprend toujours #entreprise=', /entreprise=\(\[A-Za-z0-9\+\/=_-\]\{8,\}\)/.test(APP), true);
  v('la vérification d’un lien reçu existe toujours', /async function lienEspaceConnu\(o\)/.test(APP), true);
  v('la route qui la sert existe toujours', /app\.post\('\/api\/espaces\/lien'/.test(SRV), true);
  v('…et la fabrique de lien reste, pour elle', /function lienEspaceCode\(e\)/.test(SRV), true);
}

/* ══ 6) UNE SEULE DÉFINITION DU CODE D'ACCÈS ══════════════════════════════════════════════
   Deux chemins le réclament — le panneau et le courriel. Deux copies finiraient par fabriquer
   deux codes différents : celui qu'on dicte et celui qu'on envoie. Même raison que fbUidEquipe. */
{
  v('accesCodeDe n’a qu’une définition', (SRV.match(/function accesCodeDe\(/g) || []).length, 1);
  /* TROIS chemins la réclament désormais : le panneau de la Tour, le courriel d'accueil, et
     l'inscription automatique depuis le site. Compter plutôt que nommer, pour qu'un QUATRIÈME
     chemin qui referait son propre code fasse tomber ce test. (4 = la définition + 3 appels.) */
  v('⛔ et les trois chemins passent par elle', (SRV.match(/accesCodeDe\(/g) || []).length, 4);
  v('…dont l’inscription automatique du site', /const enrAuto = auto\.t \? accesCodeDe\(auto\.t, 'inscription automatique'\) : null;/.test(SRV), true);
  v('elle rend null si l’écriture échoue', /if \(!accesEcrire\(\)\) \{ if \(avant\) accesReg\[t\] = avant; else delete accesReg\[t\]; return null; \}/.test(SRV), true);
}

/* ══ 7) LE VRAI SERVEUR — la première connexion marche-t-elle SANS lien ? ═════════════════ */
const banc = path.join(require('os').tmpdir(), 'teamop-test-669-' + process.pid);
let enfant = null;
const stop = () => { try { if (enfant && enfant.pid) process.kill(enfant.pid); } catch (e) {} try { fs.rmSync(banc, { recursive: true, force: true }); } catch (e) {} };

(async () => {
  let webpush;
  try { webpush = require(path.join(RACINE, 'server', 'node_modules', 'web-push')); }
  catch (e) {
    console.log('  … partie serveur SAUTÉE : server/node_modules absent (cd server && npm i)');
    console.log('\n' + ok + ' ✓  ' + ko + ' ✗'); process.exit(ko ? 1 : 0);
  }
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '');
  const sha = p => crypto.createHash('sha256').update(String(p)).digest('hex');
  const MDP = 'banc-669';

  fs.mkdirSync(path.join(banc, 'data'), { recursive: true });
  const vap = webpush.generateVAPIDKeys();
  fs.writeFileSync(path.join(banc, 'config.json'), JSON.stringify({
    vapidPublicKey: vap.publicKey, vapidPrivateKey: vap.privateKey, adminPassHash: sha(MDP) }));
  fs.writeFileSync(path.join(banc, 'data', 'espaces.json'), JSON.stringify({
    'elan': { slug: 'elan', nom: 'ELAN', email: 'e@exemple.fr', t: 'elan-34oc',
              code: b64({ t: 'elan-34oc', k: 'CLE-PROPRE-ELAN', n: 'ELAN', a: 'florent', m: 'Florent!!' }), ts: 1 } }));

  const PORT = 8700 + (process.pid % 90);
  enfant = spawn(process.execPath, [path.join(RACINE, 'server', 'index.js')], {
    env: Object.assign({}, process.env, { TEAMOP_CONFIG: path.join(banc, 'config.json'), TEAMOP_DATA: path.join(banc, 'data'), PORT: String(PORT) }),
    stdio: 'ignore' });
  const B = 'http://127.0.0.1:' + PORT;
  for (let i = 0; i < 60; i++) { try { await fetch(B + '/health'); break; } catch (e) { await new Promise(r => setTimeout(r, 100)); } }
  const P = async (c, body, tok) => {
    const r = await fetch(B + c, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}), body: JSON.stringify(body) });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { statut: r.status, j: j || {} };
  };

  try {
    let r = await P('/api/monitor/login', { nom: 'Patron', pass: MDP });
    const TOK = r.j.token || '';

    r = await P('/api/monitor/espaces/acces', { slug: 'elan' }, TOK);
    v('le code d’accès existe (créé au premier appel)', r.statut, 200);
    const ACCES = String(r.j.acces || '');
    v('…et il fait bien dix caractères', ACCES.length, 10);

    /* ⛔ LE CŒUR DE CE FICHIER. Sans lien, c'est CE chemin qui ouvre un espace neuf. S'il
       casse, plus aucune entreprise ne peut se connecter la première fois — et le reste du
       fichier passerait au vert sans rien voir. */
    r = await P('/api/espaces/ouvrir', { nom: 'elan', acces: ACCES });
    v('⛔ LA PREMIÈRE CONNEXION MARCHE SANS LIEN', r.statut, 200);
    let o = {}; try { o = JSON.parse(Buffer.from(String(r.j.code || ''), 'base64').toString('utf8')); } catch (e) {}
    v('…elle ouvre le BON espace', o.t, 'elan-34oc');
    v('…avec la clé qui déchiffre les données', !!o.k, true);
    v('⛔ …et sans le mot de passe provisoire en clair', !!o.m, false);

    r = await P('/api/espaces/ouvrir', { nom: 'elan', acces: 'MAUVAISCODE' });
    v('⛔ un mauvais code n’ouvre rien', r.statut, 403);
    r = await P('/api/espaces/ouvrir', { nom: 'elan', acces: '' });
    v('⛔ un code vide non plus', r.statut === 200, false);

    /* Le code dicté et le code envoyé sont le MÊME — c'est ce que garantit accesCodeDe. */
    r = await P('/api/monitor/espaces/acces', { slug: 'elan' }, TOK);
    v('⛔ relire le code ne le change pas', r.j.acces, ACCES);
    r = await P('/api/monitor/espaces/acces', { slug: 'elan', regenerer: true }, TOK);
    v('…mais « Renouveler » le change bien', r.j.acces !== ACCES, true);
    const NEUF = r.j.acces;
    r = await P('/api/espaces/ouvrir', { nom: 'elan', acces: ACCES });
    v('⛔ et l’ancien code ne vaut plus rien', r.statut, 403);
    r = await P('/api/espaces/ouvrir', { nom: 'elan', acces: NEUF });
    v('…le nouveau, si', r.statut, 200);
  } catch (e) {
    ko++; console.log('  ✗ banc serveur : ' + e.message);
  }
  stop();
  console.log('\n' + ok + ' ✓  ' + ko + ' ✗'); process.exit(ko ? 1 : 0);
})();
