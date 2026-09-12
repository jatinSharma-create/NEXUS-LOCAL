import { query } from '../client';
import type { CallLeg } from '../types';

/**
 * Per-leg call state, keyed by the provider's own call identifier.
 *
 * This replaces two things that used to be Telnyx-shaped: the `client_state`
 * blob Telnyx echoed back on every webhook (which no other vendor offers), and
 * the module-level `Set`s that tracked IVR progress in memory (which silently
 * stopped working with more than one app process).
 */
export type CallSessionState = {
  /** Consent IVR has been played on this leg — guards against double-play. */
  consentPromptPlayed?: boolean;
  /** Leg has hung up — late commands must be ignored. */
  ended?: boolean;
  /** The agent leg has already been dialled — guards duplicate webhooks. */
  agentDialStarted?: boolean;
  /** The leg this one was created to be joined to, if any. */
  bridgeTo?: string;
  /** Private scratch space owned by the provider adapter. */
  adapter?: Record<string, unknown>;
};

export type CallSession = {
  provider_call_id: string;
  call_id: string | null;
  provider: string;
  leg: CallLeg;
  state: CallSessionState;
};

export async function getSession(providerCallId: string): Promise<CallSession | null> {
  const result = await query<CallSession>(
    `SELECT provider_call_id, call_id, provider, leg, state
     FROM call_sessions
     WHERE provider_call_id = $1`,
    [providerCallId]
  );
  return result.rows[0] ?? null;
}

export async function findSessionByLeg(
  callId: string,
  leg: CallLeg
): Promise<CallSession | null> {
  const result = await query<CallSession>(
    `SELECT provider_call_id, call_id, provider, leg, state
     FROM call_sessions
     WHERE call_id = $1 AND leg = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [callId, leg]
  );
  return result.rows[0] ?? null;
}

export async function upsertSession(input: {
  providerCallId: string;
  callId: string | null;
  provider: string;
  leg: CallLeg;
  state?: CallSessionState;
}): Promise<void> {
  await query(
    `INSERT INTO call_sessions (provider_call_id, call_id, provider, leg, state)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (provider_call_id) DO UPDATE
       SET call_id = COALESCE(EXCLUDED.call_id, call_sessions.call_id),
           leg     = EXCLUDED.leg,
           state   = call_sessions.state || EXCLUDED.state,
           updated_at = NOW()`,
    [
      input.providerCallId,
      input.callId,
      input.provider,
      input.leg,
      JSON.stringify(input.state ?? {}),
    ]
  );
}

/**
 * Create a session row only if the leg is not already known.
 *
 * Callers that *guess* a leg must use this rather than `upsertSession`. A
 * webhook can arrive before the dial that caused it has finished recording
 * which leg it created, so a guess written with `upsertSession` would overwrite
 * the truth. `ON CONFLICT DO NOTHING` makes losing that race harmless.
 */
export async function insertSessionIfAbsent(input: {
  providerCallId: string;
  callId: string | null;
  provider: string;
  leg: CallLeg;
}): Promise<void> {
  await query(
    `INSERT INTO call_sessions (provider_call_id, call_id, provider, leg, state)
     VALUES ($1, $2, $3, $4, '{}'::jsonb)
     ON CONFLICT (provider_call_id) DO NOTHING`,
    [input.providerCallId, input.callId, input.provider, input.leg]
  );
}

/** Fill in `call_id` once it is known, without touching the leg or state. */
export async function attachSessionCallId(
  providerCallId: string,
  callId: string
): Promise<void> {
  await query(
    `UPDATE call_sessions
     SET call_id = COALESCE(call_id, $2),
         updated_at = NOW()
     WHERE provider_call_id = $1`,
    [providerCallId, callId]
  );
}

/** Shallow-merge a patch into the stored state. */
export async function patchSessionState(
  providerCallId: string,
  patch: CallSessionState
): Promise<void> {
  await query(
    `UPDATE call_sessions
     SET state = state || $2::jsonb,
         updated_at = NOW()
     WHERE provider_call_id = $1`,
    [providerCallId, JSON.stringify(patch)]
  );
}

/**
 * Atomically claim a one-shot action for this leg. Returns true only for the
 * first caller, so duplicate webhook deliveries cannot double-dial or
 * double-play a prompt.
 */
export async function claimSessionFlag(
  providerCallId: string,
  flag: 'consentPromptPlayed' | 'agentDialStarted'
): Promise<boolean> {
  const result = await query<{ provider_call_id: string }>(
    `UPDATE call_sessions
     SET state = state || jsonb_build_object($2::text, true),
         updated_at = NOW()
     WHERE provider_call_id = $1
       AND COALESCE((state ->> $2::text)::boolean, false) = false
     RETURNING provider_call_id`,
    [providerCallId, flag]
  );
  return result.rowCount === 1;
}

/** Release a one-shot claim so the action can be retried. */
export async function releaseSessionFlag(
  providerCallId: string,
  flag: 'consentPromptPlayed' | 'agentDialStarted'
): Promise<void> {
  await query(
    `UPDATE call_sessions
     SET state = state - $2::text,
         updated_at = NOW()
     WHERE provider_call_id = $1`,
    [providerCallId, flag]
  );
}

/** Mark every leg of a call as ended so late commands are dropped. */
export async function markLegsEnded(providerCallIds: string[]): Promise<void> {
  const ids = providerCallIds.filter(Boolean);
  if (ids.length === 0) return;
  await query(
    `UPDATE call_sessions
     SET state = state || '{"ended":true}'::jsonb,
         updated_at = NOW()
     WHERE provider_call_id = ANY($1::text[])`,
    [ids]
  );
}
