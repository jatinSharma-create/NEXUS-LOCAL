import type { PipelineStage } from '@/lib/types';
import type { ParsedJsonBody } from '@/lib/schemas';

export type CallStatus =
  | 'initiating'
  | 'ringing'
  | 'awaiting_consent'
  | 'in_progress'
  | 'completed'
  | 'failed_needs_review';

export type CallDirection = 'inbound' | 'outbound';

/** Which side of a call a provider leg belongs to. */
export type CallLeg = 'candidate' | 'agent' | 'inbound';

/** The subset of a call row the call flow needs to make decisions. */
export type CallRecord = {
  id: string;
  candidate_id: string | null;
  provider: string | null;
  provider_call_id: string | null;
  agent_provider_call_id: string | null;
  consent_retries: number | null;
  consent_confirmed: boolean | null;
  consent_method: string | null;
  status: string | null;
  direction: string | null;
  from_number: string | null;
  to_number: string | null;
  started_at: Date | null;
};

/** A call joined with its candidate — used when rendering the transcript PDF. */
export type CallWithCandidate = {
  call_id: string;
  direction: string;
  duration_seconds: number | null;
  started_at: Date | null;
  created_at: Date;
  candidate_id: string | null;
  candidate_name: string | null;
  candidate_phone: string | null;
};

export type CandidateRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  resume_url: string | null;
  parsed_json: ParsedJsonBody | null;
  status: PipelineStage;
  last_call_summary: string | null;
  do_not_contact: boolean;
  recording_consent_declined: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

/** Minimal candidate shape needed before placing a call. */
export type DialTarget = {
  id: string;
  phone: string;
  do_not_contact: boolean;
};
