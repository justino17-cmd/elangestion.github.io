---
name: "diagnostic-avant-hypothese"
description: "Établir OÙ ça échoue avant de chercher POURQUOI. Use when something fails and the cause is not directly observed — before writing any fix."
---

# Diagnostic avant hypothèse — TeamOP

## Description

Une hypothèse coûte cher : elle produit un correctif, une publication, une vérification, et
souvent une deuxième panne. Le 3 septembre, deux correctifs successifs ont été livrés sur des
causes inventées — une course au démarrage, puis un jeton mal propagé — alors qu'il suffisait
de lire `_fbDoc.path` pour voir que l'application écoutait `elanB_teams`, une collection sans
aucune règle. Trente secondes contre une heure.

## L'ordre

1. **Où ?** Quel chemin, quelle collection, quelle fonction, quelle ligne. On observe, on ne
   suppose pas.
2. **Quoi exactement ?** L'erreur entière, pas son résumé. Un message tronqué a caché
   « permission denied » sur un chemin qu'on n'avait pas regardé.
3. **Comparer deux cas.** Ce qui marche contre ce qui échoue, au même instant. Une lecture
   directe qui passe pendant qu'un écouteur échoue dit où chercher.
4. **Alors seulement : pourquoi.**

## Règles

1. **Ne jamais corriger une cause qu'on n'a pas constatée.** « C'est probablement… » est le
   signal qu'il manque une mesure.
2. **L'environnement d'abord.** Un canal d'essai n'a pas les mêmes chemins, ni les mêmes
   règles, ni les mêmes préfixes que la production. `beta-build.js` réécrit `'elan_` en
   `'elanB_` — y compris dans des noms de collection.
3. **Deux hypothèses fausses d'affilée : arrêter d'émettre, aller mesurer.**
4. **Dire ce qu'on ne sait pas.** « Je ne sais pas encore pourquoi » vaut mieux qu'un
   correctif posé au hasard, surtout en production.
5. **Un correctif inutile n'est pas gratuit** : il occupe le terrain, brouille la lecture, et
   fait croire le problème traité.

## Contrôle avant d'écrire un correctif

- [ ] le point d'échec est observé, pas déduit
- [ ] l'erreur complète a été lue
- [ ] un cas qui marche a été comparé au cas qui échoue
- [ ] la différence entre les deux explique la panne
