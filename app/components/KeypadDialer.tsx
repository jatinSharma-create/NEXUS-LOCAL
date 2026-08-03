'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { TelnyxRTC } from '@telnyx/webrtc';

type CallState = 'idle' | 'connecting' | 'dialing' | 'awaiting_consent' | 'connected' | 'ended';

type TelnyxCall = {
  state: string;
  answer: (opts?: { remoteElement?: HTMLMediaElement | string }) => void;
  hangup: () => void;
};

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
] as const;

export function KeypadDialer() {
  const [digits, setDigits] = useState('');
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

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    setDuration(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
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
        // ignore transient poll errors
      }
    };

    void tick();
    const id = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [callState, stopTimer]);

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

        rtc.on('telnyx.notification', (notification: { type: string; call?: TelnyxCall }) => {
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
        });

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
  }, [startTimer, stopTimer]);

  function press(key: string) {
    if (callState !== 'idle' && callState !== 'ended' && callState !== 'connecting') return;
    setDigits((prev) => (prev + key).slice(0, 20));
    setError('');
  }

  function backspace() {
    setDigits((prev) => prev.slice(0, -1));
  }

  async function handleCall() {
    if (!ready || !digits.trim()) return;
    setError('');
    hangingUpRef.current = false;
    nexusCallIdRef.current = null;
    setCallState('dialing');

    try {
      const res = await fetch('/api/calls/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start call');
      nexusCallIdRef.current = data.callId || null;
      setCallState('awaiting_consent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start call');
      setCallState('ended');
    }
  }

  async function handleHangup() {
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
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const inCall = callState === 'dialing' || callState === 'awaiting_consent' || callState === 'connected';

  return (
    <div className="max-w-sm mx-auto">
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      <div className="nexus-panel p-6 space-y-5">
        <div>
          <label className="nexus-section-label block mb-2">Number</label>
          <input
            type="tel"
            value={digits}
            onChange={(e) => {
              if (inCall) return;
              setDigits(e.target.value.replace(/[^\d+*#]/g, '').slice(0, 20));
              setError('');
            }}
            placeholder="+61 4…"
            disabled={inCall}
            className="nexus-input font-mono text-lg tracking-wide text-center"
          />
          <p className="text-xs text-muted mt-2 text-center">
            Enter the full number with country code.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {KEYS.flat().map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => press(key)}
              disabled={inCall}
              className="h-12 rounded border border-border bg-panel text-lg font-medium
                hover:bg-background disabled:opacity-40 transition-colors"
            >
              {key}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={backspace}
            disabled={inCall || !digits}
            className="nexus-btn-secondary flex-1"
          >
            Delete
          </button>
          {!inCall && callState !== 'connecting' && (
            <button
              type="button"
              onClick={handleCall}
              disabled={!ready || !client || !digits.trim()}
              className="nexus-btn-primary flex-1"
            >
              Call
            </button>
          )}
          {inCall && (
            <button type="button" onClick={handleHangup} className="nexus-btn-danger flex-1">
              Hang up
            </button>
          )}
        </div>

        <div className="min-h-[1.25rem] text-sm text-center">
          {error && <span className="text-[color:var(--danger)]">{error}</span>}
          {!error && callState === 'connecting' && <span className="text-muted">Connecting…</span>}
          {!error && callState === 'dialing' && <span className="text-muted">Calling…</span>}
          {!error && callState === 'awaiting_consent' && (
            <span className="text-muted">Ringing…</span>
          )}
          {!error && callState === 'connected' && (
            <span className="font-mono tabular-nums">{formatTime(duration)} · Connected</span>
          )}
          {!error && callState === 'ended' && (
            <button
              type="button"
              onClick={() => {
                setCallState('idle');
                setError('');
              }}
              className="nexus-link text-sm"
            >
              Call again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
