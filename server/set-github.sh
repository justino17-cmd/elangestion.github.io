#!/bin/bash
# Arme PROPOSE : le dépôt GitHub où la Tour ouvre ses propositions de correction.
#
# Sans cette configuration, PROPOSE reste inerte — la route répond « dépôt GitHub non
# configuré » et n'écrit nulle part. Une fois armée, le patron peut, depuis la Tour,
# demander une correction : Claude l'écrit à partir du code du dépôt et ouvre une
# proposition EN BROUILLON. Rien n'est jamais fusionné : le serveur n'en a pas le code.
#
# Le jeton doit être RESTREINT au seul dépôt TeamOP, avec le minimum :
#   Contents : lecture et écriture   (créer la branche, y déposer les fichiers)
#   Pull requests : lecture et écriture   (ouvrir la proposition)
# Rien d'autre. Surtout pas « Administration », ni l'accès aux autres dépôts.
# À créer sur github.com → Settings → Developer settings → Personal access tokens →
# Fine-grained tokens → Only select repositories.
#
# Usage : ssh -t root@IP "cd /opt/teamop/repo && git pull -q && bash server/set-github.sh"
set -e
CONFIG=/opt/teamop/config.json

echo ""
echo "=== Dépôt GitHub des propositions (PROPOSE) ==="
python3 -c "
import json
c = json.load(open('$CONFIG'))
g = c.get('github') or {}
print('Dépôt actuel :', g.get('depot') or '(aucun)')
print('Jeton        :', 'posé (' + str(len(g.get('token') or '')) + ' caractères)' if g.get('token') else '(aucun)')
" 2>/dev/null || echo "?"
echo ""
echo "Entrée = ne rien changer sur cette ligne."
read -p "Dépôt (ex. compte/TeamOP) : " DEPOT
read -rsp "Jeton GitHub (rien ne s'affiche) : " TOKEN
echo ""

if [ -z "$DEPOT" ] && [ -z "$TOKEN" ]; then
  echo "Rien n'a été changé."
  exit 0
fi

python3 - "$DEPOT" "$TOKEN" <<'PYEOF'
import json, sys
depot, token = sys.argv[1].strip(), sys.argv[2].strip()
with open('/opt/teamop/config.json') as f:
    c = json.load(f)
g = c.get('github') or {}
if depot:
    g['depot'] = depot
if token:
    g['token'] = token
c['github'] = g
with open('/opt/teamop/config.json', 'w') as f:
    json.dump(c, f, indent=2)
# Le jeton n'est jamais réaffiché : on ne dit que sa longueur.
print('github.depot =', g.get('depot', ''))
print('github.token =', str(len(g.get('token') or '')), 'caractères')
PYEOF

chmod 600 "$CONFIG"
systemctl restart teamop-api
sleep 2
if curl -s http://127.0.0.1:8080/health | grep -q '"ok":true'; then
  echo "✅ Serveur redémarré — PROPOSE peut ouvrir des propositions (en brouillon, jamais fusionnées)."
else
  echo "❌ Le serveur ne répond pas — montre cette sortie à Claude"
fi
