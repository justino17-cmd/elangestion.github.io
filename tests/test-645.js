/* ⛔ CE QUE CE FICHIER GARDE — la copie poussée vers Firestore TIENT dans le document (1 Mo),
   et ce qu'on en retire ne se perd nulle part.

   Mesuré chez ELAN le 11 septembre 2026, sur toute l'équipe à la fois : Firestore LIT la base
   mais REFUSE chaque écriture (400 sur le canal Write, « Write stream exhausted maximum allowed
   queued writes ») → aucun accusé en 15 s → « Connexion requise » → rechargement → recommence.
   Toute la base part dans UN document, pièces jointes (≤ 1,5 Mo) et photos en base64 comprises,
   et rien ne mesurait rien avant d'écrire.

   Deux faces, éprouvées ici sur les VRAIES fonctions extraites d'app.html :
   · syncAlleger(base, budget) — au-dessus du budget, la copie poussée perd ses pièces et photos
     les plus lourdes, marquées ; la base d'origine n'est PAS touchée ; sous le budget, la copie
     EST la base (même objet) ; sans aucune pièce à retirer, elle dit « impossible ».
   · syncRegreffer(local, fusion) — un enregistrement arrivé allégé reprend les pièces qu'on a
     en local ; un enregistrement qui a ses pièces n'est pas touché. */

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
eval(extraire('syncAlleger'));
// eslint-disable-next-line no-eval
eval(extraire('syncRegreffer'));

const gros = n => 'data:application/pdf;base64,' + 'A'.repeat(n);
const photo = n => 'data:image/jpeg;base64,' + 'P'.repeat(n);

console.log('La copie poussée tient dans le budget, la base locale garde tout');
{
  const base = {
    clients: [{ id: 'c1', nom: 'Mairie' }],
    interventions: [
      { id: 'i1', titre: 'Dératisation', docs: [{ nom: 'devis.pdf', type: 'application/pdf', ts: 1, data: gros(300000) }, { nom: 'plan.pdf', type: 'application/pdf', ts: 2, data: gros(50000) }], photos: [photo(120000), photo(90000)] },
      { id: 'i2', titre: 'Désinsectisation', photos: [photo(200000)] },
      { id: 'i3', titre: 'Sans pièce' }
    ]
  };
  const avant = JSON.stringify(base);
  const r = syncAlleger(base, 250 * 1024);   // budget 250 Kio : la base fait ~760 Ko, il faut en retirer
  v('un allègement a eu lieu', r.retirees > 0, true);
  v('la copie poussée est sous le budget', r.taille <= 250 * 1024, true);
  v('…et n\'est pas déclarée impossible', r.impossible, false);
  v('la base LOCALE est intacte au bit près', JSON.stringify(base), avant);
  v('la copie est un autre objet que la base', r.copie === base, false);
  const c1 = r.copie.interventions[0], c2 = r.copie.interventions[1], c3 = r.copie.interventions[2];
  v('le plus lourd est parti en premier : le devis de 300 Ko est allégé et marqué', [c1.docs[0].data, c1.docs[0].horsNuage], ['', true]);
  v('…son nom, son type et sa date restent (l\'entrée est toujours listée)', [c1.docs[0].nom, c1.docs[0].type, c1.docs[0].ts], ['devis.pdf', 'application/pdf', 1]);
  v('la photo de 200 Ko est partie, comptée sur l\'enregistrement', [c2.photos.length, c2.photosHorsNuage], [0, 1]);
  v('l\'enregistrement sans pièce est le MÊME objet (pas cloné pour rien)', c3 === base.interventions[2], true);
  v('les autres collections sont partagées telles quelles', r.copie.clients === base.clients, true);
}

console.log('\nSous le budget, rien ne bouge');
{
  const base = { interventions: [{ id: 'i1', photos: [photo(1000)], docs: [{ nom: 'a', ts: 1, data: gros(1000) }] }] };
  const r = syncAlleger(base, 250 * 1024);
  v('aucune pièce retirée', r.retirees, 0);
  v('la copie EST la base (même objet)', r.copie === base, true);
  v('pas impossible', r.impossible, false);
}

console.log('\nTrop lourde même sans pièce : on le dit, on n\'écrit pas');
{
  const base = { journal: Array.from({ length: 4000 }, (_, k) => ({ id: 'j' + k, action: 'x'.repeat(100) })), interventions: [{ id: 'i1', photos: [photo(5000)] }] };
  const r = syncAlleger(base, 100 * 1024);
  v('toutes les pièces sont retirées', r.copie.interventions[0].photos.length, 0);
  v('…et c\'est quand même impossible', r.impossible, true);
}

