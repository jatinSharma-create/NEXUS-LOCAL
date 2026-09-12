import type { NamedProvider } from '@/modules/shared/registry';
import type { CallLeg } from '@/modules/data';
import type { Capabilities } from './capabilities';
import type { CallEvent, CallIntent } from './domain';

/** A webhook request, already read into memory so signatures can be verified. */
export type InboundWebhook = {
  method: string;
  url: string;
  headers: Headers;
  rawBody: string;
};

export type StartCallRequest = {
  to: string;
  from: string;
  /** Our own call id. Adapters must be able to get back to it from an event. */
  callId: string;
};

export type ClientCredentials = {
  token: string;
  identity?: string | null;
  /** Where the browser should place its leg, when the provider needs it. */
  agentEndpoint?: string | null;
  expiresAt?: string | null;
};

export type RecordingRef = {
  recordingId?: string | null;
  url?: string | null;
};

export type ResolvedRecording = {
  url: string;
  headers?: Record<string, string>;
};

export type ConfigCheck = {
  ready: boolean;
  /** Env var names the provider needs but cannot find. */
  missing: string[];
  /** Everything the provider checked, for the health endpoint to display. */
  checked: Record<string, boolean>;
};

/** One leg of a call, as adapters see it. */
export type LegSession = {
  callId: string | null;
  leg: CallLeg;
  ended: boolean;
  /**
   * The leg this one exists in order to be joined to, if any.
   *
   * First-class rather than adapter scratch because every provider that can
   * bring a second party onto a call needs it, and because a leg holding a
   * bridge target is provably not the candidate's — a fact shared code relies
   * on to refuse asking the wrong person for recording consent.
   */
  bridgeTo: string | null;
  /** Private scratch space owned by the adapter. */
  adapter: Record<string, unknown>;
};

/**
 * Per-leg state the adapter can rely on. Backed by Postgres, but adapters only
 * see this interface so they never import the data module.
 */
export interface VoiceSessionStore {
  get(providerCallId: string): Promise<LegSession | null>;
  upsert(input: {
    providerCallId: string;
    callId: string | null;
    leg: CallLeg;
    bridgeTo?: string;
    adapter?: Record<string, unknown>;
  }): Promise<void>;
  patchAdapterState(providerCallId: string, patch: Record<string, unknown>): Promise<void>;
}

/** Everything an adapter is handed at construction time. */
export type VoiceRuntime = {
  sessions: VoiceSessionStore;
  /** Public HTTPS URL this provider should deliver webhooks to. */
  webhookUrl: () => string;
};

/**
 * The contract every telephony vendor implements.
 *
 * Derived from what Nexus needs — dial a candidate, collect consent, record,
 * connect the recruiter, fetch the audio — rather than from the union of any
 * two vendors' SDKs. That is what keeps a third and fourth vendor viable.
 */
export interface VoiceProvider extends NamedProvider {
  readonly capabilities: Capabilities;

  /**
   * 'imperative' — commands are sent to a live call (Telnyx, Vonage).
   * 'response'   — commands are rendered into the webhook reply (Twilio TwiML).
   */
  readonly dispatch: 'imperative' | 'response';

  startCall(req: StartCallRequest): Promise<{ providerCallId: string }>;

  /** Carry out intents on a live call. Used by 'imperative' providers. */
  execute(providerCallId: string, intents: CallIntent[]): Promise<void>;

  /** Render intents into a webhook reply. Required for 'response' providers. */
  renderWebhookResponse?(intents: CallIntent[]): Response;

  hangup(providerCallId: string): Promise<void>;

  verifyWebhook(req: InboundWebhook): Promise<boolean>;

  /**
   * Translate a vendor webhook into neutral events.
   *
   * Adapters may perform provider-internal sequencing here — bridging two legs,
   * resuming playback-deferred work — and return only the events that shared
   * code should react to.
   */
  receiveWebhook(req: InboundWebhook): Promise<CallEvent[]>;

  createClientCredentials(): Promise<ClientCredentials>;

  resolveRecording(ref: RecordingRef): Promise<ResolvedRecording>;

  checkConfig(): ConfigCheck;
}

export type VoiceProviderFactory = (runtime: VoiceRuntime) => VoiceProvider;
