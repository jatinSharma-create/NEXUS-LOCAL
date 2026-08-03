'use client';

import { useState, useEffect, useRef } from 'react';
import { TelnyxRTC } from '@telnyx/webrtc';

interface CallDialerProps {
  candidateId: string;
  phone: string;
  doNotContact: boolean;
  callerId?: string;
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
  const nexusCallIdRef = useRef<string | null>(null);
  const hangingUpRef = useRef(false);

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
          setError('Connection error');
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
                void audio.play().catch(() => undefined);
              } else {
                call.answer();
              }
              activeCallRef.current = call;
            } else if (call.state === 'active') {
              if (!hangingUpRef.current) {
                setCallState('connected');
                startTimer();
              }
              void remoteAudioRef.current?.play().catch(() => undefined);
            } else if (call.state === 'hangup' || call.state === 'destroy') {
              setCallState('ended');
              stopTimer();
              activeCallRef.current = null;
              hangingUpRef.current = false;
            }
          }
        );

        rtc.connect();
        clientRef.current = rtc;
        setClient(rtc);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to initialize calling');
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

  useEffect(() => {
    if (callState !== 'dialing' && callState !== 'awaiting_consent') return;
    const callId = nexusCallIdRef.current;
    if (!callId) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/calls/status?callId=${encodeURIComponent(callId)}`);
        const data = await res.json();
        if (cancelled || !res.ok) return;
        if (data.ended && !hangingUpRef.current) {
          if (data.wentToVoicemail || data.hangupCause === 'screened_no_ring') {
            setError(data.userMessage || 'Call went to voicemail');
          } else if (data.hangupCause === 'answering_machine') {
            setError(data.userMessage || 'Reached voicemail');
          } else if (data.userMessage && data.hangupCause !== 'recruiter_hangup') {
            setError(data.userMessage);
          }
          setCallState('ended');
          stopTimer();
          nexusCallIdRef.current = null;
        }
      } catch {
        // ignore
      }
    };

    void tick();
    const id = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [callState]);

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
    hangingUpRef.current = false;
    nexusCallIdRef.current = null;
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
      nexusCallIdRef.current = data.callId || null;
      setCallState('awaiting_consent');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setCallState('ended');
    }
  };

  const handleHangup = async () => {
    hangingUpRef.current = true;
    const callId = nexusCallIdRef.current;

    try {
      activeCallRef.current?.hangup();
    } catch {
      // ignore
    }
    activeCallRef.current = null;

    if (callId) {
      try {
        await fetch('/api/calls/hangup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId }),
        });
      } catch (err) {
        console.error('Failed to hang up via API:', err);
      }
    }

    nexusCallIdRef.current = null;
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

  const inFlight =
    callState === 'dialing' || callState === 'awaiting_consent' || callState === 'connected';

  return (
    <div className="flex items-center gap-3 flex-wrap justify-end">
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {error && <span className="text-sm text-[color:var(--danger)] max-w-xs text-right">{error}</span>}

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
        <span className="text-sm text-muted">Ringing…</span>
      )}

      {callState === 'connected' && (
        <div className="flex items-center gap-3 border border-border bg-panel px-3 py-1.5 rounded">
          <span className="text-sm font-medium font-mono tabular-nums">{formatTime(duration)}</span>
          <span className="text-muted text-xs">Connected</span>
        </div>
      )}

      {inFlight && (
        <button
          onClick={handleHangup}
          className="text-sm text-[color:var(--danger)] hover:underline"
          aria-label="Hang up"
        >
          Hang up
        </button>
      )}

      {callState === 'ended' && (
        <div className="flex items-center gap-3">
          {!error && <span className="text-muted text-sm">Call ended</span>}
          <button onClick={() => { setCallState('idle'); setError(''); }} className="nexus-btn-secondary text-xs">
            Call again
          </button>
        </div>
      )}
    </div>
  );
}