console.log('\nLa regreffe : ce qui arrive allégé ne prend pas nos pièces');
{
  const local = { interventions: [
    { id: 'i1', _m: 1, docs: [{ nom: 'devis.pdf', ts: 1, data: gros(100) }, { nom: 'plan.pdf', ts: 2, data: gros(50) }], photos: [photo(10), photo(20)] },
    { id: 'i2', _m: 1, photos: [photo(30)] }
  ] };
  // ce qu'un collègue a poussé : i1 allégé (le plus récent, il gagne la fusion) ; i2 intact avec SA photo à lui
  const fusion = { interventions: [
    { id: 'i1', _m: 5, docs: [{ nom: 'devis.pdf', ts: 1, data: '', horsNuage: true }, { nom: 'plan.pdf', ts: 2, data: gros(50) }], photos: [], photosHorsNuage: 2 },
    { id: 'i2', _m: 5, photos: [photo(99)] },
    { id: 'i9', _m: 5, photos: [], photosHorsNuage: 1 }
  ] };
  const n = syncRegreffer(local, fusion);
  const f1 = fusion.interventions[0], f2 = fusion.interventions[1], f9 = fusion.interventions[2];
  v('la pièce allégée reprend nos données locales', f1.docs[0].data, gros(100));
  v('la pièce intacte n\'est pas touchée', f1.docs[1].data, gros(50));
  v('les photos allégées reprennent les nôtres', f1.photos.length, 2);
  v('un enregistrement qui a ses pièces garde LES SIENNES (pas les nôtres)', f2.photos, [photo(99)]);
  v('un enregistrement inconnu en local reste allégé (rien à regreffer)', f9.photos.length, 0);
  v('deux regreffes comptées (une pièce, un lot de photos)', n, 2);
  v('la fonction ne casse pas sur des bases vides', syncRegreffer(null, null), 0);
}

console.log('\nLa garde est câblée aux bons endroits');
v('l\'envoi chiffre la COPIE allégée, pas la base', /const e=await syncEncrypt\(JSON\.stringify\(alle\.copie\)\);/.test(APP), true);
v('impossible → on n\'écrit pas', /if\(alle\.impossible\)\{[\s\S]{0,400}return; \}/.test(APP), true);
v('regreffe à la réception ET avant l\'écriture', (APP.match(/syncRegreffer\((db|_localAvant),(remote|db)\)/g) || []).length, 2);
v('ouvrir une pièce restée locale le dit au lieu de planter', /if\(!d\.data\)\{ toast\('Cette pièce est restée sur l/.test(APP), true);


/* ── v646 : l'allègement couvre TOUTES les collections, et une écriture qui ne passe pas
   ne bloque plus l'application quand le réseau, lui, répond. ───────────────────────── */
console.log('\nL\'allègement ne se limite plus aux interventions');
{
  const sig = 'data:image/png;base64,' + 'S'.repeat(150000);
  const base = {
    interventions: [{ id: 'i1', photos: ['data:image/jpeg;base64,' + 'P'.repeat(80000)] }],
    telecollectes: [{ id: 't1', photos: ['data:image/jpeg;base64,' + 'T'.repeat(200000)] }],
    registres: [{ id: 'r1', signature: sig }],
    societes: [{ id: 's1', logo: 'data:image/png;base64,' + 'L'.repeat(120000) }]
  };
  const avant = JSON.stringify(base);
  const r = syncAlleger(base, 100 * 1024);
  v('la base locale reste intacte', JSON.stringify(base), avant);
  v('la photo de télécollecte est allégée', r.copie.telecollectes[0].photos.length, 0);
  v('la signature du registre est allégée et marquée', [r.copie.registres[0].signature, r.copie.registres[0].champsHorsNuage], ['', ['signature']]);
  v('le logo de la société est allégé', r.copie.societes[0].logo, '');
  v('la copie tient dans le budget', r.taille <= 100 * 1024, true);
  v('on sait ce qui pesait (diagnostic)', r.gros.length > 0, true);
}

console.log('\nLa regreffe couvre aussi ces champs et ces collections');
{
  const local = { registres: [{ id: 'r1', _m: 1, signature: 'VRAIE-SIGNATURE' }], telecollectes: [{ id: 't1', _m: 1, photos: ['A', 'B'] }] };
  const fusion = { registres: [{ id: 'r1', _m: 9, signature: '', champsHorsNuage: ['signature'] }], telecollectes: [{ id: 't1', _m: 9, photos: [], photosHorsNuage: 2 }] };
  const n = syncRegreffer(local, fusion);
  v('la signature allégée reprend la nôtre', fusion.registres[0].signature, 'VRAIE-SIGNATURE');
  v('les photos de télécollecte reviennent', fusion.telecollectes[0].photos, ['A', 'B']);
  v('deux regreffes comptées', n, 2);
}

console.log('\nUne écriture non acquittée ne bloque plus si le réseau répond');
v('on mesure le réseau avant de décider', /const r2=await fetch\(PUSH_API\+'\/health',\{method:'HEAD'/.test(APP), true);
v('réseau absent → écran hors ligne (inchangé)', /if\(!reseau\)\{ _horsLignePush=true; try\{ horsLigneDebut\('écriture sans réponse'\)/.test(APP), true);
v('réseau présent → on prévient, on ne bloque pas', /Tes modifications ne partent pas encore vers l/.test(APP), true);

console.log('\n' + ok + ' ✓  ' + ko + ' ✗'); process.exit(ko ? 1 : 0);
