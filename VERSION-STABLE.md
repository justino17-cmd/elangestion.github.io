# Point stable TeamOP

**Version stable : v666** — gravée le 11 septembre 2026 au soir.

v666 — la mise à jour ne se remet plus à plus tard, et le journal dit la vérité.

**Ce qui était ouvert.** Un appareil pouvait rester en vieille version indéfiniment. Deux
portes de sortie le permettaient : la croix ✕ de la bannière du bas, et « Terminer ma saisie
d'abord » sur l'écran d'attente, renouvelable tant qu'un formulaire restait ouvert. Mesuré
chez ELAN le jour même : Benoit en v634, Mathieu et Mathys en v641, alors que le minimum exigé
était v665 — des semaines de retard sur des appareils qui travaillaient tous les jours. Ils ne
refusaient pas : personne ne leur avait jamais imposé. Justin, le 11 septembre : « dès la
connexion, peu importe les choses qu'ils vont faire. Ils peuvent rien faire, ça met la page
complète. Ils ne peuvent pas la faire plus tard. »

**Le journal de la Tour mentait sur la cause d'un blocage.** Relevé du soir même, copié tel
quel : « v658 sous le minimum v653 », « v663 sous le minimum v663 », « v661 sous le minimum
v653 ». **Aucune de ces phrases n'est vraie** — 658 n'est pas sous 653, 663 n'est pas sous 663.
Le nuage refusait bien l'écriture, mais l'application recopiait dans le journal le minimum
qu'elle avait EN MÉMOIRE, parfois vieux de plusieurs heures. Neuf publications dans
l'après-midi, donc neuf fournées de lignes incohérentes — dans le premier endroit qu'on ouvre
quand un client appelle. `versionRefuseeParNuage` redemande désormais le minimum réel avant de
nommer une cause ; faute de réponse, elle écrit « minimum non confirmé » au lieu d'inventer.

⚠️ **Et la boucle que le nouvel écran aurait ouverte.** Conséquence directe du premier point :
sans porte de sortie, un refus du nuage étranger à la version (jeton d'équipe périmé,
entreprise fermée depuis la Tour) enfermait l'appareil — recharger, se faire refuser,
recharger, sur un écran dont on ne peut pas sortir. Une seule mise à jour forcée tant que la
cause n'est pas confirmée ; le second passage montre « Enregistrement refusé », qui dit la
vérité plutôt que de reproposer un bouton qui ne répare rien. Un écran déjà posé cède la
place quand la cause change — sans quoi le retour anticipé rouvrait exactement cette boucle.

**Prix assumé, et écrit à l'écran plutôt que taire** : `majOccupe()` n'est plus consulté, donc
une saisie en cours dans un formulaire non validé est perdue. Ce qui est ENREGISTRÉ, lui, part
avant le rechargement — `syncPush(true)` a été déplacé dans `majAppliquer`.

**Une adresse qui n'est pas la nôtre ne mène plus à rien** (`connexion.html`). Justin : « si le
lien n'est pas dans notre base de données ça marche pas ». Avant, n'importe quoi tapé ouvrait
un formulaire de connexion COMPLET pour une entreprise inexistante, et l'échec final disait
« identifiant ou mot de passe incorrect » — un mensonge, qui faisait réinitialiser un mot de
passe pourtant bon. Les trois chemins passent par la même porte : saisie à la main, arrivée
directe sur `/e/nom`, lien collé sans code. Via `/api/espaces/libre`, qui existe déjà — aucune
route serveur ajoutée.

⚠️ **TROIS ÉTATS, jamais deux** : connue / inconnue / *on n'a pas pu savoir*. Le troisième
LAISSE PASSER — refuser sur une réponse qu'on n'a pas reçue fermerait la porte à toute une
équipe dès que le réseau hoquette, et passer n'accorde rien : il reste l'identifiant et le mot
de passe à donner derrière. Même discipline que `_mailboxes` dans l'application.

`SYNC_SECRET_DEFAULT` et `SYNC_SALT` ne sont pas touchés d'un caractère (4 et 2 occurrences,
recomptées). Éprouvé : 28 suites, **848 vérifications, 0 échec** — `tests/test-666.js` en porte
63 à lui seul, dont les trois lignes fausses d'ELAN rejouées sur la vraie fonction extraite du
fichier livré. Les deux écrans de mise à jour et les cinq états de la page de connexion sont
mesurés au navigateur piloté, sur la bêta servie en local — jamais sur `app.html` en production.

⚠️ **Ce que la v666 ne fait PAS encore** : « pour les versions publiques, toutes les mises à
jour se feront la nuit » (Justin, 11 septembre). Non conçu. Tant que ça n'existe pas, une
publication de jour peut poser l'écran bloquant sur un téléphone en pleine intervention.

---

## Ancien point

**Version stable : v575** — gravée le 8 septembre 2026.

v575 — l'espace de synchro partagé n'accueille plus personne de nouveau.

**Ce qui était ouvert.** La synchro est active par défaut, et sans rattachement `syncTeam()`
retombait sur un espace unique, `elan-gestion`, chiffré avec une clé écrite en clair dans
`app.html` — donc servie publiquement par GitHub Pages. Un appareil qui ouvrait la page sans
avoir suivi le lien de son entreprise y atterrissait : il téléchargeait ce que cet espace
contenait, et y déposait ses propres données.

**La seconde conséquence n'avait jamais été vue.** `equipeTeamOP()` teste `syncTeam()===FB_TEAM` :
être sur cet espace, c'était *être l'équipe TEAM OP* aux yeux de l'application. Un appareil
neuf, avec le compte `admin` / `1234` que la mise à niveau crée, voyait l'assistant IA, le
planning de démonstration, le choix des métiers et la carte rouge « Tout effacer et repartir
à zéro ».

**Personne n'est migré, et c'est le point.** On fige d'abord, on ferme ensuite : un appareil
qui vivait déjà sur cet espace s'y voit inscrit noir sur blanc — même espace, même clé, rien
ne change pour lui. Un appareil neuf, lui, ne synchronise avec rien tant qu'il n'a pas suivi
le lien de son entreprise. Il n'y avait donc rien à mesurer avant de publier.

**ELAN ne perd rien**, vérifié sur sa fiche et non supposé : `espace elan-34oc`, clé propre.
Elle a son espace et sa clé depuis le début — le repli ne la concernait pas.

⚠️ **Le piège, mesuré et pas deviné.** Le tout premier chargement écrit six clés `elan*`. Un
test « le stockage contient-il une clé elan ? » rendait donc un appareil neuf « déjà vu » dès
son SECOND chargement, et le correctif n'aurait tenu qu'une seule ouverture de page. Le
drapeau `elan_repli_v1` gèle le verdict rendu au premier démarrage de la v575 — seul instant
où le stockage reflète encore ce que l'ancienne version avait laissé. Et `connexion.html`
posant `elan_savedLogin` avant de rediriger, les clés écrites par les pages du site sont
exclues du test : sans ça, un appareil neuf venant de l'écran de connexion passait pour un
ancien.

`SYNC_SECRET_DEFAULT` et `SYNC_SALT` ne sont pas touchés d'un caractère. La clé par défaut est
seulement écrite là où elle s'appliquait déjà en silence.

Éprouvé en navigateur sur `beta.html`, cinq cas : appareil neuf rechargé deux fois (reste non
rattaché), appareil de l'ancienne version (espace et clé identiques), entreprise rattachée
(intacte), appareil neuf suivant un lien (rattaché correctement), appareil neuf venu du site
(reste non rattaché).

**Pas d'annonce, délibérément** : rien ne change chez les entreprises existantes, et
`server/index.js` n'est pas touché — donc pas de redéploiement du VPS.

## Ancien point

