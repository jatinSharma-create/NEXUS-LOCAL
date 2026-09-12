import { NotSupportedError } from '@/modules/shared/errors';
import type { AgentEndpoint } from './domain';

export type AgentEndpointKind = AgentEndpoint['kind'];

/**
 * What a provider can actually do.
 *
 * Two providers is a coincidence; N providers is a spectrum. Declaring
 * capabilities lets shared code degrade deliberately instead of discovering a
 * gap halfway through a live call.
 */
export type Capabilities = {
  outboundPstn: boolean;
  inboundPstn: boolean;
  /** Text-to-speech. Without it, prompts must be pre-rendered audio. */
  tts: boolean;
  /** Keypad collection. Consent depends on this — see assertConsentCapable. */
  dtmfGather: boolean;
  recording: 'none' | 'mono' | 'dual';
  agentEndpoints: AgentEndpointKind[];
  /** Offers a browser SDK for the recruiter's audio. */
  browserClient: boolean;
  webhookSignatures: boolean;
  answeringMachineDetection: boolean;
};

/**
 * Recording consent is collected by keypress and is legally load-bearing, so a
 * provider that cannot collect digits is refused outright rather than
 * silently degraded.
 */
export function assertConsentCapable(provider: string, capabilities: Capabilities): void {
  if (!capabilities.dtmfGather) {
    throw new NotSupportedError(provider, 'DTMF collection, which the consent IVR requires');
  }
}

export function supportsAgentEndpoint(
  capabilities: Capabilities,
  endpoint: AgentEndpoint
): boolean {
  return capabilities.agentEndpoints.includes(endpoint.kind);
}

export function describeCapabilities(capabilities: Capabilities): string[] {
  const notes: string[] = [];
  if (!capabilities.tts) notes.push('No text-to-speech — prompts must be pre-rendered audio.');
  if (capabilities.recording === 'none') notes.push('No call recording — transcripts unavailable.');
  if (capabilities.recording === 'mono') notes.push('Mono recording only — reduced transcript quality.');
  if (!capabilities.browserClient) {
    notes.push('No browser calling — the recruiter leg must be a SIP URI or phone number.');
  }
  if (!capabilities.webhookSignatures) notes.push('Webhooks are unsigned — restrict access by network.');
  if (!capabilities.answeringMachineDetection) notes.push('No answering-machine detection.');
  return notes;
}
