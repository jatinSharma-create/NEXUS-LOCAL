# Deploy Nexus

**The only deployment guide.** Do the steps in order. Every command is copy-paste.

At the end, people open **one link**, type **one password**, and can make calls.
They install nothing.

## Budget

| Item | Cost |
|------|------|
| Hetzner **CX23** server (2 vCPU, 4 GB, 40 GB) | €5.49 / month |
| Public IPv4 address | €0.50 / month |
| Domain name | **€0** — free `sslip.io` hostname |
| HTTPS certificate | **€0** — Let's Encrypt |
| **Total** | **€5.99 ≈ A$10 / month** |

Billed hourly in EUR, capped at that monthly figure. Delete the server and it
stops. No setup fee. Australian billing addresses are normally charged **no
German VAT**.

Telnyx, Groq, and Gemini bill separately for what you use — cents to a few
dollars a month at your volume.

## Time

| Phase | Time | Hands-on? |
|-------|------|-----------|
| 0. Push the `deploy` branch | 1 min | yes |
| 1–4. Account, server, hostname, SSH | 20 min | yes |
| 5. Bootstrap script | 5 min | mostly waiting |
| 6. Fill in `.env` | 10 min | yes |
| 7. Build | 15–30 min | **no** — walk away |
| 8–10. Telnyx, verify, test call | 15 min | yes |

**About 50 minutes of your attention, ~1.5 hours wall clock.** Do it in one
sitting. Do not interrupt step 7.

---

## What you need open

