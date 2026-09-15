# CONTEXT

Running record of what has been changed in this codebase and why.

## How to maintain this file

**One entry per file. Never two.**

When you change a file that already appears below, **edit its existing entry in
place** so it describes the file's current state. Do not append a second entry
for the same file, and do not keep a history of what it used to say — that is
what `git log` is for. If a later change reverses an earlier one, the entry
should read as though the earlier change never happened.

If you delete a file, move its entry to the "Deleted" table and delete any
description of it elsewhere in this file.

Keep entries short: what the file is for, not a diff.

---

## Current state

- **Branch:** `deploy`
- **Status:** production host is **AWS Lightsail Small** (US$12/mo, 2 vCPU,
  2 GB, 60 GB SSD) in **Sydney, ap-southeast-2**.
- **Most recent work: made the stack fit 2 GB** so the host could drop from
  US$24 to US$12 (A$36 → A$18). The user asked for this to be solved with
  internal code changes rather than by changing the plan, so the fixes are in
  the codebase, not the runbook.

  **What actually did not fit, and what replaced it.** A 2 GB instance leaves
  roughly 1.5 GB for containers after Ubuntu and the Docker daemon. Three
  things exceeded that:

  1. **Building on the server.** `next build` peaks well above 2 GB and gets
     OOM-killed. Fixed by moving builds off-box: `.github/workflows/build-images.yml`
     builds the `runner` and `worker` targets on every push to `deploy` and
     pushes them to GHCR; `docker-compose.registry.yml` swaps `build:` for
     `image:` so the server only pulls. Side effect: deploys went from ~45
     minutes to ~2.
  2. **MinIO.** It holds 200–400 MB resident — a quarter of the box — to store
     a handful of PDFs and resumes. Replaced with a new `fs` storage provider
     (below) selected by `STORAGE_PROVIDER=fs`. The `ObjectStore` port already
     anticipated this ("a plain filesystem can satisfy this"), so no calling
     code changed.
  3. **Unbounded containers.** Postgres sized itself for a bigger machine and
     nothing stopped one service starving another. `docker-compose.small.yml`
     tunes Postgres down, caps Redis at 64 MB, and sets per-service memory
     ceilings chosen so that under pressure the kernel kills the PDF worker —
     which BullMQ retries — rather than Postgres.

  The PDF path still uses headless Chromium. It was not replaced: BullMQ
  already runs one job at a time, so only one browser is ever alive, and a
  768 MB ceiling plus 4 GB of swap covers a render. Swapping in a pure-JS
  generator would have meant reimplementing the transcript layout for a
  smaller saving.

  **One real bug found while verifying.** The `runner` image runs as `nextjs`
  (uid 1001), and a named volume mounts root-owned 755 by default, so resume
  uploads would have failed with `EACCES`. The Dockerfile now creates and
  chowns `/data/files` before `USER nextjs`, which makes Docker seed the empty
  volume with that ownership. Verified in the built images: the app writes
  `resumes/`, the root worker writes `transcripts/`, and each reads the
  other's files.

  **Commands got shorter.** `COMPOSE_FILE` in `.env` now selects the four
  compose files, so every documented command is a plain `docker compose …`
  with no `-f` flags. Moving to the 4 GB plan is one line in `.env`.

  **Why Lightsail over the rest of AWS.** The stack is a Docker Compose file and
  Lightsail is a plain Ubuntu VM, so it runs unchanged. ECS Fargate and App Runner
  are stateless, so Postgres, Redis and MinIO would have to become RDS,
  ElastiCache and S3 — a rewrite, and A$130+/mo. Plain EC2 t3.medium is the same
  specs for roughly A$76 because IPv4 (US$3.65/mo), EBS and egress are billed
  separately, where Lightsail bundles a static IPv4, 80 GB SSD and 4 TB transfer
  into the flat US$24. Sydney (ap-southeast-2) also fixes the ~280 ms page
  latency that Hetzner's European region carried.

  **Lightsail-specific traps the guide now covers.** The instance's default
  public IP changes on every stop, so a **static IP must be attached** or the
  site and Telnyx webhooks break after the first reboot. The firewall ships with
  22 and 80 but **not 443**. The login user is `ubuntu` with `sudo`, not `root`.
  IPv6-only bundles are US$4 cheaper but break Let's Encrypt and Telnyx webhooks.
  Each vCPU has a **20% sustained CPU baseline** with burst on top, so the first
  Next.js build drains burst and runs 30–45 min rather than 15–30 — Lightsail
  throttles instead of billing for overage, unlike EC2 T-instances. Signing up on
  the AWS **Free plan closes the account after 6 months**; the Paid plan carries
  the same up-to-US$200 credits without expiring.

