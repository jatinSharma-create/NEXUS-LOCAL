import type { AgentEndpoint } from './domain';

/**
 * Configuration that belongs to the *app*, not to any vendor: where webhooks
 * land, what the consent prompt says, whether we record.
 *
 * Vendor credentials are read inside each adapter and nowhere else.
 */

/** Neutral names win; the original Telnyx names still work so existing .env files keep running. */
function env(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return '';
}

export function getVoiceProviderName(): string {
  return (process.env.VOICE_PROVIDER || 'telnyx').toLowerCase();
}

/** Public HTTPS base (ngrok locally). Required so the carrier can deliver call webhooks. */
export function getPublicAppUrl(): string {
  const raw = env('PUBLIC_APP_URL').replace(/\/$/, '');
  if (!raw || raw.includes('xxxx.ngrok') || raw.includes('localhost')) {
    throw new Error(
      'PUBLIC_APP_URL must be a public HTTPS URL (e.g. your ngrok URL). Start ngrok with: ngrok http 80'
    );
  }
  if (!raw.startsWith('https://')) {
    throw new Error('PUBLIC_APP_URL must start with https://');
  }
  return raw;
}

export function getWebhookUrl(provider: string): string {
  return `${getPublicAppUrl()}/api/webhooks/voice/${provider}`;
}

/** Caller ID shown to the candidate. */
export function getCallerId(): string {
  return env('VOICE_CALLER_ID', 'TELNYX_CALLER_ID');
}

export function isCallerIdConfigured(): boolean {
  const callerId = getCallerId();
  return Boolean(callerId) && !callerId.includes('XXXXXXXX');
}

/**
 * Where the recruiter's audio lives, expressed in a way any provider can read.
 * `sip:` and `client:` prefixes are explicit; anything else is treated as PSTN.
 */
export function getAgentEndpoint(): AgentEndpoint | null {
  const raw = env('VOICE_AGENT_ENDPOINT', 'TELNYX_SIP_URI');
  if (!raw || raw.includes('your_sip_username')) return null;

  const lower = raw.toLowerCase();
  if (lower.startsWith('sip:')) return { kind: 'sip', uri: raw };
  if (lower.startsWith('client:')) return { kind: 'client', identity: raw.slice(7) };
  return { kind: 'pstn', number: raw };
}

export function isRecordingEnabled(): boolean {
  return process.env.RECORDING_ENABLED === 'true';
}

export function getCompanyName(): string {
  return process.env.NEXUS_COMPANY_NAME || 'Nexus Recruiting';
}

export function getConsentSettings() {
  return {
    timeoutSeconds: parseInt(process.env.CONSENT_GATHER_TIMEOUT_SECS || '10', 10),
    maxRetries: parseInt(process.env.CONSENT_MAX_RETRIES || '2', 10),
  };
}

/** Hang up after a confirmed voicemail beep. Off by default — false positives killed live calls. */
export function shouldHangupOnBeep(): boolean {
  return process.env.AMD_HANGUP_ON_BEEP === 'true';
}

export function isAmdEnabled(): boolean {
  return process.env.AMD_ENABLED === 'true';
}
