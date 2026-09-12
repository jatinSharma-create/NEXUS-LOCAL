# Go live — share Nexus so someone else can call

Read this file first. `DEPLOYMENT.md` is the click-by-click Lightsail runbook.
This file is the decision: **what to run, why, and how sharing actually works.**

---

## The recommendation

**One AWS Lightsail box ($10/month), Docker Compose, Caddy, a free `sslip.io` hostname.**

That is the fastest path that stays modular, cheap, and safe enough to hand a
link to another recruiter tonight.

| Need | Why this wins |
|---|---|
| Fast | Same images you already run locally. No rewrite, no new vendor dashboard. First night ~2 hours; later updates ~15 minutes. |
| Cheap | ~$10/month. No domain required. Telnyx / Groq / Gemini stay pay-as-you-go. |
| Modular | The server runs the same `app/modules/` stack. Changing voice or STT is still one env var after you deploy. |
| Secure enough to share | HTTPS via Let's Encrypt, one login password, MinIO not on a public port, Telnyx webhook signatures, secrets stay in server `.env` (never in git). |
| Shareable | One URL + one password. The other person needs no Docker, no Git, no ngrok. |

Do **not** put this on Vercel / Railway / a laptop ngrok tunnel if you want
someone else to place real calls. Calling needs a **stable public HTTPS
hostname** that Telnyx can reach. A laptop tunnel dies when you close the lid.
A serverless host cannot run the worker + Postgres + Redis + MinIO the way
this repo is built.

A $4–6 Hetzner/DigitalOcean VPS is fine later if you want it cheaper. The
commands are the same (`docker compose` + Caddy). Lightsail is the path of
least hassle because the scripts in this repo already assume it.

---

## How sharing works

```
You  ──push deploy──►  Lightsail (Caddy + app + worker + db + redis + MinIO)
                              │
                              │  https://54-123-45-67.sslip.io
                              ▼
                     Recruiter's browser
                              │
              login with APP_PASSWORD
                              │
              place call ──► Telnyx ──► candidate's phone
                              ▲
                              │ webhooks
                     /api/webhooks/voice/telnyx
```

What you send the other person:

1. The HTTPS link (sslip.io or your domain)
2. The `APP_PASSWORD`

What you do **not** send: `.env`, API keys, the GitHub repo (unless they are
also a developer), SSH keys.

They can upload resumes, change candidate status, and place calls from that
browser. Their microphone uses WebRTC through Telnyx; the consent IVR still
plays on the **candidate's** handset; the recruiter's browser rings only after
the candidate presses 1 or 2.

---

## One-time setup (tonight)

On your laptop you are on `develop`. Production clones **`deploy` only**.

### 1. Laptop — this is already the release

```bash
# already done when this file landed:
#   git checkout develop && git push origin develop
#   git checkout deploy && git merge develop && git push origin deploy
```

### 2. AWS — create the box

