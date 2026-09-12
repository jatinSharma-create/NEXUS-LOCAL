import { query } from '../client';
import type { CallLeg, CallRecord, CallWithCandidate } from '../types';
import type { CallHistoryItem } from '@/lib/call-helpers';

const CALL_RECORD_COLUMNS = `
  id, candidate_id, provider, provider_call_id, agent_provider_call_id,
  consent_retries, consent_confirmed, consent_method, status,
  direction, from_number, to_number, started_at
`;

const HISTORY_COLUMNS = `
  id, direction, status, created_at, started_at, ended_at,
  duration_seconds, recording_url, transcript_text, summary_text,
  key_points, consent_confirmed, consent_method, transcript_pdf_url
`;

export async function createOutboundCall(input: {
  candidateId: string | null;
  fromNumber: string;
  toNumber: string;
  provider: string;
}): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO calls (candidate_id, direction, from_number, to_number, status, provider)
     VALUES ($1, 'outbound', $2, $3, 'initiating', $4)
     RETURNING id`,
    [input.candidateId, input.fromNumber, input.toNumber, input.provider]
  );
  return result.rows[0].id;
}

export async function createInboundCall(input: {
  candidateId: string | null;
  fromNumber: string;
  toNumber: string;
  provider: string;
  providerCallId: string;
}): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO calls (direction, from_number, to_number, status, candidate_id, provider, provider_call_id)
     VALUES ('inbound', $1, $2, 'initiating', $3, $4, $5)
     RETURNING id`,
    [input.fromNumber, input.toNumber, input.candidateId, input.provider, input.providerCallId]
  );
  return result.rows[0].id;
}

export async function findCallById(callId: string): Promise<CallRecord | null> {
  const result = await query<CallRecord>(
    `SELECT ${CALL_RECORD_COLUMNS} FROM calls WHERE id = $1`,
    [callId]
  );
  return result.rows[0] ?? null;
}

/** Resolve a call from either leg's provider-side identifier. */
export async function findCallByProviderCallId(
  providerCallId: string
): Promise<CallRecord | null> {
  const result = await query<CallRecord>(
    `SELECT ${CALL_RECORD_COLUMNS}
     FROM calls
     WHERE provider_call_id = $1 OR agent_provider_call_id = $1
     LIMIT 1`,
    [providerCallId]
  );
  return result.rows[0] ?? null;
}

export async function attachProviderCallId(
  callId: string,
  providerCallId: string,
  leg: CallLeg
): Promise<void> {
  const column = leg === 'agent' ? 'agent_provider_call_id' : 'provider_call_id';
  await query(
    `UPDATE calls SET ${column} = COALESCE(${column}, $1) WHERE id = $2`,
    [providerCallId, callId]
  );
}

export async function markRinging(callId: string, providerCallId: string): Promise<void> {
  await query(
    `UPDATE calls
     SET status = 'ringing',
         provider_call_id = COALESCE(provider_call_id, $1)
     WHERE id = $2 AND status IN ('initiating', 'ringing')`,
    [providerCallId, callId]
  );
}

export async function markAwaitingConsent(
  callId: string,
  providerCallId: string
): Promise<void> {
  await query(
    `UPDATE calls
     SET status = 'awaiting_consent',
         started_at = COALESCE(started_at, NOW()),
         provider_call_id = COALESCE(provider_call_id, $1)
     WHERE id = $2`,
    [providerCallId, callId]
  );
}

export async function markInProgress(callId: string): Promise<void> {
  await query(
    `UPDATE calls
     SET status = 'in_progress',
         started_at = COALESCE(started_at, NOW())
     WHERE id = $1`,
    [callId]
  );
}

export async function recordConsent(
  callId: string,
  input: { confirmed: boolean; method: string }
): Promise<void> {
  await query(
    `UPDATE calls
     SET consent_confirmed = $2,
         consent_method = $3,
         consent_at = NOW(),
         status = 'in_progress'
     WHERE id = $1`,
    [callId, input.confirmed, input.method]
  );
}

export async function incrementConsentRetries(callId: string): Promise<void> {
  await query(`UPDATE calls SET consent_retries = consent_retries + 1 WHERE id = $1`, [callId]);
}

export async function markRecordingStarted(callId: string): Promise<void> {
  await query(`UPDATE calls SET recording_started_at = NOW() WHERE id = $1`, [callId]);
}

export async function attachRecording(
  callId: string,
  recordingUrl: string,
  providerRecordingId: string | null
): Promise<void> {
  await query(
    `UPDATE calls SET recording_url = $1, provider_recording_id = $2 WHERE id = $3`,
    [recordingUrl, providerRecordingId, callId]
  );
}

/**
 * Close out a call. Never reopens one that is already completed.
 *
 * `overwriteCause` forces the cause even when one is already recorded (used by
 * answering-machine detection); otherwise the first recorded cause wins.
 * `keepExistingDuration` preserves a duration we already computed locally
 * instead of recalculating from `started_at`.
 */
