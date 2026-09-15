#!/usr/bin/env bash
# Ship the latest deploy branch to this server.
#
# Which compose files apply comes from COMPOSE_FILE in .env, so this script
# works for both the 2 GB profile (pull prebuilt images) and the 4 GB one
# (build here). Run from the install directory or anywhere.
set -euo pipefail

INSTALL_DIR="${NEXUS_INSTALL_DIR:-/opt/nexus}"
cd "$INSTALL_DIR"

if [[ ! -f .env ]]; then
  echo "No .env in $INSTALL_DIR — nothing to deploy." >&2
  exit 1
fi

echo "==> Fetching deploy branch"
git fetch origin
git checkout deploy
git pull origin deploy

# `build:` is stripped on the registry profile, so `pull` is the update path
# there. On the build profile there is nothing to pull and this is a no-op.
if grep -qE '^COMPOSE_FILE=.*docker-compose\.registry\.yml' .env; then
  echo "==> Pulling prebuilt images"
  docker compose pull app worker
  echo "==> Restarting"
  docker compose up -d
else
  echo "==> Building on this host (4 GB profile)"
  docker compose up -d --build
fi

echo "==> Pruning old images"
docker image prune -f >/dev/null

echo ""
docker compose ps
echo ""
echo "Deploy complete. Check: curl -s https://\$DOMAIN/api/health/calling"
