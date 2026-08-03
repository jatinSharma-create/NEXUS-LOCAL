'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PIPELINE_STAGES, type PipelineStage } from '@/lib/types';

interface StatusDropdownProps {
  candidateId: string;
  initialStatus: PipelineStage;
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  interviewing: 'Interviewing',
  placed: 'Placed',
  rejected: 'Rejected',
};

const STAGE_COLORS: Record<PipelineStage, string> = {
  new: 'var(--muted)',
  contacted: '#60a5fa',
  interviewing: '#a78bfa',
  placed: '#34d399',
  rejected: 'var(--danger)',
};

export function StatusDropdown({ candidateId, initialStatus }: StatusDropdownProps) {
  const router = useRouter();
  const [status, setStatus] = useState<PipelineStage>(initialStatus);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as PipelineStage;
    const prev = status;
    setStatus(next);
    setError('');

    try {
      const res = await fetch(`/api/candidates/${candidateId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update status');

      startTransition(() => router.refresh());
    } catch (err) {
      setStatus(prev);
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="relative">
        <select
          id="candidate-status-dropdown"
          value={status}
          onChange={handleChange}
          disabled={isPending}
          aria-label="Pipeline stage"
          style={{
            color: STAGE_COLORS[status],
            borderColor: STAGE_COLORS[status],
            opacity: isPending ? 0.6 : 1,
          }}
          className="nexus-input text-sm font-medium py-1 pl-3 pr-8 capitalize appearance-none cursor-pointer bg-panel rounded border transition-colors"
        >
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        {/* custom chevron */}
        <span
          className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-muted"
          aria-hidden="true"
        >
          ▾
        </span>
      </div>
      {error && <p className="text-xs text-[color:var(--danger)]">{error}</p>}
    </div>
  );
}