1. [Lightsail](https://lightsail.aws.amazon.com/) → Ubuntu 22.04/24.04 → **$10/mo, 2 GB RAM**
2. **Networking → Create static IP** → attach it. Write the IP down.
3. Firewall: TCP **22**, **80**, **443** only.

### 3. Laptop — free hostname

```bash
./scripts/sslip-hostnames.sh YOUR_STATIC_IP
```

Copy the printed `DOMAIN` / `FILES_DOMAIN` / `PUBLIC_APP_URL` lines.

### 4. Server — install and boot

```bash
ssh -i ~/Downloads/LightsailDefaultKey.pem ubuntu@YOUR_STATIC_IP

sudo apt-get update && sudo apt-get install -y git docker.io docker-compose-v2
sudo git clone --branch deploy https://github.com/jatinSharma-create/NEXUS-LOCAL.git /opt/nexus
cd /opt/nexus
sudo cp .env.production.example .env
sudo nano .env
```

Fill `.env`:

- sslip.io values from step 3
- a **strong** `APP_PASSWORD` (this is what you share)
- a long random `MINIO_SECRET_KEY`
- a real `ACME_EMAIL` (Let's Encrypt)
- the same Gemini / Groq / Telnyx keys as local
- leave `VOICE_PROVIDER=telnyx` unless you are testing `fake`

```bash
sudo chmod +x scripts/*.sh
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

First build is 15–30 minutes.

If this server already had the **old** Telnyx-named schema, migrate before you
rely on calling:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db \
  psql -U nexus -d nexus < db/migrate-provider-agnostic-voice.sql
```

It is idempotent. A brand-new box that started from current `db/init.sql`
does not need it.

### 5. Telnyx — point webhooks at the public URL

Mission Control → your Call Control app → webhook URL:

```text
https://YOUR-IP-WITH-DASHES.sslip.io/api/webhooks/voice/telnyx
```

The older `/api/webhooks/telnyx` path still works. Prefer the new one.

`PUBLIC_APP_URL` on the server must be that same origin, `https`, no trailing slash.

### 6. Prove it before you share

```bash
curl -s https://YOUR-IP-WITH-DASHES.sslip.io/api/health/calling
```

You want `ready: true`, `publicReachable: true`, `missing: []`.

Then log in yourself, upload a resume, place one short call, press 1 on the
handset, and wait for the transcript. Only then send the link.

---

## What you send

```
Nexus is here:  https://54-123-45-67.sslip.io
Password:       <APP_PASSWORD>

After you click Call, stay on the page. The candidate hears the
recording question first. Your browser rings after they press 1 or 2.
Press 2 means the call is live but not recorded — no transcript.
```

---

## Security (do these; they are cheap)

- HTTPS is mandatory for calling and for sharing. Caddy + Let's Encrypt does it.
- Change `APP_PASSWORD` and `MINIO_SECRET_KEY` from the examples.
- Do not open Postgres, Redis, or MinIO ports on the Lightsail firewall.
- Do not commit `.env`. The repo gitignores it.
- Telnyx verifies webhook signatures when `TELNYX_PUBLIC_KEY` is set. Keep it set.
- One shared password is enough for a small team. It is **not** per-user auth.
  If you later need named accounts, that is a new module — do not bolt a
  vendor login into the voice code.
- When someone leaves, change `APP_PASSWORD` and restart `app`.

---

## Staying modular in production

The server is not a special snowflake. Provider switches are still env vars
in `/opt/nexus/.env`:

| Change | Set | Restart |
|---|---|---|
| Voice carrier | `VOICE_PROVIDER=telnyx` (or `fake`) | `app` + `worker` |
| Transcription | `STT_PROVIDER=groq` or `gemini` | `worker` |
| Summaries | `LLM_PROVIDER=google` | `worker` |
| Object storage | `STORAGE_PROVIDER=s3` + MinIO/AWS keys | `app` + `worker` |

Then:

```bash
cd /opt/nexus
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Do not install a second telephony SDK on the server "just to try it". Add the
adapter on `develop`, merge to `deploy`, pull on the box.

---

## Updates after tonight

**Laptop**

```bash
git checkout develop
# work, commit
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

## If something is silent

| Symptom | Likely cause |
|---|---|
| `ready: false`, `publicReachable: false` | `PUBLIC_APP_URL` wrong, or ports 80/443 closed |
| Candidate answers to silence | Webhook still pointed at an old ngrok URL |
| Recruiter hears the consent IVR | That was a fixed bug — you must be on this `deploy` |
| Call works, no PDF | Candidate pressed **2**. That is intended. |
| First ring dies, second works | Recruiter hung up during consent. Stay on the page. |
| HTTPS certificate error | Wait 2–3 minutes; confirm `DOMAIN` matches the URL exactly |

Full Lightsail clicks: [DEPLOYMENT.md](./DEPLOYMENT.md).
Architecture / swapping vendors: [ARCHITECTURE.md](./ARCHITECTURE.md).