v574 — un compte neuf démarre vraiment vide.

**La demande, mot pour mot :** « quand quelqu'un prend OP GESTION, tout est vide. Ce sera à eux
de tout mettre, ou à nous demander de mettre une liste. Chaque métier aura des fournisseurs
différents, des produits différents. »

**Le code se contredisait.** `load()` vidait 27 collections pour offrir une base propre, puis
TROIS réinjections la remplissaient aussitôt : 110 références du catalogue 3D et 5 fiches
fournisseurs. Une entreprise de nettoyage repartait avec des fournisseurs de produits
anti-nuisibles qu'elle n'avait pas demandés. La troisième porte ne s'appelait pas « seed » :
chercher ce mot la ratait, elle n'a été trouvée qu'en mesurant dans un navigateur.

**Le bouton « ↻ Catalogue OP » était la porte restante.** Il posait le catalogue 3D à
n'importe quel métier — un plombier cliquait et recevait du raticide. Il n'apparaît désormais
que là où le catalogue est DÉJÀ en place : un filet de sécurité pour qui s'en sert, jamais une
liste offerte à un nouveau venu. Le test porte sur les données, pas sur l'identité de l'espace :
une entreprise restée sur la clé par défaut aurait vu le bouton à tort.

**ELAN ne perd rien**, et c'est mesuré, pas supposé : ces réinjections n'AJOUTAIENT que ce qui
manquait, et ses drapeaux sont posés depuis longtemps. Compte neuf → 0 fournisseur, 0 produit,
0 client. Entreprise déjà installée → ses fiches intactes, aucun intrus.

**La bêta démarre vide elle aussi** — sinon elle ne montre pas ce que vit un vrai nouveau
client — et gagne trois boutons dans les Réglages : remplir avec un jeu de test, remplir en
grand nombre (200 clients, 400 interventions, pour éprouver les listes longues), tout vider.
Réservés à la bêta par le seul drapeau que la construction vérifie, et au rôle administrateur.

**Ce que la relecture a arrêté.** Une contre-épreuve en huit agents a conclu « ne tient pas » :
les données de test écrivaient quatre champs que l'application ne lit nulle part
(`technicienId` au lieu de `techId`, `en_cours` au lieu de `encours`, `telephone` au lieu de
`tel`, `notes` au lieu de `desc`). Les 400 interventions seraient sorties « Non assigné », un
tiers affichées « À planifier », les téléphones vides — on aurait jugé un écran qui ment. Et
une constante déclarée après `let db = load()` empêchait l'application de démarrer DU TOUT :
le contrôle de syntaxe la déclarait valide, c'est la console du navigateur qui l'a vue.

**Rien n'est annoncé aux entreprises** : ce lot ne change rien chez celles qui existent.

### Ancien point

v573 — le nouveau dessin s'allume chez les entreprises.

**Un attribut, et rien d'autre.** `app.html` porte désormais `data-refonte` sur sa balise
`<html>` — la ligne 2, jamais les onze autres `<html lang="fr">` du fichier, qui sont les
en-têtes des pages imprimées (bons, rapports, registres). Les 702 règles de la refonte
étaient déjà téléchargées par toutes les entreprises depuis des semaines ; aucune ne
s'appliquait. C'est ce mécanisme qui a permis de tout redessiner sans qu'un seul client s'en
aperçoive, et c'est le même qui permet de revenir en arrière : retirer l'attribut suffit,
sans toucher à une ligne de style.

**Ce qui change à l'écran.** Les emojis laissent place aux icônes dessinées, la navigation
passe en barre d'onglets en bas sur téléphone, les surfaces perdent leurs bordures au profit
de plans, et le vert cesse d'être partout pour ne marquer que l'actif et l'action principale.

**Vérifié avant d'allumer, sur la bêta qui porte le même attribut.** 26 écrans, en 390 px,
768 px et bureau, thèmes clair et sombre, avec 40 clients aux noms à rallonge et 60
interventions chargés en mémoire — jamais de `save()`. Aucun débordement horizontal, aucun
élément hors écran, rien masqué par la barre du bas, aucun contraste sous les seuils WCAG,
24 formulaires sur 25 ouverts proprement (le vingt-cinquième exige deux arguments), et
**zéro erreur JavaScript**.

**Les deux seuls reproches trouvés préexistent, à l'identique des deux côtés** : dix liens
e-mail et téléphone hauts de 20 px sur l'écran Fournisseurs — que WCAG 2.5.8 exempte en tant
que liens dans du texte courant — et 255 libellés non reliés à leur champ, qui sont du HTML
partagé et que la refonte n'aggrave pas.

**`beta-build.js` a dû être adapté d'abord.** Il exigeait `<html lang="fr">` exactement pour
poser l'attribut et se serait arrêté en le trouvant déjà là : la bêta ne se serait plus
régénérée du tout. Il tolère désormais l'attribut déjà présent.

**L'annonce n'a pas été touchée**, ni son numéro ni ses cinq points : le texte relu part
quand le bouton de la Tour est actionné, pas avant.

## Ancien point

**v572**
v572 — la correspondance d'une entreprise ne se lit plus avec son seul identifiant d'espace.

**Ce qui était ouvert.** Six routes du module mail ne demandaient qu'un `teamId` dans l'adresse
ou dans le corps : `/api/replies`, `/api/mailboxes`, `/api/sendmail`, `/api/mailbox/connect`,
`/api/mailbox/disconnect`, `/api/subscribe`. Or un `teamId` n'est pas un secret — il voyage dans
les URL, donc dans les journaux du serveur, l'historique du navigateur et l'en-tête `Referer` ;
il est écrit en clair dans le `localStorage` de chaque appareil ; et il ne se révoque pas. Le
connaître suffisait pour lire 200 messages reçus avec leur corps, lister les boîtes connectées,
**envoyer un e-mail depuis la vraie boîte SMTP de l'entreprise** — SPF et DKIM valides, sans
jamais connaître son mot de passe —, déconnecter cette boîte, ou s'abonner à ses notifications.
Ce n'était pas théorique : l'espace par défaut `elan-gestion` est écrit en clair dans un fichier
servi publiquement.

**La preuve existait déjà, elle n'a pas été inventée.** `app.html` détient la clé de synchro de
l'entreprise et sait en calculer l'empreinte SHA-256 ; `/api/espaces/comptes` vérifiait déjà cette
empreinte contre la clé de l'espace. Elle est désormais rendue en un seul endroit,
`cleEquipeVerdict()`, et comparée en temps constant — une empreinte comparée octet par octet se
mesure. L'empreinte part en **en-tête** `X-Teamop-Kh`, jamais dans l'URL : ce qui autorise ne doit
pas se retrouver dans les journaux d'accès.

**On observe avant de fermer, et c'est délibéré.** La vérification s'appuie sur `espaceParT()`,
qui ne lit que `espacesReg` — le registre alimenté à la main, quand `cnxData` se remplit tout
seul. Des entreprises actives ont donc un espace sans entrée d'annuaire. Refuser d'emblée les
renverrait en 403, que `loadMailReplies()` avale dans son `catch` : Réception vide, aucun message
d'erreur. Cette version compte donc sans rien refuser — `/api/mail/cles` rend le décompte — et la
fermeture n'aura lieu que lorsque « inconnu » et « absent » seront à zéro pour les espaces vivants.

**Publiée en deux fusions, dans cet ordre.** Le serveur d'abord, seul : il doit accepter l'en-tête
`X-Teamop-Kh` dans `Access-Control-Allow-Headers` **avant** qu'`app.html` commence à l'envoyer,
sinon la requête préalable échoue et le navigateur coupe les six routes sans erreur visible.
GitHub Pages sert `app.html` dès la fusion, alors que le VPS attend son workflow : une fusion
unique aurait ouvert exactement cette fenêtre.

