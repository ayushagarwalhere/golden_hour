#!/usr/bin/env bash
# Build on your computer and ship to a small EC2 server (works on 1 GB instances: nothing is built there).
#
#   bash deploy/ec2/push-release.sh <server-ip> <path-to-key.pem> [user=ec2-user]
#
# First run: installs Node 22, Caddy (automatic HTTPS at <ip-with-dashes>.sslip.io), 2 GB swap and three
# systemd services (golden-hour, golden-hour-voice, caddy). Later runs just replace the app and restart.
# Secrets: put them in deploy/ec2/server.env (git-ignored) — at least OPENROUTER_API_KEY or ANTHROPIC_API_KEY,
# optionally TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN. It is copied to /etc/golden-hour/env only if present.
set -euo pipefail

IP="${1:?server ip}"
KEY="${2:?path to .pem}"
USER_="${3:-ec2-user}"
DOMAIN="${DOMAIN:-$(echo "$IP" | tr . -).sslip.io}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$(mktemp -d)"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$USER_@$IP")

echo "→ building"
(cd "$ROOT" && npx next build >/dev/null)
mkdir -p "$OUT/app/.next" "$OUT/app/node_modules"
cp -r "$ROOT/.next/standalone/." "$OUT/app/"
cp -r "$ROOT/.next/static" "$OUT/app/.next/"
cp -r "$ROOT/public" "$ROOT/voice" "$OUT/app/"
cp -r "$ROOT/node_modules/ws" "$OUT/app/node_modules/"
rm -rf "$OUT/app/node_modules/@img" "$OUT/app/node_modules/sharp" "$OUT/app/.env"* "$OUT/app/data"
tar -czf "$OUT/app.tgz" -C "$OUT/app" .

echo "→ uploading"
scp -q -i "$KEY" "$OUT/app.tgz" "$USER_@$IP:/tmp/golden-hour.tgz"
if [ -f "$HERE/server.env" ]; then
  {
    cat "$HERE/server.env"
    echo "NODE_ENV=production"
    echo "PUBLIC_SITE_URL=https://$DOMAIN"
    echo "PUBLIC_URL=https://$DOMAIN"
    echo "TRUSTED_PROXY_HOPS=1"
    echo "DATA_DIR=/var/lib/golden-hour/cases"
    echo "APP_URL=http://127.0.0.1:3000"
    echo "VOICE_PORT=3001"
  } >"$OUT/env"
  scp -q -i "$KEY" "$OUT/env" "$USER_@$IP:/tmp/golden-hour.env"
fi
rm -rf "$OUT"

echo "→ installing on $IP"
"${SSH[@]}" DOMAIN="$DOMAIN" bash -s <<'REMOTE'
set -euo pipefail
if ! command -v node >/dev/null; then sudo dnf install -y -q nodejs22 tar || (sudo apt-get update -y && sudo apt-get install -y nodejs); fi
if ! swapon --show | grep -q /swapfile; then
  sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
fi
if ! command -v caddy >/dev/null; then
  curl -fsSL -o /tmp/caddy.tgz https://github.com/caddyserver/caddy/releases/download/v2.10.2/caddy_2.10.2_linux_amd64.tar.gz
  sudo tar -xzf /tmp/caddy.tgz -C /usr/local/bin caddy && rm /tmp/caddy.tgz
fi
id goldenhour >/dev/null 2>&1 || sudo useradd --system --home /opt/golden-hour --shell /sbin/nologin goldenhour
id caddy >/dev/null 2>&1 || sudo useradd --system --home /var/lib/caddy --create-home --shell /sbin/nologin caddy
sudo mkdir -p /opt/golden-hour /var/lib/golden-hour/cases /etc/golden-hour /etc/caddy
sudo chown -R goldenhour:goldenhour /var/lib/golden-hour

sudo rm -rf /opt/golden-hour/app.new && sudo mkdir -p /opt/golden-hour/app.new
sudo tar -xzf /tmp/golden-hour.tgz -C /opt/golden-hour/app.new && rm /tmp/golden-hour.tgz
[ -d /opt/golden-hour/app ] && sudo rm -rf /opt/golden-hour/app.old && sudo mv /opt/golden-hour/app /opt/golden-hour/app.old
sudo mv /opt/golden-hour/app.new /opt/golden-hour/app
sudo chown -R root:goldenhour /opt/golden-hour/app && sudo chmod -R o-rwx /opt/golden-hour/app
if [ -f /tmp/golden-hour.env ]; then
  grep -q '^INTERNAL_TOKEN=' /tmp/golden-hour.env || {
    old=$(sudo grep '^INTERNAL_TOKEN=' /etc/golden-hour/env 2>/dev/null || true)
    echo "${old:-INTERNAL_TOKEN=$(openssl rand -base64 30 | tr -d '/+=')}" >>/tmp/golden-hour.env
  }
  sudo install -m 640 -o root -g goldenhour /tmp/golden-hour.env /etc/golden-hour/env && rm /tmp/golden-hour.env
fi

unit() { sudo tee "/etc/systemd/system/$1.service" >/dev/null; }
unit golden-hour <<UNIT
[Unit]
Description=Golden Hour web app
After=network-online.target
[Service]
User=goldenhour
WorkingDirectory=/opt/golden-hour/app
EnvironmentFile=/etc/golden-hour/env
Environment=PORT=3000 HOSTNAME=127.0.0.1 NODE_OPTIONS=--max-old-space-size=512
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/golden-hour
PrivateTmp=true
[Install]
WantedBy=multi-user.target
UNIT
unit golden-hour-voice <<UNIT
[Unit]
Description=Golden Hour phone line relay (Twilio ConversationRelay)
After=golden-hour.service
[Service]
User=goldenhour
WorkingDirectory=/opt/golden-hour/app
EnvironmentFile=/etc/golden-hour/env
ExecStart=/usr/bin/node voice/relay.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
PrivateTmp=true
[Install]
WantedBy=multi-user.target
UNIT
unit caddy <<UNIT
[Unit]
Description=Caddy (HTTPS for Golden Hour)
After=network-online.target
[Service]
User=caddy
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=always
Environment=XDG_DATA_HOME=/var/lib/caddy XDG_CONFIG_HOME=/var/lib/caddy
[Install]
WantedBy=multi-user.target
UNIT
sudo tee /etc/caddy/Caddyfile >/dev/null <<CADDY
$DOMAIN {
	encode zstd gzip
	handle /voice/* {
		reverse_proxy 127.0.0.1:3001
	}
	handle {
		reverse_proxy 127.0.0.1:3000 {
			flush_interval -1
		}
	}
}
CADDY
sudo systemctl daemon-reload
sudo systemctl enable -q golden-hour golden-hour-voice caddy
sudo systemctl restart golden-hour golden-hour-voice caddy
sleep 5
systemctl is-active golden-hour golden-hour-voice caddy
REMOTE

echo "→ live at https://$DOMAIN"
curl -s "https://$DOMAIN/api/health" && echo
