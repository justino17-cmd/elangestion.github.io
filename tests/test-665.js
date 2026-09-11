/* ⛔ CE QUE CE FICHIER GARDE — trois demandes de Justin du 11 septembre 2026 au soir, et les
   trois portent la même leçon : ce qui identifie une chose doit être STABLE et VÉRIFIÉ.

   1. LES FOURNISSEURS EN TRIPLE. Mesuré sur la base réelle d'ELAN : seize fiches pour six
      fournisseurs, les cinq du pack métier chacun en TROIS exemplaires. Les identifiants le
      disent — trois lots (`mtjuy5ih*`, `mtv14d95*`, `mtvin073*`), chacun né dans la même
      milliseconde. La garde du semis vérifie le nom, mais elle ne protège QU'UN appareil :
      trois appareils qui sèment chacun de leur côté tirent trois uid() différents, et
      fusionnerBases — qui unit par IDENTIFIANT — garde les trois. C'est le piège que la fiche
      du dépôt décrit pour les produits, appliqué aux fournisseurs.

   2. SOIXANTE-NEUF LIENS ROMPUS PAR DES MAJUSCULES. 53 produits citent « ARMOSA », 16 citent
      « ENSYSTEX », et leurs fiches s'appellent « Armosa » et « Ensystex ». L'écran Fournisseurs
      affichait « 0 produit » en face des deux. On ne renomme pas les fiches d'un client pour
      rattraper ça : on compare sans la casse ni les accents.

   3. UN LIEN QUI NE DÉSIGNE AUCUNE ENTREPRISE NE DOIT RIEN FAIRE. « Quand un lien n'existe
      pas, ça ne devrait rien faire. Tu m'étonnes qu'il y ait des bugs après. » L'application
      croyait le lien sur parole : elle vidait l'appareil et se rattachait sans jamais demander
      au serveur si l'espace existait.

   Et une quatrième, qui existait déjà : à la PREMIÈRE CONNEXION, mot de passe ET e-mail sont
   obligatoires. Ce fichier le verrouille pour que personne ne l'affaiblisse. */

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
eval(extraire('fourMemeNom'));
// eslint-disable-next-line no-eval
eval(extraire('produitDuFournisseur'));
/* Le pack métier réel, extrait du fichier livré : le ménage s'en sert pour rétablir
   l'orthographe officielle d'un fournisseur du pack. `const` dans un eval ne sort pas de son
   propre bloc — on le pose donc explicitement en global, sinon la garde
   `typeof FOURNISSEURS_3D!=='undefined'` rend le contrôle silencieusement inopérant et le test
   passerait au vert en n'ayant rien éprouvé. */
{
  const i = APP.indexOf('const FOURNISSEURS_3D=[');
  // eslint-disable-next-line no-eval
  globalThis.FOURNISSEURS_3D = eval('(' + APP.slice(APP.indexOf('[', i), APP.indexOf('\n];', i) + 2) + ')');
}
// eslint-disable-next-line no-eval
eval(extraire('menageFournisseursDoublons'));
v('le pack métier est bien chargé dans le test', FOURNISSEURS_3D.length, 5);

console.log('Fournisseurs sans doublon, liens vérifiés, première connexion complète');

