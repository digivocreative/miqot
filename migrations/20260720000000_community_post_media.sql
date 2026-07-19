BEGIN;

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Keep this migration safe for installations that may have added the column
-- manually without the final nullability/default contract.
UPDATE community_posts
SET media = '[]'::jsonb
WHERE media IS NULL;

ALTER TABLE community_posts
  ALTER COLUMN media SET DEFAULT '[]'::jsonb,
  ALTER COLUMN media SET NOT NULL;

CREATE OR REPLACE FUNCTION community_post_media_is_valid(value JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  item JSONB;
BEGIN
  IF jsonb_typeof(value) <> 'array' OR jsonb_array_length(value) > 10 THEN
    RETURN false;
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(value)
  LOOP
    IF jsonb_typeof(item) <> 'object'
      OR item->>'type' IS NULL
      OR item->>'type' NOT IN ('image', 'video')
      OR jsonb_typeof(item->'url') IS DISTINCT FROM 'string'
      OR COALESCE(btrim(item->>'url'), '') = ''
    THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

-- Preserve every V1 photo for the plural-media API. `photo_url` deliberately
-- remains in place as the compatibility field for older server/client builds.
UPDATE community_posts
SET media = jsonb_build_array(jsonb_build_object(
  'type', 'image',
  'url', photo_url
))
WHERE photo_url IS NOT NULL
  AND btrim(photo_url) <> ''
  AND media = '[]'::jsonb;

ALTER TABLE community_posts
  DROP CONSTRAINT IF EXISTS community_posts_media_shape_check;

ALTER TABLE community_posts
  ADD CONSTRAINT community_posts_media_shape_check
  CHECK (community_post_media_is_valid(media));

COMMIT;

NOTIFY pgrst, 'reload schema';
