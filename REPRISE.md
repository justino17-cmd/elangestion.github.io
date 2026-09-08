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

## ⛔ La dette la plus grave : cinq routes de messagerie sans authentification

`server/index.js` expose **cinq routes qui ne vérifient rien** :

| Ligne | Route |
|---|---|
| 489 | `POST /api/mailbox/connect` |
| 522 | `POST /api/mailbox/disconnect` |
| 528 | `GET /api/mailboxes` |
| 641 | `GET /api/replies` |
| 716 | `POST /api/sendmail` |

Ce n'est **pas une fonctionnalité bloquée, c'est une fuite de correspondance client.**
`/api/replies` rend les réponses reçues — le contenu des messages que les clients de nos
clients écrivent. `/api/sendmail` est pire : elle laisse **envoyer** du courrier depuis nos
boîtes, à qui veut.

Ces routes sont sur `main`, donc en production. Le chantier est **réservé au `gardien`** : on
ne rustine pas une route d'authentification à la main sur cinq entrées d'un coup. C'est lui
qui a établi l'étendue du trou.

Conséquence tant que ce n'est pas réglé : le chantier des **dossiers de messagerie**
(branche `mail/dossiers-en-attente-auth`) reste en attente. Il se pose par-dessus cette
authentification, pas à côté.

---

## Chantiers en cours

### Refonte de la Tour
Branche de travail `claude/op-gestion-interface-yb6p32`, publication par
`publication/tour-etape2`.

**`tour.html` est délibérément gardé hors de `main`.** La règle du dépôt : *rien ne remplace
une page utilisée par les clients sans que Justin l'ait testée.* Le canal de test est
`apercu/` (voir `CLAUDE.md`, section « Refonte et aperçu »), servi sur
`https://teamop.fr/apercu/…` — même origine, donc l'API et la session fonctionnent.

**Fusionner la branche de travail entière pousserait cette page non validée en production.**
Détacher le commit voulu sur une branche neuve partie de `main`, comme pour la PR #66.

En attente d'une réponse de Justin : le modèle de rangement de l'onglet **Entreprises**. S'il
valide, il s'applique aux trois autres — Connexions clients rangé par entreprise, Accès en
deux côtés bêta/public, Surveillance par catégorie.

### Le dessin
`apple-design` (le mouvement) et `apple-visual-craft` (le regard : formes, matières, typo)
sont dans le dépôt et **pas encore ouverts**. Ils vont ensemble. C'est la partie où on risque
le plus de faire au hasard : les charger avant de dessiner, pas après.

---

## Dettes connues, chacune à traiter seule

- **`FOURNISSEURS_ELAN` (`app.html:4496`)** — la liste des fournisseurs d'UNE entreprise,
  écrite en dur et servie à TOUS les clients. Exactement la même faute que `REPORT_TEMPLATES`,
  vidée le 5 septembre 2026 ; celle-ci est encore armée. Trois points d'usage (4496, 4516,
  4578). À corriger à part, jamais au milieu d'un autre chantier.

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
