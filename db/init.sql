CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT NOT NULL,
    resume_url TEXT,
    parsed_json JSONB,
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'interviewing', 'placed', 'rejected')),
    last_call_summary TEXT,
    do_not_contact BOOLEAN DEFAULT false,
    opt_out_at TIMESTAMPTZ,
    opt_out_source TEXT,
    recording_consent_declined BOOLEAN DEFAULT false,
    recording_consent_note TEXT,
    recording_consent_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX candidates_phone_active_idx ON candidates(phone) WHERE deleted_at IS NULL;

CREATE TABLE calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
    telnyx_call_control_id TEXT,
    client_state TEXT,
    recording_url TEXT,
    transcript_text TEXT,
    transcript_pdf_url TEXT,
    summary_text TEXT,
    key_points JSONB,
    duration_seconds INT,
    consent_confirmed BOOLEAN DEFAULT false,
    direction TEXT DEFAULT 'outbound',
    from_number TEXT,
    to_number TEXT,
    consent_method TEXT,
    consent_at TIMESTAMPTZ,
    consent_retries INT DEFAULT 0,
    recording_started_at TIMESTAMPTZ,
    telnyx_recording_id TEXT,
    hangup_cause TEXT,
    status TEXT DEFAULT 'initiating',
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX calls_candidate_id_idx ON calls(candidate_id);
CREATE INDEX calls_telnyx_call_control_id_idx ON calls(telnyx_call_control_id);

CREATE TABLE candidate_notes (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    note_text    TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX candidate_notes_candidate_id_created_at_idx
    ON candidate_notes (candidate_id, created_at DESC);
