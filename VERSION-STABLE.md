# Point stable TeamOP

**Version stable : v550** — gravée le 2 septembre 2026.

v550 — un seul lien de connexion par entreprise, lisible
(teamop.fr/app.html#e=nom-de-l-entreprise), le même sur le site et dans
l'application : l'app le demande au serveur et l'affiche dans Paramètres et sur la
fiche d'accès (« activé ✓ »), le lien codé reste en secours. L'écran de connexion
d'un appareil non relié propose le champ « Entreprise » : le nom du lien suffit,
l'identifiant est conservé, puis mot de passe. Annonce v550 aux entreprises.

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
