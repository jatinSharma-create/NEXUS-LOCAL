# Deploy Nexus (branch: `deploy`)

**This is the only deployment guide.** Follow it from top to bottom.

When you are done, other people open **one HTTPS URL**, type **one password**,
and can place calls. They do not install Docker or Git.

| | |
|--|--|
| **Where** | One [Hetzner Cloud](https://www.hetzner.com/cloud/) VM. Same Docker stack as your laptop. |
| **Plan** | **CX23** — 2 vCPU, **4 GB RAM**, 40 GB disk, **x86** (not ARM — Chromium/PDF needs it) |
| **Cost** | About **€6 / ~A$10 per month** including a primary IPv4 (Germany or Finland). AWS and GCP 2 GB boxes are ~A$18+. |
| **Time** | First night **~2 hours**. Later updates **~15 min**. |
| **Branch** | Server clones **`deploy` only**. |

Do **not** use a laptop ngrok URL in production. Calling needs a stable public
HTTPS address for Telnyx webhooks.

```
You  ──push deploy──►  Hetzner CX23 (Caddy + app + worker + db + redis + MinIO)
                              │
                              │  https://YOUR-IP-WITH-DASHES.sslip.io
                              ▼
                     Recruiter's browser  (login = APP_PASSWORD)
                              │
              place call ──► Telnyx ──► candidate's phone
                              ▲
                     /api/webhooks/voice/telnyx
```

Why not AWS / GCP at A$10: a 2 GB public-IPv4 VM there is ~US$12 (A$18). Their
1 GB plans fit the money and then the worker OOMs on PDFs. Hetzner CX23 is 4 GB
inside the A$10 cap.

---

## 0. Laptop — confirm `deploy`

```bash
git checkout deploy
git pull origin deploy
git rev-parse --abbrev-ref HEAD    # must print: deploy
./scripts/verify-deploy.sh
```

Optional local smoke test:

```bash
docker compose up -d
curl -s -o /dev/null -w 'login %{http_code}\n' http://127.0.0.1:8080/login
curl -s http://127.0.0.1:8080/api/health/calling
```

Login `200`. Health `missing: []`. Laptop `ready: false` is OK if ngrok is down.

---

## 1. Create the Hetzner server (~10 min)

1. Sign up at [console.hetzner.cloud](https://console.hetzner.cloud/) (credit
   card; AU customers are usually billed **without German VAT**).
2. **New project** → **Add server**
3. Location: **Falkenstein (fsn1)** or **Helsinki (hel1)** for the A$10 price.
   Singapore / US costs more and can break the cap.
4. Image: **Ubuntu 24.04**
5. Type: **CX23** (Cost-Optimized, **4 GB**, Intel/AMD — **not** CAX ARM)
6. Networking: enable **Public IPv4** (required for Telnyx and sslip.io)
7. SSH key: add your laptop public key (`ssh-keygen -t ed25519` if you have none)
8. Create → wait until it is running → copy the **IPv4**

**Firewall** (same screen or Firewalls → create):

| Direction | Protocol | Port |
|-----------|----------|------|
| In | TCP | 22 |
| In | TCP | 80 |
| In | TCP | 443 |

Attach that firewall to the server. Leave 22/80/443 only.

---

## 2. Free hostname (~2 min)

No domain to buy. Use [sslip.io](https://sslip.io): dots in the IP become dashes.

If the IP is `49.13.12.34`:

| Purpose | URL |
|---------|-----|
| App (what you share) | `https://49-13-12-34.sslip.io` |
| Files | `https://files.49-13-12-34.sslip.io` |

On the **laptop**:

```bash
./scripts/sslip-hostnames.sh YOUR_IPV4
```

Copy `DOMAIN`, `FILES_DOMAIN`, `PUBLIC_APP_URL`, `MINIO_PUBLIC_ENDPOINT`.

---

## 3. SSH (~2 min)

```bash
ssh root@YOUR_IPV4
```

(Hetzner Ubuntu images log in as **root** with your SSH key.)

---

## 4. Install (~30–45 min including first build)

On the **server**:

```bash
apt-get update && apt-get install -y git docker.io docker-compose-v2
git clone --branch deploy https://github.com/jatinSharma-create/NEXUS-LOCAL.git /opt/nexus
cd /opt/nexus
cp .env.production.example .env
nano .env
```

Fill `.env`:

| Must set | Why |
|---|---|
| sslip.io lines from step 2 | Public HTTPS and file URLs |
| `APP_PASSWORD` | What you share |
| `MINIO_SECRET_KEY` | Long random; not the example |
| `ACME_EMAIL` | Let's Encrypt |
| Gemini / Groq / Telnyx keys | Same as local `.env` |
| `VOICE_PROVIDER=telnyx` | Live calling |

Do **not** copy a laptop `.env` with `HTTP_PORT=8080`. Production Caddy must
own 80 and 443.

```bash
chmod +x scripts/*.sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

First build **15–30 minutes**. Do **not** add `--profile tunnel`.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f app
```

Brand-new disk uses `db/init.sql`. Only if this database still has old
`telnyx_*` columns:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db \
  psql -U nexus -d nexus < db/migrate-provider-agnostic-voice.sql
```

---

## 5. Telnyx webhook (~5 min)

Mission Control → Call Control app → webhook:

```text
https://YOUR-IP-WITH-DASHES.sslip.io/api/webhooks/voice/telnyx
```

`PUBLIC_APP_URL` = that origin, `https`, no trailing slash.

---

## 6. Prove it before you share

```bash
curl -s https://YOUR-IP-WITH-DASHES.sslip.io/api/health/calling
```

Need `ready: true`, `publicReachable: true`, `missing: []`.

Then in the browser: login, upload a resume, one call. Candidate hears consent;
your browser rings after 1 or 2. Press **1** if you want a PDF.

If HTTPS fails, wait 2–3 minutes, confirm firewall 80/443, then
`docker compose logs caddy`.

---

## 7. What you send

```
Nexus:     https://YOUR-IP-WITH-DASHES.sslip.io
Password:  <APP_PASSWORD>

Stay on the page after Call. The candidate answers the recording
question first. Your browser rings after they press 1 or 2.
Press 2 means live call, no transcript.
```

Do not send `.env`, API keys, or the SSH key.

---

## Security

- HTTPS via Caddy + Let's Encrypt
- Strong `APP_PASSWORD` and `MINIO_SECRET_KEY`
- Firewall: 22, 80, 443 only
- Keep `TELNYX_PUBLIC_KEY` set
- Change `APP_PASSWORD` if someone leaves, then restart `app`

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
./scripts/deploy-update.sh
```

Never `docker compose down -v` on the server.

---

## If something is silent

| Symptom | Fix |
|---|---|
| Certificate / HTTPS fails | Firewall 80+443; `DOMAIN` matches the URL |
| `502` | App still building — `docker compose logs app` |
| Candidate answers to silence | Webhook still on old ngrok URL |
| Call works, no PDF | They pressed **2** |
| First ring drops | Recruiter hung up during consent — stay on the page |
| Worker OOM | You are not on CX23 / 4 GB |

```bash
cd /opt/nexus
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f worker
```

---

## Files the server uses

| File | Purpose |
|------|---------|
| **`DEPLOYMENT.md`** | This file |
| `docker-compose.yml` + `docker-compose.prod.yml` | Stack + HTTPS 80/443 |
| `Caddyfile.production` | Let's Encrypt reverse proxy |
| `.env.production.example` | Copy to `.env` |
| `scripts/sslip-hostnames.sh` | Hostnames from the IPv4 |
| `scripts/hetzner-bootstrap.sh` | Optional: install Docker + clone on a fresh box |
| `scripts/deploy-update.sh` | Pull `deploy` and rebuild |
| `scripts/verify-deploy.sh` | Laptop check before you pay |
