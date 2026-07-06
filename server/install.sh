#!/bin/bash
# ══════════════════════════════════════════════════════════════
#  Installation du serveur TeamOP (Ubuntu 24.04)
#  Usage : curl -fsSL https://teamop.fr/server/install.sh | bash
#  Installe : Node.js 22, l'API TeamOP (push + e-mails), Caddy (HTTPS auto)
# ══════════════════════════════════════════════════════════════
set -e
export DEBIAN_FRONTEND=noninteractive

DOMAIN="${TEAMOP_DOMAIN:-api.teamop.fr}"
REPO="https://github.com/justino17-cmd/elangestion.github.io.git"

echo "── [1/6] Mises à jour système…"
apt-get update -qq && apt-get upgrade -y -qq

echo "── [2/6] Installation de Node.js 22…"
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs
fi
apt-get install -y -qq git ca-certificates

echo "── [3/6] Installation de Caddy (HTTPS automatique)…"
if ! command -v caddy >/dev/null; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy
fi

echo "── [4/6] Téléchargement de l'API TeamOP…"
mkdir -p /opt/teamop/data
if [ -d /opt/teamop/repo/.git ]; then
  git -C /opt/teamop/repo pull -q
else
  git clone -q --depth 1 "$REPO" /opt/teamop/repo
fi
cd /opt/teamop/repo/server
npm install --omit=dev --silent

echo "── [5/6] Configuration (clés générées une seule fois)…"
if [ ! -f /opt/teamop/config.json ]; then
  VAPID=$(node -e "const w=require('web-push');const k=w.generateVAPIDKeys();console.log(k.publicKey+' '+k.privateKey)")
  PUB=$(echo "$VAPID" | cut -d' ' -f1)
  PRIV=$(echo "$VAPID" | cut -d' ' -f2)
  KEY=$(openssl rand -hex 24)
  cat > /opt/teamop/config.json <<EOF
{
  "vapidPublicKey": "$PUB",
  "vapidPrivateKey": "$PRIV",
  "apiKey": "$KEY",
  "contactEmail": "contact@teamop.fr",
  "origins": ["https://teamop.fr", "https://www.teamop.fr"],
  "smtp": {}
}
EOF
  chmod 600 /opt/teamop/config.json
fi

cat > /etc/systemd/system/teamop-api.service <<'EOF'
[Unit]
Description=TeamOP API (push + e-mails)
After=network.target

[Service]
WorkingDirectory=/opt/teamop/repo/server
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=3
User=root
Environment=PORT=8080

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
    reverse_proxy 127.0.0.1:8080
}
EOF

echo "── [6/6] Démarrage des services…"
systemctl daemon-reload
systemctl enable --now teamop-api
systemctl restart caddy

sleep 2
echo ""
echo "════════════════════════════════════════════════════════"
echo "  ✅ Serveur TeamOP installé !"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  Test local : $(curl -s http://127.0.0.1:8080/health || echo 'API pas encore prête, attendre 10 s')"
echo ""
echo "  Clé publique push (VAPID) à donner à Claude :"
node -e "console.log('  '+JSON.parse(require('fs').readFileSync('/opt/teamop/config.json')).vapidPublicKey)"
echo ""
echo "  ⚠️  Vérifie que le DNS 'api.teamop.fr' pointe vers CE serveur,"
echo "      puis teste :  https://$DOMAIN/health"
echo "════════════════════════════════════════════════════════"
