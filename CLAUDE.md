# TeamOP

Suite logicielle pour entreprises de terrain — nettoyage, lutte anti-nuisibles.
Applications : OP GESTION (interventions, clients, devis) et OP MESSAGES (messagerie).
Vendu par abonnement, clients réels, données réelles. **Ce dépôt est en production.**

📍 **Avant toute chose, lire `REPRISE.md`** — les chantiers ouverts, les dettes connues et ce
qui attend une décision de Justin. Une conversation meurt, le dépôt reste : ce fichier est la
seule mémoire qui passe de l'une à l'autre. Le tenir à jour quand un chantier change d'état.

## Structure

- **Racine** — site vitrine et applications, HTML/CSS/JS sans framework, servi par GitHub Pages
- **`server/`** — API Node/Express déployée sur un VPS, hors GitHub Pages
- **`.github/workflows/`** — surveillance horaire du site et de l'API

Pas de compilation, pas de bundler. Ce qui est écrit est ce qui est servi.

## Le serveur

`server/index.js` — 5 702 lignes, 121 routes (recompté le 11 septembre 2026 ; il a doublé,
puis redoublé, depuis la première rédaction de cette fiche — se méfier des chiffres de cette
page plus vieux que quelques jours, celui-ci compris : il a vieilli de 90 lignes dans la
journée même où il a été corrigé). Écoute sur `127.0.0.1:8080`,
**derrière nginx** (d'où `app.set('trust proxy', 1)`).

Dépendances : `express`, `imapflow` + `mailparser` (réception des courriels),
`nodemailer` (envoi), `web-push` (notifications), `@anthropic-ai/sdk`.

**Stripe n'est pas une dépendance** : l'API est appelée directement par `fetch`
vers `api.stripe.com`. Une bibliothèque de moins à maintenir et à auditer — garder
cette approche.

`server/agent-devis.js` — assistant de rédaction de devis. Modèle `claude-opus-5`,
un seul outil (`creer_devis`), plafond de 100 appels par jour, code d'accès d'équipe.
**Ce fichier envoie des données de clients réels à Anthropic** : nom, adresse, ville.
Toute modification touchant au contexte transmis a une portée juridique — voir
`sous-traitance.html`.

### Commandes

Il n'y a **pas de `package.json` à la racine** : tout se lance depuis `server/`.

```bash
cd server && npm start             # démarre le serveur (port 8080)
cd server && npm audit --omit=dev  # failles dans les dépendances de production
node --check server/index.js       # contrôle de syntaxe, depuis la racine
```

**Quatorze suites dans `tests/`**, sans dépendance ni installation : treize extraient les
fonctions réelles d'`app.html` et les exécutent — elles testent donc le fichier livré. La
quatorzième, `test-641.js`, est la seule qui vise `server/` : elle LANCE le vrai serveur,
isolé (configuration, données et port à lui), et lui parle en HTTP. Elle saute d'elle-même sa
partie exécutée si `server/node_modules` manque, et ⚠️ ne vise jamais `api.teamop.fr`.

```bash
for f in tests/test-*.js; do node "$f"; done   # 502 vérifications, 2,1 s (mesuré)
```

Quand une suite ne peut pas exécuter (un ordre d'opérations, un balisage, une fonction qui touche
le DOM), elle lit le texte du fichier réel — et la preuve fonctionnelle vit alors dans une sonde
navigateur du scratchpad, citée en commentaire. **Ne jamais reconstruire un ordre de déclaration
pour faire passer un test** : c'est ce qui avait masqué une zone morte temporelle le 10 septembre
au matin, rendant tout le rangement de catégories silencieusement inopérant.

Lire `tests/LISEZMOI.md` avant d'écrire dans `db.produits` : il porte l'invariant sur les
identifiants de fiches, et `test-634.js` le fait respecter mécaniquement.

L'autre suite — 17 tests `node --test` avec `supertest`, côté serveur — vit sur
`audit/plan-action` ; voir la dernière section.

### Essayer le serveur en local

La configuration vit sur le VPS, pas dans le dépôt. Trois variables permettent de
lancer le serveur isolément, sans toucher à la production :

```bash
TEAMOP_CONFIG=/chemin/config.json TEAMOP_DATA=/chemin/data PORT=8099 node server/index.js
```

Le fichier de configuration doit contenir au minimum `vapidPublicKey` et
`vapidPrivateKey` (générables avec `web-push`), sinon le démarrage échoue.

## Déploiement

### Accès

```bash
ssh root@api.teamop.fr    # Ubuntu 24.04, Node v22.23.1
```

`server/install.sh` s'exécute **sur le VPS** : clone dans `/opt/teamop/repo`,
configuration dans `/opt/teamop/config.json` (chmod 600), données dans
`/opt/teamop/data`, service systemd `teamop-api`.

```bash
systemctl status teamop-api          # état
journalctl -u teamop-api -f          # journaux en direct
journalctl -u teamop-api | grep '^devis '   # appels d'outil de l'assistant devis
```

## Conventions

- **Français partout** : code, commentaires, messages de commit, interface.
- Les commentaires expliquent *pourquoi*, pas *quoi*. Ce dépôt en compte de bons —
  s'en inspirer plutôt que de les diluer.
- Fait main plutôt qu'une dépendance de plus, quand c'est raisonnable : le serveur
  est exposé sur Internet, chaque dépendance est une surface d'attaque.

## À ne pas faire

- Ne jamais committer `config.json`, `.env`, ni le contenu de `.claude-flow/`
- Ne pas toucher à `/opt/teamop/config.json` depuis le dépôt : il vit sur le VPS
- ⛔ **Une valeur du CORPS d'une requête ne décide jamais de ce qu'une entreprise a payé.**
  Un code promo s'active en trois contrôles, et les trois sont obligatoires : le code doit
  exister dans `config.promos`, l'échéance se **calcule** depuis `p.mois`, `maxUtilisations`
  se vérifie avant de compter — plus « un seul code à la fois par espace ». Trois chemins les
  font (`espacePaye()`, `/api/monitor/espaces/promo`, le relais de `/api/clients/sync`) ; le
  troisième ne les faisait pas, et lisait `promoFin` dans le corps : tout client du portail
  s'offrait l'abonnement à vie avec `{promoCode:'PEU-IMPORTE', promoFin:'9999-12-31'}`, parce
  qu'`espacePaye()` relit `promoUsages` sans rien revérifier. Un quatrième chemin un jour fera
  les trois contrôles ou n'existera pas. `tests/test-641.js` le relit.
- ⛔ **Un code promo ne s'active QUE contre la preuve de la clé d'équipe, et le compteur ne
  bouge QUE si un espace est servi.** `/api/promo/valider` n'exigeait aucune identité :
  `{code, teamId}` offrait l'abonnement de n'importe quelle entreprise, et `u.n++` placé
  au-dessus de `if (team)` laissait épuiser un code à `maxUtilisations:2` en deux requêtes
  sans `teamId` — déni de service définitif sur une campagne. L'aperçu (`apercu:true`) reste
  public **par nécessité** : `espace.html` et `recap-abonnement.html` valident un code avant
  qu'un espace existe, il n'y a alors aucune clé à prouver ; il n'écrit rien, donc il ne donne
  rien. Ne pas le fermer « pour faire propre », ça casserait la page d'abonnement.
- ⛔ **`espaces.json` ne s'écrit QUE par `espacesEcrire()`** (temporaire puis renommage).
  Tronqué, il sort TOUTES les entreprises de l'annuaire d'un coup — et depuis que la règle
  Firestore est publiée, ça ne casse plus seulement la Tour : plus de verdict de clé, plus de
  jeton, donc plus de synchro du tout, pour tout le monde. `tests/test-641.js` compte les
  écritures directes et exige zéro.
- ⛔ **Un refus ne se montre PAS tout seul : il faut que l'écran sache le dire.** La preuve
  par l'exemple, 11 septembre 2026 : le refus de `/api/replies` était rendu en `text/plain`
  exprès pour faire jeter `r.json()` et afficher « Réception indisponible » — **mesuré au
  navigateur, il affichait « Connecte ta boîte mail » et son bouton**, parce que
  `loadMailboxes()` posait `_mailboxes=[]` sur échec et réécrivait la liste par-dessus. On
  réclamait son mot de passe d'application Gmail à quelqu'un dont la boîte marchait très
  bien. `_mailboxes` et `_mailReplies` ont donc TROIS états — une liste, une liste vide, et
  `null` « on n'a pas pu savoir » — et les trois points d'appel testent `!r.ok` autant que le
  `catch`. Ne jamais reconfondre les deux derniers : on ne propose de connecter une boîte que
  quand on SAIT qu'il n'y en a aucune. Corollaire général : avant de faire refuser une route,
  aller REGARDER au navigateur ce que l'écran affiche — pas ce qu'on croit qu'il affiche.
- ⛔ **Le refus de `/api/replies` n'est PAS du JSON.** `loadMailReplies()` (`app.html`) fait
  `const d = await r.json(); _mailReplies = d.replies||[]` : un refus en JSON se parse sans
  erreur, la liste devient **vide** au lieu de **nulle**, et l'écran affiche « 📭 Aucun
  message » — le client ne voit pas une panne, il voit sa correspondance disparue. En
  `text/plain`, `r.json()` jette, le `catch` met `null`, l'écran dit « Réception
  indisponible ». Avec `/api/mailboxes`, ces deux routes exigent la preuve de clé
  (`cleEquipeExige`, monté APRÈS `cleEquipeObserve` qui pose `req.cleEquipe`) : seul le verdict
  `valide` passe, et `ESPACES_INTOUCHABLES` comme `cleEstPublique(t)` sont refusés — une clé
  écrite en clair dans `app.html` ne prouve rien quand on la présente. ✅ **Fermée en
  production le 11 septembre 2026 à 8 h 17**, après les quatre marches, dans cet ordre — les
  appareils d'abord, la porte ensuite : v641 publiée, v641 exigée (`teamop_config/version.min`
  = 641 dans Firestore, pas seulement côté API), aucune entreprise vivante hors annuaire,
  aucune sur la clé partagée. **Le défaut du code est désormais FERMÉ** : il faut
  `"mailPreuveExigee": false` pour ROUVRIR, et `install.sh` pose le réglage sur une
  configuration neuve — une réinstallation ne peut plus rouvrir la porte en silence.
  ⛔ **Si l'une des quatre conditions redevient fausse** (une entreprise remise sur le repli,
  un parc bloqué en version ancienne), **rouvrir** le temps de la traiter plutôt que laisser
  des clients sans leur Réception. Le compteur `mailRefus` de `/health` le voit venir : un
  motif autre qu'`absent` qui monte, ce sont de vrais appareils qui tombent. Il reste agrégé —
  `/health` est publique, y nommer un espace dirait au monde quelles entreprises existent.
