#!/bin/bash
# Configuration Stripe du serveur TeamOP (paiement avec quantité automatique + codes promo)
# Usage : ssh -t root@IP "cd /opt/teamop/repo && git pull -q && bash server/set-stripe.sh"
set -e

echo "La clé secrète se trouve sur dashboard.stripe.com/apikeys (« Clé secrète », commence par sk_live_)."
read -s -p "Colle ta clé secrète Stripe : " K
echo ""
case "$K" in sk_live_*|rk_live_*) ;; *) echo "❌ Ce n'est pas une clé secrète (elle doit commencer par sk_live_). Rien n'a été modifié."; exit 1;; esac

python3 - "$K" <<'PYEOF'
import json, sys
c = json.load(open('/opt/teamop/config.json'))
c['stripe'] = {'secretKey': sys.argv[1]}
json.dump(c, open('/opt/teamop/config.json', 'w'), indent=2)
print('Configuration enregistrée.')
PYEOF

systemctl restart teamop-api
sleep 2
H=$(curl -s http://127.0.0.1:8080/health)
echo ""
echo "État du serveur : $H"
if echo "$H" | grep -q '"stripe":true'; then
  echo "✅ Le paiement automatique Stripe est ACTIF."
else
  echo "❌ Stripe n'est pas actif — relance ce script."
fi
