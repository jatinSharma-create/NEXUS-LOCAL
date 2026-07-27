# Nexus — Free & Cheap Deploy Alternatives (if Oracle fails)

Oracle Always Free is the main **$0 forever** option. If signup fails or Ampere is out of capacity, use this guide.

## Reality check (read this first)

| Option | Forever free? | Always-on (Telnyx OK)? | Fits full Nexus stack? |
|--------|---------------|-------------------------|-------------------------|
| **Oracle Always Free** | Yes | Yes | Yes (best free) |
| **Google Cloud free trial** | No — ~$300 credit / 90 days | Yes | Yes |
| **AWS Lightsail / EC2** | No — see [DEPLOY-AWS.md](./DEPLOY-AWS.md) (~$12–24/mo) | Yes | Yes (full guide + CI/CD) |
| **Azure free trial** | No — credits / time-limited | Yes | Yes |
| **GitHub Student Pack** credits | Sometimes (education only) | Yes | Yes if you get DO/Azure credit |
| **Render / Railway free web** | “Free” but **sleeps** | **No** — webhooks break | Easy, wrong tool |
| **Fly.io free allowance** | Tiny free quota | Fragile for this stack | Not recommended for full Compose |
| **Laptop + ngrok** | $0 | Only while your PC is on | Demo only |
| **Hetzner CX22** | **No** (~€4–5/mo) | Yes | Best cheap paid fallback |

**Bottom line:** If Oracle fails and you need **forever free + always-on**, there is basically **no other reliable public cloud**. Next best are **time-limited free trials**, then **Hetzner ~$5/mo**.

---

## Option A — Google Cloud free trial (~$300 / 90 days)

Good if you can finish demos in the next 1–3 months.

### A1. Create project

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com).
2. Sign up for the **Free Trial** (card required; you should not be charged until trial ends / you upgrade — still set a budget alert).
3. Create a project, e.g. `nexus-prod`.
4. Enable **Compute Engine API**.

### A2. Create a VM

1. **Compute Engine** → **VM instances** → **Create instance**.
2. Settings:
   - **Name:** `nexus`
   - **Region:** pick one close to you (e.g. `australia-southeast1` or `us-central1`)
   - **Machine type:** `e2-small` (2 GB) minimum; `e2-medium` (4 GB) is safer for Puppeteer
   - **Boot disk:** Ubuntu 22.04 LTS, **30 GB** SSD
   - **Firewall:** check **Allow HTTP** and **Allow HTTPS**
3. Under **Networking**, ensure it gets an **External IP** (Ephemeral is fine; you can reserve a static IP later).
4. Create. Copy the **External IP**.

### A3. Firewall (confirm)

**VPC network** → **Firewall** should allow:

- `default-allow-http` → tcp:80  
- `default-allow-https` → tcp:443  
- SSH (tcp:22) already default  

### A4. SSH

In the console click **SSH**, or from your laptop:

```bash
gcloud compute ssh nexus --zone=YOUR_ZONE
```

(Or use the browser SSH button — no key setup needed.)

### A5. Deploy Nexus (same as Oracle from here)

```bash
sudo apt-get update -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# disconnect and reconnect SSH

sudo mkdir -p /opt/nexus && sudo chown "$USER":"$USER" /opt/nexus
git clone https://github.com/YOUR_USER/NEXUS.git /opt/nexus
cd /opt/nexus
chmod +x scripts/*.sh
sudo bash scripts/bootstrap-vps.sh   # opens ufw 22/80/443

# Hostname: if IP is 34.87.10.20 → 34-87-10-20.sslip.io
cp .env.example .env
nano .env   # see docs/DEPLOY.md Part H — set DOMAIN, CADDYFILE=Caddyfile, keys, etc.

bash scripts/deploy.sh
```

### A6. Telnyx webhook

```text
https://YOUR-IP-WITH-DASHES.sslip.io/api/webhooks/telnyx
```

### A7. Before trial ends

Export a backup or migrate to Hetzner/Oracle, or the VM will stop when credits run out.

---

## Option B — AWS Lightsail / EC2

**Full step-by-step (cost tables, static IP, Telnyx, GitHub Actions CI/CD):** see **[DEPLOY-AWS.md](./DEPLOY-AWS.md)**.

Short version:

