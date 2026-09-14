# Deploy Nexus (branch: `deploy`)

**This is the only deployment guide.** Follow it from top to bottom. You do not
need any other markdown file to go live.

When you are done, other people open **one HTTPS URL**, type **one password**,
and can place calls. They do not install Docker, Git, or an APK.

| | |
|--|--|
| **Where** | One AWS Lightsail VM (Ubuntu). Same Docker stack as your laptop. |
| **Cost** | ~**US$12 / ~A$18 per month** for the 2 GB box. Gemini (LLM) is extra cents. No VoIP in that figure. No domain required. |
| **Time** | First night **~2 hours** (15–30 min of that is waiting on the first image build). Later updates **~15 min**. |
| **Branch** | Server clones **`deploy` only**. Never clone `develop` onto the box. |

Do **not** share a laptop ngrok URL, and do **not** put this on Vercel. Calling
needs a stable public HTTPS host for Telnyx webhooks. A laptop tunnel dies when
you close the lid.

```
You  ──push deploy──►  Lightsail (Caddy + app + worker + db + redis + MinIO)
                              │
                              │  https://54-123-45-67.sslip.io
                              ▼
                     Recruiter's browser  (login = APP_PASSWORD)
                              │
              place call ──► Telnyx ──► candidate's phone
                              ▲
                     /api/webhooks/voice/telnyx
```

---

## 0. On your laptop — confirm `deploy`

```bash
git checkout deploy
git pull origin deploy
git rev-parse --abbrev-ref HEAD    # must print: deploy
./scripts/verify-deploy.sh
```

Optional local smoke test (Docker Desktop running):

```bash
docker compose up -d
curl -s -o /dev/null -w 'login %{http_code}\n' http://127.0.0.1:8080/login
curl -s http://127.0.0.1:8080/api/health/calling
```

Login should be `200`. Health should show `missing: []`. `ready` may be false
on the laptop if the tunnel is down; that does not block Lightsail.

---

## 1. Lightsail instance (~15 min)

