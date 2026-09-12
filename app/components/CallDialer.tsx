'use client';

import { formatCallDuration, useVoiceSession } from '@/modules/voice/client';

interface CallDialerProps {
  candidateId: string;
  phone: string;
  doNotContact: boolean;
  callerId?: string;
}

export function CallDialer({ candidateId, phone, doNotContact }: CallDialerProps) {
  const { state, ready, error, statusMessage, duration, inCall, remoteAudioRef, startCall, hangup, reset } =
    useVoiceSession();

  if (doNotContact) {
    return (
      <button disabled className="nexus-btn-secondary text-sm">
        Opted out
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 flex-wrap justify-end">
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {error && (
        <span className="text-sm text-[color:var(--danger)] max-w-xs text-right">{error}</span>
      )}

      {state === 'connecting' && <span className="text-muted text-sm">Connecting…</span>}

      {state === 'idle' && (
        <button
          onClick={() => void startCall({ candidateId })}
          disabled={!ready}
          className="nexus-btn-primary text-sm"
        >
          Call {phone}
        </button>
      )}

      {state === 'dialing' && (
        <span className="text-muted text-sm">{statusMessage || 'Calling the candidate…'}</span>
      )}

      {state === 'awaiting_consent' && (
        <span className="text-sm text-muted max-w-xs text-right">
          {statusMessage ||
            'Candidate answering. Wait for them to press 1 or 2 — your line rings after that.'}
        </span>
      )}

      {state === 'connected' && (
        <div className="flex items-center gap-3 border border-border bg-panel px-3 py-1.5 rounded">
          <span className="text-sm font-medium font-mono tabular-nums">
            {formatCallDuration(duration)}
          </span>
          <span className="text-muted text-xs">Connected</span>
        </div>
      )}

      {inCall && (
        <button
          onClick={() => void hangup()}
          className="text-sm text-[color:var(--danger)] hover:underline"
          aria-label="Hang up"
        >
          Hang up
        </button>
      )}

      {state === 'ended' && (
        <div className="flex items-center gap-3">
          {!error && <span className="text-muted text-sm">Call ended</span>}
          <button onClick={reset} className="nexus-btn-secondary text-xs">
            Call again
          </button>
        </div>
      )}
    </div>
  );
}
