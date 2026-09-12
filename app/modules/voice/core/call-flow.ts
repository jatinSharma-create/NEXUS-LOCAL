import { callSessionsRepo, callsRepo, candidatesRepo, type CallRecord } from '@/modules/data';
import { getCallProcessingQueue } from '@/lib/queue';
import { supportsAgentEndpoint, type Capabilities } from './capabilities';
import {
  getAgentEndpoint,
  getCallerId,
  getConsentSettings,
  isRecordingEnabled,
  shouldHangupOnBeep,
} from './config';
import type { CallEvent, CallIntent, FlowCommand } from './domain';
import {
  consentAnnouncement,
  CONSENT_MESSAGES,
  RECORDING_DECLINED_NOTE,
  SCRIPT_NO_AGENT_CONFIGURED,
  SCRIPT_NO_INPUT,
  screeningIdentification,
} from './scripts';

export type FlowContext = {
  provider: string;
  capabilities: Capabilities;
};

/**
 * The consent call flow, expressed once for every provider.
 *
 * It reads a neutral event, writes what happened to the database, and returns
 * the intents that should follow. It never imports a vendor SDK, never names a
 * vendor, and never learns whether the provider is imperative or declarative.
 *
 * Sequence, unchanged from the original Telnyx implementation:
 *   answer → consent prompt (no recording yet)
 *   press 1 → consent recorded, THEN recording starts, then connect recruiter
 *   press 2 → continue without recording, note the decline on the profile
 *   no input → retry, then end the call politely
 */
