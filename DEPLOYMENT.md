# Nexus — AWS Lightsail deployment (~$10/month)

Deploy Nexus so recruiters open a **URL in their browser** — no Docker on their machines.

| | |
|--|--|
| **Cost** | ~**$10/month** (Lightsail 2 GB) — no domain purchase required |
| **Branch to deploy** | **`deploy`** |
| **First deploy** | ~2–3 hours overnight |
| **Updates** | ~15 min (`git pull` + rebuild on server) |

---

## No domain? Use a free hostname (recommended to start)

**AWS Lightsail does not include a free `.com` domain.** You get a **free static IP**, not a website name.

**Solution: [sslip.io](https://sslip.io)** — free hostnames that point at your IP automatically. No registrar, no DNS panel, no cost.

If your Lightsail static IP is `54.123.45.67`:

| Purpose | URL |
|---------|-----|
| App (recruiters open this) | `https://54-123-45-67.sslip.io` |
| File storage (resumes/PDFs) | `https://files.54-123-45-67.sslip.io` |

Rule: replace **dots with dashes** in the IP, append `.sslip.io`.

On your laptop (after you know your IP):

```bash
./scripts/sslip-hostnames.sh 54.123.45.67
```

Copy the printed lines into `/opt/nexus/.env` on the server. Caddy will get a **free Let's Encrypt certificate** for that hostname.

When you buy a real domain later, update `.env` + DNS and redeploy — data stays on the server.

---

## Which branch am I on?

| Branch | Use |
|--------|-----|
| **`develop`** | Coding on your laptop (Docker Compose locally) |
| **`deploy`** | **Production server clones this branch only** |

**You are probably on `develop` locally.** That is correct for building features.

**To deploy tonight:**

1. Laptop: merge finished work into `deploy` and push (if needed)
2. Server: clone **`deploy`** branch — never `develop`

```bash
# On your laptop (when ready to release)
git checkout deploy
git merge develop
git push origin deploy
```

---

## What runs on AWS

One **Lightsail $10/mo** VM runs the same Docker stack as local dev:

```text
Recruiter → https://54-123-45-67.sslip.io → Caddy → Next.js app
Telnyx webhooks → same URL /api/webhooks/telnyx

On the VM:  app + worker + Postgres + Redis + MinIO (all in Docker)
```

---

## Step-by-step (no domain purchased)

### Step 1 — Lightsail instance (~15 min)

1. [AWS Lightsail](https://lightsail.aws.amazon.com/) → **Create instance**
2. **Ubuntu 22.04 or 24.04 LTS**
3. Plan: **$10/mo — 2 GB RAM / 1 vCPU / 60 GB SSD**
4. Create instance → **Networking** → **Create static IP** → attach
5. **Write down the IP** (e.g. `54.123.45.67`)
6. **Firewall:** allow TCP **22**, **80**, **443**

### Step 2 — Hostnames (~2 min)

On your **laptop** in the repo:

```bash
./scripts/sslip-hostnames.sh YOUR_STATIC_IP
```

Save the output — you will paste it into `.env` on the server.

**Skip DNS entirely** with sslip.io.

### Step 3 — SSH into the server (~5 min)

Lightsail → **Connect using SSH** (browser), or:

```bash
ssh -i ~/Downloads/LightsailDefaultKey.pem ubuntu@YOUR_STATIC_IP
```

### Step 4 — Install Nexus (~45 min first build)

On the **server**:

```bash
sudo apt-get update && sudo apt-get install -y git
sudo git clone --branch deploy https://github.com/jatinSharma-create/NEXUS-LOCAL.git /opt/nexus
cd /opt/nexus
sudo cp .env.production.example .env
sudo nano .env
```

Edit `.env`:

1. Paste **sslip.io** values from Step 2 (`DOMAIN`, `FILES_DOMAIN`, `PUBLIC_APP_URL`, `MINIO_PUBLIC_ENDPOINT`)
2. Set `APP_PASSWORD` (recruiter login)
3. Set `ACME_EMAIL` (any real email — for Let's Encrypt)
4. Set `MINIO_SECRET_KEY` (long random string)
5. Paste API keys from your **local `.env`**: Gemini, Groq, Telnyx

Start:

```bash
sudo chmod +x scripts/*.sh
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

First build takes **15–30 minutes**. Watch logs:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f app
```

### Step 5 — Telnyx webhook (~5 min)

Telnyx Mission Control → Call Control App → Webhook:

```text
https://54-123-45-67.sslip.io/api/webhooks/telnyx
```

(Use **your** sslip.io hostname, not this example.)

### Step 6 — Test (~15 min)

Open in browser:

```text
https://54-123-45-67.sslip.io
```

| Test | Expected |
|------|------------|
| Login | `APP_PASSWORD` works |
| Upload resume | Candidate created |
| Search / notes / status | Works |
| Call | Phone rings, IVR on handset |
| After call | Summary + PDF (worker running) |

If HTTPS shows a certificate error, wait 2–3 minutes for Let's Encrypt, ensure ports 80/443 are open, then `docker compose logs caddy`.

---

## Proceed from where you are now

```text
┌─────────────────────────────────────────────────────────────┐
│  YOUR LAPTOP (branch: develop)                              │
│  • Keep coding here                                         │
│  • Test with: docker compose up -d                          │
│  • When ready: merge develop → deploy → git push            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  AWS LIGHTSAIL (branch: deploy)                             │
│  • One-time: clone /opt/nexus, .env, docker compose up      │
│  • Updates: ./scripts/aws-deploy-update.sh                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  RECRUITERS                                                 │
│  • Open https://YOUR-IP-WITH-DASHES.sslip.io                │
│  • Password: APP_PASSWORD                                   │
│  • No Docker, no GitHub, no .env                            │
└─────────────────────────────────────────────────────────────┘
```

**Tonight:** do Steps 1–6 on AWS. You do **not** need to purchase a domain.

---

## Updating production later

**Laptop:**

```bash
git checkout develop
# ... work, commit ...
git checkout deploy
git merge develop
git push origin deploy
```

**Server:**

```bash
cd /opt/nexus
sudo ./scripts/aws-deploy-update.sh
```

Data in Docker volumes is **kept** (same as local — never run `down -v` unless resetting).

---

## Optional: real domain later

1. Buy domain (~$12/year) at any registrar
2. Create A records → Lightsail static IP for `nexus.yourdomain.com` and `files.nexus.yourdomain.com`
3. Update `.env` domains + URLs
4. `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`
5. Update Telnyx webhook to new URL

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Certificate / HTTPS fails | Ports 80+443 open; `DOMAIN` matches sslip.io hostname exactly |
| `502` Bad Gateway | App still building — `docker compose logs app` |
| Calls silent | `PUBLIC_APP_URL` = exact https sslip.io URL; Telnyx webhook matches |
| Login loop | Browser URL must match `DOMAIN` in `.env` |
| Worker OOM | Upgrade Lightsail to $20 (4 GB) plan |

### Useful commands (on server)

```bash
cd /opt/nexus
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f worker
docker compose exec db psql -U nexus -d nexus -c "SELECT COUNT(*) FROM candidates;"
```

---

## Repo files (AWS only)

| File | Purpose |
|------|---------|
| `DEPLOYMENT.md` | This guide |
| `docker-compose.prod.yml` | Production Caddy + TLS |
| `Caddyfile.production` | HTTPS reverse proxy |
| `.env.production.example` | Server env template (sslip.io default) |
| `scripts/sslip-hostnames.sh` | Generate free hostnames from IP |
| `scripts/aws-lightsail-bootstrap.sh` | First-time bootstrap |
| `scripts/aws-deploy-update.sh` | Pull `deploy` + rebuild |

---

## What recruiters need

1. Your sslip.io URL (or custom domain later)
2. `APP_PASSWORD`

Nothing else.
