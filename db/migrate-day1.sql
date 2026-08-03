-- ============================================================
-- Day 1 Migration: Status Pipeline & Candidate Notes
-- ============================================================
-- Run once against an existing database.
-- Safe to run on a fresh DB too (guarded with IF NOT EXISTS / DO blocks).
-- ============================================================

-- 1. Normalise any out-of-range status values to 'new'
--    so the CHECK constraint below won't violate existing rows.
UPDATE candidates
SET status = 'new'
WHERE status NOT IN ('new', 'contacted', 'interviewing', 'placed', 'rejected');

-- 2. Add the CHECK constraint (idempotent — skip if it already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'candidates_status_check'
      AND conrelid = 'candidates'::regclass
  ) THEN
    ALTER TABLE candidates
      ADD CONSTRAINT candidates_status_check
      CHECK (status IN ('new', 'contacted', 'interviewing', 'placed', 'rejected'));
  END IF;
END
$$;

-- 3. Create candidate_notes table
CREATE TABLE IF NOT EXISTS candidate_notes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  note_text    TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Composite index: lookups by candidate ordered newest-first
CREATE INDEX IF NOT EXISTS candidate_notes_candidate_id_created_at_idx
  ON candidate_notes (candidate_id, created_at DESC);
