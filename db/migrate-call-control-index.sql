-- Webhook lookups fall back to telnyx_call_control_id when client_state is missing.
-- Run against an existing DB:
--   docker compose exec -T db psql -U nexus -d nexus < db/migrate-call-control-index.sql

CREATE INDEX IF NOT EXISTS calls_telnyx_call_control_id_idx
  ON calls(telnyx_call_control_id);