**Trois corrections de la même famille, au passage.** `Cache-Control: no-store` sur les réponses
qui portent de la correspondance, sans quoi des corps d'e-mails se rangent dans le cache disque du
navigateur. Le rattachement d'un message à une équipe n'accepte plus un indice ambigu : le numéro
de bon ne vaut rien seul, `nextNum()` étant un compteur local à chaque entreprise, toutes
démarrant à `BC-2026-001` — chemin mort aujourd'hui (`/health` rend `"boite":false`), mais armé
pour la première boîte partagée configurée. Enfin `email` et `pass` sont bornés à l'entrée de
`/api/mailbox/connect`, avant la vérification SMTP et non au moment d'écrire : tronquer après coup
stockerait un mot de passe qui ne s'authentifie plus.

## Ancien point

**v571**
v571 — OP GESTION est OP GESTION, OP MESSAGES est OP MESSAGES.

**La demande, mot pour mot : « je veux que OP GESTION soit OP GESTION et OP MESSAGES soit
OP MESSAGES ».** La rangée « SUITE » en bas de la barre latérale proposait d'ouvrir OP MESSAGES
depuis OP GESTION — écran partagé, nouvelle fenêtre. Deux applications, deux abonnements et deux
connexions dans le même écran : c'est de là que viennent les mélanges, et c'est ce qu'on arrête.

**OP MESSAGES sort des formules.** Ce n'est plus une case d'un forfait OP GESTION, c'est une
application à part qu'on ouvre entreprise par entreprise depuis la Tour. Le **défaut est fermé**,
pour tout le monde et y compris pour l'espace interne : sans décision explicite, OP GESTION ne
montre rien d'autre que lui-même. Fermé, la rangée disparaît **entièrement** — étiquette
comprise, parce qu'un sélecteur « Changer d'application » qui n'ouvre rien est un bouton mort.
La carte utilisateur et la déconnexion, elles, restent.

**La règle a changé de main.** Avant : `syncTeam()===FB_TEAM` — autrement dit « es-tu sur
l'espace interne ? », une règle écrite dans la page, que personne ne pouvait changer sans
republier. Maintenant : un champ `opMessages` porté par l'espace, rendu par `/api/espaces/etat`,
posé depuis la Tour. Il est rendu sur **tous** les chemins de sortie de cette route — l'oublier
sur celui qui part avant la formule laissait la messagerie affichée chez toute entreprise sans
formule attribuée.

**La Tour montre enfin ce qu'une entreprise utilise vraiment.** Les connexions enregistrent la
clé technique de l'application (`gestion`, `elan` pour les anciennes versions, `messages`…) ; on
l'affichait telle quelle, il fallait la traduire de tête. Elle est désormais lisible, et surtout
posée **à côté** de ce qui est ouvert : ce qu'on autorise et ce qui sert sont deux choses, et les
confondre fait croire qu'une application tourne parce qu'on l'a cochée. L'interrupteur est sur
chaque ligne de l'onglet Accès et dans la fiche de chaque entreprise.

**Éprouvé.** 10 cas de régression ajoutés (61 au total dans `server/test-connexion.js`) : le
défaut fermé, l'ouverture et la fermeture par le patron, le refus sans jeton, l'écriture sur le
disque, la formule qui ne bouge pas, et le chemin qui sort avant la formule. Plus 26 cas en
navigateur sur **Chromium et WebKit** — la barre disparaît quand le serveur dit non, revient
quand il dit oui, et la déconnexion reste joignable dans les deux cas.

Deux défauts de harnais trouvés au passage, et corrigés dans le harnais et non dans le produit :
la rangée vit dans un volet replié (`#suite-fly{display:none}`, ouvert au survol), et le service
worker d'`app.html` s'interpose entre la page et le réseau — Playwright ne l'intercepte pas de la
même façon selon le moteur, ce qui faisait échouer WebKit sur du code pourtant identique.

**Ce que la relecture a arrêté, et qui aurait coûté cher.**

· **« Revoir le lien de connexion » refermait OP MESSAGES en silence.** `/api/monitor/espaces`
  reconstruit l'entrée d'annuaire de zéro et ne reportait de l'ancienne que la formule. Or ce
  geste-là est le plus banal de la Tour — redonner son lien à une entreprise lui coupait une
  application facturée à part. Aucune erreur, aucun journal, aucun écran ne l'aurait dit : la
  pastille serait simplement repassée à « fermé » sans que personne n'y touche.

· **Un espace à plusieurs noms rendait deux états contradictoires.** La liste de la Tour lisait
  chaque entrée brute au lieu de l'entrée effective : le même espace s'affichait « ouvert » sur
  une ligne et « fermé » sur l'autre, et le bouton de la ligne périmée restait mort. Exactement
  le motif déjà corrigé sur le renommage en v569.

· **`{"opMessages":"false"}` ouvrait l'application.** Un booléen relâché (`!!`) sur le corps de
  la requête. L'interface livrée envoie un vrai booléen, mais la direction de l'échec était la
  mauvaise : sur une option facturée à part, on ferme quand on ne comprend pas, on n'ouvre pas.

· **La fiche entreprise ne se rafraîchissait pas après le clic.** Le serveur enregistrait, le
  badge restait figé, et on recliquait en croyant que ça n'avait pas pris.

Les deux premiers sont désormais des cas de régression (65 au total).

---

**Version précédente : v570** — gravée le 7 septembre 2026.

v570 — l'adresse d'une entreprise ne peut plus tomber sur une page du site.

**La panne, une heure après la livraison.** Justin tape « Elan » — le nom de son plus gros
client — et arrive sur la page commerciale d'OP GESTION au lieu de l'écran de connexion de son
entreprise. Ce n'était pas le code : le dépôt porte un fichier `elan.html` (la page produit,
nom hérité d'ELAN GESTION), et **GitHub Pages sert `/elan` depuis ce fichier avant que
`404.html` n'ait la moindre chance de s'exécuter**. Vingt-sept noms du site avaient le même
piège — `app`, `tarifs`, `espace`, `metiers`, `creer`, `dev`, `merci`…

**Ce que ça devient : `teamop.fr/e/nom-entreprise`.** Un préfixe qui n'est pas un fichier ferme
la question pour toujours, au lieu d'entretenir une liste de mots interdits qu'on oubliera de
tenir à jour le jour où on ajoutera une page au site. La forme courte `teamop.fr/nom` continue
de marcher quand elle ne heurte rien, et **renvoie sur la forme longue** : l'adresse affichée
reste la même partout, il n'y a donc qu'une seule adresse à retenir.

Contrepartie payée ici et pas ailleurs : sous `/e/`, une adresse relative comme `app.html` se
résoudrait en `/e/app.html`. Toutes les adresses de `connexion.html` sont donc devenues
absolues.

**Le contrôle qui manquait — `scripts/verifier-adresses.js`.** Il exécute le VRAI script de
`404.html`, pas une copie, et il **nomme** les 27 noms que la forme courte ne peut pas servir.
Ajouter une page au site ne pourra plus recréer la panne en silence. Il a d'ailleurs pris son
auteur en défaut dès le premier passage : la liste de mots réservés s'appliquait aussi à la
forme longue, ce qui bloquait sans raison une entreprise qui se serait appelée « Beta ».

**Trois suites entrent dans la CI.** `verifier-adresses.js`, `server/test-connexion.js` (51 cas)
et `server/test-acces.js` (31 cas) tournaient à la main ; elles tournent désormais à chaque
proposition de modification. Le délai du job passe de 5 à 10 minutes : la suite de connexion
attend une minute pleine pour laisser retomber le plafond anti-abus, et c'est le prix de
l'éprouver sur le vrai serveur plutôt que sur une copie.

