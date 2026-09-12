import { randomUUID } from 'crypto';
import type { Capabilities } from '../../core/capabilities';
import type { CallEvent, CallIntent } from '../../core/domain';
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

/**
 * An in-memory provider for development and tests.
 *
 * It exists so the whole consent flow can be exercised with no carrier
 * account, no credentials and no public tunnel: set VOICE_PROVIDER=fake, then
 * POST neutral events straight at /api/webhooks/voice/fake, for example
 *   { "type": "call.answered", "providerCallId": "fake-…" }
 *
 * It also doubles as the reference implementation of the port — if a change to
 * the interface cannot be satisfied here, the interface has grown too
 * vendor-specific.
 */
export class FakeVoiceProvider implements VoiceProvider {
  readonly name = 'fake';
  readonly dispatch = 'imperative' as const;

  readonly capabilities: Capabilities = {
    outboundPstn: true,
    inboundPstn: true,
    tts: true,
    dtmfGather: true,
    recording: 'dual',
    agentEndpoints: ['sip', 'client', 'pstn'],
    browserClient: false,
    webhookSignatures: false,
    answeringMachineDetection: false,
  };

  /** Everything the provider was asked to do, so tests can assert on it. */
  readonly log: Array<{ providerCallId: string; intents: CallIntent[] }> = [];

  constructor(private readonly runtime: VoiceRuntime) {}

  async startCall(req: StartCallRequest): Promise<{ providerCallId: string }> {
    const providerCallId = `fake-${randomUUID()}`;
    await this.runtime.sessions.upsert({
      providerCallId,
      callId: req.callId,
      leg: 'candidate',
    });
    console.log(`[fake-voice] startCall to=${req.to} from=${req.from} id=${providerCallId}`);
    return { providerCallId };
  }

  async execute(providerCallId: string, intents: CallIntent[]): Promise<void> {
    this.log.push({ providerCallId, intents });
    for (const intent of intents) {
      console.log(`[fake-voice] ${providerCallId} → ${describeIntent(intent)}`);
      if (intent.type === 'connectToAgent') {
        const session = await this.runtime.sessions.get(providerCallId);
        const agentCallId = `fake-agent-${randomUUID()}`;
        await this.runtime.sessions.upsert({
          providerCallId: agentCallId,
          callId: session?.callId ?? null,
          leg: 'agent',
          bridgeTo: providerCallId,
        });
      }
    }
  }

  async hangup(providerCallId: string): Promise<void> {
    console.log(`[fake-voice] hangup ${providerCallId}`);
  }

  async verifyWebhook(): Promise<boolean> {
    return true;
  }

  /** Accepts neutral events directly — the body is already in our vocabulary. */
  async receiveWebhook(req: InboundWebhook): Promise<CallEvent[]> {
    let body: Partial<CallEvent> & { type?: string; providerCallId?: string };
    try {
      body = JSON.parse(req.rawBody);
    } catch {
      return [];
    }
    if (!body.type || !body.providerCallId) return [];

    // Uses the same shared leg resolution as every other provider, so the fake
    // keeps exercising that policy rather than quietly diverging from it.
    const { session, leg } = await resolveLegSession(this.runtime.sessions, body.providerCallId, {
      originatedByUs: true,
      fallbackLeg: 'candidate',
    });

    return [
      {
        leg,
        callId: session?.callId ?? null,
        raw: {},
        ...body,
      } as CallEvent,
    ];
  }

  async createClientCredentials(): Promise<ClientCredentials> {
    return { token: 'fake-token', identity: 'fake-recruiter' };
  }

  async resolveRecording(ref: RecordingRef): Promise<ResolvedRecording> {
    if (!ref.url) throw new Error('Fake provider has no recording to resolve');
    return { url: ref.url };
  }

  checkConfig(): ConfigCheck {
    return { ready: true, missing: [], checked: { FAKE_PROVIDER: true } };
  }
}

function describeIntent(intent: CallIntent): string {
  switch (intent.type) {
    case 'say':
      return `say("${intent.text}")`;
    case 'gatherDigits':
      return `gatherDigits("${intent.text}", valid=${intent.validDigits})`;
    case 'connectToAgent':
      return `connectToAgent(${intent.endpoint.kind})`;
    case 'hangup':
      return intent.afterMs ? `hangup(after ${intent.afterMs}ms)` : 'hangup()';
    default:
      return `${intent.type}()`;
  }
}
