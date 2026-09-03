---
name: "revue-affichage"
description: "Revue d'affichage de l'application TeamOP dans un vrai navigateur — écrans, formulaires, largeurs, thèmes, listes longues. Use when reviewing UI quality or hunting display bugs on app.html / beta.html."
---

# Revue d'affichage — TeamOP

## Description

L'application est utilisée sur le téléphone d'un technicien, souvent en thème sombre, avec des
noms de clients à rallonge. Les défauts d'affichage ne se voient pas dans le code : ils se
mesurent dans un navigateur. Cette revue est une procédure, pas un coup d'œil.

## Le terrain

Se connecter sur `teamop.fr/beta.html` (`admin` / `1234` sur un espace neuf), puis parcourir :

- **16 écrans** par `go(vue)` — changer le `#` ne déclenche pas le routeur, la mesure serait fausse
- **17 formulaires** par `formClient()`, `formUser()`, `formBox()`… Le conteneur est
  `#overlay` ; il est en `position: fixed`, donc **`offsetParent` vaut null** : tester
  `classList.contains('open')`, pas la visibilité
- **3 largeurs** : 390 px (téléphone), 768 px (tablette), bureau
- **2 thèmes** : `setThemePref('sombre')` autant que le clair
- **des listes longues** : remplir `db.clients` et `db.interventions` en mémoire avec des noms
  volontairement longs — **sans jamais appeler `save()`**, qui enverrait tout dans Firestore

## Mesurer juste

1. **Coupé n'est pas défilable.** Un élément qui dépasse dans un parent `overflow-x: auto` est
   voulu. Le tableau de bord (`.tdb-grid`) et le planning (`.plg-wrap`) sont des grilles
   défilantes : y compter des « défauts » est une erreur de mesure.
2. **Recomposer la transparence avant de juger un contraste.** `rgba(74,222,128,0.16)` est un
   vert à 16 % sur le fond, pas un vert plein. Empiler les couches jusqu'à une couche opaque,
   sinon toutes les pastilles ressortent en faux positifs.
3. **Seuils** : 4,5:1 pour le texte courant, 3:1 au-delà de 24 px (ou 18,66 px en gras).
4. **La console d'abord.** Une erreur JavaScript au chargement vaut dix défauts visuels.

## Défauts déjà trouvés par cette procédure

- Boutons de Paramètres hors écran sur téléphone dans un conteneur non défilable
- 282 libellés reliés à aucun champ — toucher le libellé ne focalisait pas
- Initiales d'avatar en blanc sur pastille claire, 2,2:1 en thème sombre

## Contrôle

- [ ] 16 écrans × 3 largeurs × 2 thèmes
- [ ] 17 formulaires ouverts et mesurés
- [ ] listes longues, sans `save()`
- [ ] coupé distingué de défilable
- [ ] transparence recomposée avant tout verdict de contraste
- [ ] console sans erreur
