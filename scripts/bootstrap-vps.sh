#!/usr/bin/env bash
# One-time VPS bootstrap: Docker Engine + Compose plugin (Ubuntu/Debian).
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Re-run with sudo: sudo bash scripts/bootstrap-vps.sh"
  exit 1
fi

apt-get update -y
apt-get install -y ca-certificates curl git ufw

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

systemctl enable --now docker

# Firewall: HTTPS only (MinIO is localhost-bound; Caddy proxies files.*)
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "Docker: $(docker --version)"
echo "Compose: $(docker compose version)"
echo "Firewall: 22, 80, 443 open"
echo ""
echo "Next:"
echo "  1. Clone the repo to /opt/nexus"
echo "  2. Create .env from .env.example (see docs/DEPLOY-FREE.md)"
echo "  3. Run: bash scripts/deploy.sh"