1. [AWS Lightsail](https://lightsail.aws.amazon.com/) → **Create instance**
2. **Ubuntu 22.04 or 24.04 LTS**
3. Plan: **2 GB RAM** (the $7 / 1 GB plan is too small for this stack)
4. **Networking → Create static IP** → attach it. Write the IP down.
5. **Firewall:** TCP **22**, **80**, **443** only.

---

## 2. Free hostname (~2 min) — no domain to buy

Lightsail gives you an IP, not a `.com`. Use [sslip.io](https://sslip.io):
replace **dots with dashes**, append `.sslip.io`.

If the IP is `54.123.45.67`:

| Purpose | URL |
|---------|-----|
| App (what you share) | `https://54-123-45-67.sslip.io` |
| File storage | `https://files.54-123-45-67.sslip.io` |

On the **laptop**:

```bash
./scripts/sslip-hostnames.sh YOUR_STATIC_IP
```

Copy `DOMAIN`, `FILES_DOMAIN`, `PUBLIC_APP_URL`, `MINIO_PUBLIC_ENDPOINT`.

---

## 3. SSH (~5 min)

Lightsail → **Connect using SSH**, or:

```bash
ssh -i ~/Downloads/LightsailDefaultKey.pem ubuntu@YOUR_STATIC_IP
```

---

## 4. Install (~45 min including first build)

On the **server**:

```bash
sudo apt-get update && sudo apt-get install -y git docker.io docker-compose-v2
sudo git clone --branch deploy https://github.com/jatinSharma-create/NEXUS-LOCAL.git /opt/nexus
cd /opt/nexus
sudo cp .env.production.example .env
sudo nano .env
```

Fill `.env`:

| Must set | Why |
|---|---|
| sslip.io lines from step 2 | Public HTTPS and file URLs |
| `APP_PASSWORD` | What you share with the other person |
| `MINIO_SECRET_KEY` | Long random; not the example |
| `ACME_EMAIL` | Let's Encrypt |
| Gemini / Groq / Telnyx keys | Same values as local `.env` |
| `VOICE_PROVIDER=telnyx` | Live calling |

Do **not** copy a laptop `.env` that has `HTTP_PORT=8080`. Production Caddy
must bind 80 and 443.

```bash
sudo chmod +x scripts/*.sh
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

First build is **15–30 minutes**. **Do not** add `--profile tunnel`.

Watch:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f app
```

A brand-new box uses `db/init.sql`. If this database already had the old
`telnyx_*` column names:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db \
  psql -U nexus -d nexus < db/migrate-provider-agnostic-voice.sql
```

It is safe to run twice.

---

## 5. Telnyx webhook (~5 min)

Mission Control → Call Control app → webhook:

```text
https://YOUR-IP-WITH-DASHES.sslip.io/api/webhooks/voice/telnyx
```

`PUBLIC_APP_URL` must be that same origin, `https`, no trailing slash. The older
path `/api/webhooks/telnyx` still works; prefer the new one.

---

## 6. Prove it before you share (~15 min)

```bash
curl -s https://YOUR-IP-WITH-DASHES.sslip.io/api/health/calling
```

Need `ready: true`, `publicReachable: true`, `missing: []`.

Then in the browser:

| Test | Expected |
|------|------------|
| Login | `APP_PASSWORD` works |
| Upload resume | Candidate created |
| Call | Candidate hears consent; **your** browser rings after 1 or 2 |
| After a **press 1** call | Transcript + PDF (wait for the worker) |

If HTTPS errors, wait 2–3 minutes for Let's Encrypt, confirm ports 80/443, then
`docker compose logs caddy`.

---

## 7. What you send

```
Nexus:     https://YOUR-IP-WITH-DASHES.sslip.io
Password:  <APP_PASSWORD>

Stay on the page after Call. The candidate answers the recording
question first. Your browser rings after they press 1 or 2.
Press 2 means the call is live but not recorded — no transcript.
```

Do **not** send `.env`, API keys, or SSH keys.

---

## Security

- HTTPS is required (Caddy + Let's Encrypt).
- Change `APP_PASSWORD` and `MINIO_SECRET_KEY` from the examples.
- Do not open Postgres, Redis, or MinIO on the Lightsail firewall.
- Keep `TELNYX_PUBLIC_KEY` set so webhooks are signed.
- One shared password is enough for a small team. When someone leaves, change
  `APP_PASSWORD` and restart `app`.

---

## Provider switches (still modular on the server)

In `/opt/nexus/.env`, then recreate the named services:

| Change | Set |
|---|---|
| Voice | `VOICE_PROVIDER=telnyx` (or `fake`) |
| Transcription | `STT_PROVIDER=groq` or `gemini` |
| Summaries | `LLM_PROVIDER=google` |
| Files | `STORAGE_PROVIDER=s3` + endpoint/keys |

```bash
cd /opt/nexus
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Add a new vendor adapter on `develop`, merge to `deploy`, pull on the box.
Do not install extra SDKs only on the server.

Many transcript PDFs stay on the box until the disk is tight; then point the
same S3 adapter at Cloudflare R2 or AWS S3. No application rewrite.

---

## Updates later

**Laptop**

```bash
git checkout develop
# work, commit, push
git checkout deploy
git merge develop
git push origin deploy
```

**Server**

```bash
cd /opt/nexus
sudo ./scripts/aws-deploy-update.sh
```

Never `docker compose down -v` on the server. That deletes production data.

---

## Optional: a real domain later

1. Buy a domain, A records → Lightsail static IP for the app and `files.` host
2. Update `.env` (`DOMAIN`, `FILES_DOMAIN`, `PUBLIC_APP_URL`, `MINIO_PUBLIC_ENDPOINT`)
3. Recreate compose, update the Telnyx webhook

---

## If something is silent

| Symptom | Fix |
|---|---|
| Certificate / HTTPS fails | Ports 80+443; `DOMAIN` matches the URL exactly |
| `502` | App still building — `docker compose logs app` |
| `ready: false` / not publicly reachable | `PUBLIC_APP_URL` wrong, or 80/443 closed |
| Candidate answers to silence | Webhook still on an old ngrok URL |
| Call works, no PDF | They pressed **2** — that is intended |
| First ring dies, second works | Recruiter hung up during consent — stay on the page |
| Login loop | Browser URL must match `DOMAIN` |
| Worker OOM | Upgrade to the 4 GB Lightsail plan |

```bash
cd /opt/nexus
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f worker
```

---

## Files the server uses (not extra guides)

| File | Purpose |
|------|---------|
| **`DEPLOYMENT.md`** | **This file — every instruction** |
| `docker-compose.yml` + `docker-compose.prod.yml` | App, worker, db, redis, MinIO, Caddy on 80/443 |
| `Caddyfile.production` | HTTPS reverse proxy |
| `.env.production.example` | Copy to `.env` on the server |
| `scripts/sslip-hostnames.sh` | Free hostname from the static IP |
| `scripts/aws-lightsail-bootstrap.sh` | Optional first-time bootstrap |
| `scripts/aws-deploy-update.sh` | Pull `deploy` and rebuild |
| `scripts/verify-deploy.sh` | Laptop check before you spend on AWS |
| `db/migrate-provider-agnostic-voice.sql` | Only if the database predates this schema |
