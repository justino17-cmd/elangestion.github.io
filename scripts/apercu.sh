#!/usr/bin/env bash
# Fabrique le canal d'aperçu : des copies des pages en refonte, servies sous
# teamop.fr/apercu/, que Justin teste dans Safari AVANT que quoi que ce soit ne
# remplace les pages que les clients utilisent.
#
# Pourquoi un dossier sur main plutôt qu'une branche : GitHub Pages ne sert que
# main, et l'API n'accepte que l'origine teamop.fr (CORS). Un fichier local ne
# pourrait donc rien charger. Sous /apercu/, même origine, même session, vraies
# données — sans toucher aux points d'entrée des clients.
#
#   bash scripts/apercu.sh tour.html index.html   → construit apercu/ depuis la branche courante
#
# Ce script ne commite ni ne pousse rien : ça se fait à la main, en connaissance
# de cause (voir CLAUDE.md, section Aperçu).

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
mkdir -p apercu

RUBAN='<div id="apercu-ruban" style="position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:99999;font:600 12px/1 -apple-system,system-ui,sans-serif;letter-spacing:.06em;color:#fff;background:#B26E12;padding:8px 14px;border-radius:99px;box-shadow:0 6px 24px rgba(0,0,0,.25);pointer-events:none">APERÇU · refonte en cours</div>'

# <base href="/"> : les chemins relatifs (icônes, autres pages) résolvent vers la
# racine, comme si la page était à sa vraie place.
apercu_page() {
  local src="$1" dst="apercu/$1"
  [ -f "$src" ] || { echo "absent : $src"; return 1; }
  # OP GESTION : l'aperçu doit avoir SES données (préfixe elanB_, espace de synchro
  # bêta), exactement comme beta.html — sinon il écrirait dans les vraies.
  if [ "$src" = "app.html" ]; then
    node beta-build.js apercu/app.source.html >/dev/null
    src="apercu/app.source.html"
  fi
  python3 - "$src" "$dst" "$RUBAN" <<'PY'
import sys, io, re
src, dst, ruban = sys.argv[1], sys.argv[2], sys.argv[3]
s = io.open(src, encoding='utf-8').read()
if '<base ' not in s:
    s = re.sub(r'(<head[^>]*>)', r'\1<base href="/">', s, count=1)
# jamais de service worker depuis un aperçu : il prendrait le contrôle du vrai site
s = re.sub(r"navigator\.serviceWorker\.register\(", "(function(){return Promise.reject(new Error('aperçu : pas de service worker'))})(", s)
s = s.replace('</body>', ruban + '</body>', 1) if '</body>' in s else s + ruban
io.open(dst, 'w', encoding='utf-8').write(s)
print(f"{dst}  ({len(s)//1024} Ko)")
PY
}

[ $# -eq 0 ] && set -- tour.html
for page in "$@"; do apercu_page "$page"; done
rm -f apercu/app.source.html
