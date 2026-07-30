'use client';

import { useState, useEffect, useRef } from 'react';
import { TelnyxRTC } from '@telnyx/webrtc';

interface CallDialerProps {
  candidateId: string;
  phone: string;
  doNotContact: boolean;
}

type CallState = 'idle' | 'connecting' | 'dialing' | 'awaiting_consent' | 'connected' | 'ended';

type TelnyxCall = {
  state: string;
  answer: (opts?: { remoteElement?: HTMLMediaElement | string }) => void;
  hangup: () => void;
};

export function CallDialer({ candidateId, phone, doNotContact }: CallDialerProps) {
  const [client, setClient] = useState<InstanceType<typeof TelnyxRTC> | null>(null);
  const [callState, setCallState] = useState<CallState>('idle');
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeCallRef = useRef<TelnyxCall | null>(null);
  const clientRef = useRef<InstanceType<typeof TelnyxRTC> | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initTelnyx() {
      try {
        setCallState('connecting');
        const res = await fetch('/api/calls/token', { method: 'POST' });
        const data = await res.json();

        if (!res.ok || !data.token) {
          throw new Error(data.error || 'Failed to get WebRTC token');
        }

        if (cancelled) return;

        const remoteEl = remoteAudioRef.current;
        const rtc = new TelnyxRTC({
          login_token: data.token,
          ...(remoteEl ? { remoteElement: remoteEl } : {}),
        });

        rtc.on('telnyx.ready', () => {
          setReady(true);
          setCallState('idle');
        });

        rtc.on('telnyx.error', () => {
          setError('WebRTC connection error');
        });

        rtc.on(
          'telnyx.notification',
          (notification: { type: string; call?: TelnyxCall }) => {
            if (notification.type !== 'callUpdate' || !notification.call) return;

            const call = notification.call;
            if (call.state === 'ringing') {
              const audio = remoteAudioRef.current;
              if (audio) {
                call.answer({ remoteElement: audio });
                void audio.play().catch(() => {
                  // Autoplay may require a prior user gesture; Call click counts.
                });
              } else {
                call.answer();
              }
              activeCallRef.current = call;
            } else if (call.state === 'active') {
              setCallState('connected');
              startTimer();
              void remoteAudioRef.current?.play().catch(() => undefined);
            } else if (call.state === 'hangup' || call.state === 'destroy') {
              setCallState('ended');
              stopTimer();
              activeCallRef.current = null;
            }
          }
        );

        rtc.connect();
        clientRef.current = rtc;
        setClient(rtc);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to init calling');
          setCallState('idle');
        }
      }
    }

    initTelnyx();

    return () => {
      cancelled = true;
      stopTimer();
      if (clientRef.current) {
        try {
          clientRef.current.disconnect();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const startTimer = () => {
    setDuration(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleCall = async () => {
    if (doNotContact || !ready) return;
    setError('');
    setCallState('dialing');

    try {
      const res = await fetch('/api/calls/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start call');
      }
      setCallState('awaiting_consent');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setCallState('ended');
    }
  };

  const handleHangup = () => {
    if (activeCallRef.current) {
      activeCallRef.current.hangup();
    }
    setCallState('ended');
    stopTimer();
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (doNotContact) {
    return (
      <button disabled className="nexus-btn-secondary text-sm">
        Opted out
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {/* Required for Telnyx remote (inbound) audio playback */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {error && <span className="text-sm text-[color:var(--danger)]">{error}</span>}

      {callState === 'connecting' && <span className="text-muted text-sm">Connecting…</span>}

      {callState === 'idle' && (
        <button
          onClick={handleCall}
          disabled={!ready || !client}
          className="nexus-btn-primary text-sm"
        >
          Call {phone}
        </button>
      )}

      {callState === 'dialing' && <span className="text-muted text-sm">Calling…</span>}

      {callState === 'awaiting_consent' && (
        <div className="text-sm text-muted max-w-xs">
          <p className="font-medium text-foreground">Waiting for consent…</p>
          <p className="mt-0.5 text-xs">
            Listen on the phone you dialed — the IVR plays there (not in this browser). Press 1 to
            record or 2 to continue without recording.
          </p>
        </div>
      )}

      {callState === 'connected' && (
        <div className="flex items-center gap-3 border border-border bg-panel px-3 py-1.5 rounded">
          <span className="text-sm font-medium font-mono tabular-nums">{formatTime(duration)}</span>
          <span className="text-muted text-xs">Connected</span>
          <button
            onClick={handleHangup}
            className="text-sm text-[color:var(--danger)] hover:underline ml-1"
            aria-label="Hang up"
          >
            Hang up
          </button>
        </div>
      )}

      {callState === 'ended' && (
        <div className="flex items-center gap-3">
          <span className="text-muted text-sm">Call ended</span>
          <button onClick={() => setCallState('idle')} className="nexus-btn-secondary text-xs">
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
