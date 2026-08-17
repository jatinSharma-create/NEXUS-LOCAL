# Nexus — Cloud deployment guide (cheapest path)

Deploy Nexus so **recruiters open a URL in their browser** — no Docker, no terminal, no local setup on their machines.

This guide targets **~$0–12/month** using free tiers where possible. Expect **2–4 hours** the first time if you follow the steps in order.

---

## Branch strategy

| Branch | Purpose | Who uses it |
|--------|---------|-------------|
| **`develop`** | Active development — new features, experiments, may break | Developers only |
| **`deploy`** | Stable release — what production runs | Deploy **this** branch to Vercel/Railway |

### Day-to-day workflow

```text
develop  ──merge when stable──►  deploy  ──auto/manual deploy──►  Production URL
   ▲
   └── all feature work happens here
```

1. Build and test locally on `develop` (Docker Compose — see README.md).
2. When a version is ready for users, merge `develop` → `deploy`.
3. Vercel + Railway redeploy from `deploy` (automatic if GitHub integration is on).

```bash
git checkout deploy
git merge develop
git push origin deploy
```

**End users never clone the repo.** They only visit your Vercel URL and log in with `APP_PASSWORD`.

---

## Production architecture (no Docker for users)

```text
Recruiter browser
       │
       ▼
┌──────────────────┐     webhooks      ┌─────────┐
│  Vercel (free)   │◄──────────────────│ Telnyx  │
│  Next.js app     │                   └─────────┘
└────────┬─────────┘
         │
    ┌────┼────┬────────────┐
    ▼    ▼    ▼            ▼
  Neon  Upstash  Cloudflare  Railway (~$5/mo)
  Postgres Redis    R2       BullMQ worker
  (free)  (free)  (free)     + Chromium/PDF
```

| Piece | Provider | Why this one |
|-------|----------|--------------|
| Web app + API | **Vercel** | Native Next.js, HTTPS, free hobby tier |
| Database | **Neon** | Serverless Postgres, generous free tier |
| Job queue | **Upstash Redis** | Serverless Redis, free tier, works with BullMQ |
| File storage | **Cloudflare R2** | S3-compatible, free egress, cheap storage |
| Background worker | **Railway** | Runs Dockerfile `worker` stage (Puppeteer/Chromium) — Vercel cannot run this |

**What you already pay for (not hosting):** Gemini API, Groq API, Telnyx — same as local dev.

### Estimated monthly cost

| Service | Typical cost |
|---------|----------------|
| Vercel Hobby | **$0** |
| Neon Free | **$0** (limits apply) |
| Upstash Free | **$0** (10k cmds/day) |
| Cloudflare R2 | **$0** (10 GB storage free) |
| Railway Worker | **~$5** (Hobby plan + usage) |
| **Total hosting** | **~$5/month** |

If you skip calling/transcription temporarily, you could run **app-only on Vercel for $0** (upload + candidates + notes still work; post-call processing needs the worker).

---

## Before you start — accounts checklist

Create (all have free signup):

