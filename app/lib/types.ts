import type { ParsedJsonBody } from './schemas';

// ── Pipeline stages ────────────────────────────────────────────────────────────
export const PIPELINE_STAGES = [
  'new',
  'contacted',
  'interviewing',
  'placed',
  'rejected',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

// ── Candidate notes ────────────────────────────────────────────────────────────
export interface CandidateNote {
  id: string;
  candidate_id: string;
  note_text: string;
  created_at: Date;
}

// ── Candidate shapes ───────────────────────────────────────────────────────────
export interface CandidateListItem {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  status: PipelineStage;
  current_role: string | null;
  created_at: Date;
}

export interface CandidateRecord {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  resume_url: string | null;
  parsed_json: ParsedJsonBody | null;
  status: PipelineStage;
  last_call_summary: string | null;
  do_not_contact: boolean;
  opt_out_at: Date | null;
  opt_out_source: string | null;
  recording_consent_declined: boolean;
  recording_consent_note: string | null;
  recording_consent_at: Date | null;
  deleted_at?: Date | null;
  created_at: Date;
  updated_at: Date;
  resume_download_url?: string | null;
}

export interface TrashCandidateItem {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  deleted_at: Date;
}
