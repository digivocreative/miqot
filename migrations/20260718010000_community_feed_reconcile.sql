BEGIN;

-- Deployment order matters: deploy the compatible Teras server and drain every
-- older instance before running this migration. Older builds still read `type`
-- and use the discarded three-column reaction conflict target.

-- Reconcile installations that already ran the discarded typed-community draft.
-- The final Teras product has free-form posts and no technical post category.
ALTER TABLE community_posts
  DROP COLUMN IF EXISTS type;

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

-- The discarded draft allowed one row per reaction value. Keep the latest row
-- per agent/post before restoring the final one-reaction-per-person invariant.
DELETE FROM community_post_reactions AS older
USING community_post_reactions AS newer
WHERE older.post_id = newer.post_id
  AND older.agent_id = newer.agent_id
  AND (
    older.created_at < newer.created_at
    OR (older.created_at = newer.created_at AND older.ctid < newer.ctid)
  );

ALTER TABLE community_post_reactions
  DROP CONSTRAINT IF EXISTS community_post_reactions_pkey;

ALTER TABLE community_post_reactions
  ADD CONSTRAINT community_post_reactions_pkey PRIMARY KEY (post_id, agent_id);

COMMIT;

NOTIFY pgrst, 'reload schema';
