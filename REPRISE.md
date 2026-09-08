# Où on en est

Ce fichier existe parce qu'une conversation meurt et que le dépôt reste. Les skills, les
agents et `CLAUDE.md` suivent tout seuls d'une conversation à l'autre — **ce qu'on s'est dit,
non.** C'est ce qui se perdait, et c'est ce que cette page rattrape.

Il ne répète pas `CLAUDE.md` (les règles, les pièges, les interdits) ni `VERSION-STABLE.md`
(l'historique des versions). Il dit **ce qui est ouvert** : les chantiers en cours, les dettes
connues, et ce qui attend une décision de Justin.

Tenu à jour à chaque fois qu'un chantier change d'état. Une ligne fausse ici est pire que pas
de ligne du tout.

---

## ⛔ La dette la plus grave : un seul teamId pour toutes les entreprises

**Les cinq routes de messagerie ne sont plus le sujet — elles n'étaient que le symptôme.**
Le lot du 8 septembre 2026 (`9ea6320`) a refermé ce qui pouvait l'être :

| Route | Ce qui est fermé |
|---|---|
| `POST /api/sendmail` | garde `espaceConnu` posé AVANT le quota et AVANT le branchement des modes — donc le mode « boîte connectée » aussi, le plus grave (il envoie depuis la vraie adresse de l'entreprise, avec son mot de passe) |
| `POST /api/notify` | adresse résolue par `new URL()` et contrôlée sur l'origine ; le fragment est refusé. Un premier filtre par expression régulière avait **quatre** contournements, trouvés et reproduits |
| `POST /api/mailbox/connect` | 20 essais par IP et par heure — c'était un banc d'essai de mots de passe contre Gmail, relayé par l'IP du VPS |

**Ce qui reste ouvert, sans arrondir :** `GET /api/replies` (correspondance client),
`GET /api/mailboxes` (adresses et identifiants de boîtes), `POST /api/mailbox/disconnect`,
et l'usurpation par `brand.name`.

**Et ça ne se referme pas route par route.** Vérifié par le calcul : pour toute entreprise
restée sur la clé par défaut, la preuve de clé d'équipe (« kh ») vaut
`sha256(SYNC_SECRET_DEFAULT)` — une constante écrite en clair dans `app.html`, servi
publiquement par GitHub Pages. Elle ne prouve donc RIEN pour cette population, qui est
précisément la plus exposée puisqu'elle partage un seul teamId, `elan-gestion`. Fermer sur
le kh aurait fermé les espaces les mieux tenus et laissé les autres grands ouverts.

**Tant qu'un seul teamId est partagé par toutes les entreprises sans clé personnalisée,
aucune vérification portant sur le teamId ne peut cloisonner quoi que ce soit.** La suite
utile n'est pas une phase 3 sur les routes : c'est de donner à chaque entreprise son propre
teamId. C'est LE chantier, et il se conçoit seul.

Le chantier des **dossiers de messagerie** (branche `mail/dossiers-en-attente-auth`) reste
en attente derrière lui.

---

## ⛔ Deuxième dette, trouvée le 8 septembre : les règles Firestore

`firestore.rules` lignes 210-212 : `match /elan_teams/{teamId} { allow read, write: if connecte(); }`
où `connecte()` vaut `request.auth != null` — satisfait par un compte **anonyme**, celui-là
même que le serveur crée. Quiconque obtient un `t` lit et **réécrit** le document de
n'importe quelle entreprise ; pour celles restées sur la clé par défaut, le contenu est
déchiffrable.

Ce n'est pas une régression et ça ne vient pas d'un lot récent. Signalé par le `gardien` le
8 septembre 2026, laissé de côté délibérément : ça se conçoit, se teste et se publie seul.
C'est le même chantier que celui du teamId — les deux se tiennent.

## Chantiers en cours

### Démarrage vierge — **FAIT ET PUBLIÉ en v574 le 8 septembre 2026**
Fusionné par `d8c243f`. Vérifié sur les fichiers **réellement servis** : `app.html` en v574,
identique au dépôt octet pour octet ; `sw.js` en `elan-gestion-v773` ; `beta.html` en
`574-beta` avec `BETA_ESSAI=true` et l'espace `elan-gestion-beta`, tandis que la production
sert bien `BETA_ESSAI=false`.

**Pas d'annonce, délibérément** : ce lot ne change rien chez les entreprises existantes, donc
`ANNONCE` reste à 572 et le VPS n'a pas été redéployé. Ce n'est pas un oubli.

Décision de Justin, 8 septembre 2026 : *« quand quelqu'un prend OP GESTION, tout est vide. Ce
sera à eux de tout mettre, ou à nous demander de mettre une liste. »*

**Ce qui a été fait.** Le code se contredisait : `load()` vidait
27 collections (drapeau `elan_vierge_v1`), puis TROIS réinjections les remplissaient — 110
produits du CATALOGUE et les 5 fiches fournisseurs 3D. La troisième (`elan_fours_v1`) ne
s'appelle pas « seed » : une recherche sur ce mot la rate, elle n'a été trouvée qu'en mesurant.
Un drapeau `PACK_METIER_AUTO=false` les ferme toutes les trois, le drapeau de chaque base
restant posé pour qu'un retour en arrière ne remplisse pas après coup. Le bouton
« ↻ Catalogue OP » (écran Produits) reste le chemin volontaire.

Vérifié sur `beta.html` régénérée, deux contextes isolés : compte neuf → tout à 0 ; entreprise
déjà installée → ses 2 fournisseurs, son produit et son client intacts, aucun intrus 3D.

**Les packs métier : rien à faire, c'était une fausse piste.** Vérifié le 8 septembre contre la
page réellement servie : site, formulaire d'inscription et application sont **parfaitement
alignés** — 12 métiers, les 6 mêmes marqués prêts (3D, plomberie, électricité, chauffage,
serrurerie, nettoyage), les 6 autres en « bientôt » qui partent en demande sur mesure. Les
5 packs non-3D sont réellement remplis (10 à 11 types d'intervention, 8 à 12 prestations, 9 à
18 champs de rapport). Personne ne peut choisir un métier que l'application ignore.

Décision de Justin le 8 septembre, qui ferme le sujet : *« chaque métier aura des fournisseurs
différents, des produits différents ; quand un nouvel utilisateur arrive, c'est à lui de tout
rentrer. »* **On ne fournit donc de listes à personne** — ni 3D, ni plomberie. Inutile d'écrire
des catalogues par métier.

**Ce qui a été fait dans la foulée :** le bouton « ↻ Catalogue OP » posait les 110 références 3D
et les 5 fournisseurs à n'importe qui, sans regarder le métier — un plombier recevait du
raticide. Il n'apparaît plus que là où le catalogue est DÉJÀ en place : un filet de sécurité
pour ELAN, jamais une liste offerte à un nouveau venu. Le test porte sur les données, pas sur
`syncTeam()===FB_TEAM`, qui est vrai chez toute entreprise restée sur l'espace par défaut.

**Boutons de test de la bêta, faits et vérifiés :** carte « Outils de bêta » dans les Réglages —
remplir (jeu de test), remplir en grand nombre (200 clients / 400 interventions marqués
`demo:1`, retirables par le bouton existant), tout vider. Garde `BETA_ESSAI` **et lui seul**
(`equipeTeamOP()` est vrai en production chez qui n'a pas de clé personnalisée), plus le rôle
administrateur parce que `scripts/apercu.sh` produit un `apercu/app.html` en mode bêta, servi
publiquement sur teamop.fr.

**Trois seuls écarts restants, cosmétiques :** le libellé d'un même pack diffère entre le site et
le formulaire — 3D « Hygiène anti-nuisibles » / « Anti-nuisibles », Peinture « Finitions » /
« Revêtements », Couverture « Toiture » / « Zinguerie ». Les identifiants `data-met`
correspondent partout, donc rien ne casse : c'est un client qui lit deux mots pour la même
chose.

### Refonte de la Tour — **FAITE ET PUBLIÉE le 8 septembre 2026**
`tour.html` est sur `main` (`1a75278`). Les dix écrans sont refaits.

Le grief de Justin était mesurable, et il a été mesuré avant qu'on dessine : `--surface` sur
le fond de page donne **1,16:1** la nuit et **1,11:1** le jour — « il n'y a que dalle » était
littéral. Et sept lignes séparées par six marges rigoureusement identiques de 6 px.

**Le socle, à ne pas défaire** (classes `.reg-*`, en tête du CSS) :
- **Deux matières, jamais trois.** Surface élevée (`--plan-cli`) ou rien. Le plan élevé est
  réservé à ce qui rapporte de l'argent ou demande une décision maintenant, **jamais à plus
  d'un groupe par écran** — c'est ce qui le garde crédible.
- **L'espacement dit la parenté : 0 / 10 / 32 px.** Aucune exception locale.
- **Quatre hauteurs constantes par nature** : 92 / 60 / 52 / 44 px, toujours en `min-height`.
  Une hauteur ne varie plus selon qu'un champ facultatif est rempli.
- **Une ligne cliquable est un `<button>` qui porte un chevron**, et rien n'est niché dedans :
  le focus clavier arrive gratuitement, les 44 px sont garantis sans les recompter.
- **La couleur ne parle jamais seule.** Toute pastille porte un mot ou un chiffre.

**Mesuré, pas estimé :** dix onglets × 390 / 768 / 1512 px × deux thèmes. Zéro cible sous
44 px, zéro débordement, zéro chevauchement, zéro erreur JavaScript. Vérifié sur le fichier
SERVI par teamop.fr, pas seulement en local.

**Le banc d'essai qui a servi** vit dans le dossier de travail de la session, pas dans le
dépôt : un fichier injecté par `addInitScript` qui intercepte `fetch` et sert un jeu de
données calqué sur les vraies captures. Il rend les mesures reproductibles d'une étape à
l'autre — à refaire si on reprend la Tour.

**Deux pièges rencontrés, à ne pas refaire :**
- **Collision de préfixe entre écrans.** `.ac-` sert à la fois à l'Accueil et à l'Accès :
  `.ac-act` existait des deux côtés et le bouton d'Accès héritait de `flex:1 1 100%`.
  Vérifier le préfixe avant de nommer une classe.
- **Une classe déclarée en trois endroits.** `.dos` l'était, par trois chantiers successifs ;
  les deux fragments les plus hauts perdaient la cascade sans que rien ne le signale.

### La suppression totale d'une entreprise — **FAITE ET PUBLIÉE le 8 septembre 2026**
Deux routes patron (`apercu-suppression` puis `supprimer` avec code à 6 chiffres par e-mail),
plus le parcours complet dans la Tour. Le bouton supprime vraiment, vérifié de bout en bout
avec une entreprise voisine comme témoin.

**Ce que la route NE supprime pas, et c'est voulu : OP MESSAGES.** Décision de Justin —
l'application est encore en développement, on ne la supprime pas, elle est seulement séparée
d'OP GESTION. L'écran ET l'e-mail de confirmation le disent. Une version antérieure disait
« à supprimer à part », ce qui invitait au contraire : ne pas la réintroduire.

**Trois archives de courrier survivaient à la suppression** (`mails-envoyes.json`,
`support-mails.json`, `support-envoyes.json`), toutes servies par des routes en `monAdmin` —
un cran SOUS le `monPatronStrict` qui autorise la suppression. Un collaborateur lisait encore
la correspondance d'une entreprise effacée, alors que l'e-mail promet « rien n'est
récupérable ». Corrigé, compté dans l'aperçu, vérifié.

**Limite connue, écrite dans le code** : les adresses viennent de `espacesReg[].email`. Pour
un espace **hors annuaire** — le cas précis pour lequel la route existe — il n'y en a aucune,
donc les archives ne sont pas purgées. L'aperçu annonce honnêtement 0, il n'y a pas de fausse
promesse ; les réponses de clients, purgées par teamId, partent quand même.

### Le dessin — ouverts, et appliqués à la Tour
`apple-design` (le mouvement) et `apple-visual-craft` (le regard : formes, matières, typo)
ont servi à la refonte de la Tour. Ils vont ensemble : les charger AVANT de dessiner, pas
après — c'est la partie où on risque le plus de faire au hasard.

**Ce que la Tour en a tiré et qui vaut pour `app.html` le jour où on y viendra** : la surface
élevée réservée à une seule chose par écran ; les hauteurs constantes par nature ; un titre de
section qui est un nom et non une étiquette en majuscules ; la couleur qui ne parle jamais
seule. Et les trois états que personne ne dessine — vide, chargement, erreur — qui manquaient
sur les dix écrans et qui manquent encore ailleurs.

⚠️ **`app.html` n'a PAS reçu ce traitement** et c'est un tout autre budget : 2,6 Mo chargés
sur des téléphones de terrain en 4G, là où la Tour est la console interne de Justin. Voir le
skill `performance-budget-monitor` avant d'y toucher.

---

## Dettes connues, chacune à traiter seule

- **`FOURNISSEURS_ELAN` (`app.html:4496`) — fausse alerte, levée le 8 septembre 2026.**
  Ce n'était pas la faute de `REPORT_TEMPLATES` : les cinq entrées sont les fournisseurs du
  **métier de la 3D** (entreprises publiques, contact nominatif vide, adresses génériques,
  notes reprises de leurs sites). Un pack métier offert au démarrage, pas une fuite. Ne pas
  supprimer.

  Reste, en rangement : le **nom** ment — le renommer supprimerait le piège — et le pack part
  aussi chez les entreprises de **nettoyage**, qui n'ont pas ce métier. Décision de Justin, à
  faire à la prochaine publication d'`app.html`. Trois points d'usage : 4496, 4516, 4578.

- **Le nom « elan » dans le code.** Trois étages, de plus en plus dangereux :
  1. *Textes, commentaires, `elan.html`* — sans risque, prêt à faire.
  2. *≈60 clés de stockage `elan_*`* — demande une migration écrite et testée. `elan_vierge_v1`
     en particulier : sans ce drapeau, `load()` vide 28 collections d'une base pleine et la
     synchro propage le vide sur tous les appareils. Neuf clés sont construites à la volée
     (`elan_rappels_`+id…), qu'une liste fixe raterait.
  3. ⛔ **`SYNC_SECRET_DEFAULT` et `SYNC_SALT` — interdits.** Ce ne sont pas des noms : c'est
     le mot de passe de chiffrement et son sel. Les changer rend les données de toutes les
     entreprises sans clé personnalisée **définitivement illisibles**. Voir `CLAUDE.md`, qui
     détaille pourquoi le piège se referme dans les deux sens lors d'un renommage.

  Le nom de l'application est **OP GESTION**. « ELAN » est une entreprise cliente, rien de plus.

- **`elan.html` existe encore à la racine** — donc GitHub Pages sert `teamop.fr/elan` avant que
  `404.html` n'ait son mot à dire. C'est ce qui a imposé l'espace de noms `/e/` pour les
  adresses d'entreprise. Le renommer en `op-gestion.html` fait partie de l'étage 1.

---

## Ce qui n'est pas à moi

- **L'e-mail d'annonce aux clients n'est pas parti.** C'est un bouton de la Tour, et c'est
  celui de Justin. Ne pas l'envoyer à sa place.
- **Chrome DevTools ne se conduit que depuis la session principale.** `concepteur` et
  `testeur` ne peuvent pas l'atteindre — leur liste `tools:` explicite ferme l'accès à tous
  les outils MCP. Éprouvé quatre fois ; le tableau est dans `CLAUDE.md`. Et quand la session
  principale mesure : **bêta ou copie d'aperçu uniquement**, jamais `app.html` en production,
  qui porte des noms et des adresses de vrais clients.
