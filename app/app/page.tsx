import Link from 'next/link';
import { AppShell } from '@/components/AppShell';

export default function Home() {
  return (
    <AppShell>
      <div className="min-h-[70vh] flex flex-col justify-center max-w-xl">
        <p className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-foreground">
          Nexus
        </p>
        <p className="mt-4 text-muted text-lg leading-relaxed">
          Screen candidates, place calls, and keep recordings and transcripts in one place.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/candidates" className="nexus-btn-primary">
            Candidates
          </Link>
          <Link href="/dialer" className="nexus-btn-secondary">
            Dialer
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
