import type { BrowserVoiceClient, VoiceClientHandlers } from '../../client/types';

/**
 * Stand-in browser client for providers without a WebRTC SDK, and for local
 * development. Reports ready immediately so the dialer is usable; the
 * recruiter's audio is expected to arrive on a real phone instead.
 */
export class FakeBrowserVoiceClient implements BrowserVoiceClient {
  readonly provider = 'fake';
  private handlers: VoiceClientHandlers | null = null;

  async connect(options: { handlers: VoiceClientHandlers }): Promise<void> {
    this.handlers = options.handlers;
    options.handlers.onReady();
  }

  hangup(): void {
    this.handlers?.onCallEnded();
  }

  disconnect(): void {
    this.handlers = null;
  }
}