- ⛔ **Fermer une entreprise doit COUPER ses sessions Firebase, et le DIRE.** Refuser les
  nouveaux jetons ne suffit pas : un jeton s'échange contre une session **renouvelable
  indéfiniment**, rangée sur l'appareil — après un seul échange réussi, l'appareil ne repasse
  plus jamais par le serveur. Jusqu'au 11 septembre 2026, fermer une entreprise depuis la Tour
  ne coupait donc PAS son Firestore sur les appareils déjà pourvus : ils lisaient et écrivaient
  pour toujours pendant que la Tour affichait « fermée ». `fbRevoquerEquipe(t)` pose
  `validSince` par `accounts:update`. **Les QUATRE portes l'appellent** (suspendre, fermer un
  client, supprimer une entreprise, et « repartir à neuf » — cette dernière n'ajoute pas à
  `entFermes` mais efface le document de l'ancien espace, et sans coupure il renaissait hors
  annuaire, orphelin) : une seule oubliée et la coupure devient une loterie ; rouvrir, lui, ne
  coupe rien. Sur la fermeture d'un client, on coupe **avant** d'effacer — mais la fenêtre est
  **raccourcie, pas fermée**, et l'écrire autrement ferait croire le contraire : `validSince`
  n'invalide que le rafraîchissement, donc un appareil qui tient un jeton encore valable peut
  RECRÉER le document après l'effacement. ⚠️ **Rien n'est instantané — jusqu'à UNE HEURE** :
  une règle Firestore n'évalue que la signature, l'émetteur et l'échéance du jeton, elle ne
  consulte JAMAIS l'état du compte (ni désactivé, ni supprimé, ni `validSince`).
  ⚠️ **Et tout cela ne vaut que parce que la règle a été publiée le 11 septembre** : l'appareil
  révoqué retombe en anonyme, et c'est la règle qui ne lui donne rien. Avant, l'anonyme avait
  tout — la coupure aurait été purement cosmétique. Et sans clé d'administration, la
  fonction rend `false` — **l'appelant DOIT le remonter**, croire une entreprise coupée alors
  qu'elle ne l'est pas est la panne silencieuse type. `fbUidEquipe(t)` n'a **qu'une seule
  définition**, partagée par la signature et la coupure : deux copies calculeraient un jour
  deux identifiants différents, et la coupure viserait un compte qui n'existe pas sans rien
  dire. `tests/test-640.js` extrait cette fonction du fichier réel pour éprouver la vraie
  dérivation, `tests/test-641.js` joue les quatre réponses de la coupure.
