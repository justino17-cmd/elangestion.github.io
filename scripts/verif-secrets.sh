#!/usr/bin/env bash
# Cherche des secrets avant qu'ils ne partent sur GitHub.
#
# Deux modes :
#   (sans argument)  les fichiers en attente de commit — utilisé par le hook pre-commit
#   --suivis         tous les fichiers suivis par git — utilisé par la CI
#
# Un jeton GitHub et un mot de passe d'équipe ont déjà fuité une fois ;
# ce garde-fou existe pour que ça ne se reproduise pas.

set -uo pipefail

mode="${1:-}"

if [ "$mode" = "--suivis" ]; then
  fichiers=()
  while IFS= read -r l; do fichiers+=("$l"); done < <(git ls-files)
else
  fichiers=()
  while IFS= read -r l; do fichiers+=("$l"); done < <(git diff --cached --name-only --diff-filter=ACM)
fi

# Rien à examiner : on laisse passer.
[ "${#fichiers[@]}" -eq 0 ] && exit 0

# Motifs de secrets réels. Chaque entrée : description|expression régulière.
motifs=(
  "jeton GitHub (classique)|ghp_[A-Za-z0-9]{30,}"
  "jeton GitHub (fine-grained)|github_pat_[A-Za-z0-9_]{50,}"
  "clé Anthropic|sk-ant-[A-Za-z0-9_-]{30,}"
  "clé OpenAI|sk-[A-Za-z0-9]{40,}"
  "clé Groq|gsk_[A-Za-z0-9]{40,}"
  "clé Cerebras|csk-[A-Za-z0-9]{30,}"
  "clé AWS|AKIA[0-9A-Z]{16}"
  "clé privée|-----BEGIN[A-Z ]*PRIVATE KEY-----"
  "secret en dur|(mot_de_passe|password|passwd|secret|api_?key|apikey)[[:space:]]*[:=][[:space:]]*[\"'][^\"'\$]{12,}[\"']"
)

trouve=0

for f in "${fichiers[@]}"; do
  # Fichiers absents (supprimés dans le commit) : on saute.
  [ -f "$f" ] || continue
  case "$f" in
    node_modules/*|*/node_modules/*|*package-lock.json|scripts/verif-secrets.sh) continue ;;
  esac
  grep -Iq . "$f" 2>/dev/null || continue   # -I : ignore les fichiers binaires

  for entree in "${motifs[@]}"; do
    libelle="${entree%%|*}"
    regex="${entree#*|}"
    if resultat=$(grep -nE "$regex" "$f" 2>/dev/null); then
      # On affiche le fichier et la ligne, jamais la valeur du secret.
      while IFS= read -r ligne; do
        printf '  %s:%s  → %s\n' "$f" "${ligne%%:*}" "$libelle"
      done <<< "$resultat"
      trouve=1
    fi
  done
done

# Un fichier d'environnement n'a rien à faire dans un commit.
for f in "${fichiers[@]}"; do
  base="$(basename "$f")"
  case "$base" in
    .env.example) continue ;;
    .env|.env.*)
      printf '  %s  → fichier .env\n' "$f"
      trouve=1
      ;;
  esac
done

if [ "$trouve" -eq 1 ]; then
  echo
  echo "Secret détecté — opération interrompue."
  echo "Retire la valeur du fichier, puis révoque-la chez le fournisseur :"
  echo "un secret poussé une fois est compromis, même supprimé ensuite."
  exit 1
fi

exit 0
