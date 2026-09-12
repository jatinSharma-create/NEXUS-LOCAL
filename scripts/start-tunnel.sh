#!/usr/bin/env bash
# Start ngrok → local Caddy and print the webhook URL to paste into your carrier / .env
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v ngrok >/dev/null; then
  echo "Install ngrok: https://ngrok.com/download"
  exit 1
fi

# Caddy's published host port is configurable (HTTP_PORT in .env), so read it
# rather than assuming :80 — publishing 80 fails on a Mac that already uses it.
HTTP_PORT=8080
if [[ -f .env ]]; then
  ENV_PORT=$(sed -n 's/^HTTP_PORT=//p' .env | tail -1 | tr -d '[:space:]')
  [[ -n "${ENV_PORT:-}" ]] && HTTP_PORT="$ENV_PORT"
fi

if ! curl -sf "http://127.0.0.1:${HTTP_PORT}/login" >/dev/null 2>&1; then
  echo "Local stack does not look up on :${HTTP_PORT}. Run: docker compose up -d"
  exit 1
fi

# Reuse the reserved domain already in .env when there is one. A random URL
# would mean re-entering the webhook address in the carrier console every time.
RESERVED=""
if [[ -f .env ]]; then
  RESERVED=$(sed -n 's|^PUBLIC_APP_URL=https://||p' .env | tail -1 | tr -d '[:space:]')
fi

pkill -f 'ngrok http' 2>/dev/null || true
sleep 1

# nohup + disown so the tunnel outlives this script. Without it ngrok dies with
# the launching shell and the reserved domain starts serving ngrok's own 404,
# which looks exactly like the app being down.
if [[ -n "$RESERVED" ]]; then
  nohup ngrok http "127.0.0.1:${HTTP_PORT}" --url="$RESERVED" --log=stdout >/tmp/ngrok-nexus.log 2>&1 &
else
  nohup ngrok http "127.0.0.1:${HTTP_PORT}" --log=stdout >/tmp/ngrok-nexus.log 2>&1 &
fi
disown
echo "Starting ngrok → 127.0.0.1:${HTTP_PORT}…"

URL=""
for i in $(seq 1 20); do
  sleep 0.5
  URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(next((t['public_url'] for t in d.get('tunnels',[]) if t['public_url'].startswith('https')),''))" 2>/dev/null || true)
  if [[ -n "$URL" ]]; then break; fi
done

if [[ -z "$URL" ]]; then
  echo "Failed to get ngrok URL. See /tmp/ngrok-nexus.log"
  exit 1
fi

if [[ -f .env ]]; then
  if grep -q '^PUBLIC_APP_URL=' .env; then
    # portable sed
    if sed --version >/dev/null 2>&1; then
      sed -i "s|^PUBLIC_APP_URL=.*|PUBLIC_APP_URL=$URL|" .env
    else
      sed -i '' "s|^PUBLIC_APP_URL=.*|PUBLIC_APP_URL=$URL|" .env
    fi
  else
    echo "PUBLIC_APP_URL=$URL" >> .env
  fi
fi

VOICE_PROVIDER=telnyx
if [[ -f .env ]]; then
  ENV_PROVIDER=$(sed -n 's/^VOICE_PROVIDER=//p' .env | tail -1 | tr -d '[:space:]')
  [[ -n "${ENV_PROVIDER:-}" ]] && VOICE_PROVIDER="$ENV_PROVIDER"
fi

echo ""
echo "Tunnel:     $URL"
echo "Webhook:    $URL/api/webhooks/voice/${VOICE_PROVIDER}"
echo ""
echo "Reload app env:  docker compose up -d app worker"
echo "Health check:    curl -s http://127.0.0.1:${HTTP_PORT}/api/health/calling | python3 -m json.tool"
echo ""
echo "Keep ngrok running while you place calls."
