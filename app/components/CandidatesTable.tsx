'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CandidateListItem } from '@/lib/types';

const STATUS_OPTIONS = ['new', 'screening', 'interviewing', 'offer', 'hired', 'rejected'] as const;

type EditableField = 'name' | 'email' | 'phone' | 'current_role' | 'status';

interface CandidatesTableProps {
  initialCandidates: CandidateListItem[];
}

export function CandidatesTable({ initialCandidates }: CandidatesTableProps) {
  const router = useRouter();
  const [candidates, setCandidates] = useState(initialCandidates);
  const [editingCell, setEditingCell] = useState<{ id: string; field: EditableField } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function startEdit(candidate: CandidateListItem, field: EditableField) {
    setEditingCell({ id: candidate.id, field });
    setEditValue(String(candidate[field] ?? ''));
    setError('');
  }

  async function saveEdit() {
    if (!editingCell) return;

    setSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/candidates/${editingCell.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [editingCell.field]: editValue || null }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');

      setCandidates((prev) =>
        prev.map((c) =>
          c.id === editingCell.id
            ? {
                ...c,
                name: data.name,
                email: data.email,
                phone: data.phone,
                status: data.status,
                current_role: data.current_role,
              }
            : c
        )
      );
      setEditingCell(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') setEditingCell(null);
  }

  async function handleDelete(candidate: CandidateListItem) {
    if (
      !window.confirm(
        `Move “${candidate.name}” to Trash? You can restore them within 30 days.`
      )
    ) {
      return;
    }

    setDeletingId(candidate.id);
    setError('');
    try {
      const res = await fetch(`/api/candidates/${candidate.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  }

  function renderCell(candidate: CandidateListItem, field: EditableField, display?: string) {
    const isEditing = editingCell?.id === candidate.id && editingCell?.field === field;

    if (isEditing) {
      if (field === 'status') {
        return (
          <select
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={handleKeyDown}
            disabled={saving}
            className="nexus-input py-1"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        );
      }

      return (
        <input
          autoFocus
          type={field === 'email' ? 'email' : 'text'}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={handleKeyDown}
          disabled={saving}
          className="nexus-input py-1"
        />
      );
    }

    return (
      <button
        type="button"
        onClick={() => startEdit(candidate, field)}
        className="text-left w-full rounded px-1 py-0.5 -mx-1 hover:bg-background transition-colors capitalize"
        title="Click to edit"
      >
        {display ?? (candidate[field] as string) ?? <span className="text-muted">—</span>}
      </button>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="nexus-panel px-6 py-16 text-center">
        <p className="text-foreground">No candidates yet.</p>
        <p className="text-muted text-sm mt-1">Upload a resume to create your first entry.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-sm text-[color:var(--danger)] border border-border bg-panel px-4 py-2">
          {error}
        </div>
      )}
      <p className="text-muted text-xs">Click a cell to edit. Enter saves, Escape cancels.</p>
      <div className="nexus-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="nexus-table min-w-full">
            <thead>
              <tr>
                {['Name', 'Email', 'Role', 'Phone', 'Status', 'Added', ''].map((col) => (
                  <th key={col || 'actions'}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => (
                <tr key={candidate.id}>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Link href={`/candidates/${candidate.id}`} className="nexus-link shrink-0 text-xs">
                        Open
                      </Link>
                      <div className="min-w-[140px] font-medium">{renderCell(candidate, 'name')}</div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap min-w-[160px]">{renderCell(candidate, 'email')}</td>
                  <td className="whitespace-nowrap min-w-[140px]">{renderCell(candidate, 'current_role')}</td>
                  <td className="whitespace-nowrap min-w-[120px]">{renderCell(candidate, 'phone')}</td>
                  <td className="whitespace-nowrap min-w-[110px] capitalize">
                    {renderCell(candidate, 'status')}
                  </td>
                  <td className="whitespace-nowrap text-muted">
                    {new Date(candidate.created_at).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(candidate)}
                      disabled={deletingId === candidate.id}
                      className="text-xs text-muted hover:text-[color:var(--danger)] transition-colors"
                    >
                      {deletingId === candidate.id ? '…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
