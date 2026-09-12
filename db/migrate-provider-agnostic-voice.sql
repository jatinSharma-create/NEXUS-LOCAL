-- Make the calls schema provider-neutral so the app is not tied to Telnyx.
--
-- Safe to run more than once. Run against an existing database with:
--   docker compose exec -T db psql -U nexus -d nexus < db/migrate-provider-agnostic-voice.sql

BEGIN;

-- 1. Rename the Telnyx-specific identifier columns.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calls' AND column_name = 'telnyx_call_control_id'
  ) THEN
    ALTER TABLE calls RENAME COLUMN telnyx_call_control_id TO provider_call_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calls' AND column_name = 'telnyx_recording_id'
  ) THEN
    ALTER TABLE calls RENAME COLUMN telnyx_recording_id TO provider_recording_id;
  END IF;
END $$;

-- 2. Add the new neutral columns.
ALTER TABLE calls ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS provider_call_id TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS agent_provider_call_id TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS provider_recording_id TEXT;

-- 3. Existing rows were all placed through Telnyx.
UPDATE calls SET provider = 'telnyx' WHERE provider IS NULL;

-- 4. Per-leg call state, replacing client_state and the in-memory IVR flags.
CREATE TABLE IF NOT EXISTS call_sessions (
    provider_call_id TEXT PRIMARY KEY,
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    leg TEXT NOT NULL CHECK (leg IN ('candidate', 'agent', 'inbound')),
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS call_sessions_call_id_idx ON call_sessions(call_id);

-- 5. Reindex against the renamed columns.
DROP INDEX IF EXISTS calls_telnyx_call_control_id_idx;
CREATE INDEX IF NOT EXISTS calls_provider_call_id_idx ON calls(provider_call_id);
CREATE INDEX IF NOT EXISTS calls_agent_provider_call_id_idx ON calls(agent_provider_call_id);

-- 6. client_state held transient Telnyx routing data only; nothing reads it now.
ALTER TABLE calls DROP COLUMN IF EXISTS client_state;

COMMIT;
