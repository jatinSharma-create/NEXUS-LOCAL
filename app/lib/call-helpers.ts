/**
 * CallHistoryItem — used on profile list and detail pages.
 * Kept here so both pages stay in sync.
 */
export interface CallHistoryItem {
  id: string;
  direction: string;
  status: string;
  created_at: Date;
  started_at: Date | null;
  ended_at: Date | null;
  duration_seconds: number | null;
  recording_url: string | null;
  transcript_text: string | null;
  summary_text: string | null;
  key_points: unknown;
  consent_confirmed: boolean | null;
  consent_method: string | null;
  transcript_pdf_url: string | null;
}

/**
 * Compute the display date: prefer started_at, fall back to created_at.
 */
export function callDisplayDate(call: Pick<CallHistoryItem, 'started_at' | 'created_at'>): Date {
  return call.started_at ? new Date(call.started_at) : new Date(call.created_at);
}

/**
 * Post-processing status for the pipeline badge.
 * Hangup sets status = 'completed' before the worker runs,
 * so we track readiness by pipeline fields, not call status.
 */
export type PipelineState =
  | 'live'                // call is still in progress
  | 'processing'          // recording exists but summary_text is null
  | 'generating_pdf'      // summary_text exists but transcript_pdf_url is null
  | 'ready'               // summary_text and transcript_pdf_url both set
  | 'failed_needs_review' // final failure after retry attempts exhausted
  | 'no_recording';       // completed without recording (Press 2 / no consent)

export function getPipelineState(call: Pick<CallHistoryItem, 'status' | 'recording_url' | 'summary_text' | 'transcript_pdf_url'>): PipelineState {
  if (call.status === 'failed_needs_review') return 'failed_needs_review';
  const liveStatuses = ['initiating', 'ringing', 'in_progress', 'awaiting_consent'];
  if (liveStatuses.includes(call.status)) return 'live';
  if (!call.recording_url) return 'no_recording';
  if (!call.summary_text) return 'processing';
  if (!call.transcript_pdf_url) return 'generating_pdf';
  return 'ready';
}

export function pipelineLabel(state: PipelineState): string {
  switch (state) {
    case 'live':
      return 'In progress';
    case 'processing':
      return 'Processing';
    case 'generating_pdf':
      return 'Generating PDF';
    case 'ready':
      return 'Ready';
    case 'failed_needs_review':
      return 'Needs attention — processing failed';
    case 'no_recording':
      return 'Not recorded';
  }
}

export function formatDuration(secs: number | null | undefined): string {
  if (secs == null) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}
