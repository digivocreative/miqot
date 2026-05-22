ALTER TABLE umroh_schedules ADD COLUMN IF NOT EXISTS brosur_source_sha256 TEXT;
ALTER TABLE umroh_schedules ADD COLUMN IF NOT EXISTS brosur_source_bytes INTEGER;
ALTER TABLE umroh_schedules ADD COLUMN IF NOT EXISTS brosur_source_content_type TEXT;
ALTER TABLE umroh_schedules ADD COLUMN IF NOT EXISTS brosur_cdn_synced_at TIMESTAMPTZ;

ALTER TABLE umroh_schedules ADD COLUMN IF NOT EXISTS itinerary_source_sha256 TEXT;
ALTER TABLE umroh_schedules ADD COLUMN IF NOT EXISTS itinerary_source_bytes INTEGER;
ALTER TABLE umroh_schedules ADD COLUMN IF NOT EXISTS itinerary_source_content_type TEXT;
ALTER TABLE umroh_schedules ADD COLUMN IF NOT EXISTS itinerary_cdn_synced_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
