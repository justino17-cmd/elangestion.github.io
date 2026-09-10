# Les tests du catalogue produits

Six suites, sans dépendance, sans installation : chacune **extrait les fonctions réelles
d'`app.html`** par équilibrage d'accolades et les exécute avec `new Function`. Elles testent donc
le fichier livré, pas une copie qui aurait divergé.

```bash
for f in tests/test-*.js; do node "$f"; done
```

Chaque suite affiche `N ✓  0 ✗` et sort en code 1 au premier échec.

| Suite | Ce qu'elle garde |
|---|---|
| `test-625.js` | La feuille « Produits » d'une box : ajout, retrait sûr, nouveautés, décisions d'équipe |
| `test-pont.js` | Copier la liste d'un espace pour la coller dans un autre — ce qu'on voit est ce qu'on copie |
| `test-633.js` | La fusion ne perd ni fiche ni stock ; le catalogue nourrit toutes les box |
| `test-634.js` | **L'identité d'un produit** — voir ci-dessous |
| `test-634b.js` | La fusion : stock global additionné, décisions de box reportées, déclarations « distincts » tenues |
| `test-version.js` | La lecture de la version servie par teamop.fr (côté serveur) |

## L'invariant que `test-634.js` protège, et pourquoi il compte

> Un identifiant de fiche produit est **soit unique par construction** (`uid`), **soit déduit d'un nom
> qui ne peut pas sluguer à vide.**

`idCatalogue` réduit un nom à `[a-z0-9]`. De la ponctuation seule, une écriture non latine, un
copier-coller depuis un PDF mal encodé : il ne reste rien, et l'identifiant retombe sur le générique
`cat_x`. Pour tout nom **libre** (champ de saisie, texte collé), il faut `idProduit(nom)`, qui rend
`uid()` dans ce cas.

**La garde de `produitCreer` ne suffit pas.** Elle ne protège que la création LOCALE. `fusionnerBases`
unit par identifiant et ne la voit jamais : deux appareils hors ligne qui créent chacun une telle
fiche en perdent une — et son stock — à la synchro, sans même être signalés comme doublon, puisqu'ils
partageaient déjà l'identifiant avant d'arriver au détecteur.

`test-634.js` relit `app.html` et échoue si un nouvel appel construit un identifiant à partir d'un nom
libre. Les `idCatalogue` qui restent prennent tous leur nom de `CATALOGUE` ou de `CATFOUR`, deux
constantes latines du fichier.

## La sonde en navigateur qui vit ici

`sonde-rejoindre.js` est la seule sonde versée au dépôt, et elle mérite son exception : elle exerce le
VRAI `teamopJoin` sur `beta.html`, ce qu'aucune suite ne peut faire — `load()` lit `localStorage` et
recharge la page, il n'est pas extractible.

```bash
# un serveur statique sur 8123 (commande dans CLAUDE.md), puis :
node tests/sonde-rejoindre.js
# playwright-core introuvable ? elle le dit et donne la commande :
#   NODE_PATH=/opt/node22/lib/node_modules/playwright/node_modules node tests/sonde-rejoindre.js
```

Elle garde ceci : un appareil DÉJÀ UTILISÉ qui rejoint un espace ne doit RIEN apporter. Avant la
correction du 10 septembre 2026, il déversait 160 produits, cinq fournisseurs, deux devis, deux
factures et **deux box de démonstration** (« Cuisine — Restaurant Le Gourmet ») dans la base du
client, que la première synchro répandait dans toute l'entreprise — 220 fiches devenaient 380 et
110 noms passaient en triple. Elle doit afficher des zéros partout.

## Playwright

Les sondes en navigateur (`sonde-*.js`) ne sont pas ici : elles demandent Chromium et un serveur
statique, et ne tournent que sur `beta.html` — jamais sur `app.html`, qui porte des données de
clients réels. La marche à suivre est dans `CLAUDE.md`.

## ⛔ Extraire une fonction ENTIÈRE, pas son premier morceau qui compile

Chaque suite découpe `app.html` pour exécuter les vraies fonctions. L'extracteur d'origine
rendait **le plus COURT préfixe qui passe `new Function`** — et sur une fonction dont une ligne
tardive se referme proprement, il coupait avant la fin. `ombreRelever` en a fait les frais le
10 septembre 2026 : la moitié qui construit l'ombre des lignes de stock manquait, et six
vérifications échouaient sur du code pourtant juste. Une heure de diagnostic pour un bug qui
n'existait pas.

La règle : **borner à la déclaration suivante de premier niveau, puis prendre le plus LONG bloc
valide.** `test-638.js` et `test-639.js` portent cette version, à recopier :

```js
function decoupe(h){ const d=APP.indexOf(h); if(d<0) throw new Error('introuvable : '+h);
  const suite=/\n(?=(?:function |const |let |var |class |async function |\/\* |views\.|document\.|window\.|try\{))/g;
  suite.lastIndex=d+h.length;
  const m=suite.exec(APP); let bout=APP.slice(d,m?m.index:Math.min(APP.length,d+80000));
  for(;;){ const k=Math.max(bout.lastIndexOf('}'),bout.lastIndexOf(';')); if(k<0) break;
    const t=bout.slice(0,k+1);
    try{ new Function(t); return t; }catch(e){ bout=bout.slice(0,k); } }
  throw new Error('fin introuvable : '+h); }
```

Pour vérifier qu'une suite n'extrait rien de tronqué, comparer les deux découpages sur chaque
en-tête qu'elle utilise : ils doivent rendre la même longueur.

## ⛔ Ne jamais tester un SUBSTITUT de ce que le code produit

`test-638.js` a été vert sur un correctif qui ne corrigeait rien. Il vérifiait que
`intNum()` ne réattribue pas le numéro d'une intervention supprimée — mais il simulait
l'archivage par `interventionsArchive.push(interventions.pop())`, c'est-à-dire en gardant le
champ `num`. Le vrai `intArchive()` reconstruit l'objet à la main et **ne le gardait pas**. Le
test passait, le bug était entier, et le rapport le déclarait réglé. Trouvé par `relecteur`.

Quand une suite a besoin d'un état de départ, elle doit le fabriquer **avec la fonction réelle
qui le fabrique en production**, jamais à la main. Si ce n'est pas possible, le dire en
commentaire et le compenser par une sonde navigateur.

