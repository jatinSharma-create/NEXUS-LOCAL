import { TelnyxRTC } from '@telnyx/webrtc';
import type {
  BrowserVoiceClient,
  VoiceClientCredentials,
  VoiceClientHandlers,
} from '../../client/types';

type TelnyxCall = {
  state: string;
  answer: (opts?: { remoteElement?: HTMLMediaElement | string }) => void;
  hangup: () => void;
};

/** Telnyx WebRTC, behind the neutral browser client interface. */
export class TelnyxBrowserVoiceClient implements BrowserVoiceClient {
  readonly provider = 'telnyx';

  private rtc: InstanceType<typeof TelnyxRTC> | null = null;
  private activeCall: TelnyxCall | null = null;

  async connect(options: {
    credentials: VoiceClientCredentials;
    remoteAudio: HTMLAudioElement | null;
    handlers: VoiceClientHandlers;
  }): Promise<void> {
    const { credentials, remoteAudio, handlers } = options;

    const rtc = new TelnyxRTC({
      login_token: credentials.token,
      ...(remoteAudio ? { remoteElement: remoteAudio } : {}),
    });

    rtc.on('telnyx.ready', () => handlers.onReady());
    rtc.on('telnyx.error', () => handlers.onError('Connection error'));

    rtc.on('telnyx.notification', (notification: { type: string; call?: TelnyxCall }) => {
      if (notification.type !== 'callUpdate' || !notification.call) return;
      const call = notification.call;

      if (call.state === 'ringing') {
        if (remoteAudio) {
          call.answer({ remoteElement: remoteAudio });
          void remoteAudio.play().catch(() => undefined);
        } else {
          call.answer();
        }
        this.activeCall = call;
      } else if (call.state === 'active') {
        void remoteAudio?.play().catch(() => undefined);
        handlers.onCallActive();
      } else if (call.state === 'hangup' || call.state === 'destroy') {
        this.activeCall = null;
        handlers.onCallEnded();
      }
    });

    rtc.connect();
    this.rtc = rtc;
  }

  hangup(): void {
    try {
      this.activeCall?.hangup();
    } catch {
      // Already gone.
    }
    this.activeCall = null;
  }

  disconnect(): void {
    try {
      this.rtc?.disconnect();
    } catch {
      // Already gone.
    }
    this.rtc = null;
  }
}
