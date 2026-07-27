import Link from 'next/link';

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
}

const NAV = [
  { href: '/candidates', label: 'Candidates' },
  { href: '/calls', label: 'Calls' },
  { href: '/dialer', label: 'Dialer' },
  { href: '/candidates/upload', label: 'Upload' },
] as const;

export function AppShell({ children, title, actions }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-panel sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-6">
          <div className="flex items-center gap-8 min-w-0">
            <Link href="/" className="font-display text-lg font-semibold text-foreground tracking-tight shrink-0">
              Nexus
            </Link>
            <nav className="hidden sm:flex items-center gap-5 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-muted hover:text-foreground transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <Link href="/trash" className="text-sm text-muted hover:text-foreground transition-colors shrink-0">
            Trash
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {(title || actions) && (
          <div className="flex items-center justify-between gap-4 mb-6">
            {title && <h1 className="font-display text-2xl font-semibold text-foreground">{title}</h1>}
            {actions}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
