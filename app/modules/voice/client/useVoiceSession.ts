'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserVoiceClient } from './factory';
import type { BrowserVoiceClient } from './types';

export type VoiceSessionState =
  | 'idle'
  | 'connecting'
  | 'dialing'
  | 'awaiting_consent'
  | 'connected'
  | 'ended';

export type StartCallPayload = { candidateId: string } | { phone: string };

/**
 * All the dialer behaviour, in one place: register the recruiter's browser
 * leg, place a call, follow its progress, and hang up cleanly on both sides.
 *
 * Both dialers used to carry their own near-identical copy of this, each with
 * its own `import { TelnyxRTC }`. Now the vendor appears exactly once, in the
 * client adapter this hook resolves at runtime.
 */
export function useVoiceSession() {
  const [state, setState] = useState<VoiceSessionState>('idle');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [duration, setDuration] = useState(0);

  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const clientRef = useRef<BrowserVoiceClient | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callIdRef = useRef<string | null>(null);
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

  // ── Register the recruiter's browser leg ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setState('connecting');
        const res = await fetch('/api/calls/token', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to get calling credentials');
        }
        if (cancelled) return;

        // A provider without a browser SDK still allows calling — the
        // recruiter's leg simply rings elsewhere.
        const provider = data.supported === false ? 'fake' : data.provider;
        const client = await createBrowserVoiceClient(provider);
        if (cancelled) return;

        await client.connect({
          credentials: {
            provider,
            token: data.token,
            identity: data.identity ?? null,
            agentEndpoint: data.agentEndpoint ?? null,
          },
          remoteAudio: remoteAudioRef.current,
          handlers: {
            onReady: () => {
              setReady(true);
              setState('idle');
            },
            onCallActive: () => {
              if (hangingUpRef.current) return;
              setState('connected');
              startTimer();
            },
            onCallEnded: () => {
              setState('ended');
              stopTimer();
              hangingUpRef.current = false;
            },
            onError: (message) => setError(message),
          },
        });

        clientRef.current = client;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to initialize calling');
          setState('idle');
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
      stopTimer();
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, [startTimer, stopTimer]);

  // ── Follow the candidate's leg while it rings ───────────────────────────────
  useEffect(() => {
    if (state !== 'dialing' && state !== 'awaiting_consent') return;
    const callId = callIdRef.current;
    if (!callId) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch(`/api/calls/status?callId=${encodeURIComponent(callId)}`);
        const data = await res.json();
        if (cancelled || !res.ok) return;

        if (!data.ended && typeof data.userMessage === 'string' && data.userMessage) {
          setStatusMessage(data.userMessage);
        }

        if (!data.ended || hangingUpRef.current) return;

        if (data.wentToVoicemail || data.hangupCause === 'screened_no_ring') {
          setError(data.userMessage || 'Call went to voicemail');
        } else if (data.hangupCause === 'answering_machine') {
          setError(data.userMessage || 'Reached voicemail');
        } else if (data.userMessage && data.hangupCause !== 'recruiter_hangup') {
          setError(data.userMessage);
        }

        setState('ended');
        stopTimer();
        callIdRef.current = null;
      } catch {
        // Transient poll failures are not interesting.
      }
    };

    void tick();
    const id = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [state, stopTimer]);

  const startCall = useCallback(async (payload: StartCallPayload) => {
    setError('');
    setStatusMessage('Calling the candidate…');
    hangingUpRef.current = false;
    callIdRef.current = null;
    setState('dialing');

    try {
      const res = await fetch('/api/calls/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start call');

      callIdRef.current = data.callId || null;
      setState('awaiting_consent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start call');
      setState('ended');
    }
  }, []);

  const hangup = useCallback(async () => {
    hangingUpRef.current = true;
    const callId = callIdRef.current;

    clientRef.current?.hangup();

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

    callIdRef.current = null;
    setState('ended');
    stopTimer();
  }, [stopTimer]);

  const reset = useCallback(() => {
    setState('idle');
    setError('');
    setStatusMessage('');
  }, []);

  const inCall = state === 'dialing' || state === 'awaiting_consent' || state === 'connected';

  return {
    state,
    ready,
    error,
    statusMessage,
    duration,
    inCall,
    remoteAudioRef,
    startCall,
    hangup,
    reset,
  };
}

export function formatCallDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
