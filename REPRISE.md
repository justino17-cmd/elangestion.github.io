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

## État au 10 septembre 2026, 1 h du matin — après la panne ELAN

Tout ce qui suit est **en vigueur**, vérifié de bout en bout (serveur, Firestore lu avec les
règles publiées, fichiers servis) :

- **Version minimale exigée : v622**, réglée depuis la Tour par Justin le 10 septembre au matin
  (vérifié : `/api/version` → `min: 622`), portée par `versions.json` et par
  `teamop_config/version`. Google refuse toute écriture d'un appareil sous v622.
  **10 septembre, 21 h : le minimum exigé est v633** (`/api/version` → `min: 633`), et **v634 est
  publiée et servie** (sha256 vérifié identique au dépôt).

  ⚠️ **v634 est à exiger dès que possible, et c'est la plus importante de la série.** Tant qu'un
  appareil de l'entreprise reste sous v634, il continue de fabriquer des identifiants de produit que
  les autres ne savent pas retrouver — donc de nouveaux doublons, y compris juste après une fusion.
  Un appareil sous v634 qui colle une liste ou saisit un produit hors stock au nom non latin peut même
  faire disparaître une fiche et son stock à la synchro (voir plus bas). La cure ne tient que si tout
  le monde est passé.
- **Règles Firestore publiées dans `elan-gestion` = `firestore.rules`** : OP GESTION + espace
  client, **sans la messagerie**. `op_companies` répond 403 — voulu. OP MESSAGES aura son projet
  (`firestore-opmessages.rules`) ; `messages.html` est hors d'usage jusqu'à sa bascule.
- **Mode en ligne seulement**, sans option ; battement vérifié toutes les 20 s.
- **Trois ordres de suppression en attente chez ELAN** (`florent-2`, `florent-3`, `ludo`) : retirés
  de l'annuaire, supprimés de l'application au premier appareil ELAN ouvert en v620. Le badge
  « ⏳ suppression en attente » de la Tour doit disparaître après ça — si au 11 septembre au soir
  il est toujours là, aucun appareil d'ELAN ne s'est ouvert, ou il faut regarder `ordres.json`.
- Projet Firebase `Team-OP` (`team-op-3d413`) supprimé par Justin ; `Messagerie-ELAN` gardé.
- **« Exiger la dernière version » lit la version SERVIE à l'instant** (10 septembre, après que la Tour
  eut affiché v625 alors que teamop.fr servait v626) : cache ramené d'un quart d'heure à une minute,
  lecture forcée au clic, et refus en 503 si teamop.fr n'a pas pu être relu — exiger un numéro périmé
  bloque les appareils déjà à jour et laisse passer ceux qu'on voulait pousser. **Relu par `gardien`,
  qui a trouvé** : ma garde regardait l'ÂGE de la valeur et non si la lecture avait abouti (donc muette
  dans le cas même qu'elle prétendait couvrir) ; le délai de 15 s ne couvrait que les en-têtes, un corps
  interrompu figeait la lecture pour toujours et tout appel suivant s'y accrochait ; chaque clic tirait
  les 2,95 Mo d'`app.html`. Corrigés : garde causale, délai sur toute la lecture, lecture au fil de l'eau
  arrêtée dès `APP_VERSION` (moins de 200 Ko), quota de 30 par heure, trace au journal sur refus.

**Fait depuis, dans la même nuit (v621) :** la vraie cure (fusion par enregistrement), le battement
de présence calmé, `sous-traitance.html`. **Puis v622 :** le périmètre d'un DR appliqué aux box,
véhicules, mouvements et journal. **Puis v623 :** plus de produits en double dans une box (cause,
cure, ligne orange « en attente »). **Puis v624 :** le DR corrige la quantité à la validation, le
technicien voit ce qui a été accordé. **Puis v625 :** un seul bouton « Ajouter / retirer » sur la box,
nouveautés, retrait sûr, doublons. **Puis v626 :** les catalogues fournisseurs dans la box, sans passer par
l'administrateur. **Puis v627 :** ils deviennent un onglet, parce que la section était à 9 086 px du haut. **Puis v628-629 :**
le catalogue se copie d'un espace pour se coller dans un autre. **Puis v630-632 :** trois corrections de mes
propres régressions sur ce chantier — la fusion globale rendue au bandeau, le bandeau ramené à la seule box
ouverte, l'action mise avant l'explication. **Puis v633 et v634 :** l'identité d'un produit, ci-dessous.
**Reste :** la bascule d'OP MESSAGES sur son projet — attend la configuration web du nouveau projet Firebase,
que Justin doit créer.

### v635 — le catalogue de Justin, le rangement, et la pose dans les box déjà créées

**Le pack 3D passe de 110 à 160 références.** Justin a copié la liste de sa bêta le 10 septembre
(184 lignes : 110 déjà au pack, 24 fiches « (démo) » écartées, **50 vraies nouvelles**) — la gamme
VULCANO d'ORCAD et cinq bâches MABI, toutes présentes dans les catalogues fournisseurs publics
embarqués. Aucune donnée d'un client : c'est un pack métier, comme les 110 d'origine.

**Le pack appartient désormais au MÉTIER** (`METIERS['3d'].catalogue` et `.fournisseurs`, lus par
`metierPackDe`). Un métier sans pack — plomberie, nettoyage — n'a plus ni bouton « ↻ Catalogue OP »
ni fiches à poser. C'est la décision de Justin du 8 septembre (« la liste 3D servie à un plombier »),
enfin écrite là où elle se lit. Sans métier réglé, c'est la 3D : le métier de toutes les entreprises
d'avant le choix.

**Le rangement des catégories — « ça là c'est mal rangé ».** L'écran Produits de Justin affichait
19 catégories : les huit de l'application plus onze rayons bruts de fournisseurs. Deux chemins
traitaient la catégorie de façon opposée et tous deux fautifs — l'onglet 🏭 Fournisseurs RECOPIAIT
l'étiquette (171 valeurs, 2 655 références sur 2 809 hors de `CAT_LIST`), le collage la JETAIT et
devinait d'après le nom, muet sur 64 %. `rangerCatFour(étiquette, nom)` traduit désormais vers l'une
des huit, ou rend la chaîne vide.

> **L'ordre de cette table est un raisonnement, et il est l'inverse de celui qu'on écrit d'instinct :
> LE NOM PASSE AVANT L'ÉTIQUETTE.** Un rayon nomme une CIBLE (« Insectes », « Rongeurs »,
> « Volatiles »), le nom nomme l'OBJET — et c'est l'objet qu'on range dans une box. Sans cet ordre,
> un thermomètre laser devient un insecticide parce qu'il dort sous « Insectes ».
>
> **Deux garde-fous que la mesure a imposés.** Un : aucune étiquette qui nomme une cible ne se replie
> sur TP14 ni TP18 — ce ne sont pas deux étagères parmi huit, ce sont les types du règlement biocide
> qu'une entreprise trace ; une clé de poste qui y atterrit, c'est un registre qui ne veut plus rien
> dire. Deux : **plutôt vide que faux** — une fiche sans catégorie se voit et se corrige en deux
> clics, une fiche mal rangée se découvre le jour où elle manque en intervention.

Mesuré : 98 % des 2 809 références rangées depuis l'onglet Fournisseurs, aucune sortie hors des huit ;
sur le collage, les muettes tombent de 64 % à 20 %. Zéro outil rangé dans un type biocide, zéro
matière active rodenticide rangée ailleurs que TP14. Une passe de `migrate()` range les fiches DÉJÀ
posées, **uniquement** celles dont la catégorie est une étiquette reconnue de `CATFOUR` ou vide — le
formulaire « ＋ Produit » étant un `select`, personne ne peut avoir inventé une catégorie, on ne
réécrit donc que ce qu'on avait soi-même mal écrit. En navigateur : 30 catégories deviennent 8.

**Poser le catalogue dans les box déjà créées.** Il ne manquait pas un mécanisme, il manquait un AXE :
la feuille « Produits de la box » savait cocher cent produits mais n'écrivait que dans la box ouverte ;
l'écran Boxes savait écrire dans N box mais un produit à la fois. Le pied gagne une ligne — « Dans :
cette box · Changer » — et par défaut rien ne change.

> **LA RÈGLE, la seule à retenir : une décision « Pas dans cette box » ne se lève que sur la box qu'on
> a sous les yeux.** Sur la box ouverte, l'encart « N produits écartés » est à l'écran, reposer y est
> un acte informé. Sur les autres, on ne voit rien — sans cette règle, une pose sur trente box
> effacerait en silence les décisions de trente équipes. C'est aussi ce qui rend le geste répétable.

Le plan est calculé **à blanc** avant d'écrire (fonction pure, aucun `save`) : chaque ligne du
sélecteur annonce ce qu'elle recevrait vraiment (« +158 · 2 écartés gardés »), et le récapitulatif
donne le total exact, jamais une estimation. Au-delà d'une box, le bouton ne pose rien : il ouvre le
récapitulatif, gelé 500 ms. La pose s'annule 20 s au lieu de 7.

> ⛔ **LA TRACE D'UN ALLÈGEMENT — le préalable sans lequel tout le reste se retournait contre Justin.**
> Quatre chemins retirent un produit d'une box ; **un seul écrivait l'écart**. La croix ✕ du formulaire
> « Modifier la box », le retrait direct de la fiche et le retrait validé par le DR n'en écrivaient
> aucun. Les box d'ELAN sont exactement la population taillée par ces chemins-là : au premier geste,
> elles se seraient re-remplies. Les quatre écrivent désormais la même trace.

**Deux bugs voisins corrigés au passage**, dont un que j'avais introduit en v633 : `boxAutoNouveautes`
écrivait une ligne de journal PAR BOX et `db.journal` est plafonné à 500 entrées — douze box de cent
produits effaçaient tout l'historique de l'entreprise en un passage. Et le filtre de `db.boxDecisions`
dans `delItem` s'exécutait AVANT le `confirm()` : annuler la suppression d'une box perdait quand même
ses écartés, que le premier `save()` propageait à toute l'équipe.

### v637 — rejoindre un espace déversait des données de démonstration chez le client

**Trouvé en cherchant pourquoi ELAN voyait « 110 produits en double ».** Le bandeau disait vrai : les
doublons étaient ceux du matin, au CATALOGUE (271 fiches), jamais fusionnés — pas dans la box, qui en
montre 161 parce qu'elle affiche un nom une seule fois. Reproduit à l'unité près, et un seul scénario
donne les deux nombres de la capture. La synchro du pack est hors de cause : rejouée trois fois sur
une base saine, 160 fiches et zéro doublon ; sur 400 bases tirées au sort, jamais un groupe de plus.

**Mais la chasse a trouvé autre chose, et c'était vivant.** Un appareil DÉJÀ UTILISÉ qui rejoint un
espace (lien de connexion ou Code espace) retirait `STORE_KEY` mais pas `elan_vierge_v1`. Or le
vidage des collections de démonstration n'a lieu **qu'une fois dans la vie de l'appareil**. Le semis
survivait donc au rechargement, et la première synchro — qui est une UNION — le répandait dans toute
l'entreprise.

Mesuré en navigateur par le vrai `teamopJoin`, avant puis après :

| | avant | après |
|---|---|---|
| produits injectés | 160 | 0 |
| box de démonstration | « Cuisine — Restaurant Le Gourmet », « Réserve — Boulangerie Au Bon Pain » | aucune |
| devis · factures · fournisseurs | 2 · 2 · 5 | 0 · 0 · 0 |
| base du client après fusion | 220 → **380 fiches, 110 noms en TRIPLE** | 220, aucun triplet |

Retirer le drapeau à cet endroit est sans danger, et c'est le seul endroit où ça l'est : on vient de
supprimer la base, donc le vidage vide le semis et jamais des données.

**Second défaut, du même rapport** : `cataloguePackSync` posait `_m:1` puis appelait `save()`, et
`estampiller()` date de maintenant tout enregistrement absent de l'ombre — le `_m:1` était écrasé.
Le commentaire promettait donc une protection qui n'existait pas. Corrigé en disant la vérité plutôt
qu'en forçant la date : même en la faisant tenir, la fiche serait retirée à la fusion puis recomptée
au chargement suivant, et la bulle reproposerait éternellement les mêmes fiches. **Ce qui légitime le
retour d'une fiche écartée, ce n'est pas une date, c'est que quelqu'un a lu le nombre et touché
« Synchroniser ».**

### v636 — les nouveautés du pack arrivent avec une bulle, jamais en douce

**L'idée est de Justin**, et elle est meilleure que la mienne. J'avais écrit la mise à jour du pack
en automatique au chargement ; il a proposé « un bouton en plus ici qui reçoit une petite bulle de
notifications quand il rajoute un produit dans produit, et là ça met synchroniser les nouveaux
produits ». Trois raisons pour lesquelles c'est ça qui part :

- **Rien ne s'écrit dans les données d'une entreprise sans qu'une personne l'ait décidé.** `migrate()`
  ne touche plus au catalogue : `cataloguePackNeufs(d)` est une fonction PURE qui compte.
- **Le compte se voit avant de toucher** : une bulle sur l'onglet « Ajouter », une bande en tête qui
  nomme les cinq premières références. C'était le vrai défaut du bouton « ↻ Catalogue OP » tout seul —
  personne ne touche un bouton dont il ignore qu'il a quelque chose de neuf.
- **Ça referme le trou des 90 jours** que `relecteur` avait trouvé sur la version automatique : passé
  `TOMBE_JOURS`, la pierre tombale d'une fiche supprimée exprès est purgée, et la version silencieuse
  l'aurait recréée toute seule. Plus rien ne se recrée sans un tap.

