'use client';

import { useState } from 'react';
import { formatCallDuration, useVoiceSession } from '@/modules/voice/client';

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
] as const;

export function KeypadDialer() {
  const [digits, setDigits] = useState('');
  const { state, ready, error, statusMessage, duration, inCall, remoteAudioRef, startCall, hangup, reset } =
    useVoiceSession();

  function press(key: string) {
    if (state !== 'idle' && state !== 'ended' && state !== 'connecting') return;
    setDigits((prev) => (prev + key).slice(0, 20));
  }

  function backspace() {
    setDigits((prev) => prev.slice(0, -1));
  }

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
          {!inCall && state !== 'connecting' && (
            <button
              type="button"
              onClick={() => void startCall({ phone: digits.trim() })}
              disabled={!ready || !digits.trim()}
              className="nexus-btn-primary flex-1"
            >
              Call
            </button>
          )}
          {inCall && (
            <button type="button" onClick={() => void hangup()} className="nexus-btn-danger flex-1">
              Hang up
            </button>
          )}
        </div>

        <div className="min-h-[1.25rem] text-sm text-center">
          {error && <span className="text-[color:var(--danger)]">{error}</span>}
          {!error && state === 'connecting' && <span className="text-muted">Connecting…</span>}
          {!error && state === 'dialing' && (
            <span className="text-muted">{statusMessage || 'Calling the candidate…'}</span>
          )}
          {!error && state === 'awaiting_consent' && (
            <span className="text-muted">
              {statusMessage ||
                'Candidate answering. Wait for them to press 1 or 2 — your line rings after that.'}
            </span>
          )}
          {!error && state === 'connected' && (
            <span className="font-mono tabular-nums">
              {formatCallDuration(duration)} · Connected
            </span>
          )}
          {!error && state === 'ended' && (
            <button type="button" onClick={reset} className="nexus-link text-sm">
              Call again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
