#!/usr/bin/env bash
# Bootstrap Nexus on a fresh Ubuntu 22.04/24.04 AWS Lightsail instance.
# Run as root or with sudo on the server after SSH login.
#
# Before running:
#   1. Lightsail instance created ($10/mo 2GB plan recommended)
#   2. Static IP attached
#   3. Firewall: open TCP 22, 80, 443
#   4. DNS A records → static IP for DOMAIN and FILES_DOMAIN
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/jatinSharma-create/NEXUS-LOCAL/deploy/scripts/aws-lightsail-bootstrap.sh | bash
#   — or copy this repo and run: sudo ./scripts/aws-lightsail-bootstrap.sh

set -euo pipefail

REPO_URL="${NEXUS_REPO_URL:-https://github.com/jatinSharma-create/NEXUS-LOCAL.git}"
BRANCH="${NEXUS_BRANCH:-deploy}"
INSTALL_DIR="${NEXUS_INSTALL_DIR:-/opt/nexus}"

echo "==> Installing Docker..."
apt-get update -qq
apt-get install -y -qq ca-certificates curl git
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable docker
systemctl start docker

echo "==> Cloning Nexus (${BRANCH})..."
mkdir -p "$(dirname "$INSTALL_DIR")"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  cd "$INSTALL_DIR"
  git fetch origin
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
else
  git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

if [[ ! -f .env ]]; then
  cp .env.production.example .env
  echo ""
  echo "============================================================"
  echo "  Created $INSTALL_DIR/.env from template."
  echo "  EDIT IT NOW before starting containers:"
  echo "    nano $INSTALL_DIR/.env"
  echo ""
  echo "  Required: DOMAIN, FILES_DOMAIN, PUBLIC_APP_URL,"
  echo "            MINIO_PUBLIC_ENDPOINT, APP_PASSWORD, API keys"
  echo "============================================================"
  exit 0
fi

echo "==> Building and starting Nexus (production compose)..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

echo ""
echo "==> Done. Check status:"
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
echo ""
echo "Open: https://${DOMAIN:-your-domain} (after DNS + .env are correct)"
echo "Logs: cd $INSTALL_DIR && docker compose logs -f app"