> **Deux étapes, deux bandes, à ne pas confondre** : « pas encore dans ton catalogue » (bordure pleine,
> en tête) puis « ✨ nouveau dans cette box » (lavis vert). Les fondre ferait taper deux fois.

La garde reste celle du bouton : au moins cinq fiches du pack déjà en place. Une entreprise qui n'a
jamais eu le pack ne voit ni bulle ni bande.

**Piège de spécificité, à connaître** : la refonte impose `min-height:38px` à tout `.btn.sm`. Un
sélecteur simple ne la bat pas — il faut le co-sélecteur `html[data-refonte]`, sinon la cible tombe
à 38 px, sous le plancher de 44. Mesuré au navigateur, pas supposé, et un test le surveille.

### L'identité d'un produit — v633 (fusion) puis v634 (création)

Les 110 doublons vus chez ELAN le 10 septembre avaient DEUX causes, refermées l'une après l'autre.

**v633 — la fusion perdait du stock.** `produitsFusionnerDoublons()` supprimait les DEUX fiches quand
elles partageaient un identifiant, au lieu d'en garder une : mesuré sur une base d'essai, 3 produits
tombaient à 1 et 12 unités disparaissaient d'une box. Corrigé : les fiches de même identifiant se
replient d'abord l'une sur l'autre (champs manquants complétés, fournisseurs unis), et la boucle de
stock ignore une cible égale à la source. La base d'ELAN rejouée : 220 produits / 110 doublons /
369 unités → 110 produits / 0 doublon / **369 unités**, aucune fiche perdue, 923 ms.
Même version : le semis d'un espace neuf pose des identifiants déduits du nom (`idCatalogue`) au lieu
d'`uid()` — c'était l'origine des 110 doublons, puisque le semis se rejoue à chaque ouverture d'espace,
et qu'un lien de connexion suffit à en ouvrir un.

**v634 — la création en fabriquait encore.** Quatre corrections, toutes mesurées :

- Une référence fournisseur prenait `four_<fournisseur>-<nom>` alors que le pack officiel posait
  `cat_<nom>`. **41 produits** du pack existent aussi dans une gamme ARMOSA/ENSYSTEX/SODIF/MABI/ORCAD :
  selon le chemin d'ajout, deux appareils de la même entreprise leur donnaient deux identifiants, et la
  synchro (qui unit par identifiant) en faisait deux fiches. L'identité est désormais le nom, partout.
- Les gardes « déjà chez moi » de trois écrans comparaient avec `norm()` quand le détecteur de doublons
  compare avec `produitCle()`. Alignées.
- `t3dProdToStock` et `intToggleProd` comparaient les noms à la main (`.toLowerCase()===`) et créaient
  avec `uid()`. Alignés eux aussi.
- Le semis porte `cree:0` (rien de semé n'est « nouveau ») et `_m:1` (une fiche supprimée exprès ne
  ressuscite pas chez tout le monde au prochain appareil neuf).
- Un nom tapé à la main qui existe déjà pose la question AVANT, au lieu de laisser fusionner après.

**Le résidu assumé, mesuré, écrit dans le code** : `idCatalogue` coupe le slug à 60 signes. Sur les
2 919 noms du catalogue, six identifiants sont partagés — **cinq sont le même produit écrit autrement**
(« TEENOX® EC » / « Teenox EC », « 3,80m » / « 3.80m », « (20g) » / « 20g ») et doivent bien se replier
sur une fiche ; **une seule paire est vraiment deux produits** (raccord acier / raccord inox). Celle-là
est départagée par une empreinte du nom entier ajoutée à l'identifiant. C'est le PREMIER arrivé qui
garde l'identifiant nu : deux appareils qui créeraient cette paire dans l'ordre inverse avant de se
synchroniser auraient un doublon — que le détecteur repère et fusionne sans perdre de stock. L'éviter
demanderait de changer `idCatalogue` pour tous les noms longs, donc de renommer 62 fiches déjà posées
chez les clients : **un déménagement de données, pas une correction.** À ne rouvrir que seul.

**Trois pertes de données dans la fusion elle-même**, trouvées par l'audit et corrigées dans la même
version :

- **Le stock global `p.qte`** — celui qu'`intStockAjuste` décrémente à chaque intervention, sans
  rapport avec `b.stock` — n'était pas repris de la fiche retirée : fusionner 30 et 12 en laissait 30.
  Il s'additionne désormais, comme celui des box.
- **Les décisions de box** (`db.boxDecisions[].ecartes`) sont rangées PAR IDENTIFIANT DE PRODUIT, en
  clés d'objet. Le marcheur générique ne voit que les champs nommés `produitId` : il les manquait
  toutes. Une fiche écartée exprès par l'équipe redevenait une nouveauté après une fusion, et
  `boxAutoNouveautes` la reposait dans la box.
- **Une déclaration « c'est normal, ce sont deux produits »** était emportée par un troisième homonyme
  arrivé après coup, et effacée sans le dire. Nouvelle fonction `produitsFusionnables(l)` : la fusion,
  l'aperçu chiffré et le compte du bouton en sortent tous les trois, donc le bouton ne promet plus ce
  qu'il ne tient pas. Un groupe dont tout est déclaré distinct sauf un reste signalé — il mérite une
  décision — mais « Tout fusionner » ne le compte plus.

**Ce que `relecteur` a trouvé DEUX FOIS dans ce que je venais d'écrire, et qui est corrigé** : `idCatalogue`
réduit un nom à `[a-z0-9]`. De la ponctuation seule, ou une écriture non latine, ne laisse rien et
retombe sur le générique `cat_x`. Deux produits sans rapport saisis dans le champ « produit hors
stock » d'une intervention prenaient alors le même identifiant — et la garde ci-dessus ne les
départageait pas, puisqu'elle compare des slugs, donc deux chaînes vides. Le second se voyait rendre
la fiche du premier, et son stock allait dessus, en silence. Ces noms-là gardent un identifiant unique
(`idProduit`), et `produitCreer` porte la même ceinture (`produitMemeNom`) pour tout appelant futur.

Le second passage a montré que j'avais raté le quatrième chemin — `plValider`, derrière « ⧉ Coller une
liste de produits » — et surtout **pourquoi la ceinture de `produitCreer` ne suffit pas là** : deux
appareils hors ligne collant chacun un tel nom créent leur fiche sans collision locale, puis
`fusionnerBases` unit PAR IDENTIFIANT **sans jamais passer par `produitCreer`**. Une seule fiche
survit, l'autre et son stock disparaissent — pas même signalés comme doublon, puisqu'ils partageaient
déjà l'identifiant avant d'arriver au détecteur.

> **La règle qui en sort, à tenir pour toute écriture future dans `db.produits`** : un identifiant est
> soit unique par construction (`uid`), soit déduit d'un nom qui ne peut PAS sluguer à vide. Une garde
> posée dans `produitCreer` ne protège que la création locale — la synchro, elle, ne la voit jamais.
> Un test relit le fichier et vérifie qu'aucun appel ne construit plus un identifiant à partir d'un
> nom libre ; les `idCatalogue` restants prennent tous leur nom de `CATALOGUE` ou de `CATFOUR`.

Vérifié en navigateur sur la bêta, catalogue réel : semis 110 fiches toutes en `cat_*`, `cree:0`,
`_m:1` ; les cinq gammes fournisseurs ajoutées d'affilée → 2 867 produits, **0 doublon, 0 identifiant
`four_`, une seule empreinte ajoutée**, aucune erreur JavaScript ; la base d'ELAN rejouée →
220 / 110 doublons / 369 unités devient 110 / 0 / **369**. 140 vérifications automatiques vertes
(`test-625`, `test-pont`, `test-633`, `test-634`, `test-634b`, `test-version`).

**Courrier de la Tour — « ça ne marche plus » (10 septembre au matin)** : les routes vont bien (401
partout sur `api.teamop.fr`), le module `server/mail.js` se charge. Le serveur renvoie la cause
exacte par boîte (`erreur`) et un 502 avec message quand une boîte est injoignable ; la Tour jetait
les deux et affichait « Rien dans ce dossier ». Elle affiche maintenant un bandeau ambre avec la
raison. **Ce qui manque : la phrase que Justin lira dans ce bandeau** — c'est elle qui dit quoi
réparer (mot de passe d'application, serveur IMAP, boîte pleine). Pas d'accès SSH depuis la session.
Ensuite : refaire l'écran au niveau d'Apple Mail.

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

### Ce qui a été fait le 8 septembre 2026 — le repli est fermé (v575)

**La découverte qui a réduit le chantier.** L'identité par entreprise EXISTE déjà :
`tourEspaceDe()` fabrique un `t` et une clé `k` propres, le lien `#entreprise=CODE` les porte,
`teamopJoin()` les pose. Il n'y avait donc rien à construire — seulement deux replis à fermer
dans `app.html` : `syncTeam()` retombait sur `FB_TEAM='elan-gestion'`, et la synchro est
active par défaut. Un appareil qui ouvrait la page sans avoir suivi son lien atterrissait donc
dans un espace partagé, chiffré avec une clé publiée en clair sur GitHub Pages.

**Une seconde conséquence, restée invisible longtemps :** `equipeTeamOP()` teste
`syncTeam()===FB_TEAM`. Être sur le repli, c'était donc *être l'équipe TEAM OP* aux yeux de
l'application — assistant IA, planning de démonstration, choix des métiers, et la carte rouge
« Tout effacer et repartir à zéro ». Sur un appareil neuf, avec le compte `admin` / `1234` que
`migrate()` crée.

**Le correctif ne migre personne, et c'est le point.** On fige d'abord, on ferme ensuite :
un appareil qui vivait déjà sur le repli s'y voit inscrit noir sur blanc (même espace, même
clé, rien ne bouge) ; un appareil neuf ne synchronise avec RIEN tant qu'il n'a pas suivi son
lien. La mesure de « qui est sur le repli » devient donc inutile pour publier — elle ne sert
plus qu'à savoir qui reste à déplacer, tranquillement.

⚠️ **Le piège du correctif, mesuré et pas deviné.** Le tout premier chargement écrit six clés
`elan*` (`elan_prod_v1`, `elan_gestion_v2`, `elan_vierge_v1`, `elan_prod_v2`, `elan_fours_v1`,
`elan_seen_version`). Un test « le stockage contient-il une clé elan ? » rendait donc un
appareil neuf « déjà vu » dès son SECOND chargement — le correctif n'aurait tenu qu'une seule
ouverture de page. D'où `elan_repli_v1`, qui gèle le verdict rendu au premier démarrage de la
v575, seul instant où le stockage reflète encore ce que l'ancienne version avait laissé.

Éprouvé en navigateur sur `beta.html`, quatre cas : appareil neuf (rechargé deux fois, reste
non rattaché), appareil de l'ancienne version (espace et clé identiques à avant), entreprise
rattachée type ELAN (intacte), appareil neuf suivant un lien (rattaché correctement).

**ELAN ne perdait rien de toute façon** — condition posée par Justin. Sa fiche affiche
`espace elan-34oc` et « 🔐 Clé propre » : elle a son espace et sa clé depuis le début.

**Ce qui reste après ça :** déplacer les entreprises que le compteur « à migrer (clé
partagée) » de la Tour désigne encore, puis seulement là, fermer `/api/replies` et
`/api/mailboxes` sur la preuve de clé.

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

## Journée du 8 septembre 2026 — huit lots partis depuis le terrain (v576 → v584)

Justin était **chez ELAN**, et a signalé les gênes au fur et à mesure. Tout est publié et
vérifié sur les fichiers réellement servis. Aucun de ces lots ne touche `server/`.

| Version | Ce qui était cassé, et la vraie cause |
|---|---|
| **v576** | À chaque mouvement de stock, la synchro renvoyait à la liste des box. Une vue de DÉTAIL n'est pas `views[current]` : `views.boxes()` rend la liste. Chaque détail dépose désormais de quoi se redessiner (`ecranDetail`/`refreshEcran`). Corrige aussi fiches client, interventions, chantiers. |
| **v576** | Le tableau de bord affichait planning, produits à commander, demandes et bons à qui n'a pas la rubrique — la règle ne valait que pour les cartes du haut. |
| **v577** | « Je clique et ça marche pas » sur la barre d'onglets. Le **toast** masqué n'est pas retiré : `translateY(120px)` le pose EXACTEMENT sur la barre (mesuré à 390 px : toast 773–818, barre 786–844). Trois onglets sur cinq morts, en permanence. `pointer-events:none`, sauf « ↩︎ Annuler ». |
| **v577** | Notifications dans le désordre : `dateValidation` ne porte qu'une date, donc toutes les décisions du jour étaient horodatées à midi. `tsValidation` posé à la décision. |
| **v578** | Deux systèmes de permissions qui se contredisaient. La fiche n'enregistrait QUE ce qui différait du rôle : cocher une case déjà vraie pour le rôle n'écrivait rien, et l'accès changeait plus tard sans que personne n'ait rouvert la fiche. **La fiche fait loi.** Progressif : un compte jamais enregistré suit le rôle comme avant. |
| **v579** | Sélection multiple de produits dans une box. Le lot existait déjà (`boxMvtAttente`) ; ce qui manquait c'était de DÉSIGNER plusieurs produits. La liste rappelle `boxAdj` en silence (`_boxLotSilence`) — la règle « DR ou pas » n'existe donc toujours qu'à un endroit. |
| **v579** | **On pouvait descendre sous zéro.** Le garde-fou lisait le stock ACTUEL ; avec validation DR le stock ne bouge qu'après l'accord, donc deux taps sur 1 unité donnaient −2 en attente. `boxDispoU()` compte ce qui est déjà en attente. |
| **v580** | Demande d'ELAN : leurs DR voient les commandes et le PDF pour comparer à l'arrivage, sans en passer. Droit « Bons de commande : consultation seule ». Sept portes verrouillées au niveau des FONCTIONS, pas des boutons. |
| **v580** | L'adresse d'envoi d'un bon ne se voyait qu'après l'aperçu, dans une fenêtre à part. L'aperçu porte maintenant « Expéditeur » à côté de « Destinataire », modifiable, et le choix est rangé sur le bon. |

