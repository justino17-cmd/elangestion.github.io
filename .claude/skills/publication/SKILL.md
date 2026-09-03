---
name: "publication"
description: "Le rituel de mise en ligne d'une version TeamOP — version, cache, journal, annonce, bêta régénérée, CI verte, vérification du fichier servi. Use when publishing any version of app.html, sw.js or server/index.js."
---

# Publication — TeamOP

## Description

Publier n'est pas « fusionner ». Une version part sur deux canaux qui se déploient
différemment : **GitHub Pages** sert `app.html` et `sw.js` dès la fusion ; le **VPS** ne prend
`server/` que par le workflow de déploiement. Oublier un repère laisse une version incohérente
en ligne sans que rien ne le signale.

## L'ordre, sans en sauter

1. `APP_VERSION` dans `app.html`
2. `CACHE` dans `sw.js` — sinon les appareils gardent l'ancienne copie
3. `VERSION-STABLE.md` — le nouveau point en tête, l'ancien en « Ancien point »
4. `ANNONCE.version` et son texte dans `server/index.js`, écrits **du point de vue de
   l'entreprise**, jamais du code
5. `node beta-build.js` — `beta.html` est GÉNÉRÉE, jamais modifiée à la main
6. `node scripts/verifier-syntaxe.js`
7. PR, **attendre la CI verte**, puis fusionner
8. Vérifier le fichier **servi** : `curl teamop.fr/app.html`, `curl teamop.fr/sw.js`,
   `curl api.teamop.fr/health` — pas le dépôt

## Règles

1. **Ne jamais fusionner avant que la CI soit verte.** « Elle va sûrement passer » n'est pas
   une vérification.
2. **L'annonce ne part jamais de l'assistant.** Le texte se prépare, le patron clique dans la
   Tour. Un e-mail à toutes les entreprises n'est pas une décision d'assistant.
3. **Un correctif de sécurité ne s'attend pas.** Il se publie seul, tout de suite, même si un
   lot est en cours.
4. **Une seule annonce par lot.** Publier dix fois est sain ; annoncer dix fois ne l'est pas.
5. `/health` répond `annonce` : c'est le seul moyen de savoir si le VPS a vraiment pris le
   commit. Un serveur redémarré sur l'ancien code ne dit rien de lui-même.

## Contrôle avant de dire « c'est en ligne »

- [ ] `APP_VERSION`, cache SW, journal, annonce : tous les quatre bougés
- [ ] `beta.html` régénérée, jamais éditée
- [ ] CI verte AVANT la fusion
- [ ] fichier servi vérifié, pas le dépôt
- [ ] `/health` porte la bonne version d'annonce
