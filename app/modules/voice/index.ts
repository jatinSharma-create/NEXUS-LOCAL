import { callsRepo } from '@/modules/data';
import { assertConsentCapable, describeCapabilities } from './core/capabilities';
import {
  getAgentEndpoint,
  getCallerId,
  isCallerIdConfigured,
  isRecordingEnabled,
} from './core/config';
import type { RecordingRef } from './core/ports';
import { getVoiceProvider } from './registry';

/**
 * Voice module — the only place in the system that knows a telephony vendor
 * exists.
 *
 * Everything else imports from `@/modules/voice` and speaks in calls, consent
 * and recordings. Vendor SDKs, credentials and payload shapes stay inside
 * `providers/`.
 */

// ── Use cases ─────────────────────────────────────────────────────────────────

/**
 * Place an outbound call: record our intent to call, ask the provider to dial,
 * then remember which provider-side call belongs to which row.
 */
export async function startOutboundCall(input: {
  candidateId: string | null;
  to: string;
}): Promise<{ callId: string; providerCallId: string; from: string; provider: string }> {
  const provider = getVoiceProvider();
  assertConsentCapable(provider.name, provider.capabilities);

  const from = getCallerId();
  const callId = await callsRepo.createOutboundCall({
    candidateId: input.candidateId,
    fromNumber: from,
    toNumber: input.to,
    provider: provider.name,
  });

  const { providerCallId } = await provider.startCall({ to: input.to, from, callId });
  await callsRepo.attachProviderCallId(callId, providerCallId, 'candidate');

  return { callId, providerCallId, from, provider: provider.name };
}

/**
 * End a call from the recruiter's side.
 *
 * Hanging up in the browser alone often leaves the candidate's phone leg live,
 * so the provider is told explicitly.
 */
export async function endCall(callId: string): Promise<{ found: boolean }> {
  const call = await callsRepo.findCallLegs(callId);
  if (!call) return { found: false };

  if (call.provider_call_id) {
    try {
      await getVoiceProvider(call.provider ?? undefined).hangup(call.provider_call_id);
    } catch (err) {
      // Already hung up, or racing a remote hangup — still close the row.
      console.warn('[voice] provider hangup (non-fatal):', err);
    }
  }

  await callsRepo.markCompleted(callId, {
    cause: 'recruiter_hangup',
    keepExistingDuration: true,
  });

  return { found: true };
}

/** Credentials for the recruiter's browser leg. */
export async function createClientCredentials() {
  const provider = getVoiceProvider();
  if (!provider.capabilities.browserClient) {
    return { provider: provider.name, supported: false as const };
  }
  const credentials = await provider.createClientCredentials();
  return { provider: provider.name, supported: true as const, ...credentials };
}

/** Turn a stored recording reference into something the worker can download. */
export function resolveRecording(providerName: string | null, ref: RecordingRef) {
  return getVoiceProvider(providerName ?? undefined).resolveRecording(ref);
}

/** Everything /api/health/calling needs, without naming a vendor. */
export function getCallingConfigReport() {
  const provider = getVoiceProvider();
  const providerCheck = provider.checkConfig();
  const agentEndpoint = getAgentEndpoint();

  const shared: Record<string, boolean> = {
    VOICE_CALLER_ID: isCallerIdConfigured(),
    VOICE_AGENT_ENDPOINT: agentEndpoint !== null,
    RECORDING_ENABLED: isRecordingEnabled(),
  };

  const missing = [...providerCheck.missing];
  if (!shared.VOICE_CALLER_ID) missing.push('VOICE_CALLER_ID');
  if (!shared.VOICE_AGENT_ENDPOINT) missing.push('VOICE_AGENT_ENDPOINT');

  return {
    provider: provider.name,
    dispatch: provider.dispatch,
    capabilities: provider.capabilities,
    limitations: describeCapabilities(provider.capabilities),
    agentEndpointKind: agentEndpoint?.kind ?? null,
    callerId: getCallerId() || null,
    required: { ...shared, ...providerCheck.checked },
    missing,
    providerReady:
      providerCheck.ready && shared.VOICE_CALLER_ID && shared.VOICE_AGENT_ENDPOINT,
  };
}

export { getVoiceProvider, availableVoiceProviders } from './registry';
export { handleVoiceWebhook } from './webhook';
export {
  getPublicAppUrl,
  getWebhookUrl,
  getVoiceProviderName,
  getAgentEndpoint,
  getCallerId,
} from './core/config';
export type { Capabilities } from './core/capabilities';
export type { AgentEndpoint, CallEvent, CallIntent, FlowCommand } from './core/domain';
export type { VoiceProvider, RecordingRef } from './core/ports';
