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
/* boxADuStock est extraite ici parce que le cadre ET le filtre s'en servent : la charger une
   seule fois dans ce test reproduit exactement ce que fait le fichier livré. */
// eslint-disable-next-line no-eval
eval(APP.slice(APP.indexOf('function boxADuStock(b){'), APP.indexOf('\n', APP.indexOf('function boxADuStock(b){'))));

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

// ── 6) ⛔ Le cadre des Boxes dit COMBIEN ont du stock — sinon deux personnes de la même
//    entreprise décrivent deux réalités et les deux ont raison (ELAN, 11 septembre 2026 :
//    l'administrateur voit 18 box dont 13 vides, un chef d'équipe ne voit QUE la sienne, pleine).
{
  const i = APP.indexOf('const avecStock=mine.filter');
  v('le cadre compte les box qui ont du stock', i > -1, true);
  const code = APP.slice(i, APP.indexOf('const cadre=', i)).replace(/\bconst /g, '');
  let avecStock, unites, mine;
  const bx = (u, ctn) => ({ stock: { p1: { u: u, ctn: ctn || 0 } } });
  /* Un carton sans unité EST du stock : compter les seules unités dirait « 0 avec du stock »
     sur une box pleine de cartons — exactement le mensonge qu'on vient de corriger. */
  mine = [bx(5), bx(0), bx(0, 3), { stock: {} }]; eval(code);
  v('une box à zéro n’est pas comptée comme pleine', avecStock, 2);
  v('les unités se totalisent (les cartons ne s’y ajoutent pas)', unites, 5);
  mine = []; eval(code);
  v('aucune box : rien à compter, et le cadre n’affiche pas le détail', [avecStock, unites], [0, 0]);
  v('le détail n’apparaît que s’il y a des box', /\$\{mine\.length\} box[^`]*`\s*\+\(mine\.length\?/.test(APP), true);
  v('le nombre est écrit à la française (espace insécable pour les milliers)', /toLocaleString\('fr-FR'\)/.test(APP), true);
}

// ── 7) v663 : la puce « Avec du stock », pour ne plus défiler à travers treize box vides.
{
  /* La règle « cette box a du stock » doit exister UNE seule fois : le compte du cadre et le
     filtre de la liste répondent à la même question, et deux expressions séparées finiraient
     par annoncer « 5 avec du stock » en n'en montrant que quatre. */
  v('une seule définition de la règle', (APP.match(/function boxADuStock\(b\)\{/g) || []).length, 1);
  v('une box à zéro n’a pas de stock', boxADuStock({ stock: { p: { u: 0, ctn: 0 } } }), false);
  v('des unités comptent', boxADuStock({ stock: { p: { u: 3, ctn: 0 } } }), true);
  v('⛔ un carton sans unité compte AUSSI', boxADuStock({ stock: { p: { u: 0, ctn: 2 } } }), true);
  v('une box sans stock du tout', [boxADuStock({}), boxADuStock({ stock: {} }), boxADuStock(null)], [false, false, false]);
  v('le cadre réutilise la fonction au lieu de refaire le calcul',
    /const avecStock=mine\.filter\(boxADuStock\)\.length;/.test(APP), true);
  v('le filtre de la liste aussi', /\(!boxFiltreStock\|\|boxADuStock\(b\)\)/.test(APP), true);
  /* Un filtre qui ne filtre rien n'est qu'un bouton de plus : il n'apparaît que s'il y a du
     plein ET du vide. Et il se REMET À FAUX quand il disparaît, sinon il resterait actif de
     façon invisible sur l'écran suivant. */
  v('⛔ la puce n’apparaît que s’il y a quelque chose à filtrer',
    /const nStock=mine\.filter\(boxADuStock\)\.length, filtrable=nStock>0&&nStock<mine\.length;/.test(APP), true);
  v('⛔ et le filtre retombe quand elle disparaît', /if\(!filtrable\) boxFiltreStock=false;/.test(APP), true);
  v('la puce porte le compte', /📦 Avec du stock · \$\{nStock\}/.test(APP), true);
  v('le filtre part à faux au chargement', /let boxListSearch='', boxFiltreStock=false;/.test(APP), true);
}

// ── 8) v663 : le stock s'affiche SUR la ligne — « ici il faudrait voir le nombre de stockage
//    par box » (Justin, 11 septembre 2026). Sans ce chiffre, il fallait ouvrir les dix-huit box
//    une par une pour savoir lesquelles servent.
{
  // eslint-disable-next-line no-eval
  eval(extraire('boxTotalStock'));
  v('une box vide totalise zéro', boxTotalStock({ stock: { a: { u: 0, ctn: 0 } } }), { u: 0, c: 0 });
  v('les unités s’additionnent', boxTotalStock({ stock: { a: { u: 3 }, b: { u: 4 } } }), { u: 7, c: 0 });
  /* ⛔ Les cartons se comptent À PART : un carton n'est pas une unité, et les additionner
     donnerait un total qui ne veut rien dire — c'est la règle « un bon de remise ne totalise
     pas des unités avec des cartons », appliquée à l'affichage. */
  v('⛔ les cartons restent séparés des unités', boxTotalStock({ stock: { a: { u: 2, ctn: 5 } } }), { u: 2, c: 5 });
  v('un stock au format ancien (nombre nu) compte quand même', boxTotalStock({ stock: { a: 6 } }), { u: 6, c: 0 });
  v('rien ne casse sur une box sans stock', [boxTotalStock({}), boxTotalStock(null)], [{ u: 0, c: 0 }, { u: 0, c: 0 }]);
  /* ELAN, mesuré : Nantes 7 199 u, et treize box à zéro. */
  v('la pastille n’apparaît pas quand il n’y a rien à montrer', /if\(!t\.u&&!t\.c\) return '';/.test(APP), true);
  v('elle est posée sur la ligne de la liste, avant le chevron',
    APP.indexOf('title="Stock total de cette box"') < APP.indexOf('font-size:22px;font-weight:300">›'), true);
  v('les chiffres sont alignés en colonne (chasse fixe)', /font-variant-numeric:tabular-nums;white-space:nowrap/.test(APP), true);
  v('et écrits à la française', /t\.u\.toLocaleString\('fr-FR'\)\+' u'/.test(APP), true);
}

console.log('\n' + ok + ' ✓  ' + ko + ' ✗'); process.exit(ko ? 1 : 0);
