/* ⛔ CE QUE CE FICHIER GARDE — le journal ne récite pas les produits, et il ne compte pas les
   ouvertures d'application.

   11 septembre 2026, 17 h 30. Le projet Firebase d'ELAN a épuisé son quota gratuit :
   « FirebaseError: [code=resource-exhausted]: Quota exceeded », et plus rien ne synchronise
   pour personne. Le forfait règle l'urgence ; ce qui a rendu le quota ATTEIGNABLE, c'est que
   chaque sauvegarde renvoie le document entier — 606 Ko — et que douze appareils le relisent.

   Ouvert le document, mesuré ce qui pèse. Le journal : 124 Ko, et sa composition dit tout :

     443 lignes sur 500 étaient des « Connexion »      →  83 Ko
     3 lignes « Produits retirés de la box »           →  14 Ko  (4 934 caractères CHACUNE)
     6 lignes « Nouveaux produits ajoutés à la box »   →  11 Ko

   Les deux défauts sont les deux faces d'une même règle, déjà écrite dans la fiche du dépôt et
   jamais appliquée ici : « une ligne de journal par GESTE, jamais par box ; compter et nommer
   les box, ne pas réciter les produits ». Le journal est plafonné à 500 entrées : chaque nom
   recopié et chaque ouverture d'application CHASSENT une ligne d'historique réel. Chez ELAN,
   il ne restait que 57 lignes de métier sur 500.

   Après : 18 Ko, 487 places libres, et le document tombe à 465 Ko.

   ⚠️ Ce correctif arrête la cause, il ne range pas derrière lui : les 443 lignes déjà écrites
   restent jusqu'à ce qu'elles sortent du plafond. */

const fs = require('fs');
const APP = fs.readFileSync(__dirname + '/../app.html', 'utf8');
let ok = 0, ko = 0;
const v = (t, a, b) => { if (JSON.stringify(a) === JSON.stringify(b)) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + '\n      attendu : ' + JSON.stringify(b) + '\n      obtenu  : ' + JSON.stringify(a)); } };

function extraire(nom) {
  const i = APP.indexOf('function ' + nom + '(');
  if (i < 0) throw new Error('fonction introuvable : ' + nom);
  let j = APP.indexOf('{', i), p = 0;
  for (let k = j; k < APP.length; k++) { const c = APP[k]; if (c === '{') p++; else if (c === '}') { p--; if (p === 0) { j = k; break; } } }
  return APP.slice(i, j + 1);
}
// eslint-disable-next-line no-eval
eval(extraire('logNoms'));

console.log('Le journal ne récite pas les produits et ne compte pas les ouvertures');

// ── 1) logNoms : trois noms suffisent à reconnaître le geste, le reste se compte.
{
  v('aucun nom', logNoms([]), '');
  v('un seul passe tel quel', logNoms(['ALTA 7000']), 'ALTA 7000');
  v('trois passent tels quels', logNoms(['A', 'B', 'C']), 'A, B, C');
  v('⛔ quatre : trois + le compte', logNoms(['A', 'B', 'C', 'D']), 'A, B, C + 1 autre');
  v('le pluriel suit', logNoms(['A', 'B', 'C', 'D', 'E']), 'A, B, C + 2 autres');
  /* Le cas d'ELAN : quarante-sept noms tenaient sur 4 934 caractères. */
  const n47 = Array.from({ length: 47 }, (_, i) => 'PRODUIT NUMERO ' + i);
  v('⛔ quarante-sept noms tiennent maintenant sur une ligne courte', logNoms(n47).length < 80, true);
  v('…et le compte restant est juste', /\+ 44 autres$/.test(logNoms(n47)), true);
  v('les trous ne cassent rien', logNoms(['A', null, undefined, '', 'B']), 'A, B');
  v('ni null ni undefined en entrée', [logNoms(null), logNoms(undefined)], ['', '']);
}

// ── 2) Les trois écritures qui récitaient passent par logNoms, et comptent d'abord.
{
  const cas = [
    ['Nouveaux produits ajoutés à la box', 'r.poses'],
    ['Nouveaux produits écartés de la box', 'ids'],
    ['Produits retirés de la box', 'retires']
  ];
  cas.forEach(([action, liste]) => {
    const i = APP.indexOf("logEvent('" + action + "'");
    const ligne = APP.slice(i, APP.indexOf('\n', i));
    v('« ' + action +' » compte les produits', ligne.indexOf(liste + ".length+' produit(s) — '") > -1, true);
    v('…et borne la liste par logNoms', /logNoms\(/.test(ligne), true);
    v('…et ne recopie plus tout (.join retiré)', /\.join\(', '\)/.test(ligne), false);
  });
}

// ── 3) ⛔ La connexion : une par personne et par JOUR, pas une par ouverture.
{
  const i = APP.indexOf("const deja=(db.journal||[]).some(");
  v('la garde existe', i > -1, true);
  const bloc = APP.slice(Math.max(0, i - 700), i + 500);
  v('elle compare la personne ET le jour',
    /e\.action==='Connexion'&&e\.userId===u\.id&&new Date\(e\.ts\|\|0\)\.toISOString\(\)\.slice\(0,10\)===jour/.test(bloc), true);
  v('⛔ la ligne n’est écrite que si elle manque', /if\(!deja\) logEvent\('Connexion'/.test(bloc), true);
  /* Si quoi que ce soit lève, on écrit QUAND MÊME : perdre la trace vaut moins que
     l'économiser. Une optimisation ne doit jamais pouvoir faire disparaître une donnée. */
  v('⛔ un incident dans la garde n’efface pas la trace', /\}catch\(_e\)\{ logEvent\('Connexion'/.test(bloc), true);
  v('et la sauvegarde suit toujours', /\}\n  save\(\);/.test(APP.slice(i, i + 700)), true);
}

// ── 4) Le plafond du journal n'a pas bougé : c'est lui qui rend tout ça nécessaire.
{
  v('le journal est toujours plafonné à 500', /if\(db\.journal\.length>500\) db\.journal\.length=500;/.test(APP), true);
}

console.log('\n' + ok + ' ✓  ' + ko + ' ✗'); process.exit(ko ? 1 : 0);
