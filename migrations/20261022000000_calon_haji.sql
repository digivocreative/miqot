-- Daftar Calon Haji (menu Dashboard "Calon Haji 2027"): salinan PDF estimasi
-- jamaah Haji Khusus dari kantor, dipakai bersama semua agent (tidak per agent).
-- Diisi HANYA lewat scripts/import-calon-haji.mjs (lib/calon-haji-store.js):
-- tiap impor = satu baris calon_haji_imports + barisnya di calon_haji;
-- calon_haji_aktif menunjuk impor yang sedang tampil per musim, sehingga
-- penggantian data = satu upsert penunjuk (agent tak pernah melihat data
-- setengah jadi). Dibaca server.js dengan service key → RLS aktif tanpa policy.
--
-- Terapkan: docker exec -i sb-db psql -U postgres -d postgres < migrations/20261022000000_calon_haji.sql
BEGIN;

CREATE TABLE IF NOT EXISTS calon_haji_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  musim int NOT NULL,
  tanggal_data date,
  jumlah int NOT NULL,
  sumber text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calon_haji (
  id bigserial PRIMARY KEY,
  import_id uuid NOT NULL REFERENCES calon_haji_imports(id) ON DELETE CASCADE,
  no_urut int NOT NULL,
  tahap int,
  no_porsi text NOT NULL,
  nik text NOT NULL,
  nama text NOT NULL,
  keterangan text NOT NULL,
  status_cadangan text NOT NULL CHECK (status_cadangan IN ('NON CADANGAN', 'CADANGAN')),
  kepesertaan_jkn text,
  status_jemaah text,
  usia int,
  kab_kota text,
  provinsi text,
  UNIQUE (import_id, no_urut)
);

CREATE TABLE IF NOT EXISTS calon_haji_aktif (
  musim int PRIMARY KEY,
  import_id uuid NOT NULL REFERENCES calon_haji_imports(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE calon_haji_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE calon_haji ENABLE ROW LEVEL SECURITY;
ALTER TABLE calon_haji_aktif ENABLE ROW LEVEL SECURITY;

COMMIT;