export async function markCompleted(
  callId: string,
  opts: {
    cause: string;
    durationSeconds?: number | null;
    overwriteCause?: boolean;
    keepExistingDuration?: boolean;
    skipDuration?: boolean;
  }
): Promise<void> {
  const causeExpr = opts.overwriteCause ? '$3' : 'COALESCE(hangup_cause, $3)';
  const durationExpr = opts.skipDuration
    ? 'duration_seconds'
    : `COALESCE(
         ${opts.keepExistingDuration ? 'duration_seconds,' : ''}
         $2::INT,
         CASE
           WHEN started_at IS NOT NULL
             THEN EXTRACT(EPOCH FROM (NOW() - started_at))::INT
           ELSE duration_seconds
         END
       )`;

  await query(
    `UPDATE calls
     SET status = 'completed',
         hangup_cause = ${causeExpr},
         ended_at = COALESCE(ended_at, NOW()),
         duration_seconds = ${durationExpr}
     WHERE id = $1
       AND status NOT IN ('completed')`,
    [callId, opts.durationSeconds ?? null, opts.cause]
  );
}

/** Consent prompt exhausted its retries — close the call out as unconsented. */
export async function markNoConsent(callId: string): Promise<void> {
  await query(
    `UPDATE calls
     SET status = 'completed',
         hangup_cause = 'no_consent',
         consent_confirmed = false,
         ended_at = NOW()
     WHERE id = $1`,
    [callId]
  );
}

/** A confirmed voicemail/fax answered instead of a person. */
export async function markAnsweringMachine(callId: string): Promise<void> {
  await query(
    `UPDATE calls
     SET status = 'completed',
         hangup_cause = 'answering_machine',
         ended_at = COALESCE(ended_at, NOW())
     WHERE id = $1
       AND status NOT IN ('completed')`,
    [callId]
  );
}

export async function markFailedNeedsReview(callId: string): Promise<void> {
  await query(`UPDATE calls SET status = 'failed_needs_review' WHERE id = $1`, [callId]);
}

export async function saveTranscriptAndSummary(
  callId: string,
  input: { transcript: string; summary: string; keyPoints: unknown }
): Promise<void> {
  await query(
    `UPDATE calls
     SET transcript_text = $1,
         summary_text    = $2,
         key_points      = $3::jsonb
     WHERE id = $4`,
    [input.transcript, input.summary, JSON.stringify(input.keyPoints), callId]
  );
}

export async function attachTranscriptPdf(callId: string, pdfKey: string): Promise<void> {
  await query(`UPDATE calls SET transcript_pdf_url = $1 WHERE id = $2`, [pdfKey, callId]);
}

/** Status snapshot the dialer polls while a call is ringing. */
export async function findCallStatus(callId: string) {
  const result = await query<{
    id: string;
    status: string | null;
    hangup_cause: string | null;
    consent_method: string | null;
    to_number: string | null;
    from_number: string | null;
  }>(
    `SELECT id, status, hangup_cause, consent_method, to_number, from_number
     FROM calls WHERE id = $1`,
    [callId]
  );
  return result.rows[0] ?? null;
}

/** Provider identifiers needed to hang a call up from the recruiter side. */
export async function findCallLegs(callId: string) {
  const result = await query<{
    id: string;
    provider: string | null;
    provider_call_id: string | null;
    agent_provider_call_id: string | null;
    status: string | null;
  }>(
    `SELECT id, provider, provider_call_id, agent_provider_call_id, status
     FROM calls WHERE id = $1`,
    [callId]
  );
  return result.rows[0] ?? null;
}

export type CallListRow = CallHistoryItem & {
  candidate_id: string | null;
  candidate_name: string | null;
  from_number: string | null;
  to_number: string | null;
};

export async function listRecentCalls(limit = 200): Promise<CallListRow[]> {
  const result = await query<CallListRow>(
    `SELECT
       c.id, c.candidate_id, c.direction, c.status,
       c.created_at, c.started_at, c.ended_at,
       c.duration_seconds, c.recording_url,
       c.transcript_text, c.summary_text, c.key_points,
       c.consent_confirmed, c.consent_method, c.transcript_pdf_url,
       c.from_number, c.to_number,
       cand.name AS candidate_name
     FROM calls c
     LEFT JOIN candidates cand ON cand.id = c.candidate_id AND cand.deleted_at IS NULL
     ORDER BY COALESCE(c.started_at, c.created_at) DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export type CallDetailRow = CallHistoryItem & {
  candidate_id: string | null;
  from_number: string | null;
  to_number: string | null;
};

export async function findCallDetail(callId: string): Promise<CallDetailRow | null> {
  const result = await query<CallDetailRow>(
    `SELECT ${HISTORY_COLUMNS}, candidate_id, from_number, to_number
     FROM calls
     WHERE id = $1`,
    [callId]
  );
  return result.rows[0] ?? null;
}

export async function listCallsForCandidate(candidateId: string): Promise<CallHistoryItem[]> {
  const result = await query<CallHistoryItem>(
    `SELECT ${HISTORY_COLUMNS}
     FROM calls
     WHERE candidate_id = $1
     ORDER BY COALESCE(started_at, created_at) DESC`,
    [candidateId]
  );
  return result.rows;
}

export async function loadCallWithCandidate(callId: string): Promise<CallWithCandidate | null> {
  const result = await query<CallWithCandidate>(
    `SELECT
       c.id AS call_id,
       c.direction,
       c.duration_seconds,
       c.started_at,
       c.created_at,
       c.candidate_id,
       cand.name AS candidate_name,
       cand.phone AS candidate_phone
     FROM calls c
     LEFT JOIN candidates cand ON cand.id = c.candidate_id
     WHERE c.id = $1`,
    [callId]
  );
  return result.rows[0] ?? null;
}
