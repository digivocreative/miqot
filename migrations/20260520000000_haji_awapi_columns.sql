ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS nomor_porsi TEXT;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS nomor_spph TEXT;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS tgl_lahir DATE;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS no_paspor TEXT;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS paspor_expired DATE;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS paket_harga BIGINT;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS diskon_marketing BIGINT;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS diskon_kantor BIGINT;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS bayar BIGINT;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS sisa BIGINT;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS tgl_daftar DATE;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS tgl_berangkat DATE;
ALTER TABLE jamaah_haji ADD COLUMN IF NOT EXISTS dokumen JSONB;

CREATE INDEX IF NOT EXISTS idx_jamaah_haji_agent_masehi
  ON jamaah_haji(agent_id, thn_masehi);

CREATE INDEX IF NOT EXISTS idx_jamaah_haji_agent_tgl_berangkat
  ON jamaah_haji(agent_id, tgl_berangkat)
  WHERE tgl_berangkat IS NOT NULL;

NOTIFY pgrst, 'reload schema';