- This file
- A browser for [console.hetzner.cloud](https://console.hetzner.cloud/)
- A browser for [portal.telnyx.com](https://portal.telnyx.com/)
- Your **laptop `.env`** — you copy API keys out of it (never the whole file)
- A credit card

---

## Step 0 — Push the deploy branch (1 min, do this first)

The server pulls everything from GitHub, so the code must be there before you
start. On your **Mac**:

```bash
cd ~/Desktop/NEXUS-LOCAL && git checkout deploy && git push origin deploy
```

Confirm it worked — this must print the script, not `404`:

```bash
curl -fsSL https://raw.githubusercontent.com/jatinSharma-create/NEXUS-LOCAL/deploy/scripts/server-bootstrap.sh | head -3
```

If you get a 404, the push did not go through. Step 5 cannot work until it does.

---

## Step 1 — SSH key on your Mac (3 min)

Hetzner does not allow password logins. You need a key.

Open **Terminal** and check whether you already have one:

```bash
ls ~/.ssh/id_ed25519.pub
```

**If it says "No such file",** create one (press Return at every prompt):

```bash
ssh-keygen -t ed25519 -C "nexus" -f ~/.ssh/id_ed25519
```

Now print the **public** key and copy the whole line:

```bash
cat ~/.ssh/id_ed25519.pub
```

It starts with `ssh-ed25519 AAAA…`. Keep this Terminal open.

> Copy the file ending in **`.pub`** only. The other file is your private key
> and must never leave your Mac.

---

## Step 2 — Collect your API keys (2 min)

Same Terminal:

```bash
cd ~/Desktop/NEXUS-LOCAL && grep -E '^(GOOGLE_GENERATIVE_AI_API_KEY|GROQ_API_KEY|TELNYX_|VOICE_CALLER_ID|VOICE_AGENT_ENDPOINT)=' .env
```

Copy that output somewhere you can paste from. You need it in step 6.

---

## Step 3 — Create the server (12 min)

1. Go to [console.hetzner.cloud](https://console.hetzner.cloud/) and sign up.
   Add a credit card when asked.
2. Click **New project**, name it `nexus`, open it.
3. Left sidebar → **Security** → **SSH Keys** → **Add SSH Key**. Paste the
   `ssh-ed25519 AAAA…` line from step 1. Name it `macbook`. Save.
4. Left sidebar → **Firewalls** → **Create Firewall**. Name it `nexus-web`.
   Add exactly three inbound TCP rules, source "Any IPv4":

   | Port | What it is |
   |------|-----------|
   | 22 | SSH (you) |
   | 80 | Certificate renewal |
   | 443 | The website |

   Leave outbound alone. Create it.
5. Left sidebar → **Servers** → **Add Server**, and set:

   | Field | Choose |
   |-------|--------|
   | Location | **Falkenstein** or **Helsinki** |
   | Image | **Ubuntu 24.04** |
   | Type | **x86 (Intel/AMD)** → **Cost Optimized** → **CX23** |
   | Networking | **Public IPv4 ON** |
   | SSH key | tick **macbook** |
   | Firewall | tick **nexus-web** |
   | Name | `nexus` |

   Leave backups, volumes, and placement groups off.

6. Check the price on the right says about **€6/month**. If it says more, you
   picked the wrong location or plan — go back.
7. Click **Create & Buy now**. Wait for status **Running**.
8. **Copy the IPv4 address.** It looks like `49.13.12.34`.

> Must say **CX23**, **4 GB**, and **x86**. A CAX/Ampere box is ARM and a 2 GB
> box runs out of memory while generating PDFs.

Everywhere below, replace `YOUR_IP` with that address.

---

## Step 4 — Get your free hostname (2 min)

No domain to buy. `sslip.io` turns the dots in your IP into dashes.

On your **Mac**:

```bash
cd ~/Desktop/NEXUS-LOCAL && ./scripts/sslip-hostnames.sh YOUR_IP
```

It prints five lines. Copy all of them — that is your `.env` block and your
Telnyx webhook. For `49.13.12.34` the site would be
`https://49-13-12-34.sslip.io`.

---

## Step 5 — Connect and run one command (5 min)

```bash
ssh root@YOUR_IP
```

Type `yes` at the fingerprint prompt. You should land on `root@nexus:~#`.

Confirm the machine is what you paid for:

```bash
uname -m && free -h
```

`x86_64` and about **3.8 Gi** of memory. If it says `aarch64`, you built an ARM
box — delete it and redo step 3.

Now run the bootstrap. This adds swap, installs Docker, and clones the code:

```bash
curl -fsSL https://raw.githubusercontent.com/jatinSharma-create/NEXUS-LOCAL/deploy/scripts/server-bootstrap.sh | bash
```

It finishes by telling you to edit `.env`. That is step 6.

---

## Step 6 — Fill in `.env` (10 min)

```bash
nano /opt/nexus/.env
```

`nano`: arrow keys to move, type to edit, **Ctrl+O** then **Return** to save,
**Ctrl+X** to quit.

**6a. Paste your hostname block** from step 4, replacing the example values:

```env
DOMAIN=49-13-12-34.sslip.io
FILES_DOMAIN=files.49-13-12-34.sslip.io
PUBLIC_APP_URL=https://49-13-12-34.sslip.io
MINIO_PUBLIC_ENDPOINT=https://files.49-13-12-34.sslip.io
ACME_EMAIL=your-real@email.com
```

`PUBLIC_APP_URL` must start with `https://` and have **no** trailing slash.

**6b. Set two passwords.** Generate each one with this (run it twice, in a
second Terminal or before you open nano):

```bash
openssl rand -base64 24
```

```env
APP_PASSWORD=first-random-string
MINIO_SECRET_KEY=second-random-string
```

`APP_PASSWORD` is what you give people. Do not leave either at the default.

**6c. Paste the API keys** from step 2:

```env
GOOGLE_GENERATIVE_AI_API_KEY=...
GROQ_API_KEY=...
TELNYX_API_KEY=...
TELNYX_PUBLIC_KEY=...
TELNYX_CALL_CONTROL_APP_ID=...
TELNYX_TELEPHONY_CREDENTIAL_ID=...
TELNYX_CALLER_ID=+61...
TELNYX_SIP_URI=sip:yourusername@sip.telnyx.com
```

Leave everything else exactly as it came. Save and exit.

**6d. Check it:**

```bash
cd /opt/nexus && grep -E '^(DOMAIN|PUBLIC_APP_URL|APP_PASSWORD|TELNYX_API_KEY)=' .env
```

All four must have real values after the `=`.

> Never copy your laptop `.env` onto the server. It sets `HTTP_PORT=8080` and
> an ngrok URL, and HTTPS will not work.

---

## Step 7 — Build and start (15–30 min, unattended)

```bash
cd /opt/nexus && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Go and do something else. It will look frozen while Next.js compiles. **Do not
press Ctrl+C.**

When you get the prompt back:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

Six services, all `running`: **app, worker, db, redis, storage, caddy**.

---

## Step 8 — Point Telnyx at the server (5 min)

Skip this and candidates answer to silence, because Telnyx is still calling
your old laptop tunnel.

1. Open [portal.telnyx.com](https://portal.telnyx.com/)
2. **Voice** → **Call Control Applications** → open your app
3. Set the **Webhook URL** to exactly this, with your dashed IP:

   ```text
   https://49-13-12-34.sslip.io/api/webhooks/voice/telnyx
   ```

4. Save.

---

## Step 9 — Verify before you share (5 min)

From your **Mac**:

```bash
curl -s https://49-13-12-34.sslip.io/api/health/calling
```

You need all four:

- `"ready": true`
- `"publicReachable": true`
- `"missing": []`
- `"provider": "telnyx"`

If the certificate is not ready yet, wait 3 minutes and retry — Let's Encrypt
takes a moment on first boot.

If `ready` is false, the `missing` list names the empty `.env` variables. Fix
them, then reload without rebuilding:

```bash
cd /opt/nexus && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## Step 10 — Make one real call (10 min)

1. Open `https://49-13-12-34.sslip.io` in your browser
2. Log in with `APP_PASSWORD`
3. **Candidates** → upload a resume
4. Open the candidate → **Call**
5. **Stay on the page.** The candidate hears the recording question first.
   Your browser rings only **after** they press 1 or 2.
6. Press **1** to get a transcript and PDF. Press **2** is a live call with no
   recording, on purpose.

If the first ring seems to drop, you hung up during the consent prompt. Stay on
the page.

---

## Done — what you send people

```text
Nexus:     https://49-13-12-34.sslip.io
Password:  <your APP_PASSWORD>

Stay on the page after you press Call. The candidate answers a
recording question first — your browser rings after they press
1 or 2. Pressing 2 means a live call with no transcript.
```

Chrome with a working microphone. Never send `.env`, API keys, or your SSH key.

---

## Later: shipping an update

On your **Mac**:

```bash
cd ~/Desktop/NEXUS-LOCAL && git checkout deploy && git merge develop && git push origin deploy
```

On the **server**:

```bash
ssh root@YOUR_IP
cd /opt/nexus && ./scripts/deploy-update.sh
```

To change the login password: edit `APP_PASSWORD` in `/opt/nexus/.env`, then
`docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`.

> **Never** run `docker compose down -v` on the server. The `-v` deletes your
> database and all stored PDFs.

---

## If something goes wrong

Start here:

```bash
cd /opt/nexus
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=100
```

| What you see | What it means |
|--------------|---------------|
| `Permission denied (publickey)` | SSH key not ticked in step 3. Easiest fix is to delete the server and redo step 3. |
| SSH just hangs | Firewall missing port 22, or wrong IP. |
| `uname -m` says `aarch64` | ARM box. Delete, rebuild as CX23 x86. |
| Certificate / HTTPS error | Wait 3 min. Check inbound 80 **and** 443. `DOMAIN` must match the URL exactly. |
| Browser shows `502` | App still building or crashed. `logs -f app`. |
| Health lists things in `missing` | Those `.env` lines are empty. |
| `publicReachable: false` | HTTPS or the webhook path, not your Telnyx keys. |
| Candidate answers to silence | Step 8 not done, or the URL has a typo. |
| Call worked but no PDF | They pressed **2**. Working as designed. |
| Worker killed / out of memory | Not a 4 GB box, or the bootstrap swap step was skipped. |

---

## Alternative: OVHcloud Sydney (~A$7/month, lower latency)

Hetzner sits in Europe, so **page clicks** from Australia carry about 280 ms.
Call audio is unaffected — Telnyx carries the voice, not this server.

If that bothers you, **OVHcloud VPS-1 in Sydney** is 2 vCore / 4 GB / 40 GB for
about **A$6.29 + GST**, in Australia (~15 ms), billed in AUD, with daily backups.
Cheaper *and* closer.

It is not the default here only because signup is fussier:

- You **cannot** add an SSH key at checkout. OVH emails a **temporary
  password** for a user called `ubuntu`.
- First login forces a password change and then disconnects you. Reconnect.
- There is no `root` login — run the bootstrap as `ubuntu`; it uses `sudo`
  automatically.
- Pick the **Sydney datacentre**, not a "Local Zone" VPS. Local Zone does not
  support Docker.
- There is no firewall in the panel by default. After bootstrap, run:

  ```bash
  sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw --force enable
  ```

- APAC plans include 500 GB/month, then throttle to 10 Mbps. Fine here.

Everything from **step 4 onward is identical**, except you connect with
`ssh ubuntu@YOUR_IP` instead of `root@YOUR_IP`.

---

## Files involved

| File | Purpose |
|------|---------|
| **`DEPLOYMENT.md`** | This guide |
| `scripts/server-bootstrap.sh` | Step 5: swap, Docker, clone, `.env` template |
| `scripts/sslip-hostnames.sh` | Step 4: hostnames from your IP |
| `scripts/deploy-update.sh` | Ship an update |
| `docker-compose.yml` + `docker-compose.prod.yml` | The stack; production binds Caddy to 80/443 |
| `Caddyfile.production` | HTTPS via Let's Encrypt |
| `.env.production.example` | Template the bootstrap copies to `.env` |
