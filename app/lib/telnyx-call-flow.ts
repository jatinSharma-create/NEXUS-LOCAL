import { query } from './db';
import {
  answerCall,
  speakText,
  gatherUsingSpeak,
  startRecording,
  stopPlayback,
  bridgeCalls,
  hangupCall,
  dial,
} from './telnyx';
import { getCallProcessingQueue } from './queue';

const COMPANY_NAME = process.env.NEXUS_COMPANY_NAME || 'Nexus Recruiting';
const TIMEOUT_SECS = parseInt(process.env.CONSENT_GATHER_TIMEOUT_SECS || '10', 10);
const MAX_RETRIES = parseInt(process.env.CONSENT_MAX_RETRIES || '2', 10);
const RECORDING_ENABLED = process.env.RECORDING_ENABLED === 'true';

/**
 * Consent IVR announcement — edit this one line (or set IVR_CONSENT_ANNOUNCEMENT in .env).
 */
export const IVR_CONSENT_ANNOUNCEMENT =
  process.env.IVR_CONSENT_ANNOUNCEMENT ||
  `Hello. This call is from a recruiter at ${COMPANY_NAME}. We may use this call for training purposes. Press 1 to consent to recording, or press 2 to continue without recording.`;

const SCRIPT_NO_INPUT = `We did not receive your response. This call will now end. Goodbye.`;

export const RECORDING_DECLINED_NOTE =
  'Candidate did not consent for this call to be recorded.';

/** Guard against duplicate dials if speak.ended is delivered more than once. */
const recruiterDialStarted = new Set<string>();

export type ClientState = {
  call_id?: string;
  candidate_id?: string;
  recruiter_sip_uri?: string;
  bridge_to?: string;
  leg?: string;
  /** After consent TTS finishes, dial the recruiter (avoids bridge-while-speaking). */
  awaiting_recruiter_dial?: boolean;
};

export function parseClientState(raw: unknown): ClientState {
  if (!raw || typeof raw !== 'string') return {};
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as ClientState;
  } catch {
    // Some payloads may already be plain JSON
    try {
      return JSON.parse(raw) as ClientState;
    } catch {
      return {};
    }
  }
}

export type CallRow = {
  id: string;
  candidate_id: string | null;
  consent_retries: number | null;
  consent_confirmed: boolean | null;
  status: string | null;
  started_at: Date | null;
};

/**
 * Resolve the calls row: prefer client_state.call_id (calls.id),
 * then fall back to telnyx_call_control_id.
 */
export async function findCallRow(
  stateObj: ClientState,
  callControlId: string
): Promise<CallRow | null> {
  if (stateObj.call_id) {
    const byId = await query<CallRow>(
      `SELECT id, candidate_id, consent_retries, consent_confirmed, status, started_at
       FROM calls WHERE id = $1`,
      [stateObj.call_id]
    );
    if (byId.rows[0]) return byId.rows[0];
  }

  if (callControlId) {
    const byCc = await query<CallRow>(
      `SELECT id, candidate_id, consent_retries, consent_confirmed, status, started_at
       FROM calls WHERE telnyx_call_control_id = $1`,
      [callControlId]
    );
    if (byCc.rows[0]) return byCc.rows[0];
  }

  return null;
}

async function playConsentGather(callControlId: string) {
  console.log(`[telnyx] playing consent IVR on call_control_id=${callControlId}`);
  try {
    await gatherUsingSpeak(callControlId, IVR_CONSENT_ANNOUNCEMENT, 'Polly.Matthew-Neural', TIMEOUT_SECS, 1);
  } catch (err) {
    console.error('[telnyx] gather_using_speak failed — callee will hear silence:', err);
    throw err;
  }
}

/**
 * After consent: play a short connecting prompt, then dial the recruiter on
 * call.speak.ended. Dialing immediately while TTS is still playing causes
 * Telnyx bridge to 500 (one-way / no audio) — especially on Press 2 which
 * had a longer prompt and skipped the record_start delay that Press 1 gets.
 */
