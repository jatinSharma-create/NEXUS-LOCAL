# Architecture

Nexus is built so that no vendor is load-bearing. Calling, transcription,
language models, PDF rendering, object storage and the database each sit behind
a port that the application defines, with vendor code confined to an adapter.

Switching a vendor means writing one adapter and changing one environment
variable. It never means touching application code.

---

## The two layers

```
app/
├── lib/          Pure, dependency-free shared code.
│                 Domain types, Zod schemas, phone/email normalisation,
│                 call-state helpers. Safe to import from anywhere,
│                 including client components.
│
└── modules/      Capability modules. Each owns one concern and hides one or
                  more vendors behind a port.
```

A module always has the same shape:

```
modules/<capability>/
├── index.ts        Public entry point. Everything outside imports only this.
├── core/           Ports, domain types, and vendor-free logic.
├── providers/      One directory per vendor. The only place an SDK appears.
└── infra/          Adapters onto our own infrastructure (e.g. Postgres).
```

The rule that keeps this honest: **nothing outside a module may import its
internals, and no vendor SDK may be imported outside `providers/`.** Both are
enforced by `no-restricted-imports` in `app/.eslintrc.json`, so a violation
fails lint rather than quietly accruing.

---

## The modules

| Module | Port | Providers today | Selected by |
|---|---|---|---|
| `modules/voice` | `VoiceProvider` | `telnyx`, `fake` | `VOICE_PROVIDER` |
| `modules/transcription` | `TranscriptionProvider` | `groq`, `gemini` | `STT_PROVIDER` |
| `modules/intelligence` | `IntelligenceProvider` | `google` | `LLM_PROVIDER` |
| `modules/documents` | `DocumentRenderer` | `puppeteer` | `PDF_RENDERER` |
| `modules/storage` | `ObjectStore` | `s3` (MinIO, AWS, R2) | `STORAGE_PROVIDER` |
| `modules/data` | repositories | Postgres | — |
| `modules/shared` | registry + errors | — | — |

Every module resolves its provider through the same tiny registry
(`modules/shared/registry.ts`), so adding a vendor is a single `register()`
call rather than another branch in a growing `if/else`.

### modules/data — one place for the database

Every SQL statement in the system lives under `modules/data/repositories/`.
Nothing else imports `pg` or writes a query; pages, routes and the worker call
repository functions. Putting an ORM in front of Postgres, or moving to another
database, is a rewrite of that one directory.

### modules/intelligence — prompts belong to us, not the model

The Zod schemas in `lib/schemas.ts` define the shape the app demands, and
`core/prompts.ts` holds the wording. A provider only supplies a model. Swapping
Gemini for OpenAI or Anthropic is a file that calls `generateObject` with a
different model function.

### modules/documents — content and engine are separate

`templates/` builds the HTML; `providers/` prints it. Redesigning the transcript
PDF and replacing headless Chromium are independent changes.

---

## The voice module in detail

Telephony is the hardest thing to abstract, because vendors disagree about how
a call is controlled. Telnyx steers a live call with REST commands and webhooks;
Twilio expects the webhook *response* to be a TwiML document describing what
happens next. An abstraction that assumes either style locks you into it.

So the call flow does not perform actions. It returns **intents**.

```
webhook  →  provider translates to a neutral CallEvent
         →  call-flow decides, writes to the database, returns CallIntent[]
         →  provider carries them out
```

`CallIntent` is the vocabulary of what the app wants: `answer`, `say`,
`gatherDigits`, `startRecording`, `connectToAgent`, `hangup`. An imperative
provider fires them as sequential API calls; a declarative one renders the same
list into a single document. Each provider declares which style it uses via
`dispatch: 'imperative' | 'response'`, and `webhook.ts` handles both.

`core/call-flow.ts` holds the entire consent IVR and contains no vendor name,
no SDK import, and no knowledge of how commands are delivered.

### Correlating calls without `client_state`

