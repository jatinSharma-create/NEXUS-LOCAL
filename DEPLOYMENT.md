# Nexus — AWS deployment guide (under $10/month)

Deploy Nexus so **recruiters open a URL** — no Docker on their laptops. You run one small AWS server with the same Docker stack you use locally.

**Target cost:** **~$10/month** (predictable).  
**Time:** **2–4 hours** first time; **~15 minutes** for later updates.

---

## Why AWS Lightsail (not 6 separate services)

| Approach | Monthly cost | Complexity |
|----------|--------------|------------|
| Vercel + Neon + Upstash + R2 + Railway | ~$5–12 | 5 dashboards, 5 env configs |
| **AWS Lightsail (this guide)** | **~$10** | **1 server, 1 `.env`, same `docker compose`** |
| EC2 + RDS + ElastiCache + S3 | ~$35+ | Overkill for this stage |

Lightsail runs **app + worker + Postgres + Redis + MinIO + Caddy** on one VM — identical to local dev, tuned for production HTTPS.

**You still pay separately for:** Gemini, Groq, Telnyx (usage-based, same as local).

---

## Monthly cost breakdown (AWS)

| Item | Cost | Notes |
|------|------|--------|
| **Lightsail 2 GB plan** | **$10/mo** | 1 vCPU, 60 GB SSD, 3 TB transfer — recommended |
| Lightsail static IP | $0 | Free while attached |
| Domain (Route 53 or Namecheap) | ~$1/mo amortized | ~$12/year for `.com` |
| S3 / RDS / ElastiCache | **$0** | Not needed — everything on the VM |
| **Typical total** | **~$10–11/mo** | Stays under your $10 hosting target if you already own a domain |

### Cheaper / pricier options

| Plan | RAM | Price | Verdict |
|------|-----|-------|---------|
| $5/mo | 512 MB | Too tight for worker + Chromium |
| $7/mo | 1 GB | Possible but may OOM on PDF generation |
| **$10/mo** | **2 GB** | **Recommended — stable overnight deploy** |
| $20/mo | 4 GB | Use if many concurrent calls + large team |

### First 12 months on EC2 instead?

