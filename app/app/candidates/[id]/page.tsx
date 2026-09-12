import { callsRepo, candidatesRepo } from '@/modules/data';
import { getPresignedUrl } from '@/modules/storage';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import type { CandidateRecord } from '@/lib/types';
import type { ParsedJsonBody } from '@/lib/schemas';
import { CallDialer } from '@/components/CallDialer';
import { DeleteCandidateButton } from '@/components/DeleteCandidateButton';
import { StatusDropdown } from '@/components/StatusDropdown';
import { CandidateNotes } from '@/components/CandidateNotes';
import {
  callDisplayDate,
  formatDuration,
  getPipelineState,
  pipelineLabel,
} from '@/lib/call-helpers';

export const dynamic = 'force-dynamic';

async function getCandidate(id: string): Promise<CandidateRecord | null> {
  const candidate = await candidatesRepo.getCandidateById(id);
  if (!candidate) return null;

  let resume_download_url: string | null = null;

  if (candidate.resume_url) {
    try {
      resume_download_url = await getPresignedUrl(candidate.resume_url);
    } catch (err) {
      console.error('Error generating presigned URL:', err);
    }
  }

  return { ...candidate, resume_download_url };
}

const emptyParsedJson: ParsedJsonBody = {
  current_role: null,
  years_experience: null,
  skills: [],
  experience: [],
  education: [],
};

export default async function CandidateProfile({ params }: { params: { id: string } }) {
  const candidate = await getCandidate(params.id);

  if (!candidate) {
    notFound();
  }

  const calls = await callsRepo.listCallsForCandidate(candidate.id);
  const parsedJson = candidate.parsed_json ?? emptyParsedJson;

  return (
    <AppShell>
      {/* Wider container to accommodate two columns */}
      <div className="max-w-7xl w-full">

        {/* Top bar: back link + action buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <Link href="/candidates" className="nexus-link text-sm">
            ← Candidates
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {candidate.resume_download_url && (
              <a
                href={candidate.resume_download_url}
                target="_blank"
                rel="noopener noreferrer"
                className="nexus-btn-secondary text-sm"
              >
                Resume
              </a>
            )}
            <DeleteCandidateButton candidateId={candidate.id} candidateName={candidate.name} />
            <CallDialer
              candidateId={candidate.id}
              phone={candidate.phone}
              doNotContact={candidate.do_not_contact}
            />
          </div>
        </div>

        {/* ── Two-column layout ─────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_360px] gap-6 items-start">

          {/* ── LEFT: main candidate content ── */}
          <div className="space-y-6 min-w-0">

            {/* Profile header card */}
            <div className="nexus-panel p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="font-display text-3xl font-semibold text-foreground">{candidate.name}</h1>
                  <p className="text-muted mt-1">{parsedJson.current_role || 'Role not specified'}</p>
                </div>
                <StatusDropdown
                  candidateId={candidate.id}
                  initialStatus={candidate.status}
                />
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm border-t border-border pt-4">
                {candidate.email && (
                  <div>
                    <dt className="text-muted">Email</dt>
                    <dd className="mt-0.5">{candidate.email}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted">Phone</dt>
                  <dd className="mt-0.5 font-mono text-xs">{candidate.phone}</dd>
                </div>
                {parsedJson.years_experience != null && (
                  <div>
                    <dt className="text-muted">Experience</dt>
                    <dd className="mt-0.5">{parsedJson.years_experience} years</dd>
                  </div>
                )}
              </dl>

              {candidate.recording_consent_declined && candidate.recording_consent_note && (
                <p className="text-sm text-muted border-t border-border pt-4">
                  {candidate.recording_consent_note}
                </p>
              )}
            </div>

            {candidate.last_call_summary && (
              <section>
                <h2 className="nexus-section-label">Latest call summary</h2>
                <div className="nexus-panel p-5">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{candidate.last_call_summary}</p>
                </div>
              </section>
            )}

            {calls.length > 0 && (
              <section>
                <h2 className="nexus-section-label">Call history</h2>
                <div className="nexus-panel overflow-hidden">
                  <table className="nexus-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Direction</th>
                        <th>Duration</th>
                        <th>Status</th>
                        <th>Summary</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {calls.map((call) => {
                        const state = getPipelineState(call);
                        const summaryPreview = call.summary_text
                          ? call.summary_text.slice(0, 80) + (call.summary_text.length > 80 ? '…' : '')
                          : null;
                        return (
                          <tr key={call.id}>
                            <td className="whitespace-nowrap text-muted">
                              {callDisplayDate(call).toLocaleString()}
                            </td>
                            <td className="capitalize whitespace-nowrap">{call.direction}</td>
                            <td className="whitespace-nowrap">{formatDuration(call.duration_seconds)}</td>
                            <td className="whitespace-nowrap">
                              {state === 'failed_needs_review' ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400 border border-red-500/20">
                                  <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                  </svg>
                                  Failed
                                </span>
                              ) : (
                                <span className="text-muted">{pipelineLabel(state)}</span>
                              )}
                            </td>
                            <td className="max-w-xs">
                              {state === 'failed_needs_review' ? (
                                <span className="text-red-400 font-medium text-xs flex items-center gap-1.5">
                                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                  </svg>
                                  Needs attention — processing failed
                                </span>
                              ) : state === 'processing' || state === 'generating_pdf' ? (
                                <span className="text-muted">Processing…</span>
                              ) : (
                                <span className="text-muted">{summaryPreview || '—'}</span>
                              )}
                            </td>
                            <td className="text-right">
                              <Link href={`/calls/${call.id}`} className="nexus-link text-xs">
                                View
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {parsedJson.skills.length > 0 && (
              <section>
                <h2 className="nexus-section-label">Skills</h2>
                <p className="text-sm text-foreground leading-relaxed">{parsedJson.skills.join(' · ')}</p>
              </section>
            )}

            {parsedJson.experience.length > 0 && (
              <section>
                <h2 className="nexus-section-label">Experience</h2>
                <div className="space-y-4">
                  {parsedJson.experience.map((exp, i) => (
                    <div key={i} className="nexus-panel p-4">
                      <h3 className="font-medium text-foreground">{exp.role}</h3>
                      <p className="text-sm text-muted mt-0.5">
                        {exp.company} · {exp.dates}
                      </p>
                      <p className="mt-2 text-sm text-foreground leading-relaxed">{exp.summary}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {parsedJson.education.length > 0 && (
              <section>
                <h2 className="nexus-section-label">Education</h2>
                <div className="space-y-3">
                  {parsedJson.education.map((edu, i) => (
                    <div key={i} className="nexus-panel p-4">
                      <h3 className="font-medium text-foreground">{edu.degree}</h3>
                      <p className="text-sm text-muted mt-0.5">
                        {edu.institution} · {edu.dates}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ── RIGHT: sticky notes sidebar ── */}
          <div className="lg:sticky lg:top-6 nexus-panel overflow-hidden rounded">
            <CandidateNotes candidateId={candidate.id} />
          </div>

        </div>
      </div>
    </AppShell>
  );
}

