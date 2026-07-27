# Nexus — Complete Production Deploy Guide

**Goal:** Deploy Nexus on a free always-on Oracle Cloud VM, get a public HTTPS link (no domain purchase), wire Telnyx webhooks, and share a working URL for testing.

**Time:** about **2–3 hours** if Oracle signup/capacity goes smoothly.  
**Cost:** **$0 hosting** (Always Free). Telnyx / Gemini / Groq use your existing API credits.

---

## Table of contents

1. [What you are building](#1-what-you-are-building)
2. [Prerequisites checklist](#2-prerequisites-checklist)
3. [Part A — Oracle Cloud account](#3-part-a--oracle-cloud-account)
4. [Part B — Create the Always Free VM](#4-part-b--create-the-always-free-vm)
5. [Part C — Open firewall ports (critical)](#5-part-c--open-firewall-ports-critical)
6. [Part D — SSH into the VM](#6-part-d--ssh-into-the-vm)
7. [Part E — Install Docker](#7-part-e--install-docker)
8. [Part F — Clone the Nexus repo](#8-part-f--clone-the-nexus-repo)
9. [Part G — Free hostname with sslip.io](#9-part-g--free-hostname-with-sslipio)
10. [Part H — Create production `.env`](#10-part-h--create-production-env)
11. [Part I — First deploy](#11-part-i--first-deploy)
12. [Part J — Verify HTTPS in the browser](#12-part-j--verify-https-in-the-browser)
13. [Part K — Update Telnyx webhooks (required for calls)](#13-part-k--update-telnyx-webhooks-required-for-calls)
14. [Part L — End-to-end test](#14-part-l--end-to-end-test)
15. [Part M — Share the link](#15-part-m--share-the-link)
16. [Updating the app later](#16-updating-the-app-later)
17. [Local development (laptop + ngrok)](#17-local-development-laptop--ngrok)
18. [Troubleshooting](#18-troubleshooting)
19. [Safety: stay on Always Free](#19-safety-stay-on-always-free)
20. [Fallback if Oracle fails](#20-fallback-if-oracle-fails)

---

## 1. What you are building

```
Internet users / Telnyx
        │
        ▼
  https://YOUR-IP.sslip.io     ← Caddy (free Let's Encrypt HTTPS)
        │
        ├── app (Next.js CRM + WebRTC dialer)
        ├── worker (transcription + PDF)
        ├── db (Postgres)
        ├── redis (job queue)
        └── storage (MinIO files via https://files.YOUR-IP.sslip.io)
```

| Piece | Role |
|-------|------|
| **App URL** | Login, candidates, dialer, calls UI |
| **Webhook URL** | Telnyx sends call events here (`answered`, DTMF, hangup, recording) |
| **Files URL** | Resume / PDF downloads |

Without updating the Telnyx webhook, the **website** can work but **calls will not**.

---

## 2. Prerequisites checklist

Do these on your **laptop** before touching Oracle.

### 2.1 Accounts & keys (copy from your local Nexus `.env`)

You need working values for:

- [ ] `GOOGLE_GENERATIVE_AI_API_KEY`
- [ ] `GROQ_API_KEY` (if `STT_PROVIDER=groq`)
- [ ] `TELNYX_API_KEY`
- [ ] `TELNYX_PUBLIC_KEY`
- [ ] `TELNYX_CALL_CONTROL_APP_ID`
- [ ] `TELNYX_TELEPHONY_CREDENTIAL_ID`
- [ ] `TELNYX_CALLER_ID` (E.164, e.g. `+1737...`)
- [ ] `TELNYX_SIP_URI` (WebRTC credential SIP URI)

### 2.2 Code on GitHub

- [ ] Nexus is pushed to a GitHub repo you can clone (public, or private with a deploy key / personal access token).

### 2.3 On your laptop

- [ ] Terminal / SSH client
- [ ] Ability to save an SSH private key file (`.pem` or `id_rsa` / `id_ed25519`)

### 2.4 What you do **not** need

- [x] A purchased domain (use free `sslip.io`)
- [x] Paid AWS / Hetzner (unless Oracle fails — see §20)
- [x] ngrok on the server (ngrok stays on your laptop for local-only work)

---

## 3. Part A — Oracle Cloud account

### 3.1 Sign up

1. Open [https://cloud.oracle.com](https://cloud.oracle.com).
2. Click **Sign Up** / **Start for free**.
3. Choose **Always Free** eligible home region when asked (pick one you will keep — you generally cannot change home region later).
4. Complete identity verification. Oracle often asks for a **credit/debit card**.
   - They may place a small temporary authorization.
   - If you only create **Always Free** shapes, you should not be billed for the VM.
5. Wait until the console loads (Cloud Console).

### 3.2 Set a budget alert (do this first)

1. In the console search bar, type **Budgets**.
2. Create a budget for your compartment (often `root`).
3. Set amount to **$1 USD**.
4. Add an alert at **80%** emailed to you.

If anything leaves Always Free, you get warned early.

### 3.3 If signup fails

Common: card rejected, account “pending”, region capacity. Wait and retry, or skip to [§20 Fallback](#20-fallback-if-oracle-fails).

---

## 4. Part B — Create the Always Free VM

### 4.1 Generate / download an SSH key (laptop)

**Option A — Let Oracle generate a key (easiest)**

During instance creation, choose **Generate a key pair**, download the private key, store it safely:

```bash
# macOS example
mv ~/Downloads/ssh-key-*.key ~/.ssh/oracle-nexus.key
chmod 600 ~/.ssh/oracle-nexus.key
```

**Option B — Use your own key**

```bash
ssh-keygen -t ed25519 -f ~/.ssh/oracle-nexus -N ""
# Upload ~/.ssh/oracle-nexus.pub when creating the instance
```

### 4.2 Create the compute instance

1. Console → **Compute** → **Instances** → **Create instance**.
2. **Name:** `nexus` (any name).
3. **Compartment:** leave default unless you know otherwise.
4. **Placement / Availability domain:** any available.
5. **Image:**
   - **Canonical Ubuntu 22.04** or **24.04** (recommended).
   - Avoid Oracle Linux if you want the exact commands in this guide (they still work, but username differs).
6. **Shape:** click **Change shape**.
   - Prefer **Ampere** / **VM.Standard.A1.Flex** (Always Free eligible).
   - Configure roughly **2 OCPU** and **12 GB RAM** (or whatever your tenancy allows under Always Free).
   - If Ampere shows **Out of capacity**, try another **Availability domain**, another **region** (if you can), or wait and retry. As a last resort, use the Always Free **AMD** micro shapes (very small — may struggle with Puppeteer; Ampere is strongly preferred).
7. **Networking:**
   - Use the default VCN / subnet if offered.
   - Ensure **Assign a public IPv4 address** is **Yes**.
8. **SSH keys:** paste your public key or use the generated key pair.
9. Click **Create**.

### 4.3 Wait until it is running

1. Instance status must be **Running**.
2. On the instance detail page, copy **Public IP address**.  
   Example: `132.145.10.20`  
   You will use this everywhere below as `YOUR_PUBLIC_IP`.

---

## 5. Part C — Open firewall ports (critical)

Oracle blocks traffic unless **both** of these allow it:

1. **Network Security Group (NSG)** and/or **Security List** on the subnet  
2. The Linux firewall on the VM (`ufw` — we open this in Part E)

Without port **80** and **443**, HTTPS and Let’s Encrypt will fail.

### 5.1 Open ports on the Virtual Cloud Network

1. From the instance page, click the **Subnet** link.
2. Open the **Default Security List** (or the NSG attached to the VNIC).
3. **Add Ingress Rules** (or equivalent):

| Source CIDR | Protocol | Destination port | Purpose |
|-------------|----------|------------------|---------|
| `0.0.0.0/0` | TCP | **22** | SSH |
| `0.0.0.0/0` | TCP | **80** | HTTP (Let’s Encrypt + redirect) |
| `0.0.0.0/0` | TCP | **443** | HTTPS (app + files) |

4. Save.

### 5.2 Confirm public IP still present

Instance → **Attached VNICs** → Primary VNIC → note Public IP again.

---

## 6. Part D — SSH into the VM

### 6.1 Username

| Image | Typical SSH user |
|-------|------------------|
| Ubuntu | `ubuntu` |
| Oracle Linux | `opc` |

### 6.2 Connect from your laptop

```bash
ssh -i ~/.ssh/oracle-nexus.key ubuntu@YOUR_PUBLIC_IP
```

First connection: type `yes` to trust the host key.

### 6.3 If connection times out

- Security List missing port 22  
- Wrong public IP  
- Instance not Running  
- Corporate network blocking outbound 22 (try phone hotspot)

### 6.4 Optional: SSH config for convenience

Add to `~/.ssh/config` on your laptop:

```
Host nexus-oracle
  HostName YOUR_PUBLIC_IP
  User ubuntu
  IdentityFile ~/.ssh/oracle-nexus.key
```

Then:

```bash
ssh nexus-oracle
```

---

## 7. Part E — Install Docker

Still **on the VM** via SSH.

### 7.1 Update packages and install git

```bash
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl git ufw
```

### 7.2 Install Docker Engine

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
```

### 7.3 Allow your user to run Docker without sudo

```bash
sudo usermod -aG docker "$USER"
```

**Log out and SSH back in** so the group membership applies:

```bash
exit
ssh -i ~/.ssh/oracle-nexus.key ubuntu@YOUR_PUBLIC_IP
```

Verify:

```bash
docker --version
docker compose version
```

Both must print version numbers.

### 7.4 Host firewall (ufw)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

You should see **22**, **80**, **443** allowed.

### 7.5 Shortcut: repo bootstrap script (after clone)

Once the repo exists on the VM (Part F), you can instead run:

```bash
cd /opt/nexus
sudo bash scripts/bootstrap-vps.sh
```

Then log out / back in for the `docker` group.

---

## 8. Part F — Clone the Nexus repo

### 8.1 Create app directory

```bash
sudo mkdir -p /opt/nexus
sudo chown "$USER":"$USER" /opt/nexus
cd /opt/nexus
```

### 8.2 Clone

**Public repo:**

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/NEXUS.git /opt/nexus
cd /opt/nexus
```

**Private repo** (personal access token):

```bash
git clone https://YOUR_GITHUB_USERNAME:YOUR_PAT@github.com/YOUR_GITHUB_USERNAME/NEXUS.git /opt/nexus
cd /opt/nexus
```

(Or use SSH deploy keys — advanced; not required for first deploy.)

### 8.3 Confirm files exist

```bash
ls
# expect: app  db  docker-compose.yml  Caddyfile  Caddyfile.local  scripts  docs  .env.example
ls scripts/
# expect: bootstrap-vps.sh  deploy.sh
chmod +x scripts/bootstrap-vps.sh scripts/deploy.sh
```

---

## 9. Part G — Free hostname with sslip.io

No domain purchase. [sslip.io](https://sslip.io) maps IP → hostname automatically.

### 9.1 Convert your public IP

| Public IP | Hostname `DOMAIN` |
|-----------|-------------------|
| `132.145.10.20` | `132-145-10-20.sslip.io` |
| `203.0.113.10` | `203-0-113-10.sslip.io` |

**Rule:** replace every `.` with `-`, then append `.sslip.io`.

### 9.2 Verify DNS (on the VM or laptop)

```bash
# Install dig if needed: sudo apt-get install -y dnsutils
dig +short 132-145-10-20.sslip.io
```

It should return your public IP. If empty, wait a minute and retry (rarely fails for sslip.io).

### 9.3 URLs you will use

Replace with **your** hostname:

| Purpose | URL |
|---------|-----|
| App (share this) | `https://132-145-10-20.sslip.io` |
| File downloads | `https://files.132-145-10-20.sslip.io` |
| Telnyx webhook | `https://132-145-10-20.sslip.io/api/webhooks/telnyx` |

---

## 10. Part H — Create production `.env`

### 10.1 Copy the template

```bash
cd /opt/nexus
cp .env.example .env
nano .env
```

(`nano`: edit, then `Ctrl+O` Enter to save, `Ctrl+X` to exit. Or use `vim`.)

### 10.2 Full production example

Replace placeholders with **your** IP hostname and **your** real secrets from local `.env`.

```env
# ── Hostname (sslip.io — no domain purchase) ─────────────────
DOMAIN=132-145-10-20.sslip.io
CADDYFILE=Caddyfile
PUBLIC_APP_URL=https://132-145-10-20.sslip.io
MINIO_PUBLIC_ENDPOINT=https://files.132-145-10-20.sslip.io

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

### 10.3 Checklist before saving

- [ ] `DOMAIN` matches sslip.io form of **this** VM’s public IP  
- [ ] `CADDYFILE=Caddyfile` (not `Caddyfile.local`)  
- [ ] `PUBLIC_APP_URL=https://$DOMAIN` (https, no trailing slash)  
- [ ] `MINIO_PUBLIC_ENDPOINT=https://files.$DOMAIN`  
- [ ] `APP_PASSWORD` is not the example default  
- [ ] All Telnyx / AI keys pasted correctly (no extra spaces)

### 10.4 Protect the file

```bash
chmod 600 /opt/nexus/.env
```

Never commit `.env` to GitHub.

---

## 11. Part I — First deploy

### 11.1 Run the deploy script

```bash
cd /opt/nexus
bash scripts/deploy.sh
```

What it does:

1. Reads `.env`  
2. Refuses to proceed if `DOMAIN` is missing/`localhost`  
3. `docker compose up -d --build` (first build can take **10–20 minutes** on a small ARM VM)  
4. Applies `db/migrate-*.sql` (idempotent)  
5. Prints App URL, MinIO URL, and the Telnyx webhook URL  

### 11.2 Watch progress (optional second terminal)

```bash
docker compose ps
docker compose logs -f caddy
# Ctrl+C to stop following logs
```

### 11.3 Expected containers (all Up)

```text
nexus-app-1
nexus-worker-1
nexus-db-1
nexus-redis-1
nexus-storage-1
nexus-caddy-1
```

Names may include a project prefix; statuses should be **Up**.

### 11.4 First-boot HTTPS wait

Caddy requests a Let’s Encrypt certificate. Wait **1–2 minutes** after containers are Up before testing HTTPS.

---

## 12. Part J — Verify HTTPS in the browser

### 12.1 Open the app

On your laptop/phone browser:

```text
https://132-145-10-20.sslip.io
```

(Use **your** hostname.)

You should see the Nexus login (or home) page with a **valid padlock** (not a certificate error).

### 12.2 Login

Use the `APP_PASSWORD` from the VPS `.env`.

### 12.3 If the page does not load

See [§18 Troubleshooting](#18-troubleshooting).

### 12.4 Quick server-side checks

```bash
curl -I https://YOUR-DOMAIN.sslip.io
# expect HTTP/2 200 or 307/302 toward login — not connection refused

docker compose ps
docker compose logs caddy --tail 50
```

---

## 13. Part K — Update Telnyx webhooks (required for calls)

### 13.1 What this means

Telnyx must send call events to **this** server.  
If the portal still points at ngrok, calls will hit your laptop (or nowhere), not Oracle.

### 13.2 Exact steps in Telnyx Mission Control

1. Open [https://portal.telnyx.com](https://portal.telnyx.com) and sign in.  
2. Go to **Voice** → **Call Control** → **Applications** (wording may be “Call Control Applications”).  
3. Open the application whose ID matches `TELNYX_CALL_CONTROL_APP_ID` in `.env`.  
4. Find **Webhook URL** / **Webhook event URL**.  
5. Set it to (use **your** hostname):

```text
https://132-145-10-20.sslip.io/api/webhooks/telnyx
```

6. Save / Update.  
7. Optional: if you previously used the alias path `/api/telnyx/webhook`, either update to `/api/webhooks/telnyx` (preferred) or keep the alias — both exist in the app, but pick **one** and use it consistently.

### 13.3 Failover / secondary URL

Leave empty unless you know you need it.

### 13.4 Stop relying on ngrok for production

After this change:

- Production calls → Oracle  
- You can stop `ngrok` on your laptop unless you are developing locally again  

When you develop locally later, you must **temporarily point the webhook back to ngrok**, or use a separate Telnyx Call Control App for local — otherwise laptop and VPS will fight over events.

### 13.5 Confirm webhook path from the server

```bash
# Should reach Next.js (may return 405/401/400 without Telnyx signature — that still proves routing works)
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://YOUR-DOMAIN.sslip.io/api/webhooks/telnyx
```

A non-000 status means Caddy reached the app.

---

## 14. Part L — End-to-end test

Do this yourself before sharing.

| # | Action | Pass criteria |
|---|--------|----------------|
| 1 | Login | Dashboard / candidates load |
| 2 | **Upload** a resume PDF | Candidate appears with name/phone/email |
| 3 | Open candidate → **Call** | Phone rings |
| 4 | Answer → press **1** (record) or **2** (no record) | Hear recruiter after consent; two-way audio |
| 5 | Talk ~15–30s → hang up | Call shows in **Calls** / profile history |
| 6 | If press **1** | Summary / transcript / PDF appear after worker finishes (may take 1–2 min) |
| 7 | Soft-delete → **Trash** → Restore | Candidate returns |

### 14.1 Watch worker logs during a recorded call

```bash
docker compose logs -f worker
```

Look for transcription / PDF success lines.

---

## 15. Part M — Share the link

Send testers:

```text
App:      https://YOUR-DOMAIN.sslip.io
Password: (the APP_PASSWORD you set — share privately)
```

Tell them:

- Use Chrome/Firefox/Safari on desktop for the dialer (mic permission required).  
- Calls consume Telnyx minutes.  

You do **not** need to share the `files.` URL; the app generates download links automatically.

---

## 16. Updating the app later

On the VM:

```bash
cd /opt/nexus
git pull
bash scripts/deploy.sh
```

Or manually:

```bash
git pull
docker compose up -d --build
```

Migrations in `db/migrate-*.sql` are applied by `deploy.sh` automatically.

---

## 17. Local development (laptop + ngrok)

Do **not** use production `Caddyfile` on your laptop with ngrok.

Local `.env` should keep:

```env
DOMAIN=localhost
CADDYFILE=Caddyfile.local
MINIO_PUBLIC_ENDPOINT=http://localhost:9000
PUBLIC_APP_URL=https://YOUR-CURRENT-NGROK-URL.ngrok-free.dev
```

```bash
docker compose up -d --build
ngrok http 80
```

Remember: Telnyx webhook can only point at **one** URL at a time unless you use separate Call Control apps.

---

## 18. Troubleshooting

### 18.1 Cannot SSH

- Security List: TCP 22 from `0.0.0.0/0`  
- Correct user (`ubuntu` vs `opc`)  
- Correct key + `chmod 600` on private key  

### 18.2 HTTPS certificate / site unreachable

```bash
sudo ufw status
docker compose ps
docker compose logs caddy --tail 100
```

Check:

- [ ] Security List allows **80** and **443**  
- [ ] `DOMAIN` matches sslip.io of **this** public IP  
- [ ] `CADDYFILE=Caddyfile`  
- [ ] Waited 1–2 minutes after first boot  

Let’s Encrypt needs inbound **80** reachable from the public internet.

### 18.3 Site loads but login fails

- Wrong `APP_PASSWORD`  
- Check `docker compose logs app --tail 100`  

### 18.4 Site works, calls do not ring / no consent IVR

1. Confirm Telnyx webhook URL is the **sslip.io** URL (§13).  
2. Confirm `PUBLIC_APP_URL` in VPS `.env` matches.  
3. Watch logs while placing a call:

```bash
docker compose logs -f app
```

You should see `[telnyx webhook]` lines. If none appear, Telnyx is still hitting the old URL.

### 18.5 One-way audio in browser

- Allow microphone in the browser.  
- Use HTTPS (required for mic).  
- Prefer desktop Chrome.  

### 18.6 Resume/PDF download broken

- `MINIO_PUBLIC_ENDPOINT` must be `https://files.$DOMAIN`  
- `files.$DOMAIN` must resolve (sslip.io supports the `files.` prefix)  
- Caddy must be Up  

### 18.7 Out of memory / worker crashes

```bash
free -h
docker stats
```

Prefer Ampere with ≥8–12 GB. Tiny AMD free micros may not run Puppeteer well.

### 18.8 Docker permission denied

```bash
groups   # should include docker
# if not:
sudo usermod -aG docker "$USER"
# then re-login via SSH
```

### 18.9 Rebuild from scratch (keeps code, resets containers)

```bash
cd /opt/nexus
docker compose down
docker compose up -d --build
```

**Dangerous** (wipes DB/files volumes):

```bash
docker compose down -v   # deletes Postgres + MinIO data
```

---

## 19. Safety: stay on Always Free

- Do **not** create paid shapes “just to try”.  
- Keep the **$1 budget alert**.  
- Prefer **Ampere A1 Flex** within Always Free limits.  
- Occasional light use (pings / real traffic) reduces idle-reclaim risk.  

Optional keepalive cron on the VM (harmless):

```bash
crontab -e
# add:
*/10 * * * * curl -fsS https://YOUR-DOMAIN.sslip.io/ >/dev/null 2>&1
```

---

## 20. Fallback if Oracle fails

**Short answer:** There is almost **no other forever-free always-on** host as good as Oracle. Next options are **time-limited free trials** or **~€4–5/mo Hetzner**.

Full how-to for every fallback (Google Cloud trial, Azure, Student Pack, Hetzner, and what *not* to use):

**→ [DEPLOY-ALTERNATIVES.md](./DEPLOY-ALTERNATIVES.md)**

Full **AWS** walkthrough (Lightsail/EC2, monthly cost, GitHub Actions CI/CD):

**→ [DEPLOY-AWS.md](./DEPLOY-AWS.md)**

| If you need… | Do this |
|--------------|---------|
| $0 forever | Keep retrying Oracle (other AD/region) |
| AWS specifically | [DEPLOY-AWS.md](./DEPLOY-AWS.md) — Lightsail ~$12–24/mo |
| Link this week, OK if not free forever | Google Cloud free trial or Lightsail |
| Reliable & cheap | Hetzner CX22 (~€4–5/mo) |
| Sleeping “free” PaaS (Render/Railway) | **Don’t** — Telnyx webhooks will break |

---

## Quick reference card

```text
SSH:       ssh -i ~/.ssh/oracle-nexus.key ubuntu@YOUR_PUBLIC_IP
App dir:   /opt/nexus
Deploy:    cd /opt/nexus && bash scripts/deploy.sh
Logs:      docker compose logs -f app
Status:    docker compose ps

App:       https://IP-WITH-DASHES.sslip.io
Files:     https://files.IP-WITH-DASHES.sslip.io
Webhook:   https://IP-WITH-DASHES.sslip.io/api/webhooks/telnyx
```

---

## Definition of done

You can send testers a link when **all** of these are true:

- [ ] `https://YOUR-DOMAIN.sslip.io` loads with a valid certificate  
- [ ] Login works with your `APP_PASSWORD`  
- [ ] Telnyx webhook points at `https://YOUR-DOMAIN.sslip.io/api/webhooks/telnyx`  
- [ ] You completed one successful outbound call with consent (1 or 2)  
- [ ] Call appears in the UI afterward  

That is production-ready enough to share.
