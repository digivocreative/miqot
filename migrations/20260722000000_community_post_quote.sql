ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS quoted_post_id UUID REFERENCES community_posts(id);

CREATE INDEX IF NOT EXISTS idx_community_posts_quoted
  ON community_posts (quoted_post_id)
  WHERE quoted_post_id IS NOT NULL AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
