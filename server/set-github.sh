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

if ! python3 - "$DEPOT" "$TOKEN" <<'PYEOF'
import json, re, sys
depot, token = sys.argv[1].strip(), sys.argv[2].strip()

# Le champ « dépôt » n'est pas masqué : ce qu'on y tape s'affiche en clair, reste dans
# l'historique du terminal et part dans la moindre capture d'écran. Un jeton collé là est
# un jeton brûlé. On refuse donc tout ce qui n'a pas la forme « compte/depot », et on ne
# réaffiche JAMAIS la valeur refusée — la rappeler à l'écran l'exposerait une fois de plus.
if depot:
    ressemble_a_un_secret = depot.startswith(('github_pat_', 'ghp_', 'gho_', 'ghs_', 'ghu_', 'ghr_'))
    forme_attendue = re.fullmatch(r'[A-Za-z0-9._-]{1,100}/[A-Za-z0-9._-]{1,100}', depot)
    if ressemble_a_un_secret or not forme_attendue:
        if ressemble_a_un_secret:
            print("\n\u274c C'est un JETON que tu viens de coller dans le champ « dépôt ».")
            print("   Ce champ n'est pas masqué : le jeton s'est affiché en clair, il est")
            print("   maintenant dans ton historique de terminal. Il est brûlé.")
            print("\n   1. Supprime-le : github.com/settings/personal-access-tokens")
            print("   2. Fabriques-en un autre")
            print("   3. Relance ce script — le jeton se colle à la QUATRIÈME question,")
            print("      celle qui dit « Jeton GitHub (rien ne s'affiche) ».")
        else:
            print("\n\u274c « dépôt » attend la forme compte/depot (ex. justino17-cmd/mon-depot).")
        print("\nRien n'a été écrit dans la configuration.\n")
        sys.exit(2)

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
# ce que la route exige vraiment : les DEUX. Le script le lit ici pour ne pas l'affirmer à tort.
open('/tmp/teamop-propose-arme', 'w').write('1' if (g.get('depot') and g.get('token')) else '0')
PYEOF
then
  echo "Le serveur n'a pas été redémarré."
  exit 1
fi

chmod 600 "$CONFIG"
systemctl restart teamop-api
sleep 2

ARME=$(cat /tmp/teamop-propose-arme 2>/dev/null || echo 0)
rm -f /tmp/teamop-propose-arme

if ! curl -s http://127.0.0.1:8080/health | grep -q '"ok":true'; then
  echo "❌ Le serveur ne répond pas — montre cette sortie à Claude"
  exit 1
fi

# PROPOSE exige le dépôt ET le jeton. Annoncer un succès quand il en manque un, c'est
# laisser croire l'agent armé alors qu'il refusera à la première demande.
if [ "$ARME" = "1" ]; then
  echo "✅ Serveur redémarré — PROPOSE peut ouvrir des propositions (en brouillon, jamais fusionnées)."
else
  echo "⚠️  Serveur redémarré, mais PROPOSE reste INERTE : il faut le dépôt ET le jeton."
  echo "    Relance ce script et colle le jeton (rien ne s'affiche pendant la saisie)."
fi
