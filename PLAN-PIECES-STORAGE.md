# Augmenter la taille : sortir les pièces du document Firestore

Demandé par Justin le 11 septembre 2026, pendant l'incident ELAN. Ce fichier est le plan prêt
à exécuter — rien ici n'est encore fait.

## Le point dur, et pourquoi l'abonnement n'y change rien

Toute la base d'une entreprise part chiffrée dans **UN document Firestore**, plafonné à
**1 Mio**. C'est une limite **structurelle**, identique sur le forfait gratuit (Spark) et sur
le forfait payant (Blaze) : **aucun abonnement ne la relève.** Les photos d'intervention et les
pièces jointes, stockées en base64 *dans* ce document, l'ont fait dépasser chez ELAN — Firestore
a refusé chaque écriture (400, « Write stream exhausted maximum allowed queued writes »), donc
plus aucune synchro, sur tous les appareils à la fois.

Deux pare-feux ont été posés le jour même, et ils tiennent le fort — mais ce ne sont que des
pare-feux :

- **v645/v646 `syncAlleger()`** : la copie poussée tient sous 620 Kio ; les pièces les plus
  lourdes restent sur l'appareil qui les a prises, marquées, annoncées. Elles **ne se partagent
  pas** — c'est le prix payé pour que la synchro reparte.
- **v646** : une écriture qui ne passe pas ne bloque plus l'application tant que le réseau
  répond.

## Ce que fait la bascule vers Storage

Les pièces (`docs[].data`, `photos[]`, `signature`, `logo`) quittent le document et vont dans
**Firebase Storage**, qui n'a pas cette limite (des Go par fichier). Le document Firestore ne
porte plus que du texte et des **références**. Résultat : plus d'allègement, toutes les pièces
se partagent, et la base a la place de grandir pendant des années.

## Les étapes, dans l'ordre

1. **Activer Storage sur le projet `elan-gestion`.** Console Firebase → Storage. Peut réclamer
   le forfait Blaze (paiement à l'usage) — *c'est là, et seulement là, que l'abonnement sert.*
2. **Publier `storage.rules`** (déjà écrit, à la racine du dépôt). Il exige la **même preuve que
   Firestore** : le jeton d'équipe signé par notre serveur, l'entreprise dans `claims.t`. Une
   pièce ne se lit que dans le dossier de son entreprise (`equipes/{t}/…`).
   ⚠️ Ne pas publier avant que l'application n'écrive : sans règles, le bucket est fermé.
3. **Côté application (sur la bêta d'abord)** :
   - à l'ajout d'une photo ou d'une pièce : envoi vers `equipes/{t}/{collection}/{id}/{uid}`,
     et on ne garde dans la base que `{ref, nom, type, ts, taille}` ;
   - à l'affichage : URL de téléchargement mise en cache, avec repli propre si la pièce
     n'est pas encore arrivée ;
   - **hors ligne** : la pièce reste en base64 locale et part quand le réseau revient — le
     terrain travaille sans réseau, c'est non négociable ;
   - `syncAlleger()` devient une sécurité de dernier recours, plus le fonctionnement normal.
4. **Migration des pièces déjà en base.** Au chargement, une par une, sans bloquer : une pièce
   base64 trouvée est envoyée vers Storage, remplacée par sa référence, et le document maigrit
   à chaque passage. Jamais en bloc — la règle « rien ne s'écrit au seul chargement » impose
   d'y aller par gestes bornés et de le dire.
5. **Ménage des orphelines**, côté serveur : une pièce dont plus aucun enregistrement ne porte
   la référence est supprimée. Les appareils n'ont pas le droit de supprimer (voir
   `storage.rules`) — une pièce effacée depuis un téléphone serait perdue pour toute l'équipe.

## Ce qu'il faudra surveiller

- **Le coût.** Storage se facture au stockage et au trafic. Photos compressées à 1200 px : de
  l'ordre de quelques centaines de Ko par intervention. À chiffrer sur le volume réel d'ELAN
  avant de généraliser.
- **Le jeton.** Storage exige la même preuve que Firestore : si `/api/fb/jeton` ne signe plus
  (clé d'administration absente du serveur, comme le 11 septembre), **les pièces deviennent
  illisibles**. La clé d'administration Firebase doit être remise sur le VPS, et surveillée,
  AVANT cette bascule.
- **Le compteur.** Garder la ligne de console `synchro allégée … plus lourds : …` : c'est elle
  qui dit si le document recommence à gonfler.