1. Lightsail Ubuntu 22.04/24.04 — prefer **4 GB (~$24/mo)**; **2 GB (~$12/mo)** is the minimum.
2. Attach a **static IP**; open firewall **22 / 80 / 443**.
3. SSH as `ubuntu` → same deploy path as **Option A5** (`bootstrap` → clone → `.env` with sslip.io → `deploy.sh` → Telnyx webhook).
4. Wire GitHub secrets `VPS_HOST` / `VPS_USERNAME` / `VPS_SSH_KEY` for existing `.github/workflows/deploy.yml`.
5. Set an AWS Budgets alert (~$30/mo). Delete the instance + unused static IP when demos are done.

---

## Option C — Azure free account (credits)

1. [https://azure.microsoft.com/free](https://azure.microsoft.com/free)
2. Create an **Ubuntu 22.04** VM (B1ms / B2s — prefer **≥2 GB RAM**).
3. Open ports **22, 80, 443** in the Network Security Group.
4. SSH in → same deploy steps as A5.
5. Watch the free credit dashboard so you are not surprised when it converts to pay-as-you-go.

---

## Option D — GitHub Student Pack (if you are a student)

1. [https://education.github.com/pack](https://education.github.com/pack)
2. Activate offers (DigitalOcean credit, Azure credit, etc.).
3. Create a **≥2 GB** droplet/VM with Ubuntu.
4. Same deploy path as A5 + sslip.io + Telnyx webhook.

Not available to everyone; only if Education verifies you.

---

## Option E — Hetzner (~€4–5/mo) — best “Oracle failed” paid path

Not free, but usually **cheaper and more reliable** than fighting Oracle for days.

### E1. Create server

1. [https://console.hetzner.cloud](https://console.hetzner.cloud) → sign up (ID verification required).
2. **New project** → **Add server**
   - Location: Falkenstein / Helsinki / Nuremberg (cheapest) or US if offered
   - Image: **Ubuntu 22.04**
   - Type: **CX22** (or current equivalent with **≥4 GB RAM**)
   - SSH key: add your public key
3. Create. Copy IPv4.

### E2. Firewall (Hetzner Cloud Firewall optional)

Allow inbound **22, 80, 443**. Or rely on `ufw` from `bootstrap-vps.sh`.

### E3. Deploy

```bash
ssh root@YOUR_PUBLIC_IP
# or ssh as the user you configured

# If root:
adduser nexus && usermod -aG sudo nexus   # optional hardened user

sudo apt-get update -y
curl -fsSL https://get.docker.com | sh
# … same as docs/DEPLOY.md Parts E–M
```

Use sslip.io from the Hetzner IP, or attach a cheap domain later.

---

## Option F — Keep using your laptop + ngrok (not production)

| Pros | Cons |
|------|------|
| $0 | Must leave Mac on |
| Already working | Free ngrok URL can change |
| Fine for personal demos | Cannot reliably “share with anyone anytime” |

Only for temporary demos — **not** a substitute for a VPS.

---

## Options that look free but fail Telnyx

**Do not use these for Nexus production calls:**

- Render free web services (spin down)
- Railway free hobby sleep
- Many “serverless” free tiers without a warm always-on process

Symptoms: website works after a cold start; random missed webhooks; calls hang at consent.

---

## Shared finish line (every cloud)

Whatever host you pick, success looks the same:

1. Ubuntu VM with public IPv4  
2. Ports **22 / 80 / 443** open  
3. Docker + Compose installed  
4. Repo at `/opt/nexus`  
5. `.env` with:
   - `DOMAIN=IP-WITH-DASHES.sslip.io`
   - `CADDYFILE=Caddyfile`
   - `PUBLIC_APP_URL=https://$DOMAIN`
   - `MINIO_PUBLIC_ENDPOINT=https://files.$DOMAIN`
   - Telnyx + AI keys  
6. `bash scripts/deploy.sh`  
7. Telnyx Call Control webhook → `https://$DOMAIN/api/webhooks/telnyx`  
8. Browser test + one real call  

Full granular Oracle-oriented walkthrough (also applies after step “you have Ubuntu + IP”): **[DEPLOY.md](./DEPLOY.md)**.

---

## What should you do if Oracle fails today?

| Priority | Choice | Why |
|----------|--------|-----|
| 1 | Retry Oracle other AD / wait | Still $0 |
| 2 | Google Cloud or Lightsail trial | Free for a while; get a public link this week |
| 3 | Hetzner CX22 | ~$5/mo, least drama |

If you say which fallback you want (GCP / Lightsail / Hetzner), the same `scripts/deploy.sh` path works for all of them.
