ALTER TABLE public.calendar_events
ADD COLUMN IF NOT EXISTS mutawif text;

COMMENT ON COLUMN public.calendar_events.mutawif IS
  'Nama mutawif dari kolom MUTAWIF sumber kalender; terpisah dari STAFF.';
