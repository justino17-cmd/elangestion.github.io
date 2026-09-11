/* ⛔ CE QUE CE FICHIER GARDE — une alerte de synchro doit savoir se démentir, et son délai
   doit suivre le poids de ce qu'on envoie.

   11 septembre 2026, 17 h 35, capture de Justin sur son propre compte chez ELAN :
   « ⚠️ Tes modifications ne partent pas encore vers l'équipe — elles sont enregistrées sur
   cet appareil ». Le message est juste dans sa mécanique (l'écriture n'était pas acquittée) et
   faux dans ce qu'il laisse croire.

   DEUX DÉFAUTS, mesurés le jour même :

   1. LE DÉLAI ÉTAIT FIXE — quinze secondes, quelle que soit la taille. Or le document d'ELAN
      pèse 621 Ko une fois chiffré : 465 Ko de base, +16 octets de tag AES-GCM, puis base64.
      C'est 59 % de la limite Firestore, donc parfaitement valide — mais il faut plus de
      300 kbit/s SOUTENUS pour le pousser en quinze secondes. Sur un téléphone de terrain en 4G,
      une écriture saine dépasse le délai, et l'application annonce une panne qui n'existe pas.
      Quinze secondes n'était pas une durée : c'était une vitesse minimale déguisée.

   2. L'ALERTE N'AVAIT PAS DE FIN. Quand l'écriture finissait par passer, rien ne le disait.
      La personne apprenait que son travail ne partait pas et n'apprenait jamais qu'il était
      parti : elle refaisait sa saisie, appelait, ou cessait de croire l'écran — ce qui est pire
      que de n'avoir rien dit. Une alerte qui ne sait pas se démentir est une alerte qu'on
      finit par ignorer, y compris le jour où elle a raison. */

const fs = require('fs');
const APP = fs.readFileSync(__dirname + '/../app.html', 'utf8');
let ok = 0, ko = 0;
const v = (t, a, b) => { if (JSON.stringify(a) === JSON.stringify(b)) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + '\n      attendu : ' + JSON.stringify(b) + '\n      obtenu  : ' + JSON.stringify(a)); } };

console.log('Une alerte de synchro sait se démentir, et son délai suit le poids');

const i = APP.indexOf("let _acquitte=false");
v('le bloc d’écriture existe', i > -1, true);
/* La fenêtre doit couvrir jusqu'à l'accusé de réception : trop courte, les contrôles du
   démenti passent au vert pour la seule raison qu'ils regardent hors du bloc. */
const bloc = APP.slice(i, i + 4400);
v('la fenêtre de lecture atteint bien l’accusé de réception', bloc.indexOf('_ecriture.then(') > -1, true);

// ── 1) Le délai est calculé, et il est BRANCHÉ sur le setTimeout.
{
  const m = bloc.match(/const _delai=Math\.min\((\d+), (\d+)\+Math\.round\(\(alle\.taille\|\|0\)\/(\d+)\)\*(\d+)\);/);
  v('⛔ le délai se calcule depuis la taille réelle de la base', !!m, true);
  if (m) {
    const [, plafond, base, tranche, pas] = m.map(Number);
    const calc = t => Math.min(plafond, base + Math.round(t / tranche) * pas);
    v('une base minuscule garde le délai de base', calc(1000), 15000);
    /* ELAN, mesuré : 465 509 octets avant chiffrement. */
    v('la base d’ELAN obtient un délai plus long', calc(465509) > 15000, true);
    v('…et raisonnable (sous la minute)', calc(465509) <= 45000, true);
    v('⛔ une base énorme est plafonnée, l’alerte finit par tomber', calc(50 * 1000 * 1000), plafond);
    v('le plafond est bien 45 s', plafond, 45000);
  }
  v('⛔ et c’est CE délai qui arme le minuteur, pas une constante restée en place',
    /\},_delai\);/.test(bloc), true);
  v('plus aucun setTimeout à 15 000 dans ce bloc', /\},15000\);/.test(bloc), false);
}

