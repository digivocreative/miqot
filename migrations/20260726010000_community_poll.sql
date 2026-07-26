-- Polling ala Threads pada kiriman Teras. Satu poll per kiriman (segmen
-- pertama utas), 2-4 opsi teks di jsonb (immutable setelah dibuat), durasi
-- tetap 24 jam via ends_at. Suara satu per agent, boleh diganti selama
-- polling terbuka (upsert), tidak bisa dicabut.
CREATE TABLE IF NOT EXISTS community_polls (
  post_id UUID PRIMARY KEY REFERENCES community_posts(id) ON DELETE CASCADE,
  options JSONB NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_poll_votes (
  post_id UUID NOT NULL REFERENCES community_polls(post_id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  option_index SMALLINT NOT NULL CHECK (option_index BETWEEN 0 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, agent_id)
);

ALTER TABLE community_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_poll_votes ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
