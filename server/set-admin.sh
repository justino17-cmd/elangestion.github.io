#!/bin/bash
# Compte PATRON de la Tour de contrôle (tour.html) — crée le premier accès.
# Les collaborateurs s'ajoutent ensuite directement depuis la Tour (section 👥 Équipe).
# Usage : ssh -t root@IP "cd /opt/teamop/repo && git pull -q && bash server/set-admin.sh"
set -e

read -p "Ton nom (affiché dans la Tour, ex. Justin) : " NOM
if [ -z "$NOM" ]; then echo "❌ Nom requis. Rien n'a été modifié."; exit 1; fi
read -p "Ton e-mail de compte espace TeamOP [justin.17553@gmail.com] : " EMAIL
EMAIL=${EMAIL:-justin.17553@gmail.com}
read -s -p "Choisis ton mot de passe : " P1
echo ""
read -s -p "Confirme le mot de passe : " P2
echo ""
if [ "$P1" != "$P2" ]; then echo "❌ Les deux saisies sont différentes. Rien n'a été modifié."; exit 1; fi
if [ ${#P1} -lt 8 ]; then echo "❌ Trop court (8 caractères minimum). Rien n'a été modifié."; exit 1; fi

python3 - "$NOM" "$EMAIL" "$P1" <<'PYEOF'
import json, sys, hashlib, os, secrets
path = '/opt/teamop/monitor.json'
d = {}
if os.path.exists(path):
    try: d = json.load(open(path))
    except Exception: d = {}
users = d.get('users') or []
nom = sys.argv[1].strip()
email = sys.argv[2].strip().lower()
h = hashlib.sha256(sys.argv[3].encode('utf-8')).hexdigest()
# remplace un éventuel compte patron existant (le patron est unique), garde les collaborateurs
users = [u for u in users if u.get('role') != 'patron' and (u.get('nom','').lower() != nom.lower())]
users.insert(0, {'id': 'u' + secrets.token_hex(5), 'nom': nom, 'email': email, 'hash': h, 'role': 'patron', 'actif': True, 'ts': 0, 'creePar': 'set-admin.sh'})
d['users'] = users
d.setdefault('issues', [])
json.dump(d, open(path, 'w'))
print('Compte patron « ' + nom + ' » (' + email + ') enregistré (seule l\'empreinte du mot de passe est stockée).')
print('→ L\'entrée « Tour de contrôle » apparaîtra dans ton espace client sur teamop.fr/espace.html.')
PYEOF

systemctl restart teamop-api
sleep 2
R=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8080/api/monitor/login -H 'Content-Type: application/json' -d '{"nom":"__x__","pass":"__mauvais__"}')
if [ "$R" = "403" ]; then
  echo "✅ La Tour de contrôle est ACTIVE — connecte-toi sur https://teamop.fr/tour.html"
else
  echo "⚠️ Réponse inattendue du serveur (HTTP $R) — vérifie : journalctl -u teamop-api -n 30"
fi