⚠️ **Deux pièges à ne pas réintroduire**, tous deux attrapés en mesurant avant publication :

- **Un droit nouveau doit être écrit dans le sens qui préserve l'existant.** `CAPS` met tous
  les rôles à zéro : un droit « peut créer des bons » aurait valu NON par défaut et retiré la
  création à tous ceux qui l'ont, sans que personne n'ait rien décoché. D'où
  `bonsLectureSeule`, formulé en négatif.
- **`userCap()` répond OUI à TOUT pour un administrateur.** Sur un droit inversé, ce oui
  devient « il est en consultation seule » — l'administrateur perdait la création de bons.
  Tout droit écrit en négatif doit traiter l'administrateur à part.

**Ce qu'ELAN doit faire pour en profiter** : cocher « Bons de commande : consultation seule »
sur la fiche de chaque DR (Utilisateurs → ✎), et leur donner la rubrique « Commandes en
cours ». Rien n'est activé d'office.

### Le soir du 8 septembre — v581 à v584

| Version | Ce qui change |
|---|---|
| **v581** | « Repartir sur une base propre » : remise à zéro à la carte, huit lignes, sauvegarde `.json` téléchargée avant. Box, produits, fournisseurs, comptes et réglages ne sont JAMAIS touchés. |
| **v582–583** | La liste de prélèvement se compose en tapant sur − et ＋, reste en brouillon, et ne part au DR qu'au « Valider ». Un DR peut donner la main pendant ses congés (dates, remplaçant, trace dans les deux historiques, extinction automatique au retour). |
| **v584** | **On peut ÉCRIRE la quantité.** Le chiffre entre − et ＋ était un `<b>` : rien à toucher, dix taps pour dix unités. Il devient un bouton qui ouvre « Combien ? » — on écrit le nombre, on choisit le sens, et les DEUX issues sont écrites avant de valider. Un seul mouvement de −10 au journal, pas dix de −1. |
| **v584** | La liste s'ouvre en grand : chaque ligne porte son nombre écrivable, son sens, ce qu'il restera, et on ajoute un autre produit de la box sans fermer. Jamais sous zéro, même au clavier — on plafonne et on le dit. |
| **v584 → 585** | **« Permissions » quitte le menu, et les droits se règlent dans la liste.** Il n'y avait pas deux systèmes de droits : il y avait deux ENDROITS pour régler le même, d'où « il faut valider dans les deux ». En v585, le dépliage d'un compte dans Utilisateurs EST l'éditeur : catégorie par catégorie, menus, ＋ Ajouter / ✎ Modifier / 🗑 Supprimer, droits spéciaux, « Autres droits » (ceux qu'aucune catégorie ne porte — dont « consultation seule des bons »), box — et un « Valider ses droits » en bas. **La fiche (✎ Modifier) ne porte plus aucun droit** : identité, rôle, rattachements. `saveUser` recopie `acces` tel quel — sans ça, changer un e-mail effacerait tous les droits, puisque la boucle lisait « case absente » comme « refusé ». Le rôle n'est qu'un nom choisi à la création, et un point de départ. Pas de bouton « par rôle » : Justin n'en veut pas (`views.permissions` reste atteignable par `#v=permissions`, sans entrée). |
| **v584** | « Mes demandes » et « Historique demandes » ne font plus qu'un écran, deux onglets, historique replié par mois. |
| **v584** | Congés DR : le remplaçant voit AUSSI les box de l'absent, aux dates de la délégation. Valider un mouvement sur un stock qu'on ne peut pas ouvrir, ce n'était pas valider. |

| **v586** | Le panneau de la box n'a plus de « Valider » : il invite à ouvrir la liste, et c'est la liste qui engage. Valider depuis le panneau sautait l'étape de relecture qu'on venait de créer. |
| **v586** | Droit **« Responsable des bons de commande »** (`respBons`) : prévenu dès qu'une demande validée devient un bon à préparer, et ses bons en attente dans sa cloche. Lu sur `acces.caps.respBons===true` et non sur `userCap()` — qui répond oui à tout pour un administrateur, ce qui aurait prévenu tous les admins de tous les bons. |
| **v586** | **Bons de remise optionnels** (`db.bonsRemiseOff`, interrupteur d'entreprise dans Paramètres, tracé au journal). Coupé : plus de question « pour qui ? », plus de bon écrit ; le stock bouge pareil. |
| **v586 · Tour** | **Les groupes du registre se replient.** Mesuré au banc à 390 px : l'Accueil faisait 2 405 px — six écrans. Règle unique, mesurée et non devinée : le premier groupe reste ouvert, et parmi les suivants seuls ceux qui dépassent 300 px se replient sur leur titre (qui porte déjà nom et compte). Un tap ouvre, et le choix est retenu par groupe dans `tour_plis_v1` — après un tap, c'est la préférence de Justin qui décide. Accueil 2 405 → 1 354 px (−44 %) ; total des dix écrans −12 %. Trois écrans qui ne replient rien gagnent ~130 px : c'est le prix des titres à 44 px, devenus des cibles tactiles. `regPliage()` est accroché à `renderVue()` — le seul entonnoir : accroché à `render()`, il ne s'appliquait jamais lors d'un changement d'onglet, car `renderAnime()` court-circuite `render()`. |

| **v587** | **Le sens d'une ligne ne se déduit plus du nombre.** Il se lisait sur le signe de `du` ; à zéro il n'y a pas de signe, donc `0 <= 0` renvoyait toujours « Je retire » : toucher « J'ajoute » écrivait `+1 × 0 = 0` et le redessin rallumait « Je retire ». Bloqué — et précisément sur un produit à 0 en stock, où « je retire » est le seul sens impossible. Le sens est désormais porté par la ligne (`l.sens`), survit au zéro et se change à vide ; les lignes d'avant retombent sur leur signe. Une ligne restée à zéro ne part plus au DR : c'est une intention abandonnée, pas une demande. |

| **v588** | **Un DR voit les bons de ce qu'il valide, plus seulement des box qu'il voit.** Question de Justin : « le DR ne voit que ce qui est prévu pour les box qu'il valide ? » Mesuré : non — la règle était « les box qu'il VOIT », plus les bons signés de sa main. Un bon né d'une demande de quelqu'un de son périmètre, sur une box qui ne lui est pas rattachée, lui échappait. Troisième porte ajoutée à `visibleBons` : le lien passe par le DEMANDEUR (`b.demandeId` → `d.chefId` ∈ `drPerimetre`) et non par `faitPar` — pendant des congés c'est le remplaçant qui signe, et le titulaire n'aurait jamais revu la commande à son retour. |

| **v590** | **On peut retirer UNE box à UNE personne**, même quand elle est visible par toute l'équipe. Le réglage n'était qu'additif : les box ouvertes d'office (`visibleTous`, fiche technicien, responsable) affichaient un badge « Voit » verrouillé, impossible à décocher. D'où `userIdsExclus`, une liste d'exceptions rangée sur la box comme le reste de sa visibilité. On n'écrit que ce qui s'écarte du défaut — rien dans `userIds` pour une box déjà ouverte à tous, rien dans `userIdsExclus` pour une box qu'il n'avait pas — sinon chaque validation gonflerait les deux listes de toutes les box. L'exception passe AVANT toutes les portes, délégation comprise : une box retirée ne revient pas parce qu'un collègue part en congés. Elle s'affiche des deux côtés — « retirée à cette personne » sur sa fiche, « Retirée à » sur celle de la box. |

| **v591** | **La mise à jour s'applique toute seule.** « J'ai peur qu'à cause de ce bouton-là, beaucoup de gens évitent de le faire » — et le dossier d'ELAN le prouvait : six appareils, six versions, dont un trente-six versions en arrière. Le bouton n'était pas une sécurité, c'était un barrage. On recharge désormais sans rien demander, mais SEULEMENT quand il n'y a rien à perdre : application en arrière-plan, ou au premier plan mais au repos (aucune fenêtre ouverte, aucun champ en saisie, plus un geste depuis 25 s). Le bandeau reste pour qui veut la version tout de suite. Contrôle toutes les 15 min et à chaque retour au premier plan (au lieu d'une fois par heure), avec 5 min de garde. Garde anti-boucle dans `sessionStorage` : une seule tentative automatique par heure, sinon une version fraîche identique à l'affichée rechargerait sans fin. |

| **v592** | **Le DR compare le bon de commande et ce qui est arrivé.** Il validait une réception sur UNE ligne de résumé — « Arrivage ARMOSA, 84 produits » — sans jamais voir ce qui avait été commandé : signer, pas contrôler. Un tableau commandé / reçu / écart s'affiche sous la ligne de validation, et reste sur la fiche du bon après coup (le mouvement garde son statut au lieu d'être effacé). Les deux côtés ne comptaient pas pareil : un bon compte en cartons ET en unités, un arrivage en unités — tout est ramené aux unités de stock par `bonLU`, sinon « 5 cartons » contre « 60 unités » passerait pour un écart de 55. Un écart n'empêche pas de valider : le stock est crédité du REÇU. Et une commande envoyée dit « en cours de livraison depuis N jours » tant que l'arrivage n'est pas noté. |

| **v593** | **Une équipe passe d'une version à l'autre ensemble.** Le contrôle de la v591 interroge le réseau toutes les 15 min : déjà sans bouton, mais un quart d'heure peut séparer deux appareils — et c'est exactement l'écart qui fait travailler une équipe sur des versions différentes. La version voyage donc AVEC les données (`ver` en clair dans le document de synchro) : recevoir un instantané écrit par une version plus récente, c'est apprendre qu'une mise à jour existe, à la seconde. Le premier appareil qui passe entraîne les autres. Deux garde-fous : production et bêta ne se comparent jamais, et seule une version STRICTEMENT plus haute compte — sinon un appareil en retard ferait redescendre les autres. Le rechargement reste soumis aux conditions de la v591. |
| **v593** | **Les bons de commande se rangent par box, puis par mois.** Nouvel onglet, devenu le rangement par défaut : devant un historique, la question n'est pas « qu'est-ce qui est parti chez ARMOSA » mais « qu'est-ce qui est parti pour CETTE box, et quand ». Mois repliés, le plus récent ouvert, « Sans box » en dernier. Les trois autres rangements (Liste, Par site, Par fournisseur) restent à un tap. |

| **v594** | **Le bon de commande et le bon de livraison sont rangés ensemble.** « Comme ça on sait qui correspond à quoi. » Le chef photographiait déjà le bon de livraison à l'arrivage, mais personne ne la revoyait : elle dormait sur le mouvement. La vignette s'affiche maintenant DANS le bloc de comparaison — donc sous les yeux du DR au moment de valider, et sur la fiche du bon pour toujours. Quand aucune photo n'a été prise, c'est écrit en ambre plutôt que tu : un contrôle sans pièce jointe doit se voir. |

| **v595** | **Un seul chemin pour réceptionner : l'Arrivage.** Il y en avait deux — le bouton « Réceptionner » et « Arrivage » sur la box — et un seul acceptait la photo du bon de livraison. Justin l'a vu en une capture. L'Arrivage faisait déjà tout ce que faisait l'autre (il propose la commande, préremplit les quantités converties en unités par `arrBonPrefill`) plus la photo : le bouton disparaît de la carte de la box et de la fiche du bon, remplacé par la marche à suivre. `bonReception()` reste mais refuse et renvoie vers l'Arrivage — une adresse en mémoire ou la console pourraient encore l'appeler, et une réception sans photo rouvrirait le trou qu'on vient de fermer. À supprimer avec `recLignes` / `recRefresh` / `applyReception` au prochain ménage. |

