# Nexus — Complete AWS Production Deploy Guide

**Goal:** Run the full Nexus stack (Next.js + worker + Postgres + Redis + MinIO + Caddy) on AWS, get a public HTTPS URL, wire Telnyx webhooks, and set up GitHub Actions CI/CD so every push to `main` deploys automatically.

**Recommended path:** **Amazon Lightsail** (one Ubuntu VM + Docker Compose). Same architecture as the Oracle guide, billed as a fixed monthly plan.

**Time:** about **1.5–2.5 hours** first time (AWS account + VM + first Docker build).  
**Typical hosting cost:** **~$12–24/month** for Lightsail (see [§3 Cost](#3-how-much-will-this-cost)). Telnyx / Gemini / Groq are separate API costs.

---

## Table of contents

1. [What you are building](#1-what-you-are-building)
2. [Why Lightsail (not ECS/RDS first)](#2-why-lightsail-not-ecsrds-first)
3. [How much will this cost?](#3-how-much-will-this-cost)
4. [Prerequisites checklist](#4-prerequisites-checklist)
5. [Part A — AWS account + billing safety](#5-part-a--aws-account--billing-safety)
6. [Part B — Create the Lightsail instance](#6-part-b--create-the-lightsail-instance)
7. [Part C — Networking & firewall](#7-part-c--networking--firewall)
8. [Part D — SSH into the instance](#8-part-d--ssh-into-the-instance)
9. [Part E — Install Docker](#9-part-e--install-docker)
10. [Part F — Clone the Nexus repo](#10-part-f--clone-the-nexus-repo)
11. [Part G — Free hostname with sslip.io](#11-part-g--free-hostname-with-sslipio)
12. [Part H — Create production `.env`](#12-part-h--create-production-env)
13. [Part I — First deploy](#13-part-i--first-deploy)
14. [Part J — Verify HTTPS](#14-part-j--verify-https)
15. [Part K — Update Telnyx webhooks](#15-part-k--update-telnyx-webhooks)
16. [Part L — End-to-end test](#16-part-l--end-to-end-test)
17. [Part M — CI/CD with GitHub Actions](#17-part-m--cicd-with-github-actions)
18. [Part N — Snapshots, updates, and day-2 ops](#18-part-n--snapshots-updates-and-day-2-ops)
19. [Optional: EC2 instead of Lightsail](#19-optional-ec2-instead-of-lightsail)
20. [Optional: “full managed” AWS (expensive)](#20-optional-full-managed-aws-expensive)
21. [Troubleshooting](#21-troubleshooting)
22. [Cost checklist before you leave this running](#22-cost-checklist-before-you-leave-this-running)

---

## 1. What you are building

Nexus is **one Docker Compose stack** on a single always-on Linux VM:

```
Internet users / Telnyx
        │
        ▼
  https://YOUR-IP.sslip.io     ← Caddy (Let's Encrypt HTTPS on :80/:443)
        │
        ├── app (Next.js CRM + WebRTC dialer)     :3000 internal
        ├── worker (Groq/Gemini STT + Puppeteer PDF)
        ├── db (Postgres 16)
        ├── redis (BullMQ queue)
        └── storage (MinIO → https://files.YOUR-IP.sslip.io)
```

| Piece | Role |
|-------|------|
| **App URL** | Login, candidates, dialer, calls UI |
| **Webhook URL** | Telnyx call events (`answered`, DTMF, hangup, recording) |
| **Files URL** | Resume / recording / PDF downloads |

The website can load without Telnyx, but **calls will not work** until the webhook points at this AWS host.

**Why always-on matters:** sleeping hosts (Render/Railway free web) drop Telnyx webhooks. Lightsail/EC2 stay up 24/7.

---

## 2. Why Lightsail (not ECS/RDS first)

| Approach | Fits this repo? | Complexity | Typical monthly cost |
|----------|-----------------|------------|----------------------|
| **Lightsail + Docker Compose** (this guide) | Perfect — same as Oracle/Hetzner | Low | **$12–24** |
| **EC2 + Docker Compose** | Perfect | Medium | **~$15–35** + EBS |
| **ECS Fargate + RDS + ElastiCache + S3 + ALB** | Requires rewriting deploy | High | **~$80–200+** |

Your repo already has `docker-compose.yml`, `scripts/bootstrap-vps.sh`, `scripts/deploy.sh`, and `.github/workflows/deploy.yml` (SSH deploy). Lightsail is the smallest change: one Ubuntu box, same commands.

---

## 3. How much will this cost?

Prices below are **USD**, **Linux**, **public IPv4** Lightsail plans as published by AWS around mid‑2026. Always re-check [Lightsail pricing](https://aws.amazon.com/lightsail/pricing/) before you buy — AWS can change plan names/prices.

### 3.1 Recommended instance sizes for Nexus

Nexus runs **6 containers**. The worker alone allows up to **1 GB RAM** (Chromium for PDFs). A 1 GB plan is too small.

| Plan | RAM | vCPU | Disk | Transfer included | Approx. price | Verdict for Nexus |
|------|-----|------|------|-------------------|---------------|-------------------|
| Micro | 1 GB | 2 | 40 GB | 2 TB | **~$7/mo** | ❌ Too small (OOM risk) |
| **Small** | **2 GB** | 2 | 60 GB | 3 TB | **~$12/mo** | ⚠️ Minimum — tight; OK for light demos |
| **Medium** | **4 GB** | 2 | 80 GB | 4 TB | **~$24/mo** | ✅ **Recommended** |
| Large | 8 GB | 2 | 160 GB | 5 TB | **~$44/mo** | Comfortable headroom |

**Recommendation:** start on **Medium ($24/mo)**. If you only need short demos and watch memory carefully, **Small ($12/mo)** can work.

IPv6-only plans are a few dollars cheaper but Telnyx / browsers / sslip.io are simpler with **IPv4** — use the dual-stack / public IPv4 plan.

### 3.2 Full monthly cost picture (realistic)

| Item | Low (demo) | Recommended | Notes |
|------|------------|-------------|-------|
| Lightsail Medium (4 GB) | — | **~$24** | Fixed plan |
| Lightsail Small (2 GB) | **~$12** | — | Tighter RAM |
| Static IP (optional) | $0 while attached | $0 while attached | Charged only if allocated **and not attached** |
| Automatic snapshots | **~$0.50–2** | **~$1–3** | ~$0.05/GB-month of changed data |
| Extra block storage | $0 | $0–few $ | Only if you add disks |
| **AWS hosting subtotal** | **~$12–14** | **~$25–27** | |
| Telnyx (voice/SMS) | usage | usage | Your Telnyx account — not AWS |
| Gemini API | usage | usage | Google AI Studio / Cloud |
| Groq STT | usage | usage | Groq cloud |
| Domain name | **$0** | **$0** | Use free `sslip.io` (or buy later) |

**Ballpark to keep the working app online on AWS:**

- **Cheap demo:** ~**$12–15/month** hosting + API usage  
- **Comfortable production-ish:** ~**$25–30/month** hosting + API usage  

There is **no forever-free** always-on AWS plan that safely fits this full Compose stack. New AWS accounts may get a short Lightsail trial or EC2 free-tier micro instance — a **t3.micro (1 GB)** is still too small for Nexus; treat free-tier micros as unusable for this app.

### 3.3 What you are *not* paying for (in this guide)

With Compose-on-one-VM you avoid:

- Application Load Balancer (~$16+/mo)
- RDS Postgres (~$15–30+/mo smallest)
- ElastiCache Redis (~$12+/mo)
- NAT Gateway (~$32+/mo) if you stay on a public Lightsail instance

Those show up only in [§20](#20-optional-full-managed-aws-expensive).

### 3.4 Set a hard budget alert (do this on day one)

1. AWS Console → search **Billing** → **Budgets** (or [AWS Budgets](https://console.aws.amazon.com/billing/home#/budgets)).
2. Create a **Cost budget**.
3. Amount: **$30 USD / month** (or lower if you chose the $12 plan).
4. Alert at **50%**, **80%**, and **100%** → your email.
5. Optionally enable **AWS Free Tier** / billing alerts under **Billing preferences**.

If something unexpected starts (extra instance, unattached IP), you get emailed early.

---

## 4. Prerequisites checklist

Do these on your **laptop** before creating the AWS instance.

### 4.1 Accounts & keys (copy from your local Nexus `.env`)

- [ ] `GOOGLE_GENERATIVE_AI_API_KEY`
- [ ] `GROQ_API_KEY` (if `STT_PROVIDER=groq`)
- [ ] `TELNYX_API_KEY`
- [ ] `TELNYX_PUBLIC_KEY`
- [ ] `TELNYX_CALL_CONTROL_APP_ID`
- [ ] `TELNYX_TELEPHONY_CREDENTIAL_ID`
- [ ] `TELNYX_CALLER_ID` (E.164, e.g. `+1737...`)
- [ ] `TELNYX_SIP_URI`

### 4.2 Code on GitHub

- [ ] Nexus pushed to GitHub (`main` branch).
- [ ] You can create repository **Secrets** (needed for CI/CD in Part M).

### 4.3 On your laptop

- [ ] Terminal / SSH client
- [ ] Ability to download and store a Lightsail `.pem` key (`chmod 600`)

### 4.4 What you do **not** need

- [x] A purchased domain (use `sslip.io`)
- [x] ECS, RDS, S3, CloudFront (optional later)
- [x] ngrok on the server (keep ngrok for **local** laptop only)

---

## 5. Part A — AWS account + billing safety

### 5.1 Create / sign in

1. Open [https://aws.amazon.com](https://aws.amazon.com) → **Create an AWS Account** (or sign in).
2. Complete identity / payment method. AWS requires a card even for small paid Lightsail plans.
3. Sign in to the **AWS Management Console**.

### 5.2 Pick a region and stick to it

Lightsail is regional. Choose one close to you / your users, e.g.:

- `ap-southeast-2` (Sydney) — good for Australia  
- `us-east-1` (N. Virginia) — often cheapest / most capacity  
- `eu-west-1` (Ireland) — EU  

Remember the region — you will create the instance **and** look for its IP in that same region.

### 5.3 Open Lightsail (not EC2) for this guide

1. Console search bar → type **Lightsail**.
2. Or go to [https://lightsail.aws.amazon.com](https://lightsail.aws.amazon.com).
3. Confirm the region dropdown (top-right of Lightsail UI) matches your choice.

---

## 6. Part B — Create the Lightsail instance

### 6.1 Create instance

1. Lightsail home → **Create instance**.
2. **Instance location:** your chosen region / availability zone (default AZ is fine).
3. **Pick your instance image:**
   - Platform: **Linux/Unix**
   - Blueprint: **OS Only** → **Ubuntu 22.04** or **24.04** LTS  
   - Do **not** pick “Node.js” / “Docker” blueprints — we install Docker ourselves so Compose matches this repo.
4. **Optional:** skip Launch script for now.
5. **Choose your instance plan:**
   - Preferred: **$24** → **4 GB RAM / 2 vCPU / 80 GB SSD**
   - Budget: **$12** → **2 GB RAM / 2 vCPU / 60 GB SSD**
6. **Identify your instance:** name it `nexus` (or `nexus-prod`).
7. **SSH key:**
   - **Create new** (easiest) → download the `.pem` and store it safely, **or**
   - Upload / select an existing key.
8. Click **Create instance**.

Wait until status is **Running** (usually under a minute).

### 6.2 Save the SSH key on your laptop (macOS example)

```bash
mkdir -p ~/.ssh
mv ~/Downloads/LightsailDefaultKey-*.pem ~/.ssh/lightsail-nexus.pem
# or whatever filename AWS gave you
chmod 600 ~/.ssh/lightsail-nexus.pem
```

If you lose this private key, you cannot SSH until you rebuild or use Lightsail browser SSH.

### 6.3 Attach a static IP (strongly recommended)

Ephemeral IPs can change if you stop/start the instance — that would break `sslip.io` and Telnyx webhooks.

1. Lightsail → **Networking** (left) → **Create static IP**.
2. Attach it to instance `nexus`.
3. Name it `nexus-static-ip`.
4. Create.

**Cost note:** Static IP is **free while attached** to a running instance. If you delete the instance but leave the static IP allocated, AWS charges for the idle IP — detach/delete unused static IPs.

Copy the **static IPv4 address** (e.g. `3.104.82.17`). You need it for DNS + SSH.

### 6.4 Optional: automatic snapshots

1. Instance → **Snapshots** → enable **Automatic snapshots** (daily).
2. Keep 7 days if offered.

Budget ~$1–3/mo depending on disk usage. Worth it before first public demo.

---

## 7. Part C — Networking & firewall

Lightsail uses **instance networking firewall** (simpler than EC2 Security Groups).

### 7.1 Open HTTP / HTTPS

1. Lightsail → Instances → `nexus` → **Networking**.
2. Under **IPv4 Firewall**, ensure:

| Application | Protocol | Port |
|-------------|----------|------|
| SSH | TCP | 22 |
| HTTP | TCP | 80 |
| HTTPS | TCP | 443 |

3. Add **HTTP** and **HTTPS** if missing (SSH is usually there by default).

Do **not** open 3000, 5432, 6379, or 9000 to the world. Caddy terminates TLS; MinIO is localhost-bound in Compose and proxied as `files.$DOMAIN`.

### 7.2 Confirm from your laptop later

After deploy:

```bash
curl -I http://YOUR_STATIC_IP
# expect a redirect or Caddy response once the stack is up
```

---

## 8. Part D — SSH into the instance

### 8.1 Option A — Laptop SSH (preferred for this guide)

Lightsail Ubuntu default user is usually **`ubuntu`**.

```bash
ssh -i ~/.ssh/lightsail-nexus.pem ubuntu@YOUR_STATIC_IP
```

First connect: type `yes` to accept the host key.

If permission denied:

```bash
# key must be 600
chmod 600 ~/.ssh/lightsail-nexus.pem
# confirm user is ubuntu (not ec2-user — that is Amazon Linux)
ssh -i ~/.ssh/lightsail-nexus.pem -v ubuntu@YOUR_STATIC_IP
```

### 8.2 Option B — Browser SSH

Lightsail instance page → **Connect using SSH**. Useful if your `.pem` is missing; still install Docker the same way in the browser terminal.

### 8.3 Optional SSH config (laptop)

Add to `~/.ssh/config`:

```text
Host nexus-aws
  HostName YOUR_STATIC_IP
  User ubuntu
  IdentityFile ~/.ssh/lightsail-nexus.pem
```

Then: `ssh nexus-aws`.

---

## 9. Part E — Install Docker

On the instance:

```bash
sudo apt-get update -y
cd /tmp
# Clone is later — for now just get Docker. Easiest path uses the repo script after clone.
# Or install Docker immediately:
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

**Log out and SSH back in** so the `docker` group applies:

```bash
exit
ssh -i ~/.ssh/lightsail-nexus.pem ubuntu@YOUR_STATIC_IP
docker --version
docker compose version
```

Both commands should print versions.

### 9.1 Firewall on the guest OS (ufw)

Lightsail’s networking firewall already filters the public edge. Still run the project bootstrap after clone so `ufw` matches other VPS docs:

```bash
# after repo is cloned to /opt/nexus (next section):
sudo bash /opt/nexus/scripts/bootstrap-vps.sh
```

That script installs Docker (if missing), enables Docker, and opens ufw for `22/80/443`.

---

## 10. Part F — Clone the Nexus repo

### 10.1 Create app directory

```bash
sudo mkdir -p /opt/nexus
sudo chown "$USER":"$USER" /opt/nexus
cd /opt/nexus
```

### 10.2 Clone

**Public repo:**

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/NEXUS.git /opt/nexus
cd /opt/nexus
```

**Private repo** (fine-grained PAT or classic token with `repo` read):

```bash
git clone https://YOUR_GITHUB_USERNAME:YOUR_PAT@github.com/YOUR_GITHUB_USERNAME/NEXUS.git /opt/nexus
cd /opt/nexus
```

For CI/CD later, prefer a **deploy key** or machine user so the server can `git pull` without embedding a personal PAT in shell history. Minimum for first boot: HTTPS + PAT works.

### 10.3 Confirm layout

```bash
ls
# expect: app  db  docker-compose.yml  Caddyfile  Caddyfile.local  scripts  docs  .env.example
chmod +x scripts/bootstrap-vps.sh scripts/deploy.sh
sudo bash scripts/bootstrap-vps.sh
```

---

## 11. Part G — Free hostname with sslip.io

No domain purchase. [sslip.io](https://sslip.io) maps `IP-with-dashes.sslip.io` → your IP automatically.

### 11.1 Convert your static IP

| Public IP | Hostname `DOMAIN` |
|-----------|-------------------|
| `3.104.82.17` | `3-104-82-17.sslip.io` |
| `54.66.10.20` | `54-66-10-20.sslip.io` |

**Rule:** replace every `.` with `-`, then append `.sslip.io`.

### 11.2 Verify DNS

```bash
sudo apt-get install -y dnsutils
dig +short 3-104-82-17.sslip.io
```

Must return your static IP.

### 11.3 URLs you will use

| Purpose | URL |
|---------|-----|
| App (share this) | `https://3-104-82-17.sslip.io` |
| Files | `https://files.3-104-82-17.sslip.io` |
| Telnyx webhook | `https://3-104-82-17.sslip.io/api/webhooks/telnyx` |

---

## 12. Part H — Create production `.env`

### 12.1 Copy template

```bash
cd /opt/nexus
cp .env.example .env
nano .env
```

(`nano`: edit → `Ctrl+O` Enter → `Ctrl+X`. Or use `vim`.)

### 12.2 Full production example

Replace the hostname and paste **your** real secrets from local `.env`.

```env
# ── Hostname (sslip.io — no domain purchase) ─────────────────
DOMAIN=3-104-82-17.sslip.io
CADDYFILE=Caddyfile
PUBLIC_APP_URL=https://3-104-82-17.sslip.io
MINIO_PUBLIC_ENDPOINT=https://files.3-104-82-17.sslip.io

# ── App auth ─────────────────────────────────────────────────
APP_PASSWORD=choose-a-long-random-password-here

# ── Postgres (matches docker-compose defaults) ───────────────
DATABASE_URL=postgres://nexus:nexus@db:5432/nexus

# ── MinIO ────────────────────────────────────────────────────
MINIO_ACCESS_KEY=admin
MINIO_SECRET_KEY=change-this-to-a-long-random-secret
MINIO_BUCKET=nexus

# ── AI / STT ─────────────────────────────────────────────────
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_key
GOOGLE_GENERATIVE_AI_MODEL=gemini-2.5-flash-lite
STT_PROVIDER=groq
GROQ_API_KEY=your_groq_key
GROQ_STT_MODEL=whisper-large-v3-turbo

# ── Telnyx ───────────────────────────────────────────────────
TELNYX_API_KEY=your_telnyx_api_key
TELNYX_PUBLIC_KEY=your_telnyx_public_key
TELNYX_CALL_CONTROL_APP_ID=your_call_control_app_id
TELNYX_TELEPHONY_CREDENTIAL_ID=your_telephony_credential_id
TELNYX_CALLER_ID=+1737XXXXXXX
TELNYX_SIP_URI=sip:yourcred@sip.telnyx.com

# ── Branding / consent ───────────────────────────────────────
NEXUS_COMPANY_NAME=Nexus Recruiting
IVR_CONSENT_ANNOUNCEMENT=
CONSENT_GATHER_TIMEOUT_SECS=10
CONSENT_MAX_RETRIES=2
RECORDING_ENABLED=true

# ── Redis ────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379
```

### 12.3 Checklist before saving

- [ ] `DOMAIN` = sslip.io form of **this** Lightsail static IP  
- [ ] `CADDYFILE=Caddyfile` (**not** `Caddyfile.local`)  
- [ ] `PUBLIC_APP_URL=https://$DOMAIN` (https, no trailing slash)  
- [ ] `MINIO_PUBLIC_ENDPOINT=https://files.$DOMAIN`  
- [ ] `APP_PASSWORD` is not the example default  
- [ ] Telnyx / AI keys have no trailing spaces  

### 12.4 Lock down the file

```bash
chmod 600 /opt/nexus/.env
```

Never commit `.env` to GitHub.

---

## 13. Part I — First deploy

### 13.1 Run the deploy script

```bash
cd /opt/nexus
bash scripts/deploy.sh
```

What it does:

1. Loads `.env`  
2. Aborts if `DOMAIN` is missing / `localhost`  
3. `docker compose up -d --build` — **first build often 10–20 minutes**  
4. Applies every `db/migrate-*.sql` (idempotent; failures ignored with `|| true`)  
5. Prints App URL, MinIO URL, and Telnyx webhook URL  

### 13.2 Watch progress (second SSH session)

```bash
docker compose ps
docker compose logs -f caddy
# Ctrl+C to stop following
```

### 13.3 Expected containers (all Up)

```text
nexus-app-1
nexus-worker-1
nexus-db-1
nexus-redis-1
nexus-storage-1
nexus-caddy-1
```

Names may include a project prefix; status should be **Up** / **running**.

### 13.4 First HTTPS certificate

Caddy requests Let's Encrypt automatically. Wait **1–2 minutes** after containers are healthy, then open the App URL in a browser.

If HTTPS fails, see [§21 Troubleshooting](#21-troubleshooting).

### 13.5 If the 2 GB plan OOMs during build

Symptoms: `killed`, exit 137, Docker build dies.

Mitigations:

1. Upgrade Lightsail plan to **4 GB** (easiest), **or**
2. Add swap (temporary relief on 2 GB):

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Then re-run `bash scripts/deploy.sh`.

---

## 14. Part J — Verify HTTPS

On your laptop:

1. Open `https://YOUR-DOMAIN.sslip.io`
2. Log in with `APP_PASSWORD`
3. Open `https://files.YOUR-DOMAIN.sslip.io` — MinIO may show an XML/error page without a path; that still proves TLS + proxy work
4. Confirm the padlock (valid certificate for your hostname)

From the server:

```bash
curl -I "https://${DOMAIN}"
docker compose ps
docker compose logs --tail=50 app
```

---

## 15. Part K — Update Telnyx webhooks

Telnyx can only point at **one** webhook URL at a time. Switching from ngrok → AWS means local call testing will stop until you switch back.

1. Telnyx Mission Control → your **Call Control Application**.
2. Set webhook / status callback URL to:

```text
https://YOUR-DOMAIN.sslip.io/api/webhooks/telnyx
```

Example:

```text
https://3-104-82-17.sslip.io/api/webhooks/telnyx
```

3. Save.
4. Ensure the app’s API key / public key in `.env` match this Telnyx project.

Without this step: UI works, dialer may connect briefly, but call-control events / recordings / consent flow break.

---

## 16. Part L — End-to-end test

Work through this checklist on the live AWS URL:

1. [ ] Login with `APP_PASSWORD`
2. [ ] Create / upload a candidate resume (PDF)
3. [ ] Confirm parsing fills fields (Gemini)
4. [ ] Place a test call from the dialer (WebRTC + Telnyx)
5. [ ] Answer / consent IVR behaves as expected
6. [ ] Call ends; recording appears (if `RECORDING_ENABLED=true`)
7. [ ] Worker produces transcript + summary + PDF (check call detail; watch `docker compose logs -f worker`)
8. [ ] Download resume / PDF via `files.$DOMAIN` links

If calls fail but the site works, re-check webhook URL and `PUBLIC_APP_URL` / `DOMAIN` consistency.

---

## 17. Part M — CI/CD with GitHub Actions

Your repo already includes [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml). On every push to `main` it:

1. **test** — Node 20, `npm ci`, TypeScript check, lint (in `app/`)
2. **deploy** — SSH into the VPS, `git pull`, `docker compose up -d --build`, apply two migrations, print `docker compose ps`

You only need to point those secrets at the **Lightsail** box.

### 17.1 What the workflow expects

| GitHub Secret | Value |
|---------------|--------|
| `VPS_HOST` | Lightsail **static IP** (e.g. `3.104.82.17`) |
| `VPS_USERNAME` | `ubuntu` |
| `VPS_SSH_KEY` | **Full private key** PEM contents (including `BEGIN` / `END` lines) |

### 17.2 Prepare the server for non-interactive `git pull`

GitHub Actions will run roughly:

```bash
cd /opt/nexus
git pull origin main
docker compose up -d --build
...
```

So the `ubuntu` user must be able to pull **without a password prompt**.

**Option A — Public repo:** nothing extra; `git pull` over HTTPS works.

**Option B — Private repo — deploy key (recommended):**

On the Lightsail server:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/nexus_deploy -N ""
cat ~/.ssh/nexus_deploy.pub
```

1. GitHub repo → **Settings** → **Deploy keys** → **Add deploy key**  
2. Paste the **public** key, allow **read-only** (enough for pull).  
3. Point `origin` at SSH:

```bash
cd /opt/nexus
git remote set-url origin git@github.com:YOUR_GITHUB_USERNAME/NEXUS.git
```

4. Configure SSH on the server to use that key for GitHub:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/nexus_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh -T git@github.com
# expect: Hi USERNAME! You've successfully authenticated...
```

**Option C — HTTPS + credential helper / PAT:** works but PATs expire and are easier to leak; prefer deploy keys.

### 17.3 Allow GitHub Actions to SSH as `ubuntu`

The private key in `VPS_SSH_KEY` must match a public key in `~/.ssh/authorized_keys` on the instance.

**Easiest:** reuse the same Lightsail key you already SSH with:

1. On your **laptop**, display the private key:

```bash
cat ~/.ssh/lightsail-nexus.pem
```

2. Copy the **entire** output (from `-----BEGIN ... PRIVATE KEY-----` through `-----END ... PRIVATE KEY-----`).

3. GitHub → your NEXUS repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Name | Value |
|------|--------|
| `VPS_HOST` | `3.104.82.17` (your static IP, no `https://`) |
| `VPS_USERNAME` | `ubuntu` |
| `VPS_SSH_KEY` | paste full PEM |

**Safer (optional):** generate a **separate** CI-only key so you can revoke Actions access without losing laptop SSH:

```bash
# on laptop
ssh-keygen -t ed25519 -f ~/.ssh/nexus-gha -N ""
# install public key on server
ssh -i ~/.ssh/lightsail-nexus.pem ubuntu@YOUR_STATIC_IP \
  'mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys' < ~/.ssh/nexus-gha.pub
# put ~/.ssh/nexus-gha (private) into GitHub secret VPS_SSH_KEY
```

### 17.4 Confirm Docker works for the deploy user

The workflow runs `docker compose` as `ubuntu`. That user must be in the `docker` group (Part E). Verify:

```bash
# on server, as ubuntu
docker compose -f /opt/nexus/docker-compose.yml ps
```

If you see permission denied on the Docker socket:

```bash
sudo usermod -aG docker ubuntu
# log out / in, or reboot the instance from Lightsail console
```

### 17.5 Keep `.env` only on the server

CI does **not** upload secrets. `.env` stays on `/opt/nexus/.env`.  
`git pull` must **never** overwrite it (`.env` is gitignored — keep it that way).

If you change production secrets, SSH in and edit `.env`, then:

```bash
cd /opt/nexus
docker compose up -d --build
# or: bash scripts/deploy.sh
```

### 17.6 Trigger the first CI/CD deploy

From your laptop (with changes committed), or an empty commit:

```bash
git checkout main
git pull
# make a tiny docs tweak or:
git commit --allow-empty -m "chore: trigger AWS deploy"
git push origin main
```

Then:

1. GitHub → **Actions** tab  
2. Open **CI/CD Pipeline - Test & Deploy Nexus**  
3. Confirm **Build & Type Check** is green  
4. Confirm **Deploy to Production VPS** is green  
5. On the server: `docker compose ps` and hard-refresh the site  

### 17.7 What each job does (granular)

**Job `test` (ubuntu-latest runner):**

1. Checkout repo  
2. Setup Node.js 20 with npm cache on `app/package-lock.json`  
3. `npm ci` in `app/`  
4. `npx tsc --noEmit`  
5. `npm run lint`  

If any step fails, **deploy does not run**.

**Job `deploy` (only on `main`, needs `test`):**

1. Connect via SSH using `appleboy/ssh-action`  
2. `cd /opt/nexus`  
3. `git pull origin main`  
4. `docker compose up -d --build` (rebuilds app/worker images if Dockerfile/app changed)  
5. Apply `db/migrate-day5-fixes.sql` and `db/migrate-soft-delete.sql` (ignore errors if already applied)  
6. `docker compose ps`  

**Note:** `scripts/deploy.sh` applies **all** `db/migrate-*.sql`. The workflow currently applies only two files. For a brand-new DB, first boot should use `bash scripts/deploy.sh` once (Part I). Ongoing CI is fine for typical day-to-day pushes; if you add a new `db/migrate-*.sql`, either update the workflow or run `bash scripts/deploy.sh` once on the server.

### 17.8 Optional hardening for CI

- Protect `main` with branch rules (require PR + green `test` before merge).  
- Restrict who can edit Actions secrets.  
- Add a second workflow that only runs `test` on pull requests (no deploy). Example file you can add later as `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
    branches: [ main ]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: app/package-lock.json
      - run: npm ci
        working-directory: app
      - run: npx tsc --noEmit
        working-directory: app
      - run: npm run lint
        working-directory: app
```

### 17.9 Manual deploy anytime (without waiting for CI)

```bash
ssh -i ~/.ssh/lightsail-nexus.pem ubuntu@YOUR_STATIC_IP
cd /opt/nexus
bash scripts/deploy.sh
```

---

## 18. Part N — Snapshots, updates, and day-2 ops

### 18.1 Useful commands on the server

```bash
cd /opt/nexus
docker compose ps
docker compose logs -f app
docker compose logs -f worker
docker compose logs -f caddy
bash scripts/deploy.sh          # pull + rebuild + migrate
docker compose restart caddy    # after DOMAIN change
```

### 18.2 Changing DOMAIN / IP

If you ever change static IP:

1. Update `DOMAIN`, `PUBLIC_APP_URL`, `MINIO_PUBLIC_ENDPOINT` in `.env`  
2. `bash scripts/deploy.sh`  
3. Update Telnyx webhook  
4. Update GitHub secret `VPS_HOST` if the IP changed  

### 18.3 Disk / memory monitoring

```bash
df -h
free -h
docker stats --no-stream
```

If RAM is constantly >85% on a 2 GB plan, resize to 4 GB in Lightsail (**Snapshots** → create snapshot → create larger instance from snapshot, or use Lightsail’s resize flow if available in your region).

### 18.4 Stopping costs when you are done demos

1. Lightsail → stop or **delete** the instance (stopped instances on Lightsail may still bill depending on plan — check current Lightsail stop behavior; safest zero-cost is **delete** after snapshot).  
2. Delete unused **static IPs**.  
3. Delete old **snapshots** you no longer need.  
4. Disable GitHub deploy or clear `VPS_*` secrets so Actions cannot recreate surprises (it cannot create AWS resources by itself — only SSH — but failed jobs are noisy).

---

## 19. Optional: EC2 instead of Lightsail

Use EC2 if you already live in EC2 / need a specific instance family.

### 19.1 Rough cost (on-demand, us-east-1 ballpark)

| Instance | RAM | Approx. compute | + 30 GB gp3 EBS | Notes |
|----------|-----|-----------------|-----------------|-------|
| `t3.small` | 2 GB | ~$15/mo | ~$2.40 | Tight, like Lightsail Small |
| `t3.medium` | 4 GB | ~$30/mo | ~$2.40 | Similar comfort to Lightsail Medium |
| Elastic IP | — | $0 if attached | — | Charged if allocated idle |

Lightsail is usually **simpler and slightly cheaper** at the 4 GB tier for this use case.

### 19.2 EC2 high-level steps (same app install from Part E onward)

1. EC2 → Launch instance → Ubuntu 22.04/24.04 → `t3.medium`  
2. Storage: **30–40 GB** gp3  
3. Security group inbound: `22` (your IP only if possible), `80`, `443` from `0.0.0.0/0`  
4. Allocate + associate Elastic IP  
5. SSH as `ubuntu` with your key pair  
6. Continue from [Part E](#9-part-e--install-docker) exactly like Lightsail  
7. CI/CD secrets: same `VPS_HOST` / `VPS_USERNAME` / `VPS_SSH_KEY`  

---

## 20. Optional: “full managed” AWS (expensive)

Only consider this if you outgrow one VM (compliance, multi-AZ, separate scaling).

| Service | Replaces | Ballpark |
|---------|----------|----------|
| ECS Fargate or App Runner | `app` + `worker` | $30–80+ |
| RDS Postgres | `db` | $15–30+ |
| ElastiCache Redis | `redis` | $12+ |
| S3 | MinIO | cents–few $ |
| ALB + ACM | Caddy | $16+ |
| CloudWatch | logs | variable |
| **Total** | | **often $80–200+/mo** |

This requires rewriting how images are built/pushed and how env/secrets are injected. **Not required** to run Nexus successfully.

---

## 21. Troubleshooting

### HTTPS / certificate failures

```bash
docker compose logs caddy
dig +short "$DOMAIN"
curl -vI "http://$DOMAIN"   # port 80 must be reachable for ACME HTTP-01
```

Checklist:

- Lightsail firewall allows **80 and 443**  
- `DOMAIN` matches sslip.io of the **current** static IP  
- `CADDYFILE=Caddyfile`  
- Wait 2 minutes after first boot  

### Containers exit / restart loop

```bash
docker compose ps -a
docker compose logs --tail=100 app
docker compose logs --tail=100 worker
```

Common causes: bad env var, DB not ready (restart usually self-heals), OOM on 2 GB.

### Telnyx calls fail

- Webhook must be `https://$DOMAIN/api/webhooks/telnyx`  
- `PUBLIC_APP_URL` must be that same HTTPS origin  
- Only one environment can own the webhook (AWS vs ngrok)  

### GitHub Actions deploy fails on SSH

- Secret `VPS_SSH_KEY` must be the **private** key, full PEM  
- `VPS_USERNAME` must be `ubuntu`  
- `VPS_HOST` must be the IP only  
- Public key must be in `~/.ssh/authorized_keys`  
- Lightsail firewall must allow SSH from the internet (GitHub runner IPs are dynamic — keep port 22 open, or use a self-hosted runner later)

### GitHub Actions deploy fails on `git pull`

- Private repo without deploy key / credentials  
- Detached / dirty working tree on server (`git status` in `/opt/nexus`)  
- Never commit `.env`; if you edited tracked files on the server, stash or reset carefully  

### CI green but site unchanged

- Confirm you pushed to **`main`** (workflow only deploys `main`)  
- Confirm deploy job actually ran (not skipped)  
- Hard refresh / check `docker compose logs app` for new start time  

---

## 22. Cost checklist before you leave this running

- [ ] Budget alert at **$30/mo** (or your cap)  
- [ ] Only **one** Lightsail instance  
- [ ] Static IP **attached** (not orphaned)  
- [ ] Plan is **2 GB or 4 GB** — not accidentally 8 GB+  
- [ ] Automatic snapshots retention limited (e.g. 7 days)  
- [ ] No unused EC2 / RDS / Load Balancers from experiments  
- [ ] Telnyx / Gemini / Groq usage monitored in **their** dashboards  

---

## Quick reference card

| Item | Value |
|------|--------|
| Recommended host | Lightsail Ubuntu 22.04/24.04, **4 GB ($~24/mo)** |
| App path on server | `/opt/nexus` |
| Deploy | `bash scripts/deploy.sh` |
| CI | push to `main` → `.github/workflows/deploy.yml` |
| Secrets | `VPS_HOST`, `VPS_USERNAME=ubuntu`, `VPS_SSH_KEY` |
| App URL | `https://IP-with-dashes.sslip.io` |
| Webhook | `https://IP-with-dashes.sslip.io/api/webhooks/telnyx` |

Oracle Always Free remains the **$0 forever** option ([DEPLOY.md](./DEPLOY.md)). Use this AWS guide when you want Lightsail/EC2 predictability, a region near your users, or Oracle capacity/signup is blocking you.
