#!/bin/bash
# Déclare les adresses et les espaces « internes » : ce que l'équipe TeamOP rapporte en
# développant n'est pas un problème client, et n'a rien à faire dans « à traiter ».
# Le trieur classe ces incidents en « interne » — ils restent consultables dans la
# Surveillance, filtre « Interne (équipe) », mais ne polluent plus la liste du jour.
# Usage : ssh -t root@IP "cd /opt/teamop/repo && git pull -q && bash server/set-interne.sh"
set -e
CONFIG=/opt/teamop/config.json

echo ""
echo "=== Adresses internes TeamOP (trieur d'incidents) ==="
python3 -c "
import json
c = json.load(open('$CONFIG'))
m = c.get('interneEmails') or []
e = c.get('interneEspaces') or []
print('Adresses actuelles :', ', '.join(m) if m else '(aucune)')
print('Espaces actuels    :', ', '.join(e) if e else '(aucun)')
" 2>/dev/null || echo "?"
echo ""
echo "Sépare par des virgules. Entrée = ne rien changer sur cette ligne."
read -p "Adresses e-mail internes : " EMAILS
read -p "Espaces internes (ex. teamop-teste) : " ESPACES

if [ -z "$EMAILS" ] && [ -z "$ESPACES" ]; then
  echo "Rien n'a été changé."
  exit 0
fi

python3 - "$EMAILS" "$ESPACES" <<'PYEOF'
import json, sys
def liste(s):
    return [x.strip().lower() for x in s.split(',') if x.strip()]
emails, espaces = sys.argv[1].strip(), sys.argv[2].strip()
with open('/opt/teamop/config.json') as f:
    c = json.load(f)
if emails:
    c['interneEmails'] = liste(emails)
if espaces:
    c['interneEspaces'] = liste(espaces)
with open('/opt/teamop/config.json', 'w') as f:
    json.dump(c, f, indent=2)
print('interneEmails  =', c.get('interneEmails', []))
print('interneEspaces =', c.get('interneEspaces', []))
PYEOF

systemctl restart teamop-api
sleep 2
if curl -s http://127.0.0.1:8080/health | grep -q '"ok":true'; then
  echo "✅ Serveur redémarré — le trieur écarte désormais ces incidents de « à traiter »."
else
  echo "❌ Le serveur ne répond pas — montre cette sortie à Claude"
fi