export async function handleCallEvent(
  event: CallEvent,
  ctx: FlowContext
): Promise<FlowCommand[]> {
  await ensureSession(event, ctx);

  switch (event.type) {
    case 'call.initiated':
      return onInitiated(event, ctx);
    case 'call.ringing':
      return [];
    case 'call.answered':
      return onAnswered(event);
    case 'machine.detected':
      return onMachineDetected(event);
    case 'digits.received':
      return onDigits(event, ctx);
    case 'agent.connected':
      return onAgentConnected(event);
    case 'recording.ready':
      return onRecordingReady(event, ctx);
    case 'call.ended':
      return onEnded(event);
    default:
      return [];
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function onInitiated(
  event: Extract<CallEvent, { type: 'call.initiated' }>,
  ctx: FlowContext
): Promise<FlowCommand[]> {
  if (event.leg === 'agent') {
    if (event.callId) {
      await callsRepo.attachProviderCallId(event.callId, event.providerCallId, 'agent');
    }
    return [];
  }

  if (event.direction === 'inbound') {
    const candidateId = await candidatesRepo.findActiveIdByPhone(event.from);
    const callId = await callsRepo.createInboundCall({
      candidateId,
      fromNumber: event.from,
      toNumber: event.to,
      provider: ctx.provider,
      providerCallId: event.providerCallId,
    });

    await callSessionsRepo.upsertSession({
      providerCallId: event.providerCallId,
      callId,
      provider: ctx.provider,
      leg: 'inbound',
    });

    return [{ providerCallId: event.providerCallId, intents: [{ type: 'answer' }] }];
  }

  const call = await resolveCall(event);
  if (call) {
    await callsRepo.markRinging(call.id, event.providerCallId);
  }
  return [];
}

async function onAnswered(
  event: Extract<CallEvent, { type: 'call.answered' }>
): Promise<FlowCommand[]> {
  // Agent legs are the provider's business — it bridges them and reports back
  // as 'agent.connected'.
  if (event.leg === 'agent') return [];

  const call = await resolveCall(event);

  // Belt and braces on top of the leg label: consent belongs to the person we
  // rang, so refuse to prompt any leg the call already knows is not theirs.
  // Without this, a mislabelled recruiter leg hears "press 1 to consent" while
  // the candidate listens to silence.
  if (call && !isCandidateLeg(call, event.providerCallId)) {
    console.warn(
      `[voice] refusing consent prompt on non-candidate leg ${event.providerCallId} ` +
        `(call ${call.id} candidate leg is ${call.provider_call_id ?? 'unknown'})`
    );
    return [];
  }

  if (call) {
    await callsRepo.markAwaitingConsent(call.id, event.providerCallId);
  }

  // Always prompt immediately. Waiting for answering-machine detection left
  // real people listening to silence, and iPhone Live Voicemail / Call
  // Screening hung up before anyone heard the prompt — which looked exactly
  // like "the call goes straight to voicemail".
  return startConsentPrompt(event.providerCallId);
}

async function onMachineDetected(
  event: Extract<CallEvent, { type: 'machine.detected' }>
): Promise<FlowCommand[]> {
  if (event.leg === 'agent') return [];

  if (event.result === 'fax') {
    return endAsAnsweringMachine(event);
  }

  // Confirmed beep. Default off: false positives (especially Live Voicemail)
  // were killing calls a human had already answered.
  if (event.result === 'beep') {
    return shouldHangupOnBeep() ? endAsAnsweringMachine(event) : [];
  }

  // Call screening tone — identify the caller so the person can pick up.
  if (event.result === 'screening') {
    return [
      { providerCallId: event.providerCallId, intents: [{ type: 'say', text: screeningIdentification() }] },
    ];
  }

  if (event.result === 'greeting_ended') {
    const prompt = await startConsentPrompt(event.providerCallId);
    return [
      {
        providerCallId: event.providerCallId,
        intents: [
          { type: 'say', text: screeningIdentification() },
          ...(prompt[0]?.intents ?? []),
        ],
      },
    ];
  }

  // human / machine / unknown: if the prompt somehow never started, start it.
  return startConsentPrompt(event.providerCallId);
}

async function onDigits(
  event: Extract<CallEvent, { type: 'digits.received' }>,
  ctx: FlowContext
): Promise<FlowCommand[]> {
  if (await isLegEnded(event.providerCallId)) return [];

  const call = await resolveCall(event);
  const digits = event.digits.trim();

  if (digits === '1') {
    return onConsentGranted(event, call, ctx);
  }
  if (digits === '2') {
    return onConsentDeclined(event, call, ctx);
  }
  return onNoConsentInput(event, call);
}

async function onConsentGranted(
  event: Extract<CallEvent, { type: 'digits.received' }>,
  call: CallRecord | null,
  ctx: FlowContext
): Promise<FlowCommand[]> {
  // Consent is written to the database before recording begins, never after.
  if (call) {
    await callsRepo.recordConsent(call.id, { confirmed: true, method: 'dtmf_1' });
  }
  if (call?.candidate_id) {
    await candidatesRepo.setRecordingConsent(call.candidate_id, { declined: false, note: null });
  }

  const intents: CallIntent[] = [];
  if (isRecordingEnabled() && ctx.capabilities.recording !== 'none') {
    intents.push({ type: 'startRecording' });
    if (call) {
      await callsRepo.markRecordingStarted(call.id);
    }
  }
  intents.push(...(await continueAfterConsent(event, call, ctx, CONSENT_MESSAGES.granted)));

  return [{ providerCallId: event.providerCallId, intents }];
}

async function onConsentDeclined(
  event: Extract<CallEvent, { type: 'digits.received' }>,
  call: CallRecord | null,
  ctx: FlowContext
): Promise<FlowCommand[]> {
  // Declining recording continues the call — it does not end it.
  if (call) {
    await callsRepo.recordConsent(call.id, {
      confirmed: false,
      method: 'dtmf_2_no_recording',
    });
  }
  if (call?.candidate_id) {
    await candidatesRepo.setRecordingConsent(call.candidate_id, {
      declined: true,
      note: RECORDING_DECLINED_NOTE,
    });
  }

  return [
    {
      providerCallId: event.providerCallId,
      intents: await continueAfterConsent(event, call, ctx, CONSENT_MESSAGES.declined),
    },
  ];
}

async function onNoConsentInput(
  event: Extract<CallEvent, { type: 'digits.received' }>,
  call: CallRecord | null
): Promise<FlowCommand[]> {
  const { maxRetries } = getConsentSettings();
  const retries = Number(call?.consent_retries || 0);

  if (retries < maxRetries) {
    if (call) {
      await callsRepo.incrementConsentRetries(call.id);
    }
    // The previous prompt has finished, so a fresh one is allowed. Leaving the
    // claim in place caused silent retries that looked like a dead call.
    await callSessionsRepo.releaseSessionFlag(event.providerCallId, 'consentPromptPlayed');
    return startConsentPrompt(event.providerCallId);
  }

  if (call) {
    await callsRepo.markNoConsent(call.id);
  }
  return [
    {
      providerCallId: event.providerCallId,
      intents: [
        { type: 'say', text: SCRIPT_NO_INPUT },
        { type: 'hangup', afterMs: 3000 },
      ],
    },
  ];
}

async function onAgentConnected(
  event: Extract<CallEvent, { type: 'agent.connected' }>
): Promise<FlowCommand[]> {
  const call = await resolveCall(event);
  if (call) {
    await callsRepo.markInProgress(call.id);
  }
  return [];
}

async function onRecordingReady(
  event: Extract<CallEvent, { type: 'recording.ready' }>,
  ctx: FlowContext
): Promise<FlowCommand[]> {
  const call = await resolveCall(event);
  if (!call) return [];

  await callsRepo.attachRecording(call.id, event.recordingUrl, event.recordingId);

  try {
    await getCallProcessingQueue().add('process-call', {
      callId: call.id,
      recordingUrl: event.recordingUrl,
      candidateId: call.candidate_id,
      providerRecordingId: event.recordingId,
      provider: ctx.provider,
    });
  } catch (queueErr) {
    console.error('[voice] Failed to enqueue call processing job:', queueErr);
  }

  return [];
}

async function onEnded(
  event: Extract<CallEvent, { type: 'call.ended' }>
): Promise<FlowCommand[]> {
  const call = await resolveCall(event);

  await callSessionsRepo.markLegsEnded(
    [event.providerCallId, call?.provider_call_id, call?.agent_provider_call_id].filter(
      (id): id is string => Boolean(id)
    )
  );

  const commands: FlowCommand[] = [];

  // If the recruiter's leg drops, never leave the candidate on an open line.
  if (event.leg === 'agent' && call?.provider_call_id) {
    commands.push({ providerCallId: call.provider_call_id, intents: [{ type: 'hangup' }] });
  }

  if (!call) return commands;

  // A far-end hangup after auto-answer with no keypress usually means the
  // handset never rang: iPhone Silence Unknown Callers, Live Voicemail or
  // carrier spam filtering answered on the candidate's behalf.
  let cause = event.cause;
  if (
    event.leg !== 'agent' &&
    !call.consent_method &&
    call.started_at &&
    (cause === 'normal_clearing' || cause === 'remote_hangup')
  ) {
    cause = 'screened_no_ring';
  }

  await callsRepo.markCompleted(call.id, {
    cause,
    durationSeconds: event.durationSeconds,
  });

  console.log(
    `[voice] hangup call_id=${call.id} cause=${cause} raw=${event.cause} leg=${event.leg}`
  );

  return commands;
}

// ── Shared pieces ─────────────────────────────────────────────────────────────

/**
 * Guarantee a session row exists before anything tries to claim against it.
 *
 * A provider can deliver its first webhook before the dial that caused it has
 * finished writing the row. Without a row, the consent prompt's atomic claim
 * would update zero rows, read as "already played", and the candidate would
 * answer to silence.
 *
 * The insert is `ON CONFLICT DO NOTHING` because `event.leg` may be a guess:
 * an adapter that cannot identify a leg falls back to assuming "candidate".
 * Writing that guess with an upsert used to overwrite the real leg recorded by
 * the agent dial, which relabelled the recruiter's leg as the candidate's and
 * played the consent IVR down it. Losing this race must be harmless.
 */
async function ensureSession(event: CallEvent, ctx: FlowContext): Promise<void> {
  await callSessionsRepo.insertSessionIfAbsent({
    providerCallId: event.providerCallId,
    callId: event.callId,
    provider: ctx.provider,
    leg: event.leg,
  });

  // The row may predate our knowing which call it belongs to.
  if (event.callId) {
    await callSessionsRepo.attachSessionCallId(event.providerCallId, event.callId);
  }
}

/**
 * Play the consent prompt at most once per leg. The claim is atomic in the
 * database, so duplicate webhook deliveries cannot double-play it.
 */
async function startConsentPrompt(providerCallId: string): Promise<FlowCommand[]> {
  if (await isLegEnded(providerCallId)) return [];

  const claimed = await callSessionsRepo.claimSessionFlag(providerCallId, 'consentPromptPlayed');
  if (!claimed) return [];

  const { timeoutSeconds } = getConsentSettings();
  return [
    {
      providerCallId,
      intents: [
        {
          type: 'gatherDigits',
          text: consentAnnouncement(),
          validDigits: '12',
          maxDigits: 1,
          timeoutSeconds,
        },
      ],
    },
  ];
}

/** After consent is decided: wrap up an inbound call, or bring the recruiter on. */
async function continueAfterConsent(
  event: CallEvent,
  call: CallRecord | null,
  ctx: FlowContext,
  messages: { inbound: string; connecting: string }
): Promise<CallIntent[]> {
  if (event.leg === 'inbound') {
    return [
      { type: 'say', text: messages.inbound },
      { type: 'hangup', afterMs: 4000 },
    ];
  }

  const endpoint = getAgentEndpoint();
  if (!endpoint || !supportsAgentEndpoint(ctx.capabilities, endpoint)) {
    return [
      { type: 'say', text: SCRIPT_NO_AGENT_CONFIGURED },
      { type: 'hangup', afterMs: 3000 },
    ];
  }

  // A redelivered consent webhook must not dial the recruiter twice.
  const claimed = await callSessionsRepo.claimSessionFlag(
    event.providerCallId,
    'agentDialStarted'
  );
  if (!claimed) return [];

  return [
    { type: 'say', text: messages.connecting },
    {
      type: 'connectToAgent',
      endpoint,
      callerId: getCallerId() || call?.from_number || '',
    },
  ];
}

async function endAsAnsweringMachine(event: CallEvent): Promise<FlowCommand[]> {
  const call = await resolveCall(event);
  if (call) {
    await callsRepo.markAnsweringMachine(call.id);
  }
  return [{ providerCallId: event.providerCallId, intents: [{ type: 'hangup' }] }];
}

/**
 * Is this leg the one we rang (or that rang us)?
 *
 * Unknown means "not yet recorded", which is normal for the first webhook of a
 * call and must not be read as a mismatch. A leg already filed as the agent's
 * is never the candidate's.
 */
function isCandidateLeg(call: CallRecord, providerCallId: string): boolean {
  if (call.agent_provider_call_id === providerCallId) return false;
  if (!call.provider_call_id) return true;
  return call.provider_call_id === providerCallId;
}

async function resolveCall(event: CallEvent): Promise<CallRecord | null> {
  if (event.callId) {
    const byId = await callsRepo.findCallById(event.callId);
    if (byId) return byId;
  }
  return callsRepo.findCallByProviderCallId(event.providerCallId);
}

async function isLegEnded(providerCallId: string): Promise<boolean> {
  const session = await callSessionsRepo.getSession(providerCallId);
  return session?.state?.ended === true;
}
