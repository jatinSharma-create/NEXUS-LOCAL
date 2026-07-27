-- Run against an existing DB (init.sql only applies on first volume create):
--   docker compose exec -T db psql -U nexus -d nexus < db/migrate-day5-fixes.sql

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS recording_consent_declined BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_consent_note TEXT,
  ADD COLUMN IF NOT EXISTS recording_consent_at TIMESTAMPTZ;

ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill created_at for existing rows from started_at / ended_at when possible
UPDATE calls
SET created_at = COALESCE(started_at, ended_at, NOW())
WHERE created_at IS NULL;
