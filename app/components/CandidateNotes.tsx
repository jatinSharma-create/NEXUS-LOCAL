'use client';

import { useState, useEffect, useRef } from 'react';
import type { CandidateNote } from '@/lib/types';

interface CandidateNotesProps {
  candidateId: string;
}

function formatNoteDate(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatNoteDateFull(date: Date | string): string {
  return new Date(date).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CandidateNotes({ candidateId }: CandidateNotesProps) {
  const [notes, setNotes] = useState<CandidateNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/candidates/${candidateId}/notes`)
      .then((r) => r.json())
      .then((data: CandidateNote[]) => {
        if (!cancelled) setNotes(data);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load notes.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [candidateId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = noteText.trim();
    if (!text) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteText: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add note');

      setNotes((prev) => [data as CandidateNote, ...prev]);
      setNoteText('');
      setFocused(false);
      // Scroll notes list to top to show new note
      listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl + Enter submits
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
    // Escape clears focus
    if (e.key === 'Escape') {
      setFocused(false);
      textareaRef.current?.blur();
    }
  }

  const hasText = noteText.trim().length > 0;

  return (
    <aside
      aria-label="Recruiter Notes"
      className="flex flex-col"
      style={{
        height: 'calc(100vh - 6rem)',
        minHeight: '400px',
      }}
    >
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-panel rounded-t">
        <div className="flex items-center gap-2">
          {/* Pencil icon */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted"
            aria-hidden="true"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          <span className="text-xs font-semibold text-muted uppercase tracking-wide">
            Notes
          </span>
        </div>
        {!loading && notes.length > 0 && (
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{
              background: 'var(--background)',
              color: 'var(--muted)',
              border: '1px solid var(--border)',
            }}
          >
            {notes.length}
          </span>
        )}
      </div>

      {/* ── Compose area ─────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className="border-b border-border bg-panel px-4 py-3 space-y-2 flex-shrink-0"
      >
        <textarea
          id="new-note-textarea"
          ref={textareaRef}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { if (!hasText) setFocused(false); }}
          onKeyDown={handleKeyDown}
          placeholder="Add a note… (⌘↵ to save)"
          rows={focused || hasText ? 4 : 2}
          disabled={submitting}
          aria-label="New note"
          style={{
            transition: 'height 0.15s ease',
            resize: focused || hasText ? 'vertical' : 'none',
          }}
          className="nexus-input w-full text-sm leading-relaxed"
        />

        {/* Actions row — only visible when composing */}
        {(focused || hasText) && (
          <div className="flex items-center justify-between">
            {error && <p className="text-xs text-[color:var(--danger)] truncate">{error}</p>}
            {!error && (
              <span className="text-xs text-muted">⌘↵ to save · Esc to cancel</span>
            )}
            <button
              id="add-note-btn"
              type="submit"
              disabled={submitting || !hasText}
              className="nexus-btn-primary text-xs px-3 py-1 ml-auto"
            >
              {submitting ? 'Saving…' : 'Save Note'}
            </button>
          </div>
        )}
      </form>

      {/* ── Notes list (scrollable) ───────────────────────────── */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto bg-background"
        style={{ scrollbarWidth: 'thin' }}
      >
        {loading && (
          <div className="flex items-center justify-center py-10">
            <span className="text-xs text-muted">Loading…</span>
          </div>
        )}

        {!loading && notes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-2">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted opacity-40"
              aria-hidden="true"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <p className="text-xs text-muted">No notes yet.</p>
            <p className="text-xs text-muted opacity-60">
              Click the box above to add one.
            </p>
          </div>
        )}

        {notes.map((note, idx) => (
          <div
            key={note.id}
            className="px-4 py-3 border-b border-border last:border-b-0"
            style={{ background: idx === 0 && notes.length > 1 ? 'var(--panel)' : undefined }}
          >
            {/* Relative timestamp with full date on hover */}
            <time
              dateTime={String(note.created_at)}
              title={formatNoteDateFull(note.created_at)}
              className="block text-xs text-muted mb-1.5 cursor-default select-none"
            >
              {formatNoteDate(note.created_at)}
            </time>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
              {note.note_text}
            </p>
          </div>
        ))}
      </div>

      {/* ── Rounded bottom edge ──────────────────────────────── */}
      <div className="h-0 border-b border-border rounded-b bg-panel" />
    </aside>
  );
}
