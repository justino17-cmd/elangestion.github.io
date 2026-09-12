/* ⛔ CE QUE CE FICHIER GARDE — le lien d'une entreprise vient du SERVEUR, jamais du navigateur.

   12 septembre 2026, 9 h 00, capture de Justin sur son iPhone, fiche ELAN dans la Tour. Deux
   lignes, l'une sous l'autre, sur le même panneau :

       SON ADRESSE   teamop.fr/e/elan            → mesuré : résout vers « elan-34oc », le VRAI
       LE LIEN       …#entreprise=eyJ0IjoiZWxhbi1ncTNrIi…  → décodé : « elan-gq3k », inventé

   Justin : « Le 2ème lien correspond pas à elan ». Il avait raison, et voici pourquoi.

   ── LA CAUSE, LUE DANS LE CODE, PAS DEVINÉE ───────────────────────────────────────────────
   `tourEspaceDe` avait UNE seule source pour le lien : `localStorage.tour_liens`, du navigateur
   ouvert. L'adresse, elle, venait du serveur. Sur le téléphone du patron plutôt que sur son Mac,
   l'entrée manquait — et la fonction FABRIQUAIT un espace neuf :

       sp = { t: slug+'-'+Math.random().toString(36).slice(2,6), k: <24 lettres au hasard>, … }

   « elan » + « -gq3k » : exactement cette forme. Puis elle l'affichait comme étant celui du
   client. C'est ainsi que sont nés « elan-d4v8 » et « elan-tzl2 », trouvés hors annuaire la
   veille — pas un mystère, un mécanisme.

   ── CE QUI A SAUVÉ ELAN, ET QU'IL FAUT GARDER ─────────────────────────────────────────────
   Le serveur refuse (409) d'enregistrer un nom déjà pris par un AUTRE espace. L'annuaire n'a
   donc pas été écrasé, et `teamop.fr/e/elan` pointe toujours sur « elan-34oc » — vérifié en
   production par /api/espaces/verifie-nom, les quatre identifiants un par un.

   ── MAIS LA TOUR AVALAIT CE REFUS ─────────────────────────────────────────────────────────
   Sur le 409, elle affichait : « Attention : nom non enregistré côté serveur — LE LIEN, LUI,
   MARCHE ». C'était faux, et c'est précisément ce qui trompait : le lien était la seule chose
   qui ne marchait pas. Envoyé, il met la personne dans une base VIDE, avec une clé que personne
   d'autre ne possède.

   ⚠️ ET ON ÉCHOUE FERMÉ, ici, à l'inverse de la page de connexion. La règle n'est pas
   contradictoire, elle suit le COÛT : sur connexion.html, laisser passer n'accorde rien (il
   reste un mot de passe à donner) ; ici, passer CRÉE un espace. Fabriquer sur une réponse qu'on
   n'a pas reçue est exactement ce qui a produit les fantômes. */

const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawn } = require('child_process');
const RACINE = path.join(__dirname, '..');
const TOUR = fs.readFileSync(path.join(RACINE, 'tour.html'), 'utf8');

let ok = 0, ko = 0;
const v = (t, a, b) => { if (JSON.stringify(a) === JSON.stringify(b)) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + '\n      attendu : ' + JSON.stringify(b) + '\n      obtenu  : ' + JSON.stringify(a)); } };

function corps(src, entete) {
  const i = src.indexOf(entete);
  if (i < 0) return '';
  let j = src.indexOf('{', i), p = 0;
  for (let k = j; k < src.length; k++) {
    const c = src[k];
    if (c === '{') p++;
    else if (c === '}') { p--; if (!p) return src.slice(i, k + 1); }
  }
  return '';
}

console.log('Le lien d’une entreprise vient du serveur, jamais du navigateur');

