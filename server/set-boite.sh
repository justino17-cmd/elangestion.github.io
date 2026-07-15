#!/bin/bash
# Configure la 📥 Boîte Commandes intégrée (relevée par le serveur, réponses dans l'application).
# Usage : ssh -t root@IP "cd /opt/teamop/repo && git pull -q && bash server/set-boite.sh"
set -e
CONFIG=/opt/teamop/config.json

echo ""
echo "=== 📥 Boîte Commandes TeamOP ==="
CUR=$(python3 -c "import json;print((json.load(open('$CONFIG')).get('imap') or {}).get('user','(non configurée)'))" 2>/dev/null || echo "?")
echo "Boîte actuelle : $CUR"
echo ""
echo "Chaque utilisateur peut désormais connecter SA boîte directement dans l'application"
echo "(Boîte mail → Connecter). Cette boîte globale est OPTIONNELLE."
echo ""
echo "Tape « off » pour la désactiver, ou l'adresse d'une boîte OVH pour l'activer."
read -p "Adresse (Entrée = commandes@teamop.fr, ou « off ») : " BUSER
BUSER=${BUSER:-commandes@teamop.fr}

if [ "$BUSER" = "off" ]; then
  python3 - <<'PYEOF'
import json
c = json.load(open('/opt/teamop/config.json'))
c.pop('imap', None)
json.dump(c, open('/opt/teamop/config.json', 'w'), indent=2)
print('Boîte globale désactivée.')
PYEOF
  systemctl restart teamop-api
  echo "✅ Boîte globale désactivée — chacun connecte sa boîte dans l'app."
  exit 0
fi

# validation : doit ressembler à une adresse e-mail (évite de coller une commande par erreur)
if ! echo "$BUSER" | grep -qE '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'; then
  echo "❌ « $BUSER » n'est pas une adresse e-mail valide — rien n'a été changé."
  echo "   (Tu as peut-être collé une commande par erreur. Relance et tape juste l'adresse.)"
  exit 1
fi

read -s -p "Mot de passe de cette boîte (invisible, c'est normal) : " BPASS
echo ""
if [ -z "$BPASS" ]; then echo "Mot de passe vide — rien n'a été changé."; exit 1; fi

python3 - "$BUSER" "$BPASS" <<'PYEOF'
import json, sys
user, pwd = sys.argv[1].strip(), sys.argv[2]
with open('/opt/teamop/config.json') as f:
    c = json.load(f)
c['imap'] = {'host': 'ssl0.ovh.net', 'port': 993, 'user': user, 'pass': pwd}
with open('/opt/teamop/config.json', 'w') as f:
    json.dump(c, f, indent=2)
print('Boîte enregistrée :', user)
PYEOF

cd /opt/teamop/repo/server && npm install --omit=dev --silent
systemctl restart teamop-api
sleep 3
if curl -s http://127.0.0.1:8080/health | grep -q '"boite":true'; then
  echo "✅ Boîte Commandes ACTIVE — les réponses des fournisseurs arriveront dans l'application."
else
  echo "❌ La boîte ne répond pas — vérifie l'adresse/le mot de passe et montre cette sortie à Claude."
fi
