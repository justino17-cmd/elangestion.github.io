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
