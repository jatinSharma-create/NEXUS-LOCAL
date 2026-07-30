#!/usr/bin/env bash
# Start ngrok → local Caddy (:80) and print the webhook URL to paste into Telnyx / .env
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v ngrok >/dev/null; then
  echo "Install ngrok: https://ngrok.com/download"
  exit 1
fi

if ! curl -sf http://127.0.0.1:80/login >/dev/null 2>&1; then
  echo "Local stack does not look up on :80. Run: docker compose up -d"
  exit 1
fi

# Kill prior tunnel from this helper if any
pkill -f 'ngrok http 80' 2>/dev/null || true
sleep 1

ngrok http 127.0.0.1:80 --log=stdout >/tmp/ngrok-nexus.log 2>&1 &
echo "Starting ngrok…"

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

echo ""
echo "Tunnel:     $URL"
echo "Webhook:    $URL/api/webhooks/telnyx"
echo ""
echo "Reload app env:  docker compose up -d app worker"
echo "Health check:    curl -s http://localhost/api/health/calling | python3 -m json.tool"
echo ""
echo "Keep this terminal's ngrok process running while you place calls."
