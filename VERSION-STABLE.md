# Version stable des entreprises

- **Application : v538** (cache elan-gestion-v734)
- **Commit de référence : 16d1e1f** (branche main)
- **Scellée le : 19 août 2026** après la passe complète de vérification
  (12 suites de tests, parcours critiques, 46 vues, 0 erreur JS, 0 débordement).

## Règle de travail
Le développement passe par **beta.html** (et messages-beta.html), testé avec
l'entreprise « teamop teste ». Rien ne part en production sans le « publie »
de Justin. Retour arrière d'urgence : `git checkout <commit ci-dessus> -- app.html sw.js`
puis commit sur main.
