import type { ParsedJsonBody } from './schemas';

export interface CandidateListItem {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  status: string;
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
  status: string;
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
