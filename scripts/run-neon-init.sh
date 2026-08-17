#!/usr/bin/env bash
# Apply Nexus schema to a hosted Postgres (Neon, Supabase, etc.)
# Usage: DATABASE_URL='postgres://...' ./scripts/run-neon-init.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL to your hosted Postgres connection string."
  exit 1
fi

echo "Applying db/init.sql..."
psql "$DATABASE_URL" -f db/init.sql

for f in db/migrate-day1.sql db/migrate-soft-delete.sql db/migrate-recording-consent.sql db/migrate-call-control-index.sql; do
  if [[ -f "$f" ]]; then
    echo "Applying $f..."
    psql "$DATABASE_URL" -f "$f" || true
  fi
done

echo "Done. Verify with: psql \"\$DATABASE_URL\" -c '\\dt'"
