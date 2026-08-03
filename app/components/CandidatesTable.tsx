'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CandidateListItem } from '@/lib/types';
import { PIPELINE_STAGES } from '@/lib/types';

type EditableField = 'name' | 'email' | 'phone' | 'current_role' | 'status';

interface CandidatesTableProps {
  initialCandidates: CandidateListItem[];
}

// ── Search bar ─────────────────────────────────────────────────────────────────

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  loading: boolean;
  resultCount?: number | null;
}

function SearchBar({ value, onChange, onClear, loading, resultCount }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded border border-border bg-panel px-3 h-10 focus-within:border-accent transition-colors">
        <span className="shrink-0 text-muted" aria-hidden="true">
          {loading ? (
            <svg
              className="animate-spin"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          )}
        </span>

        <input
          ref={inputRef}
          id="candidate-search"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search by name, phone, role, or skill…"
          aria-label="Search candidates"
          className="min-w-0 flex-1 border-0 bg-transparent py-0 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-0"
        />

        {value && (
          <button
            type="button"
            onClick={() => {
              onClear();
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="shrink-0 text-muted hover:text-foreground transition-colors px-0.5"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
        {typeof resultCount === 'number' && !loading && (
          <p className="text-xs text-muted whitespace-nowrap">
            {resultCount} result{resultCount !== 1 ? 's' : ''}
          </p>
        )}
        <p className="hidden text-xs text-muted sm:block whitespace-nowrap">
          Click a cell to edit
        </p>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CandidatesTable({ initialCandidates }: CandidatesTableProps) {
  const router = useRouter();

  // ── Search state ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState(initialCandidates);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether we're showing server-side initial data or live search results
  const [hasSearched, setHasSearched] = useState(false);

  // ── Table editing state ───────────────────────────────────────────────────
  const [editingCell, setEditingCell] = useState<{ id: string; field: EditableField } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Debounced search fetch ────────────────────────────────────────────────
  const fetchCandidates = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const url = q.trim() ? `/api/candidates?q=${encodeURIComponent(q.trim())}` : '/api/candidates';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Search failed');
      const data: CandidateListItem[] = await res.json();
      setCandidates(data);
      setHasSearched(true);
    } catch {
      // silently keep previous results on network error
    } finally {
      setSearching(false);
    }
  }, []);

  function handleSearchChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchCandidates(value);
    }, 300);
  }

  function clearSearch() {
    setQuery('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Reset to initial server-rendered list immediately — no extra fetch needed
    setCandidates(initialCandidates);
    setHasSearched(false);
  }

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ── Cell editing ──────────────────────────────────────────────────────────
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
            ? { ...c, name: data.name, email: data.email, phone: data.phone, status: data.status, current_role: data.current_role }
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
    if (!window.confirm(`Move "${candidate.name}" to Trash? You can restore them within 30 days.`)) return;
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
            {PIPELINE_STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
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

    const capitalize = field === 'status' || field === 'name' || field === 'current_role';
    return (
      <button
        type="button"
        onClick={() => startEdit(candidate, field)}
        className={`text-left w-full rounded px-1 py-0.5 -mx-1 hover:bg-background transition-colors${capitalize ? ' capitalize' : ''}`}
        title="Click to edit"
      >
        {display ?? (candidate[field] as string) ?? <span className="text-muted">—</span>}
      </button>
    );
  }

  // ── Empty states ──────────────────────────────────────────────────────────
  const showNoResults = !searching && candidates.length === 0;
  const isSearchActive = query.trim().length > 0;

  // When there are no candidates at all (not a search issue)
  const totalIsEmpty = !isSearchActive && !hasSearched && initialCandidates.length === 0;

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-sm text-[color:var(--danger)] border border-border bg-panel px-4 py-2">
          {error}
        </div>
      )}

      <div className="nexus-panel overflow-hidden">
        {/* Search toolbar — top strip of the list panel */}
        <div className="border-b border-border px-3 py-2 bg-panel">
          <SearchBar
            value={query}
            onChange={handleSearchChange}
            onClear={clearSearch}
            loading={searching}
            resultCount={isSearchActive && !searching ? candidates.length : null}
          />
        </div>

        {totalIsEmpty && (
          <div className="px-6 py-16 text-center">
            <p className="text-foreground">No candidates yet.</p>
            <p className="text-muted text-sm mt-1">Upload a resume to create your first entry.</p>
          </div>
        )}

        {showNoResults && isSearchActive && (
          <div className="px-6 py-14 text-center space-y-3">
            <p className="text-foreground font-medium">
              No candidates match &ldquo;{query}&rdquo;
            </p>
            <p className="text-muted text-sm">
              Try a different name, phone, email, role, or skill.
            </p>
            <button type="button" onClick={clearSearch} className="nexus-btn-secondary text-sm">
              Clear search
            </button>
          </div>
        )}

        {candidates.length > 0 && (
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
        )}
      </div>
    </div>
  );
}
