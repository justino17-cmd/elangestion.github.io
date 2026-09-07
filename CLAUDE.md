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

`server/index.js` — environ 3 270 lignes, 80 routes (vérifié le 6 septembre 2026 ; il a
doublé depuis la première rédaction de cette fiche). Écoute sur `127.0.0.1:8080`,
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
- **Ne jamais piloter `app.html` avec Chrome DevTools MCP** — voir la section suivante

## Chrome DevTools MCP — mesurer pour de vrai, sur la bêta seulement

`.mcp.json` déclare un seul serveur : `chrome-devtools` (lancé par `npx`, avec
`--no-usage-statistics`). Il donne un vrai Chrome piloté — captures, console avec pile
d'appels, réseau, et surtout **trace de performance**. C'est le seul moyen de mesurer ce que
`app.html` coûte réellement : plus de 2 Mo en fichier unique, chargés sur des téléphones de
terrain en 4G. Le skill `performance-budget-monitor` décrit le budget ; sans cet outil,
personne ne pouvait le vérifier.

**Le navigateur doit exister LÀ OÙ TOURNE LA SESSION**, pas sur le Mac de qui la pilote. Une
session distante (Claude Code sur le web ou l'app) tourne dans un conteneur Linux : c'est lui
qui doit avoir un navigateur. D'où `--executablePath /opt/pw-browsers/chromium` dans
`.mcp.json` — un lien symbolique vers le Chromium de l'image, stable d'une version à l'autre.
Sur un Mac où Chrome est installé, remplacer cette ligne par le chemin de Chrome
(`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`) ou retirer les deux lignes :
il est alors trouvé tout seul.

⚠️ **Dans un environnement distant, viser `127.0.0.1`, jamais `teamop.fr`.** Le proxy sortant
coupe les connexions du navigateur (`ERR_CONNECTION_RESET`) ; seul le local passe. On sert donc
le dépôt et on pointe dessus :

```bash
node -e "const h=require('http'),f=require('fs'),p=require('path');h.createServer((q,r)=>{const x=p.join(process.cwd(),q.url.split('?')[0]);f.readFile(x,(e,d)=>e?(r.writeHead(404),r.end()):(r.writeHead(200,{'Content-Type':x.endsWith('.js')?'text/javascript':'text/html;charset=utf-8'}),r.end(d)))}).listen(8123,'127.0.0.1')" &
# puis viser http://127.0.0.1:8123/beta.html
```

C'est même préférable pour concevoir : on juge le fichier qu'on vient de modifier, pas la
version publiée il y a deux heures.

⏱️ **Toujours passer `timeout: 60000` à `new_page`.** Le défaut est de 10 s ; `app.html` et
`beta.html` font 2,6 Mo et ne finissent pas de charger à temps — on obtient sinon
« Navigation timeout of 10000 ms exceeded » alors que tout va bien.

Les trois `--chromeArg` de `.mcp.json` (`--no-sandbox`, `--disable-gpu`,
`--disable-dev-shm-usage`) sont indispensables en conteneur : sans le premier, le navigateur
meurt au lancement (« Target closed »). Chaîne vérifiée de bout en bout le 7 septembre 2026 —
poignée de main MCP, lancement du navigateur, page rendue.

⛔ **Bêta uniquement, sans exception.** Le serveur expose au client MCP **tout** le contenu
de la page ouverte. Sur `app.html` en production, ce sont des noms, des adresses et des
coordonnées de vrais clients — un flux de données qui n'est pas couvert par
`sous-traitance.html`. On ne pointe donc le navigateur piloté que sur `beta.html` ou une
copie d'aperçu : la bêta est isolée par construction (préfixe `elanB_`, espace
`elan-gestion-beta`, jamais de données d'entreprise). Cette règle est écrite aussi dans les
agents `concepteur` et `testeur`, qui sont les deux à s'en servir.

## Attention : deux copies de travail

Ce dépôt est cloné deux fois sur cette machine :

- `~/Documents/GitHub/elangestion.github.io` — branche `main`, **le code de production**
- `~/TeamOP` — branche `audit/plan-action`, **625 commits de retard**

Son `server/index.js` fait 308 lignes contre 1 300 ici. Toute correction du serveur
va dans cette copie-ci. Vérifier la branche avant d'écrire quoi que ce soit.

## Devis

`devisPdfStr()` dans `app.html` produit un vrai fichier PDF, sans bibliothèque —
même fabrique que `bonPdfStr()` pour les bons de commande. L'en-tête vient de la
société choisie sur le devis : `bcEntete()` pour le nom, `bcCouleur()` pour la
couleur, `socStyle().logo` pour le logo, converti en JPEG par un canvas parce que
le PDF ne lit pas le PNG.

Le générateur `devisIAModal()` enchaîne : dictée au micro → génération → aperçu du
PDF → client (choisi ou saisi) → envoi par `envoiDoc()`. Le moteur dépend de
l'offre de l'entreprise, décidée côté serveur : Haiku inclus, Sonnet en supplément,
ou les deux au choix de l'utilisateur.

## La bêta : un outil de développement, jamais un canal public

`beta.html` n'est **pas** une version d'essai pour les clients et ne le sera jamais. C'est
l'outil de l'équipe qui développe : Justin et les personnes qui travaillent avec lui.
Il n'y aura pas de « bêta publique » — ce mot désigne ici un canal interne.

- **L'accès se gère uniquement depuis la Tour de contrôle** (onglet Accès bêta, réservé au
  patron) : ouvrir, couper, rouvrir, supprimer. Le serveur porte ces accès
  (`beta-comptes.json`), la page n'a aucun compte de départ, un accès coupé ne passe plus
  même sur un appareil resté connecté.