- [ ] [GitHub](https://github.com) — repo access
- [ ] [Vercel](https://vercel.com) — connect GitHub
- [ ] [Neon](https://neon.tech) — Postgres
- [ ] [Upstash](https://upstash.com) — Redis
- [ ] [Cloudflare](https://cloudflare.com) — R2 bucket
- [ ] [Railway](https://railway.app) — worker service
- [ ] Telnyx + Gemini + Groq keys (same as local `.env`)

---

## Step 1 — Database (Neon) ~20 min

1. Neon → **New Project** → name `nexus-prod`.
2. Copy the **pooled** connection string (`postgres://...?sslmode=require`).
3. On your laptop (needs `psql` — `brew install libpq` on Mac):

```bash
cd NEXUS-LOCAL
git checkout deploy
export DATABASE_URL='postgres://USER:PASS@HOST/nexus?sslmode=require'
chmod +x scripts/run-neon-init.sh
./scripts/run-neon-init.sh
```

4. Confirm tables:

```bash
psql "$DATABASE_URL" -c '\dt'
```

You should see `candidates`, `calls`, `candidate_notes`.

---

## Step 2 — Redis (Upstash) ~10 min

1. Upstash → **Create database** → type **Regional**, region close to your users.
2. Copy **Redis URL** (`rediss://default:...@....upstash.io:6379`).
3. Save as `REDIS_URL` for Vercel and Railway.

---

## Step 3 — Object storage (Cloudflare R2) ~20 min

1. Cloudflare Dashboard → **R2** → **Create bucket** → name `nexus`.
2. **Manage R2 API tokens** → Create token with Object Read & Write on that bucket.
3. Note:
   - Access Key ID → `MINIO_ACCESS_KEY`
   - Secret Access Key → `MINIO_SECRET_KEY`
   - Account ID → used in endpoint URL

4. Set these env vars (Vercel + Railway + worker):

```env
MINIO_BUCKET=nexus
MINIO_ACCESS_KEY=<r2 access key>
MINIO_SECRET_KEY=<r2 secret>
STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_USE_SSL=true
MINIO_PUBLIC_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

Optional: enable R2 public custom domain later for simpler presigned URLs.

---

## Step 4 — Deploy web app (Vercel) ~30 min

1. Vercel → **Add New Project** → Import `NEXUS-LOCAL` from GitHub.
2. **Production branch:** `deploy` (not `main` or `develop`).
3. **Root Directory:** `app` ← important.
4. Framework: Next.js (auto-detected).
5. Add **Environment Variables** (Production):

| Variable | Value |
|----------|--------|
| `APP_PASSWORD` | Strong password for recruiters |
| `DOMAIN` | Your Vercel domain, e.g. `nexus.vercel.app` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon pooled URL |
| `REDIS_URL` | Upstash URL |
| `MINIO_*` / `STORAGE_ENDPOINT` | From Step 3 |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini key |
| `GOOGLE_GENERATIVE_AI_MODEL` | `gemini-2.5-flash-lite` |
| `GROQ_API_KEY` | Groq key |
| `GROQ_STT_MODEL` | `whisper-large-v3-turbo` |
| `STT_PROVIDER` | `groq` |
| `TELNYX_*` | Same as local `.env` |
| `PUBLIC_APP_URL` | `https://your-app.vercel.app` (no trailing slash) |
| `NEXUS_COMPANY_NAME` | Your company name |
| `RECORDING_ENABLED` | `true` |
| `CONSENT_GATHER_TIMEOUT_SECS` | `10` |
| `CONSENT_MAX_RETRIES` | `2` |

6. **Deploy**.

7. Copy your live URL, e.g. `https://nexus-xxx.vercel.app` — update `PUBLIC_APP_URL` in Vercel if you used a placeholder, then **Redeploy**.

8. Test login: open URL → `/login` → `APP_PASSWORD`.

---

## Step 5 — Deploy worker (Railway) ~45 min

The worker processes call recordings (transcribe → summarize → PDF). It **must** run 24/7 as a separate service.

1. Railway → **New Project** → **Deploy from GitHub repo** → select `NEXUS-LOCAL`, branch **`deploy`**.
2. Add a **service** using **Dockerfile**:
   - Dockerfile path: `app/Dockerfile`
   - Build target: **`worker`** (set in Railway service settings → Build → Dockerfile target)
3. Copy the **same env vars** as Vercel (DATABASE_URL, REDIS_URL, storage, Gemini, Groq, Telnyx) into Railway → Variables.
4. `PUBLIC_APP_URL` is not required on worker, but harmless if set.
5. Deploy and check logs: should see `[Worker] Call processing worker started...`

**Memory:** worker needs Chromium — Railway 512MB may be tight; use **1 GB** if PDF generation fails.

---

## Step 6 — Telnyx webhooks ~15 min

1. Telnyx Mission Control → **Call Control Application** → your app.
2. **Webhook URL:** `https://your-app.vercel.app/api/webhooks/telnyx`
3. Save.

No ngrok needed in production — Vercel URL is already public HTTPS.

Test:

```bash
curl -s https://your-app.vercel.app/api/health/calling
```

(Requires auth cookie locally; in production check Vercel logs after a test call.)

---

## Step 7 — Smoke test ~30 min

| Test | Expected |
|------|----------|
| Login | Password gate works |
| Upload resume | Candidate created (Gemini) |
| Search / status / notes | Stage 1 features work |
| Place call | Phone rings, IVR on handset |
| After call | Worker logs show job; summary appears on call page |
| Failed processing | After 3 retries, “Needs attention — processing failed” |

---

## Updating production later

```bash
# On develop — build features
git checkout develop
# ... work, commit, push ...

# When ready for users
git checkout deploy
git merge develop
git push origin deploy
```

Vercel and Railway redeploy automatically if GitHub integration is enabled.

**Data is safe:** Neon and R2 are unchanged by deploys. Never drop Neon DB unless you mean to reset production data.

---

## What recruiters (end users) need

1. The URL (e.g. `https://nexus.vercel.app`)
2. The shared `APP_PASSWORD`

That is all. No Git, Docker, or `.env` on their side.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Login works locally but not Vercel | Set `DOMAIN` to your Vercel hostname; cookie uses `secure` in production |
| Calls ring but no IVR | `PUBLIC_APP_URL` must be exact Vercel HTTPS URL; Telnyx webhook must match |
| Upload fails | Check Gemini key + Vercel function logs |
| Call stuck “Processing…” | Railway worker down or wrong `REDIS_URL`; check Railway logs |
| PDF fails | Increase Railway memory; check Chromium in worker logs |
| Storage errors | Verify R2 `STORAGE_ENDPOINT` and keys |

---

## Alternative: even cheaper (app-only, $0 hosting)

Deploy **only Vercel + Neon + R2** — skip Railway worker and calling:

- Recruiters can upload resumes, search, notes, status.
- No live calls or post-call AI until you add Railway later.

---

## Files in this repo for deployment

| File | Purpose |
|------|---------|
| `DEPLOYMENT.md` | This guide |
| `app/vercel.json` | Vercel Next.js hint |
| `railway.worker.toml` | Railway worker reference |
| `scripts/run-neon-init.sh` | Apply schema to hosted Postgres |
| `.env.example` | Local Docker template |
| `.env.production.example` | Cloud env var checklist |

---

## Branch setup (one-time, for maintainers)

Already configured in GitHub:

- **`develop`** — default for coding
- **`deploy`** — connected to Vercel/Railway production

To recreate on a new clone:

```bash
git checkout -b develop
git push -u origin develop
git checkout -b deploy
git push -u origin deploy
```

Set GitHub **default branch** to `develop` if you want PRs to target development first.