async function continueCallAfterConsent(
  callControlId: string,
  stateObj: ClientState,
  callRow: CallRow | null,
  recruiterSipUri: string,
  _payload: Record<string, unknown>,
  messages: { inbound: string; connecting: string }
) {
  if (stateObj.leg === 'inbound') {
    await speakText(callControlId, messages.inbound);
    setTimeout(() => hangupCall(callControlId), 4000);
    return;
  }

  if (recruiterSipUri && !recruiterSipUri.includes('your_sip_username')) {
    const pendingState = JSON.stringify({
      ...stateObj,
      call_id: stateObj.call_id || callRow?.id,
      candidate_id: stateObj.candidate_id || callRow?.candidate_id || undefined,
      recruiter_sip_uri: recruiterSipUri,
      awaiting_recruiter_dial: true,
    } satisfies ClientState);
    await speakText(callControlId, messages.connecting, 'Polly.Matthew-Neural', pendingState);
  } else {
    await speakText(
      callControlId,
      'Consent received, but no recruiter SIP URI is configured. Goodbye.'
    );
    setTimeout(() => hangupCall(callControlId), 3000);
  }
}

async function dialRecruiterAfterConsent(
  callControlId: string,
  stateObj: ClientState,
  payload: Record<string, unknown>
) {
  if (!stateObj.awaiting_recruiter_dial) return;
  if (recruiterDialStarted.has(callControlId)) return;
  recruiterDialStarted.add(callControlId);

  const recruiterSipUri = stateObj.recruiter_sip_uri || process.env.TELNYX_SIP_URI || '';
  if (!recruiterSipUri || recruiterSipUri.includes('your_sip_username')) {
    recruiterDialStarted.delete(callControlId);
    await speakText(
      callControlId,
      'Consent received, but no recruiter SIP URI is configured. Goodbye.'
    );
    setTimeout(() => hangupCall(callControlId), 3000);
    return;
  }

  const bridgeState = JSON.stringify({
    call_id: stateObj.call_id,
    candidate_id: stateObj.candidate_id,
    recruiter_sip_uri: recruiterSipUri,
    bridge_to: callControlId,
    leg: 'recruiter',
  } satisfies ClientState);

  await dial(
    recruiterSipUri,
    process.env.TELNYX_CALLER_ID || String(payload.to || ''),
    bridgeState
  );
}

/**
 * Call-control state machine:
 * - On answer → play consent gather (NO recording yet)
 * - On DTMF 1 → consent_confirmed = true, THEN record_start, continue call
 * - On DTMF 2 → continue call WITHOUT recording; note decline on candidate profile
 * - On hangup → completed + duration
 */
