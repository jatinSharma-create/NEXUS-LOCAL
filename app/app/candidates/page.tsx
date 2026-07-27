import Link from 'next/link';
import { query } from '@/lib/db';
import { AppShell } from '@/components/AppShell';
import { CandidatesTable } from '@/components/CandidatesTable';
import type { CandidateListItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function getCandidates(): Promise<CandidateListItem[]> {
  const result = await query<CandidateListItem>(
    `SELECT id, name, email, phone, status, parsed_json->>'current_role' as current_role, created_at
     FROM candidates
     WHERE deleted_at IS NULL
     ORDER BY created_at DESC`
  );
  return result.rows;
}

export default async function CandidatesPage() {
  const candidates = await getCandidates();

  return (
    <AppShell
      title="Candidates"
      actions={
        <Link href="/candidates/upload" className="nexus-btn-primary">
          Upload resume
        </Link>
      }
    >
      <CandidatesTable initialCandidates={candidates} />
    </AppShell>
  );
}
