import type { CallDirection, CallLeg } from '@/modules/data';

export type { CallDirection, CallLeg };

/**
 * How to reach the recruiter. Each provider supports a different subset —
 * Telnyx bridges a SIP URI, Twilio dials a client identity, and a minimal
 * carrier can only ring a real phone number.
 */
export type AgentEndpoint =
  | { kind: 'sip'; uri: string }
  | { kind: 'client'; identity: string }
  | { kind: 'pstn'; number: string };

export function formatAgentEndpoint(endpoint: AgentEndpoint): string {
  switch (endpoint.kind) {
    case 'sip':
      return endpoint.uri;
    case 'client':
      return endpoint.identity;
    case 'pstn':
      return endpoint.number;
  }
}

/**
 * What the app wants to happen on a call.
 *
 * The call flow returns intents rather than calling vendor methods, because
 * providers disagree about control style: imperative vendors fire these as
 * sequential API calls, while declarative ones render the whole list into a
 * single document. Both are natural expressions of the same list.
 */
export type CallIntent =
  | { type: 'answer' }
  | { type: 'say'; text: string }
  | {
      type: 'gatherDigits';
      text: string;
      validDigits: string;
      maxDigits: number;
      timeoutSeconds: number;
    }
  | { type: 'startRecording' }
  | { type: 'stopRecording' }
  | { type: 'connectToAgent'; endpoint: AgentEndpoint; callerId: string }
  | { type: 'hangup'; afterMs?: number };

/** An instruction addressed at one leg of a call. */
export type FlowCommand = {
  providerCallId: string;
  intents: CallIntent[];
};

/** Normalized answering-machine outcome. Vendors all name these differently. */
export type MachineResult =
  | 'human'
  | 'machine'
  | 'fax'
  | 'screening'
  | 'greeting_ended'
  | 'beep'
  | 'unknown';

type CallEventBase = {
  providerCallId: string;
  leg: CallLeg;
  /** Our own call id, when the adapter could resolve it. */
  callId: string | null;
  raw: Record<string, unknown>;
};

/**
 * The vocabulary of things that happen on a call. Every adapter maps its
 * vendor's event names onto exactly these — nothing downstream ever sees a
 * vendor event type.
 */
export type CallEvent = CallEventBase &
  (
    | { type: 'call.initiated'; direction: CallDirection; from: string; to: string }
    | { type: 'call.ringing' }
    | { type: 'call.answered' }
    | { type: 'digits.received'; digits: string }
    | { type: 'machine.detected'; result: MachineResult }
    | { type: 'agent.connected' }
    | { type: 'recording.ready'; recordingId: string | null; recordingUrl: string }
    | { type: 'call.ended'; cause: string; durationSeconds: number | null }
  );

export type CallEventType = CallEvent['type'];
