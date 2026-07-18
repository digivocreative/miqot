CREATE TABLE IF NOT EXISTS community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  photo_url TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  pinned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES agents(id)
);
CREATE INDEX IF NOT EXISTS idx_community_posts_feed
  ON community_posts (created_at DESC, id DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS community_post_reactions (
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('suka','selamat','aamiin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, agent_id)
);

CREATE TABLE IF NOT EXISTS community_post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_community_comments_post
  ON community_post_comments (post_id, created_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS community_post_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, agent_id)
);

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_post_reports ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