---

**Version précédente : v569** — gravée le 7 septembre 2026.

v569 — chaque entreprise a son adresse, et on s'y connecte avec son identifiant.

**Le problème, dit par Justin : « le lien que tu génères est bien, mais si les personnes se
déconnectent, elles n'ont plus le code d'accès. Comment elles font ? »** Il avait raison, et le
défaut était de fond. Le lien `app.html#entreprise=…` porte `k`, la clé qui déchiffre les
données de l'entreprise : le lien EST le mot de passe. Le perdre, c'était perdre la porte. Le
code d'accès à dix caractères (v567) enlevait la dépendance à l'e-mail, mais restait un secret
d'entreprise que personne ne retient et qu'on ne peut retirer à une seule personne.

**Ce qui remplace tout ça : l'adresse de l'entreprise, comme Organilog.**
`teamop.fr/nom-de-l-entreprise` ouvre SON écran de connexion — identifiant, mot de passe, et on
est dedans. L'adresse reste dans la barre du navigateur, se met en favori, s'écrit sur un
camion. Rien à conserver, rien à se faire dicter, et chaque personne n'ouvre que son entreprise.

**Comment le serveur peut vérifier un mot de passe qu'il ne connaît pas.** Les comptes vivent
dans les données CHIFFRÉES de l'espace : le serveur ne sait pas les lire, et il n'en est pas
question. L'application lui DÉPOSE donc un vérificateur par compte — un sel tiré au hasard et
PBKDF2(empreinte du mot de passe, sel, 120 000 tours). On ne remonte pas d'un vérificateur au
mot de passe, et il ne sert nulle part ailleurs. Le dépôt se prouve en montrant `sha256` de la
clé d'équipe, la même preuve que `/api/espaces/lien` : sans elle, n'importe qui écraserait
l'annuaire d'une entreprise pour entrer chez elle. Rien d'autre ne part : ni prénom, ni nom, ni
adresse.

**Ce que la route rend n'est pas nouveau, sa condition l'est.** `POST /api/espaces/connexion`
rend le code de l'espace — donc `k` — exactement comme le fait déjà le code d'accès. Ce qui
change, c'est qu'il faut désormais un mot de passe PERSONNEL, révocable compte par compte, au
lieu d'un secret partagé par toute l'entreprise. Un mot de passe faux, un identifiant inconnu et
une entreprise inexistante répondent la même chose : la route ne dit pas qui est client de
TEAM OP. 36 cas de régression dans `server/test-connexion.js`, dont le cloisonnement (« marc »
existe dans deux entreprises avec deux mots de passe — chacun ne reçoit que SA clé) et une
charge de 5 Mo sur les deux routes publiques.

**Pas de mot de passe à taper deux fois.** La page de connexion passe à l'application un jeton
d'ouverture (sessionStorage, même onglet, effacé dès qu'il a servi, refusé passé deux minutes).
L'application n'entre que si le compte existe vraiment dans les données de l'équipe et que son
empreinte correspond : le serveur dit qui vous êtes, les données disent ce que vous avez le
droit de voir, et c'est la seconde qui décide.

**Le code d'accès reste — comme filet, plus comme chemin.** Tant qu'une entreprise n'a pas
ouvert l'application une fois avec cette version, son annuaire est vide : l'écran le dit et
propose le code. Ensuite, l'identifiant suffit, partout.

**La Tour reprend la main sur ses accès.** Suspendre (sans rien effacer, réversible), rouvrir,
renommer — donc changer l'adresse, avec l'avertissement qui va avec — et supprimer, en faisant
écrire le nom. Et surtout **trois familles séparées à l'écran** : les accès bêta, les accès à la
version publique ouverts depuis la Tour, et les entreprises inscrites sur le site. Les mélanger,
c'était risquer de supprimer un client en croyant faire le ménage dans ses propres essais.

**Ce que la relecture a trouvé, et qui n'aurait pas dû partir en production.** Ce n'est pas de
la modestie de le noter : ces quatre-là étaient tous invisibles à l'essai, et trois auraient
coûté cher.

· **Un identifiant `__proto__` tuait le serveur entier.** `ann.c` vient d'un JSON : c'est un
  objet ordinaire, donc `ann.c['__proto__']` rend `Object.prototype` — « vrai », avec un champ
  vide. `Buffer.from` levait alors hors du `try`, dans un gestionnaire `async` qu'Express 4 ne
  rattrape pas : processus mort. Une requête, sans authentification, et les 80 routes tombaient
  pour tous les clients. La suite passait 36 cas sur 36 en ignorant celui-là. Corrigé par
  `hasOwnProperty`, par une vérification de forme avant tout usage, et par un filet autour de la
  vérification entière. Cinq identifiants piégés sont désormais dans la suite.

· **Renommer mentait.** La route lisait `espacesReg[slug]` alors qu'un espace porte plusieurs
  noms dans l'annuaire : elle renommait une entrée pendant que le serveur en servait une autre,
  répondait « fait », et l'ancienne adresse continuait de marcher. Elle passe par `espaceAJour`
  et retire TOUS les anciens noms — ce que l'écran promet.

· **« Rouvrir » défaisait une fermeture d'entreprise.** La liste des espaces fermés est partagée
  avec la fermeture définitive, celle qui exige un code de confirmation par e-mail. Un clic la
  défaisait et rendait à nouveau le lien porteur de `k`. Les deux états sont maintenant séparés.

· **L'anti-abus comptait les connexions réussies.** Soixante par heure et par adresse IP : une
  équipe de trente personnes arrivant à 7 h derrière la même box les épuisait, mots de passe
  corrects en main. Seuls les ÉCHECS se comptent désormais — c'est eux que la force brute
  produit.

**Trois suites, 122 cas.** `server/test-connexion.js` (51), `server/test-acces.js` (31), et
l'essai en navigateur sur Chromium ET WebKit — le moteur de Safari — qui suit le chemin réel de
bout en bout : adresse, mot de passe faux, mot de passe juste, entrée dans l'application sans
retaper, et jeton qui ne correspond pas (40).

---

**Version précédente : v568** — gravée le 7 septembre 2026.

v568 — la couleur dit la même chose partout, et la Tour reprend la main sur ses accès.

**Le vert disait le contraire de ce qu'il annonçait.** Justin l'a vu sur sa capture : trois
produits « à commander » entourés de vert. La règle est pourtant simple, et il l'a énoncée deux
fois — ce qui SORT est rouge, ce qui ENTRE est vert. Deux notifications ne la suivaient pas :
« Stock bas » et « Box à réapprovisionner » posaient un anneau vert sur des produits qui
manquent. Le vert se lit « tout va bien » : la notification disait donc l'inverse de son texte.
Les deux passent au rouge, et la règle est écrite au-dessus de `cible()` pour que la prochaine
notification tranche avant d'être écrite. Éprouvé sur les **cinq** catégories qui surlignent des
produits : stock bas (rouge), box à réapprovisionner (rouge), arrivage (vert), passage mixte
(les deux), décision du DR sur un lot mixte (les deux).

**La Tour ne redemande plus l'identifiant, et ne propose plus « admin ».** « Revoir le lien »
ouvrait un `prompt` pré-rempli à `admin` : on croyait choisir, et on écrasait l'identifiant réel
de l'entreprise par un mot générique. Or le serveur le connaît déjà — il vit dans le code de
l'espace, champ `a`. Il le rend maintenant, la liste l'affiche sur chaque ligne, et le bouton
n'invente plus rien.

**Les deux listes portent leur titre.** « Accès à la bêta — n'ouvrent que beta.html » et « Accès
à la version publique — vrais espaces, vraies données ». Sans le premier, on lisait une suite de
cartes sans savoir laquelle ouvre quoi.

