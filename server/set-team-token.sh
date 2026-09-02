#!/bin/bash
# Génère (ou régénère) le jeton d'authentification d'une équipe TeamOP.
# Usage : ssh -t root@IP "cd /opt/teamop/repo && git pull -q && bash server/set-team-token.sh"
#
# Le jeton doit ensuite être recopié dans le document Firestore de l'équipe,
# champ 'pushToken' de elan_teams/<equipe> : l'application le lit au démarrage
# et l'envoie en en-tête X-TeamOP-Token sur /api/subscribe, /api/notify et
# /api/sendmail. Sans ce report, le push de l'équipe cesse de fonctionner.
set -e

read -p "Identifiant d'équipe [elan-gestion] : " T
T=${T:-elan-gestion}

TOKEN=$(openssl rand -hex 32)

python3 - "$T" "$TOKEN" <<'EOF'
import json, sys
team, token = sys.argv[1], sys.argv[2]
p = '/opt/teamop/config.json'
c = json.load(open(p))
c.setdefault('teamTokens', {})[team] = token
# OP MESSAGES : push par utilisateur, expéditeur ≠ destinataire → un jeton partagé
# serait forcément public. Laissé explicitement ouvert tant que l'expéditeur
# n'est pas authentifié (ID Token Firebase). Le serveur le signale au démarrage.
c.setdefault('openTeams', [])
if 'opmsg-user-*' not in c['openTeams']:
    c['openTeams'].append('opmsg-user-*')
json.dump(c, open(p, 'w'), indent=2)
print('Jeton enregistré pour ' + team + '.')
EOF

chmod 600 /opt/teamop/config.json
chown teamop:teamop /opt/teamop/config.json 2>/dev/null || true

systemctl restart teamop-api
sleep 2

echo ""
echo "════════════════════════════════════════════════════════"
echo "  Équipe : $T"
echo "  Jeton  : $TOKEN"
echo ""
echo "  À reporter dans Firestore :"
echo "     collection  elan_teams"
echo "     document    $T"
echo "     champ       pushToken  (texte)  = le jeton ci-dessus"
echo ""
echo "  Tant que ce champ n'est pas renseigné, les appareils de"
echo "  cette équipe reçoivent 401 sur /api/notify et /api/subscribe."
echo "════════════════════════════════════════════════════════"
echo ""
echo "État du serveur : $(curl -s http://127.0.0.1:8080/health || echo 'pas encore prêt')"
