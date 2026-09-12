import { callsRepo, candidatesRepo } from '@/modules/data';
import { getPresignedUrl } from '@/modules/storage';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import {
  callDisplayDate,
  formatDuration,
  getPipelineState,
  pipelineLabel,
} from '@/lib/call-helpers';

export const dynamic = 'force-dynamic';

type ParsedKeyPoints = {
  key_points?: string[];
  next_steps?: string[];
  sentiment?: string;
};

export default async function CallDetailPage({ params }: { params: { callId: string } }) {
  const call = await callsRepo.findCallDetail(params.callId);
  if (!call) notFound();

  const candidate = call.candidate_id
    ? await candidatesRepo.getCandidateById(call.candidate_id)
    : null;
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

          <dl className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm border-t border-border pt-4">
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
            <div>
              <dt className="text-muted">Status</dt>
              <dd className="mt-0.5">
                {state === 'failed_needs_review' ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400 border border-red-500/20">
                    Failed
                  </span>
                ) : (
                  <span className="text-muted">{pipelineLabel(state)}</span>
                )}
              </dd>
            </div>
          </dl>
        </div>

        {state === 'failed_needs_review' && (
          <div className="nexus-panel p-5 border border-red-500/30 bg-red-500/5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-red-500/10 text-red-400 mt-0.5 shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-red-400 text-base">Needs attention — processing failed</h2>
                <p className="text-sm text-muted mt-1 leading-relaxed">
                  Transcription and summarization failed after all retry attempts. You can listen to the audio recording below for manual review.
                </p>
              </div>
            </div>
          </div>
        )}

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
            {call.consent_method === 'dtmf_2_no_recording'
              ? 'The candidate pressed 2 and continued without recording. No transcript or PDF is generated unless they press 1.'
              : 'This call completed without recording consent.'}
          </div>
        )}
      </div>
    </AppShell>
  );
}
