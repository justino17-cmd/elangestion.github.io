# Point stable TeamOP

**Version stable : v566** — gravée le 7 septembre 2026.

v566 — les dossiers de la boîte mail, et un surlignage qui tient vraiment.

**La boîte mail a enfin ses dossiers.** Envoyés, Brouillons, Indésirables, Corbeille,
Archives : le serveur les repère par leur RÔLE IMAP (`specialUse`) et non par leur nom, parce
que Gmail en français appelle sa boîte d'envoi « [Gmail]/Messages envoyés » là où OVH dit
« Sent ». Vingt-cinq mails par dossier, pas plus : la boîte de Justin compte 830 indésirables
et personne ne les relit sur un téléphone en 4G. Un dossier vide ne s'affiche pas. « Envoyés »
mêle ce qui est parti depuis l'application et le dossier de la vraie boîte, triés par date —
deux rubriques portant le même mot auraient été absurdes.

**Ce qu'on a corrigé au passage, et qu'on n'avait pas vu.** La pastille de la Réception
comptait TOUS les mails, dossiers compris : avec les indésirables, elle aurait annoncé des
centaines de messages à lire. Et le plafond de `/api/replies` était global : 250 archives plus
récentes auraient chassé la réception de la liste. Le plafond est désormais par dossier ET par
boîte, la réception garde ses 200, et le corps des mails de dossier part en extrait de 400
caractères — mesuré : sinon la réponse passait de 425 Ko à 955 Ko sur un téléphone de chantier.
Le texte entier reste sur le disque du serveur, seul l'envoi est allégé.

**Le surlignage ne tenait pas — et c'est pour ça qu'il « ne marchait pas sur Mac ».**
`cible()` posait sa marque une fois. Or la liste se redessine (une synchro qui arrive, un
`save()`, un retour de réseau) et le redessin remplace les lignes : la marque partait avec
elles. Sur un ordinateur relié à la synchro ça tombait presque à chaque fois ; sur un poste
d'essai sans réseau, jamais — d'où un défaut invisible en test et constant à l'usage. La
marque est maintenant reposée toutes les 120 ms pendant 6 secondes : une ligne reconstruite la
retrouve dans la foulée. On ne recentre pas l'écran à chaque tour, seulement quand la ligne
visée a été remplacée, pour ne pas ramener de force quelqu'un qui fait défiler.

**Le halo ne respirait sur aucun navigateur.** Le `!important` posé sur `box-shadow` battait
l'animation — une déclaration importante l'emporte sur une animation dans la cascade. Retiré,
mesures à l'appui : aucune des lignes visées ne pose d'ombre en style direct, l'anneau gagne
sans forcer. Et il porte enfin une couleur : **rouge pour ce qui est SORTI** de la box, vert
pour ce qui y est entré. Sur un passage mixte, deux appels distincts marquent chaque produit
de la bonne couleur.

**Un bon de commande sans e-mail fournisseur ne renvoie plus ailleurs.** Il affichait « Ajoute
un e-mail au fournisseur (menu Fournisseurs → ✎) » : il fallait quitter le bon, ouvrir un
autre écran, revenir. L'adresse se saisit désormais sur place, avec le choix de l'enregistrer
sur la fiche du fournisseur ou de ne la garder que pour ce bon (`b.emailDest`), et on repart
droit vers l'aperçu du mail avec le PDF joint. L'envoi groupé honore la même adresse.

**Vérifié en navigateur, pas sur parole** — surlignage : marques posées, couleurs, survie à un
redessin, extinction à 6 s, sur 1400 px et 390 px. Dossiers : six onglets, comptes exacts,
pastille à 3 et non à 11. Chaîne DR d'un bon réceptionné : le stock ne bouge pas avant la
validation, le mouvement part en file avec son `bcId`, le DR est prévenu (sauf s'il a
réceptionné lui-même), la double réception est bloquée, la validation crédite la box et passe
le bon en « livrée », le refus remet tout en état avec son motif.

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
