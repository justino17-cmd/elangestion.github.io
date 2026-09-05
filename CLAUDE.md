# TeamOP

Suite logicielle pour entreprises de terrain — nettoyage, lutte anti-nuisibles.
Applications : OP GESTION (interventions, clients, devis) et OP MESSAGES (messagerie).
Vendu par abonnement, clients réels, données réelles. **Ce dépôt est en production.**

## Structure

- **Racine** — site vitrine et applications, HTML/CSS/JS sans framework, servi par GitHub Pages
- **`server/`** — API Node/Express déployée sur un VPS, hors GitHub Pages
- **`.github/workflows/`** — surveillance horaire du site et de l'API

Pas de compilation, pas de bundler. Ce qui est écrit est ce qui est servi.

## Le serveur

`server/index.js` — environ 1 300 lignes, 43 routes. Écoute sur `127.0.0.1:8080`,
**derrière nginx** (d'où `app.set('trust proxy', 1)`).

Dépendances : `express`, `imapflow` + `mailparser` (réception des courriels),
`nodemailer` (envoi), `web-push` (notifications), `@anthropic-ai/sdk`.

**Stripe n'est pas une dépendance** : l'API est appelée directement par `fetch`
vers `api.stripe.com`. Une bibliothèque de moins à maintenir et à auditer — garder
cette approche.

`server/agent-devis.js` — assistant de rédaction de devis. Modèle `claude-opus-5`,
un seul outil (`creer_devis`), plafond de 100 appels par jour, code d'accès d'équipe.
**Ce fichier envoie des données de clients réels à Anthropic** : nom, adresse, ville.
Toute modification touchant au contexte transmis a une portée juridique — voir
`sous-traitance.html`.

### Commandes

Il n'y a **pas de `package.json` à la racine** : tout se lance depuis `server/`.

```bash
cd server && npm start             # démarre le serveur (port 8080)
cd server && npm audit --omit=dev  # failles dans les dépendances de production
node --check server/index.js       # contrôle de syntaxe, depuis la racine
```

**Aucun test sur cette branche.** La suite existante — 17 tests `node --test`
avec `supertest` — vit sur `audit/plan-action` ; voir la dernière section.

### Essayer le serveur en local

La configuration vit sur le VPS, pas dans le dépôt. Trois variables permettent de
lancer le serveur isolément, sans toucher à la production :

```bash
TEAMOP_CONFIG=/chemin/config.json TEAMOP_DATA=/chemin/data PORT=8099 node server/index.js
```

Le fichier de configuration doit contenir au minimum `vapidPublicKey` et
`vapidPrivateKey` (générables avec `web-push`), sinon le démarrage échoue.

## Déploiement

### Accès

```bash
ssh root@api.teamop.fr    # Ubuntu 24.04, Node v22.23.1
```

`server/install.sh` s'exécute **sur le VPS** : clone dans `/opt/teamop/repo`,
configuration dans `/opt/teamop/config.json` (chmod 600), données dans
`/opt/teamop/data`, service systemd `teamop-api`.

```bash
systemctl status teamop-api          # état
journalctl -u teamop-api -f          # journaux en direct
journalctl -u teamop-api | grep '^devis '   # appels d'outil de l'assistant devis
```

## Conventions

- **Français partout** : code, commentaires, messages de commit, interface.
- Les commentaires expliquent *pourquoi*, pas *quoi*. Ce dépôt en compte de bons —
  s'en inspirer plutôt que de les diluer.
- Fait main plutôt qu'une dépendance de plus, quand c'est raisonnable : le serveur
  est exposé sur Internet, chaque dépendance est une surface d'attaque.

## À ne pas faire

- Ne jamais committer `config.json`, `.env`, ni le contenu de `.claude-flow/`
- Ne pas toucher à `/opt/teamop/config.json` depuis le dépôt : il vit sur le VPS
- Ne pas modifier l'anti-abus (`server/index.js`) sans relire pourquoi il lit
  `req.ip` et non l'en-tête brut — un en-tête fourni par le client se falsifie
- Ne pas écrire de données personnelles de clients dans les journaux

## Attention : deux copies de travail

Ce dépôt est cloné deux fois sur cette machine :

- `~/Documents/GitHub/elangestion.github.io` — branche `main`, **le code de production**
- `~/TeamOP` — branche `audit/plan-action`, **625 commits de retard**

Son `server/index.js` fait 308 lignes contre 1 300 ici. Toute correction du serveur
va dans cette copie-ci. Vérifier la branche avant d'écrire quoi que ce soit.
