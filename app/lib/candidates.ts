import { query } from './db';
import type { CandidateListItem, CandidateRecord, CandidateNote, PipelineStage } from './types';

// ── Candidates ─────────────────────────────────────────────────────────────────

/** Fetch all active (non-deleted) candidates, newest first.
 *  When `q` is provided, filters across name, phone, email and the full
 *  parsed_json text (covers skills, role, experience, education).
 */
export async function getCandidates(q?: string): Promise<CandidateListItem[]> {
  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    const result = await query<CandidateListItem>(
      `SELECT id, name, email, phone, status,
              parsed_json->>'current_role' AS current_role,
              created_at
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
    `SELECT id, name, email, phone, status,
            parsed_json->>'current_role' AS current_role,
            created_at
     FROM candidates
     WHERE deleted_at IS NULL
     ORDER BY created_at DESC`
  );
  return result.rows;
}

/** Fetch a single active candidate by ID. Returns null if not found. */
export async function getCandidateById(id: string): Promise<CandidateRecord | null> {
  const result = await query<CandidateRecord>(
    'SELECT * FROM candidates WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  return result.rows[0] ?? null;
}

/** Update only the status column for a candidate. Returns the updated row. */
export async function updateCandidateStatus(
  id: string,
  status: PipelineStage
): Promise<CandidateListItem | null> {
  const result = await query<CandidateListItem>(
    `UPDATE candidates
     SET status = $1, updated_at = NOW()
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING id, name, email, phone, status,
               parsed_json->>'current_role' AS current_role,
               created_at`,
    [status, id]
  );
  return result.rows[0] ?? null;
}

// ── Candidate Notes ────────────────────────────────────────────────────────────

/** Fetch all notes for a candidate, newest first. */
export async function getCandidateNotes(candidateId: string): Promise<CandidateNote[]> {
  const result = await query<CandidateNote>(
    `SELECT id, candidate_id, note_text, created_at
     FROM candidate_notes
     WHERE candidate_id = $1
     ORDER BY created_at DESC`,
    [candidateId]
  );
  return result.rows;
}

/** Insert a new recruiter note for a candidate. Returns the created row. */
export async function addCandidateNote(
  candidateId: string,
  noteText: string
): Promise<CandidateNote> {
  const result = await query<CandidateNote>(
    `INSERT INTO candidate_notes (candidate_id, note_text)
     VALUES ($1, $2)
     RETURNING id, candidate_id, note_text, created_at`,
    [candidateId, noteText]
  );
  return result.rows[0];
}