export async function handleWebhookEvent(event: {
  event_type: string;
  payload: Record<string, unknown>;
}) {
  const { event_type, payload } = event;
  const callControlId = String(payload.call_control_id || '');
  const stateObj = parseClientState(payload.client_state);
  const candidateId = stateObj.candidate_id;
  const recruiterSipUri = stateObj.recruiter_sip_uri || process.env.TELNYX_SIP_URI || '';

  switch (event_type) {
    case 'call.initiated': {
      if (payload.direction === 'inbound') {
        const fromNumber = String(payload.from || '');
        const candidateRes = await query<{ id: string }>(
          'SELECT id FROM candidates WHERE phone = $1 AND deleted_at IS NULL',
          [fromNumber]
        );
        const matchedCandidateId = candidateRes.rows[0]?.id || null;

        const insertRes = await query<{ id: string }>(
          `INSERT INTO calls (direction, from_number, to_number, status, candidate_id, telnyx_call_control_id)
           VALUES ('inbound', $1, $2, 'initiating', $3, $4)
           RETURNING id`,
          [fromNumber, String(payload.to || ''), matchedCandidateId, callControlId]
        );

        const callId = insertRes.rows[0].id;
        const inboundState = JSON.stringify({
          call_id: callId,
          candidate_id: matchedCandidateId,
          leg: 'inbound',
        });

        await query(`UPDATE calls SET client_state = $1 WHERE id = $2`, [inboundState, callId]);
        // Attach call_id into Telnyx client_state so later events can resolve the row
        await answerCall(callControlId, inboundState);
      } else if (stateObj.call_id) {
        await query(
          `UPDATE calls
           SET status = 'ringing',
               telnyx_call_control_id = COALESCE(telnyx_call_control_id, $1)
           WHERE id = $2 AND status IN ('initiating', 'ringing')`,
          [callControlId, stateObj.call_id]
        );
      }
      break;
    }

    case 'call.answered': {
      const callRow = await findCallRow(stateObj, callControlId);

      // Recruiter leg answering after consent — stop any leftover TTS, then bridge
      if (stateObj.bridge_to || stateObj.leg === 'recruiter') {
        if (stateObj.bridge_to) {
          try {
            await stopPlayback(stateObj.bridge_to);
          } catch (err) {
            // No active playback is fine — continue to bridge
            console.warn('[telnyx] playback_stop before bridge (non-fatal):', err);
          }
          await bridgeCalls(callControlId, stateObj.bridge_to);
        }
        break;
      }

      // Candidate answered (outbound or inbound): play consent on the PHONE leg, DO NOT record yet.
      // The browser dialer stays silent until after DTMF — IVR audio is never sent to WebRTC.
      if (callRow) {
        await query(
          `UPDATE calls
           SET status = 'awaiting_consent',
               started_at = COALESCE(started_at, NOW()),
               telnyx_call_control_id = COALESCE(telnyx_call_control_id, $1)
           WHERE id = $2`,
          [callControlId, callRow.id]
        );
      }

      await playConsentGather(callControlId);
      break;
    }

    case 'call.speak.ended': {
      // Consent connecting prompt finished — now safe to dial recruiter and bridge
      await dialRecruiterAfterConsent(callControlId, stateObj, payload);
      break;
    }

    case 'call.gather.ended': {
      const digits = String(payload.digits || '').trim();
      const callRow = await findCallRow(stateObj, callControlId);
      const profileCandidateId = candidateId || callRow?.candidate_id;

      if (digits === '1') {
        // --- Consent confirmed: update DB FIRST, then start recording ---
        if (callRow) {
          await query(
            `UPDATE calls
             SET consent_confirmed = true,
                 consent_method = 'dtmf_1',
                 consent_at = NOW(),
                 status = 'in_progress'
             WHERE id = $1`,
            [callRow.id]
          );
        }

        if (profileCandidateId) {
          await query(
            `UPDATE candidates
             SET recording_consent_declined = false,
                 recording_consent_note = NULL,
                 recording_consent_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [profileCandidateId]
          );
        }

        // Recording starts ONLY after confirmation is logged
        if (RECORDING_ENABLED) {
          await startRecording(callControlId);
          if (callRow) {
            await query(`UPDATE calls SET recording_started_at = NOW() WHERE id = $1`, [callRow.id]);
          }
        }

        await continueCallAfterConsent(callControlId, stateObj, callRow, recruiterSipUri, payload, {
          inbound: 'Thank you. Your recruiter will return your call shortly. Goodbye.',
          connecting: 'Connecting you now.',
        });
      } else if (digits === '2') {
        // --- Declined recording: continue call, do NOT hang up, do NOT record ---
        if (callRow) {
          await query(
            `UPDATE calls
             SET consent_confirmed = false,
                 consent_method = 'dtmf_2_no_recording',
                 consent_at = NOW(),
                 status = 'in_progress'
             WHERE id = $1`,
            [callRow.id]
          );
        }

        if (profileCandidateId) {
          await query(
            `UPDATE candidates
             SET recording_consent_declined = true,
                 recording_consent_note = $2,
                 recording_consent_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [profileCandidateId, RECORDING_DECLINED_NOTE]
          );
        }

        await continueCallAfterConsent(callControlId, stateObj, callRow, recruiterSipUri, payload, {
          inbound:
            'Understood. Continuing without recording. Your recruiter will return your call shortly. Goodbye.',
          connecting: 'Understood. Continuing without recording. Connecting you now.',
        });
      } else {
        const retries = Number(callRow?.consent_retries || 0);
        if (retries < MAX_RETRIES) {
          if (callRow) {
            await query(`UPDATE calls SET consent_retries = consent_retries + 1 WHERE id = $1`, [
              callRow.id,
            ]);
          }
          await playConsentGather(callControlId);
        } else {
          if (callRow) {
            await query(
              `UPDATE calls
               SET status = 'completed',
                   hangup_cause = 'no_consent',
                   consent_confirmed = false,
                   ended_at = NOW()
               WHERE id = $1`,
              [callRow.id]
            );
          }
          await speakText(callControlId, SCRIPT_NO_INPUT);
          setTimeout(() => hangupCall(callControlId), 3000);
        }
      }
      break;
    }

    case 'call.bridged': {
      const callRow = await findCallRow(stateObj, stateObj.bridge_to || callControlId);
      if (callRow) {
        await query(
          `UPDATE calls
           SET status = 'in_progress',
               started_at = COALESCE(started_at, NOW())
           WHERE id = $1`,
          [callRow.id]
        );
      }
      break;
    }

    case 'call.recording.saved': {
      const recordingUrls = payload.recording_urls as { mp3?: string; wav?: string } | undefined;
      const recordingUrl = recordingUrls?.mp3 || recordingUrls?.wav || null;
      const telnyxRecordingId = String(payload.recording_id || '');
      const callRow = await findCallRow(stateObj, callControlId);
      if (callRow && recordingUrl) {
        await query(
          `UPDATE calls SET recording_url = $1, telnyx_recording_id = $2 WHERE id = $3`,
          [recordingUrl, telnyxRecordingId, callRow.id]
        );

        try {
          await getCallProcessingQueue().add('process-call', {
            callId: callRow.id,
            recordingUrl,
            candidateId: candidateId || callRow.candidate_id,
            telnyxRecordingId,
          });
        } catch (queueErr) {
          console.error('Failed to enqueue call processing job:', queueErr);
        }
      }
      break;
    }

    case 'call.hangup': {
      recruiterDialStarted.delete(callControlId);
      if (stateObj.bridge_to) {
        recruiterDialStarted.delete(stateObj.bridge_to);
      }

      if (stateObj.bridge_to && stateObj.leg === 'recruiter') {
        try {
          await hangupCall(stateObj.bridge_to);
        } catch (err) {
          console.error('Failed to hang up candidate leg:', err);
        }
      }

      const callRow = await findCallRow(stateObj, stateObj.bridge_to || callControlId);
      if (!callRow) break;

      // Prefer Telnyx-provided duration when present
      const payloadDuration = payload.duration_seconds ?? payload.call_duration_secs;
      const durationFromPayload =
        typeof payloadDuration === 'number'
          ? payloadDuration
          : typeof payloadDuration === 'string'
            ? parseInt(payloadDuration, 10)
            : null;

      await query(
        `UPDATE calls
         SET status = 'completed',
             ended_at = COALESCE(ended_at, NOW()),
             duration_seconds = COALESCE(
               $2::INT,
               CASE
                 WHEN started_at IS NOT NULL
                   THEN EXTRACT(EPOCH FROM (NOW() - started_at))::INT
                 ELSE duration_seconds
               END
             )
         WHERE id = $1
           AND status NOT IN ('completed')`,
        [callRow.id, Number.isFinite(durationFromPayload) ? durationFromPayload : null]
      );
      break;
    }
  }
}
