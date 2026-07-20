BEGIN;

-- Teras `@semua`: satu tanda di kirimannya, bukan fan-out satu baris mention
-- per agent. Lonceng menurunkan notifikasi dari tanda ini, jadi agent yang baru
-- bergabung pun ikut melihat broadcast lama tanpa backfill.
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS mentions_everyone BOOLEAN NOT NULL DEFAULT false;

-- Cek kuota harian: kiriman ber-@semua milik satu agent, terbaru dulu.
CREATE INDEX IF NOT EXISTS community_posts_broadcast_quota_idx
  ON community_posts (agent_id, created_at DESC)
  WHERE mentions_everyone;

-- Sumber lonceng: broadcast terbaru lintas agent.
CREATE INDEX IF NOT EXISTS community_posts_broadcast_feed_idx
  ON community_posts (created_at DESC)
  WHERE mentions_everyone;

COMMIT;

NOTIFY pgrst, 'reload schema';