**Reprendre la main sur un accès qu'on vient d'ouvrir.** Un bouton « Changer identifiant / mot
de passe » sur les espaces **qui n'ont pas encore servi**, avec la route
`/api/monitor/espaces/identifiants` (patron seul, écriture sur l'entrée vivante du registre, mot
de passe jamais conservé en clair). Sur un espace déjà utilisé, le bouton n'apparaît pas et la
ligne explique pourquoi : après la première connexion, le mot de passe vit dans les données
CHIFFRÉES de l'espace, hors de portée du serveur. Le réécrire ne changerait rien et ferait mentir
l'écran — on refuse et on le dit, plutôt que d'offrir un bouton qui ment.

**Ce qui reste ouvert, et que cette version ne règle pas.** Justin veut un système à la
Organilog : une adresse durable par entreprise, où l'on arrive avec son identifiant et son mot
de passe, sans avoir à garder un lien ni un code. Aujourd'hui le lien PORTE la clé de
déchiffrement, donc le perdre, c'est perdre l'accès. Pour que des identifiants suffisent, le
serveur doit pouvoir les VÉRIFIER — ce qu'il ne peut pas faire, les comptes vivant dans les
données chiffrées. Le serveur détient pourtant déjà la clé (`espacesReg`) : il ne manque que le
contrôle. C'est un chantier à part entière, à décider avant d'écrire.

v567 — une loupe dans le menu, un lot qui dit ce qu'il attend, et la connexion par nom.

**Une loupe dans le menu.** Quarante rubriques en dix groupes : il fallait les parcourir des yeux
sur ordinateur, les faire défiler sur téléphone. Un champ discret en tête filtre à la frappe,
masque les titres de groupe devenus vides, et Entrée ouvre la première rubrique restante.
Il ne fait que MASQUER des lignes existantes — les droits restent ceux du menu, rien n'apparaît
qui n'y était pas : un compte restreint voit filtrer 27 rubriques là où l'administrateur en voit
44. Mesuré : 0,4 ms de filtrage, casse et accents indifférents, sur quatre combinaisons
largeur × thème.

**Le lot de produits, jusqu'au bout.** Ajouter et déduire plusieurs produits d'un coup, une seule
notification, tout en surbrillance au clic — la demande était déjà tenue pour l'essentiel. Trois
choses ne l'étaient pas, et la mesure les a sorties :

- *Un lot MIXTE était peint d'une seule couleur.* `mvtRetrait()` rendait un verdict unique pour
  tout le mouvement : deux produits reposés et trois repris donnent un total négatif, donc les
  cinq lignes partaient en rouge — faux pour les deux qui venaient d'être ajoutées.
  `mvtLignesSignees()` sépare désormais par le signe, chaque type portant le sien, et la
  notification fait deux appels au surlignage plutôt qu'un.
- *La fiche de la box ne disait rien pendant l'attente.* Sous validation DR, le geste part mais
  les quantités ne bougent pas, et rien ne l'expliquait — ce qui pousse à re-taper. Un bandeau
  annonce « 5 produits en attente de validation DR » avec l'heure d'envoi, chaque ligne porte
  « +2 u en attente » et un bouton « retirer », et le lot entier s'annule d'un bouton.
- *Le téléphone du DR sonnait une fois par produit.* La cloche regroupait déjà par passage ; la
  notification poussée, elle, se regroupait par produit. Cinq produits repris = cinq sonneries.
  Elle regroupe maintenant par (box, personne) : un seul message, quantités signées, sorties
  d'abord.

Et le bon de remise ne se perd plus : la question « pour qui ? » se déclenchait sur le TOTAL du
lot, donc jamais sur un lot au total positif contenant pourtant un retrait.

