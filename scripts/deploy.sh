#!/usr/bin/env bash
# Deploy / update Nexus on a VPS (run from the repo root).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example and fill production values first."
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

if [[ -z "${DOMAIN:-}" || "${DOMAIN}" == "localhost" ]]; then
  echo "Set DOMAIN to your public hostname (e.g. 203-0-113-10.sslip.io) in .env"
  exit 1
fi

export CADDYFILE="${CADDYFILE:-Caddyfile}"
export MINIO_PUBLIC_ENDPOINT="${MINIO_PUBLIC_ENDPOINT:-https://files.${DOMAIN}}"
export PUBLIC_APP_URL="${PUBLIC_APP_URL:-https://${DOMAIN}}"

echo "==> Pulling latest code (if git remote exists)"
if git remote get-url origin >/dev/null 2>&1; then
  git pull --ff-only origin main || git pull --ff-only
fi

echo "==> Building and starting stack"
docker compose up -d --build

echo "==> Applying idempotent DB migrations"
for f in db/migrate-*.sql; do
  [[ -f "$f" ]] || continue
  echo "    applying $f"
  docker compose exec -T db psql -U nexus -d nexus < "$f" || true
done

echo "==> Container status"
docker compose ps

echo ""
echo "App URL:     https://${DOMAIN}"
echo "MinIO URL:   ${MINIO_PUBLIC_ENDPOINT}"
echo "Telnyx webhook should be: https://${DOMAIN}/api/webhooks/telnyx"
echo ""
echo "Done. Wait ~1–2 minutes for Let's Encrypt if this is the first HTTPS boot."
