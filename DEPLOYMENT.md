# Deploy Nexus on AWS Lightsail

**The only deployment guide.** Do the steps in order. Every command is copy-paste.

At the end, people open **one link**, type **one password**, and can make calls.
They install nothing.

## Why Lightsail and not the rest of AWS

Your app is a Docker Compose file. Lightsail is a plain Ubuntu VM, so it runs
that file with a small override rather than a rewrite.

| AWS option | A$ / month | Verdict |
|------------|-----------:|---------|
| **Lightsail Small 2 GB** | **18** | **Chosen.** Needs the three changes below, which are already in the repo. |
| Lightsail Medium 4 GB | 36 | Same thing with room to spare. Move up if you outgrow 2 GB. |
| EC2 t3.small | ~50 | Same specs, more money — IPv4, EBS and egress all billed separately. |
| ECS Fargate / App Runner | 130+ | Stateless. Postgres, Redis and MinIO would become RDS, ElastiCache and S3. A rewrite. |

### What had to change to fit 2 GB

A 2 GB instance leaves roughly **1.5 GB** for containers once Ubuntu and the
Docker daemon have taken their share. Three things did not fit, so the repo now
does each of them differently. You do not have to configure any of this — it is
what `docker-compose.small.yml` and `.env.production.example` already select.

| Problem | Why it broke | What the repo does now |
|---------|--------------|------------------------|
| **Building on the server** | `next build` peaks well above 2 GB and gets OOM-killed | GitHub Actions builds both images and the server pulls them (`docker-compose.registry.yml`) |
| **MinIO** | Holds 200–400 MB resident — a quarter of the box — to store a few PDFs | `STORAGE_PROVIDER=fs` writes to a local volume and serves downloads from the app |
| **Unbounded containers** | Postgres sized for a bigger machine; nothing stopped one service starving another | Tuned Postgres, a Redis memory ceiling, and per-service memory limits |

Two side effects worth knowing: deploys now take about **2 minutes instead of
45**, and the memory ceilings are set so that under real pressure the kernel
kills the PDF worker — which BullMQ simply retries — rather than Postgres.

The PDF worker still uses headless Chromium. It gets a 768 MB ceiling and
BullMQ runs one job at a time, so only one browser is ever alive.

## Budget

| Item | Cost |
|------|------|
| Lightsail **Small** (2 vCPU, 2 GB, 60 GB SSD) | US$12 / month |
| Static IPv4 address | **US$0** — free while attached |
| Data transfer (3 TB included) | **US$0** |
| Image builds on GitHub Actions | **US$0** — free for public repos, 2,000 min/month on free private |
| Container registry (GHCR) | **US$0** |
| Domain name | **US$0** — free `sslip.io` hostname |
| HTTPS certificate | **US$0** — Let's Encrypt |
| **Total** | **US$12 ≈ A$18 / month** |

Billed hourly up to that monthly cap. Delete the instance and it stops.

**New AWS accounts get up to US$200 in credits** — US$100 at signup and up to
US$100 more for trying services — valid for 6 months. At US$12/month the
credits cover the whole 6-month window with plenty left over.

Telnyx, Groq and Gemini bill separately for usage.

> **Choose the Paid plan when you sign up, not the Free plan.** A Free plan
> account **closes itself after 6 months**. Both plans get the same credits, so
> the Paid plan gives you the credits *and* an account that keeps running.

## Time

| Phase | Time | Hands-on? |
|-------|------|-----------|
| 0. Push the `deploy` branch, let Actions build | 1 min + 10 min waiting | mostly waiting |
| 1–2. SSH key, collect API keys | 5 min | yes |
| 3. Create the instance | 10 min | yes |
| 4. Static IP + firewall | 5 min | yes |
| 5. Free hostname | 2 min | yes |
| 6. Connect and bootstrap | 5 min | mostly waiting |
| 7. Fill in `.env` | 10 min | yes |
| 8. Pull and start | 2–3 min | **no** |
| 9–11. Telnyx, verify, test call | 15 min | yes |

