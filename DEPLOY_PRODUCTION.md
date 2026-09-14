# Deploy this release (branch: `deploy`)

This file lives for **production only**. Use it on the `deploy` branch when you
put Nexus on a server and share a link.

- Product decision (why Lightsail, what to send people): [GO_LIVE.md](./GO_LIVE.md)
- Extra Lightsail clicks: [DEPLOYMENT.md](./DEPLOYMENT.md)

You are deploying commit `deploy` HEAD — modular voice, consent on the candidate
leg, honest dialer copy, provider env vars.

---

## 0. Confirm you are on `deploy`

On your laptop:

```bash
git checkout deploy
git pull origin deploy
git rev-parse --abbrev-ref HEAD    # must print: deploy
./scripts/verify-deploy.sh
```

`verify-deploy.sh` checks the branch name, that the production compose file
parses, and (if `app/node_modules` exists) TypeScript + lint.

### How you know this branch works before you spend on AWS

Local Docker uses `docker-compose.yml` (not the prod overlay). Unpause Docker
Desktop, then:

```bash
git checkout deploy
docker compose up -d --build
curl -s -o /dev/null -w 'login %{http_code}\n' http://127.0.0.1:8080/login
curl -s http://127.0.0.1:8080/api/health/calling
```

Pass if login is `200` and health has `"ready": true` (or `ready: false` only
because the laptop tunnel is down — credentials can still be fine). Place one
short call: candidate hears consent, you ring after 1 or 2.

Production compose (`docker-compose.prod.yml`) is the same images with HTTPS on
**80/443**, no public MinIO ports, no ngrok profile. You cannot fully exercise
Let's Encrypt on a laptop; that is step 6 on the server.

---

## 1. Create the box (~15 min)

AWS Lightsail → Ubuntu 22.04 or 24.04 → **2 GB RAM** (~US$12 / ~A$18 a month).
Attach a **static IP**. Firewall: TCP **22**, **80**, **443** only.

## 2. Hostname (~2 min)

On the laptop:

```bash
./scripts/sslip-hostnames.sh YOUR_STATIC_IP
```

Keep the printed `DOMAIN`, `FILES_DOMAIN`, `PUBLIC_APP_URL`, `MINIO_PUBLIC_ENDPOINT`.

## 3. Install on the server

```bash
ssh -i YOUR_KEY.pem ubuntu@YOUR_STATIC_IP

sudo apt-get update && sudo apt-get install -y git docker.io docker-compose-v2
sudo git clone --branch deploy https://github.com/jatinSharma-create/NEXUS-LOCAL.git /opt/nexus
cd /opt/nexus
sudo cp .env.production.example .env
sudo nano .env
```

Fill:

| Must set | Why |
|---|---|
| sslip.io lines from step 2 | Public HTTPS + file URLs |
| `APP_PASSWORD` | What you share with the other person |
| `MINIO_SECRET_KEY` | Long random; not the example |
| `ACME_EMAIL` | Let's Encrypt |
| Gemini / Groq / Telnyx keys | Same values as local `.env` |
| `VOICE_PROVIDER=telnyx` | Live calling |

Do **not** copy a local `.env` that has `HTTP_PORT=8080`. Production Caddy must
bind 80 and 443.

```bash
sudo chmod +x scripts/*.sh
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

First build 15–30 minutes. **Do not** add `--profile tunnel`.

Fresh disk uses `db/init.sql`. If this database already had the old Telnyx
column names:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db \
  psql -U nexus -d nexus < db/migrate-provider-agnostic-voice.sql
```

## 4. Telnyx webhook

```text
https://YOUR-IP-WITH-DASHES.sslip.io/api/webhooks/voice/telnyx
```

`PUBLIC_APP_URL` must be that same origin, `https`, no trailing slash.

## 5. Prove production

```bash
curl -s https://YOUR-IP-WITH-DASHES.sslip.io/api/health/calling
```

Need `ready: true`, `publicReachable: true`, `missing: []`. Then log in, upload
a resume, one call, press **1**, wait for the PDF.

## 6. What you send

```
Nexus:     https://YOUR-IP-WITH-DASHES.sslip.io
Password:  <APP_PASSWORD>

Stay on the page after Call. The candidate answers the recording
question first. Your browser rings after they press 1 or 2.
```

Do not send `.env`, API keys, or SSH keys.

---

## Updates later

Laptop:

```bash
git checkout develop
# work, commit, push
git checkout deploy
git merge develop
git push origin deploy
```

Server:

```bash
cd /opt/nexus
sudo ./scripts/aws-deploy-update.sh
```

Never `docker compose down -v` on the server.
