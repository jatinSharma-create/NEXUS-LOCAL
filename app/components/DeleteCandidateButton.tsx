'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DeleteCandidateButton({
  candidateId,
  candidateName,
}: {
  candidateId: string;
  candidateName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (
      !window.confirm(
        `Move “${candidateName}” to Trash? You can restore them within 30 days.`
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      router.push('/candidates');
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      className="nexus-btn-danger text-sm"
    >
      {loading ? '…' : 'Delete'}
    </button>
  );
}
