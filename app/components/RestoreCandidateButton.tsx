'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function RestoreCandidateButton({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRestore() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/candidates/${candidateId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to restore');
      router.push(`/candidates/${candidateId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore');
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleRestore}
        disabled={loading}
        className="nexus-btn-secondary text-sm"
      >
        {loading ? '…' : 'Restore'}
      </button>
      {error && <span className="text-xs text-[color:var(--danger)]">{error}</span>}
    </div>
  );
}
