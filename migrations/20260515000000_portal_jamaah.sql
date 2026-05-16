CREATE TABLE jamaah_portal_tokens (
  token TEXT PRIMARY KEY,
  jamaah_id INTEGER NOT NULL REFERENCES jamaah(id) ON DELETE CASCADE,
  id_umroh TEXT NOT NULL,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  consumed_ip TEXT,
  consumed_user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jamaah_portal_tokens_id_umroh ON jamaah_portal_tokens(id_umroh);
CREATE INDEX idx_jamaah_portal_tokens_agent_id ON jamaah_portal_tokens(agent_id);

CREATE TABLE jamaah_portal_sessions (
  session_token TEXT PRIMARY KEY,
  id_umroh TEXT NOT NULL,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  initiating_jamaah_id INTEGER REFERENCES jamaah(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jamaah_portal_sessions_id_umroh ON jamaah_portal_sessions(id_umroh);
CREATE INDEX idx_jamaah_portal_sessions_agent_id ON jamaah_portal_sessions(agent_id);

CREATE TABLE booking_persiapan (
  id_umroh TEXT PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tahapan JSONB NOT NULL DEFAULT '{}'::jsonb,
  spiritual JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_persiapan_agent_id ON booking_persiapan(agent_id);

ALTER TABLE jamaah_portal_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE jamaah_portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_persiapan ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
