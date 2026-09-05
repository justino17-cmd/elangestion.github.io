#!/bin/bash
# Pose la clé Gemini (Google) qui fait tourner le Devis IA.
#
# Elle se crée sur aistudio.google.com → « Get API key ». Le palier gratuit suffit
# largement pour des devis.
#
# ⚠️ À SAVOIR AVANT DE POSER UNE CLÉ DU PALIER GRATUIT
#    Sur ce palier, Google se réserve le droit d'exploiter ce qu'on lui envoie pour
#    améliorer ses produits, et des humains peuvent le relire. C'est pourquoi le
#    serveur ne lui envoie QUE la description de la prestation : ni le nom, ni
#    l'adresse du client. Ils ne servent pas à faire un prix.
#    Le palier payant, lui, n'exploite pas les données.
#
# Le script vérifie la clé ET la disponibilité du modèle avant d'écrire quoi que ce
# soit : une clé fausse ou un modèle absent ne s'installent pas.
#
# Usage : ssh -t root@IP "cd /opt/teamop/repo && git pull -q && bash server/set-gemini.sh"
set -e
CONFIG=/opt/teamop/config.json
MODELE_DEFAUT=gemini-3.7-flash

echo ""
echo "=== Clé Gemini (Devis IA) ==="
python3 -c "
import json
c = json.load(open('$CONFIG'))
g = c.get('gemini') or {}
k = g.get('cleApi') or ''
print('Clé actuelle :', ('posée (' + str(len(k)) + ' caractères)') if k else '(aucune)')
print('Modèle       :', g.get('modele') or '($MODELE_DEFAUT par défaut)')
" 2>/dev/null || echo "?"
echo ""
read -rsp "Clé Gemini (rien ne s'affiche, Entrée = ne rien changer) : " CLE
echo ""

if [ -z "$CLE" ]; then
  echo "Rien n'a été changé."
  exit 0
fi

# Une clé qu'on n'a pas essayée est une clé dont on ne sait rien.
echo "Vérification auprès de Google…"
REP=$(curl -s -m 20 "https://generativelanguage.googleapis.com/v1beta/models?key=$CLE" || echo '')

if [ -z "$REP" ]; then
  echo "❌ Google injoignable depuis ce serveur — vérifie sa connexion réseau."
  echo "   Rien n'a été écrit."
  exit 1
fi
if echo "$REP" | grep -q 'API_KEY_INVALID'; then
  echo "❌ Google refuse cette clé — expirée, révoquée, ou recopiée incomplète."
  echo "   Rien n'a été écrit. Refais-en une sur aistudio.google.com."
  exit 1
fi
if ! echo "$REP" | grep -q '"models"'; then
  echo "❌ Réponse inattendue de Google. Rien n'a été écrit."
  echo "$REP" | head -c 300
  exit 1
fi
echo "✅ Clé acceptée par Google."

# Le modèle par défaut existe-t-il pour CETTE clé ? Les modèles disponibles varient
# d'un compte à l'autre : on ne pose pas un nom que le serveur ne pourra pas appeler.
MODELE="$MODELE_DEFAUT"
if ! echo "$REP" | grep -q "models/$MODELE_DEFAUT"; then
  echo ""
  echo "⚠️  Le modèle $MODELE_DEFAUT n'est pas disponible pour cette clé."
  echo "   Modèles utilisables :"
  echo "$REP" | grep -o '"name": *"models/[^"]*"' | sed 's/.*models\///;s/"//' | grep -i 'flash\|pro' | head -8 | sed 's/^/     · /'
  echo ""
  read -p "   Lequel utiliser ? " MODELE
  if [ -z "$MODELE" ] || ! echo "$REP" | grep -q "models/$MODELE"; then
    echo "❌ Modèle inconnu pour cette clé. Rien n'a été écrit."
    exit 1
  fi
fi
echo "✅ Modèle retenu : $MODELE"

python3 - "$CLE" "$MODELE" <<'PYEOF'
import json, sys
cle, modele = sys.argv[1].strip(), sys.argv[2].strip()
with open('/opt/teamop/config.json') as f:
    c = json.load(f)
g = c.get('gemini') or {}
g['cleApi'] = cle
g['modele'] = modele
c['gemini'] = g
with open('/opt/teamop/config.json', 'w') as f:
    json.dump(c, f, indent=2)
# La clé n'est jamais réaffichée : on ne dit que sa longueur.
print('gemini.cleApi =', len(cle), 'caractères')
print('gemini.modele =', modele)
PYEOF

chmod 600 "$CONFIG"
systemctl restart teamop-api
sleep 2
if curl -s http://127.0.0.1:8080/health | grep -q '"ok":true'; then
  echo "✅ Serveur redémarré — le Devis IA peut générer."
  echo "   Rappel : seule la description de la prestation part chez Google."
else
  echo "❌ Le serveur ne répond pas — montre cette sortie à Claude"
fi
