import { AppShell } from '@/components/AppShell';
import { KeypadDialer } from '@/components/KeypadDialer';

export default function DialerPage() {
  return (
    <AppShell title="Dialer">
      <p className="text-sm text-muted mb-6 max-w-md">
        Place an outbound call. Matched candidates are linked automatically.
      </p>
      <KeypadDialer />
    </AppShell>
  );
}