**About 50 minutes of your attention, ~1 hour wall clock.** The build step that
used to take 45 minutes now happens on GitHub while you create the instance.

---

## What you need open

- This file
- A browser for [lightsail.aws.amazon.com](https://lightsail.aws.amazon.com/)
- A browser for [portal.telnyx.com](https://portal.telnyx.com/)
- Your **laptop `.env`** — you copy API keys out of it (never the whole file)
- A credit card

---

## Step 0 — Push the deploy branch and let GitHub build (1 min, then it runs on its own)

The server no longer builds anything — it pulls finished images. Pushing to
`deploy` is what triggers that build, so do this **first** and let it run while
you work through steps 1 to 7.

```bash
cd ~/Desktop/NEXUS-LOCAL && git checkout deploy && git push origin deploy
```

Confirm the code is on GitHub — this must print the script, not `404`:

```bash
curl -fsSL https://raw.githubusercontent.com/jatinSharma-create/NEXUS-LOCAL/deploy/scripts/server-bootstrap.sh | head -3
```

### 0a — Watch the build

Open **[the Actions tab](https://github.com/jatinSharma-create/NEXUS-LOCAL/actions)**.
You want the **"Build and publish images"** run to finish with two green checks
(`runner` and `worker`). First run takes **8–12 minutes**; later ones are 2–4
because the layers are cached.

If the tab says workflows are disabled, click **"I understand my workflows,
enable them"**.

### 0b — Make the two images public (one time, 2 min)

Your server pulls from GHCR. Public images need no password on the server,
which is one less secret to manage. The images contain your compiled app, not
your `.env` — all keys stay on the server.

1. Go to **[your packages](https://github.com/jatinSharma-create?tab=packages)**
2. Click **`nexus-app`** → **Package settings** (right sidebar)
3. Scroll to **Danger Zone** → **Change visibility** → **Public** → confirm by typing the package name
4. Repeat for **`nexus-worker`**

> **Prefer to keep them private?** Leave visibility alone and instead create a
> [classic token](https://github.com/settings/tokens/new) with only
> `read:packages`, then run this on the server after Step 6:
> ```bash
> echo 'YOUR_TOKEN' | docker login ghcr.io -u jatinSharma-create --password-stdin
> ```

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
   | Instance plan | **US$12/month** — 2 vCPU, **2 GB RAM**, 60 GB SSD |
   | Name | `nexus` |

5. Click **Create instance**. Wait for **Running**.

> **Two ways to get this wrong:**
> - **Do not pick IPv6-only.** It saves US$4 but Let's Encrypt and Telnyx
>   webhooks need IPv4. You will not get a certificate.
> - **Do not pick a Blueprint app** like "Node.js". You want **OS Only**.

> **Do not pick the US$5 or US$7 plan.** Those have 512 MB and 1 GB. Even with
> MinIO gone and the build moved off-box, Postgres plus Chromium will not fit.
> US$12 is the floor for this stack.

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

Copy the lines it prints — that is your `.env` block and your Telnyx webhook.
For `13.55.12.34` the site would be `https://13-55-12-34.sslip.io`.

You only need **one** hostname now. On the 4 GB profile MinIO needed a second
`files.` hostname and its own certificate; with filesystem storage the app
serves downloads at `/api/files`, so there is one vhost and one certificate.

> **One risk to know.** Every `sslip.io` user shares a single Let's Encrypt
> certificate quota, because `sslip.io` is deliberately not on the Public
> Suffix List. That quota does run dry — it was raised to 200,000 a week in
> February 2026 and still emptied. If it is empty the day you deploy, there is
> **no way to force it**; the window is a rolling week. Free and usually fine
> for getting started, but for real candidate traffic spend ~A$15/year on a
> domain. Step 5b.

### Step 5b — Using a real domain instead (optional, 10 min)

Buy any cheap `.com` or `.xyz`. At your registrar add **one A record** pointing
at `YOUR_IP`:

| Type | Name | Value |
|------|------|-------|
| A | `nexus` | `YOUR_IP` |

One record is enough on this profile — downloads are served by the app, so
there is no separate `files.` host to point anywhere.

Then use your own name in step 7:

```env
DOMAIN=nexus.yourdomain.com
PUBLIC_APP_URL=https://nexus.yourdomain.com
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

You want `x86_64` and about **1.9 Gi** of memory — that is the US$12 plan,
which is what the rest of this guide assumes. If it says 3.8 Gi you are on the
US$24 plan, which also works; see the note at the end of Step 7.

Now run the bootstrap. It adds swap, installs Docker, and clones the code.
On a 2 GB box it allocates **4 GB of swap** rather than 2, to absorb Chromium
render spikes without the kernel killing anything:

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
PUBLIC_APP_URL=https://13-55-12-34.sslip.io
ACME_EMAIL=your-real@email.com
```

`PUBLIC_APP_URL` must start with `https://` and have **no** trailing slash. On
this profile it is load-bearing beyond cosmetics: it is the base URL used to
build download links for PDFs and resumes.

There is no `FILES_DOMAIN` or `MINIO_*` here — filesystem storage replaced
MinIO. The template keeps those lines commented at the bottom in case you move
to the 4 GB plan later.

**7b. Set two secrets.** Generate each with `openssl rand -base64 24`:

```env
APP_PASSWORD=first-random-string
FILES_SIGNING_SECRET=second-random-string
```

`APP_PASSWORD` is what you give people. `FILES_SIGNING_SECRET` signs the
expiring `/api/files` download links — keeping it separate means changing the
login password later does not invalidate live links. Do not leave either
at the default.

**7b-2. Set your GitHub username** so the server knows which images to pull.
It must be **lowercase** — container registries reject capitals:

```env
NEXUS_IMAGE_OWNER=jatinsharma-create
```

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
cd /opt/nexus && grep -E '^(DOMAIN|PUBLIC_APP_URL|APP_PASSWORD|FILES_SIGNING_SECRET|NEXUS_IMAGE_OWNER|TELNYX_API_KEY|COMPOSE_FILE)=' .env
```

All seven must have real values after the `=`. `COMPOSE_FILE` should already
read:

```env
COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml:docker-compose.small.yml:docker-compose.registry.yml
```

That line is why every command below is just `docker compose …` with no `-f`
flags — Compose reads it from `.env` and applies the four files in order.

> Never copy your laptop `.env` onto the server. It sets `HTTP_PORT=8080` and
> an ngrok URL, and HTTPS will not work.

> **On the US$24 / 4 GB plan instead?** Change one line — set
> `COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml` and follow the
> commented block at the bottom of `.env.production.example` to turn MinIO back
> on. Everything else in this guide is identical, except Step 8 builds locally
> and takes 30–45 minutes.

---

## Step 8 — Pull and start (2–3 min)

Make sure the Actions run from Step 0 has finished and both packages are public
before this.

```bash
cd /opt/nexus && docker compose up -d
```

This pulls the two prebuilt images and starts five containers. Nothing compiles
on the server, so it is minutes rather than the better part of an hour.

```bash
docker compose ps
```

Five services, all `running`: **app, worker, db, redis, caddy**.

There is deliberately **no `storage` service** — that was MinIO, and
filesystem storage replaced it. Five is correct here, not a missing container.

> **`manifest unknown` or `denied`?** The images are not public yet or
> `NEXUS_IMAGE_OWNER` is wrong. Check what it is trying to fetch with
> `docker compose config | grep image:`, then revisit Step 0b. The owner must
> be lowercase.

> Lightsail gives each vCPU a **20% sustained CPU baseline** with a burst
> allowance on top. That mattered a lot when the box compiled Next.js itself;
> now that builds happen on GitHub, normal running sits well under baseline.
> Unlike EC2's T-instances, Lightsail throttles rather than billing overage.

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
cd /opt/nexus && docker compose logs caddy | grep -iE "error|certificate|obtain" | tail -20
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
cd /opt/nexus && docker compose up -d
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
`docker compose up -d`.

> **Never** run `docker compose down -v` on the server. The `-v` deletes your
> database and all stored PDFs.

### Backups

Lightsail snapshots are the easy win — whole-instance, restorable, about
US$0.05/GB-month. On the instance page, **Snapshots** → **Enable automatic
snapshots**. A 60 GB instance runs roughly US$3/month. Worth it once you have
real candidate data.

Snapshots now matter more than they did: PDFs and resumes live in the `files`
Docker volume on this instance rather than in MinIO. A snapshot captures them
along with Postgres.

### Watch the disk

Recordings are MP3 and nothing deletes them. At 2 hours of calls a day you add
roughly **2 GB a month**, plus PDFs and resumes in the `files` volume. The
60 GB disk gives you a couple of years. Check occasionally:

```bash
df -h /
docker system df -v | grep -E "nexus_files|nexus_postgres"
```

If it does fill, the honest fix is pruning old recordings — nothing in the app
expires them yet.

---

## If something goes wrong

Start here:

```bash
cd /opt/nexus
docker compose ps
docker compose logs --tail=100
```

| What you see | What it means |
|--------------|---------------|
| `Permission denied (publickey)` | Wrong key or wrong user. It is `ubuntu`, not `root`, and the `.pem` needs `chmod 400`. |
| SSH just hangs | Firewall missing port 22, or you used the old dynamic IP instead of the static one. |
| Site worked, then died after a reboot | No static IP attached. Step 4. |
| `manifest unknown` / `denied` on pull | Images not public, or `NEXUS_IMAGE_OWNER` wrong or capitalised. Step 0b. |
| Only 4 containers, no `worker` | The `worker` image failed to pull. `docker compose pull worker`. |
| Certificate / HTTPS error | Wait 3 min. Check inbound 80 **and** 443. Then read the Caddy log as in step 10. |
| `too many certificates already issued for "sslip.io"` | Shared quota exhausted. Switch to a real domain (step 5b). |
| Browser shows `502` | App still building or crashed. `logs -f app`. |
| Health lists things in `missing` | Those `.env` lines are empty. |
| `publicReachable: false` | HTTPS or the webhook path, not your Telnyx keys. |
| Candidate answers to silence | Step 9 not done, or the URL has a typo. |
| Call worked but no PDF | They pressed **2**. Working as designed. |
| Worker killed / out of memory | Check swap is on with `free -h` (want ~4 Gi). If a PDF job died, BullMQ retries it — `docker compose logs worker`. |
| Download link says "invalid or has expired" | Links last 15 minutes. Reload the page for a fresh one. If every link fails, `FILES_SIGNING_SECRET` changed. |
| Download 404s | The PDF was written before storage switched, or the `files` volume was recreated. |
| `no space left on device` | `df -h`, then see "Watch the disk". |

---

## Files involved

| File | Purpose |
|------|---------|
| **`DEPLOYMENT.md`** | This guide |
| `scripts/server-bootstrap.sh` | Step 6: swap, Docker, clone, `.env` template |
| `scripts/aws-lightsail-bootstrap.sh` | Alias for the above |
| `scripts/sslip-hostnames.sh` | Step 5: hostnames from your IP |
| `scripts/deploy-update.sh` | Ship an update (pulls or builds based on `COMPOSE_FILE`) |
| `docker-compose.yml` + `docker-compose.prod.yml` | The stack; production binds Caddy to 80/443 |
| **`docker-compose.small.yml`** | The 2 GB profile: no MinIO, tuned Postgres, memory ceilings |
| **`docker-compose.registry.yml`** | Pull prebuilt images instead of building here |
| **`.github/workflows/build-images.yml`** | Builds both images on every push to `deploy` |
| `Caddyfile.production` | HTTPS for the 4 GB profile (app + MinIO vhosts) |
| **`Caddyfile.small`** | HTTPS for the 2 GB profile (one vhost, one certificate) |
| `.env.production.example` | Template the bootstrap copies to `.env` |

And in the app itself:

| File | Purpose |
|------|---------|
| `app/modules/storage/providers/fs.ts` | Filesystem object store and its signed-URL scheme |
| `app/app/api/files/[...key]/route.ts` | Serves those signed links |
