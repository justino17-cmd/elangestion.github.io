#!/bin/bash
# Configuration de l'envoi d'e-mails du serveur TeamOP
# Usage : ssh -t root@IP "cd /opt/teamop/repo && git pull -q && bash server/set-smtp.sh"
set -e

read -p "Adresse e-mail d'envoi [contact@teamop.fr] : " U
U=${U:-contact@teamop.fr}
read -s -p "Mot de passe de la boîte $U : " P
echo ""

python3 - "$U" "$P" <<'EOF'
import json, sys
c = json.load(open('/opt/teamop/config.json'))
c['smtp'] = {'host': 'smtp.mail.ovh.net', 'port': 465, 'user': sys.argv[1], 'pass': sys.argv[2], 'from': 'TeamOP <' + sys.argv[1] + '>'}
json.dump(c, open('/opt/teamop/config.json', 'w'), indent=2)
print('Configuration enregistrée.')
EOF

systemctl restart teamop-api
sleep 2
H=$(curl -s http://127.0.0.1:8080/health)
echo ""
echo "État du serveur : $H"
if echo "$H" | grep -q '"email":true'; then
  echo "✅ L'envoi d'e-mails est ACTIF."
else
  echo "❌ L'e-mail n'est pas actif — vérifie le mot de passe et relance ce script."
fi
