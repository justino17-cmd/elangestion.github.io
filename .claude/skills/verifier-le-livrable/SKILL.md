---
name: "verifier-le-livrable"
description: "Ne jamais déclarer vérifié sur une simulation. Vérifier le fichier livré, puis le résultat en ligne. Use before claiming any fix works, on this codebase or any other."
---

# Vérifier le livrable — TeamOP

## Description

Le 3 septembre 2026, trois pannes en une soirée ont eu la même cause : **avoir vérifié un
substitut au lieu de la chose livrée.**

- Onze assertions sur des fonctions réécrites dans le test passaient — pendant que le
  fichier livré ne s'analysait plus. Page blanche en production, quarante minutes.
- Un correctif de sécurité déclaré vérifié : le champ divulgué avait bien changé, mais le
  comparateur qui consommait la valeur n'avait jamais été relu. Le contournement restait ouvert.
- Deux diagnostics de synchro successifs, tous deux faux, faute d'avoir regardé **où**
  l'application écrivait avant de chercher pourquoi elle était refusée.

## La règle

**Ce qui est testé doit être ce qui est livré.** Un test qui réécrit la fonction ne teste que
la réécriture.

## Les trois niveaux, dans l'ordre

1. **Le fichier livré s'analyse-t-il ?** `node --check` pour le serveur,
   `node scripts/verifier-syntaxe.js` pour les pages. C'est le plancher, jamais le plafond.
2. **Le comportement, extrait du livrable.** Lire la fonction *depuis le fichier* et l'évaluer,
   plutôt que d'en écrire une copie dans le test.
3. **Le résultat en ligne.** `curl` le fichier servi ; ouvrir la page dans un navigateur et
   constater l'état réel. C'est le seul niveau qui prouve quelque chose à l'utilisateur.

## Règles

1. **« Le code est présent » n'est pas « ça marche ».** Trois fois de suite ce soir, le code
   était bien en ligne et le résultat absent.
2. **Relire le consommateur, pas seulement le producteur.** Changer ce qu'une route rend ne
   sert à rien si ce qui lit la valeur l'accepte encore.
3. **Un commentaire `//` au milieu d'une instruction sur une seule ligne avale la fin de la
   ligne.** Dans ce dépôt, beaucoup d'instructions tiennent sur une ligne : commentaire de bloc
   obligatoire.
4. **Mesurer, pas déduire.** Recomposer la transparence avant de juger un contraste ;
   distinguer *coupé* de *défilable* ; lire `_fbDoc.path` avant de théoriser sur les permissions.
5. **Un test qui échoue est une information, pas un obstacle.** Comprendre pourquoi avant de
   corriger le test.

## Contrôle avant de dire « vérifié »

- [ ] le fichier livré analysé, pas une copie
- [ ] le comportement extrait du livrable, pas réécrit
- [ ] le résultat constaté en ligne
- [ ] le code qui consomme la valeur modifiée a été relu