/* ══ 1) LA TOUR — le texte, puis la fonction jouée pour de bon ═══════════════════════════ */
{
  const t = corps(TOUR, 'async function tourEspaceDe(');
  v('⛔ on demande au serveur AVANT de regarder le localStorage', /var connu=await tourLienServeur\(nom\);/.test(t), true);
  v('…et avant la question « a-t-elle déjà un Code espace ? »',
    t.indexOf('tourLienServeur(nom)') < t.indexOf('a-t-elle DÉJÀ un Code espace'), true);
  v('⛔ un serveur injoignable ne fabrique RIEN', /if\(connu==='incertain'\)\{/.test(t), true);
  v('…et il le dit', /on ne fabrique pas d\\'espace à l\\'aveugle/.test(t), true);
  v('quand le serveur connaît l’espace, c’est SON lien qu’on rend', /return \{ lien:connu\.lien,/.test(t), true);
  /* Le mot de passe provisoire ne revient pas du serveur (codeMdpHache l'a retiré) : on garde
     celui qu'on a, sinon celui que la fiche recalcule. Sans ça le panneau l'affichait vide. */
  v('le mot de passe provisoire ne se perd pas au passage', /mdp:\(\(sp&&sp\.m\)\|\|mdp\|\|''\)/.test(t), true);
  /* Le fabricant reste — un nom vraiment neuf doit pouvoir obtenir son espace. Le supprimer
     fermerait la porte à toute nouvelle entreprise : ce n'est pas la création qui était
     fautive, c'est de créer SANS avoir demandé. */
  v('…mais la création reste possible pour un nom vraiment neuf', /sp=\{t:slug\+'-'\+Math\.random/.test(t), true);

  const g = corps(TOUR, 'async function tourLienServeur(');
  v('la fonction existe', g.length > 200, true);
  v('elle interroge la bonne route', /'\/api\/monitor\/espaces\/lien-existant'/.test(g), true);

  /* On la JOUE, avec un apiPost de doublure : lire la fonction ne dit pas ce qu'elle rend. */
  const jouer = async (rep) => {
    const apiPost = rep;
    const toast = () => {};
    const f = eval('(' + g.replace(/^async function tourLienServeur/, 'async function') + ')');
    return await f('elan');
  };
  const attendu = { lien: 'https://teamop.fr/app.html#entreprise=XXX', slug: 'elan', nom: 'ELAN', ident: 'florent' };
  (async () => {
    v('un espace connu rend son lien',
      (await jouer(async () => ({ ok: true, status: 200, d: attendu }))).lien, attendu.lien);
    /* ⛔ LE 404 EST LA SEULE RÉPONSE QUI AUTORISE À CRÉER. C'est là que se joue tout le
       correctif : si le 404 ne se distinguait pas des autres refus, la Tour ne pourrait plus
       ouvrir aucun espace neuf — on aurait échangé une panne contre une autre. */
    v('⛔ 404 « ce nom n’a pas d’espace » → on peut créer',
      await jouer(async () => ({ ok: false, status: 404, d: { error: 'aucun espace inscrit sous ce nom' } })), null);
    v('⛔ un espace sans code ne se DOUBLE pas',
      await jouer(async () => ({ ok: false, status: 409, d: { motif: 'sans_code', error: 'à réinscrire' } })), 'incertain');
    v('un 403 ne fait pas créer', await jouer(async () => ({ ok: false, status: 403, d: {} })), 'incertain');
    v('un 500 non plus', await jouer(async () => ({ ok: false, status: 500, d: {} })), 'incertain');
    v('un serveur muet non plus', await jouer(async () => { throw new TypeError('Failed to fetch'); }), 'incertain');
    /* Réponse 200 sans lien : le serveur dit oui mais ne donne rien. Ne pas la prendre pour un
       « nom libre » — sinon un bogue serveur fabriquerait des espaces en série. */
    v('un « oui » sans lien ne vaut pas un « nom libre »',
      await jouer(async () => ({ ok: true, status: 200, d: {} })), 'incertain');
    suite();
  })();
}

function suite() {
  /* ══ 2) LE REFUS DU SERVEUR NE SE COMMENTE PLUS À L'ENVERS ═══════════════════════════ */
  {
    v('⛔ « le lien, lui, marche » a disparu — c’était faux', /le lien, lui, marche/.test(TOUR), false);
    v('le refus dit de NE PAS envoyer le lien', /Ne l\\'envoie pas\./.test(TOUR), true);
    v('⛔ et il arrête la fonction au lieu de continuer',
      /\}\); return null; \}\s*\n\s*\}catch\(e\)\{ toast\('⛔ Serveur injoignable pour l\\'annuaire/.test(TOUR)
      || /return null; \}/.test(corps(TOUR, 'async function tourEspaceDe(')), true);
    /* Les trois appelants déréférencent « e » tout de suite : sans garde, un refus devient
       « undefined is not an object » et le panneau ne s'ouvre jamais, sans un mot. */
    /* TROIS sites d'appel, trois gardes. Il y en avait bien trois et non deux : l'attribution
       de formule en a un aussi, moins visible que les deux panneaux. Les compter plutôt que
       les nommer est ce qui fera tomber ce test le jour où un QUATRIÈME appelant arrivera
       sans garde — et c'est exactement ce qu'on veut qu'il fasse. */
    v('les trois appelants survivent à un refus', (TOUR.match(/var e=await tourEspaceDe\([^)]*\);\n\s*if\(!e\)/g) || []).length, 3);
    v('…et autant d’appels que de gardes', (TOUR.match(/=await tourEspaceDe\(/g) || []).length, 3);
    v('…y compris l’accès version publique, qui doit aussi réarmer son bouton',
      /if\(!e\)\{ if\(btn\)\{ btn\.disabled=false;/.test(TOUR), true);
  }

  /* ══ 3) apiPost DOIT RENDRE LE CODE HTTP ═══════════════════════════════════════════════
     Sans lui, `r.status===404` n'est jamais vrai : tout refus devient un doute, et la Tour ne
     peut plus ouvrir un seul espace neuf. Le défaut aurait été muet — aucune erreur, juste
     une Tour qui ne crée plus rien. */
  {
    v('⛔ apiPost rend le statut', /return \{ok:r\.ok,status:r\.status,d:d\|\|\{\}\};/.test(TOUR), true);
    v('…sans rien retirer à ce que lisent les appelants existants', /\{ok:r\.ok,status:r\.status,d:d\|\|\{\}\}/.test(TOUR), true);
  }

  /* ══ 4) LE VRAI SERVEUR, ISOLÉ — comme test-641 : rien n'est simulé côté serveur ═══════ */
  const banc = path.join(require('os').tmpdir(), 'teamop-test-668-' + process.pid);
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
    const MDP = 'mot-de-passe-du-banc';

    fs.mkdirSync(path.join(banc, 'data'), { recursive: true });
    const vap = webpush.generateVAPIDKeys();
    fs.writeFileSync(path.join(banc, 'config.json'), JSON.stringify({
      vapidPublicKey: vap.publicKey, vapidPrivateKey: vap.privateKey, adminPassHash: sha(MDP) }));
    /* Les fixtures reprennent le cas réel : « elan » existe et porte elan-34oc, avec un mot de
       passe provisoire EN CLAIR dans le code — c'est ce que l'annuaire contient vraiment. */
    fs.writeFileSync(path.join(banc, 'data', 'espaces.json'), JSON.stringify({
      'elan': { slug: 'elan', nom: 'ELAN', email: 'e@exemple.fr', t: 'elan-34oc',
                code: b64({ t: 'elan-34oc', k: 'CLE-PROPRE-ELAN', n: 'ELAN', a: 'florent', m: 'Florent!!' }), ts: 1 },
      'sanscode': { slug: 'sanscode', nom: 'Sans code', email: 's@exemple.fr', t: 'sans-1', ts: 2 } }));

    const PORT = 8900 + (process.pid % 90);
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
      v('le banc obtient une session patron', r.statut, 200);
      const TOK = r.j.token || '';

      /* ⛔ SANS JETON, RIEN. Le code d'un espace porte « k » — la clé qui déchiffre TOUTES
         les données de l'entreprise. Cette route ne s'ouvre qu'au patron. */
      r = await P('/api/monitor/espaces/lien-existant', { nom: 'elan' });
      v('⛔ sans jeton : refusé', r.statut, 403);
      v('⛔ et rien de l’espace ne fuit dans le refus', /elan-34oc|CLE-PROPRE/.test(JSON.stringify(r.j)), false);

      r = await P('/api/monitor/espaces/lien-existant', { nom: 'elan' }, TOK);
      v('un espace inscrit rend son lien', r.statut, 200);
      const lien = String(r.j.lien || '');
      const code = lien.split('#entreprise=')[1] || '';
      let o = {}; try { o = JSON.parse(Buffer.from(code, 'base64').toString('utf8')); } catch (e) {}
      v('⛔ et c’est le VRAI espace — pas un identifiant fabriqué', o.t, 'elan-34oc');
      v('le serveur rend aussi l’identifiant de départ réel', r.j.ident, 'florent');
      v('…et le slug', r.j.slug, 'elan');
      /* La forme exacte du défaut : « elan- » + quatre caractères au hasard. */
      v('⛔ le lien ne porte AUCUN identifiant de la forme fabriquée', /^elan-[a-z0-9]{4}$/.test(o.t) && o.t !== 'elan-34oc', false);
      /* ⛔ Le mot de passe provisoire en clair ne sort pas d'ici : codeMdpHache le remplace
         par son empreinte, comme pour le lien envoyé par courriel. */
      v('⛔ le mot de passe provisoire en clair ne sort pas', /Florent!!/.test(lien), false);
      v('…il est remplacé par son empreinte', !!o.mh && !o.m, true);

      r = await P('/api/monitor/espaces/lien-existant', { nom: 'entreprise-qui-nexiste-pas' }, TOK);
      v('⛔ un nom inconnu rend 404 — la SEULE réponse qui autorise à créer', r.statut, 404);

      r = await P('/api/monitor/espaces/lien-existant', { nom: 'Sans code' }, TOK);
      v('⛔ un espace sans code rend 409, pas 404 — on ne le double pas', r.statut, 409);
      v('…et il dit pourquoi', r.j.motif, 'sans_code');

      /* ══ LE GARDE-FOU QUI A SAUVÉ ELAN — il doit rester ══════════════════════════════
         Enregistrer « elan » avec un AUTRE identifiant d'équipe doit être refusé. Sans lui,
         le clic du 12 septembre aurait remplacé l'annuaire d'ELAN par l'espace inventé :
         plus personne ne se connectait par teamop.fr/e/elan. */
      r = await P('/api/monitor/espaces', { nom: 'ELAN', code: b64({ t: 'elan-gq3k', k: 'INVENTEE' }), email: 'e@exemple.fr' }, TOK);
      v('⛔ un nom déjà pris par un AUTRE espace est refusé', r.statut, 409);

      r = await P('/api/monitor/espaces/lien-existant', { nom: 'elan' }, TOK);
      let o2 = {}; try { o2 = JSON.parse(Buffer.from(String(r.j.lien || '').split('#entreprise=')[1] || '', 'base64').toString('utf8')); } catch (e) {}
      v('⛔ et l’annuaire d’ELAN est intact après la tentative', o2.t, 'elan-34oc');

      /* Le même espace sous son propre identifiant : accepté, c'est une mise à jour. */
      r = await P('/api/monitor/espaces', { nom: 'ELAN', code: b64({ t: 'elan-34oc', k: 'CLE-PROPRE-ELAN', a: 'florent' }), email: 'e@exemple.fr' }, TOK);
      v('…mais le MÊME espace se réenregistre sans problème', r.statut, 200);
    } catch (e) {
      ko++; console.log('  ✗ banc serveur : ' + e.message);
    }
    stop();
    console.log('\n' + ok + ' ✓  ' + ko + ' ✗'); process.exit(ko ? 1 : 0);
  })();
}
