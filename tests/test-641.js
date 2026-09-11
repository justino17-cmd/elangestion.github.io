/* ⛔ CE QUE CE FICHIER GARDE — deux portes du serveur refermées le 11 septembre 2026.

   C'est la PREMIÈRE suite qui vise `server/`, et elle ne ressemble pas aux douze autres :
   celles-ci extraient des fonctions d'app.html et les exécutent, ici on lance le VRAI
   serveur, isolé (sa propre configuration, ses propres données, un port à lui) et on lui
   parle en HTTP. Rien n'est simulé du côté serveur : ce qui répond est `server/index.js`
   tel qu'il sera déployé. ⚠️ Jamais api.teamop.fr — tout se passe sur 127.0.0.1.

   La partie « courrier » s'exécute. La partie « code promo » se lit, parce qu'elle vit
   derrière POST /api/clients/sync, dont la garde exige un jeton signé par Google : le
   banc a dû détourner l'adresse des certificats (UNE ligne) pour signer le sien, et une
   suite du dépôt ne doit pas dépendre d'un fichier modifié — voir tests/LISEZMOI.md,
   « ne jamais tester un SUBSTITUT de ce que le code produit ». La preuve fonctionnelle
   vit donc dans la sonde du scratchpad `banc/t-promo.js`, jouée sur les deux versions.
   Mesuré le 11 septembre 2026, même sonde, mêmes fixtures :
     avant → le code inventé « PEU-IMPORTE » est écrit dans promos-usages.json avec
             finLe 9999-12-31 ; un second code s'empile sur le même espace ; un code à
             maxUtilisations:1 est distribué TROIS fois (compteur n=3).       3 ✓  7 ✗
     après → le code inconnu n'entre pas ; l'échéance vaut p.mois ; pas d'empilement ;
             le compteur s'arrête à 1.                                       10 ✓  0 ✗ */

const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawn } = require('child_process');
const RACINE = path.join(__dirname, '..');
const SRV = fs.readFileSync(path.join(RACINE, 'server', 'index.js'), 'utf8');

let ok = 0, ko = 0;
const v = (t, a, b) => { if (JSON.stringify(a) === JSON.stringify(b)) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + '\n      attendu : ' + JSON.stringify(b) + '\n      obtenu  : ' + JSON.stringify(a)); } };

