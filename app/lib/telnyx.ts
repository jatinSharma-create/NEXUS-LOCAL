import { createPublicKey, verify } from 'crypto';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY || '';
const TELNYX_PUBLIC_KEY = process.env.TELNYX_PUBLIC_KEY || '';
const API_BASE = 'https://api.telnyx.com/v2';

async function telnyxFetch(path: string, options: RequestInit = {}) {
  if (!TELNYX_API_KEY) {
    throw new Error('TELNYX_API_KEY is not configured');
  }

  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${TELNYX_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Telnyx API Error (${response.status}) [${path}]:`, errorBody);

    let detail = `${response.status} ${response.statusText}`;
    try {
      const parsed = JSON.parse(errorBody) as {
        errors?: Array<{ code?: string; detail?: string; title?: string }>;
        telnyx_error?: { error_code?: string };
      };
      const first = parsed.errors?.[0];
      const code = parsed.telnyx_error?.error_code || first?.code;
      const msg = first?.detail || first?.title;
      if (code === 'D13' || (typeof msg === 'string' && msg.includes('whitelisted'))) {
        throw new Error(
          'India (and other non-US/CA destinations) are blocked on your Telnyx Outbound Voice Profile (error D13). In Mission Control → Outbound Voice Profiles, add India (IN) / Asia to whitelisted destinations. Level 2 verification may be required.'
        );
      }
      if (msg) detail = code ? `${code}: ${msg}` : msg;
    } catch (err) {
      if (err instanceof Error && err.message.includes('Outbound Voice Profile')) throw err;
    }

    throw new Error(`Telnyx API Error: ${detail}`);
  }

  if (response.status === 204) {
    return undefined;
  }

  // Token endpoint may return a bare JWT string (starts with "eyJ...") instead of JSON.
  const text = (await response.text()).trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function generateWebrtcToken(telephonyCredentialId: string) {
  const res = await telnyxFetch(`/telephony_credentials/${telephonyCredentialId}/token`, {
    method: 'POST',
  });
  // Telnyx may return a bare token string or { data: token }
  const token = typeof res === 'string' ? res : res?.data ?? res?.token ?? res;
  if (!token || typeof token !== 'string') {
    throw new Error('Telnyx did not return a WebRTC token string');
  }
  return token.replace(/^"|"$/g, '');
}

/** Public HTTPS base (ngrok locally). Required so Telnyx can deliver call webhooks. */
export function getPublicAppUrl(): string {
  const raw = (process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
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

export function getTelnyxWebhookUrl(): string {
  return `${getPublicAppUrl()}/api/webhooks/telnyx`;
}

/**
 * Outbound Call Control dial — payload aligned with the known-good NEXUS repo
 * (connection_id / to / from / client_state only).
 *
 * Optional extras (off unless env opts in):
 * - PER_CALL_WEBHOOK=true → send webhook_url (useful if Mission Control has a stale ngrok URL)
 * - AMD_ENABLED=true → answering_machine_detection (historically broke live answers)
 */
export async function dial(
  destinationNumber: string,
  callerId: string,
  clientState: string,
  opts?: { answeringMachineDetection?: boolean }
) {
  const connectionId = process.env.TELNYX_CALL_CONTROL_APP_ID;
  if (!connectionId) {
    throw new Error('TELNYX_CALL_CONTROL_APP_ID is not configured');
  }

  const isSip = destinationNumber.toLowerCase().startsWith('sip:');
  const useAmd =
    opts?.answeringMachineDetection ??
    (!isSip && process.env.AMD_ENABLED === 'true');
  const usePerCallWebhook = process.env.PER_CALL_WEBHOOK === 'true';
  const webhookUrl = usePerCallWebhook ? getTelnyxWebhookUrl() : null;

  console.log(
    `[telnyx] dial to=${destinationNumber} from=${callerId} webhook=${webhookUrl || 'mission-control'} amd=${useAmd}`
  );

  return telnyxFetch('/calls', {
    method: 'POST',
    body: JSON.stringify({
      connection_id: connectionId,
      to: destinationNumber,
      from: callerId,
      client_state: Buffer.from(clientState).toString('base64'),
      ...(webhookUrl
        ? { webhook_url: webhookUrl, webhook_url_method: 'POST' }
        : {}),
      ...(useAmd
        ? {
            answering_machine_detection:
              process.env.AMD_MODE || 'premium_ios_call_screening_detection',
          }
        : {}),
    }),
  });
}

export async function answerCall(callControlId: string, clientState?: string) {
  return telnyxFetch(`/calls/${callControlId}/actions/answer`, {
    method: 'POST',
    body: JSON.stringify({
      ...(clientState
        ? { client_state: Buffer.from(clientState).toString('base64') }
        : {}),
    }),
  });
}

export async function speakText(
  callControlId: string,
  text: string,
  voice = 'Polly.Matthew-Neural',
  clientState?: string
) {
  return telnyxFetch(`/calls/${callControlId}/actions/speak`, {
    method: 'POST',
    body: JSON.stringify({
      payload: text,
      voice,
      language: 'en-US',
      ...(clientState
        ? { client_state: Buffer.from(clientState).toString('base64') }
        : {}),
    }),
  });
}

/** Stops TTS/playback so a subsequent bridge is not rejected while audio is active. */
export async function stopPlayback(callControlId: string) {
  return telnyxFetch(`/calls/${callControlId}/actions/playback_stop`, {
    method: 'POST',
    body: JSON.stringify({ stop: 'all' }),
  });
}

/** timeoutSecs: Telnyx gather timeout is in seconds (1–120). */
export async function gatherUsingSpeak(
  callControlId: string,
  text: string,
  voice = 'Polly.Matthew-Neural',
  timeoutSecs = 10,
  maxDigits = 1
) {
  return telnyxFetch(`/calls/${callControlId}/actions/gather_using_speak`, {
    method: 'POST',
    body: JSON.stringify({
      payload: text,
      voice,
      language: 'en-US',
      valid_digits: '12',
      maximum_digits: maxDigits,
      timeout_millis: Math.min(Math.max(timeoutSecs, 1), 120) * 1000,
    }),
  });
}

export async function startRecording(callControlId: string) {
  return telnyxFetch(`/calls/${callControlId}/actions/record_start`, {
    method: 'POST',
    body: JSON.stringify({
      format: 'mp3',
      channels: 'dual',
    }),
  });
}

export async function stopRecording(callControlId: string) {
  return telnyxFetch(`/calls/${callControlId}/actions/record_stop`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function hangupCall(callControlId: string) {
  return telnyxFetch(`/calls/${callControlId}/actions/hangup`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function bridgeCalls(callControlId: string, bridgeToCallControlId: string, clientState?: string) {
  return telnyxFetch(`/calls/${callControlId}/actions/bridge`, {
    method: 'POST',
    body: JSON.stringify({
      call_control_id: bridgeToCallControlId,
      ...(clientState
        ? { client_state: Buffer.from(clientState).toString('base64') }
        : {}),
    }),
  });
}

/**
 * Telnyx signs webhooks with Ed25519.
 * Signed message = `${timestamp}|${rawBody}`
 * Public key is usually a base64-encoded 32-byte raw Ed25519 key from Mission Control.
 */
export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  timestampHeader: string
): boolean {
  if (!TELNYX_PUBLIC_KEY) {
    // Dev bypass when key not configured yet
    return true;
  }

  try {
    const signature = Buffer.from(signatureHeader, 'base64');
    const signedPayload = Buffer.from(`${timestampHeader}|${payload}`);

    let keyObject;
    if (TELNYX_PUBLIC_KEY.includes('BEGIN PUBLIC KEY')) {
      keyObject = createPublicKey(TELNYX_PUBLIC_KEY);
    } else {
      // Telnyx Mission Control gives a base64 raw 32-byte Ed25519 public key.
      // Wrap into SPKI DER so Node's typed createPublicKey accepts it.
      const rawKey = Buffer.from(TELNYX_PUBLIC_KEY, 'base64');
      const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
      keyObject = createPublicKey({
        key: Buffer.concat([spkiPrefix, rawKey]),
        format: 'der',
        type: 'spki',
      });
    }

    return verify(null, signedPayload, keyObject, signature);
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return false;
  }
}
