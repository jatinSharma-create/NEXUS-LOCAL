import { query } from '@/lib/db';
import { getPresignedUrl } from '@/lib/storage';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import {
  callDisplayDate,
  formatDuration,
  getPipelineState,
  type CallHistoryItem,
} from '@/lib/call-helpers';

export const dynamic = 'force-dynamic';

type CallDetail = CallHistoryItem & {
  candidate_id: string | null;
  from_number: string | null;
  to_number: string | null;
};

type CandidateBasic = {
  id: string;
  name: string;
  phone: string;
};

type ParsedKeyPoints = {
  key_points?: string[];
  next_steps?: string[];
  sentiment?: string;
};

async function getCallDetail(callId: string): Promise<CallDetail | null> {
  const result = await query<CallDetail>(
    `SELECT id, candidate_id, direction, status,
            created_at, started_at, ended_at,
            duration_seconds, recording_url,
            transcript_text, summary_text, key_points,
            consent_confirmed, transcript_pdf_url,
            from_number, to_number
     FROM calls
     WHERE id = $1`,
    [callId]
  );
  return result.rows[0] ?? null;
}

async function getCandidate(id: string): Promise<CandidateBasic | null> {
  const result = await query<CandidateBasic>(
    'SELECT id, name, phone FROM candidates WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  return result.rows[0] ?? null;
}

export default async function CallDetailPage({ params }: { params: { callId: string } }) {
  const call = await getCallDetail(params.callId);
  if (!call) notFound();

  const candidate = call.candidate_id ? await getCandidate(call.candidate_id) : null;
  const state = getPipelineState(call);
  const displayDate = callDisplayDate(call);
  const number = call.direction === 'inbound' ? call.from_number : call.to_number;

  let parsedKP: ParsedKeyPoints = {};
  try {
    if (call.key_points) {
      parsedKP =
        typeof call.key_points === 'string'
          ? JSON.parse(call.key_points)
          : (call.key_points as ParsedKeyPoints);
    }
  } catch {
    // ignore
  }

  let pdfDownloadUrl: string | null = null;
  if (call.transcript_pdf_url) {
    try {
      pdfDownloadUrl = await getPresignedUrl(call.transcript_pdf_url);
    } catch {
      // ignore
    }
  }

  const isPending = state === 'processing' || state === 'generating_pdf';
  const title = candidate?.name || number || 'Call';

  return (
    <AppShell>
      <div className="max-w-3xl space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Link href="/calls" className="nexus-link">
            Calls
          </Link>
          <span>/</span>
          <span className="text-foreground">{displayDate.toLocaleDateString()}</span>
        </div>

        <div className="nexus-panel p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-semibold text-foreground">{title}</h1>
              <p className="text-sm text-muted mt-1 font-mono">{number || '—'}</p>
              {candidate && (
                <Link href={`/candidates/${candidate.id}`} className="nexus-link text-sm mt-2 inline-block">
                  View candidate
                </Link>
              )}
            </div>
            {pdfDownloadUrl && (
              <a
                href={pdfDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="nexus-btn-secondary text-sm"
              >
                Download PDF
              </a>
            )}
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm border-t border-border pt-4">
            <div>
              <dt className="text-muted">Date</dt>
              <dd className="mt-0.5">{displayDate.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-muted">Duration</dt>
              <dd className="mt-0.5">{formatDuration(call.duration_seconds)}</dd>
            </div>
            <div>
              <dt className="text-muted">Direction</dt>
              <dd className="mt-0.5 capitalize">{call.direction}</dd>
            </div>
            <div>
              <dt className="text-muted">Recording</dt>
              <dd className="mt-0.5">{call.recording_url ? 'Yes' : 'No'}</dd>
            </div>
          </dl>
        </div>

        {call.recording_url && (
          <div className="nexus-panel p-5">
            <h2 className="nexus-section-label">Recording</h2>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio controls className="w-full" src={call.recording_url} preload="none" />
          </div>
        )}

        {call.summary_text && (
          <div className="nexus-panel p-6">
            <h2 className="nexus-section-label">Summary</h2>
            <p className="text-sm leading-relaxed">{call.summary_text}</p>
          </div>
        )}

        {((parsedKP.key_points?.length ?? 0) > 0 || (parsedKP.next_steps?.length ?? 0) > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(parsedKP.key_points?.length ?? 0) > 0 && (
              <div className="nexus-panel p-6">
                <h2 className="nexus-section-label">Key points</h2>
                <ul className="space-y-2 text-sm">
                  {parsedKP.key_points!.map((pt, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted">·</span>
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(parsedKP.next_steps?.length ?? 0) > 0 && (
              <div className="nexus-panel p-6">
                <h2 className="nexus-section-label">Next steps</h2>
                <ul className="space-y-2 text-sm">
                  {parsedKP.next_steps!.map((ns, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted">→</span>
                      {ns}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {parsedKP.sentiment && (
          <p className="text-sm text-muted capitalize">Sentiment: {parsedKP.sentiment}</p>
        )}

        {call.transcript_text && (
          <div className="nexus-panel p-6">
            <h2 className="nexus-section-label">Transcript</h2>
            <div className="font-mono text-xs leading-relaxed whitespace-pre-wrap max-h-[600px] overflow-y-auto border border-border bg-background p-4">
              {call.transcript_text}
            </div>
          </div>
        )}

        {isPending && !call.transcript_text && (
          <div className="nexus-panel p-6 text-center text-muted text-sm">
            This call is still processing. Transcript and summary will appear shortly.
          </div>
        )}

        {state === 'no_recording' && (
          <div className="nexus-panel p-6 text-center text-muted text-sm">
            This call completed without recording consent.
          </div>
        )}
      </div>
    </AppShell>
  );
}
