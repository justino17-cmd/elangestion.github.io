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
