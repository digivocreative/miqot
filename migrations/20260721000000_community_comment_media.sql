BEGIN;

ALTER TABLE community_post_comments
  ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE community_post_comments
SET media = '[]'::jsonb
WHERE media IS NULL;

ALTER TABLE community_post_comments
  ALTER COLUMN media SET DEFAULT '[]'::jsonb,
  ALTER COLUMN media SET NOT NULL;

-- Reuses community_post_media_is_valid() defined in
-- 20260720000000_community_post_media.sql — run that migration first.
ALTER TABLE community_post_comments
  DROP CONSTRAINT IF EXISTS community_post_comments_media_shape_check;

ALTER TABLE community_post_comments
  ADD CONSTRAINT community_post_comments_media_shape_check
  CHECK (community_post_media_is_valid(media));

COMMIT;

NOTIFY pgrst, 'reload schema';
