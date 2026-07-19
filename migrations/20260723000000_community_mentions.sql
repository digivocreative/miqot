BEGIN;

-- Teras @mentions. One row per (mentioned agent, source post/comment). Powers the
-- in-app "kamu disebut" inbox + unread badge and the Telegram nudge. Pill
-- rendering does NOT read this table — it re-parses the body — so a missing table
-- degrades gracefully (posts/comments still work, mentions just aren't recorded).
CREATE TABLE IF NOT EXISTS community_mentions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentioned_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  author_agent_id    UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  post_id            UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  comment_id         UUID REFERENCES community_post_comments(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at            TIMESTAMPTZ
);

-- Inbox list (newest first) and unread badge lookups.
CREATE INDEX IF NOT EXISTS community_mentions_inbox_idx
  ON community_mentions (mentioned_agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS community_mentions_unread_idx
  ON community_mentions (mentioned_agent_id)
  WHERE seen_at IS NULL;

-- Idempotent recording: one mention per target per source. NULL comment_id (a
-- post-level mention) is not comparable under a plain UNIQUE, so split into two
-- partial unique indexes.
CREATE UNIQUE INDEX IF NOT EXISTS community_mentions_uniq_post
  ON community_mentions (mentioned_agent_id, post_id)
  WHERE comment_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS community_mentions_uniq_comment
  ON community_mentions (mentioned_agent_id, comment_id)
  WHERE comment_id IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