- Ne pas modifier l'anti-abus (`server/index.js`) sans relire pourquoi il lit
  `req.ip` et non l'en-tête brut — un en-tête fourni par le client se falsifie
- Ne pas écrire de données personnelles de clients dans les journaux
- **Ne jamais faire `db.produits.push(…)`** : une fiche produit naît par `produitCreer(fiche,{semis,push})`
  (`app.html`), qui pose `cree`/`creePar` — c'est ce qui fait apparaître le « +N » sur les box et la cloche.
  Un semis (catalogue, démo, bêta) passe `semis:true` (vaut 0, jamais « nouveau »). Une seule LIGNE DE CODE
  doit appeler `db.produits.push` — `grep -c` en compte deux, la seconde étant le commentaire qui le dit.
- **L'identifiant d'une fiche produit est soit unique par construction (`uid`), soit déduit d'un nom qui
  ne peut PAS sluguer à vide.** `idCatalogue` réduit un nom à `[a-z0-9]` : de la ponctuation seule ou une
  écriture non latine ne laisse rien et retombe sur le générique `cat_x`. Pour tout nom **libre** (champ
  de saisie, texte collé), passer par `idProduit(nom)`, qui rend `uid()` dans ce cas. Ne pas se reposer
  sur la garde de `produitCreer` : elle ne protège que la création LOCALE — `fusionnerBases` unit par
  identifiant et ne la voit jamais, donc deux appareils hors ligne perdraient une fiche et son stock à
  la synchro, sans même être signalés comme doublon. `tests/test-634.js` relit le fichier et bloque
  tout nouvel appel qui construirait un identifiant à partir d'un nom libre. Même esprit : les décisions d'une box (`db.boxDecisions`) et les paires déclarées
  distinctes (`db.produitsDistincts`) sont des collections à part, fusionnées par enregistrement — ne pas
  les ranger sur la box ni sur la fiche produit, la fusion en bloc écraserait le stock ajusté ailleurs.
- **Ne jamais écrire une catégorie de produit hors de `CAT_LIST`.** Les huit sont la seule taxonomie
  de l'application : elles portent une couleur et groupent le stock des box. Les catalogues
  fournisseurs (`CATFOUR`) en ont 171 autres — les traduire par `rangerCatFour(étiquette, nom)`, jamais
  les recopier. Deux règles y sont gravées : le NOM passe avant l'étiquette (un rayon nomme une cible,
  le nom nomme l'objet), et rien qui nomme une cible ne se replie sur TP14 ni TP18 — ce sont les types
  du règlement biocide qu'une entreprise trace, pas deux étagères parmi huit.
- **Retirer un produit d'une box s'écrit TOUJOURS dans `db.boxDecisions`** (`boxDecider`). Quatre
  chemins le font : la feuille « Retirer », la croix ✕ de « Modifier la box », le retrait direct de la
  fiche, et le retrait validé par le DR. Sans cette trace, le catalogue repose tout seul ce qu'une
  équipe a retiré à la main — et une pose multi-box efface en silence les décisions de trente équipes.
  Règle jumelle : **une décision « Pas dans cette box » ne se lève que sur la box qu'on a sous les
  yeux** (`boxPoserProduits(b,ids,{respecterEcartes})`).
