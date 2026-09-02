# Point stable TeamOP

**Version stable : v553** — gravée le 2 septembre 2026.

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