// ── 2) L'alerte se marque, et elle se dément.
{
  v('l’alerte pose un drapeau quand elle tombe', /_alerte=true;\s*\n\s*try\{ toast\('⚠️ Tes modifications ne partent pas/.test(bloc), true);
  v('⛔ l’accusé de réception dément l’alerte', /if\(_alerte\)\{ try\{ toast\('✅ C\\'est parti/.test(bloc), true);
  /* Le démenti ne doit PAS se déclencher quand rien n'a alarmé : un message de succès à chaque
     sauvegarde serait un clignotant permanent, et on ne lirait plus aucun des deux. */
  v('il ne s’affiche QUE si l’alerte est tombée', (bloc.match(/if\(_alerte\)/g) || []).length, 1);
  v('les deux drapeaux partent à faux', /let _acquitte=false, _alerte=false;/.test(bloc), true);
}

// ── 3) Ce que le correctif ne doit PAS avoir cassé : le repère rendu, et la vraie coupure.
{
  v('le repère est toujours rendu quand l’écriture n’aboutit pas', /if\(_syncTs===ts\) _syncTs=_tsAvant;/.test(bloc), true);
  v('une vraie coupure réseau garde son écran hors ligne', /if\(!reseau\)\{ _horsLignePush=true;/.test(bloc), true);
  v('le diagnostic part toujours vers la Tour', /syncDiagnostic\('ecriture non acquittee/.test(bloc), true);
  v('l’accusé de réception dépose toujours la copie de sauvegarde', /sauvegardeDeposer\(e\)/.test(bloc), true);
}

/* ── AJOUT v662 : le bouton « Synchroniser » de la barre du haut ────────────────────────────
   Le 11 septembre 2026 au soir, pendant que le quota Firebase refusait TOUTES les écritures,
   ce bouton affichait « Synchronisé avec l'équipe » à chaque pression. Il ne mentait pas par
   erreur : il annonçait le résultat sans l'attendre — `syncPush(true)` n'est pas awaitée, et le
   toast partait dans la foulée de l'appel. Même défaut que l'alerte du dessus, dans l'autre
   sens : l'une n'a jamais dit que c'était passé, l'autre l'a toujours dit.
   Il annonce maintenant l'ACTION, et c'est l'accusé de réception qui annonce le RÉSULTAT. */
{
  const iN = APP.indexOf('function syncNow()');
  const fn = APP.slice(iN, iN + 900);
  v('⛔ le bouton n’annonce plus un résultat qu’il n’a pas',
    /toast\('Synchronisé avec l\\'équipe'\);/.test(fn), false);
  v('il dit ce qu’il fait', /_pushManuel=true; syncPush\(true\); toast\('Envoi à l\\'équipe…',1800\);/.test(fn), true);
  v('⛔ et c’est l’accusé de réception qui confirme',
    /else if\(_pushManuel\)\{ try\{ toast\('✅ Synchronisé avec l\\'équipe',4000\); \}catch\(_e\)\{\} \}/.test(bloc), true);
  /* Deux bandeaux au même endroit ne se lisent pas : le démenti de l'alerte passe devant,
     il en dit plus. Le `else if` est donc la forme JUSTE, pas un raccourci d'écriture. */
  v('un seul message : le démenti passe devant la confirmation',
    bloc.indexOf("if(_alerte){") < bloc.indexOf("else if(_pushManuel)"), true);
  v('le drapeau retombe sur l’accusé de réception', /_pushManuel=false;\n      try\{ sauvegardeDeposer/.test(bloc), true);
  v('⛔ et il retombe aussi quand l’écriture échoue', /\.catch\(er=>\{ _acquitte=true; _pushManuel=false;/.test(bloc), true);
  v('le drapeau part à faux', /^let _pushManuel=false;$/m.test(APP), true);
}

console.log('\n' + ok + ' ✓  ' + ko + ' ✗'); process.exit(ko ? 1 : 0);
