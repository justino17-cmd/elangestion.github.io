#!/bin/bash
# Pose la clé Claude (Anthropic) qui fait tourner EXPLIQUE, PROPOSE et le Devis IA.
#
# C'était la seule clé du serveur sans script : elle se posait à la main dans
# config.json. Résultat, quand elle expire, l'application dit « clé refusée » et il
# n'y a nulle part où aller. Ce script la remplace — et surtout il la VÉRIFIE
# auprès d'Anthropic avant de l'enregistrer : une clé fausse ne s'installe pas.
#
# La clé se crée sur console.anthropic.com → Settings → API keys.
# Elle commence par « sk-ant- ».
#
# Usage : ssh -t root@IP "cd /opt/teamop/repo && git pull -q && bash server/set-claude.sh"
set -e
CONFIG=/opt/teamop/config.json

echo ""
echo "=== Clé Claude (EXPLIQUE, PROPOSE, Devis IA) ==="
python3 -c "
import json
c = json.load(open('$CONFIG'))
a = c.get('anthropic') or {}
k = a.get('cleApi') or ''
print('Clé actuelle :', ('posée (' + str(len(k)) + ' caractères)') if k else '(aucune)')
print('Quota/jour   :', a.get('quotaJour') or 100)
" 2>/dev/null || echo "?"
echo ""
read -rsp "Clé Claude (rien ne s'affiche, Entrée = ne rien changer) : " CLE
echo ""

if [ -z "$CLE" ]; then
  echo "Rien n'a été changé."
  exit 0
fi

# Une clé qu'on n'a pas essayée est une clé dont on ne sait rien. On l'essaie AVANT
# d'écrire : sinon on remplace une clé morte par une autre clé morte, et l'application
# continue de refuser sans que personne comprenne pourquoi.
echo "Vérification auprès d'Anthropic…"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 20 https://api.anthropic.com/v1/models \
  -H "x-api-key: $CLE" -H "anthropic-version: 2023-06-01")

case "$CODE" in
  200)
    echo "✅ Clé acceptée par Anthropic." ;;
  401|403)
    echo "❌ Anthropic refuse cette clé (HTTP $CODE) — expirée, révoquée, ou recopiée incomplète."
    echo "   Rien n'a été écrit. Refais-en une sur console.anthropic.com → Settings → API keys."
    exit 1 ;;
  000)
    echo "❌ Anthropic injoignable depuis ce serveur — vérifie sa connexion réseau."
    echo "   Rien n'a été écrit."
    exit 1 ;;
  *)
    echo "❌ Réponse inattendue d'Anthropic (HTTP $CODE). Rien n'a été écrit."
    exit 1 ;;
esac

python3 - "$CLE" <<'PYEOF'
import json, sys
cle = sys.argv[1].strip()
with open('/opt/teamop/config.json') as f:
    c = json.load(f)
a = c.get('anthropic') or {}
a['cleApi'] = cle
c['anthropic'] = a
with open('/opt/teamop/config.json', 'w') as f:
    json.dump(c, f, indent=2)
# La clé n'est jamais réaffichée : on ne dit que sa longueur.
print('anthropic.cleApi =', len(cle), 'caractères')
PYEOF

chmod 600 "$CONFIG"
systemctl restart teamop-api
sleep 2
if curl -s http://127.0.0.1:8080/health | grep -q '"ok":true'; then
  echo "✅ Serveur redémarré — EXPLIQUE, PROPOSE et le Devis IA peuvent appeler Claude."
else
  echo "❌ Le serveur ne répond pas — montre cette sortie à Claude"
fi
