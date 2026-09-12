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

- **Branch:** `develop` (local checkout). `origin/develop` and `origin/deploy`
  both point at `fa4ebd4`.
- **Status:** modular stack is committed and pushed. Go live with `GO_LIVE.md`.
  Share a public HTTPS URL + `APP_PASSWORD`; do not share `.env`.
- **Most recent work:** vendor-neutral modules, recruiter-leg consent fix,
  honest dialer copy during IVR, Lightsail go-live guide.

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
| `app/modules/storage/index.ts` | Registry + `uploadFile()` / `getPresignedUrl()`. |

### Other

| File | Purpose |
|---|---|
| `app/app/api/webhooks/voice/[provider]/route.ts` | Canonical webhook path for every provider. |
| `db/migrate-provider-agnostic-voice.sql` | Renames the `telnyx_*` columns, backfills `provider`, creates `call_sessions`, drops `client_state`. Transactional and idempotent. |
| `ARCHITECTURE.md` | Design rationale and the four steps to add a provider. |
| `GO_LIVE.md` | The short answer: deploy one Lightsail box, share the HTTPS URL + password. |
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
| `.env.example` | Rewritten around provider selection with vendor credentials in their own section. Documents `NGROK_AUTHTOKEN` / `NGROK_DOMAIN` for the tunnel container. |
| `README.md` | Env table updated to the neutral names; links to `ARCHITECTURE.md`. The "live phone calling" placeholder is now the actual tunnel + health-check procedure. |
| `DEPLOYMENT.md` | Lightsail runbook. Points at `GO_LIVE.md`; webhook URL is `/api/webhooks/voice/telnyx`. |
| `.env.production.example` | Server env template with provider-selection vars and sslip.io hostnames. |

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
