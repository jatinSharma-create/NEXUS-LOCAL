-- Run against an existing DB (init.sql only applies on first volume create):
--   docker compose exec db psql -U nexus -d nexus -f /dev/stdin < db/migrate-recording-consent.sql
-- Or:
--   docker compose exec -T db psql -U nexus -d nexus < db/migrate-recording-consent.sql

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS recording_consent_declined BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_consent_note TEXT,
  ADD COLUMN IF NOT EXISTS recording_consent_at TIMESTAMPTZ;
