import type { CallLeg } from '@/modules/data';
import type { Capabilities } from '../../core/capabilities';
import { formatAgentEndpoint, type CallEvent, type CallIntent, type MachineResult } from '../../core/domain';
import { resolveLegSession } from '../../core/legs';
import type {
  ClientCredentials,
  ConfigCheck,
  InboundWebhook,
  RecordingRef,
  ResolvedRecording,
  StartCallRequest,
  VoiceProvider,
  VoiceRuntime,
} from '../../core/ports';
import * as api from './api';
import { verifyTelnyxSignature } from './signature';

type TelnyxEnvelope = {
  data?: { event_type?: string; payload?: Record<string, unknown> };
};

/** Adapter-private state stashed against a leg. */
type TelnyxLegState = {
  /** Intents held back until the current TTS finishes. */
  deferred?: CallIntent[];
};

export class TelnyxVoiceProvider implements VoiceProvider {
  readonly name = 'telnyx';

  /** Telnyx steers a live call with REST commands rather than a returned document. */
  readonly dispatch = 'imperative' as const;

  readonly capabilities: Capabilities = {
    outboundPstn: true,
    inboundPstn: true,
    tts: true,
    dtmfGather: true,
    recording: 'dual',
    agentEndpoints: ['sip', 'pstn'],
    browserClient: true,
    webhookSignatures: true,
    answeringMachineDetection: true,
  };

  constructor(private readonly runtime: VoiceRuntime) {}

  // ── Placing calls ───────────────────────────────────────────────────────────

  async startCall(req: StartCallRequest): Promise<{ providerCallId: string }> {
    const response = await api.dial({
      to: req.to,
      from: req.from,
      webhookUrl: this.runtime.webhookUrl(),
    });

    const providerCallId = api.extractCallControlId(response);
    if (!providerCallId) {
      throw new Error('Telnyx did not return a call_control_id for the outbound call');
    }

    await this.runtime.sessions.upsert({
      providerCallId,
      callId: req.callId,
      leg: 'candidate',
    });

    return { providerCallId };
  }

  // ── Carrying out intents ────────────────────────────────────────────────────

  async execute(providerCallId: string, intents: CallIntent[]): Promise<void> {
    for (let i = 0; i < intents.length; i++) {
      const intent = intents[i];
      const remaining = intents.slice(i + 1);

      switch (intent.type) {
        case 'answer':
          await api.answerCall(providerCallId);
          break;

        case 'say': {
          // Bridging while audio is still playing makes Telnyx reject the
          // bridge (one-way audio / 500). When a connect follows a prompt, hold
          // the rest back and resume on call.speak.ended.
          const mustWait = remaining.some((next) => next.type === 'connectToAgent');
          if (mustWait) {
            await this.patchState(providerCallId, { deferred: remaining });
            await api.speakText(providerCallId, intent.text);
            return;
          }
          await api.speakText(providerCallId, intent.text);
          break;
        }

        case 'gatherDigits':
          await api.gatherUsingSpeak(providerCallId, intent.text, {
            validDigits: intent.validDigits,
            maxDigits: intent.maxDigits,
            timeoutSeconds: intent.timeoutSeconds,
          });
          break;

        case 'startRecording':
          await api.startRecording(providerCallId);
          break;

        case 'stopRecording':
          await api.stopRecording(providerCallId);
          break;

        case 'connectToAgent':
          await this.dialAgent(providerCallId, intent);
          break;

        case 'hangup':
          if (intent.afterMs && intent.afterMs > 0) {
            const delay = intent.afterMs;
            setTimeout(() => {
              void api.hangupCall(providerCallId).catch((err) => {
                console.warn('[telnyx] delayed hangup (non-fatal):', err);
              });
            }, delay);
          } else {
            await api.hangupCall(providerCallId);
          }
          break;
      }
    }
  }

  async hangup(providerCallId: string): Promise<void> {
    await api.hangupCall(providerCallId);
  }