/* ══ 1. LE RELAIS DE CODE PROMO — lecture du texte, preuve en sonde (voir l'en-tête) ══ */
console.log('Un code promo ne s\'active QUE s\'il existe, et son échéance se calcule');
{
  /* Le bloc entier, borné par deux repères de TEXTE — jamais par un nombre de caractères
     (leçon de test-637 : une borne en caractères cesse de voir le code le jour où il
     grandit, et met au rouge du code juste), et jamais par un `try {` remonté à l'aveugle :
     le bloc en contient un IMBRIQUÉ, et partir de lui coupait avant la moitié des lignes
     à vérifier — deux contrôles au rouge sur du code parfaitement juste, le 11 septembre.
     D'où les deux gardes ci-dessous : si le découpage rate, il le DIT, il ne passe pas. */
  const debut = SRV.indexOf('Un code promo activé sur le SITE se relaie');
  const bloc = debut < 0 ? '' : SRV.slice(debut, SRV.indexOf('// Nouvelle demande d\'application', debut));
  v('le bloc de relais est retrouvé', debut >= 0 && bloc.length > 200 && bloc.length < 6000, true);
  v('…et il est entier — du premier champ lu au mail d\'activation',
    [/const pc = monStr\(b\.promoCode/.test(bloc), /mailPromoActive\(/.test(bloc)], [true, true]);

  v('le code est cherché dans config.promos — c\'est LUI qui décide',
    /config\.promos \|\| \[\]\)\.find\(x => String\(x\.code/.test(bloc), true);
  v('l\'échéance est CALCULÉE depuis p.mois', /setMonth\(dF\.getMonth\(\) \+ Math\.max\(1, Number\(pDef\.mois\)/.test(bloc), true);
  v('maxUtilisations est vérifié avant de compter', /pDef\.maxUtilisations && u\.n >= pDef\.maxUtilisations/.test(bloc), true);
  v('un code déjà actif ailleurs n\'est pas empilé', /autre/.test(bloc) && /eq2\.finLe >= auj/.test(bloc), true);

  /* Le cœur du défaut : une date venue du corps de la requête écrite comme échéance.
     `promoFin` peut encore être ENVOYÉ par le site — c'est le serveur qui ne le croit plus. */
  v('⛔ promoFin ne sert plus de date d\'échéance', /finLe: pf\b/.test(bloc), false);
  v('⛔ et n\'est même plus lu dans ce bloc', /b\.promoFin/.test(bloc), false);
  v('⛔ aucune prolongation sur une date du corps', /u\.equipes\[tEsp\]\.finLe = pf/.test(bloc), false);
  v('le mail d\'activation part avec la date calculée, pas celle reçue',
    /mailPromoActive\(tEsp, pc, finLe,/.test(bloc), true);
  /* Le journal dit QUEL code a été tenté, jamais par qui : ni l'adresse e-mail du compte,
     ni l'identifiant de l'espace. C'est la règle « pas de données personnelles de clients
     dans les journaux » appliquée à un message qu'on a envie d'enrichir. */
  const ligneIgnore = (bloc.match(/console\.log\('code promo du site IGNORÉ.*/) || [''])[0];
  v('le code inconnu est bien journalisé', /IGNORÉ/.test(ligneIgnore), true);
  /* Et le code est NETTOYÉ avant d'être écrit : `monStr` n'est qu'un `slice`, donc un code
     de 40 caractères contenant un saut de ligne fabriquait une entrée de journalctl forgée. */
  v('…avec le code seul — ni adresse, ni espace', /, pc\.replace\([^)]*\)\);\s*$/.test(ligneIgnore), true);
  v('…et les caractères de contrôle sont neutralisés', /\[\^A-Z0-9_-\]/.test(ligneIgnore), true);
  v('…et rien qui ressemble à un identifiant', /email|tEsp|esp\.|b\.nom/.test(ligneIgnore), false);
}

/* ══ 2. LES DEUX ROUTES DE LECTURE DU COURRIER — sur le vrai serveur, isolé ══ */
console.log('\n/api/replies et /api/mailboxes exigent la preuve de la clé d\'équipe');
{
  v('le point de passage existe', /function cleEquipeExige\(req, res, next\)/.test(SRV), true);
  v('il est monté sur les deux routes, et sur elles seules',
    /app\.use\(\['\/api\/replies', '\/api\/mailboxes'\], cleEquipeExige\);/.test(SRV), true);
  /* L'ordre est ce qui rend le tout vrai : cleEquipeExige lit req.cleEquipe, que seul
     cleEquipeObserve pose. Monté avant lui, il refuserait tout le monde. */
  v('et APRÈS le compteur qui pose req.cleEquipe',
    SRV.indexOf('], cleEquipeObserve);') < SRV.indexOf('], cleEquipeExige);'), true);
  /* ⛔ LA PORTE EST POSÉE MAIS OUVERTE, ET C'EST VOULU — voir le long commentaire du
     serveur. `gardien` a montré le 11 septembre que le refus faisait afficher « Connecte ta
     boîte mail » et son bouton : on ne ferme qu'une fois la v641 publiée ET exigée. Le test
     l'exerce dans les DEUX positions, plus bas, sur un vrai serveur.
     `!== true` et non `=== false` : seul le booléen true ferme. Une configuration où
     quelqu'un écrirait "true", 1 ou "oui" laisse la porte ouverte — c'est le sens prudent
     ici, l'inverse de d'habitude, parce que fermer par accident casse des clients. */
  v('la fermeture tient à un seul réglage, et il faut le booléen true',
    /if \(config\.mailPreuveExigee !== true\) return next\(\);/.test(SRV), true);
  v('…et le commentaire dit l\'ordre : les appareils d\'abord, la porte ensuite',
    /LES APPAREILS\s+D'ABORD, LA PORTE ENSUITE/.test(SRV), true);
}

/* ══ 3. L'ANNUAIRE NE S'ÉCRIT QUE D'UN BLOC ══ */
console.log('\nespaces.json s\'écrit en temporaire puis renommage, partout');
{
  /* Pourquoi ça compte davantage depuis le 11 septembre : si ce fichier est tronqué par un
     disque plein ou un arrêt au mauvais moment, TOUTES les entreprises sortent de l'annuaire
     d'un coup. Et ce jour-là, ça ne casse plus seulement la Tour — `cleEquipeVerdict` rend
     « inconnu » (donc plus de courrier), `/api/fb/jeton` rend 404 (donc plus de jeton), et
     la règle Firestore désormais publiée refuse l'anonyme : plus de synchro du tout, pour
     tout le monde. Le renommage est atomique ; l'écriture directe ne l'est pas. */
  v('⛔ plus une seule écriture directe de espaces.json',
    (SRV.match(/fs\.writeFileSync\(ESPACES_PATH/g) || []).length, 0);
  v('le seul chemin d\'écriture passe par le temporaire puis le renommage',
    /function espacesEcrire\(\) \{[\s\S]{0,400}?ESPACES_PATH \+ '\.tmp'[\s\S]{0,200}?fs\.renameSync\(tmp, ESPACES_PATH\)/.test(SRV), true);
  v('et il rend false plutôt que de lever — l\'appelant peut revenir en arrière',
    /catch \(e\) \{ console\.error\('espaces\.json non écrit[\s\S]{0,60}?return false; \}/.test(SRV), true);
  v('les deux appelants qui savent revenir en arrière le font toujours',
    (SRV.match(/if \(!espacesEcrire\(\)\)/g) || []).length >= 2, true);
}

/* ══ 4. CÔTÉ APPLICATION : UN REFUS SE VOIT, ET NE RÉCLAME PAS UN MOT DE PASSE ══ */
console.log('\nL\'écran Courrier distingue « refusé » de « aucune boîte »');
{
  const APP = fs.readFileSync(path.join(RACINE, 'app.html'), 'utf8');
  /* ⛔ CE QUE `gardien` A TROUVÉ LE 11 SEPTEMBRE, ET QUI A REPOUSSÉ LA FERMETURE.
     Le refus en text/plain devait faire jeter r.json() et afficher « Réception
     indisponible ». Mesuré au navigateur sur la bêta, il affichait « Connecte ta boîte
     mail » AVEC SON BOUTON : loadMailboxes() posait _mailboxes=[] sur échec, et son .then
     réécrivait #mail-list par-dessus le message de panne. On réclamait son mot de passe
     d'application Gmail à quelqu'un dont la boîte marchait très bien.
     Avant/après, même sonde, 403 interceptés au réseau (scratchpad/banc/sonde-courrier.js) :
       avant → « Connecte ta boîte mail », panne NON annoncée, mot de passe réclamé
       après → « Réception indisponible », panne annoncée, rien de réclamé, 0 erreur de page
     Les deux cas sains sont inchangés (sonde-normal.js, 8 ✓). */
  v('_mailboxes part de null — « on ne sait pas », pas « aucune »',
    /let mailTab='recu'; let _mailboxes=null;/.test(APP), true);
  v('un statut non-ok met la liste à NULL, sans attendre que r.json\(\) jette',
    (APP.match(/if\(!r\.ok\)\{ _mail(boxes|Replies)=null; return _mail(boxes|Replies); \}/g) || []).length, 2);
  /* Trois : les deux chargeurs de l'écran Courrier, plus l'onglet Boîte Commandes. */
  v('une réponse qui n\'est pas un tableau ne passe pas pour une liste vide',
    (APP.match(/Array\.isArray\(d\.(mailboxes|replies)\)\?d\.(mailboxes|replies):null/g) || []).length, 3);
  v('⛔ on ne propose de connecter une boîte QUE si on sait qu\'il n\'y en a aucune',
    /if\(!_mbKo && !_mb\.length\)\{ const el=\$\('mail-list'\);/.test(APP), true);
  v('plus un seul lecteur de _mailboxes qui jetterait sur null',
    /(?<!\(|\|\|\[\]\))_mailboxes\.(length|map|forEach|find)\(/.test(APP.replace(/\(_mailboxes\|\|\[\]\)\./g, 'SAFE.')), false);
  v('l\'onglet Boîte Commandes ne dit plus « aucune réponse » sur un refus',
    /let reps=null;/.test(APP) && /if\(reps===null\)\{[^]{0,120}Réponses indisponibles/.test(APP), true);
  v('le code promo présente désormais la preuve de clé',
    /api\/promo\/valider',\{method:'POST',headers:await enteteEquipe\(\{'Content-Type':'application\/json'\}\)/.test(APP), true);
}

console.log('\nLe code promo anonyme ne s\'offre plus un abonnement');
{
  /* ⛔ LA MÊME FAILLE QUE LE RELAIS, EN VERSION SANS IDENTITÉ — et elle est restée ouverte
     une demi-journée après que l'autre a été fermée. Fermer une moitié d'un défaut ne vaut
     rien. Rejoué par `gardien` sur banc : POST /api/promo/valider {code, teamId} → 200, puis
     /api/espaces/etat → paye:true. Et `u.n++` au-dessus de `if (team)` épuisait un code à
     maxUtilisations:2 en deux requêtes sans teamId : déni de service sur une campagne. */
  const bloc = SRV.slice(SRV.indexOf("app.post('/api/promo/valider'"), SRV.indexOf("// ── ⏳ Rappel d'échéance"));
  v('le bloc est retrouvé, et entier', bloc.length > 800 && /res\.json\(\{ ok: true, formule:/.test(bloc), true);
  v('l\'écriture exige la preuve de la clé d\'équipe',
    /const v = cleEquipeVerdict\(team, req\.headers\['x-teamop-kh'\] \|\| ''\);/.test(bloc), true);
  v('…et refuse une clé publique, comme /api/fb/jeton', /v !== 'valide' \|\| cleEstPublique\(team\)/.test(bloc), true);
  v('⛔ le compteur ne bouge QUE si un espace est servi', /if \(!apercu && team\) \{ u\.n\+\+;/.test(bloc), true);
  v('⛔ et plus jamais au-dessus de la condition', /\{ u\.n\+\+; if \(team\)/.test(bloc), false);
  v('l\'aperçu reste public — il n\'écrit rien et précède tout espace',
    /if \(!apercu && team\) \{/.test(bloc), true);
  v('la route passe sous le quota strict par IP',
    /ROUTES_SENSIBLES = \/\^\\\/api\\\/\(stripe\|devis\|sendcode\|mdp\|beta\|promo\|/.test(SRV), true);
}

const banc = path.join(require('os').tmpdir(), 'teamop-test-641-' + process.pid);
let enfant = null;
function stop() { try { if (enfant && enfant.pid) process.kill(enfant.pid); } catch (e) {} try { fs.rmSync(banc, { recursive: true, force: true }); } catch (e) {} }

(async () => {
  let webpush;
  try { webpush = require(path.join(RACINE, 'server', 'node_modules', 'web-push')); }
  catch (e) {
    console.log('  … partie exécutée SAUTÉE : server/node_modules absent (cd server && npm i)');
    console.log('\n' + ok + ' ✓  ' + ko + ' ✗'); process.exit(ko ? 1 : 0);
  }

  const CLE_A = 'CLE-PRIVEE-DE-A-2026';
  const CLE_PARTAGEE = 'ELAN-GESTION-7F3A9C2E-cloud-2026';   // celle d'app.html : publique, donc sans valeur de preuve
  const kh = k => crypto.createHash('sha256').update(k).digest('hex');
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64');

  fs.mkdirSync(path.join(banc, 'data'), { recursive: true });
  const vap = webpush.generateVAPIDKeys();
  /* Deux configurations : celle du banc FERME la porte (c'est ce qu'on veut éprouver), et
     une seconde SANS le réglage sert à vérifier que la version publiée, elle, laisse passer. */
  const cfg = { vapidPublicKey: vap.publicKey, vapidPrivateKey: vap.privateKey, apiKey: 'banc' };
  fs.writeFileSync(path.join(banc, 'config.json'), JSON.stringify(Object.assign({ mailPreuveExigee: true }, cfg)));
  fs.writeFileSync(path.join(banc, 'config-defaut.json'), JSON.stringify(cfg));
  fs.writeFileSync(path.join(banc, 'data', 'espaces.json'), JSON.stringify({
    'entreprise-a': { slug: 'entreprise-a', nom: 'A', email: 'a@exemple.fr', t: 'ent-a-9x', code: b64({ t: 'ent-a-9x', k: CLE_A }), ts: 1 },
    'entreprise-b': { slug: 'entreprise-b', nom: 'B', email: 'b@exemple.fr', t: 'ent-b-7y', code: b64({ t: 'ent-b-7y', k: CLE_PARTAGEE }), ts: 2 },
    'elan-gestion': { slug: 'elan-gestion', nom: 'Repli', email: 'r@exemple.fr', t: 'elan-gestion', code: b64({ t: 'elan-gestion', k: CLE_PARTAGEE }), ts: 3 } }));
  fs.writeFileSync(path.join(banc, 'data', 'replies.jsonl'),
    JSON.stringify({ ts: Date.now(), teamId: 'ent-a-9x', from: 'client@dehors.fr', subject: 'Devis urgent', text: 'Bonjour', mid: 'm1' }) + '\n' +
    JSON.stringify({ ts: Date.now(), teamId: 'ent-b-7y', from: 'autre@dehors.fr', subject: 'Facture', text: 'Ci-joint', mid: 'm2' }) + '\n');
  fs.writeFileSync(path.join(banc, 'data', 'mailboxes.json'), JSON.stringify({
    mb1: { id: 'mb1', teamId: 'ent-a-9x', email: 'a@exemple.fr', pass: 'mot-de-passe-secret', name: 'Boîte A', imapHost: 'ssl0.ovh.net', smtpHost: 'ssl0.ovh.net' } }));

  const PORT = 8100 + (process.pid % 800);
  enfant = spawn(process.execPath, [path.join(RACINE, 'server', 'index.js')], {
    env: Object.assign({}, process.env, { TEAMOP_CONFIG: path.join(banc, 'config.json'), TEAMOP_DATA: path.join(banc, 'data'), PORT: String(PORT) }),
    stdio: 'ignore' });
  const B = 'http://127.0.0.1:' + PORT;

  for (let i = 0; i < 60; i++) {
    try { await fetch(B + '/health'); break; } catch (e) { await new Promise(r => setTimeout(r, 100)); }
  }
  const q = async (c, h) => { const r = await fetch(B + c, { headers: h || {} }); const txt = await r.text();
    let json = null, jette = false; try { json = JSON.parse(txt); } catch (e) { jette = true; }
    return { statut: r.status, ct: r.headers.get('content-type') || '', txt, json, jette }; };

  try {
    let r = await q('/api/replies?teamId=ent-a-9x');
    v('sans preuve : refusé', r.statut, 403);
    v('sans preuve : AUCUN courriel ne sort', /Devis urgent/.test(r.txt), false);
    /* ⛔ LE POINT QUI COMPTE, et il n'est pas cosmétique. loadMailReplies() (app.html) fait
       « const d = await r.json(); _mailReplies = d.replies||[] ». Un refus EN JSON se
       parserait sans erreur, _mailReplies deviendrait [] et l'écran afficherait
       « 📭 Aucun message » : le client ne verrait pas une panne, il verrait sa
       correspondance disparue. En text/plain, r.json() jette, le catch met null, et
       l'écran dit « Réception indisponible ». Ne jamais repasser ce refus en JSON. */
    v('⛔ le refus n\'est PAS du JSON — sinon « Aucun message » au lieu d\'une panne', r.jette, true);
    v('⛔ il est bien en text/plain', /^text\/plain/.test(r.ct), true);

    r = await q('/api/replies?teamId=ent-a-9x', { 'x-teamop-kh': kh('MAUVAISE-CLE') });
    v('mauvaise clé : refusé', r.statut, 403);
    r = await q('/api/replies?teamId=ent-a-9x', { 'x-teamop-kh': 'pas-un-sha256' });
    v('kh malformé : refusé', r.statut, 403);
    r = await q('/api/mailboxes?teamId=ent-a-9x');
    v('les boîtes aussi', r.statut, 403);
    v('ni adresse ni serveur dans le refus', /exemple\.fr|ssl0\.ovh/.test(r.txt), false);

    r = await q('/api/replies?teamId=ent-a-9x', { 'x-teamop-kh': kh(CLE_A) });
    v('bonne clé : la Réception répond', r.statut, 200);
    v('et c\'est bien son courrier', (r.json && r.json.replies || []).map(x => x.subject), ['Devis urgent']);
    r = await q('/api/mailboxes?teamId=ent-a-9x', { 'x-teamop-kh': kh(CLE_A) });
    v('bonne clé : ses boîtes répondent', (r.json && r.json.mailboxes || []).length, 1);
    v('toujours sans le mot de passe de la boîte', /mot-de-passe-secret/.test(r.txt), false);

    /* Une preuve calculable par tout le monde n'est pas une preuve : la clé partagée est
       écrite en clair dans app.html. Le kh est JUSTE, et pourtant la porte reste fermée. */
    r = await q('/api/replies?teamId=ent-b-7y', { 'x-teamop-kh': kh(CLE_PARTAGEE) });
    v('⛔ clé partagée : kh juste, mais refusé quand même', r.statut, 403);
    v('le courrier de B ne sort pas', /Facture/.test(r.txt), false);
    r = await q('/api/replies?teamId=elan-gestion', { 'x-teamop-kh': kh(CLE_PARTAGEE) });
    v('espace technique (repli, bêta) : refusé', r.statut, 403);
    r = await q('/api/replies?teamId=espace-hors-annuaire', { 'x-teamop-kh': kh(CLE_A) });
    v('espace hors annuaire : invérifiable, donc refusé', r.statut, 403);

    /* ⛔ ET LA POSITION DANS LAQUELLE ÇA PART : OUVERT. Sans ce contrôle, la suite dirait
       « tout va bien » alors que la porte publiée ne refuse rien — on se croirait protégé.
       Un second serveur, même code, configuration SANS le réglage : il doit laisser passer,
       exactement comme la v641 qu'on déploie. Le jour où Justin posera
       « mailPreuveExigee »: true, c'est CE test-là qui devra être retourné. */
    const PORT2 = PORT + 1;
    const enf2 = spawn(process.execPath, [path.join(RACINE, 'server', 'index.js')], {
      env: Object.assign({}, process.env, { TEAMOP_CONFIG: path.join(banc, 'config-defaut.json'), TEAMOP_DATA: path.join(banc, 'data'), PORT: String(PORT2) }),
      stdio: 'ignore' });
    try {
      const B2 = 'http://127.0.0.1:' + PORT2;
      for (let i = 0; i < 60; i++) { try { await fetch(B2 + '/health'); break; } catch (e) { await new Promise(r => setTimeout(r, 100)); } }
      const r2 = await fetch(B2 + '/api/replies?teamId=ent-a-9x');
      v('sans le réglage, la porte est OUVERTE — c\'est ce qui est publié aujourd\'hui', r2.status, 200);
      const r3 = await fetch(B2 + '/api/mailboxes?teamId=ent-a-9x');
      v('les boîtes aussi', r3.status, 200);
    } finally { try { if (enf2.pid) process.kill(enf2.pid); } catch (e) {} }

    const h = await (await fetch(B + '/health')).json();
    v('les refus sont comptés', h.mailRefus.n > 0, true);
    v('ventilés par motif', Object.keys(h.mailRefus.parMotif).sort(), ['absent', 'inconnu', 'invalide', 'partagee', 'technique']);
    /* /health est PUBLIQUE : un slug ou un teamId y dirait au monde quelles entreprises
       existent. Seule /api/mail/cles, protégée par la clé du serveur, les ventile. */
    v('⛔ /health ne nomme AUCUN espace', /ent-a-9x|ent-b-7y|entreprise-a|elan-gestion/.test(JSON.stringify(h)), false);
  } catch (e) { ko++; console.log('  ✗ le banc n\'a pas pu tourner : ' + e.message); }

  stop();
  console.log('\n' + ok + ' ✓  ' + ko + ' ✗');
  process.exit(ko ? 1 : 0);
})();

process.on('uncaughtException', e => { stop(); console.log('  ✗ ' + e.message); process.exit(1); });
