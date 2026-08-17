#!/usr/bin/env bash
# Pull latest deploy branch and rebuild on the AWS server.
set -euo pipefail
INSTALL_DIR="${NEXUS_INSTALL_DIR:-/opt/nexus}"
cd "$INSTALL_DIR"
git fetch origin
git checkout deploy
git pull origin deploy
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
echo "Deploy complete."
