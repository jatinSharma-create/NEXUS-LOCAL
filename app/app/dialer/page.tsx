import { AppShell } from '@/components/AppShell';
import { KeypadDialer } from '@/components/KeypadDialer';

export default function DialerPage() {
  return (
    <AppShell title="Dialer">
      <p className="text-sm text-muted mb-6 max-w-md">
        Call any number. Matched candidates are linked automatically; otherwise the call appears in
        Calls only.
      </p>
      <KeypadDialer />
    </AppShell>
  );
}
