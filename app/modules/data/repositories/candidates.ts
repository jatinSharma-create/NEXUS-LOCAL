import { query } from '../client';
import type { CandidateRow, DialTarget } from '../types';
import type {
  CandidateListItem,
  CandidateRecord,
  PipelineStage,
  TrashCandidateItem,
} from '@/lib/types';

export const TRASH_RETENTION_DAYS = 30;

const LIST_COLUMNS = `
  id, name, email, phone, status,
  parsed_json->>'current_role' AS current_role,
  created_at
`;

/**
 * Active candidates, newest first. When `q` is present, matches across name,
 * phone, email and the whole parsed resume blob (skills, role, experience).
 */
export async function getCandidates(q?: string): Promise<CandidateListItem[]> {
  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    const result = await query<CandidateListItem>(
      `SELECT ${LIST_COLUMNS}
       FROM candidates
       WHERE deleted_at IS NULL
         AND (
               name        ILIKE $1
            OR phone       ILIKE $1
            OR email       ILIKE $1
            OR parsed_json::text ILIKE $1
         )
       ORDER BY created_at DESC`,
      [term]
    );
    return result.rows;
  }

  const result = await query<CandidateListItem>(
    `SELECT ${LIST_COLUMNS}
     FROM candidates
     WHERE deleted_at IS NULL
     ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function getCandidateById(id: string): Promise<CandidateRecord | null> {
  const result = await query<CandidateRecord>(
    'SELECT * FROM candidates WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  return result.rows[0] ?? null;
}

/** Candidate fields required before dialling: identity, number, opt-out flag. */
export async function findDialTargetById(id: string): Promise<DialTarget | null> {
  const result = await query<DialTarget>(
    `SELECT id, phone, do_not_contact FROM candidates
     WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function findDialTargetByPhone(phone: string): Promise<DialTarget | null> {
  const result = await query<DialTarget>(
    `SELECT id, phone, do_not_contact FROM candidates
     WHERE phone = $1 AND deleted_at IS NULL`,
    [phone]
  );
  return result.rows[0] ?? null;
}

export async function findActiveIdByPhone(phone: string): Promise<string | null> {
  const result = await query<{ id: string }>(
    'SELECT id FROM candidates WHERE phone = $1 AND deleted_at IS NULL',
    [phone]
  );
  return result.rows[0]?.id ?? null;
}

export async function findActiveIdByEmail(email: string): Promise<string | null> {
  const result = await query<{ id: string }>(
    'SELECT id FROM candidates WHERE LOWER(email) = $1 AND deleted_at IS NULL',
    [email]
  );
  return result.rows[0]?.id ?? null;
}

export async function createCandidate(input: {
  name: string;
  email: string | null;
  phone: string;
  parsedJson: unknown;
}): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO candidates (name, email, phone, parsed_json, status, updated_at)
     VALUES ($1, $2, $3, $4, 'new', NOW())
     RETURNING id`,
    [input.name, input.email, input.phone, input.parsedJson]
  );
  return result.rows[0].id;
}

export async function applyResumeToCandidate(
  candidateId: string,
  input: {
    name: string;
    email: string | null;
    phone: string;
    parsedJson: unknown;
    resumeKey: string;
  }
): Promise<void> {
  await query(
    `UPDATE candidates
     SET name = $1, email = $2, phone = $3, parsed_json = $4, resume_url = $5, updated_at = NOW()
     WHERE id = $6`,
    [input.name, input.email, input.phone, input.parsedJson, input.resumeKey, candidateId]
  );
}

export async function updateCandidateProfile(
  id: string,
  input: {
    name: string | null;
    email: string | null;
    phone: string;
    status: PipelineStage | null;
    parsedJson: unknown;
  }
): Promise<CandidateListItem | null> {
  const result = await query<CandidateListItem>(
    `UPDATE candidates
     SET name = COALESCE($1, name),
         email = $2,
         phone = $3,
         status = COALESCE($4, status),
         parsed_json = $5,
         updated_at = NOW()
     WHERE id = $6 AND deleted_at IS NULL
     RETURNING ${LIST_COLUMNS}`,
    [input.name, input.email, input.phone, input.status, input.parsedJson, id]
  );
  return result.rows[0] ?? null;
}

export async function updateCandidateStatus(
  id: string,
  status: PipelineStage
): Promise<CandidateListItem | null> {
  const result = await query<CandidateListItem>(
    `UPDATE candidates
     SET status = $1, updated_at = NOW()
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING ${LIST_COLUMNS}`,
    [status, id]
  );
  return result.rows[0] ?? null;
}

export async function setLastCallSummary(id: string, summary: string): Promise<void> {
  await query(
    `UPDATE candidates
     SET last_call_summary = $1,
         updated_at        = NOW()
     WHERE id = $2`,
    [summary, id]
  );
}

/** Persist the outcome of the recording-consent prompt on the candidate profile. */
export async function setRecordingConsent(
  id: string,
  input: { declined: boolean; note: string | null }
): Promise<void> {
  await query(
    `UPDATE candidates
     SET recording_consent_declined = $2,
         recording_consent_note = $3,
         recording_consent_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [id, input.declined, input.note]
  );
}

export async function softDeleteCandidate(id: string): Promise<string | null> {
  const result = await query<{ id: string }>(
    `UPDATE candidates
     SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id`,
    [id]
  );
  return result.rows[0]?.id ?? null;
}

export async function restoreCandidate(
  id: string
): Promise<{ id: string; name: string } | null> {
  const result = await query<{ id: string; name: string }>(
    `UPDATE candidates
     SET deleted_at = NULL, updated_at = NOW()
     WHERE id = $1
       AND deleted_at IS NOT NULL
       AND deleted_at > NOW() - ($2::INT * INTERVAL '1 day')
     RETURNING id, name`,
    [id, TRASH_RETENTION_DAYS]
  );
  return result.rows[0] ?? null;
}

export async function purgeExpiredCandidates(): Promise<void> {
  await query(
    `DELETE FROM candidates
     WHERE deleted_at IS NOT NULL
       AND deleted_at < NOW() - ($1::INT * INTERVAL '1 day')`,
    [TRASH_RETENTION_DAYS]
  );
}

export async function listTrash(): Promise<(TrashCandidateItem & { days_left: number })[]> {
  const result = await query<TrashCandidateItem & { days_left: number }>(
    `SELECT id, name, email, phone, deleted_at,
            GREATEST(
              0,
              CEIL(EXTRACT(EPOCH FROM (deleted_at + ($1::INT * INTERVAL '1 day') - NOW())) / 86400.0)
            )::INT AS days_left
     FROM candidates
     WHERE deleted_at IS NOT NULL
       AND deleted_at > NOW() - ($1::INT * INTERVAL '1 day')
     ORDER BY deleted_at DESC`,
    [TRASH_RETENTION_DAYS]
  );
  return result.rows;
}

export type { CandidateRow };
