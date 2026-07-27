import Link from 'next/link';
import { query } from '@/lib/db';
import { AppShell } from '@/components/AppShell';
import {
  callDisplayDate,
  formatDuration,
  getPipelineState,
  pipelineLabel,
  type CallHistoryItem,
} from '@/lib/call-helpers';

export const dynamic = 'force-dynamic';

type CallListRow = CallHistoryItem & {
  candidate_id: string | null;
  candidate_name: string | null;
  from_number: string | null;
  to_number: string | null;
};

async function getCalls(): Promise<CallListRow[]> {
  const result = await query<CallListRow>(
    `SELECT
       c.id, c.candidate_id, c.direction, c.status,
       c.created_at, c.started_at, c.ended_at,
       c.duration_seconds, c.recording_url,
       c.transcript_text, c.summary_text, c.key_points,
       c.consent_confirmed, c.transcript_pdf_url,
       c.from_number, c.to_number,
       cand.name AS candidate_name
     FROM calls c
     LEFT JOIN candidates cand ON cand.id = c.candidate_id AND cand.deleted_at IS NULL
     ORDER BY COALESCE(c.started_at, c.created_at) DESC
     LIMIT 200`
  );
  return result.rows;
}

export default async function CallsPage() {
  const calls = await getCalls();

  return (
    <AppShell
      title="Calls"
      actions={
        <Link href="/dialer" className="nexus-btn-primary">
          Open dialer
        </Link>
      }
    >
      {calls.length === 0 ? (
        <div className="nexus-panel px-6 py-16 text-center">
          <p className="text-foreground">No calls yet.</p>
          <p className="text-muted text-sm mt-1">Use the dialer or call from a candidate profile.</p>
        </div>
      ) : (
        <div className="nexus-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="nexus-table min-w-full">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Direction</th>
                  <th>Number</th>
                  <th>Candidate</th>
                  <th>Duration</th>
                  <th>Consent</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => {
                  const number =
                    call.direction === 'inbound' ? call.from_number : call.to_number;
                  const state = getPipelineState(call);
                  return (
                    <tr key={call.id}>
                      <td className="whitespace-nowrap text-muted">
                        {callDisplayDate(call).toLocaleString()}
                      </td>
                      <td className="capitalize whitespace-nowrap">{call.direction}</td>
                      <td className="font-mono text-xs whitespace-nowrap">{number || '—'}</td>
                      <td className="whitespace-nowrap">
                        {call.candidate_id && call.candidate_name ? (
                          <Link href={`/candidates/${call.candidate_id}`} className="nexus-link">
                            {call.candidate_name}
                          </Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">{formatDuration(call.duration_seconds)}</td>
                      <td className="whitespace-nowrap text-muted">
                        {call.consent_confirmed ? 'Recorded' : 'No recording'}
                      </td>
                      <td className="whitespace-nowrap text-muted">{pipelineLabel(state)}</td>
                      <td className="text-right whitespace-nowrap">
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
        </div>
      )}
    </AppShell>
  );
}
