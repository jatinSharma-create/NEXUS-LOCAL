# Deploy Nexus on AWS Lightsail

**The only deployment guide.** Do the steps in order. Every command is copy-paste.

At the end, people open **one link**, type **one password**, and can make calls.
They install nothing.

## Why Lightsail and not the rest of AWS

Your app is a Docker Compose file with six services. Lightsail is a plain
Ubuntu VM, so it runs that file unchanged.

| AWS option | A$ / month | Verdict |
|------------|-----------:|---------|
| **Lightsail Medium 4 GB** | **36** | **Chosen.** Flat price, IPv4 and 4 TB transfer bundled, Sydney region. |
| Lightsail Small 2 GB | 18 | Too little RAM. The Chromium PDF worker gets killed. |
| EC2 t3.medium | ~76 | Same specs, more money — IPv4, EBS and egress all billed separately. |
| ECS Fargate / App Runner | 130+ | Stateless. Postgres, Redis and MinIO would become RDS, ElastiCache and S3. A rewrite. |

## Budget

| Item | Cost |
|------|------|
| Lightsail **Medium** (2 vCPU, 4 GB, 80 GB SSD) | US$24 / month |
| Static IPv4 address | **US$0** — free while attached |
| Data transfer (4 TB included) | **US$0** |
| Domain name | **US$0** — free `sslip.io` hostname |
| HTTPS certificate | **US$0** — Let's Encrypt |
| **Total** | **US$24 ≈ A$36 / month** |

Billed hourly up to that monthly cap. Delete the instance and it stops.

**New AWS accounts get up to US$200 in credits** — US$100 at signup and up to
US$100 more for trying services — valid for 6 months. That covers roughly your
first four to eight months outright.

Telnyx, Groq and Gemini bill separately for usage.

> **Choose the Paid plan when you sign up, not the Free plan.** A Free plan
> account **closes itself after 6 months**. Both plans get the same credits, so
> the Paid plan gives you the credits *and* an account that keeps running.

## Time

| Phase | Time | Hands-on? |
|-------|------|-----------|
| 0. Push the `deploy` branch | 1 min | yes |
| 1–2. SSH key, collect API keys | 5 min | yes |
| 3. Create the instance | 10 min | yes |
| 4. Static IP + firewall | 5 min | yes |
| 5. Free hostname | 2 min | yes |
| 6. Connect and bootstrap | 5 min | mostly waiting |
| 7. Fill in `.env` | 10 min | yes |
| 8. Build | 30–45 min | **no** — walk away |
| 9–11. Telnyx, verify, test call | 15 min | yes |

**About 50 minutes of your attention, ~1.5 hours wall clock.**

---

## What you need open

