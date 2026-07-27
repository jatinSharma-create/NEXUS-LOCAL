-- Soft-delete candidates with 30-day recovery window.
-- Run against an existing DB (init.sql only applies on first volume create):
--   docker compose exec -T db psql -U nexus -d nexus < db/migrate-soft-delete.sql

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DROP INDEX IF EXISTS candidates_phone_idx;

CREATE UNIQUE INDEX IF NOT EXISTS candidates_phone_active_idx
  ON candidates(phone) WHERE deleted_at IS NULL;
