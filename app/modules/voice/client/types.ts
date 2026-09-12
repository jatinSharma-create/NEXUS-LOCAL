/**
 * Browser-side voice contract.
 *
 * Vendors differ sharply here — Telnyx exposes `TelnyxRTC` with a login token,
 * Twilio exposes `Device` with a JWT access token — so the UI is given this
 * instead, and never imports a vendor SDK.
 */

export type VoiceClientCredentials = {
  provider: string;
  token: string;
  identity?: string | null;
  agentEndpoint?: string | null;
};

export type VoiceClientHandlers = {
  /** The client is registered and able to take the recruiter's leg. */
  onReady: () => void;
  /** Two-way audio is up. */
  onCallActive: () => void;
  /** The recruiter's leg finished. */
  onCallEnded: () => void;
  onError: (message: string) => void;
};

export interface BrowserVoiceClient {
  readonly provider: string;
  connect(options: {
    credentials: VoiceClientCredentials;
    remoteAudio: HTMLAudioElement | null;
    handlers: VoiceClientHandlers;
  }): Promise<void>;
  /** Drop the recruiter's leg, if one is up. */
  hangup(): void;
  /** Tear the client down entirely. */
  disconnect(): void;
}