Telnyx echoes an arbitrary `client_state` blob back on every webhook. Most
vendors do not, so relying on it was a hidden dependency. Correlation now runs
through the `call_sessions` table, keyed by the provider's own call identifier:

```
call_sessions(provider_call_id) → call_id, leg, state
```

The same table replaced three module-level `Set`s that tracked IVR progress in
memory. Those worked on one process and would have silently broken the consent
flow the moment a second app container started, since the second process would
happily replay a prompt the first had already played. The claims are now atomic
`UPDATE`s, so duplicate webhook deliveries cannot double-play the prompt or
double-dial the recruiter.

### Capabilities

Two providers is a coincidence; N providers is a spectrum. Each declares what
it can do:

```ts
readonly capabilities: Capabilities = {
  outboundPstn: true,  tts: true,  dtmfGather: true,
  recording: 'dual',   agentEndpoints: ['sip', 'pstn'],
  browserClient: true, webhookSignatures: true,
  answeringMachineDetection: true,
};
```

Shared code consults this instead of guessing. Recording is skipped when a
provider cannot record; the recruiter endpoint falls back when a provider cannot
dial SIP. Recording consent is the exception — a provider without `dtmfGather`
is rejected outright rather than degraded, because consent is legally
load-bearing.

### The browser side

`modules/voice/client/` exposes `useVoiceSession()`, which owns the entire
dialer lifecycle. It resolves a `BrowserVoiceClient` at runtime from the
provider name returned by `/api/calls/token`, so the browser needs no calling
configuration of its own and each SDK is dynamically imported — unused vendors
stay out of the bundle.

`CallDialer` and `KeypadDialer` previously carried near-identical copies of this
logic, each importing `@telnyx/webrtc` directly. Both are now thin views over
the hook.

### The fake provider

`VOICE_PROVIDER=fake` runs the whole consent flow with no carrier account, no
credentials and no tunnel. Neutral events can be POSTed straight at
`/api/webhooks/voice/fake`:

```bash
curl -X POST localhost:3000/api/webhooks/voice/fake \
  -H 'Content-Type: application/json' \
  -d '{"type":"call.answered","providerCallId":"fake-…"}'
```

It also serves as the reference implementation of the port: if a change to
`VoiceProvider` cannot be satisfied by the fake, the interface has drifted
toward one vendor.

---

## Adding a telephony provider

1. `modules/voice/providers/<name>/index.ts` — implement `VoiceProvider`:
   declare `capabilities` and `dispatch`, then `startCall`, `execute` (or
   `renderWebhookResponse`), `receiveWebhook`, `verifyWebhook`, `hangup`,
   `createClientCredentials`, `resolveRecording`, `checkConfig`.
2. `modules/voice/providers/<name>/browser.ts` — implement `BrowserVoiceClient`
   if the vendor has a browser SDK, and add a case to `client/factory.ts`.
3. One `register()` line in `modules/voice/registry.ts`.
4. Set `VOICE_PROVIDER=<name>` and point the vendor's webhook at
   `/api/webhooks/voice/<name>`.

Roughly 300–400 lines, all of it inside one directory. Nothing else in the
codebase changes — the guardrails in `.eslintrc.json` will tell you immediately
if that stops being true.

For reference, `providers/telnyx/` is split into `api.ts` (REST calls),
`signature.ts` (webhook verification), `browser.ts` (WebRTC) and `index.ts`
(the port implementation and event translation).

---

## Database

`db/init.sql` is the schema for a fresh database. Call identifiers are neutral:
`provider`, `provider_call_id`, `agent_provider_call_id`,
`provider_recording_id`.

An existing database is migrated with:

```bash
docker compose exec -T db psql -U nexus -d nexus < db/migrate-provider-agnostic-voice.sql
```

The migration renames the old `telnyx_*` columns in place, backfills
`provider = 'telnyx'` on historical rows, creates `call_sessions`, and drops the
now-unused `client_state` column. It is idempotent.