- This file
- A browser for [lightsail.aws.amazon.com](https://lightsail.aws.amazon.com/)
- A browser for [portal.telnyx.com](https://portal.telnyx.com/)
- Your **laptop `.env`** — you copy API keys out of it (never the whole file)
- A credit card

---

## Step 0 — Push the deploy branch (1 min, do this first)

The server pulls everything from GitHub, so the code must be there first.

```bash
cd ~/Desktop/NEXUS-LOCAL && git checkout deploy && git push origin deploy
```

Confirm — this must print the script, not `404`:

```bash
curl -fsSL https://raw.githubusercontent.com/jatinSharma-create/NEXUS-LOCAL/deploy/scripts/server-bootstrap.sh | head -3
```

---

## Step 1 — SSH key on your Mac (3 min)

Check whether you already have one:

```bash
ls ~/.ssh/id_ed25519.pub
```

**If it says "No such file",** create one (press Return at every prompt):

```bash
ssh-keygen -t ed25519 -C "nexus" -f ~/.ssh/id_ed25519
```

Print the **public** key and keep it handy:

```bash
cat ~/.ssh/id_ed25519.pub
```

> Copy the file ending in **`.pub`** only. The other file is your private key
> and must never leave your Mac.

---

## Step 2 — Collect your API keys (2 min)

```bash
cd ~/Desktop/NEXUS-LOCAL && grep -E '^(GOOGLE_GENERATIVE_AI_API_KEY|GROQ_API_KEY|TELNYX_|VOICE_CALLER_ID|VOICE_AGENT_ENDPOINT)=' .env
```

Copy that output somewhere you can paste from. You need it in step 7.

---

## Step 3 — Create the instance (10 min)

1. Sign up at [aws.amazon.com](https://aws.amazon.com/). **Pick the Paid
   plan** (see the budget warning above). Add a credit card.
2. Go to [lightsail.aws.amazon.com](https://lightsail.aws.amazon.com/).
3. Top right, set the region to **Sydney, ap-southeast-2**. Do this *before*
   creating anything — Lightsail resources are region-locked.
4. Click **Create instance**, then set:

   | Field | Choose |
   |-------|--------|
   | Instance location | **Sydney, ap-southeast-2** |
   | Platform | **Linux/Unix** |
   | Blueprint | **OS Only** → **Ubuntu 24.04 LTS** |
   | Networking | **Dual-stack** (IPv4 + IPv6) |
   | SSH key pair | **Create new** → **Download** the `.pem`, or upload your step 1 key |
   | Instance plan | **US$24/month** — 2 vCPU, **4 GB RAM**, 80 GB SSD |
   | Name | `nexus` |

5. Click **Create instance**. Wait for **Running**.

> **Three ways to get this wrong:**
> - **Do not pick IPv6-only.** It saves US$4 but Let's Encrypt and Telnyx
>   webhooks need IPv4. You will not get a certificate.
> - **Do not pick the US$12 plan.** 2 GB is not enough; the PDF worker dies.
> - **Do not pick a Blueprint app** like "Node.js". You want **OS Only**.

If you downloaded the `.pem`, lock it down now or SSH will refuse it:

```bash
mv ~/Downloads/LightsailDefaultKey-*.pem ~/.ssh/nexus-lightsail.pem
chmod 400 ~/.ssh/nexus-lightsail.pem
```

---

## Step 4 — Static IP and firewall (5 min)

**A Lightsail instance's public IP changes every time it stops.** Attach a
static IP or your site and webhooks break on the first reboot.

1. In Lightsail, open the **Networking** tab (the top-level one, not the
   instance's).
2. **Create static IP** → attach it to the `nexus` instance → name it
   `nexus-ip` → **Create**.
3. **Copy the static IPv4 address.** It looks like `13.55.12.34`.

Free while attached to a running instance. AWS charges only if you leave one
unattached.

Now the firewall:

4. Open the **`nexus` instance** → **Networking** tab → **IPv4 Firewall**.
5. Port 22 (SSH) and 80 (HTTP) already exist. **Add rule** → **HTTPS**,
   port **443**. Save.

You need all three:

| Port | Why |
|------|-----|
| 22 | You, over SSH |
| 80 | Let's Encrypt certificate challenge |
| 443 | The actual website |

Everywhere below, replace `YOUR_IP` with your static IP.

---

## Step 5 — Get your free hostname (2 min)

No domain to buy. `sslip.io` turns the dots in your IP into dashes.

On your **Mac**:

```bash
cd ~/Desktop/NEXUS-LOCAL && ./scripts/sslip-hostnames.sh YOUR_IP
```

Copy all five lines it prints — that is your `.env` block and your Telnyx
webhook. For `13.55.12.34` the site would be `https://13-55-12-34.sslip.io`.

> **One risk to know.** Every `sslip.io` user shares a single Let's Encrypt
> certificate quota, because `sslip.io` is deliberately not on the Public
> Suffix List. That quota does run dry — it was raised to 200,000 a week in
> February 2026 and still emptied. If it is empty the day you deploy, there is
> **no way to force it**; the window is a rolling week. Free and usually fine
> for getting started, but for real candidate traffic spend ~A$15/year on a
> domain. Step 5b.

### Step 5b — Using a real domain instead (optional, 10 min)

Buy any cheap `.com` or `.xyz`. At your registrar add two **A records**, both
pointing at `YOUR_IP`:

| Type | Name | Value |
|------|------|-------|
| A | `nexus` | `YOUR_IP` |
| A | `files.nexus` | `YOUR_IP` |

Then use your own names in step 7:

```env
DOMAIN=nexus.yourdomain.com
FILES_DOMAIN=files.nexus.yourdomain.com
PUBLIC_APP_URL=https://nexus.yourdomain.com
MINIO_PUBLIC_ENDPOINT=https://files.nexus.yourdomain.com
```

Check it resolves before step 8:

```bash
dig +short nexus.yourdomain.com
```

---

## Step 6 — Connect and run one command (5 min)

Lightsail's Ubuntu user is **`ubuntu`**, not `root`.

```bash
ssh -i ~/.ssh/nexus-lightsail.pem ubuntu@YOUR_IP
```

If you uploaded your own key in step 3, plain `ssh ubuntu@YOUR_IP` works.

Type `yes` at the fingerprint prompt. You should land on `ubuntu@ip-…:~$`.

> Stuck? The Lightsail console has a browser SSH button on the instance page
> that needs no key at all. Use it to get in, then fix keys later.

Confirm the machine is what you paid for:

```bash
uname -m && free -h
```

`x86_64` and about **3.8 Gi** of memory. If memory says 1.9 Gi you are on the
US$12 plan — stop and resize before going further.

Now run the bootstrap. It adds swap, installs Docker, and clones the code:

```bash
curl -fsSL https://raw.githubusercontent.com/jatinSharma-create/NEXUS-LOCAL/deploy/scripts/server-bootstrap.sh | bash
```

It uses `sudo` automatically and adds you to the `docker` group. When it
finishes, **reconnect once** so that group applies:

```bash
exit
ssh -i ~/.ssh/nexus-lightsail.pem ubuntu@YOUR_IP
```

---

## Step 7 — Fill in `.env` (10 min)

```bash
nano /opt/nexus/.env
```

`nano`: arrow keys to move, type to edit, **Ctrl+O** then **Return** to save,
**Ctrl+X** to quit.

**7a. Paste your hostname block** from step 5, replacing the examples:

```env
DOMAIN=13-55-12-34.sslip.io
FILES_DOMAIN=files.13-55-12-34.sslip.io
PUBLIC_APP_URL=https://13-55-12-34.sslip.io
MINIO_PUBLIC_ENDPOINT=https://files.13-55-12-34.sslip.io
ACME_EMAIL=your-real@email.com
```

`PUBLIC_APP_URL` must start with `https://` and have **no** trailing slash.

**7b. Set two passwords.** Generate each with `openssl rand -base64 24`:

```env
APP_PASSWORD=first-random-string
MINIO_SECRET_KEY=second-random-string
```

`APP_PASSWORD` is what you give people. Do not leave either at the default.

**7c. Paste the API keys** from step 2:

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

Leave everything else as it came. Save and exit.

> **Use whatever number you already have.** A `+1` caller ID works and costs
> the same — Telnyx bills by the number you are *calling*, not calling *from*.
> A `+61` number does not make calls cheaper; it makes candidates far more
> likely to answer. Buying one is not instant: Telnyx needs an Australian
> address plus proof dated within 3 months and about **72 hours** to validate.
> Order it now, deploy with what you have. Switching later is one line plus a
> restart, no rebuild.

**7d. Check it:**

```bash
cd /opt/nexus && grep -E '^(DOMAIN|PUBLIC_APP_URL|APP_PASSWORD|TELNYX_API_KEY)=' .env
```

All four must have real values after the `=`.

> Never copy your laptop `.env` onto the server. It sets `HTTP_PORT=8080` and
> an ngrok URL, and HTTPS will not work.

---

## Step 8 — Build and start (30–45 min, unattended)

```bash
cd /opt/nexus && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Go and do something else. **Do not press Ctrl+C.**

> Expect this to be slower than it would be on a dedicated server. Lightsail
> gives each vCPU a **20% sustained CPU baseline** with a burst allowance on
> top. A long Next.js compile drains the burst and then runs at baseline. It is
> a one-off cost — normal running sits well under baseline, and unlike EC2's
> T-instances Lightsail throttles rather than billing you for the overage.

When you get the prompt back:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

Six services, all `running`: **app, worker, db, redis, storage, caddy**.

---

## Step 9 — Point Telnyx at the server (5 min)

Skip this and candidates answer to silence, because Telnyx is still calling
your old laptop tunnel.

1. Open [portal.telnyx.com](https://portal.telnyx.com/)
2. **Voice** → **Call Control Applications** → open your app
3. Set the **Webhook URL** to exactly this, with your dashed IP:

   ```text
   https://13-55-12-34.sslip.io/api/webhooks/voice/telnyx
   ```

4. Save.

---

## Step 10 — Verify before you share (5 min)

From your **Mac**:

```bash
curl -s https://13-55-12-34.sslip.io/api/health/calling
```

You need all four:

- `"ready": true`
- `"publicReachable": true`
- `"missing": []`
- `"provider": "telnyx"`

If the certificate is not ready, wait 3 minutes and retry. If it still fails
after 5, read the log rather than guessing:

```bash
cd /opt/nexus && docker compose -f docker-compose.yml -f docker-compose.prod.yml logs caddy | grep -iE "error|certificate|obtain" | tail -20
```

- **`too many certificates already issued for "sslip.io"`** — the shared quota
  from step 5 is empty. Nothing on the server fixes it. Do step 5b.
- **`timeout` / `connection refused` during the challenge** — port 80 is not
  open. Recheck the Lightsail firewall in step 4.
- **`DNS problem` / `NXDOMAIN`** — `DOMAIN` is misspelled, or A records have
  not propagated.

If `ready` is false, the `missing` list names the empty `.env` variables. Fix
them, then reload without rebuilding:

```bash
cd /opt/nexus && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## Step 11 — Make one real call (10 min)

1. Open `https://13-55-12-34.sslip.io`
2. Log in with `APP_PASSWORD`
3. **Candidates** → upload a resume
4. Open the candidate → **Call**
5. **Stay on the page.** The candidate hears the recording question first.
   Your browser rings only **after** they press 1 or 2.
6. Press **1** for a transcript and PDF. Press **2** is a live call with no
   recording, on purpose.

If the first ring seems to drop, you hung up during the consent prompt.

---

## Done — what you send people

```text
Nexus:     https://13-55-12-34.sslip.io
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
ssh -i ~/.ssh/nexus-lightsail.pem ubuntu@YOUR_IP
cd /opt/nexus && ./scripts/deploy-update.sh
```

To change the login password: edit `APP_PASSWORD` in `/opt/nexus/.env`, then
`docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`.

> **Never** run `docker compose down -v` on the server. The `-v` deletes your
> database and all stored PDFs.

### Backups

Lightsail snapshots are the easy win — whole-instance, restorable, about
US$0.05/GB-month. On the instance page, **Snapshots** → **Enable automatic
snapshots**. An 80 GB instance runs roughly US$4/month. Worth it once you have
real candidate data.

### Watch the disk

Recordings are MP3 and nothing deletes them. At 2 hours of calls a day you
will add roughly **2 GB a month**. The 80 GB disk gives you a few years, but it
is not infinite — check occasionally with `df -h`.

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
| `Permission denied (publickey)` | Wrong key or wrong user. It is `ubuntu`, not `root`, and the `.pem` needs `chmod 400`. |
| SSH just hangs | Firewall missing port 22, or you used the old dynamic IP instead of the static one. |
| Site worked, then died after a reboot | No static IP attached. Step 4. |
| `free -h` shows 1.9 Gi | US$12 plan. Resize to the US$24 plan. |
| Certificate / HTTPS error | Wait 3 min. Check inbound 80 **and** 443. Then read the Caddy log as in step 10. |
| `too many certificates already issued for "sslip.io"` | Shared quota exhausted. Switch to a real domain (step 5b). |
| Browser shows `502` | App still building or crashed. `logs -f app`. |
| Health lists things in `missing` | Those `.env` lines are empty. |
| `publicReachable: false` | HTTPS or the webhook path, not your Telnyx keys. |
| Candidate answers to silence | Step 9 not done, or the URL has a typo. |
| Call worked but no PDF | They pressed **2**. Working as designed. |
| Worker killed / out of memory | Not the 4 GB plan, or bootstrap's swap step was skipped. |
| Build crawling | Burst capacity spent. Let it finish; it is one-off. |

---

## Files involved

| File | Purpose |
|------|---------|
| **`DEPLOYMENT.md`** | This guide |
| `scripts/server-bootstrap.sh` | Step 6: swap, Docker, clone, `.env` template |
| `scripts/aws-lightsail-bootstrap.sh` | Alias for the above |
| `scripts/sslip-hostnames.sh` | Step 5: hostnames from your IP |
| `scripts/deploy-update.sh` | Ship an update |
| `docker-compose.yml` + `docker-compose.prod.yml` | The stack; production binds Caddy to 80/443 |
| `Caddyfile.production` | HTTPS via Let's Encrypt |
| `.env.production.example` | Template the bootstrap copies to `.env` |