  private async dialAgent(
    candidateCallId: string,
    intent: Extract<CallIntent, { type: 'connectToAgent' }>
  ): Promise<void> {
    const session = await this.runtime.sessions.get(candidateCallId);

    const response = await api.dial({
      to: formatAgentEndpoint(intent.endpoint),
      from: intent.callerId,
      webhookUrl: this.runtime.webhookUrl(),
      answeringMachineDetection: false,
    });

    const agentCallId = api.extractCallControlId(response);
    if (!agentCallId) {
      throw new Error('Telnyx did not return a call_control_id for the agent leg');
    }

    await this.runtime.sessions.upsert({
      providerCallId: agentCallId,
      callId: session?.callId ?? null,
      leg: 'agent',
      bridgeTo: candidateCallId,
    });
  }

  // ── Webhooks ────────────────────────────────────────────────────────────────

  async verifyWebhook(req: InboundWebhook): Promise<boolean> {
    if (!process.env.TELNYX_PUBLIC_KEY) return true;

    const signature = req.headers.get('telnyx-signature-ed25519');
    const timestamp = req.headers.get('telnyx-timestamp');
    if (!signature || !timestamp) return false;

    return verifyTelnyxSignature(req.rawBody, signature, timestamp);
  }

  async receiveWebhook(req: InboundWebhook): Promise<CallEvent[]> {
    let envelope: TelnyxEnvelope;
    try {
      envelope = JSON.parse(req.rawBody) as TelnyxEnvelope;
    } catch {
      return [];
    }

    const eventType = envelope.data?.event_type;
    const payload = envelope.data?.payload ?? {};
    const providerCallId = String(payload.call_control_id || '');
    if (!eventType || !providerCallId) return [];

    const { session, leg } = await resolveLegSession(this.runtime.sessions, providerCallId, {
      originatedByUs: !isInbound(payload),
      fallbackLeg: inferLeg(payload),
    });
    const base = { providerCallId, leg, callId: session?.callId ?? null, raw: payload };

    switch (eventType) {
      case 'call.initiated':
        return [
          {
            ...base,
            leg: isInbound(payload) ? 'inbound' : base.leg,
            type: 'call.initiated',
            direction: isInbound(payload) ? 'inbound' : 'outbound',
            from: String(payload.from || ''),
            to: String(payload.to || ''),
          },
        ];

      case 'call.answered': {
        // The agent leg answering is a Telnyx-internal step: stop leftover TTS
        // on the candidate leg, bridge the two, and report back only once the
        // bridge lands (call.bridged).
        if (leg === 'agent') {
          const bridgeTo = session?.bridgeTo;
          if (bridgeTo) {
            try {
              await api.stopPlayback(bridgeTo);
            } catch (err) {
              // No active playback is fine — continue to bridge.
              console.warn('[telnyx] playback_stop before bridge (non-fatal):', err);
            }
            await api.bridgeCalls(providerCallId, bridgeTo);
          }
          return [];
        }
        return [{ ...base, type: 'call.answered' }];
      }

      case 'call.speak.ended': {
        const deferred = (session?.adapter as TelnyxLegState | undefined)?.deferred;
        if (Array.isArray(deferred) && deferred.length > 0) {
          await this.patchState(providerCallId, { deferred: [] });
          await this.execute(providerCallId, deferred);
        }
        return [];
      }

      case 'call.gather.ended':
        return [
          { ...base, type: 'digits.received', digits: String(payload.digits || '').trim() },
        ];

      case 'call.bridged':
        return [{ ...base, type: 'agent.connected' }];

      case 'call.machine.premium.call_screening.detected':
        return [{ ...base, type: 'machine.detected', result: 'screening' }];

      case 'call.machine.detection.ended':
      case 'call.machine.premium.detection.ended':
        return [
          {
            ...base,
            type: 'machine.detected',
            result: mapDetectionResult(String(payload.result || '')),
          },
        ];

      case 'call.machine.greeting.ended':
      case 'call.machine.premium.greeting.ended':
        return [
          {
            ...base,
            type: 'machine.detected',
            result: mapGreetingResult(String(payload.result || '')),
          },
        ];

      case 'call.recording.saved': {
        const urls = payload.recording_urls as { mp3?: string; wav?: string } | undefined;
        const recordingUrl = urls?.mp3 || urls?.wav;
        if (!recordingUrl) return [];
        return [
          {
            ...base,
            type: 'recording.ready',
            recordingId: payload.recording_id ? String(payload.recording_id) : null,
            recordingUrl,
          },
        ];
      }

      case 'call.hangup':
        return [
          {
            ...base,
            type: 'call.ended',
            cause: String(payload.hangup_cause || payload.sip_hangup_cause || 'remote_hangup'),
            durationSeconds: parseDuration(payload),
          },
        ];

      default:
        return [];
    }
  }

