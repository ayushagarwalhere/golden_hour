#!/usr/bin/env bash
# One-time setup on a fresh Ubuntu 24.04 EC2 instance:  bash setup.sh [domain]
# Without a domain it uses <public-ip>.sslip.io, which still gets a real HTTPS certificate.
set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  IP=$(curl -s https://checkip.amazonaws.com)
  DOMAIN="$(echo "$IP" | tr . -).sslip.io"
fi
echo "Domain: $DOMAIN"

# 2 GB swap so the production build fits on a small instance
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# Docker
if ! command -v docker >/dev/null; then
  sudo apt-get update -y
  sudo apt-get install -y docker.io docker-compose-v2 git
  sudo systemctl enable --now docker
fi

# Code
if [ ! -d ~/golden_hour ]; then
  git clone --branch hackathon-build https://github.com/ayushagarwalhere/golden_hour.git ~/golden_hour
else
  git -C ~/golden_hour pull --ff-only
fi

cd ~/golden_hour/deploy/ec2
# secrets copied to the home folder with scp are moved into place
[ -f ~/.env.production ] && mv ~/.env.production .env.production
if [ ! -f .env.production ]; then
  echo "Missing deploy/ec2/.env.production (copy it from your computer with scp)." >&2
  exit 1
fi
# shared secret between the app and the phone relay
grep -q '^INTERNAL_TOKEN=' .env.production || echo "INTERNAL_TOKEN=$(openssl rand -base64 30 | tr -d '/+=')" >> .env.production
chmod 600 .env.production
DOMAIN="$DOMAIN" sudo -E docker compose up -d --build
echo
echo "Golden Hour is starting at https://$DOMAIN  (first HTTPS certificate takes ~30 s)"
echo "Phone line webhook for Twilio: https://$DOMAIN/voice/incoming"
