# Nexus (local)

Candidate screening platform — Next.js dashboard, Postgres, Redis/BullMQ worker, MinIO storage, Telnyx calling. This repo is set up for **local Docker Compose** only.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running)
- Optional: [ngrok](https://ngrok.com/) if you need live Telnyx webhooks

```bash
docker --version
docker compose version
```

## Quick start

```bash
cp .env.example .env   # skip if .env already exists
# Fill API keys in .env as needed (Gemini, Groq, Telnyx)

docker compose up -d --build
```

Open the app and sign in with `APP_PASSWORD` (default: `supersecretpassword`):

| URL | What |
|-----|------|
| http://localhost | App via Caddy (preferred) |
| http://localhost:3000 | App direct (bypass Caddy) |
| https://localhost | Also works; accept the local cert warning once |
| http://localhost:9001 | MinIO console (`admin` / `password123`) |
| http://localhost:9000 | MinIO S3 API |

> If the browser says “connection failed” on `https://localhost`, use **http://localhost** or **http://localhost:3000** instead (do not force HTTPS).

## Services

| Service | Purpose |
|---------|---------|
| `app` | Next.js web app |
| `worker` | BullMQ jobs (transcription, PDF, summaries) |
| `db` | PostgreSQL 16 |
| `redis` | Queue / cache |
| `storage` | MinIO |
| `caddy` | Reverse proxy on port 80 (HTTP; see `Caddyfile.local`) |

## Day-to-day

```bash
docker compose up -d              # start
docker compose up -d --build      # rebuild after code changes
docker compose logs -f app        # follow app logs
docker compose ps                 # status
docker compose down               # stop (keep data)
docker compose down -v            # stop and wipe volumes
```

## Telnyx / calling

Calling needs a **live public HTTPS URL** so Telnyx can webhook your laptop. Without it, the callee answers to **silence** (no IVR).

```bash
# Stack must already be up on :80
./scripts/start-tunnel.sh
docker compose up -d app worker   # pick up PUBLIC_APP_URL
curl -s http://localhost/api/health/calling | python3 -m json.tool
```

Also set the Telnyx Call Control App webhook (Mission Control) to:

`{PUBLIC_APP_URL}/api/webhooks/telnyx`

(The app also sends this URL on every dial.)

### What you should hear

1. Press **Call** in the browser → phone rings.
2. Answer the **phone** → consent IVR plays **on the phone** (browser stays quiet).
3. Press **1** (record) or **2** (no recording) on the phone keypad.
4. Browser auto-connects → talk as usual.
5. After hangup, worker builds transcript / summary / PDF on the call page.

> Testing with your own number: listen on the handset during consent — not in the dialer UI.

## Hybrid: Next.js on the host

```bash
docker compose up -d db redis storage
cd app && npm install
# Point DATABASE_URL / REDIS_URL / MinIO at localhost (see .env.example; map ports if needed)
APP_PASSWORD=supersecretpassword npm run dev
```

App: http://localhost:3000. Full calling/PDF still needs the `worker` container (or `npm run worker` with Chromium).

## Troubleshooting

**Port 80 in use** — free it, or change the caddy mapping in `docker-compose.yml` (e.g. `"8080:80"`) and open http://localhost:8080.

**Check DB tables:**

```bash
docker compose exec db psql -U nexus -d nexus -c '\dt'
```

**Auth smoke test:**

```bash
curl -sI http://localhost/ | grep -E 'HTTP/|location:'
# expect 307 → /login

curl -s -c /tmp/nexus.txt -X POST http://localhost/api/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"supersecretpassword"}'

curl -s -b /tmp/nexus.txt http://localhost/ | head
```