  // ── Browser + recordings + config ───────────────────────────────────────────

  async createClientCredentials(): Promise<ClientCredentials> {
    const credentialId = process.env.TELNYX_TELEPHONY_CREDENTIAL_ID;
    if (!credentialId) {
      throw new Error('TELNYX_TELEPHONY_CREDENTIAL_ID is not configured');
    }
    return { token: await api.generateWebrtcToken(credentialId) };
  }

  async resolveRecording(ref: RecordingRef): Promise<ResolvedRecording> {
    if (ref.recordingId) {
      try {
        const resolved = await api.getRecordingDownloadUrl(ref.recordingId);
        if (resolved) return { url: resolved };
      } catch (err) {
        console.warn(
          `[telnyx] could not resolve recording ${ref.recordingId}; falling back to the webhook URL`,
          err
        );
      }
    }
    if (!ref.url) {
      throw new Error('No recording URL available to download');
    }
    return { url: ref.url };
  }

  checkConfig(): ConfigCheck {
    const checked: Record<string, boolean> = {
      TELNYX_API_KEY: Boolean(process.env.TELNYX_API_KEY),
      TELNYX_CALL_CONTROL_APP_ID: Boolean(process.env.TELNYX_CALL_CONTROL_APP_ID),
      TELNYX_TELEPHONY_CREDENTIAL_ID: Boolean(process.env.TELNYX_TELEPHONY_CREDENTIAL_ID),
      TELNYX_PUBLIC_KEY: Boolean(process.env.TELNYX_PUBLIC_KEY),
    };

    // The public key is a strong recommendation, not a hard requirement.
    const required = [
      'TELNYX_API_KEY',
      'TELNYX_CALL_CONTROL_APP_ID',
      'TELNYX_TELEPHONY_CREDENTIAL_ID',
    ];
    const missing = required.filter((key) => !checked[key]);

    return { ready: missing.length === 0, missing, checked };
  }

  private async patchState(providerCallId: string, patch: TelnyxLegState): Promise<void> {
    await this.runtime.sessions.patchAdapterState(providerCallId, patch);
  }
}

// ── Payload helpers ───────────────────────────────────────────────────────────

/** Telnyx says "incoming"/"outgoing"; some payloads say "inbound"/"outbound". */
function isInbound(payload: Record<string, unknown>): boolean {
  const direction = String(payload.direction || '').toLowerCase();
  return direction === 'incoming' || direction === 'inbound';
}

function inferLeg(payload: Record<string, unknown>): CallLeg {
  return isInbound(payload) ? 'inbound' : 'candidate';
}

function mapDetectionResult(result: string): MachineResult {
  const value = result.toLowerCase();
  if (value === 'fax_detected') return 'fax';
  if (value === 'human') return 'human';
  if (value === 'machine') return 'machine';
  return 'unknown';
}

function mapGreetingResult(result: string): MachineResult {
  const value = result.toLowerCase();
  if (value === 'prompt_ended') return 'greeting_ended';
  if (value.includes('beep')) return 'beep';
  return 'unknown';
}

function parseDuration(payload: Record<string, unknown>): number | null {
  const raw = payload.duration_seconds ?? payload.call_duration_secs;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string') {
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
