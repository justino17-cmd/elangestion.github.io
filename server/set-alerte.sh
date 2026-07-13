#!/bin/bash
# Règle l'adresse qui reçoit les alertes de bugs (vigie TeamOP).
# Usage : ssh -t root@IP "cd /opt/teamop/repo && git pull -q && bash server/set-alerte.sh"
set -e
CONFIG=/opt/teamop/config.json

echo ""
echo "=== Alertes de bugs TeamOP ==="
CUR=$(python3 -c "import json;print(json.load(open('$CONFIG')).get('alertEmail','(non réglée — les alertes vont sur contact@teamop.fr)'))" 2>/dev/null || echo "?")
echo "Adresse actuelle : $CUR"
echo ""
read -p "Nouvelle adresse pour recevoir les alertes (Entrée = ne rien changer) : " EMAIL

if [ -z "$EMAIL" ]; then
  echo "Rien n'a été changé."
  exit 0
fi

python3 - "$EMAIL" <<'PYEOF'
import json, sys
email = sys.argv[1].strip()
with open('/opt/teamop/config.json') as f:
    c = json.load(f)
c['alertEmail'] = email
with open('/opt/teamop/config.json', 'w') as f:
    json.dump(c, f, indent=2)
print('alertEmail =', email)
PYEOF

systemctl restart teamop-api
sleep 2
if curl -s http://127.0.0.1:8080/health | grep -q '"ok":true'; then
  echo "✅ Serveur redémarré — les alertes de bugs arriveront sur : $EMAIL"
else
  echo "❌ Le serveur ne répond pas — montre cette sortie à Claude"
fi