| **v596** | **Correctif de la v593 : l'appareil à jour annonce sa version sans attendre d'écrire des données.** `syncPush` ne part que depuis `save()`, donc depuis une vraie modification : un appareil mis à jour qui ne touchait à rien n'entraînait personne, et l'équipe restait en arrière jusqu'à ce que quelqu'un bouge une quantité. `majAnnoncer()` écrit LE SEUL champ `ver` (`set({ver},{merge:true})`) au premier instantané : ni le bloc chiffré, ni `ts` — les autres lisent le numéro, et leur garde `d.ts <= _syncTs` les empêche de réappliquer des données inchangées. On n'annonce que si l'on est DEVANT (sinon un appareil en retard ferait redescendre l'équipe), jamais entre canaux, et une seule fois par session. |

| **v597** | **Tout l'historique des commandes d'une box derrière un bouton, et la fiche du bon en consultation.** « On voit historique de commande du box, on clique dessus, on a tous les bons de commande avant, les réceptions et les bons de livraison. Ça évite trente-six mille choses. Comme ça, personne n'a accès aux bons de commande. » Cinquième bouton sur la box (avec le compte), écran replié par mois, chaque ligne portant la vignette du bon de livraison — ou « sans photo » en ambre. La liste « Commandes passées » quitte la page de la box : elle vivait au milieu du stock, elle vit maintenant derrière son bouton. Et `ficheBon(id, true)` ne montre QUE le PDF : Recommander, Modifier, Email fournisseur, Partager, CSV appartiennent à qui passe les commandes, pas au terrain. Le menu « Bons de commande » garde la fiche complète. |

| **v598** | **Le bouton « Mettre à jour » revient — décision de Justin après l'avoir essayé sans.** « Remets le bouton, c'est plus sûr, et s'ils ne la font pas ça leur met un message toutes les dix minutes. » Le rechargement automatique de la v591 ne franchissait jamais une saisie, mais il décidait à la place de quelqu'un sur un outil de travail. ⚠️ **Ce n'est PAS un retour à la case départ** : ce qui bloquait au matin, ce n'était pas le bouton, c'était de ne jamais savoir qu'une version existait. Les trois canaux d'information restent — contrôle toutes les 15 min et au retour au premier plan (v591), version qui voyage avec la synchro (v593), annoncée dès l'ouverture (v596) — et l'insistance remplace l'automatisme : le bandeau REVIENT toutes les dix minutes, et affiche depuis combien de temps il attend. Le fermer le repousse de dix minutes, il ne l'éteint pas. `majRisque`, le suivi des gestes et le repère `elan_maj_auto` sont supprimés, sans reste. |

| **v599** | **La couleur d'accent remarche — régression trouvée par Justin.** « Avant, quand on changeait les couleurs, ça changeait le thème total. » Cause arithmétique : les accents nommés vivent sur `html[data-accent="purple"]`, spécificité (0,1,1) ; la feuille de la refonte redéfinit `--acc` sur `html[data-refonte]`, (0,1,1) **aussi** — à égalité, le dernier écrit gagne, et la refonte est 2 300 lignes plus bas. Invisible à la mise en production de la refonte, puisque du vert écrasait du vert : le bug ne se voit qu'en choisissant une autre couleur. « Ma couleur » marchait encore car `applyTheme()` la pose en style INLINE, ce qui rendait le symptôme déroutant. Correctif : `html[data-refonte][data-accent]` (0,2,1), posé après, tout dérivé d'une seule teinte par `color-mix` — douze variables tenues à la main auraient laissé un bouton vert au milieu d'une interface violette. ⚠️ `--green` N'EST PAS repris : un badge « Validé » ou « Livrée » reste vert sous tous les thèmes. Une couleur qui porte une information ne se personnalise pas. |
| **v599** | **Le responsable d'une box est prévenu des commandes qui la concernent**, même sans droit de validation. `valideursPour()` ne l'ajoutait que s'il figurait déjà parmi les valideurs : un chef d'équipe responsable de sa box n'apprenait jamais qu'on commandait pour elle — alors que c'est lui qui reçoit le colis. Deux messages distincts, jamais confondus : « 🔒 à valider » est un ordre de travail pour le DR, « 📦 pour ta box » est une information. Il est aussi prévenu au DÉPART de la commande, le moment où l'on commence à attendre un colis. |
| **v599** | L'historique de la box devient **« Commandes & livraisons »** : le bouton ne se cache plus quand la box n'a encore rien (il se lisait comme une panne — vu par Justin sur une box d'ELAN), l'écran vide explique ce qui l'alimentera, et les **livraisons sans bon** (arrivages libres) s'y rangent avec le reste, par mois. Chaque commande est un **dossier** : le PDF du bon d'un côté, la photo du bon de livraison de l'autre, chacun ouvrable seul. Fermer la fiche d'un bon **revient à l'historique** au lieu de tout refermer. |

| **v600** | **Toutes les personnes rattachées à une box sont prévenues de ce qui la concerne**, pas seulement son responsable. Règle posée par Justin : « chaque personne assignée au box et rattachée au DR qui valide voit les bons de commande, l'historique, les notifications de tout ce qui les concerne ». ⚠️ NOMMÉMENT rattachées — responsable, personnes cochées, fiches techniciens : une box `visibleTous` est ouverte à l'entreprise entière, et prévenir tous ceux qui PEUVENT la voir reviendrait à notifier tout le monde à chaque commande. Les exclusions (`userIdsExclus`, v590) sont retirées de la liste : on n'envoie pas de nouvelles d'une box qu'on ne peut plus ouvrir. Mesuré : sur une box `visibleTous` avec responsable + coché + technicien + exclu + compte désactivé + étranger, les destinataires sont exactement les trois rattachés actifs, et l'auteur de la demande ne se notifie pas lui-même. |

| **v601** | **Les notifications : ordre corrigé et purge à deux heures.** L'ordre était déjà par horodatage décroissant depuis la v577, mais quand `tsValidation` manque (mouvement validé par une version antérieure), le repli plaçait l'événement à **midi** — donc sous tout ce qui s'était passé l'après-midi, alors qu'une validation est forcément postérieure au mouvement qu'elle valide. Repli passé à la fin de journée, borné à l'instant présent pour ne pas dater du futur. ⚠️ **Une purge automatique à deux heures a été demandée, écrite, puis RETIRÉE le soir même** (v602) : « oublie ce que je viens de demander pour les notifications, c'est pas une bonne idée ». Il a raison — sur un outil de terrain, quelqu'un pose son téléphone une demi-journée ; à son retour, ce qui a été validé ou demandé pendant ce temps aurait disparu sans qu'il l'ait jamais vu. **Une notification s'en va parce qu'elle a été LUE, ou parce que la situation est réglée. Jamais parce qu'elle a vieilli.** Ne pas la réintroduire sans y repenser. |

| **v603** | **L'administrateur peut tout effacer, et lui seul.** « Il n'y a que lui qui a tous les droits, et ce droit-là il ne peut pas le céder à quelqu'un d'autre. » Il passait déjà tous les garde-fous (`userCap` et `catDroit` renvoient vrai pour lui) : ce qui manquait, c'étaient les BOUTONS. Corbeille ajoutée sur chaque commande et chaque livraison de l'historique d'une box, et sur chaque ligne de l'historique des demandes. ⚠️ **Le test porte sur le RÔLE (`role==='admin'`), pas sur un droit.** Partout ailleurs une suppression demande `canCat(groupe,'supprimer')` — un droit qui se coche, donc qui se donne. Ici, aucune case d'aucun écran n'accorde ce pouvoir : le seul moyen de le transmettre est de faire de quelqu'un un administrateur, un changement de rôle visible dans sa fiche. Mesuré : un DR avec TOUS les droits cochés ne voit aucune corbeille et la fonction lui refuse la main s'il l'appelle directement. Le stock déjà crédité n'est jamais retiré — le dire dans la confirmation, comme `delArrivage`. |

| **v604** | **Corbeille sur « Commandes en cours », et remise à zéro de la consommation** — toutes deux réservées au RÔLE administrateur, comme la v603. ⚠️ **La consommation n'est pas une collection à elle** : elle se calcule sur `db.mouvements`, le même magasin que « Mouvements stock ». La vider vide donc les deux écrans, et la confirmation le dit AVANT le clic, pas après. Les quantités en stock ne bougent pas — on efface l'historique de ce qui a été pris, pas ce qui reste dans les box. Double confirmation, tracée au journal. Le geste existait déjà dans « Repartir sur une base propre » (Paramètres) ; personne n'allait chercher dans les réglages le bouton qui vide l'écran qu'il a sous les yeux. |
| **v605** | **Livraison partielle, et le nom de qui reçoit le matériel** — deux retours d'ELAN le 9 septembre 2026, tous deux reproduits en navigateur avant d'écrire une ligne de correctif. ① « Même s'ils reçoivent moins, ils doivent quand même valider et réceptionner ce qu'ils ont. » La PREMIÈRE réception refermait le bon (statut « livrée »), quelle que soit la quantité arrivée — et la chaîne cassait en trois endroits, tous silencieux : le bon quittait la liste de l'arrivage suivant, `boxMvtValider` REFUSAIT le reliquat (« bon déjà réceptionné » — le geste n'était pas seulement bloqué, il était **annulé**), et plus personne ne pouvait lire ce que le fournisseur devait encore. Pire, le champ de quantité portait `min="1"` et `Math.max(1,…)` : taper « 0 » pour un produit non livré affichait 0 et **enregistrait 1** — la box était créditée d'une unité que personne n'avait livrée. Nouveau statut **`partielle`**, cumul de toutes les livraisons d'un bon (`bonRecuCumul` / `bonResteDu`, produit par produit — un surplus de gel ne compense pas un manque de pièges), minimum à zéro, préremplissage par le **reliquat** et non par la commande entière, et « reste dû » écrit partout où le bon apparaît. ⚠️ `partielle` a dû être ajouté aux **cinq** listes de statuts « en cours » (compteur du tableau de bord, encart de la fiche box, écran Commandes en cours, fiche du bon) — sans quoi le correctif aurait fait **disparaître** les commandes partielles, exactement la disparition corrigée la veille. ② « Quand on donne du matériel, on écrit les noms, mais les noms ne s'affichent pas dans les mouvements. » La question « pour qui ? » n'existait que sur le chemin de la **validation DR**. L'administrateur et les DR ne passent pas par là — leur geste s'applique au tap — et ce sont précisément eux qui distribuent : leurs sorties partaient avec `donneA` vide, la colonne « Donné à » à moitié muette, et la consommation portée au compte de celui qui ouvre la box plutôt qu'à celui qui repart avec les produits. Même question sur le chemin direct, **une fois par box et par visite** (pas à chaque tap : dix produits pour la même personne, c'est une question, pas dix), la liste des personnes proposée sans être imposée (on remet aussi du matériel à un intérimaire), un bandeau permanent « les sorties de cette box vont à … » avec son bouton *Changer*, et `openBox` qui oublie le destinataire — rouvrir la box est un nouveau geste, souvent pour quelqu'un d'autre. Le bon de remise s'écrit des deux côtés : même acte, même trace. |
| **v606** | **Le catalogue fournisseurs ne manquait de rien — il était juste impossible à parcourir.** ELAN, 9 septembre 2026 : « il manque la poudre 5 kg, les pièges, les punaises… et chez MABI il manque les bâches ». **Vérifié le jour même contre les sites des fournisseurs : rien ne manquait.** Les 527 fiches du plan de site d'ORCAD correspondent toutes à une entrée de `CATFOUR` (les 33 sans correspondance immédiate n'étaient que des variantes de nom de leurs URL) ; les 5 bâches de shop.mabi.fr y sont, aux mêmes noms ; « bache » (avec ou sans accent) donne 5 résultats, « punaise » 28, « piege » 153, « poudre » 53. La poudre fourmis Vulcano existe en 200 g, 500 g et **6 kg** — pas 5 kg : ce format n'existe pas chez ORCAD. ⚠️ **La leçon est celle du nom qui ment, appliquée à l'inverse : un utilisateur qui ne trouve pas conclut que ça n'existe pas, et il a raison de le dire — c'est l'écran qui avait tort.** Deux défauts, tous deux dans `renderFourCat` : la liste s'arrêtait à **80 lignes sans aucun moyen d'afficher la suite** (filtrer sur MABI, 603 références, en montrait 80 et répondait « affine la recherche »), et le bouton « ＋ Tout ajouter » **disparaissait au-delà de 300 résultats** — donc exactement quand on veut poser la gamme entière d'un fournisseur, le seul cas où il sert. Corrigé : pagination par 120 (« Afficher 120 de plus — il en reste 403 »), bouton d'ajout groupé sans plafond avec confirmation nommant le nombre au-delà de 60, et un compte qui distingue *ce que la recherche trouve* de *ce qui manque encore à ce catalogue-ci* (« 498 produit(s) · 498 pas encore chez toi », puis « déjà tous chez toi »). Mesuré : les 498 références ORCAD posées en 19 ms, écran Produits rendu en 3 ms avec 503 produits, relance sans doublon. ⛔ **Rien n'a été ajouté au code pour ELAN** : leurs produits vont dans leur espace chiffré via cet écran, jamais dans `CATFOUR` — figer la gamme d'un client, c'est la faute de `REPORT_TEMPLATES`. |
| **v607** | **Les cinq fournisseurs revus un par un, et les prix retirés du catalogue.** ① Contrôle contre les sites, le 9 septembre 2026 : ORCAD 527 fiches — **rien ne manquait** (déjà vérifié en v606) ; MABI 609 — rien de neuf, les 18 écarts étaient des variantes d'orthographe ; **ARMOSA 56 absents**, **ENSYSTEX 40**, **SODIF 20** — soit **116 références ajoutées**, catalogue porté de 2 709 à 2 825. Méthode : plan de site quand il existe (ORCAD, MABI, ENSYSTEX — chez ce dernier le `<image:title>` porte le nom exact, ce qui évite d'ouvrir 900 fiches), sinon parcours des rayons (ARMOSA, 67 pages) ; comparaison par jetons normalisés, puis relevé du nom exact pour chaque écart. Les libellés de catégorie sont **réutilisés mot pour mot** depuis ceux déjà en place — jamais une seconde orthographe à côté de la première. Écarté au passage : « MONTANT A REGLER », « Aucune image disponible », « product_test » et les intitulés de rayon ramassés avec les vignettes. ② **Les prix ne sont plus notre affaire** (décision de Justin) : les **1 965 tarifs** relevés en juillet sont effacés du catalogue, l'écran n'en affiche plus, et rien n'est posé sur les fiches ajoutées. Le champ `prix` reste — chaque entreprise y met le sien. ⚠️ Les prix DÉJÀ posés vivent dans l'espace chiffré des clients : on ne peut pas les retirer à leur place. Un bouton **« 💶 Effacer les prix (n) »** apparaît donc sur l'écran Produits, réservé au **rôle** administrateur et visible seulement s'il y a quelque chose à effacer. Argument qui a tranché : le site d'ORCAD affiche lui-même en tête « NOS TARIFS NE SONT PAS À JOUR / CE SITE N'EST PAS MARCHAND » — un tarif se négocie, change, et diffère d'un client à l'autre. |
| **v608** | **La liste produits d'une box passe à l'ordre alphabétique.** Demande de Justin, 9 septembre 2026 : « les produits dans l'ordre alphabétique, mais les produits en stock restent en haut pour ne pas avoir à aller chercher ». Le tri descendait par QUANTITÉ, puis par état (en stock / à commander / épuisé) — deux inconvénients qui se cumulaient : on ne pouvait pas retrouver un produit dont on connaît le nom (il fallait lire ligne par ligne), et **l'ordre changeait à chaque mouvement**, si bien que la ligne qu'on venait de toucher se déplaçait sous le doigt. Désormais **deux niveaux, pas un de plus** : ce qu'il reste dans la box (cartons compris, via `qteDe`) au-dessus de ce qui est à zéro, puis l'alphabet à l'intérieur de chaque groupe. ⚠️ `localeCompare(…,'fr',{sensitivity:'base'})` et non le `localeCompare()` nu : sans lui « AÉROSOL » se range après « Z » et « avidust » ouvre un second alphabet en bas de liste. Mesuré sur les produits de la capture : ADVION · ADVION (démo) · AÉROSOL DE DÉTECTION · AÉROSOL MEGASHOT · ALTA · ARMOCLEAN · Écran · ÉTIQUETTE · ZINC, puis les trois à zéro dans le même ordre. L'état (En stock / À commander / Épuisé) reste écrit sur chaque ligne — il informe, il ne classe plus. Un stock qui bouge ne réorganise plus l'écran ; seul le passage à zéro le fait. |
| **v609** | **Doublons du catalogue fusionnés, et VULCANO PG 5 kg ajouté.** ① Question de Justin : « dans les produits il y a des doublons ou pas ? » — oui, 17. ⚠️ **Et ils venaient des sites des fournisseurs eux-mêmes**, pas d'une négligence de notre côté : ARMOSA publie « TEENOX EC » ET « TEENOX® EC », « PIEGES BULLET ET ROTECH® A TAPETTE » ET « Piège BULLET à tapette - ROTECH® » ; ORCAD publie `piege-dente-rat` ET `piege-dente-rats`, `vulcano-tapette` ET `vulcano-tapette-rats`. Le catalogue les recopiait fidèlement. **12 fusions établies une par une** (le nom conservé est celui du site quand il tranche, sinon le mieux composé) + **5 doublons stricts** retirés → 2 825 → 2 808. ⛔ **Laissés en place volontairement** : tout ce qui se distingue par un « + », un suffixe de version (V18 / V18 S, INOVNET / INOVNET A.L, TOBAGUARD EE / LS-EE) ou un conditionnement — ce sont des produits distincts, pas des orthographes. Et les 9 cas « même produit, deux fournisseurs » restent deux lignes : chaque ligne de `CATFOUR` porte UN fournisseur, et c'est ce qui permet de commander chez l'un ou chez l'autre. ② **« VULCANO PG POUDRE INSECTICIDE 5KG » ajouté.** J'avais affirmé deux fois que le 5 kg n'existait pas chez ORCAD ; **c'était faux**. Justin a photographié le seau : VULCANO PG, poudre insecticide volants + rampants, 5 kg, distribué par ORCAD, fabriqué par ZAPI. Le produit n'est simplement **pas publié** sur leur boutique — il n'apparaît dans aucune des 527 fiches du plan de site. **La leçon, à retenir pour tout futur contrôle : le site d'un fournisseur n'est pas son catalogue.** Un relevé web dit ce qui est publié, pas ce qui est vendu ; ce que les équipes ont dans le camion fait foi contre ce qu'affiche la boutique. |
| **v610** | **Profils de droits, pont vers le catalogue, et un piège désamorcé.** ① **Profils préremplis** — demande de Justin : « il met chef d'équipe et tout se met automatiquement, ils n'ont pas besoin de tout sélectionner à chaque fois ». Depuis que les droits se cochent dans la liste (v585), créer un compte ne les pose plus : 79 interrupteurs à la main par personne, et au troisième technicien on renonce. Un profil est une **photo des droits**, nommée par le métier réel (« Technicien 3D », « Chef d'équipe Nord »), enregistrée depuis la ligne de quelqu'un qui a déjà les bons droits, puis proposée **à la création d'un compte** et applicable depuis n'importe quelle ligne. ⛔ Trois décisions qui tiennent ensemble : un profil porte les **menus et actions, jamais les box** (une box dépend du secteur, pas du métier — la poser par profil rattacherait un nouveau à des box qui ne sont pas les siennes, en silence) ; appliquer **coche sans enregistrer**, on relit puis on valide ; et le **rôle reste le rôle** (fiche technicien, valideurs, administrateur) — le profil ne le remplace pas, il l'habille. Mesuré : profil créé à 40 menus / 32 droits, compte neuf créé avec, application depuis une ligne (41 → 73 cases cochées, **rien en base avant Valider**), un DR ne voit pas la barre et se fait refuser. ② **Pont Produits → catalogue** — « j'ai toujours pas les bâches », dit deux fois. Elles ÉTAIENT là, dans le bon catalogue mais le **mauvais écran** : « Produits » cherche dans SA liste, les 2 809 références vivent derrière 🏭 Fournisseurs, et rien ne le dit au moment où l'on cherche. **On cherche, on ne trouve pas, on conclut que ça n'existe pas — et on a raison de le conclure.** La recherche qui échoue va désormais voir dans le catalogue et propose d'ajouter ce qu'elle y trouve, sans changer d'écran. Mesuré : « bache » → « 5 produits dans les catalogues fournisseurs · Chez MABI » → un clic → dans sa liste, sans prix, et le pont disparaît. ③ **Le bouton « Retirer la simulation » n'est plus réservé à la bêta.** Il portait le même test que les boutons qui POSENT la démo : des données de démonstration arrivées dans un espace de production (par une sauvegarde .json reprise de la bêta) y seraient restées visibles et **ineffaçables**. Poser reste bêta, retirer est partout. |
| **v611** | **La création d'un compte se fait enfin d'un seul écran.** Justin, 9 septembre 2026 : « il met son nom prénom, identifiant, e-mail, mot de passe, il choisit un rôle, en dessous le profil des droits, plus bas à quel chef d'équipe il est rattaché, quel DR. Est-ce qu'il doit voir un box ? Il clique sur box et il doit voir QUE ce box. » Tout y était **sauf les box** : on créait le compte, puis il fallait rouvrir sa ligne pour les lui ouvrir — deux écrans pour un geste, et la seconde moitié oubliée en pratique. Bloc **📦 Box qu'il ouvre** ajouté à la création, et l'ordre des sections remis dans la séquence dictée : identité → rôle → profil → fiche technicien → rattachements (validation DR, chef, DR) → box → mot de passe (l'encart des rattachements arrivait APRÈS le mot de passe). ⚠️ Le bloc se **cache tout seul** si le profil choisi porte « Tout voir » : la question n'a alors plus d'objet, et un écran qui demande de cocher ce qui sera de toute façon ouvert apprend à ne plus lire. ⛔ Il n'apparaît **qu'à la création** : les box d'un compte existant se règlent sur sa ligne, où l'on voit d'où vient chaque ouverture — deux endroits pour le même réglage, c'est exactement la faute corrigée en supprimant l'écran « Permissions ». Décocher une box `visibleTous` pose une **exception** pour cette personne seule (`userBoxVoit(...,false)`, v590). Mesuré : profil « Technicien 3D » + chef + DR + Box Sud seule cochée → le compte voit **Box Sud uniquement**, Box Nord (ouverte à toute l'équipe) lui est fermée, sa fiche technicien est créée. ⚠️ Deux artefacts d'essai rencontrés, ni l'un ni l'autre des défauts du code : `_modalForcee` resté armé (le script saute l'écran de mot de passe obligatoire) et `planPlaceLibre()` faux (limite de sièges de la base d'essai). |
| **v612** | **Un profil se crée sans partir de personne — bouton « 🎛 Profils » à côté de « ＋ Utilisateur ».** Justin, 9 septembre 2026 : « dans Utilisateur il y a ＋ Utilisateur, et à côté je veux un bouton : créez votre profil, on clique, on met profil pour un technicien, on coche ce qu'il voit et ce qu'il ne voit pas, tac tac tac. » La v610 ne savait fabriquer un profil que **depuis la ligne de quelqu'un déjà bien réglé** — inutilisable le jour où l'entreprise démarre et où personne ne l'est. L'éditeur réutilise la **même grille** que la ligne d'un utilisateur (`usrDroitsHtml` posé sur un compte fictif `__profil__`) : une seule grille à maintenir, et ce qu'on coche ici se relit exactement pareil là-bas. Un menu « partir des droits de base de » recharge la grille depuis un rôle — ⛔ **ce rôle ne part PAS avec le profil** : il ne sert qu'à préremplir, le vrai rôle se choisit à la création du compte et ne change jamais ensuite. Le bloc des box, le résumé et les boutons de validation sont retirés de la grille (ils n'ont pas de sens pour un modèle). Mesuré : profil parti des droits d'un chef d'équipe (71 cases), Ventes décochées, stock/demandes/boîte mail cochés → enregistré à 36 menus · 31 droits, **sans aucune box**. |
| **v613** | 🔴 **PANNE CORRIGÉE — des comptes disparaissaient, et les gens restaient dehors.** ELAN, 9 septembre 2026 : « ils ont créé des utilisateurs, ils ne les voient plus dans leur liste, et les personnes à qui ils ont envoyé les codes ne peuvent pas se connecter. » ⚠️ **CAUSE, lue dans le code et non supposée : la synchro est du dernier-qui-parle sur TOUTE la base.** `syncPush` écrit `JSON.stringify(db)` en entier, et la réception fait `db=remote` en bloc — aucune fusion. Les six appareils d'ELAN tournaient sur QUATRE versions (v604 à v612) : il suffit qu'un appareil resté en arrière (onglet endormi, hors ligne, vieille version) enregistre n'importe quoi pour que SA copie, sans les comptes créés ailleurs entre-temps, remplace celle de tout le monde. Et comme l'annuaire de connexion est déposé depuis `db.users`, un compte effacé de la base disparaît AUSSI de l'annuaire : le mot de passe provisoire envoyé par e-mail ne correspond plus à rien. **Deux symptômes, un seul défaut.** Correctif : les comptes sont **fusionnés dans les deux sens** — `syncPush` **relit le document avant d'écrire** et récupère ce qui a été créé ailleurs ; la réception réunit les comptes distants avec les locaux au lieu de les remplacer, et repousse si elle en a rattrapé. Pierres tombales `db.usersSupprimes` (bornées à 300) : sans elles, la fusion ferait revenir les comptes supprimés exprès. Éprouvé sur les quatre cas — 2 comptes en mémoire + 3 créés ailleurs → 5 ; une suppression tient ; sur un compte connu des deux côtés c'est la version distante qui gagne ; 500 suppressions → 300 gardées. ⛔ **CE CORRECTIF NE PROTÈGE QUE LES COMPTES.** Le même mécanisme peut encore faire perdre des box, des produits, des interventions — la fusion générale est un chantier à mener seul. On a commencé par ce qui enferme des gens dehors. **Récupération : tout appareil qui a encore les comptes manquants les remettra tout seul à sa première synchro en v613.** ② Au passage : **rôles libres** (créer, renommer, masquer, supprimer — `admin` protégé, 54 endroits en dépendent ; un rôle déclare seulement s'il crée une fiche technicien et s'il peut être chef), et **le menu de rôle retiré de l'éditeur de profil** — « le nom du profil désignera les permissions ». |
| **v614** | **Mise à jour automatique, véhicules désignables, et trois défauts de la v613 corrigés.** ① **La mise à jour se fait toute seule, mais jamais au milieu d'un geste.** Le 8 septembre l'automatique avait été retiré au profit du bouton ; la panne du 9 a montré le prix de ce choix — un bouton qu'une personne sur deux ne touche jamais n'est pas un contrôle, c'est une panne différée. On ne supprime pas la prudence, on la déplace : « occupé » se lit dans l'état réel de la page (fenêtre ouverte, curseur dans un champ, synchro en attente, scanner ou caméra, geste de moins de 8 s) et tant que l'une tient, on repasse dans 5 s. Libre : on pousse la synchro, on laisse 1,2 s, on recharge. Au retour, « ✓ Mise à jour installée — version N ». Mesuré : les cinq conditions détectées une par une, 0 rechargement pendant l'occupation, 1 une fois libre. ② **Véhicules désignables comme les box** (`userVehiculeVoit`, exceptions `userIds`/`userIdsExclus`, bloc à la création et sur la ligne). Mesuré : Tom voit son Kangoo par sa fiche ; on lui ouvre le Jumpy et on lui ferme le Kangoo → il ne voit plus que le Jumpy. ③ ⚠️ **TROIS DÉFAUTS DE LA v613, TROUVÉS PAR RELECTURE ADVERSE ET CORRIGÉS** — la fusion des comptes était juste sur les cas que j'avais éprouvés, fausse sur trois autres : **(a)** la repoussée ne partait que si la liste GRANDIT, donc une **suppression ne repartait jamais** vers le nuage et le premier appareil qui avait encore le compte le faisait revenir ; **(b)** `usersFusionner` donnait TOUJOURS raison au distant — juste à la réception, faux dans `syncPush` où le distant relu est plus vieux que la modification qu'on enregistre : renommer quelqu'un reculait tout seul. Le sens de priorité est devenu un paramètre ; **(c)** la fusion était conditionnée à `d.ts > _syncTs` — une horloge en avance la désactivait entièrement et l'appareil redevenait celui qui efface les comptes des autres. Elle est désormais inconditionnelle. Plus : un échec de fusion **n'applique plus** `db=remote` (laisser passer, c'était retomber en silence dans la panne d'origine), et le compte de démonstration pose lui aussi une pierre tombale. Éprouvé sur 9 cas, 9 réussis. ⛔ **LE RECHARGEMENT FORCÉ PAR LE SERVICE WORKER A ÉTÉ ÉCRIT PUIS RETIRÉ AVANT PUBLICATION.** La relecture a prouvé un **interblocage** : `await w.navigate()` dans le `waitUntil` de `activate` laisse le worker en « activating » et **bloque les fetch de toute l'origine — 5 min 7 s d'application morte**. Et deux pertes de données réelles : la clôture guidée d'intervention (signature du client, photos) vit entièrement en mémoire, et `_fbDoc.set()` n'est ni attendu ni acquitté. **Ne pas réessayer sans traiter ces trois points.** La mise à jour automatique ci-dessus atteint le même but sans ce risque, pour tous ceux qui sont en v613 ou au-dessus. |
| **v615** | **Un identifiant ne porte plus qu'un seul compte.** ELAN, 9 septembre 2026 : « il y a un compte admin en double ». ⚠️ **C'est une conséquence directe de la fusion de la v613, et il faut le dire tel quel :** elle réunit les comptes par **identifiant interne** (`id`). Or, pendant la panne, la même personne a été **recréée** sur un appareil qui ne voyait plus son compte — même login `@florent`, `id` différent. La fusion, faisant exactement son travail, a rapporté les deux. Ce n'est pas une donnée perdue, c'est une donnée en double : deux lignes identiques à l'écran, et un annuaire de connexion portant deux empreintes pour le même identifiant. `usersSansDoublonLogin` collapse donc par login à la fin de chaque fusion, en gardant le compte le plus **établi** — et l'ordre de préférence est écrit pour ne jamais enfermer quelqu'un dehors : **jamais celui avec lequel on est connecté** (le retirer déconnecterait séance tenante), puis celui qui a déjà choisi son mot de passe, puis celui qui porte une adresse e-mail, puis le premier venu. Les comptes **sans identifiant** ne sont jamais avalés, et une pierre tombale l'emporte toujours. Chaque fusion est tracée au journal (« Doublon d'identifiant fusionné »). Éprouvé sur 7 cas, dont celui d'ELAN dans les deux sens de priorité : 7 réussis. |
| **v616** | **La porte se ferme : plus d'appareil périmé qui écrase, plus d'appareil qui ne se met pas à jour.** Décidé avec Justin le 9 septembre 2026 après la perte des comptes d'ELAN — 7 de leurs 11 appareils étaient en vieille version, et chacun réécrivait toute la base toutes les deux minutes (battement de présence → `save()` → `syncPush`). Six pièces, qui se règlent depuis la Tour sans republier : **(1)** `sw.js` v815 note, page par page, si la copie en cache a été téléchargée sous *cette* version du service worker (`__frais__/`) ; une copie héritée d'un ancien cache n'est jamais fraîche, et une copie pas fraîche ne gagne plus la course de 2 s — le réseau a 15 s. C'est ce qui laissait un appareil en v557, 58 versions en arrière. Le téléchargement de « Mettre à jour » se lit en flux et remonte les octets. **(2)** `firestore.rules` : toute écriture dans `elan_teams` porte `verNum` (entier) ; en dessous de `teamop_config/version → min`, le nuage refuse (lecture toujours permise). Une version d'avant ce verrou n'a pas de `verNum` : elle passe tant que `min` vaut 0, plus jamais ensuite. ⚠️ **La règle se colle à la main dans la console Firebase** — tant qu'elle n'est pas collée, seule l'application se conforme au minimum, pas le nuage. **(3)** `app.html` : écran plein « Mise à jour en cours » avec barre ; sous le minimum, mise à jour obligatoire (45 s de grâce si quelqu'un saisit) ; `permission-denied` à l'écriture = version refusée ; **garde-fou du rétrécissement** (`syncManque`) — si le nuage connaît > 3 lignes ET > 20 % d'une collection que nous n'avons pas, on ne pousse pas : on reprend la base de l'équipe (comptes fusionnés, priorité locale), la nôtre part dans IndexedDB (`elan_cote`, 3 exemplaires, exportables depuis Paramètres → « Mis de côté ») ; les retraits voulus (série supprimée, bons groupés, remise à zéro, vidage bêta, import, nettoyage démo) s'annoncent par `syncRetraitVoulu()`. **Mode en ligne** : « le mode hors ligne crée trop de problèmes, on le supprime » (Justin) — écran « Connexion requise » dès que le réseau tombe, aucune écriture ne part hors ligne (le SDK la mettrait en file et l'enverrait au retour avec une base d'entre-temps — le mécanisme exact de la panne) ; coupure < 1 min sans écriture tentée → on reprend, sinon → rechargement. `dbWeight` compte enfin toutes les collections. **(4)** serveur : `versions.json` (`min`, `enLigne`), `GET /api/version` (public, un numéro et un mode), `GET /api/monitor/version` (qui est bloqué, par espace), `POST /api/monitor/version-min` (patron ; `min:'ligne'` = la version servie sur teamop.fr, lue une fois par quart d'heure) qui écrit aussi `teamop_config/version` par la clé admin ; `/api/espaces/comptes` refuse (426) un dépôt d'une version sous le minimum — c'est par là qu'un appareil périmé remplaçait 11 comptes par 3 ; `/api/connexions` accepte `bloque` et `refus`. **(5)** Tour → Surveillance, panneau **VERSIONS** : version en ligne, minimum exigé, appareils bloqués sur 7 j, mode ; boutons patron « Exiger la dernière version pour tout le monde », « Lever l'exigence », « Autoriser le hors ligne (urgence) ». **(6)** Tour : un identifiant vu seulement dans des échecs n'est plus affiché comme un utilisateur (« identifiants tapés qui n'existent pas ») — c'est ce qui avait fait chercher des comptes fantômes à supprimer. Vérifié : syntaxe des quatre fichiers, 24 contrôles de permissions, garde-fou sur 9 cas, routes serveur en local (426/200 selon `ver`), application et service worker en vrai Chromium (marque posée, flux de progression reçu). **Ce qui reste :** la règle Firestore à coller ; puis, dans la Tour, exiger v616. La vraie cure — fusion par enregistrement des 27 autres collections — n'est pas commencée : le garde-fou évite le désastre, il ne fusionne pas deux modifications concurrentes. |
| **v617** | **Le hors ligne n'existe plus, même en option.** La v616 gardait un interrupteur d'urgence dans la Tour (« Autoriser le hors ligne ») ; Justin, une heure plus tard : « je veux toujours que ça marche en ligne, c'est le plus sûr, on oublie le hors ligne complètement ». Retiré des trois côtés — Tour (plus de bouton ni de KPI « mode »), serveur (`enLigne` ne vaut plus que `enLigne`, le paramètre est ignoré ; le champ reste rendu pour les v616), application (plus de branche `libre`, et l'écran « Connexion requise » s'applique aussi sans espace d'équipe et sur l'écran de connexion). Un interrupteur qu'on peut rallumer est un interrupteur qu'on rallumera. |
| **v618** | **Hors ligne : on vérifie, on ne demande plus au navigateur.** Justin, 10 septembre 0 h 23, wifi coupé sur son Mac : « ça marche, c'est normal ? ». Non. La v616 se fiait à `navigator.onLine` et à l'événement `offline`, qui restent à « en ligne » tant qu'une interface existe (Ethernet, partage, VPN) — et Safari les laisse à vrai bien après la coupure. Deux signaux vérifiés remplacent ça : un **battement** HEAD sur `/health` toutes les 20 s (deux échecs de suite = hors ligne, écran « Connexion requise »), et **une écriture Firestore sans acquittement en 15 s** compte comme hors ligne (`_horsLignePush`, donc rechargement au retour du réseau : la file d'écriture du SDK est jetée, la base de l'équipe fait foi). Éprouvé en navigateur avec `fetch` saboté. |
| **v619** | **Mise à jour : plein écran tout de suite, bornée.** Justin, 10 septembre : « quand il y a une mise à jour, je voudrais que ça se mette en plein écran, plus sûr ». Et un défaut trouvé en le faisant : la v616 attendait « que la personne ait fini » **sans limite**, et un champ simplement sélectionné comptait comme « quelqu'un écrit » — un appareil laissé sur l'écran de connexion (champ en focus) ne se mettait **jamais** à jour. Désormais `majPrete()` : libre → l'écran plein s'affiche et ça part ; occupé (fenêtre ouverte, caméra, geste < 8 s — plus le focus d'un champ) → écran plein avec compte à rebours et une seule porte de sortie, « Terminer ma saisie d'abord », deux minutes au plus (une pour une mise à jour obligatoire), puis ça part. Le bandeau n'existe plus. |
| **v620** | **Qui c'est, et supprimer depuis la Tour.** Justin, 10 septembre : « prénom et nom obligatoires à la création, sinon “remplis tous les champs” ; dans la Tour, l'utilisateur et en dessous le nom prénom ; un bouton de suppression de compte avec un code que je reçois par mail ». **(1)** `saveUser` refuse un prénom ou un nom vide. **(2)** Le nom voyage avec la connexion (`cnxSignaler` → `nom`) et avec l'annuaire (`annuaireDeposer` → `n`) : c'est la seule donnée ajoutée — ni adresse ni téléphone — et le commentaire du serveur qui disait « pas de prénom, pas de nom » a été réécrit pour le dire. À refléter dans `sous-traitance.html` si on y liste les données traitées. **(3)** La suppression depuis la Tour : la base est chiffrée, le serveur ne peut rien y retirer ; la Tour ORDONNE (`POST /api/monitor/compte/supprimer`, deux temps, code à 6 chiffres envoyé à `config.notifDemandes`, 10 min, 5 essais), la porte se ferme aussitôt (identifiant retiré de `comptes.json`, et le dépôt d'annuaire refuse de le réinscrire tant que l'ordre attend), et le premier appareil de l'entreprise qui s'ouvre EXÉCUTE (`ordresVerifier` : pierre tombale, `utilisateurNettoyer`, `save`) puis confirme (`/api/espaces/ordre-fait`, clé d'équipe vérifiée). Un appareil qui ne connaît pas le compte ne confirme pas — l'ordre attend un autre. 30 jours sans exécution : l'ordre s'efface. La Tour montre « ⏳ suppression en attente ». **Règles Firestore** : `firestore.rules` est désormais OP GESTION + espace client, SANS la messagerie — publié dans `elan-gestion` le 10 septembre 2026 sur décision de Justin (« OP MESSAGES n'est pas fini, on peut les supprimer tout de suite »). Conséquence assumée : `messages.html` est hors d'usage jusqu'à sa bascule sur son propre projet Firebase, dont les règles attendent dans `firestore-opmessages.rules`. Bascule = config web du nouveau projet dans `messages.html` (et `messages-beta.html`), publication, puis Authentication activée côté console. |
| **v621** | **La vraie cure, et le filet.** Justin, 10 septembre : « fais ça » — la liste de fin de soirée. **(1) Fusion par enregistrement** : chaque enregistrement porte `_m` (posé à `save()` en comparant à son empreinte au dernier enregistrement ou à la dernière réception, `_ombre` — pas à chaque mutation, il y en a des centaines), chaque suppression laisse une pierre tombale (`db._tombes[coll][id]`, 90 jours, 3 000 au plus), et `fusionnerBases()` réunit deux bases collection par collection : le plus récent gagne, l'absent d'un côté est repris de l'autre sauf s'il a été supprimé après sa dernière modification ; sans id (journal de planning) union par contenu ; réglages hors liste au côté prioritaire. Appliquée à la réception (priorité distante, repoussée si on avait plus) et avant l'envoi (priorité locale). La branche « notre base est plus lourde » a disparu, le garde-fou du rétrécissement ignore ce qu'une tombe a supprimé exprès. Les comptes gardent `usersFusionner`. 17 cas unitaires sur les fonctions réelles. **Limite dite** : le même enregistrement modifié au même instant sur deux appareils, c'est encore le plus récent qui gagne (les lignes de mouvement, elles, survivent). ⚠️ Dès la publication, **exiger v621 dans la Tour** : une v620 encore ouverte écrit sans `_m` et perdrait ses modifications de fiches existantes à la fusion. **(2) Les copies de sauvegarde** : après chaque envoi acquitté, au plus une par demi-heure par appareil, le bloc CHIFFRÉ part sur le serveur (`/api/espaces/sauvegarde`, clé d'équipe vérifiée, rotation une par heure sur 24 h puis une par jour sur 30 jours, `data/sauvegardes/<t>/`). Restauration dans l'app (Paramètres → Synchroniser → « Copies de sauvegarde ») : on ouvre une copie, on remet une collection à la fois ce qui manque, sans toucher au reste ; une restauration lève la tombe. La Tour affiche le nombre et l'âge de la dernière copie. **(3) Battement de présence** : plus de poussée de toute la base toutes les deux minutes — écrit en local, pousse toutes les quatre minutes au plus. **(4)** `FOURNISSEURS_ELAN` → `FOURNISSEURS_3D` (le nom mentait). **(5)** `messages.html` affiche « change d'infrastructure » et ne parle plus à Firebase (`OPMSG_EN_TRAVAUX`) — à basculer sur le nouveau projet quand Justin donne la config. **(6)** `sous-traitance.html` : la ligne « Connexion » (identifiant, prénom, nom des salariés). **Relu avant publication par `relecteur` et `gardien`, qui ont trouvé** : ⛔ `importData()` remplaçait `db` sans relever l'ombre — le `save()` suivant aurait enterré tout ce que le fichier importé n'avait pas, tombes propagées à l'équipe (corrigé : `ombreRelever()` avant `save()`, un import REMET et ne retire rien) ; ⛔ `ordre-fait` : l'appareil du salarié supprimé pouvait acquitter sa propre suppression et remettre son identifiant dans l'annuaire (corrigé : le ban survit à l'acquittement, l'ordre reste servi 7 jours, seul le patron réautorise — bouton dans la Tour) ; l'espace de repli `elan-gestion` (clés publiques) refusé sur les copies ; espaces fermés refusés ; `iv`/`salt` bornés ; quotas sur liste et lecture ; copies et ordres effacés avec l'entreprise et comptés dans l'inventaire ; `planJournal` recadré après fusion ; budget global de 6 000 tombes. Tous rejoués sur instance isolée après correction. **Coût connu** : `estampiller()` hache chaque enregistrement à chaque `save()` — 60 à 200 ms sur un téléphone pour 5 000 enregistrements ; à optimiser si une base grossit. |
| **v622** | **Un DR ne voit que ses box — « pareil pour le reste ».** Justin, 10 septembre au matin, quand la fiche lui a montré que quatre filtres sur huit (`visibleBoxes`, `visibleVehicules`, `visibleMouvements`, `visibleJournal`) ignoraient le périmètre d'un DR : « ils doivent voir que les box qui leur sont assignées, pareil pour le reste ». Même règle désormais que `visibleInts` : « tout voir » SANS périmètre (admin, chef ou DR sans équipe rattachée) rend tout l'espace, comme avant — on ne retire rien tant que personne n'est rattaché ; AVEC un périmètre, un DR voit ses box (cochées pour lui, dont il est responsable, visibles par tous, celles de ses équipes, celles d'un absent qu'il remplace), les véhicules de ses équipes (`techId`, conducteur) sauf exclusion, les mouvements de ses box et ceux faits par son équipe — la ligne porte `fullName(currentUser)`, pas un id, donc le périmètre est traduit en noms d'utilisateurs (et de fiches technicien pour les lignes de démo) — et le journal de son équipe. `visibleBoxMvts` (les demandes de box) respectait déjà le périmètre, il n'a pas bougé. `scripts/verifier-permissions.js` embarque les quatre filtres avec leurs dépendances (`delegationsRecues`, `boxExclu`, `vehExclu`…) : 32 vérifications sur le code livré, dont un chef sans équipe qui voit encore tout. **Relu par `relecteur`, qui a trouvé** : ⛔ `formBon(id)` alimentait son sélecteur de box par `visibleBoxes()` — un bon lié à une box hors périmètre retombait sur « Aucune » et la première sauvegarde, même d'une simple note, détachait la box en silence (corrigé : la box déjà liée reste proposée, signalée « hors de mon périmètre » ou « désactivée ») ; les en-têtes Boxes et Véhicules disaient « tout » à un DR réduit à son équipe (corrigé : « N box (mon équipe) », « Véhicules de mon équipe »). **Limite assumée** : une réception de stock SANS box (`bonRecu`, stock général) écrit un mouvement sans `boxId` ni `technicien` — invisible à un DR rattaché, comme tout ce qui n'appartient ni à ses box ni à son équipe. Vérifié en navigateur sur la bêta : DR rattaché, DR sans équipe, admin, technicien, édition d'un bon hors périmètre, six écrans et deux formulaires sans erreur JS. **Après publication, exiger v622 dans la Tour.** |
| **v623** | **Plus jamais de produits en double dans une box.** ELAN, 10 septembre au matin, capture à l'appui : « Tout ajouter » dans une box a posé toute la liste une seconde fois — 210 produits sont devenus 420, chacun en double. **La cause** : le pack métier est semé au premier démarrage de CHAQUE appareil (`cataloguePoser`, drapeau `elan_prod_v2`) avec des identifiants `uid()` ; deux appareils ouverts avant de s'être synchronisés semaient deux jeux d'identifiants pour les mêmes fiches, et la fusion par enregistrement de v621 fait l'union par id — elle gardait les deux. La box, elle, est un objet indexé par id : elle ne peut pas contenir deux fois le même identifiant, donc ce sont bien les FICHES qui existaient en double. **(1) Prévention** : l'identifiant d'un produit venu d'un catalogue se déduit de son nom (`idCatalogue` → `cat_advion-gel-blattes-30g`, `four_mabi-xilix-1000`) — deux appareils qui sèment produisent le même enregistrement, la fusion n'en garde qu'un ; le pont « ajouter les résultats de la recherche » ne repose plus ce qu'on a déjà. **(2) Cure** : `produitsFusionnerDoublons()` — une survivante par nom (celle posée dans le plus de box, puis la plus ancienne, puis l'ordre alphabétique : la MÊME décision sur tous les appareils), le stock des box s'ADDITIONNE, chaque `produitId` des mouvements, demandes, bons et lots en attente est redirigé, les perdantes disparaissent et `save()` leur pose une tombe. Un bandeau ambre « N produits en double — Fusionner » s'affiche dans Produits et dans chaque box tant qu'il en reste. **(3) La box n'accepte plus deux fois la même identité** (`abpDisponibles` : ni un id déjà posé, ni un NOM déjà posé sous un autre id, une fiche par nom dans la liste), et « Tout ajouter » ne pose que ce qui manque. **(4) « À zéro ✕ »** dans la fiche box : retire ce qui est à 0 unité et 0 carton sans demande en cours ; ce qui a du stock reste. **(5) La ligne orange sous le −/qté/+** : « ⏳ +2 en attente d'ajout » / « −1 en attente de retrait », tous demandeurs confondus (`boxAttenteTous` — `boxAttenteProduit` existait déjà et ne regarde que MES lots ; le navigateur l'a attrapé quand la nouvelle s'est fait masquer), visible du technicien comme du DR, pendant que le chiffre du milieu reste le stock réel. **Relu par `relecteur`, qui a trouvé** : ⛔ le marcheur de remap excluait la collection `boxes` entière — les arrivages rangés DANS une box (`b.arrivages[].lignes[].produitId`, que `bonRecuCumul()` compare aux bons) restaient sur l'identifiant disparu, et un bon livré serait redevenu « il manque encore… » (corrigé : le marcheur entre dans les box, il ne saute que la clé `stock`) ; le cadenas 🔒 et la ligne orange affichaient deux fois mon propre lot envoyé (corrigé : la ligne orange ne porte que ce que LES AUTRES attendent — chaque fait une fois : brouillon → « restera », mon envoi → cadenas, les autres → orange). **Deux limites tranchées et écrites** : (a) avec un identifiant déterministe, un appareil neuf qui sème le pack recrée exactement une fiche qu'un collègue a peut-être supprimée exprès — le semis du premier démarrage se date donc d'avant tout (`_m = 1`, `cataloguePoser(d,{ancien:true})`), la tombe gagne à la fusion, supprimé reste supprimé ; le bouton « ↻ Catalogue OP » ne passe pas ce drapeau, ramener une fiche supprimée par erreur y est voulu ; (b) `produitCle` = nom normalisé seul : le CATALOGUE n'a aucun nom en double, CATFOUR en a huit (même produit chez deux fournisseurs, fusion défendable), le seul risque est deux conditionnements saisis à la main sous le même nom — la confirmation liste maintenant les paires et le dit. La modale « Ajouter des produits » affiche « N déjà dans la box · M nouveaux à ajouter » et porte le bouton « Retirer les N à zéro ». 23 vérifications unitaires, parcours rejoué sur la bêta. **Chez ELAN** : ouvrir Produits, cliquer « Fusionner » — 210 fiches de trop disparaissent, le stock des box est conservé et additionné. |
| **v624** | **Le DR corrige la quantité à la validation, et ça se voit.** Justin, 10 septembre : « il retire cinq produits et le DR veut qu'il n'en retire que quatre : il peut le modifier à la validation, et ça se verra que le DR a refusé un produit ». Sur l'écran Validations DR, chaque mouvement en attente (lot, ajustement simple, arrivage) montre ses produits ligne à ligne : la demande (« retirer 5 u »), un champ 44 px prérempli pour n'accorder qu'une partie — jamais plus que demandé, **0 refuse la ligne**, tout à zéro renvoie vers « Refuser » (qui a un motif) — et un mot facultatif pour le technicien, repris comme motif si le DR refuse plutôt. **Le modèle** : la demande reste écrite telle quelle (`du`, `dc`, `qte`) ; l'accordé se pose À CÔTÉ (`duAcc`, `dcAcc`, `qteAcc`, `mvAcc()` pour lire) et seulement quand il diffère, donc tout ce qui a été validé avant se lit sans changement. Stock, mouvement tracé (motif « validé DR — 4 sur 5 u »), bon de remise et cumul du bon de commande (`bonEcartLignes`, `bonResteApres`, `b.arrivages`) lisent l'accordé. Historique : pastille « Corrigé par le DR », lignes « accordé 4 sur 5 » / « refusé par le DR » en orange, mot du DR sur la ligne ; notification « Validé, quantités corrigées » ; journal idem. `boxMvtLibelle(m,court)` sans le détail par produit quand les lignes sont affichées dessous. Un `retrait` (le produit sort de la box) ne se corrige pas : c'est tout ou rien. 39 vérifications unitaires (lot, simple, arrivage, bon partiel, tout à zéro, bornage des champs, ancien enregistrement), parcours navigateur à 390 et 1280 px : 0 erreur JS, 0 débordement, toutes les cibles ≥ 44 px. **Relu par `relecteur`, qui a trouvé** : `mvtLignesSignees()` — la coloration des produits en box après un clic sur la notification « Validé » — lisait encore la demande : une ligne refusée par le DR se serait surlignée comme reçue ou retirée, l'inverse de ce que la version cherche à montrer (corrigé : elle lit l'accordé). Poids : +10,3 Ko. |
| **v625** | **Un seul bouton « Ajouter / retirer » sur la box.** Justin, 10 septembre, capture ELAN : « je veux pas de bouton là … un seul bouton ajouter ou supprimer un produit ; s'il y a des produits en stock, un message dit que les produits à zéro seront retirés mais pas ceux en stock ; si l'application repère un doublon, elle demande si c'est normal ou s'il faut en garder un et lier le stock à l'autre ; quand de nouveaux produits arrivent, tout le monde a une notification et le bouton dit +2 ». Conçu par un atelier (trois lecteurs du code, trois propositions, deux juges, une synthèse — `scratchpad/spec-box-produits.md`), puis simplifié : pas de filtre « masquer les à zéro », pas d'horodatage « vu » dans les décisions. **La feuille** (`openBoxProduits`, `bxp*`) : onglet Ajouter — le groupe « N nouveaux produits au catalogue » coché d'avance (« Ajouter ces N » / « Pas dans cette box », réversible par « Proposer à nouveau »), puis le catalogue avec recherche et « Tout cocher » sur les lignes visibles ; onglet Retirer — `boxRetirable(b,pid)` est LA définition (zéro unité, zéro carton, aucune demande en attente ni brouillon de qui que ce soit), les autres restent grisés avec la raison, récapitulatif nominatif, deux boutons distincts, « Oui, retirer N » gelé 500 ms, revérification à l'instant du geste, journal avec les noms, « Annuler » 7 s (`toastAnnuler`). Rien ne supprime une fiche ni ne touche une quantité : un produit en stock se retire par sa fiche, avec la validation DR, comme avant. **Le modèle** : `produitCreer(fiche,{semis,push})` est la SEULE porte d'entrée d'une fiche (`cree`, `creePar` ; un semis — catalogue, démo, bêta — vaut 0) ; « nouveau » pour une box = `produitCree(p)` (repli sur l'horodatage de l'identifiant `uid()`) > plancher (`BOX_NOUVEAUTES_DEPUIS`, la date de cette version, ou la naissance de la box si plus récente), absent de la box, pas écarté ; les décisions vivent dans `db.boxDecisions` (un enregistrement par box, `ecartes` par identifiant), jamais sur la box — la fusion en bloc écraserait le stock ajusté ailleurs ; `db.produitsDistincts` (clé = nom normalisé, `ids`) porte les paires déclarées « c'est normal », consultée par `produitsDoublons` et `abpDisponibles` (les deux fiches peuvent alors vivre dans la même box). **Doublons** : un seul composant `produitsDoublonsBandeau(opts)` pour Produits, la fiche box (replié) et la feuille — par groupe, les fiches avec réf., fournisseur, box et unités ; « Fusionner en un seul » (aperçu chiffré `produitsFusionApercu`, gelé 500 ms, `produitsFusionnerDoublons(cles)` ne traite que ce groupe), « C'est normal » (tracé, l'administrateur revoit depuis Produits), « Plus tard » (session). **Cloche** `prdnew:` une ligne par personne, disparaît d'elle-même ; push aux collègues à la création à la main, un par action, au plus un par dix minutes. 38 vérifications unitaires, parcours navigateur à 390/1280 px. **Relu par `relecteur`, qui a trouvé** : supprimer une box laissait sa décision de nouveautés orpheline (corrigé : filtrée avec elle) ; le bandeau doublons déplié sur une box restait déplié sur la suivante (corrigé : replié à `openBox`) ; et surtout `computeNotifs()` — qui tourne à CHAQUE `save()` de toute l'application — parcourait 800 produits × 30 box pour trouver les nouveautés (corrigé : les candidats d'abord, `produitsRecents()`, en général zéro ; mesuré 0,16 ms par passe sans nouveauté, 6 ms avec cinq). **Rejoué par `testeur`** : douze scénarios (box vide, recherche + tout cocher, brouillon d'un autre, stock arrivé entre la coche et le Oui, double tap ganté, Annuler après arrivage, nouveautés cochées/décochées, écarter puis proposer à nouveau, « c'est normal » puis Revoir admin, fusion avec aperçu chiffré, 320/390/781 px, Échap pendant le récapitulatif), tous passés, 0 erreur JS. Poids : +31 Ko. |
| **v626** | **Les catalogues fournisseurs dans la box.** Justin, 10 septembre, juste après v625 : « quand le technicien, le chef d'équipe ou le DR appuie sur ajouter les produits, ils doivent avoir tous les produits de la gamme qu'ils ont dans Produits, sans passer par l'administrateur ». L'onglet Ajouter de la feuille porte, sous le catalogue de l'entreprise, les cinq catalogues fournisseurs (`CATFOUR`, 2 809 références) : pilules par fournisseur, la même recherche, sans les noms déjà au catalogue, 120 lignes rendues, « Tout cocher » sur toutes les correspondances (confirmation au-delà de 60). Ce qui est coché entre au catalogue de l'entreprise au moment d'ajouter (`produitCreer`, daté, auteur = celui qui tient la box, donc « +N » sur les autres box et push aux collègues), puis se pose dans la box à zéro. **Pas de garde de permission** : décision de Justin. Rejoué sur la bêta avec un compte technicien (gamme ARMOSA, recherche, deux références, l'autre box les voit comme nouveautés, push à l'administrateur). **Puis, la même heure, Justin a tranché : « relier le catalogue automatiquement à l'ajout des nouveaux produits dans chaque box »** — `boxAutoNouveautes(b)` à `openBox()` : ce que le catalogue a reçu de nouveau se pose à zéro à l'ouverture de la box, sans question, journal et mot à l'écran ; seule cette box s'écrit, par la personne qui l'ouvre (jamais toutes les box d'un coup : la fusion en bloc écraserait les quantités ajustées ailleurs). Un produit retiré à zéro est écarté et ne revient pas ; le reposer ou annuler le retrait lève l'écart. Le « +N » sur une carte de box veut désormais dire « ils s'y poseront à l'ouverture ». 44 vérifications unitaires. |
| **v627** | **Les catalogues fournisseurs deviennent un onglet.** Justin chez ELAN, 10 septembre : « j'ai toujours pas tous les produits qu'on a rajoutés, VULCANO et tout ça ». Vérifié : VULCANO n'a jamais été au catalogue d'ELAN — les 45 références vivent dans la gamme ORCAD de `CATFOUR`. Et la section fournisseurs de v626 était SOUS la liste de l'entreprise : mesurée à **9 086 px du haut** avec 110 produits, invisible sans savoir qu'il fallait chercher. Trois onglets désormais : Ajouter (le catalogue de l'entreprise), **Fournisseurs** (pilules par fournisseur, recherche, « Tout cocher »), Retirer. La recherche est partagée entre les onglets (`bxpQ`, plus lue dans le DOM) ; quand le catalogue de l'entreprise n'a plus rien à proposer, la liste renvoie vers l'onglet Fournisseurs ; le pied compte les deux sélections ensemble. **La leçon, à ne pas refaire** : une fonction placée sous une liste qui peut faire cent lignes n'existe pas — la mesurer en pixels, pas la supposer visible. |
| **v628-629** | **Copier le catalogue d'un espace pour le coller dans un autre.** Justin, 10 septembre : « sur la bêta il y a tous les produits qui leur manquent ». La bêta est isolée par construction — c'est voulu — donc rien n'en descend tout seul chez une entreprise. Il manquait un pont, et la moitié existait : « ＋ Liste » savait LIRE une liste collée. L'autre moitié : **« ⧉ Copier la liste »** sur l'écran Produits met la liste AFFICHÉE (onglet et recherche compris) dans le presse-papiers, au format que ce lecteur attend. Le format gagne deux colonnes — `Nom ; Fournisseur ; Prix ; Référence ; Catégorie` — sans quoi la catégorie était redevinée de travers à l'arrivée et la référence perdue ; les listes tapées à la main passent encore, les colonnes ajoutées sont facultatives. Le même pont sert à démarrer une nouvelle entreprise depuis une autre. **Relu par `relecteur`, qui a mesuré ce que ce bouton rend facile** : coller 2 800 produits gelait l'écran 770 ms à l'aperçu (un menu de catégories par ligne, 2 Mo de HTML) puis 5,3 s à la validation (chaque ligne relisait tout le catalogue — le défaut de `fcAddAll`, à un autre endroit). Corrigés : au-delà de 200 lignes l'aperçu résume (combien, par catégorie, les premiers noms) au lieu d'énumérer, et les noms connus se lisent une fois dans un ensemble. Mesuré après : 14 ms de copie, 9 ms d'aperçu, 324 ms de validation pour 2 809 références. Au passage, `fallbackCopy` ne dit plus « copié » quand le navigateur a refusé. |
| **Tour PUPITRE** (branche, aperçu) | **« Revisite toute l'interface — couleur, style, productif, hyper professionnel » ; « un compte par application, et on bascule » ; « la Tour pour téléphone, la main partout ».** Justin, 10 septembre. **Méthode** : quatre directions dessinées indépendamment (console SaaS, système Apple, tableau de bord financier, marque TEAM OP), trois juges sur six critères, verdict unanime — **PUPITRE** (Linear/Vercel : filet plutôt qu'ombre, encre serrée, lignes de 44/56 px, tableaux à en-tête collant ; nuit par défaut, jour à égalité). **La couleur par trois canaux qui ne se recouvrent jamais** : tuiles d'icônes (une teinte par destination, jamais un état — Surveillance est ardoise, pas rouge : le badge chiffré fait le travail), pastilles d'état fixes (un mot dedans, toujours), et UNE teinte d'application sur tout ce qui agit (vert GESTION, bleu MESSAGES) posée par `body[data-app]` sur les jetons `--acc-*` existants. **Quatre blocs de jetons synchrones** (`body`, `body[data-app="messages"]`, `body.jour`, `body.jour[data-app="messages"]`), chacun porte `--bg` pour que `verifier-theme.js` le mesure — **quatre lignes « ✓ contrastes » sont le contrôle** ; le vérificateur exige désormais 4,5 sur `--muted`/`--dim`, mesure les lavis d'application et les encres d'état, et ignore les noms construits dans le JS (`var(--ic-'+x+')`). L'ancienne doctrine (trois plans d'ombre, arêtes de lumière, halo sous la souris, cases qui se soulèvent) est retirée. Les composants PUPITRE vivent EN FIN de feuille et l'emportent sur les règles de même sélecteur plus haut — c'est voulu, et c'est là que le dessin se change désormais. `body.plans` remet les cartes de 92 px du 7 septembre pour comparer. **Refusé par les juges, à ne pas réintroduire** : jour par défaut, tuile rouge Surveillance, `.p-bleu` qui suit l'application (bleu FIXE), `display:contents` sur les lignes, indigo inventé pour MESSAGES, verre sur trois couches, interrupteur en menu déroulant, barre du bas différente par console, liens fondus dans le texte. **Une console par application** : `MYAPPS` (droits, dits par le serveur au login puis `/moi`, repli sur le rôle si le serveur est d'avant), `APP` (console ouverte), interrupteur segmenté rendu seulement à deux applications (la cellule inactive compte les incidents de l'autre console), hash `#app/onglet` avec les anciens favoris acceptés, onglets/incidents/compteurs/badge/plis filtrés par console, console MESSAGES honnête (accueil qui lit l'état « en travaux » de `GET /messages/etat`, registre Ouvrir/Fermer, courrier commun), chips d'applications dans Équipe (`POST /users/apps`). **Téléphone** : en-tête mince avec liseré de la couleur de l'application et pastille NOMMÉE, barre d'onglets EN BAS (mêmes quatre destinations partout + « Plus »), feuille qui monte et se referme au glissé, `viewport-fit=cover` — mesuré à 390 px : 111 cibles sous 44 px → 0, zéro débordement. **Aperçu publié** sur `teamop.fr/apercu/tour.html` (même origine, vraies données) ; `tour.html` de production n'a pas bougé. **Trois questions posées à Justin** : lignes de 56 px ou cartes de 92 px pour les clientes ; la tuile Surveillance en ardoise ; le bleu OP MESSAGES. **Reste** : les écrans profonds sur le socle, le courrier façon Apple Mail (attend sa lecture du bandeau de panne), Journal en liste (B7), Équipe sans « Supprimer » collé à « Couper » (B9), le `<form>` de connexion (B10), Courrier en colonne large (C1). |
| **Serveur : comptes par application** (publié sur `main` le 10 septembre, d8aea4c, déploiement vérifié : `/health` sans adresse de boîte) | `apps:['gestion','messages']` sur les comptes de `monitor.json` (absent = `['gestion']`, le patron a tout PAR CALCUL, `[]`/clé inconnue refusés à l'écriture), `monApps`, garde-fou `monAppRefuse` DANS `monAdmin`/`monPatronStrict` qui relit `monUsers` à chaque requête (une application retirée fait tomber la route à 403 sans reconnexion), classement sur `req.route.path` (l'URL brute en capitales aurait contourné), **défaut GESTION : l'oubli FERME** — une route `/api/monitor` nouvelle doit dire son application. `GET /moi`, `POST /users/apps`, `/issues` filtrées par tag, `/entreprises` PROJETÉE pour un compte sans OP GESTION, `GET+POST /messages/etat` (`data/opmessages.json`, `enTravaux` par défaut, `=== false` strict), `/mails` classée GESTION (adresses de clientes). 69 requêtes au banc local. Sûr à déployer AVANT la Tour (tous les comptes existants restent GESTION + commun) ; **ne créer aucun compte limité à OP MESSAGES avant que ce garde-fou soit en production.** **Relu par `gardien`, qui a trouvé deux bloquants** : (1) le lien de connexion envoyé par la Tour (`/espaces/mail-acces`) partait sans `confidentiel` — 2000 caractères dans `mails-envoyes.json` (identifiant, mot de passe provisoire, lien porteur de la clé d'équipe) et une copie en bcc dans la boîte support ; sa relance le disait, lui l'avait oublié. Corrigé (confidentiel + trace). **⚠ Sur le VPS, l'archive existante est à purger à la main** : `grep -c 'Mot de passe provisoire' /opt/teamop/data/mails-envoyes.json` puis retirer ces entrées (ou vider le fichier — c'est un journal de confort) ; et vérifier la boîte support pour les copies bcc de ces envois. (2) `mail/*` (16 routes) et les écritures support étaient COMMUNES : un compte OP MESSAGES lisait « Envoyés » (donc les liens porteurs de clé) et écrivait depuis l'adresse officielle. Désormais GESTION ; seules `support/box|mails|envoyes` restent communes. **Et quatre points de moins** : `/health` (publique) rendait l'adresse de la boîte et `lastRefus` portait parfois un identifiant d'espace ou un slug — retirés, générique partout ; le quota d'explications (40/jour) se compte par application (`/report` est publique : un incident étiqueté OP MESSAGES aurait vidé le quota gestion) ; `monAppsLire` n'accepte que des chaînes ; `opmessages.json` s'écrit en temporaire + renommage. Banc rejoué : 83 requêtes, 0 échec de code. |

**La chaîne des droits, mesurée le 8 septembre** (pas déduite du code — éprouvée dans le
navigateur, compte par compte) :

- **« Commandes en cours » ne montre que les bons des box qu'on voit.** `visibleBons` →
  `mesBoxIds()` → `visibleBoxes()`. Donc : pour qu'un DR voie les commandes des box de son
  chef d'équipe, il faut soit « Tout voir », soit que ces box lui soient rattachées
  (responsable, ou cochées pour lui).
- **Par défaut, `db.permissions` donne « Tout voir » au DR ET au chef d'équipe.** Un chef
  d'équipe voit donc tout jusqu'à ce qu'on le lui retire — c'est le contraire de ce que
  croient les entreprises.
- `CAPS` (le socle) met tous les rôles à zéro ; c'est `db.permissions` qui ouvre. Les deux
  se lisent dans cet ordre : fiche de la personne, puis rôle de l'entreprise, puis `CAPS`.

**Reste demandé et non fait** : rendre la Tour de contrôle cohérente — « il y a beaucoup trop
de choses pour que ça soit cohérent et logique ». Les dix écrans ont été capturés et mesurés
(médiane 12 boutons et 225 mots par écran, l'Accueil à 22 boutons et 2 405 px). Les quatre
cadrages proposés ne correspondaient pas à ce qu'il voulait dire — **à reprendre avec lui, sans
deviner.** Trouvé au passage : l'onglet affiché « Accès » s'appelle `essais` dans le code, et
`.lien-sortie` est du CSS mort.

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
**Testée par Justin sur ses vraies données le 8 septembre au soir : elle marche.** C'est la
seule vérification qui compte — tout le reste tournait sur un banc d'essai fabriqué d'après
une capture d'écran, pas sur les entreprises réelles.
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
