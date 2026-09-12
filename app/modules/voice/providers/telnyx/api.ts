const API_BASE = 'https://api.telnyx.com/v2';

function apiKey(): string {
  const key = process.env.TELNYX_API_KEY || '';
  if (!key) {
    throw new Error('TELNYX_API_KEY is not configured');
  }
  return key;
}

export async function telnyxFetch(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
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

  // The token endpoint may return a bare JWT string instead of JSON.
  const text = (await response.text()).trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function generateWebrtcToken(telephonyCredentialId: string): Promise<string> {
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

/**
 * Outbound Call Control dial.
 *
 * Optional extras, off unless the environment opts in:
 * - PER_CALL_WEBHOOK=true → send webhook_url (useful if Mission Control has a stale ngrok URL)
 * - AMD_ENABLED=true → answering_machine_detection (historically broke live answers)
 */
export async function dial(input: {
  to: string;
  from: string;
  webhookUrl: string;
  answeringMachineDetection?: boolean;
}) {
  const connectionId = process.env.TELNYX_CALL_CONTROL_APP_ID;
  if (!connectionId) {
    throw new Error('TELNYX_CALL_CONTROL_APP_ID is not configured');
  }

  const isSip = input.to.toLowerCase().startsWith('sip:');
  const useAmd =
    input.answeringMachineDetection ?? (!isSip && process.env.AMD_ENABLED === 'true');
  const webhookUrl = process.env.PER_CALL_WEBHOOK === 'true' ? input.webhookUrl : null;

  console.log(
    `[telnyx] dial to=${input.to} from=${input.from} webhook=${webhookUrl || 'mission-control'} amd=${useAmd}`
  );

  return telnyxFetch('/calls', {
    method: 'POST',
    body: JSON.stringify({
      connection_id: connectionId,
      to: input.to,
      from: input.from,
      ...(webhookUrl ? { webhook_url: webhookUrl, webhook_url_method: 'POST' } : {}),
      ...(useAmd
        ? {
            answering_machine_detection:
              process.env.AMD_MODE || 'premium_ios_call_screening_detection',
          }
        : {}),
    }),
  });
}

export async function answerCall(callControlId: string) {
  return telnyxFetch(`/calls/${callControlId}/actions/answer`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function speakText(
  callControlId: string,
  text: string,
  voice = process.env.TELNYX_TTS_VOICE || 'Polly.Matthew-Neural'
) {
  return telnyxFetch(`/calls/${callControlId}/actions/speak`, {
    method: 'POST',
    body: JSON.stringify({
      payload: text,
      voice,
      language: 'en-US',
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

/** Telnyx gather timeout is expressed in milliseconds, clamped to 1–120 seconds. */
export async function gatherUsingSpeak(
  callControlId: string,
  text: string,
  opts: { validDigits: string; maxDigits: number; timeoutSeconds: number },
  voice = process.env.TELNYX_TTS_VOICE || 'Polly.Matthew-Neural'
) {
  return telnyxFetch(`/calls/${callControlId}/actions/gather_using_speak`, {
    method: 'POST',
    body: JSON.stringify({
      payload: text,
      voice,
      language: 'en-US',
      valid_digits: opts.validDigits,
      maximum_digits: opts.maxDigits,
      timeout_millis: Math.min(Math.max(opts.timeoutSeconds, 1), 120) * 1000,
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

export async function bridgeCalls(callControlId: string, bridgeToCallControlId: string) {
  return telnyxFetch(`/calls/${callControlId}/actions/bridge`, {
    method: 'POST',
    body: JSON.stringify({ call_control_id: bridgeToCallControlId }),
  });
}

/** Telnyx recordings expose presigned download URLs, fetched without auth headers. */
export async function getRecordingDownloadUrl(recordingId: string): Promise<string | null> {
  const res = await telnyxFetch(`/recordings/${recordingId}`);
  const urls = (res as { data?: { download_urls?: { mp3?: string; wav?: string } } })?.data
    ?.download_urls;
  return urls?.mp3 || urls?.wav || null;
}

export function extractCallControlId(response: unknown): string | null {
  const body = response as
    | { data?: { call_control_id?: string; id?: string }; call_control_id?: string }
    | undefined;
  return body?.data?.call_control_id || body?.data?.id || body?.call_control_id || null;
}
