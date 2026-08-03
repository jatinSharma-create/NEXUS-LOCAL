import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { CandidatesTable } from '@/components/CandidatesTable';
import { getCandidates } from '@/lib/candidates';

export const dynamic = 'force-dynamic';

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
