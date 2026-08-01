-- Cabut TRUNCATE / TRIGGER / REFERENCES dari role publik (anon, authenticated).
--
-- Latar: Supabase secara default memberi `GRANT ALL` ke anon & authenticated
-- pada setiap tabel (36/36 tabel di schema public). Untuk INSERT/UPDATE/DELETE
-- hal itu tidak berbahaya di sini karena SETIAP tabel hanya punya policy
-- "Service role only" — RLS menutupnya.
--
-- TRUNCATE berbeda: **TRUNCATE TIDAK tunduk pada RLS**. Policy sebanyak apa pun
-- tidak menahannya; yang menahan hanya ketiadaan GRANT. Hari ini tidak
-- terjangkau dari luar (PostgREST tidak punya verb TRUNCATE, dan tidak ada
-- fungsi SECURITY DEFINER yang bisa dipanggil anon), jadi ini pengerasan
-- berlapis — menghapus senjata yang memang tak pernah dipakai aplikasi.
--
-- TRIGGER (boleh memasang trigger ke tabel) dan REFERENCES (boleh membuat FK
-- yang mengacu ke tabel) juga tidak pernah dipakai lewat PostgREST dan sama-
-- sama tidak diatur RLS, jadi ikut dicabut.
--
-- SELECT/INSERT/UPDATE/DELETE sengaja TIDAK disentuh: yang mengaturnya adalah
-- RLS, dan mencabutnya akan membuat policy anon di masa depan gagal diam-diam.
--
-- ALTER DEFAULT PRIVILEGES memakai FOR ROLE current_user (implisit) supaya
-- tabel BARU tidak otomatis mendapat ketiga privilege ini lagi.
--
-- CARA JALAN — wajib DUA KALI, karena grantor-nya dua role berbeda
-- (postgres memberi 32 tabel, supabase_admin memberi 4) dan REVOKE hanya
-- berlaku untuk grant yang diberikan oleh role tersebut:
--   docker exec -i sb-db psql -U postgres       -d postgres < file.sql
--   docker exec -i sb-db psql -U supabase_admin -d postgres < file.sql
-- REVOKE oleh non-grantor hanya menghasilkan warning, bukan error.

BEGIN;

REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;

COMMIT;