**La connexion par nom d'entreprise.** L'écran disait « ton lien, OU le nom de l'entreprise »
dans une seule case, pour deux comportements opposés — le lien connectait, le nom envoyait un
e-mail. Deux champs nommés (Entreprise, Code d'accès) mènent maintenant à l'écran des
identifiants ; le lien a sa ligne, le renvoi par e-mail la sienne.

Le nom seul ne peut pas ouvrir un espace : le lien porte la CLÉ qui déchiffre les données, et un
nom se lit sur un camion. D'où un code de dix caractères que le patron donne à ses équipes depuis
la Tour et renouvelle quand il veut. **Quatre passages du gardien** ont été nécessaires, et
chacun a trouvé quelque chose que le précédent n'avait pas vu :

1. le code n'était jamais persisté — `espaceAJour()` rend une COPIE, pas l'objet du registre ;
2. un code révoqué ressuscitait quand le patron rouvrait le panneau d'un autre nom du même
   espace ; il vit désormais dans `acces.json`, indexé par l'identifiant d'ÉQUIPE ;
3. trente requêtes à vide sur un nom public fermaient la porte à tous les salariés d'une
   entreprise : le compteur ne compte plus que les échecs, et seulement après vérification ;
4. `jsq()` n'échappait pas le guillemet double — un nom d'entreprise venu d'un formulaire PUBLIC
   sortait de son attribut `onclick` et exécutait du script dans la console du patron, celle qui
   porte le jeton d'administration de tous les espaces. Corrigé dans la fonction : 37 endroits
   d'un coup ;
5. trois routes publiques appelaient `espSlug` sur l'entrée brute — son `normalize('NFD')` sur
   5 Mo gèle la boucle d'événements, donc TOUTE l'API : 426 ms par requête, trois IP suffisaient
   à immobiliser la production.

**`server/test-acces.js`** — 31 cas, sur une fixture qui porte un `t` et DEUX noms pour un seul
espace : c'est l'absence de ces deux traits qui avait validé à tort une version cassée. Il
démarre un serveur isolé dans un dossier temporaire et ne touche ni la production ni la
configuration. `node server/test-acces.js`. Deux de ses assertions ne vérifiaient d'ailleurs
rien au premier jet — l'une portait sur un champ que la fixture ne créait jamais, l'autre
annonçait 6 Mo et en mesurait 0,2, sur le caractère le moins coûteux.

**La colonne de la boîte mail.** « ＋ Connecter » était au milieu, flanqué d'un bouton réduit à
une icône qui se rendait VIDE — un rectangle gris de 183 px, visible sur la capture. Les deux
boutons descendent en pied de colonne avec un vrai libellé : un bouton réduit à une icône se rend
vide dès que l'icône manque, un libellé jamais.

v566 — un surlignage qui tient vraiment, et une couleur qui dit ce qui sort.

**« Ça ne marche pas sur Mac » : le surlignage ne tenait nulle part.** `cible()` posait sa
marque une seule fois. Or la liste se redessine — une synchro qui arrive, un `save()`, un
retour de réseau — et le redessin remplace les lignes : la marque partait avec elles. Sur un
ordinateur relié à la synchro ça tombait presque à chaque fois ; sur un poste d'essai sans
réseau, jamais. D'où un défaut invisible en test et constant à l'usage. La marque est
maintenant reposée toutes les 120 ms pendant 6 secondes : une ligne reconstruite la retrouve
dans la foulée. On ne recentre pas l'écran à chaque tour, seulement quand la ligne visée a été
remplacée — sinon quelqu'un qui fait défiler serait ramené de force.

**Le halo ne respirait sur aucun navigateur.** Le `!important` posé sur `box-shadow` battait
l'animation : une déclaration importante l'emporte sur une animation dans la cascade. Retiré,
mesures à l'appui — aucune des lignes visées (produit, demande, mouvement, enveloppe) ne pose
d'ombre en style direct, l'anneau gagne sans forcer. Une repli sans `color-mix()` est déclarée
avant, pour les navigateurs qui ne la connaissent pas.

**Rouge pour ce qui sort.** La couleur du halo passe par une variable `--halo` ; `.cible-retrait`
la met au rouge. `mvtRetrait(m)` décide, en lisant le signe des quantités (`du`, `dc`, ou les
lignes d'un lot). Sur un passage mixte, la notification fait deux appels — un rouge pour les
produits repris, un vert pour ceux remis — et chaque ligne porte la bonne couleur.

**La fenêtre « Nouvel utilisateur » débordait, et l'en-tête s'en allait.** Une règle posée
avec les unités d'écran bornait toute fenêtre pleine à `100dvh` — sans lui donner de défilement.
Mesuré : la boîte annonçait 900 px pour 4 901 px de contenu, en `overflow:visible`. Le contenu
sortait donc de la carte, et l'en-tête « collant » cessait de coller — relevé à −3 248 px, hors
écran, une fois défilé en bas. C'est ce que Justin a photographié : un titre qui s'en va, des
lignes qui traversent le verre du pied. Borner une boîte sans lui donner de défilement ne la
borne pas, ça la fait déborder. La règle est retirée : c'est l'overlay qui défile, et l'en-tête
comme le pied s'y collent. Après correction, en-tête relevé à −22 → 49 px, à sa place, et plus
une seule ligne cachée sous le pied.

**Un bon adressé à la main pouvait partir à l'unité, jamais en groupe.** Relevé par le
relecteur : dans « Envoyer les bons prêts », la case à cocher restait conditionnée à `f.email`
alors que la ligne au-dessus affichait déjà l'adresse via `bonEmailDest()`. Un bon portant une
adresse saisie sur place s'affichait avec son adresse en toutes lettres et une case grisée,
impossible à cocher. Corrigé et vérifié sur les trois cas : fournisseur avec e-mail, adresse
saisie sur le bon seul, aucune adresse.

**Deux surlignages coup sur coup ne s'éteignent plus l'un l'autre.** `cible()` retirait la
marque de tous les `.cible-vue` de la page à son extinction, y compris ceux d'un second appel
encore en cours. Chaque appel n'éteint désormais que ce qu'il a lui-même allumé.

**Un bon de commande sans e-mail fournisseur ne renvoie plus ailleurs.** Il affichait « Ajoute
un e-mail au fournisseur (menu Fournisseurs → ✎) » : il fallait quitter le bon, ouvrir un autre
écran, revenir. L'adresse se saisit désormais sur place, avec le choix de l'enregistrer sur la
fiche du fournisseur ou de ne la garder que pour ce bon (`b.emailDest`), et on repart droit vers
l'aperçu du mail avec le PDF joint. La liste des bons prêts et l'envoi groupé honorent la même
adresse. En envoi groupé, un bon sans adresse est sauté en le disant — pas de fenêtre par bon.

**Ce qui N'EST PAS dans cette version, et pourquoi.** Les dossiers de la boîte mail (Envoyés,
Indésirables, Corbeille, Archives) sont écrits, testés et gardés sur la branche
`mail/dossiers-en-attente-auth`. Le gardien les a bloqués : `GET /api/replies` n'a aucune
authentification et son cloisonnement repose sur un `teamId` fourni par l'appelant, bâti sur le
slug public du nom d'entreprise plus quatre caractères. Aujourd'hui le butin serait « les
réponses des fournisseurs » ; avec les dossiers, ce serait le contenu entier des boîtes des
clients. La route doit prouver l'appartenance à l'équipe avant que les dossiers partent. Les
brouillons, eux, ne reviendront pas tels quels : un brouillon est un message que personne n'a
décidé d'envoyer.

**Vérifié en navigateur, pas sur parole** — surlignage sur 1400 px et 390 px : marques posées,
couleurs rouge/vert conformes, survie à un redessin de la liste, extinction à 6 s, zéro erreur
JS. E-mail fournisseur : la fenêtre s'ouvre, refuse une adresse invalide, mène à l'aperçu avec
le PDF, et laisse la fiche du fournisseur intacte quand la case n'est pas cochée.

**Vérifié aussi, sans rien changer** — la chaîne DR d'un bon réceptionné, question posée : le
stock ne bouge pas avant la validation, le mouvement part en file avec son `bcId`, le DR est
prévenu (sauf s'il a réceptionné lui-même), une seconde réception du même bon est bloquée, la
validation crédite la box et passe le bon en « livrée », le refus remet tout en état avec son
motif. Rien à corriger.

v565 — une notification par PASSAGE, et le surlignage devient multiple.

**Le regroupement.** Une personne qui vide sa box en reprend cinq ou six d'affilée : la
cloche affichait six lignes pour un seul geste, six fois le même nom et la même box. Les
mouvements se regroupent désormais par box, par personne et par tranche de 30 minutes — le
temps d'une visite — et la notification porte TOUS les produits. L'identifiant est bâti sur
les identifiants des mouvements triés : il reste le même tant que le groupe ne change pas,
donc « lu » reste lu ; un mouvement de plus dans la demi-heure fait un nouveau groupe, donc
une notification qui redevient non lue, ce qui est voulu.

**`cible()` vise plusieurs lignes.** Les identifiants sont séparés par des virgules : on
marque TOUS les éléments et on amène le PREMIER à l'écran, les autres étant dans la même
liste.

**Huit catégories couvertes**, vérifiées une par une : arrivage (tous les produits reçus),
box à réapprovisionner (tous ceux qui manquent), mouvement de quelqu'un d'autre, stock bas,
demande à valider, mouvement à valider, demande traitée, et mouvement traité — y compris un
LOT, dont les trois produits ressortent ensemble.

Le cache du service worker passe à v762.

## Ancien point

**v564**
v564 — deux corrections d'affichage sur téléphone, hors du garde-fou de la refonte.

**Les hauteurs ne mentent plus.** Dix déclarations du socle calculaient en `vh`, qui compte
la barre d'adresse du navigateur comme si elle n'existait pas : sur iPhone et Android, le bas
du menu, de l'assistant et du panneau de notifications pouvait passer dessous. Chaque
déclaration est DOUBLÉE en `dvh`, jamais remplacée — un navigateur antérieur à Safari 15.4
ou Chrome 108 jette la seconde et garde la première. Remplacer aurait laissé ces appareils
sans hauteur du tout.

**La barre d'état est juste dès la première image.** `applyTheme()` la corrigeait déjà, mais
seulement une fois le JavaScript passé : l'ouverture montrait du navy même en mode jour. La
page pose désormais trois balises — une par réglage système, plus un repli pour les
navigateurs qui ignorent l'attribut — et l'ordre compte, le navigateur retenant la première
dont le média correspond.

Corollaire à ne pas oublier : les DEUX fonctions qui posent cette couleur (`applyTheme()` en
production, `barreSysteme()` sous la garde) tiennent maintenant les trois balises. N'en
corriger qu'une laissait le navigateur en lire une autre — le thème choisi dans
l'application se faisait ignorer par la barre d'état dès que le téléphone disait le contraire.

Le cache du service worker passe à v761.

## Ancien point

**v563**
v563 — les notifications emmènent à la LIGNE, plus seulement à l'écran.

Toucher « Sofia a pris 6 MUSKIL dans Box Démo Nord » ouvrait la box, puis laissait
chercher le produit parmi vingt-deux. La ligne vient désormais se placer au milieu de
l'écran et ressort deux respirations. Trois cas couverts : le produit d'une box, le
mouvement qui attend la validation du DR, et la demande de commande.

Le mécanisme est volontairement générique : les lignes portent un attribut
(`data-pid`, `data-mvt`, `data-dem`) et une fonction `cible(type, id)` ATTEND
l'élément au lieu de le supposer présent — l'écran se redessine en plusieurs temps, et
un simple délai arrivait tantôt trop tôt, tantôt trop tard. Au bout de trois secondes
elle abandonne en silence : la navigation a eu lieu de toute façon, on ne bloque
personne pour un surlignage.

Un anneau plutôt qu'un fond : la ligne garde ses propres couleurs — un produit épuisé
reste rouge, une demande garde son état — et on lit « c'est celle-ci » sans perdre
l'information qu'elle porte déjà. Neutralisé sous « réduire les animations ».

Le cache du service worker passe à v760.

## Ancien point

**v562**
v562 — deux corrections signalées à l'usage, et rien d'autre pour les entreprises.

**Les sorties de box partent en une seule validation.** Les taps successifs sur un
même produit se regroupaient déjà, mais chaque produit différent créait sa propre
demande : retirer trois produits donnait trois validations à traiter une par une au
DR. Tout ce qu'une personne ajuste dans une même box tient désormais dans une seule
demande à plusieurs lignes — la forme des arrivages, que le circuit savait déjà
traiter. Le DR valide une fois, tout s'applique ; il refuse une fois, rien ne bouge.
Les demandes de l'ancienne forme encore en attente continuent d'être traitées comme
avant. Le bon de remise gagne au passage une ligne par produit au lieu d'un total.

**La connexion à Gmail donnait le mauvais conseil.** Google refuse le mot de passe
habituel dès que la validation en deux étapes est active — le réglage par défaut — et
le dit précisément : « 534-5.7.9 Application-specific password required ». Ce cas
tombait dans le test générique « mot de passe incorrect », et l'application proposait
de réinitialiser le mot de passe du compte. Ça ne pouvait rien débloquer : le nouveau
aurait été refusé pareil. Elle envoie maintenant créer un mot de passe d'application,
la clé de 16 caractères que Google exige, et explique où et comment.

Le cache du service worker passe à v759, sinon les appareils gardent l'ancienne copie.

La refonte visuelle, elle, ne quitte toujours pas la bêta : `app.html` porte
`<html lang="fr">` nu, et seule `beta-build.js` pose l'attribut qui l'allume.

## Ancien point

**v561**
v561 — OP GESTION reçoit le dessin d'Apple, le même que la Tour de contrôle depuis
la v2.5 : plus de bordure sur les surfaces, c'est le ton qui sépare les cartes du
fond ; la police du système (SF sur Mac et iPhone) à la place d'Archivo ; une barre
latérale et une barre du haut en verre dépoli, le contenu défile dessous ; la
rubrique active du menu est un vert plein à l'encre blanche ; les boutons pleins
disent l'action, les boutons teintés le reste ; les champs sont en creux avec un
anneau au focus ; les titres grandissent et se resserrent. Rien ne change dans les
données ni dans l'organisation des écrans — c'est la peau de l'application. Tout
est écrit dans un seul bloc de style qui vient en dernier et reprend les noms de
jetons existants : chaque composant change de peau sans qu'on le touche. Les
contrastes tiennent 4,5 pour 1 sur le pire fond, dans les deux thèmes, et « moins
de transparence » retire les verres. Vérifié dans un navigateur, nuit et jour, sur
ordinateur et en largeur téléphone, sans erreur JavaScript.

Ancien point : **v560** — gravée le 6 septembre 2026.

v560 — la bêta a une porte, et c'est le patron qui en tient la clé. Jusqu'ici
teamop.fr/beta.html s'ouvrait à quiconque tapait « admin » et « 1234 » — le
compte de départ de toute installation neuve, que la migration dotait d'office
de ce code — et son espace de synchronisation, chiffré avec la clé par défaut
de l'application, se lisait avec. Le compte de départ n'existe plus dans la bêta ;
un accès d'essai se crée depuis la Tour de contrôle (onglet Accès bêta), se coupe
d'un clic, et un accès coupé ne passe plus, même sur un téléphone resté connecté.
Le serveur porte ces accès (beta-comptes.json), avec le verrou anti-force-brute
de la console. L'application des clients ne change pas de comportement. Et
depuis v559, OP GESTION bouge comme la Tour : la sélection du menu glisse, un
halo suit la souris sur les cartes, le thème se révèle en cercle depuis le bouton,
les chiffres montent à l'arrivée d'un écran, la barre du haut prend son ombre au
défilement — le tout neutralisé sous « réduire les animations ».

Ancien point : **v557** — gravée le 3 septembre 2026.

v557 — revue complète de l'affichage, menée dans un navigateur sur les 16 écrans
et les 17 formulaires, en largeur téléphone (390 px), tablette (768 px) et
bureau, en thème clair et sombre, avec des listes longues et des noms à
rallonge. Trois défauts trouvés et corrigés : des boutons de Paramètres sortaient
de l'écran sur téléphone et restaient inatteignables ; 282 libellés n'étaient
reliés à aucun champ, si bien que les toucher ne plaçait pas le curseur dedans et
qu'un lecteur d'écran n'annonçait rien ; et en thème sombre, les initiales
blanches des pastilles d'avatar tombaient à 2,2 pour 1 sur les couleurs claires —
l'encre s'adapte désormais à la couleur de sa pastille. Le reste est sain : aucun
écran ne plante, aucune erreur JavaScript, et ce qui dépasse au tableau de bord
et au planning est du défilement horizontal voulu.

Ancien point : **v556** — gravée le 3 septembre 2026.

v556 — une demande de commande suit sa commande jusqu'au bout. Jusqu'ici elle
s'arrêtait à « Validée » : le bon de commande qu'elle engendrait vivait sa vie
sans qu'elle le sache, et celui qui l'avait faite ne savait jamais si sa commande
était partie ou arrivée. Les deux sont maintenant reliés, et la demande affiche
l'avancement réel : En attente → Acceptée · En préparation → · Envoyée → · En
livraison → Reçue, ou Refusée avec son motif. Sur téléphone, les lignes de
formulaire ne sont plus coupées — dans Paramètres, « ＋ Abonnement » sortait de
67 px de l'écran et restait inatteignable. Toucher un libellé place enfin le
curseur dans son champ, partout : 282 libellés n'étaient reliés à rien, ce qui
gênait la saisie au doigt et rendait l'application muette pour un lecteur
d'écran. Correctif : le canal d'essai (bêta) n'avait aucune règle Firestore et ne
s'était jamais synchronisé depuis sa création — la production n'a jamais été
concernée. La synchro ne s'éteint plus définitivement au premier refus.

Ancien point : **v555** — gravée le 3 septembre 2026.

v555 — chacun est rattaché à quelqu'un, et le rôle ne décide plus de rien. Un
technicien, un chef d'équipe, n'importe quel compte peut être rattaché à un
valideur : ses mouvements de box et ses demandes partent à CE valideur, et lui
seul les voit. Le rattachement se fait dans les deux sens — depuis la fiche de la
personne (« À qui il est rattaché ») ou depuis celle du valideur, avec une liste à
cocher pour en rattacher plusieurs d'un coup. Une validation se voit désormais des
deux côtés : celui qui valide et celui qui attend. Le rôle n'est plus qu'un nom :
il ne donne plus aucun droit de lui-même, tout vient des cases de Permissions,
posées par la personne qui crée les comptes — et les droits d'hier ont été
recopiés dans ces cases, donc rien ne change tant que personne ne décoche.
Correctif : une personne supprimée ne réapparaît plus dans les listes de choix
(box, groupes, valideurs), et un administrateur ne peut plus être rétrogradé par
une fiche technicien. Sécurité : le mot de passe provisoire ne sort plus de
l'annuaire, et les codes de confirmation ne sont plus conservés dans le journal
des e-mails.

Ancien point : **v554** — gravée le 2 septembre 2026.

v554 — permissions pour tous les rôles et toutes les catégories : le réglage
« Par rôle » (Permissions) s'applique à tous les modules, rubriques réservées
comprises, et à tous les rôles (DR et chef d'équipe inclus) ; Permissions montre
les catégories Tableau de bord et Administration ; un réglage par personne prime
toujours (modules « mis de côté » compris) ; DR et chef d'équipe voient par
défaut Validations DR, Carte des box, Commandes… ; la fiche utilisateur
n'enregistre « à part » que ce qui diffère du rôle (les réglages « Par rôle »
faits plus tard s'appliquent). Box : un compte sans « Tout voir » voit les box
choisies pour lui (fiche utilisateur « Box qu'il voit », Permissions, fiche box
« Autres personnes autorisées », « Responsable » ouvert à tous les rôles) —
corrige le DR qui ne voyait pas ses box ; à la création d'un compte, le rôle
choisi pré-règle vraiment les cases (un DR créé a « Tout voir »). Nouveaux droits
réglables : « Valider les mouvements et demandes (DR) » (validations, alertes « à
valider », validation DR requise) et « Voir / gérer la comptabilité ».

Ancien point : **v553** — gravée le 2 septembre 2026.

v553 — chacun ne voit que ce qui le concerne : sans le droit « voir tout »
(technicien par défaut, ou réglé par personne dans Permissions), le menu, le
tableau de bord, les listes et la cloche ne montrent que ses box, ses bons de
commande, ses demandes, ses mouvements, son véhicule et son historique (avec les
validations du DR qui le concernent). Notifications ciblées : plus d'alertes des
autres services ni des autres box ; validé / refusé par le DR n'est envoyé qu'à
la personne concernée ; le DR voit ce qui attend sa validation ; « vues » rangées
par compte. Réception d'un bon soumise à la validation DR (le stock bouge à la
validation ; refus = bon de nouveau à réceptionner). Tout est compté en unités
(carton de 10 kg = 1 unité). « Envoyer les bons prêts… » : liste à cocher, seuls
les bons cochés partent (fini les deux bons envoyés pour un). Paramètres : carte
« Mon compte » (changer mot de passe, e-mail de récupération) pour tous, outils
de test réservés à TEAM OP, bouton Déconnexion (aussi en bas du menu), OP
MESSAGES réservé à TEAM OP tant qu'il est en développement.

Ancien point : **v552** — gravée le 2 septembre 2026.

v552 — une personne supprimée l'est partout : la suppression d'un utilisateur
archive sa fiche technicien (l'historique garde son nom) et le retire des box,
véhicules, groupes, chefs et du planning à venir ; supprimer un technicien qui a
un compte passe par la suppression du compte (code de confirmation). Plus de
doublons : création reliée à la fiche ou au compte existant du même nom, bouton
« Fusionner les doublons » dans Techniciens ; « Visible par » d'un box sans noms
répétés. Réception d'un bon : des cartons sans « unités par carton » comptent
1 unité chacun (jamais 0), le conditionnement de la fiche produit est repris.
Produits d'un box : ce qui est en stock d'abord (plus gros stocks en tête).

Ancien point : **v551** — gravée le 2 septembre 2026.

v551 — « Mot de passe oublié » demande l'entreprise quand l'appareil n'est
relié à rien (ou que le compte est chez une autre entreprise), met l'appareil sur
son espace et se rouvre tout seul, identifiant et e-mail pré-remplis. La bascule
d'espace par le nom (connexion et mot de passe oublié) passe par un seul chemin.
Tour : l'abonnement se règle dans la fiche entreprise (formule, places, statut
actif / essai / impayé / suspendu / annulé, date de fin) et prime sur Stripe et les
codes promo. Site : page reinit.html en français pour les liens Firebase
(réinitialisation de mot de passe) — à régler comme « URL d'action » dans la
console Firebase.

Ancien point : **v550** — gravée le 2 septembre 2026.

v550 — un seul lien de connexion par entreprise, lisible
(teamop.fr/app.html#e=nom-de-l-entreprise), le même sur le site et dans
l'application : l'app le demande au serveur et l'affiche dans Paramètres et sur la
fiche d'accès (« activé ✓ »), le lien codé reste en secours. L'écran de connexion
d'un appareil non relié propose le champ « Entreprise » : le nom du lien suffit,
l'identifiant est conservé, puis mot de passe. Le site (connexion.html) accepte le
lien collé tel quel. Devis et factures : société unique appliquée d'office, comme
les bons. Tour de contrôle : onglet « Connexions » (qui se connecte, quand, depuis
quel appareil, quelle version, par quel chemin, échecs) et section Connexions sur
chaque fiche entreprise ; l'application remonte chaque connexion. Annonce v550.

Ancien point : **v549** — gravée le 2 septembre 2026.

v549 — bons de commande multi-sociétés : les sociétés déclarées dans
Paramètres → Mes sociétés sont proposées sur chaque bon (« Société (en-tête) »),
le PDF et l'impression prennent le nom et la couleur de la société choisie ;
une seule société est appliquée d'office. Annonce v549 envoyée aux entreprises.

Ancien point : **v548** — gravée le 2 septembre 2026.

v548 — les comptes créés par l'entreprise se connectent vraiment : les données de
l'équipe arrivent avant l'écran de connexion (appareil neuf via le lien), l'écran
dit « Vous allez vous connecter à l'entreprise X », mot de passe provisoire
obligatoire envoyé par e-mail avec le lien de l'entreprise, e-mail de récupération
obligatoire à la 1re connexion, compte supprimé ou désactivé déconnecté aussitôt.
Bons de commande : en-tête au nom de l'entreprise (réglage dans Paramètres),
téléphone sur place des box. Service worker : « Mise à jour disponible » et
« Mettre à jour » fiables même sur réseau lent, copie hors ligne jamais perdue.

Ancien point : **v547** — gravée le 22 août 2026.

v547 — le journal des mouvements refait (cases pliées par jour et par box,
bons de remise intégrés, Donné à, étiquettes automatiques, recherche), et
l'analyse de consommation complète (courbe cliquable, repères sur les produits
donnés, comparaison au mois précédent, sections par personne et par mois).

Ancien point : **v546** — gravée le 20 août 2026.

Ce que contient cette version (les deux liens la portent) :
- Circuit client 100 % automatique : demande (tous champs obligatoires, nom du lien
  vérifié disponible, code teste qui dicte la formule) → e-mails automatiques (logo
  embarqué) → première connexion par le lien uniquement (identifiant = prénom,
  mot de passe provisoire = Nom!!, vrai mot de passe choisi à la 1re connexion)
- Paiement/code : formule verrouillée tant que non payée (menu grisé 🔒), code promo
  du site relayé à l'application, un seul code à la fois, échéances visibles
- Box : validation DR en permission par utilisateur, unités seules, commande liée à
  l'arrivage (Envoyée → Arrivée → Livrée), bon de remise PDF
- Tour v2.54 : panneau lien complet + envoi e-mail, repartir à neuf, code promo sur
  fiche, activité par onglet + problèmes, boîte mail des envois, surveillance de
  toutes les entreprises, journal des e-mails
- Synchronisation Firestore réparée (connexion anonyme), suppression totale
  d'entreprise (données + compte du site)

## Revenir à ce point en cas de pépin
git checkout main && git log --oneline | grep "v546"   # retrouver le commit
git revert <commits fautifs>  puis  git push origin main

## La règle de travail (depuis le 20 août au soir)
Toute nouveauté passe D'ABORD par la bêta (teamop.fr/dev.html → OP GESTION BÊTA).
Justin teste avec « teamop teste ». La production ne bouge que sur son « publie ».
