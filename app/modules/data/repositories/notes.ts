import { query } from '../client';
import type { CandidateNote } from '@/lib/types';

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
