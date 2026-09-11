/* ⛔ CE QUE CE FICHIER GARDE — trois vérités mesurées chez ELAN le 11 septembre 2026.

   1. UN ÉCRAN VIDE DOIT DIRE POURQUOI IL EST VIDE. Sur treize comptes, quatre techniciens
      (Mathys Perpi, Romain Avignon, Zampa 13, Antho Piovanacci) ouvraient « Boxes » sur la
      phrase « Aucune box. » — alors que l'entreprise en compte DIX-HUIT. Aucune ne les
      nommait, et aucune n'était « visible par tous ». Rien n'était cassé : personne ne leur
      avait attribué de box. Mais l'écran leur disait que l'entreprise n'avait rien, donc ils
      cherchaient la panne dans l'application. Même règle que le refus de /api/replies :
      distinguer « il n'y a rien » de « il y a, mais pas pour toi ».

   2. L'ADMINISTRATEUR DOIT LE VOIR AUSSI. `usrSansBox(u)` marque, sur la liste Utilisateurs,
      la personne qui ouvrirait cet écran sur du vide. Elle REJOUE `visibleBoxes` pour un autre
      que soi plutôt que de réécrire la règle : une seconde règle divergerait un jour, et
      l'écran mentirait à nouveau. Elle remet donc `currentUser` en place — TOUJOURS, même si
      l'appel lève.

   3. ⛔ « JAMAIS CONNECTÉ » NE SE DÉDUIT PAS D'UN JOURNAL PLEIN. La suppression en lot lit
      `cnxData[t]`, plafonné à 500 événements. Saturé, il ne prouve plus rien : un technicien
      en congés en sort, et le lot le supprimerait ET le bannirait. La route refuse donc le lot
      au-delà de ce seuil. */

const fs = require('fs');
const APP = fs.readFileSync(__dirname + '/../app.html', 'utf8');
const SRV = fs.readFileSync(__dirname + '/../server/index.js', 'utf8');
let ok = 0, ko = 0;
const v = (t, a, b) => { if (JSON.stringify(a) === JSON.stringify(b)) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + '\n      attendu : ' + JSON.stringify(b) + '\n      obtenu  : ' + JSON.stringify(a)); } };

/* La vraie fonction, extraite du fichier livré — aucune reconstruction. */
function extraire(nom) {
  const i = APP.indexOf('function ' + nom + '(');
  if (i < 0) throw new Error('fonction introuvable : ' + nom);
  let j = APP.indexOf('{', i), p = 0;
  for (let k = j; k < APP.length; k++) { const c = APP[k]; if (c === '{') p++; else if (c === '}') { p--; if (p === 0) { j = k; break; } } }
  return APP.slice(i, j + 1);
}
let db = {}, currentUser = null;
// visibleBoxes est remplacée par un double sous notre contrôle : ce qu'on éprouve ici, c'est
// usrSansBox — qu'elle interroge bien la VRAIE règle, et qu'elle repose currentUser derrière.
let vuParVisibleBoxes = [];
function visibleBoxes(list) { vuParVisibleBoxes.push(currentUser ? currentUser.login : null); return (list || []).filter(b => (b.userIds || []).includes(currentUser && currentUser.id)); }
// eslint-disable-next-line no-eval
eval(extraire('usrSansBox'));

console.log('Un écran vide dit pourquoi, et « jamais connecté » n’est pas déduit d’un journal plein');

// ── 1) usrSansBox : qui est marqué, qui ne l'est pas.
{
  db = {
    boxes: [{ id: 'b1', userIds: ['u1'] }, { id: 'b2', userIds: ['u1'] }],
    users: [{ id: 'u1', login: 'avecbox' }, { id: 'u2', login: 'sansbox' }]
  };
  const moi = { id: 'u9', login: 'moi' };
  currentUser = moi; vuParVisibleBoxes = [];
  v('une personne nommée sur une box n’est pas marquée', usrSansBox(db.users[0]), false);
  v('une personne nommée nulle part EST marquée', usrSansBox(db.users[1]), true);
  v('la vraie règle de visibilité est bien interrogée', vuParVisibleBoxes, ['avecbox', 'sansbox']);
  v('⛔ currentUser est remis en place après l’appel', currentUser, moi);
}

// ── 2) Les cas où l'on ne marque personne — pas de faux positif.
{
  db = { boxes: [], users: [{ id: 'u2', login: 'sansbox' }] };
  v('une entreprise SANS box ne marque personne (ce n’est pas un oubli)', usrSansBox(db.users[0]), false);
  db = { boxes: [{ id: 'b1', userIds: ['u1'] }], users: [] };
  v('un compte désactivé n’est pas marqué', usrSansBox({ id: 'u3', login: 'parti', actif: false }), false);
  v('ni null ni undefined ne cassent', [usrSansBox(null), usrSansBox(undefined)], [false, false]);
}

// ── 3) ⛔ currentUser est reposé MÊME si la règle lève — sinon l'application reste
//    connectée sous l'identité de quelqu'un d'autre, ce qui est bien pire que le badge.
{
  const vrai = visibleBoxes;
  visibleBoxes = () => { throw new Error('boum'); };
  db = { boxes: [{ id: 'b1' }], users: [] };
  const moi = { id: 'u9', login: 'moi' }; currentUser = moi;
  v('une règle qui lève ne marque pas', usrSansBox({ id: 'u4', login: 'x' }), false);
  v('⛔ et currentUser est quand même remis', currentUser, moi);
  visibleBoxes = vrai;
}

// ── 4) L'écran des box distingue « rien » de « rien POUR TOI ».
{
  const i = APP.indexOf('function renderBoxesList(');
  const bloc = APP.slice(i, i + 2600);
  v('le vide compte les box de l’ENTREPRISE avant de conclure', /const total=\(db\.boxes\|\|\[\]\)\.length;/.test(bloc), true);
  v('et le dit quand il y en a', /Aucune box ne t'est attribuée pour l'instant — l'entreprise en compte \$\{total\}/.test(bloc), true);
  v('une recherche sans résultat ne dit PAS « aucune box attribuée »', /Aucune box ne correspond à cette recherche\./.test(bloc), true);
  v('…et ne propose pas d’en créer une (le bouton ne répare pas une recherche)', /\(!q&&can\('supprimer'\)\)\?'Ajouter':''/.test(bloc), true);
  v('la liste Utilisateurs porte le badge', /\$\{usrSansBox\(u\)\?'<span class="st st-org"/.test(APP), true);
}

// ── 5) ⛔ Le lot refuse un journal saturé.
{
  v('la route en lot lit le journal une seule fois', /const journal = cnxData\[t\] \|\| \[\];/.test(SRV), true);
  v('⛔ et refuse le lot au-delà de 500 événements', /if \(journal\.length >= 500\) return res\.status\(409\)/.test(SRV), true);
  /* Le refus doit venir AVANT la construction de `aServi` : après, il aurait déjà conclu. */
  const g = SRV.indexOf('if (journal.length >= 500)'), a = SRV.indexOf('const aServi = new Set();');
  v('le refus précède la déduction « a servi / n’a jamais servi »', g > -1 && a > -1 && g < a, true);
  /* Et le plafond de la route doit rester le MÊME nombre que celui qui tronque le journal. */
  v('le seuil est bien celui du plafond réel du journal', /if \(l\.length > 500\) l\.length = 500;/.test(SRV), true);
}

console.log('\n' + ok + ' ✓  ' + ko + ' ✗'); process.exit(ko ? 1 : 0);
