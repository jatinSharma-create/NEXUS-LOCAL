#!/usr/bin/env bash
# Confirm the deploy branch is fit to ship. Run from the repo root.
# Does not need Docker for the static checks. Container checks run if Docker is up.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() { echo "FAIL  $1"; exit 1; }
ok() { echo "OK    $1"; }

[[ "$(git rev-parse --abbrev-ref HEAD)" == "deploy" ]] || fail "check out the deploy branch first: git checkout deploy"
ok "on branch deploy ($(git rev-parse --short HEAD))"

command -v docker >/dev/null || fail "docker is not installed"
ok "docker CLI present"

docker compose -f docker-compose.yml -f docker-compose.prod.yml config >/dev/null
ok "production compose file parses"

if docker info >/dev/null 2>&1; then
  ok "docker daemon is running"
else
  echo "SKIP  docker daemon is not running (unpause Docker Desktop, then re-run)"
fi

if [[ -d app/node_modules ]]; then
  (cd app && npx tsc --noEmit)
  ok "TypeScript"
  (cd app && npx next lint)
  ok "lint"
else
  echo "SKIP  app/node_modules missing — run npm ci in ./app for tsc/lint"
fi

echo ""
echo "After the server is up, check:"
echo "  curl -s https://YOUR-HOST/api/health/calling"
echo "You want: ready=true, publicReachable=true, missing=[]"
echo ""
echo "Local laptop (develop-style ports) if Docker is running:"
echo "  curl -s http://127.0.0.1:8080/api/health/calling"
echo "  curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:8080/login"