- **Chaque accès doit dire qui travaille sur quoi** : la personne, et le chantier qu'elle
  teste (écran, fonctionnalité, version). C'est l'évolution attendue de l'onglet — l'accès
  seul ne suffit pas, il faut la raison de l'accès.
- **Jamais de données d'entreprise** : espace `elan-gestion-beta`, préfixe `elanB_`. Un accès
  bêta n'ouvre que la bêta.
- **L'onglet s'appelle « Accès » et porte DEUX portes, à ne jamais confondre** : la bêta
  (`beta.html`, comptes portés par le serveur, n'ouvre que la bêta) et la version publique
  (`app.html`, crée un vrai espace d'entreprise avec de vraies données qui se synchronisent).
  La seconde carte réemploie `tourEspaceDe()`, le même chemin exactement que « Lien de
  connexion » sur la fiche d'un client — pas de seconde route serveur à maintenir. L'adresse
  e-mail sert de clé : la réutiliser rouvre le même espace, elle ne le remplace pas.
- Sur `teamop.fr/beta.html`, le champ **Entreprise reste vide** : identifiant et mot de passe
  donnés par la Tour, rien d'autre. Y taper un nom envoie la page chercher une entreprise.

## Refonte et aperçu (septembre 2026)

La refonte design/mouvement se fait sur la branche `refonte/design`. **Rien ne remplace
une page utilisée par les clients sans que Justin l'ait testée.** Le canal de test :

```bash
bash scripts/apercu.sh tour.html app.html   # copies sous apercu/, base href, ruban, sans service worker
node scripts/verifier-theme.js tour.html    # syntaxe du JS embarqué, variables fantômes, contrastes
```

`apercu/` se commite **seul sur `main`** (nouveaux fichiers, aucun point d'entrée client
ne change) et se teste sur `https://teamop.fr/apercu/…` — même origine, donc l'API
(CORS limité à teamop.fr) et la session fonctionnent. `apercu/app.html` passe par
`beta-build.js` : données `elanB_`, espace de synchro bêta. Le serveur (`server/`)
reste sur la branche jusqu'à validation : un push sur `main` le déploie.

Marque, à ne plus confondre : **carré bleu nuit « TEAM / OP » = TEAM OP** (`icons/teamop-*`,
site, mails) ; **carré vert « GESTION / OP » = OP GESTION** (`icons/opgestion-*`, `icon-*`,
manifeste de l'app). La pastille verte « OP » de la Tour n'est qu'un repère d'en-tête.

## Pièges rencontrés — à ne pas refaire

- **Ne jamais figer les données d'un client dans le code.** `REPORT_TEMPLATES`
  portait les ~90 agences d'un seul client et les servait à tous les autres.
  Vidée le 5 septembre 2026.
- **Deux routes de même chemin : la première enregistrée gagne.** `/api/devis/etat`
  était déclarée dans `agent-devis.js` (monté ligne 232) et dans `index.js`
  (ligne 2842) ; la seconde, plus riche, n'a jamais répondu. Panne silencieuse.
- **Vérifier qu'un registre est peuplé avant de bâtir dessus.** `espacesReg` n'est
  alimenté que par une inscription manuelle ; `cnxData` se remplit tout seul à
  chaque connexion. C'est le second qui sert de source de vérité.
- **Le champ de configuration s'appelle `anthropic.cleApi`**, pas `apiKey`.

## Modèle et effort par agent

Rien ne choisit le modèle tout seul : Claude Code ne regarde pas la difficulté d'une
tâche pour décider. Sans réglage, **chaque sous-agent hérite du modèle de la session** —
c'est-à-dire Opus sur tout, y compris pour lire trois versions avec `curl`.

Le choix est donc écrit, agent par agent, dans le frontmatter de `.claude/agents/*.md` :

| Agent | Modèle | Effort | Pourquoi |
|---|---|---|---|
| `verificateur` | `haiku` | `low` | Constate, ne décide pas : syntaxe, versions servies, `/health` |
| `testeur` | `sonnet` | `medium` | Écrit du Playwright et lit des échecs — du raisonnement, pas le plus cher |
| `deployeur` | `sonnet` | `high` | Le rituel est écrit (skill `publication`), mais une erreur se paie en clients |
| `concepteur` | `opus` | `high` | Refonte visuelle et mouvement : un jugement de goût, pas un contrôle mécanique |
| `gardien` | `opus` | `high` | Penser comme un attaquant se juge aussi. Une route qui fuit ne plante pas — le coût se compare à celui d'une fuite |
| `relecteur` | `sonnet` | `high` | Applique des critères écrits à un diff : systématique, pas créatif. Mais il passe après chaque changement, donc son coût unitaire compte |

Les deux derniers comblent ce que la CI ne fait pas : elle ne vérifie que les secrets commités
et les failles des dépendances — **pas même la syntaxe**, et personne ne relisait ce qu'une
route renvoie. `gardien` relit `server/` (80 routes exposées sur Internet, données de clients
réels) ; `relecteur` relit le diff avant qu'il parte sur `main`, qui est servi aux clients en
quelques minutes.

Tout autre sous-agent (recherche, revue de code, exploration) retombe sur
`CLAUDE_CODE_SUBAGENT_MODEL` dans `.claude/settings.json` — Sonnet. La session
principale, elle, garde le modèle choisi dans le terminal : ce fichier ne la touche pas.

Ordre de priorité, du plus fort au plus faible : `CLAUDE_CODE_EFFORT_LEVEL` (variable
d'environnement) → frontmatter de l'agent → réglage de session.

`bashOutputMaxChars` plafonne ce qu'une commande renvoie au modèle. Une trace
Playwright en échec fait des dizaines de milliers de caractères, tous facturés.