// ── 1) La CAUSE : le pack métier pose un identifiant déterministe, jamais un uid().
{
  const n = (APP.match(/FOURNISSEURS_3D\.forEach\(f=>\{[^}]*db?\.fournisseurs\.push\(\{id:uid\(\)/g) || []).length;
  v('⛔ plus aucun semis du pack ne tire un uid()', n, 0);
  const d = (APP.match(/id:idCatalogue\(f\.nom,'four'\)/g) || []).length;
  v('les DEUX points de semis posent l’identifiant déduit du nom', d, 2);
}

// ── 2) Le MÉNAGE de ce qui est déjà entré.
{
  const f = (id, nom, mail) => ({ id, nom, email: mail || '' });
  const db = { fournisseurs: [f('c', 'MABI', 'info@mabi.fr'), f('a', 'MABI'), f('b', 'mabi', 'contact@mabi.fr'), f('z', 'SODIF', 'x@y.fr')] };
  v('le ménage signale un changement', menageFournisseursDoublons(db), true);
  v('il ne reste qu’une fiche par fournisseur', db.fournisseurs.length, 2);
  /* ⛔ L'ORTHOGRAPHE DU PACK L'EMPORTE. « MABI » est l'un des cinq fournisseurs du pack métier :
     à égalité, le tri gardait la fiche nommée « mabi », déterministe mais moche — le client
     aurait vu son fournisseur renommé en minuscules sans rien avoir demandé. La comparaison
     des produits ignorant la casse, ce n'est QUE de l'affichage, et c'est pour ça qu'on peut
     le corriger sans risque. */
  v('⛔ le survivant reprend l’orthographe du pack', db.fournisseurs.map(x => x.nom).sort(), ['MABI', 'SODIF']);
  /* ⛔ LE SURVIVANT EST DÉTERMINISTE. Deux appareils qui font ce ménage chacun de leur côté
     DOIVENT garder la même fiche : s'ils en gardaient deux différentes, la fusion les
     réunirait et le doublon reviendrait. Ordre : identifiant du pack, puis la fiche la plus
     renseignée, puis le plus petit identifiant. */
  v('⛔ la fiche la plus renseignée survit', db.fournisseurs.find(x => x.nom === 'MABI').id, 'b');
  v('le second passage ne change plus rien (idempotent)', menageFournisseursDoublons(db), false);

  const pack = { fournisseurs: [f('mtv14d95x', 'ARMOSA', 'a@b.fr'), f('four_armosa', 'ARMOSA', 'a@b.fr')] };
  menageFournisseursDoublons(pack);
  v('⛔ l’identifiant du pack passe avant tout — c’est lui qui sera stable ensuite',
    pack.fournisseurs.map(x => x.id), ['four_armosa']);

  /* Les cas où l'on ne touche à rien : une seule fiche, aucune, un nom vide. */
  const seul = { fournisseurs: [f('a', 'MABI')] };
  v('une liste sans doublon n’est pas touchée', menageFournisseursDoublons(seul), false);
  v('ni une liste vide ou absente', [menageFournisseursDoublons({ fournisseurs: [] }), menageFournisseursDoublons({})], [false, false]);
  const sansNom = { fournisseurs: [f('a', ''), f('b', '')] };
  v('⛔ deux fiches SANS NOM ne sont pas fusionnées — rien ne dit que c’est le même fournisseur',
    menageFournisseursDoublons(sansNom), false);
}

// ── 3) La CASSE ne compte plus : 69 liens réparés sans renommer une seule fiche.
{
  v('« ARMOSA » retrouve « Armosa »', fourMemeNom('ARMOSA', 'Armosa'), true);
  v('les accents non plus', fourMemeNom('ORCAD', 'Órcad'), true);
  v('deux fournisseurs différents restent différents', fourMemeNom('MABI', 'SODIF'), false);
  v('⛔ un nom vide ne correspond à RIEN — sinon toutes les fiches sans nom seraient le même',
    [fourMemeNom('', ''), fourMemeNom('', 'MABI'), fourMemeNom(null, null)], [false, false, false]);
  v('un produit retrouve son fournisseur malgré la casse',
    produitDuFournisseur({ fournisseurs: ['ARMOSA'] }, 'Armosa'), true);
  v('…et ne s’invente pas un fournisseur qu’il ne cite pas',
    produitDuFournisseur({ fournisseurs: ['ARMOSA'] }, 'SODIF'), false);
  v('un produit sans fournisseur ne casse rien',
    [produitDuFournisseur({}, 'MABI'), produitDuFournisseur(null, 'MABI')], [false, false]);
  /* UNE seule comparaison pour les deux écrans : deux versions finiraient par ne plus dire la
     même chose, et un écran annoncerait un compte que l'autre ne retrouve pas. */
  /* On compte les APPELS, pas la définition : `function produitDuFournisseur(p,nom)` porte la
     même chaîne, et un test qui l'inclurait serait au vert pour une mauvaise raison. */
  v('les deux écrans passent par la même fonction',
    (APP.match(/(?<!function )produitDuFournisseur\(p,/g) || []).length, 2);
  v('plus aucune comparaison stricte sur le nom du fournisseur',
    /\(p\.fournisseurs\|\|\[\]\)\.includes\(/.test(APP), false);
}

// ── 4) ⛔ Le lien est VÉRIFIÉ avant que l'appareil soit vidé.
{
  v('la vérification existe', APP.indexOf('async function lienEspaceConnu(o){') > -1, true);
  const i = APP.indexOf('async function lienEspaceConnu(o){');
  const fn = APP.slice(i, i + 1100);
  v('elle interroge la route qui connaît les espaces', /'\/api\/espaces\/lien'/.test(fn), true);
  v('⛔ un 404 vaut « inconnu »', /if\(r\.status===404\) return 'inconnu';/.test(fn), true);
  /* ⛔ Un serveur injoignable ne doit PAS enfermer dehors : c'est exactement la confusion qui a
     coûté la matinée du 11 septembre (une écriture qui ne passe pas ≠ une panne de réseau). */
  v('⛔ un serveur injoignable laisse passer', /catch\(e\)\{ return 'incertain'; \}/.test(fn), true);
  v('…et le contrôle a un délai, sinon il gèle le démarrage', /setTimeout\(\(\)=>ctrl\.abort\(\),5000\)/.test(fn), true);

  /* LES DEUX portes : le lien dans l'adresse, et le code collé à la main. Une seule fermée,
     et il reste un chemin pour se poser sur un espace qui n'existe pas. */
  v('⛔ les deux portes refusent un lien inconnu', (APP.match(/await lienEspaceConnu\(o\)==='inconnu'/g) || []).length, 2);
  v('et elles disent la même chose', (APP.match(/toast\(LIEN_PAS_BON,10000\)/g) || []).length, 2);
  v('le message dit que rien n’a été changé', /Rien n\\'a été changé sur cet appareil/.test(APP), true);

  /* Le contrôle doit venir AVANT espaceQuitter() : après, l'appareil serait déjà vidé. */
  const iC = APP.indexOf("if(await lienEspaceConnu(o)==='inconnu')");
  const iQ = APP.indexOf('espaceQuitter();', iC);
  v('⛔ il précède le vidage de l’appareil', iC > -1 && iQ > iC, true);
  /* Un appareil qui rouvre SON PROPRE lien ne doit pas dépendre du réseau pour ne rien faire. */
  v('l’espace déjà rejoint sort avant le contrôle', APP.indexOf('if(syncTeam()===o.t) return false;') < iC, true);
}

// ── 5) Première connexion : mot de passe ET e-mail, et on ne peut pas s'en échapper.
{
  const i = APP.indexOf('async function forcePwdSave()');
  const fn = APP.slice(i, i + 1800);
  v('la fenêtre s’ouvre dès qu’il manque un mot de passe personnel',
    /if\(!u\.pwdHash\|\|u\.mustChangePwd\) setTimeout\(forcePwdModal,600\);/.test(APP), true);
  v('⛔ elle ne se ferme pas à la main', /function closeModal\(force\)\{ if\(_modalForcee&&force!==true\) return;/.test(APP), true);
  v('elle se marque forcée en s’ouvrant', /function forcePwdModal\(\)\{ if\(!currentUser\) return;\n  _modalForcee=true;/.test(APP), true);
  v('huit caractères minimum', /if\(p1\.length<8\)/.test(fn), true);
  v('…et pas une suite de chiffres', /if\(\/\^\\d\{4,8\}\$\/\.test\(p1\)\)/.test(fn), true);
  v('les deux saisies doivent correspondre', /if\(p1!==p2\)/.test(fn), true);
  v('⛔ l’e-mail est exigé, et vraiment validé',
    /if\(!\/\^\[\^@\\s\]\+@\[\^@\\s\]\+\\\.\[\^@\\s\]\+\$\/\.test\(fm\)\)/.test(fn), true);
  v('le champ e-mail est marqué obligatoire à l’écran', /✉️ Ton adresse e-mail \*/.test(APP), true);
}

console.log('\n' + ok + ' ✓  ' + ko + ' ✗'); process.exit(ko ? 1 : 0);
