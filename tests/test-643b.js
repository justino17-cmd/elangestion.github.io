/* ⛔ CE QUE CE FICHIER GARDE — le ménage des données de démonstration entrées chez un client
   n'enlève QUE la démo, JAMAIS un vrai enregistrement.

   Suite du signalement d'ELAN du 11 septembre 2026 : le semis avait déversé ses deux box de
   démonstration, ses demandes et ses devis dans la base, et le rejeu en avait fait des COPIES
   (« Cuisine — Restaurant Le Gourmet » deux fois dans « Mes demandes »). load() ne les laisse
   plus entrer (test-642) ; menageDemoBox() enlève ce qui était DÉJÀ entré, au chargement.

   Le danger de ce ménage, c'est le faux positif. Un numéro comme « ENV-2026-001 » ou
   « DC-2026-001 » est aussi le PREMIER numéro qu'une vraie entreprise génère — matcher là-dessus
   effacerait ses vraies pièces. La fonction exige donc le NOM FICTIF du semis ET un second
   marqueur (numéro/référence de semis pour une box, téléphone de démo pour un devis). Ce test
   éprouve la VRAIE fonction extraite d'app.html sur des bases mêlant démo et vrai, et vérifie
   les deux sens : la démo part, le vrai reste. */

const fs = require('fs');
const APP = fs.readFileSync(__dirname + '/../app.html', 'utf8');
let ok = 0, ko = 0;
const v = (t, a, b) => { if (JSON.stringify(a) === JSON.stringify(b)) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + '\n      attendu : ' + JSON.stringify(b) + '\n      obtenu  : ' + JSON.stringify(a)); } };

/* Extraction de la vraie fonction : de sa signature à l'accolade équilibrée. Aucune reconstruction —
   c'est le code livré qui est exécuté. */
function extraire(nom) {
  const i = APP.indexOf('function ' + nom + '(');
  if (i < 0) throw new Error('fonction introuvable : ' + nom);
  let j = APP.indexOf('{', i), p = 0;
  for (let k = j; k < APP.length; k++) { const c = APP[k]; if (c === '{') p++; else if (c === '}') { p--; if (p === 0) { j = k; break; } } }
  return APP.slice(i, j + 1);
}
// eslint-disable-next-line no-eval
eval(extraire('menageDemoBox'));

console.log('Le ménage enlève la démo, jamais un vrai enregistrement');

// Signatures exactes du semis (seed) — copiées de la démo pour poser des cas réalistes.
const boxDemo1 = () => ({ id: 'a' + Math.random(), numero: 'BX-001', reference: 'RAT-A12', nom: 'Cuisine — Restaurant Le Gourmet', stock: {} });
const boxDemo2 = () => ({ id: 'b' + Math.random(), numero: 'BX-002', reference: 'INS-B07', nom: 'Réserve — Boulangerie Au Bon Pain', stock: {} });
const devisDemo1 = () => ({ id: 'd' + Math.random(), numero: 'ENV-2026-001', clientNom: 'Jean Leroy', clientTelephone: '01 23 45 67 89' });
const devisDemo2 = () => ({ id: 'e' + Math.random(), numero: 'ENV-2026-002', clientNom: 'Sophie Petit', clientTelephone: '01 98 76 54 32' });

// 1) Base mêlée : démo (en TRIPLE, comme le rejeu) + vrais enregistrements d'ELAN.
{
  const vraieBox = { id: 'r1', numero: 'BX-014', reference: 'CAZA-77', nom: 'ELAN CAZABOX — Saint Porchaire', stock: {} };
  const vraieDemande = { id: 'rd1', num: 'DC-2026-050', boxNom: 'ELAN CAZABOX — Saint Porchaire' };
  const vraiDevis = { id: 'rq1', numero: 'ENV-2026-020', clientNom: 'Mairie de Saintes', clientTelephone: '05 46 00 00 00' };
  const db = {
    boxes: [boxDemo1(), boxDemo1(), boxDemo1(), boxDemo2(), boxDemo2(), vraieBox],
    demandes: [
      { id: 'x1', num: 'DC-2026-001', boxNom: 'Cuisine — Restaurant Le Gourmet' },
      { id: 'x2', num: 'DC-2026-001', boxNom: 'Cuisine — Restaurant Le Gourmet' },
      { id: 'x3', num: 'DC-2026-002', boxNom: 'Réserve — Boulangerie Au Bon Pain' },
      vraieDemande
    ],
    devis: [devisDemo1(), devisDemo1(), devisDemo2(), vraiDevis]
  };
  const ch = menageDemoBox(db);
  v('la fonction signale un changement', ch, true);
  v('les box de démo (toutes les copies) sont parties', db.boxes.map(b => b.nom), ['ELAN CAZABOX — Saint Porchaire']);
  v('la vraie box d\'ELAN reste', db.boxes.length, 1);
  v('les demandes de démo sont parties, la vraie reste', db.demandes.map(d => d.num), ['DC-2026-050']);
  v('les devis de démo sont partis, le vrai reste', db.devis.map(q => q.clientNom), ['Mairie de Saintes']);
}

// 2) Base sans aucune démo : rien ne bouge, aucun faux positif.
{
  const db = {
    boxes: [{ id: 'r', numero: 'BX-001', reference: 'CAZA-77', nom: 'ELAN CAZABOX — Saint Porchaire' }],  // même numéro BX-001 qu'un semis, mais NOM réel
    demandes: [{ id: 'd', num: 'DC-2026-001', boxNom: 'ELAN CAZABOX — Saint Porchaire' }],                 // même numéro DC-2026-001, mais boxNom réel
    devis: [{ id: 'q', numero: 'ENV-2026-001', clientNom: 'Jean Leroy', clientTelephone: '06 00 00 00 00' }] // vrai homonyme « Jean Leroy » MAIS autre téléphone
  };
  const av = JSON.stringify(db);
  const ch = menageDemoBox(db);
  v('aucun changement quand il n\'y a pas de démo', ch, false);
  v('un vrai « BX-001 » nommé autrement n\'est PAS touché', db.boxes.length, 1);
  v('une vraie demande « DC-2026-001 » n\'est PAS touchée', db.demandes.length, 1);
  v('un vrai « Jean Leroy » à un autre téléphone n\'est PAS touché', db.devis.length, 1);
  v('la base est identique au bit près', JSON.stringify(db), av);
}

// 3) Garde-fou de forme : une box au NOM fictif mais SANS marqueur de semis n'est pas emportée
//    à l'aveugle (il faut la conjonction) — protège le cas tordu d'un vrai client homonyme.
{
  const db = { boxes: [{ id: 'z', numero: 'BX-099', reference: 'VRAI-01', nom: 'Cuisine — Restaurant Le Gourmet' }] };
  const ch = menageDemoBox(db);
  v('nom fictif SANS numéro ni référence de semis : conservé (conjonction exigée)', db.boxes.length, 1);
  v('…et aucun changement signalé', ch, false);
}

// 4) Robustesse : collections absentes ou vides ne cassent rien.
{
  v('base vide → false', menageDemoBox({}), false);
  v('boxes null → false', menageDemoBox({ boxes: null, demandes: undefined }), false);
}

// 5) La fonction est bien APPELÉE dans boot(), sinon elle ne servirait à rien.
v('menageDemoBox est appelée au chargement (boot)', /if\(menageDemoBox\(db\)\) ch=true;/.test(APP), true);

console.log('\n' + ok + ' ✓  ' + ko + ' ✗'); process.exit(ko ? 1 : 0);
