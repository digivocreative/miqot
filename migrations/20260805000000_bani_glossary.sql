BEGIN;

CREATE TABLE IF NOT EXISTS public.bani_glossary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  istilah TEXT NOT NULL,
  sinonim TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  tafsir TEXT NOT NULL,
  filter JSONB NOT NULL,
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  catatan TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bani_glossary_istilah_lowercase
    CHECK (istilah = lower(btrim(istilah)) AND istilah <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bani_glossary_istilah
  ON public.bani_glossary (istilah);

CREATE INDEX IF NOT EXISTS idx_bani_glossary_sinonim_gin
  ON public.bani_glossary USING GIN (sinonim);

ALTER TABLE public.bani_glossary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bani_glossary_service_role_read ON public.bani_glossary;
CREATE POLICY bani_glossary_service_role_read
  ON public.bani_glossary
  FOR SELECT
  TO service_role
  USING (TRUE);

REVOKE ALL ON public.bani_glossary FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.bani_glossary TO service_role;

INSERT INTO public.bani_glossary (istilah, sinonim, tafsir, filter)
VALUES
  (
    'tahun baru',
    ARRAY['newyear', 'malam tahun baru', 'pergantian tahun'],
    'keberangkatan yang masih berjalan saat malam pergantian tahun',
    '{"covers_date":"{{TAHUN_INI}}-12-31"}'::JSONB
  ),
  (
    'salju',
    ARRAY['musim salju', 'winter', 'bersalju'],
    'paket Tur Turki yang berangkat pada musim dingin Desember sampai Februari',
    '{"tur":"Tur Turki","berangkat_from":"{{TAHUN_INI}}-12-01","berangkat_to":"{{TAHUN_DEPAN}}-02-28"}'::JSONB
  ),
  (
    'lebaran',
    ARRAY['idul fitri', 'hari raya idul fitri', 'paket lebaran'],
    'paket yang namanya menyebut program Lebaran atau Idul Fitri',
    '{"search_any":["lebaran","idul fitri"]}'::JSONB
  ),
  (
    'libur sekolah',
    ARRAY['liburan sekolah', 'school holiday'],
    'paket yang namanya ditujukan untuk masa libur sekolah',
    '{"search_any":["libur sekolah","liburan sekolah","school holiday"]}'::JSONB
  ),
  (
    'akhir tahun',
    ARRAY['penghujung tahun', 'year end'],
    'keberangkatan sepanjang Desember tahun ini',
    '{"berangkat_from":"{{TAHUN_INI}}-12-01","berangkat_to":"{{TAHUN_INI}}-12-31"}'::JSONB
  ),
  (
    'awal tahun',
    ARRAY['permulaan tahun', 'awal januari'],
    'keberangkatan sepanjang Januari tahun depan',
    '{"berangkat_from":"{{TAHUN_DEPAN}}-01-01","berangkat_to":"{{TAHUN_DEPAN}}-01-31"}'::JSONB
  ),
  (
    'plus turki',
    ARRAY['tur turki', 'umroh plus turki', 'turkey'],
    'paket yang itinerary tersimpannya mencakup Tur Turki',
    '{"tur":"Tur Turki"}'::JSONB
  ),
  (
    'plus dubai',
    ARRAY['tur dubai', 'umroh plus dubai'],
    'paket yang itinerary tersimpannya mencakup Tur Dubai',
    '{"tur":"Tur Dubai"}'::JSONB
  ),
  (
    'plus aqsha',
    ARRAY['tur aqsha', 'umroh plus aqsha', 'plus aqsa'],
    'paket yang itinerary tersimpannya mencakup Tur Aqsha',
    '{"tur":"Tur Aqsha"}'::JSONB
  )
ON CONFLICT (istilah) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