- ⛔ **Quitter un espace passe par `espaceQuitter()`, jamais à la main.** Il y a QUATRE portes —
  Code espace, lien de connexion, lien client (`espace.html`) et fermeture par la Tour — et le
  10 septembre 2026 trois d'entre elles avaient le même défaut. La fonction retire `STORE_KEY`, le
  drapeau de vidage, pose `elan_frais`, emporte les secrets de l'entreprise quittée (clé Anthropic,
  code d'équipe devis, projet Firebase personnel, annuaire, marques de lecture, compteurs d'usage,
  administrateur déclaré) et efface les bases mises de côté en IndexedDB. Le préfixe se lit sur
  `STORE_KEY`, jamais écrit en dur — la bêta a le sien, et une liste figée raterait tout ce qui est
  construit à la volée. `espace.html` refait la même chose en clair : elle ne partage aucun code
  avec l'application, donc toute modification ici doit s'y répercuter.
  **Le drapeau de vidage est le point qui coûte** : le vidage des collections de démonstration n'a
  lieu QU'UNE FOIS DANS LA VIE DE L'APPAREIL. Sans son retrait, un appareil déjà utilisé rejoue
  `seed()` sans vider : 160 produits, cinq fournisseurs, deux devis, deux factures, deux contrats
  et DEUX BOX DE DÉMONSTRATION (« Cuisine — Restaurant Le Gourmet »…) entrent dans la base du
  client, puis la première synchro — une UNION — les répand dans toute l'entreprise. Mesuré :
  220 fiches deviennent 380 et 110 noms passent en TRIPLE. C'est le SEUL moment où retirer ce
  drapeau est sans danger, parce qu'on vient de supprimer la base. `tests/test-637.js` surveille les
  quatre portes, `scratchpad/sonde-rejoindre.js` l'exerce par le vrai `teamopJoin`.