AWS Free Tier includes **750 hrs/month of t2.micro/t3.micro** — but setup is harder (security groups, EBS, no bundled transfer). Lightsail **$10 flat** is easier for an overnight deploy. EC2 free tier is documented in [Appendix B](#appendix-b-ec2-free-tier-optional).

---

## Architecture on AWS

```text
Recruiter browser ──HTTPS──► nexus.yourdomain.com ──► Caddy :443 ──► Next.js app
Telnyx webhooks ──HTTPS──► same URL /api/webhooks/telnyx

On the Lightsail VM (Docker):
  app ──► db (Postgres)
  app ──► redis ──► worker (BullMQ + Chromium)
  app ──► storage (MinIO)
  files.yourdomain.com ──► Caddy ──► MinIO (resume/PDF downloads)
```

**End users:** only need `https://nexus.yourdomain.com` + password.

---

## Branch strategy

| Branch | Purpose |
|--------|---------|
| **`develop`** | Local coding + Docker testing |
| **`deploy`** | What you put on the AWS server |

```bash
git checkout deploy
git merge develop
git push origin deploy
# On server: ./scripts/aws-deploy-update.sh
```

---

## Overnight checklist (print this)

- [ ] AWS account
- [ ] Domain you control (or buy one)
- [ ] Copy API keys from local `.env` (Gemini, Groq, Telnyx)
- [ ] ~2 hours uninterrupted

---

## Step 1 — Create Lightsail instance (~15 min)

1. [AWS Lightsail](https://lightsail.aws.amazon.com/) → **Create instance**
2. **Platform:** Linux/Unix  
3. **Blueprint:** Ubuntu 22.04 or 24.04 LTS  
4. **Plan:** **$10/mo — 2 GB RAM, 1 vCPU, 60 GB SSD**
5. **Name:** `nexus-prod`
6. Create instance

### Attach static IP

1. Instance → **Networking** → **Create static IP** → attach to `nexus-prod`
2. Note the IP (e.g. `54.123.45.67`)

### Open firewall ports

1. Instance → **Networking** → **IPv4 firewall**
2. Add rules:
   - **SSH** TCP 22 (restrict to your IP if possible)
   - **HTTP** TCP 80
   - **HTTPS** TCP 443

---

## Step 2 — DNS (~10 min)

At your domain registrar (Route 53, Cloudflare, Namecheap, etc.), create **A records** pointing to the static IP:

| Host | Type | Value |
|------|------|--------|
| `nexus` (or `@`) | A | `54.123.45.67` |
| `files.nexus` | A | `54.123.45.67` |

Example result:

- App: `https://nexus.yourdomain.com`
- Files: `https://files.nexus.yourdomain.com`

Wait 5–30 minutes for DNS to propagate. Check:

```bash
dig +short nexus.yourdomain.com
```

---

## Step 3 — SSH into the server (~5 min)

Lightsail → instance → **Connect using SSH** (browser) or download key:

```bash
ssh -i ~/Downloads/LightsailDefaultKey.pem ubuntu@54.123.45.67
```

---

## Step 4 — Bootstrap Nexus (~30–45 min)

### Option A — automated script

```bash
sudo apt-get update && sudo apt-get install -y git
sudo git clone --branch deploy https://github.com/jatinSharma-create/NEXUS-LOCAL.git /opt/nexus
cd /opt/nexus
sudo cp .env.production.example .env
sudo nano .env   # fill in everything (see Step 5)
sudo chmod +x scripts/*.sh
sudo ./scripts/aws-lightsail-bootstrap.sh
```

First run with empty `.env` edits stops after creating `.env`. Edit `.env`, then run bootstrap again.

### Option B — manual (if script fails)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo git clone --branch deploy https://github.com/jatinSharma-create/NEXUS-LOCAL.git /opt/nexus
cd /opt/nexus
sudo cp .env.production.example .env
sudo nano .env
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

First build takes **15–30 minutes** on a $10 instance.

---

## Step 5 — Configure `.env` on the server

Edit `/opt/nexus/.env`:

```env
APP_PASSWORD=your-strong-recruiter-password

DOMAIN=nexus.yourdomain.com
FILES_DOMAIN=files.nexus.yourdomain.com
ACME_EMAIL=you@yourdomain.com

PUBLIC_APP_URL=https://nexus.yourdomain.com
MINIO_PUBLIC_ENDPOINT=https://files.nexus.yourdomain.com

MINIO_SECRET_KEY=long-random-minio-password

# Paste from your local .env:
GOOGLE_GENERATIVE_AI_API_KEY=...
GROQ_API_KEY=...
TELNYX_API_KEY=...
TELNYX_PUBLIC_KEY=...
TELNYX_CALL_CONTROL_APP_ID=...
TELNYX_TELEPHONY_CREDENTIAL_ID=...
TELNYX_CALLER_ID=...
TELNYX_SIP_URI=...
```

Leave `DATABASE_URL`, `REDIS_URL`, `MINIO_ENDPOINT` as in `.env.production.example` (Docker internal names).

---

## Step 6 — Telnyx webhook (~5 min)

Telnyx Mission Control → Call Control App → Webhook URL:

```text
https://nexus.yourdomain.com/api/webhooks/telnyx
```

No ngrok needed — your domain is already public HTTPS.

---

## Step 7 — Verify (~20 min)

```bash
cd /opt/nexus
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose logs -f app
```

| Test | URL / action |
|------|----------------|
| Login | `https://nexus.yourdomain.com` → password |
| Upload resume | Candidates → Upload |
| Search / notes / status | Stage 1 features |
| Call | Dial candidate → IVR on phone |
| After call | Summary + PDF on call page |
| HTTPS on files | Resume download link works |

### Health commands on server

```bash
docker compose exec db psql -U nexus -d nexus -c '\dt'
docker compose exec db psql -U nexus -d nexus -c "SELECT COUNT(*) FROM candidates;"
curl -sI https://nexus.yourdomain.com/login | head -5
```

---

## Updating production (after you merge to `deploy`)

**On your laptop:**

```bash
git checkout deploy
git merge develop
git push origin deploy
```

**On the server:**

```bash
cd /opt/nexus
sudo ./scripts/aws-deploy-update.sh
```

Data is kept in Docker volumes (`pgdata`, `miniodata`, etc.) — same as local `docker compose down` without `-v`.

---

## Using AWS to the fullest (without breaking $10)

On a single Lightsail box you already use:

| AWS concept | How Nexus uses it |
|-------------|-------------------|
| **Compute** | Lightsail VM runs all containers |
| **Persistent disk** | 60 GB SSD — DB + MinIO + images |
| **Static IP** | Stable Telnyx webhook target |
| **Firewall** | Ports 80/443 only public |
| **HTTPS** | Caddy + Let's Encrypt (free certs) |

### When you outgrow $10 (future, optional)

| Upgrade | When | Extra cost |
|---------|------|------------|
| Lightsail **$20** (4 GB) | Many concurrent calls / PDF jobs | +$10/mo |
| **S3** instead of MinIO | Offload files, snapshot backups | ~$1–3/mo at small scale |
| **RDS** instead of container Postgres | Need managed backups/HA | ~$15+/mo — skip until needed |
| **Route 53** health checks | Uptime monitoring | ~$0.50/mo |

For now, **one $10 Lightsail + domain** is the efficient sweet spot.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| HTTPS certificate fails | DNS must point to server before Caddy starts; ports 80/443 open |
| `502` from Caddy | `docker compose logs app` — app still building? |
| Calls silent / no IVR | `PUBLIC_APP_URL` must match live HTTPS URL; Telnyx webhook correct |
| OOM / worker crashes | Upgrade to $20 plan or reduce worker `mem_limit` in compose |
| Resume download fails | Check `FILES_DOMAIN` DNS + `MINIO_PUBLIC_ENDPOINT` match |
| Login loop | `DOMAIN` in `.env` must match browser hostname |

### Restart everything

```bash
cd /opt/nexus
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart
```

### Full reset (deletes all candidate data)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

## Appendix A — Multi-service cloud (previous guide)

If you prefer **not** to manage a server:

- **Vercel** (app) + **Neon** (DB) + **Upstash** (Redis) + **Cloudflare R2** (files) + **Railway** (worker) ≈ **$5/mo** but 5 services to configure.

See git history for the old `DEPLOYMENT.md` or use `app/vercel.json` + `railway.worker.toml` in the repo.

---

## Appendix B — EC2 free tier (optional)

If you are in AWS **Free Tier** first year:

1. Launch **t3.micro** or **t4g.micro** (Ubuntu)
2. Elastic IP + Security Group (22, 80, 443)
3. Same steps: install Docker, clone repo, `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`

Cost after free tier: ~**$8–10/mo** (instance + EBS). More manual than Lightsail.

---

## Files reference

| File | Purpose |
|------|---------|
| `DEPLOYMENT.md` | This guide |
| `docker-compose.prod.yml` | Production overrides (Caddy TLS, lock down MinIO) |
| `Caddyfile.production` | Let's Encrypt + reverse proxy |
| `.env.production.example` | Server env template |
| `scripts/aws-lightsail-bootstrap.sh` | First-time server setup |
| `scripts/aws-deploy-update.sh` | Pull `deploy` + rebuild |

---

## What recruiters need

1. `https://nexus.yourdomain.com`
2. `APP_PASSWORD`

Nothing else.