---

## Why the codebase looks the way it does

The system was tied to Telnyx in ~15 files: API routes, the worker, both
dialers, the database schema and the call state machine. Swapping providers
would have meant touching all of them.

It is now organised in two layers:

- `app/lib/` — pure, dependency-free shared code. Domain types, Zod schemas,
  phone/email normalisation, call-state display helpers. Safe to import
  anywhere, including client components.
- `app/modules/` — capability modules. Each owns one concern and hides one or
  more vendors behind a port the *application* defines.

Every module has the same shape:

```
modules/<capability>/
├── index.ts     Public entry point — the only thing outside may import
├── core/        Ports, domain types, vendor-free logic
├── providers/   One directory per vendor; the only place an SDK may appear
└── infra/       Adapters onto our own infrastructure (Postgres, etc.)
```

Two rules keep this honest, both enforced by `no-restricted-imports` in
`app/.eslintrc.json` so violations fail lint:

1. Nothing outside a module imports its internals.
2. No vendor SDK is imported outside `providers/` (or `modules/data` for `pg`).

Full design rationale, including how to add a provider, is in
[ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Modules

| Module | Port | Providers | Selected by |
|---|---|---|---|
| `modules/voice` | `VoiceProvider` | `telnyx`, `fake` | `VOICE_PROVIDER` |
| `modules/transcription` | `TranscriptionProvider` | `groq`, `gemini` | `STT_PROVIDER` |
| `modules/intelligence` | `IntelligenceProvider` | `google` | `LLM_PROVIDER` |
| `modules/documents` | `DocumentRenderer` | `puppeteer` | `PDF_RENDERER` |
| `modules/storage` | `ObjectStore` | `s3` | `STORAGE_PROVIDER` |
| `modules/data` | repositories | Postgres | — |

---

## How hard is it to actually switch a vendor?

Measured by what you have to write, not by what the design promises:

| Want to change | Work | Application code touched |
|---|---|---|
| Groq → Gemini for transcription | `STT_PROVIDER=gemini`, restart | none — adapter already exists |
| Telnyx → fake for local calls | `VOICE_PROVIDER=fake`, restart | none — adapter already exists |
| MinIO → AWS S3 / Cloudflare R2 | change the S3 endpoint and keys | none — same adapter, it is S3-compatible |
| Gemini → OpenAI / Anthropic for parsing + summaries | one file implementing `IntelligenceProvider`, one `register()` line | none |
| Puppeteer → a PDF service | one file implementing `DocumentRenderer` (`renderPdf(html) → bytes`), one `register()` line | none |
| Telnyx → Twilio / Vonage / Plivo | one provider directory (~300–400 lines), one `register()` line, point the vendor's webhook at `/api/webhooks/voice/<name>` | none |
| Postgres → another database / an ORM | rewrite `modules/data/repositories/` | none — everything else calls repository functions |

Telephony is the only genuinely large one, and the reason it is bounded is that
`core/call-flow.ts` returns **intents** (`say`, `gatherDigits`, `connectToAgent`)
rather than performing actions. Telnyx steers a live call with REST commands;
Twilio expects the webhook *response* to be a TwiML document. Each provider
declares `dispatch: 'imperative' | 'response'` and `webhook.ts` serves both, so
a declarative vendor does not require the flow to be rewritten.

Two things make this verifiable rather than aspirational:

- **The guardrails fail the build.** `no-restricted-imports` in
  `app/.eslintrc.json` rejects any vendor SDK outside `providers/` and any
  import of a module's internals. Confirmed by probe: importing
  `@telnyx/webrtc` and `@/modules/voice/core/call-flow` from `lib/` was
  rejected on both counts.
- **The fake provider is a second implementation.** If a change to
  `VoiceProvider` cannot be satisfied by `providers/fake/`, the port has drifted
  toward one vendor. It runs the entire consent flow with no carrier account.

Known residue, none of it load-bearing: `@telnyx/webrtc` is a plain dependency
in `package.json` (installed even if unused), `VOICE_PROVIDER` defaults to
`telnyx` in `core/config.ts`, two legacy Telnyx webhook paths are kept as
aliases, and the neutral config falls back to `TELNYX_CALLER_ID` /
`TELNYX_SIP_URI` so existing `.env` files keep working. Vendor names elsewhere
in `core/` are explanatory comments only.

---

## Files added

### Shared kernel

| File | Purpose |
|---|---|
| `app/modules/shared/registry.ts` | Generic provider registry used identically by every module. Adding a vendor is one `register()` call, so no factory grows a branch per provider. |
| `app/modules/shared/errors.ts` | `ProviderNotRegisteredError`, `ProviderConfigError`, `NotSupportedError`. |

### Data — the only place that talks to Postgres

| File | Purpose |
|---|---|
| `app/modules/data/client.ts` | Lazy `pg` pool plus `query()` and `transaction()`. The pool is created on first use, not at import, so Next.js builds don't try to reach the database. |
| `app/modules/data/index.ts` | Public entry: exports `callsRepo`, `candidatesRepo`, `notesRepo`, `callSessionsRepo`. |
| `app/modules/data/types.ts` | Row shapes for calls and candidates. |
| `app/modules/data/repositories/calls.ts` | Every call query: create, resolve by provider id, consent, recording, completion, list, transcript join. |
| `app/modules/data/repositories/candidates.ts` | Every candidate query, including trash/restore/purge and recording-consent flags. |
| `app/modules/data/repositories/notes.ts` | Candidate notes. |
| `app/modules/data/repositories/call-sessions.ts` | Per-leg call state. Atomic one-shot claims (`claimSessionFlag`) so duplicate webhooks can't double-play a prompt or double-dial. `insertSessionIfAbsent` is the write callers must use when the leg is a *guess* — it cannot overwrite a leg already recorded by the code that created it. `attachSessionCallId` fills in `call_id` later without disturbing the leg. |

### Voice

| File | Purpose |
|---|---|
| `app/modules/voice/index.ts` | Public entry. Use cases: `startOutboundCall`, `endCall`, `createClientCredentials`, `resolveRecording`, `getCallingConfigReport`. |
| `app/modules/voice/registry.ts` | Provider registration. Separate from `index.ts` to avoid a cycle with `webhook.ts`. |
| `app/modules/voice/webhook.ts` | One webhook entry point for all providers. Verifies, translates, runs the flow, dispatches. Handles both imperative and response-style providers. Releases one-shot claims when a command fails so a call can't stall in silence. |
| `app/modules/voice/core/domain.ts` | `CallIntent`, `CallEvent`, `AgentEndpoint`, `FlowCommand` — the neutral vocabulary. |
| `app/modules/voice/core/ports.ts` | `VoiceProvider`, `VoiceSessionStore`, `VoiceRuntime`, `LegSession` and supporting types. `LegSession.bridgeTo` is a typed field rather than adapter scratch, because every provider that brings a second party onto a call needs it and shared code reasons about it. |
| `app/modules/voice/core/legs.ts` | Shared leg resolution. `resolveLegSession()` waits briefly for a leg we originated instead of guessing, and `legOf()` treats any leg holding a `bridgeTo` as the agent's. Vendor-free and used by every provider, so the race described below cannot be reintroduced one adapter at a time. |
| `app/modules/voice/core/capabilities.ts` | What each provider can do, plus graceful-degradation helpers. Consent requires DTMF, so a provider without it is refused rather than degraded. |
| `app/modules/voice/core/call-flow.ts` | The entire consent IVR. Returns intents; contains no vendor name and no SDK import. Consent is only ever prompted on the leg the call records as the candidate's (`isCandidateLeg`), so a mislabelled leg cannot be asked to consent. |
| `app/modules/voice/core/config.ts` | App-level calling config (`VOICE_*`, `PUBLIC_APP_URL`, consent settings). Falls back to the old `TELNYX_CALLER_ID` / `TELNYX_SIP_URI` names so existing `.env` files keep working. |
| `app/modules/voice/core/scripts.ts` | Everything the candidate hears, as plain strings. |
| `app/modules/voice/infra/session-store.ts` | Backs `VoiceSessionStore` with Postgres, mapping `bridgeTo` and adapter scratch on and off the stored state. The composition seam — adapters never see the database. |
| `app/modules/voice/providers/telnyx/index.ts` | The Telnyx adapter: capabilities, dial, intent execution, event translation, leg bridging. Leg identity comes from `core/legs.ts`; the adapter only supplies the two vendor-specific inputs — whether Telnyx says the call is inbound, and what to assume if the leg never appears. |
| `app/modules/voice/providers/telnyx/api.ts` | Telnyx REST calls. |
| `app/modules/voice/providers/telnyx/signature.ts` | Ed25519 webhook verification. |
| `app/modules/voice/providers/telnyx/browser.ts` | `TelnyxRTC` behind `BrowserVoiceClient`. |
| `app/modules/voice/providers/fake/index.ts` | In-memory provider for dev and tests. Also the reference implementation of the port, and it resolves legs through the same `core/legs.ts` helper as Telnyx, so that shared policy stays exercised rather than quietly diverging. |
| `app/modules/voice/providers/fake/browser.ts` | Stand-in browser client for providers with no WebRTC SDK. |
| `app/modules/voice/client/useVoiceSession.ts` | The whole dialer lifecycle in one hook: register, dial, poll, hang up. Surfaces the live status message from `/api/calls/status` so the recruiter sees "waiting for consent" rather than a fake ringing state. |
| `app/modules/voice/client/factory.ts` | Resolves a browser client from the provider name the server returns. Dynamic imports keep unused SDKs out of the bundle. |
| `app/modules/voice/client/types.ts` | `BrowserVoiceClient` contract. |
| `app/modules/voice/client/index.ts` | Public browser entry point. |

### Transcription / Intelligence / Documents / Storage

| File | Purpose |
|---|---|
| `app/modules/transcription/core/ports.ts` | `TranscriptionProvider`. |
| `app/modules/transcription/providers/groq.ts` | Whisper via Groq. |
| `app/modules/transcription/providers/gemini.ts` | Gemini multimodal transcription. |
| `app/modules/transcription/index.ts` | Registry + `getTranscriptionProvider()`. |
| `app/modules/intelligence/core/ports.ts` | `IntelligenceProvider` — `parseResume` and `summarizeCall`. |
| `app/modules/intelligence/core/prompts.ts` | Prompt text, kept with the capability rather than the vendor. |
| `app/modules/intelligence/providers/google.ts` | Gemini via the Vercel AI SDK. |
| `app/modules/intelligence/index.ts` | Registry + `parseResume()` / `summarizeCall()`. |
| `app/modules/documents/core/ports.ts` | `DocumentRenderer` — HTML in, PDF bytes out. |
| `app/modules/documents/templates/call-transcript.ts` | The transcript PDF's HTML. Content is separate from the engine. |
| `app/modules/documents/providers/puppeteer.ts` | Headless Chromium renderer. |
| `app/modules/documents/index.ts` | Registry + `generateCallTranscriptPdf()`. |
| `app/modules/storage/core/ports.ts` | `ObjectStore` — `put` and `signedUrl`. |
| `app/modules/storage/providers/s3.ts` | S3-compatible store (MinIO, AWS, R2). Clients are created lazily. |
| `app/modules/storage/providers/fs.ts` | Local-disk store for instances too small to run MinIO. Writes to `NEXUS_FILES_DIR` (a volume shared by app and worker) with a sidecar holding the content type, since a filesystem has nowhere else for object metadata. Stands in for presigned URLs by signing `/api/files/...` links with an HMAC and expiry; `openSignedFile()` is the verifying read side. Rejects keys that escape the root. |
| `app/modules/storage/index.ts` | Registry + `uploadFile()` / `getPresignedUrl()`. Registers both `s3` and `fs`, and re-exports `openSignedFile` so the route uses the module's public entry point. |

### Other

| File | Purpose |
|---|---|
| `app/app/api/webhooks/voice/[provider]/route.ts` | Canonical webhook path for every provider. |
| `db/migrate-provider-agnostic-voice.sql` | Renames the `telnyx_*` columns, backfills `provider`, creates `call_sessions`, drops `client_state`. Transactional and idempotent. |
| `ARCHITECTURE.md` | Design rationale and the four steps to add a provider. |
| `CONTEXT.md` | This file. |

---

## Files changed

| File | What changed |
|---|---|
| `app/app/api/calls/start/route.ts` | Calls `startOutboundCall()`. Validates neutral config (`VOICE_CALLER_ID`, `VOICE_AGENT_ENDPOINT`, `PUBLIC_APP_URL`) instead of Telnyx env vars. |
| `app/app/api/calls/token/route.ts` | Returns `createClientCredentials()`, including the provider name so the browser can pick its client adapter. |
| `app/app/api/calls/hangup/route.ts` | Calls `endCall()`. |
| `app/app/api/calls/status/route.ts` | Reads through `callsRepo`. When the candidate has answered, `userMessage` tells the recruiter to wait for DTMF rather than implying the phone is still ringing. |
| `app/app/api/health/calling/route.ts` | Reports whichever provider is active, its capabilities and limitations, instead of a hardcoded Telnyx checklist. |
| `app/app/api/webhooks/telnyx/route.ts` | Thin alias to `handleVoiceWebhook('telnyx', …)`. Kept so existing Mission Control config keeps working. |
| `app/app/api/telnyx/webhook/route.ts` | Same, for the older path. |
| `app/app/api/candidates/route.ts` | Uses `candidatesRepo`. |
| `app/app/api/candidates/[id]/route.ts` | Uses `candidatesRepo`; inline SQL removed. |
| `app/app/api/candidates/[id]/status/route.ts` | Uses `candidatesRepo`. |
| `app/app/api/candidates/[id]/notes/route.ts` | Uses `notesRepo`. |
| `app/app/api/candidates/upload/route.ts` | Uses `candidatesRepo`, `@/modules/intelligence`, `@/modules/storage`. |
| `app/app/api/files/[...key]/route.ts` | Serves the `fs` provider's signed links: verifies signature and expiry, then streams the file rather than buffering it (the app runs with a 320 MB heap cap). Left inside the `middleware.ts` session gate on purpose, so a leaked link is not enough on its own. Unused when `STORAGE_PROVIDER=s3`. |
| `app/app/calls/page.tsx` | `callsRepo.listRecentCalls()`. Distinguishes "Declined recording" (press 2) from a call that never reached consent. |
| `app/app/calls/[callId]/page.tsx` | `callsRepo.findCallDetail()` + `candidatesRepo`. Explains on the call page that press 2 means no transcript or PDF by design. |
| `app/app/candidates/page.tsx` | `candidatesRepo.getCandidates()`. |
| `app/app/candidates/[id]/page.tsx` | `candidatesRepo` + `callsRepo.listCallsForCandidate()`. |
| `app/app/trash/page.tsx` | `candidatesRepo.purgeExpiredCandidates()` + `listTrash()`. |
| `app/components/CallDialer.tsx` | Thin view over `useVoiceSession()`. No vendor SDK. During consent it says the candidate has answered and that the recruiter's line rings *after* they press 1 or 2, instead of the misleading "Ringing…" that made recruiters hang up mid-IVR. |
| `app/components/KeypadDialer.tsx` | Same. |
| `app/worker/processCall.ts` | Resolves recordings through the voice module and uses the transcription / intelligence / documents / storage / data modules. |
| `app/lib/queue.ts` | Lazy queue singleton (no Redis client at import). Job payload renamed `telnyxRecordingId` → `providerRecordingId` and gained `provider`. |
| `app/.eslintrc.json` | Added the `no-restricted-imports` boundary rules described above. |
| `db/init.sql` | Provider-neutral call columns; added the `call_sessions` table. |
| `docker-compose.yml` | Added provider-selection and neutral calling env vars; grouped vendor credentials separately. Added the opt-in `tunnel` service (ngrok → `caddy:80`, `--profile tunnel`) so the public URL webhooks need is managed by Docker rather than a terminal session. |
| `scripts/start-tunnel.sh` | Host-ngrok alternative to the `tunnel` container. Reads `HTTP_PORT` from `.env` instead of assuming `:80`, reuses the reserved domain already in `PUBLIC_APP_URL` so the webhook address survives restarts, detaches with `nohup`/`disown`, and prints the canonical `/api/webhooks/voice/<provider>` path. |
| `scripts/verify-deploy.sh` | Confirms you are on `deploy`, production compose parses, and tsc/lint pass. |
| `scripts/sslip-hostnames.sh` | Prints the sslip.io hostname and Telnyx webhook from a VPS IPv4. Emits one hostname, since filesystem storage removed the separate `files.` host; notes the extra MinIO lines for the 4 GB profile. |
| `scripts/server-bootstrap.sh` | Host-agnostic one-liner for a fresh Ubuntu box: swapfile, Docker, clone `deploy`, copy `.env` template, then stop. Swap is sized from actual RAM — 4 GB on a 2 GB instance, 2 GB otherwise — because Chromium render spikes have less real memory to borrow. Detects root vs `sudo`, so it works on Lightsail/OVH (`ubuntu`) and bare VPS images (`root`). Adds the login user to the `docker` group. Swap is non-fatal — `fallocate` falls back to `dd`, and total failure still lets Docker install. Idempotent. |
| `scripts/hetzner-bootstrap.sh` | Compatibility wrapper → `server-bootstrap.sh`. |
| `scripts/verify-deploy.sh` | Pre-ship gate: asserts branch is `deploy`, production compose parses, then `tsc --noEmit` and `next lint`. |
| `scripts/deploy-update.sh` | On the server: pull `deploy`, then either pull prebuilt images or build locally depending on whether `COMPOSE_FILE` includes the registry override. Prunes old images afterwards. |
| `scripts/aws-lightsail-bootstrap.sh` | Compatibility wrapper → `server-bootstrap.sh`. |
| `scripts/aws-deploy-update.sh` | Compatibility wrapper → `deploy-update.sh`. |
| `.env.example` | Rewritten around provider selection with vendor credentials in their own section. Documents `NGROK_AUTHTOKEN` / `NGROK_DOMAIN` for the tunnel container. |
| `README.md` | Env table updated to the neutral names; links to `ARCHITECTURE.md`. The "live phone calling" placeholder is now the actual tunnel + health-check procedure. |
| `DEPLOYMENT.md` | The only production guide. 11 linear steps to put Nexus on AWS Lightsail (push branch, SSH key, API keys, instance, static IP + firewall, sslip.io hostname, bootstrap, `.env`, build, Telnyx webhook, health check, test call) plus the AWS-option comparison, budget, timings, snapshots/disk notes and a troubleshooting table. |
| `docker-compose.prod.yml` | Production overlay: HTTPS 80/443, no public MinIO, no public app port, no ngrok. |
| `docker-compose.small.yml` | The 2 GB profile. Drops MinIO (parks it in an unused profile and rewrites the `depends_on` that referenced it), points app and worker at a shared `files` volume with `STORAGE_PROVIDER=fs`, tunes Postgres down, caps Redis at 64 MB, and sets per-service memory ceilings. |
| `docker-compose.registry.yml` | Pull prebuilt images from GHCR instead of building on the server, via `build: !reset null`. Required on 2 GB, where `next build` would be OOM-killed. Needs Compose v2.24+ for the `!reset` tag. |
| `.github/workflows/build-images.yml` | Builds the `runner` and `worker` Dockerfile targets on every push to `deploy` and pushes them to GHCR, tagged `latest` and the commit SHA. amd64 only, matching Lightsail. Lowercases the owner with `tr` rather than bash 4's `,,`. |
| `Caddyfile.production` | HTTPS for the 4 GB profile: app plus the MinIO `files.` vhost. |
| `Caddyfile.small` | HTTPS for the 2 GB profile. One vhost, because downloads come from the app at `/api/files` — a second cert would spend another request against the shared sslip.io quota for a host nothing serves. |
| `app/Dockerfile` | Multi-stage: `deps`, `builder`, `worker` (adds Chromium), `runner` (Next.js standalone, default target). `runner` creates and chowns `/data/files` before `USER nextjs`, so Docker seeds the `files` volume with that ownership — without it the volume mounts root-owned and resume uploads fail with `EACCES`. |
| `.env.production.example` | Server env template. Defaults to the 2 GB profile: `COMPOSE_FILE` selects the four compose files so every command is a bare `docker compose …`, plus `STORAGE_PROVIDER=fs`, `FILES_SIGNING_SECRET` and the GHCR image owner. Keeps a commented block for moving back to 4 GB with MinIO. |

---

## Files deleted

| File | Replaced by |
|---|---|
| `app/lib/telnyx.ts` | `modules/voice/providers/telnyx/api.ts` + `signature.ts` |
| `app/lib/telnyx-call-flow.ts` | `modules/voice/core/call-flow.ts` (vendor-free) |
| `app/lib/telnyx-webhook.ts` | `modules/voice/webhook.ts` |
| `app/lib/db.ts` | `modules/data/client.ts` |
| `app/lib/candidates.ts` | `modules/data/repositories/candidates.ts` |
| `app/lib/storage.ts` | `modules/storage/` |
| `app/lib/llm.ts` | `modules/intelligence/` |
| `app/lib/pdf.ts` | `modules/documents/` |
| `app/lib/stt/` | `modules/transcription/` |
| `db/migrate-call-control-index.sql` | `db/migrate-provider-agnostic-voice.sql` |
| `GO_LIVE.md` | `DEPLOYMENT.md` |
| `DEPLOY_PRODUCTION.md` | `DEPLOYMENT.md` |

---

## Behaviour changes

Everything else is intentionally identical. These three are deliberate:

1. **Inbound calls now work.** The old code branched on `direction === 'inbound'`,
   but Telnyx sends `"incoming"`, so that path never ran. The adapter accepts both.
2. **IVR state is shared, not per-process.** Three module-level `Set`s tracked
   consent progress in memory. That works on one process and would have broken
   the consent flow with a second app container — the second process would
   replay a prompt the first had already played. State now lives in
   `call_sessions` with atomic claims.
3. **Call correlation no longer depends on `client_state`.** Telnyx echoes that
   blob back on every webhook; most vendors don't. Correlation is keyed on the
   provider's own call id in `call_sessions`.

---

## Fixed: the consent IVR played to the recruiter

**Symptom.** A live call to `+919818554994` rang the recruiter's browser and
asked *the recruiter* whether the call could be recorded. The two legs were
never bridged, so the candidate — who had already consented — was left
listening to silence.

**Cause.** A read-then-write race over which leg a call id belongs to.

`dialAgent()` learns the agent leg's id only when `api.dial()` returns, and
files it as `leg: 'agent'`. But Telnyx delivers that leg's `call.initiated`
webhook so promptly that it routinely beats the dial response. The webhook then
found no session, and the adapter's `inferLeg()` fell back to assuming any
outbound leg was the candidate's. `ensureSession()` wrote that guess with an
upsert whose `ON CONFLICT` clause set `leg = EXCLUDED.leg`, so the guess landed
*after* the truth and overwrote it.

From there the damage was mechanical: the recruiter's leg was labelled
`candidate`, so `call.answered` skipped the branch that bridges the two legs
and fell through to the consent prompt instead. `agent_provider_call_id` was
never recorded either, which is the fingerprint left in the database:

```
provider_call_id          leg          state
v3:IN7G-…  (candidate)    candidate    consentPromptPlayed, agentDialStarted
v3:hN6UZ0… (recruiter)    candidate    adapter.bridgeTo = v3:IN7G-…
```

The second row is self-contradicting — only `dialAgent()` writes `bridgeTo`, so
that leg was the recruiter's while labelled the candidate's. It survived because
`upsertSession` merges `state` but replaces `leg`.

**Fix,** in three layers, so no single mistake can reproduce the symptom. Each
sits at the layer that owns the concern, not the layer where the bug surfaced:

| Layer | Where | Why there |
|---|---|---|
| Never let a guess overwrite a fact — `ensureSession()` uses `insertSessionIfAbsent` (`ON CONFLICT DO NOTHING`) | `modules/data` | The atomicity is a property of the write, so it belongs with the SQL |
| Don't guess while the answer is arriving — `resolveLegSession()` waits 4 × 150 ms for a leg we originated; `legOf()` reads a `bridgeTo` as proof of an agent leg | `modules/voice/core/legs.ts` | **Every** provider has this race, so the policy is written once and both adapters call it |
| Refuse to prompt any leg the call does not record as the candidate's (`isCandidateLeg`) | `modules/voice/core/call-flow.ts` | Vendor-free, and holds even if a future adapter labels legs wrongly — asking the right person for consent is a rule about the domain, not about Telnyx |

The second layer was originally written inside the Telnyx adapter, which was
the wrong place: the race is caused by the gap between dialling and recording
a leg, which every vendor has. Left there, the next adapter would have had to
rediscover this bug to fix it. Moving it into `core/` is what makes the fix
portable, and `bridgeTo` was promoted from an untyped key that two adapters had
each invented for themselves into a field on `LegSession`.

---

## Migration

`db/init.sql` is the schema for a fresh database. The local dev database is
already migrated — `telnyx_*` columns renamed, `provider` backfilled,
`call_sessions` created, `client_state` dropped, no rows lost.

Any *other* environment still needs the migration:

```bash
docker compose exec -T db psql -U nexus -d nexus < db/migrate-provider-agnostic-voice.sql
docker compose up -d --build
```

It is idempotent, so re-running is harmless.

---

## Verification status

Static checks:

| Check | Result |
|---|---|
| `npx tsc --noEmit` | passes |
| `npx next lint` | passes, no warnings |
| `npx next build` | passes, all 24 routes |
| ESLint boundary actually fires | verified — a probe importing `@telnyx/webrtc` and a module internal was rejected on both counts |

Running system (all six containers up, plus `tunnel`):

| Check | Result |
|---|---|
| `app` + `worker` containers boot | clean; worker resolves the module graph under `tsx` and waits for jobs |
| `/login` | HTTP 200 direct, through Caddy, and through the public tunnel |
| `/api/health/calling` | `ready: true`, `publicReachable: true`, `missing: []`, `limitations: []` |
| `POST /api/webhooks/voice/telnyx` via the public tunnel | HTTP 401 — signature rejected, so the request reached the adapter |
| Both legacy webhook paths via the tunnel | HTTP 401 — old Mission Control config still works |
| `POST /api/webhooks/voice/nope` | `{"error":"Unknown voice provider"}` |
| Consent flow via fake provider | `call.answered → [gatherDigits]`, replayed answer → `[]` (no double prompt), `digits "1" → [startRecording, say, connectToAgent(sip)]`, state `{consentPromptPlayed, agentDialStarted}` |
| Migrated schema | 0 residual `telnyx_*` / `client_state` columns; `provider='telnyx'` on all 33 historical calls; a real `consent_method='dtmf_1'` row preserved |
| Repository call sites | typechecked by `tsc` + `next build`; read paths spot-checked against the migrated schema by SQL |
| Graceful degradation | with no `VOICE_AGENT_ENDPOINT` set, consent falls back to `[say, hangup]` instead of failing |

Wrong-leg consent fix, reproduced from the broken state the live call left behind:

| Check | Result |
|---|---|
| Recruiter leg answers while stored as `candidate` but holding `bridgeTo` | shared resolver reports `leg=agent`; no intents sent |
| Same, with `bridgeTo` absent so only the core guard can catch it | no intents; logs `refusing consent prompt on non-candidate leg` |
| Guessed leg written over a known `agent` leg | leg stays `agent` — `ON CONFLICT DO NOTHING` holds |
| Happy path still intact, now routed through `core/legs.ts` | `call.answered → [gatherDigits]`, `digits "1" → [startRecording, say, connectToAgent(sip)]` |
| Both providers use the shared resolver | `providers/telnyx` and `providers/fake` both call `resolveLegSession()`; no adapter owns a private copy |

Live calls after the wrong-leg fix (11 Sep 2026, to `+61422032039`):

| Call | What happened |
|---|---|
| `48fd8ebe` 12s | Candidate answered IVR. Recruiter hung up from the browser while the dialer still said "Ringing…". No agent leg. |
| `23496cc5` 42s | Press **2**. Bridged, conversation happened, **no recording by design** — worker never queued, no PDF. |
| `41c6c50e` 48s | Press **1**. Recording, Groq transcript, PDF uploaded. `agent_provider_call_id` populated. Worker job 4 completed. |

The pipeline is not broken. Press 2 skips it on purpose. The dropped first ring was the recruiter hanging up during consent, which the dialer now spells out.

For local testing without a carrier, set `VOICE_PROVIDER=fake` and POST neutral
events at `/api/webhooks/voice/fake`.

### Tunnel

`/api/health/calling` reporting `ready: false` / `publicStatus: 404` means no
tunnel is running. Start it with `docker compose --profile tunnel up -d`; the
container restarts with Docker and needs no terminal held open.