- ⛔ **Un `<input type="number">` AVALE la virgule décimale, et le champ reste VALIDE.** Mesuré sur
  Chromium en `fr-FR` : « 33,50 » devient « 3350 », « 5,5 » de TVA devient « 55 ». `replace(',','.')`
  n'y peut rien — la virgule n'atteint jamais le JavaScript. Un seul écouteur `keydown` (vers la
  ligne 7803 d'`app.html`) la remplace par un point via `document.execCommand('insertText')`, qui est
  le seul à respecter le curseur ET une sélection en cours sur un champ numérique. Ne pas le
  supprimer, ne pas le remplacer par `setRangeText` (refusé sur `type=number`), ne pas basculer le
  type en texte (le curseur est perdu : « 33,50 » devient « .5033 »), et **ne rien réémettre quand
  `execCommand` réussit** — il émet déjà `input`, et un `change` de trop re-dessine les blocs sous
  les doigts de l'utilisateur.
- **Une quantité de ligne s'exprime dans l'unité DE LA LIGNE, pas de la fiche.** Le technicien saisit
  250 mL d'un produit stocké au litre. `prodLineUnit(l)` donne l'unité juste, `stockConv(q,de,vers)`
  convertit, `uniteCompat(de,vers)` dit si deux unités s'ADDITIONNENT — parce que `stockConv` rend la
  quantité inchangée quand il ne sait pas convertir, ce qui est pratique pour déduire du stock et
  piégeux pour faire une somme. Trois documents partaient faux d'un facteur 1000 : la facture générée
  depuis une intervention, le registre biocide et le dossier sanitaire.
- **Une trace de mouvement dit ce qui a BOUGÉ, jamais ce qui était demandé.** Le stock plafonne à
  zéro ; la ligne de `db.mouvements` ou de `traceBox` doit plafonner sur le même nombre. Valider −4
  sur une box tombée à 1 sort une unité : le mouvement en dit une, pas quatre. Même règle dans
  `intStockDeduire`, `boxMvtValider` (lot ET mouvement isolé) et `boxAdj`. Et un bon de remise ne
  totalise pas des unités avec des cartons : `remiseAjoute(m,qte,unite)`, une ligne par unité.
- ⛔ **Le stock d'une box ne se réécrit JAMAIS en bloc.** Un formulaire porte l'instantané pris à son
  ouverture ; l'appliquer tel quel rembobine la box à cette minute-là, avec un `_m` neuf donc
  gagnant sur tous les appareils. `saveBox` part du stock VIVANT et n'applique par-dessus que ce que
  la fenêtre exprime : une fiche ajoutée, ou une quantité que la personne a elle-même retapée.
  Mesuré avant correction : 12 u revenus à 40 u chez toute l'équipe, pendant que les lignes de
  mouvement disaient l'inverse.
- ⛔ **Ouvrir un écran n'écrit pas.** `boxAutoNouveautes` a été supprimée le 10 septembre 2026 :
  ouvrir une box posait les nouveautés dans TOUTES les box visibles, donc les tamponnait toutes,
  donc faisait gagner à cet appareil la fusion de chacune — 120 unités sorties par quatre
  techniciens ressuscitées en un seul geste d'affichage. On prévient avec la pastille « +N », on
  écrit après un tap. C'est aussi la règle « rien ne s'écrit au seul chargement », appliquée aux
  écrans profonds.
- ⛔ **L'ORDRE, pour fermer la règle Firestore : les appareils D'ABORD, la porte ENSUITE.**
  Depuis la v640, l'application ne se connecte plus à Firebase en anonyme : elle présente un
  jeton signé par le serveur (`POST /api/fb/jeton`) qui porte l'entreprise dans `claims.t`.
  La règle publiée, elle, n'a **pas** changé — `firestore.rules` porte la future en commentaire.
  Deux conditions avant de la publier, chacune payante si on l'oublie : **tous** les appareils
  doivent présenter le jeton (sinon les retardataires perdent l'accès aux données de leur
  propre entreprise), et les entreprises restées sur l'espace de **repli** doivent avoir
  déménagé — le repli n'a pas de jeton, sa clé étant écrite en clair dans `app.html`, donc une
  preuve venant de lui ne prouve rien. Corollaire : `fbJetonEquipe()` doit TOUJOURS pouvoir
  échouer sans casser la synchro (elle rend `''` et l'appareil repart en anonyme). Ne jamais
  rendre le jeton obligatoire côté client avant que la règle le soit côté Google.
- ⛔ **Une box se fusionne PRODUIT PAR PRODUIT, pas en bloc.** C'est le seul enregistrement que
  plusieurs personnes modifient en même temps sans se marcher dessus : chacune sur un produit
  différent. Chaque ligne de stock porte sa date dans `b._ms[produit]`, retraits compris, et
  `boxFusionFine` recompose le stock ligne à ligne. Trois règles à ne pas casser :
  1. **`_ms` doit rester hors de `recEmpreinte`** (comme `_m`). S'il y entrait, chaque `save()`
     re-tamponnerait la box, qui battrait sa propre pierre tombale et gagnerait toutes les
     fusions sans que personne n'ait rien fait. Le signe que ça va : trois `save()` sans
     changement ne posent aucun `_m` (`tests/test-639.js`).
  2. **Les marques des produits EN STOCK ne s'élaguent jamais** — ce sont elles qui protègent le
     travail de chacun. Seules celles des produits retirés s'effacent, au rythme des tombes.
  3. **`boxFusionFine` rend `null` tant que les deux côtés ne datent pas leurs lignes**, et
     l'ancienne règle reprend. C'est ce qui rend le déploiement sûr — et ce qui fait qu'exiger la
     version depuis la Tour est ce qui active vraiment la maille fine.
  Partout ailleurs, deux personnes sur le même champ du même enregistrement est un VRAI conflit :
  le plus récent gagne, et c'est juste.
- ⛔ **Un numéro de document ne se réutilise jamais, et les deux sources sont amnésiques.**
  Supprimer une intervention l'ARCHIVE, et l'archive est plafonnée à 500 : lire « le plus grand
  numéro existant » ne suffit pas, ce qui sort de la mémoire revient. `db.numMax` est un plafond
  qui **ne redescend jamais**, relevé par `numPlafondRelever()` à chaque `save()` sur ce que la
  base contient vraiment, et réuni par le **MAXIMUM** (`numMaxUnion`) à la fusion — jamais par
  « le plus récent gagne », qui laisserait un appareil en retard rendre un numéro déjà émis.
  `intNum()` et `nextNum()` s'en servent comme plancher.
- **Les collections qui ne sont pas des listes se fusionnent clé par clé.** `plansSite`, `planNotes`
  et `permissions` sont des dictionnaires : `COLLS_DICT` + `dictFusion` les réunissent, et
  `baseSignature` les regarde — sinon une fusion qui ramène le plan d'appâtage d'un collègue passe
  pour un non-événement et n'est jamais repoussée. Avant : le plan de 24 postes d'un client écrasait
  celui de 18 postes d'un autre, en entier, sans pierre tombale.
- ⛔ **`_m:1` posé juste avant un `save()` ne survit pas.** `estampiller()` date de MAINTENANT tout
  enregistrement absent de l'ombre : un `_m:1` écrit puis sauvegardé est écrasé, et la fiche bat sa
  pierre tombale. Il ne tient que là où `ombreRelever()` passe juste après — au chargement (`load()`)
  et à l'import. Ailleurs, ne pas prétendre qu'il protège quoi que ce soit.
- **Rien ne s'écrit dans les données d'une entreprise au seul chargement de la page.** `migrate()`
  range et complète des champs, il n'ajoute pas de contenu : proposer, compter, afficher une bulle —
  mais l'écriture attend un tap. Deux raisons, l'une de principe et l'autre mesurée : une base est la
  propriété du client, et une écriture silencieuse contourne les pierres tombales (purgées après
  `TOMBE_JOURS`, 90 jours), donc ressuscite ce qu'une équipe avait supprimé exprès.
- **Un `.btn.sm` neuf se rend à 38 px, pas 44.** La refonte impose `min-height:38px` à tout `.btn.sm`
  (vers la ligne 3035) : un sélecteur simple ne bat pas sa spécificité, il faut le co-sélecteur
  `html[data-refonte]`. Toujours mesurer la hauteur réelle au navigateur avant de dire qu'une cible
  respecte le plancher tactile.
- **Une ligne de journal par GESTE, jamais par box.** `db.journal` est plafonné à 500 entrées à chaque
  `save()` et re-tronqué à 500 à chaque fusion : douze box de cent produits effacent tout l'historique
  de l'entreprise en un passage. Compter et nommer les box, ne pas réciter les produits.
- **Ne jamais piloter `app.html` avec Chrome DevTools MCP** — voir la section suivante
- ⛔ **NE JAMAIS TOUCHER À `SYNC_SECRET_DEFAULT` NI À `SYNC_SALT`** (`app.html`, vers la
  ligne 5059). Ce ne sont pas des noms, malgré les apparences :
  - `SYNC_SECRET_DEFAULT='ELAN-GESTION-7F3A9C2E-cloud-2026'` est **le mot de passe lui-même**,
    celui que PBKDF2 transforme en clé AES-256 pour chiffrer les données de toutes les
    entreprises qui n'ont jamais reçu de clé personnalisée.
  - `SYNC_SALT='RUxBTi1HRVNUSU9OLXNhbHQtdjE='` est le sel — c'est le base64 de
    `ELAN-GESTION-salt-v1`.

  Modifier l'un des deux rend **les données de ces entreprises définitivement illisibles, sur
  tous leurs appareils à la fois.** Le cloud ne stocke que du chiffré : sans la bonne clé
  dérivée, rien n'est récupérable.

  Le sel est doublement traître lors d'un renommage : invisible à une recherche de « elan »
  (donc laissé en place par un remplacement automatique), mais évident pour qui décode le
  base64 (donc « corrigé » par une relecture consciencieuse). **Le piège se referme dans les
  deux sens.** Changer ces valeurs n'est pas un renommage : c'est un déménagement de données
  chiffrées, qui se conçoit, se teste et se publie seul.
- **Ne pas renommer les clés de stockage `elan_*` à la légère.** `elan_vierge_v1` en
  particulier : si ce drapeau manque, `load()` vide 28 collections d'une base pleine,
  l'enregistre, et la synchro propage le vide à tous les appareils de l'entreprise. Neuf
  autres clés sont construites à la volée (`elan_rappels_`+id, `elan_onboarded_`+id…) — une
  liste fixe les raterait toutes.

  `elan_repli_v1` (ajouté en v575) est du même bois : il gèle, au premier démarrage de cette
  version, le verdict « cet appareil vivait-il déjà sur l'espace de repli ? ». Le perdre ou le
  renommer, c'est faire rejuger la question sur un stockage que l'application a elle-même
  rempli depuis — et donc rattacher à l'espace partagé des appareils qui n'y ont jamais été.

## Chrome DevTools MCP — mesurer pour de vrai, sur la bêta seulement

`.mcp.json` déclare un seul serveur : `chrome-devtools` (lancé par `npx`, avec
`--no-usage-statistics`). Il donne un vrai Chrome piloté — captures, console avec pile
d'appels, réseau, et surtout **trace de performance**. C'est le seul moyen de mesurer ce que
`app.html` coûte réellement : plus de 2 Mo en fichier unique, chargés sur des téléphones de
terrain en 4G. Le skill `performance-budget-monitor` décrit le budget ; sans cet outil,
personne ne pouvait le vérifier.

**Le navigateur doit exister LÀ OÙ TOURNE LA SESSION**, pas sur le Mac de qui la pilote. Une
session distante (Claude Code sur le web ou l'app) tourne dans un conteneur Linux : c'est lui
qui doit avoir un navigateur. D'où `--executablePath /opt/pw-browsers/chromium` dans
`.mcp.json` — un lien symbolique vers le Chromium de l'image, stable d'une version à l'autre.
Sur un Mac où Chrome est installé, remplacer cette ligne par le chemin de Chrome
(`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`) ou retirer les deux lignes :
il est alors trouvé tout seul.

⚠️ **Dans un environnement distant, viser `127.0.0.1`, jamais `teamop.fr`.** Le proxy sortant
coupe les connexions du navigateur (`ERR_CONNECTION_RESET`) ; seul le local passe. On sert donc
le dépôt et on pointe dessus :

```bash
node -e "const h=require('http'),f=require('fs'),p=require('path');h.createServer((q,r)=>{const x=p.join(process.cwd(),q.url.split('?')[0]);f.readFile(x,(e,d)=>e?(r.writeHead(404),r.end()):(r.writeHead(200,{'Content-Type':x.endsWith('.js')?'text/javascript':'text/html;charset=utf-8'}),r.end(d)))}).listen(8123,'127.0.0.1')" &
# puis viser http://127.0.0.1:8123/beta.html
```

C'est même préférable pour concevoir : on juge le fichier qu'on vient de modifier, pas la
version publiée il y a deux heures.

⏱️ **Toujours passer `timeout: 60000` à `new_page`.** Le défaut est de 10 s ; `app.html` et
`beta.html` font 2,6 Mo et ne finissent pas de charger à temps — on obtient sinon
« Navigation timeout of 10000 ms exceeded » alors que tout va bien.

Les trois `--chromeArg` de `.mcp.json` (`--no-sandbox`, `--disable-gpu`,
`--disable-dev-shm-usage`) sont indispensables en conteneur : sans le premier, le navigateur
meurt au lancement (« Target closed »). Chaîne vérifiée de bout en bout le 7 septembre 2026 —
poignée de main MCP, lancement du navigateur, page rendue.

⛔ **Bêta uniquement, sans exception.** Le serveur expose au client MCP **tout** le contenu
de la page ouverte. Sur `app.html` en production, ce sont des noms, des adresses et des
coordonnées de vrais clients — un flux de données qui n'est pas couvert par
`sous-traitance.html`. On ne pointe donc le navigateur piloté que sur `beta.html` ou une
copie d'aperçu : la bêta est isolée par construction (préfixe `elanB_`, espace
`elan-gestion-beta`, jamais de données d'entreprise). Cette règle est écrite aussi dans les
agents `concepteur` et `testeur`.

⛔ **Mais ces deux agents ne PEUVENT pas s'en servir, et il faut le savoir avant d'essayer.**
Un sous-agent dont le frontmatter porte une liste `tools:` explicite n'atteint AUCUN outil MCP.
Éprouvé le 8 septembre 2026, quatre essais, tous concluants dans le même sens :

| ce qu'on déclare dans `tools:` | ce que l'agent voit |
|---|---|
| `mcp__chrome-devtools__*` | rien |
| les 13 outils nommés un par un | rien |
| les 13 outils **plus** `ToolSearch` | rien — `ToolSearch` lui-même est retiré |
| `tools: *` (agent `general-purpose`) | **tout** : schéma chargé, `list_pages` répond |

Le mécanisme : les outils MCP arrivent *différés* — nommés, mais sans schéma — et il faut
`ToolSearch` pour le charger. Une liste `tools:` explicite retire `ToolSearch`, donc ferme la
porte, même quand les outils MCP y sont écrits noir sur blanc. Rien n'avertit : la ligne est
acceptée, les entrées sont simplement ignorées.

Conséquence pratique : **le navigateur piloté ne se conduit que depuis la session principale**
(ou un agent à `tools: *`, ce qu'on ne veut pas pour `concepteur` ni `testeur` — leur liste
restreinte est délibérée). Les deux agents mesurent donc avec Playwright par `Bash`, ce que
`testeur` fait déjà. Pour une vraie trace de performance, c'est la session principale qui la
prend.

## Attention : deux copies de travail

Ce dépôt est cloné deux fois sur cette machine :

- `~/Documents/GitHub/teamop` — branche `main`, **le code de production**
  (le dépôt s'appelait `elangestion.github.io` jusqu'au 7 septembre 2026 ; le dossier local
  peut encore porter l'ancien nom sans que ça gêne)
- `~/TeamOP` — branche `audit/plan-action`, **625 commits de retard**

Son `server/index.js` fait 308 lignes contre 1 300 ici. Toute correction du serveur
va dans cette copie-ci. Vérifier la branche avant d'écrire quoi que ce soit.

## Devis

`devisPdfStr()` dans `app.html` produit un vrai fichier PDF, sans bibliothèque —
même fabrique que `bonPdfStr()` pour les bons de commande. L'en-tête vient de la
société choisie sur le devis : `bcEntete()` pour le nom, `bcCouleur()` pour la
couleur, `socStyle().logo` pour le logo, converti en JPEG par un canvas parce que
le PDF ne lit pas le PNG.

Le générateur `devisIAModal()` enchaîne : dictée au micro → génération → aperçu du
PDF → client (choisi ou saisi) → envoi par `envoiDoc()`. Le moteur dépend de
l'offre de l'entreprise, décidée côté serveur : Haiku inclus, Sonnet en supplément,
ou les deux au choix de l'utilisateur.

## La bêta : un outil de développement, jamais un canal public

`beta.html` n'est **pas** une version d'essai pour les clients et ne le sera jamais. C'est
l'outil de l'équipe qui développe : Justin et les personnes qui travaillent avec lui.
Il n'y aura pas de « bêta publique » — ce mot désigne ici un canal interne.

- **L'accès se gère uniquement depuis la Tour de contrôle** (onglet Accès bêta, réservé au
  patron) : ouvrir, couper, rouvrir, supprimer. Le serveur porte ces accès
  (`beta-comptes.json`), la page n'a aucun compte de départ, un accès coupé ne passe plus
  même sur un appareil resté connecté.
- **Chaque accès dit qui travaille sur quoi** : la personne, et le chantier qu'elle teste
  (écran, fonctionnalité, version). Fait le 8 septembre 2026 — champ `chantier` à la création,
  réécrivable par `POST /api/monitor/beta/chantier` (`monPatronStrict`), affiché sur la ligne.
  Un accès sans chantier renseigné le dit en ambre plutôt que de se taire : un accès dont on
  ne sait plus à quoi il servait est un accès qu'on n'ose plus couper.
- **Jamais de données d'entreprise** : espace `elan-gestion-beta`, préfixe `elanB_`. Un accès
  bêta n'ouvre que la bêta.
- **L'onglet s'appelle « Accès » et porte DEUX portes, à ne jamais confondre** : la bêta
  (`beta.html`, comptes portés par le serveur, n'ouvre que la bêta) et la version publique
  (`app.html`, crée un vrai espace d'entreprise avec de vraies données qui se synchronisent).
  La seconde carte réemploie `tourEspaceDe()`, le même chemin exactement que « Lien de
  connexion » sur la fiche d'un client — pas de seconde route serveur à maintenir. L'adresse
  e-mail sert de clé : la réutiliser rouvre le même espace, elle ne le remplace pas.
- Sur `teamop.fr/beta.html`, le champ **Entreprise reste vide** : identifiant et mot de passe
  donnés par la Tour, rien d'autre. Y taper un nom envoie la page chercher une entreprise.

## Refonte et aperçu (septembre 2026)

La refonte design/mouvement se fait sur la branche `refonte/design`. **Rien ne remplace
une page utilisée par les clients sans que Justin l'ait testée.** Le canal de test :

```bash
bash scripts/apercu.sh tour.html app.html   # copies sous apercu/, base href, ruban, sans service worker
node scripts/verifier-theme.js tour.html    # syntaxe du JS embarqué, variables fantômes, contrastes
```

`apercu/` se commite **seul sur `main`** (nouveaux fichiers, aucun point d'entrée client
ne change) et se teste sur `https://teamop.fr/apercu/…` — même origine, donc l'API
(CORS limité à teamop.fr) et la session fonctionnent. `apercu/app.html` passe par
`beta-build.js` : données `elanB_`, espace de synchro bêta. Le serveur (`server/`)
reste sur la branche jusqu'à validation : un push sur `main` le déploie.

Marque, à ne plus confondre : **carré bleu nuit « TEAM / OP » = TEAM OP** (`icons/teamop-*`,
site, mails) ; **carré vert « GESTION / OP » = OP GESTION** (`icons/opgestion-*`, `icon-*`,
manifeste de l'app). La pastille verte « OP » de la Tour n'est qu'un repère d'en-tête.

## Pièges rencontrés — à ne pas refaire

- **Ne jamais figer les données d'un client dans le code.** `REPORT_TEMPLATES`
  portait les ~90 agences d'un seul client et les servait à tous les autres.
  Vidée le 5 septembre 2026.
- **Deux routes de même chemin : la première enregistrée gagne.** `/api/devis/etat`
  était déclarée dans `agent-devis.js` (monté ligne 232) et dans `index.js`
  (ligne 2842) ; la seconde, plus riche, n'a jamais répondu. Panne silencieuse.
- **Vérifier qu'un registre est peuplé avant de bâtir dessus.** `espacesReg` n'est
  alimenté que par une inscription manuelle ; `cnxData` se remplit tout seul à
  chaque connexion. C'est le second qui sert de source de vérité.
- **Le champ de configuration s'appelle `anthropic.cleApi`**, pas `apiKey`.
- **Ne jamais attendre une tâche de fond avec une boucle `until … done`.** Le harnais
  réveille tout seul quand une tâche se termine ; la boucle n'apporte rien et fuit. Le
  7 septembre 2026, six boucles attendaient des conditions devenues impossibles — l'une
  guettait un motif jamais écrit dans un journal, deux surveillaient des fichiers de sortie
  périmés, trois attendaient un fichier `.jamais` que personne ne crée. Jusqu'à 3 h 51
  d'attente pour des résultats déjà reçus.
- **Une commande qui dépasse son délai et bascule en arrière-plan reçoit un NOUVEL
  identifiant.** Sa sortie va dans le nouveau fichier ; l'ancien reste figé sur une capture
  partielle. Surveiller l'ancien, c'est attendre pour toujours.
- **`pkill -f <motif>` se tue lui-même** quand le motif figure dans sa propre ligne de
  commande — le reste de la ligne n'est jamais exécuté (code 144). Passer par le PID.
- **`FOURNISSEURS_ELAN` (renommée `FOURNISSEURS_3D` le 10 septembre 2026, v621 — le nom mentait) N'EST PAS la faute de `REPORT_TEMPLATES`** — cette
  fiche l'a affirmé du 8 septembre 2026 au matin, à tort, et la phrase a suffi à lancer une
  suppression. Vérifié champ par champ avant de toucher : les cinq entrées (ARMOSA, ENSYSTEX,
  SODIF, MABI, ORCAD) sont les fournisseurs **du métier de la 3D**, entreprises publiques,
  contact nominatif vide partout, adresses génériques (`info-3d@`, `contact@`), notes reprises
  de leurs sites. Aucune donnée propre à ELAN. C'est un pack métier offert au démarrage —
  `REPORT_TEMPLATES` portait les 90 agences d'un client, des données d'exploitation privées.
  Rien à voir.

  Ce qui reste vrai, et qui est du rangement, pas une fuite : **le nom ment**, et c'est lui qui
  a induit l'erreur ; et le pack part chez TOUTES les entreprises, y compris celles de
  nettoyage, qui n'ont que faire de fournisseurs de produits nuisibles. À traiter à la
  prochaine publication d'`app.html`, pas en urgence.

  **La leçon, plus large que ce cas :** un nom n'est pas un contenu. Ouvrir les données avant
  de croire l'étiquette — y compris celle écrite dans ce fichier.

## Modèle et effort par agent

Rien ne choisit le modèle tout seul : Claude Code ne regarde pas la difficulté d'une
tâche pour décider. Sans réglage, **chaque sous-agent hérite du modèle de la session** —
c'est-à-dire Opus sur tout, y compris pour lire trois versions avec `curl`.

Le choix est donc écrit, agent par agent, dans le frontmatter de `.claude/agents/*.md` :

| Agent | Modèle | Effort | Pourquoi |
|---|---|---|---|
| `verificateur` | `haiku` | `low` | Constate, ne décide pas : syntaxe, versions servies, `/health` |
| `testeur` | `sonnet` | `medium` | Écrit du Playwright et lit des échecs — du raisonnement, pas le plus cher |
| `deployeur` | `sonnet` | `high` | Le rituel est écrit (skill `publication`), mais une erreur se paie en clients |
| `concepteur` | `opus` | `high` | Refonte visuelle et mouvement : un jugement de goût, pas un contrôle mécanique |
| `gardien` | `opus` | `high` | Penser comme un attaquant se juge aussi. Une route qui fuit ne plante pas — le coût se compare à celui d'une fuite |
| `relecteur` | `sonnet` | `high` | Applique des critères écrits à un diff : systématique, pas créatif. Mais il passe après chaque changement, donc son coût unitaire compte |

Les deux derniers comblent ce que la CI ne fait pas : elle ne vérifie que les secrets commités
et les failles des dépendances — **pas même la syntaxe**, et personne ne relisait ce qu'une
route renvoie. `gardien` relit `server/` (80 routes exposées sur Internet, données de clients
réels) ; `relecteur` relit le diff avant qu'il parte sur `main`, qui est servi aux clients en
quelques minutes.

Tout autre sous-agent (recherche, revue de code, exploration) retombe sur
`CLAUDE_CODE_SUBAGENT_MODEL` dans `.claude/settings.json` — Sonnet. La session
principale, elle, garde le modèle choisi dans le terminal : ce fichier ne la touche pas.

Ordre de priorité, du plus fort au plus faible : `CLAUDE_CODE_EFFORT_LEVEL` (variable
d'environnement) → frontmatter de l'agent → réglage de session.

`bashOutputMaxChars` plafonne ce qu'une commande renvoie au modèle. Une trace
Playwright en échec fait des dizaines de milliers de caractères, tous facturés.
