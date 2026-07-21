-- Teras: utas composer (segmen) + komentar dilebur jadi kiriman penuh (balasan).
-- Anak sebuah kiriman adalah baris community_posts biasa dengan parent_post_id
-- + root_post_id terisi; kolom is_reply membedakan keduanya:
--   is_reply = false -> segmen utas (fitur composer, penulis = penulis akar)
--   is_reply = true  -> balasan komentar (fitur balasan, penulis bebas)
--
-- Kolom parent_post_id/root_post_id + tiga indeks utas (idx_community_posts_parent/
-- root/feed_roots) SUDAH DI PRODUKSI lewat rilis fitur utas composer -- bagian itu
-- di bawah ini dibiarkan apa adanya (semua IF NOT EXISTS/idempoten), TIDAK diubah.
-- Yang benar-benar baru bagi produksi di migrasi ini: kolom is_reply + dua
-- indeksnya, backfill komentar lama (Bagian B), dan pemindahan FK
-- community_mentions.comment_id ke community_posts (Bagian A drop + Bagian C add).
--
-- URUTAN WAJIB (jangan ditukar): A → deploy → B → C.
--   1. Jalankan BAGIAN A (kolom is_reply + drop FK lama community_mentions.comment_id).
--   2. Deploy kode baru + restart server. Push/merge ke `main` MEMICU deploy
--      otomatis (webhook -> deploy.sh: pull + build + restart) -- merge ITU
--      SENDIRI adalah langkah deploy, jadi Bagian A harus selesai SEBELUM
--      merge ke main, bukan cuma sebelum "menjalankan Bagian B".
--   3. Jalankan BAGIAN B (backfill komentar lama, is_reply = true) -- SEKALI,
--      SESUDAH deploy. Kalau dijalankan sebelum kode baru hidup, seluruh
--      riwayat komentar mendadak tampil sebagai KIRIMAN INDUK di linimasa,
--      kartu "Jendela Teras", pil "kiriman baru", dan badge -- terlihat SEMUA
--      anggota, selama seluruh durasi deploy.
--   4. Jalankan BAGIAN C (memasang kembali FK mention, kini menunjuk community_posts).
--   5. Nanti setelah yakin: RENAME tabel komentar lama (lihat catatan di bawah).
--
-- Ongkos yang diterima secara sadar antara langkah 2 dan 3: begitu kode baru
-- hidup tapi Bagian B belum dijalankan, komentar LAMA (yang masih hanya baris
-- di community_post_comments, belum tersalin) SEMENTARA tidak tampil sama
-- sekali -- `GET /api/community/posts/:id/comments` mengembalikan daftar
-- kosong dan `comment_count` di kiriman induknya 0. Ini degradasi BACA yang
-- sembuh sendiri begitu Bagian B selesai jalan (data tidak hilang, cuma belum
-- tersalin) -- bukan korupsi data.
--
-- Bagian A aman dijalankan meski Bagian A dari fitur utas composer sudah lebih
-- dulu jalan di prod: semua pernyataan idempoten (IF NOT EXISTS / DROP ... IF
-- EXISTS), jadi menjalankannya dua kali (dulu utas, sekarang balasan) aman.

-- ── BAGIAN A ────────────────────────────────────────────────────────────────
BEGIN;

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS parent_post_id UUID REFERENCES community_posts(id),
  ADD COLUMN IF NOT EXISTS root_post_id   UUID REFERENCES community_posts(id);

-- Pembeda anak-post: balasan komentar (true, penulis bebas) vs segmen utas
-- (false, penulis = penulis akar). Feed utama menyembunyikan semua anak; profil
-- menampilkan balasan tapi menyembunyikan segmen; comment_count hitung balasan saja.
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS is_reply BOOLEAN NOT NULL DEFAULT false;

-- Lepas FK lama community_mentions.comment_id -> community_post_comments SEKARANG,
-- bukan di Bagian C. Ini disengaja: begitu kode baru di-deploy, recordCommunityMentions
-- (server.js) mulai menulis comment_id = id baris community_posts (balasan baru),
-- sementara kode lama yang masih berjalan di jendela transisi menulis comment_id = id
-- baris community_post_comments. Selama masa transisi itu kolomnya menampung DUA jenis
-- id dari DUA tabel berbeda, jadi ia tidak boleh dijaga FK ke tabel lama maupun tabel
-- baru. Tanpa DROP ini, setiap mention pada balasan akan kena galat FK 23503 saat
-- insert, ditangkap cuma dengan console.error, lalu hilang senyap selamanya (tidak ada
-- notifikasi lonceng/Telegram, tidak ada backfill yang bisa memperbaikinya). FK yang
-- benar (menunjuk community_posts) dipasang kembali di Bagian C setelah backfill selesai.
ALTER TABLE community_mentions
  DROP CONSTRAINT IF EXISTS community_mentions_comment_id_fkey;

-- Segmen/balasan langsung sebuah kiriman, terurut waktu.
CREATE INDEX IF NOT EXISTS idx_community_posts_parent
  ON community_posts (parent_post_id, created_at)
  WHERE parent_post_id IS NOT NULL AND deleted_at IS NULL;

-- Ambil seluruh utas dalam satu query datar.
CREATE INDEX IF NOT EXISTS idx_community_posts_root
  ON community_posts (root_post_id, created_at)
  WHERE root_post_id IS NOT NULL AND deleted_at IS NULL;

-- Feed utama kini selalu menyaring segmen lanjutan; indeks feed lama tidak
-- lagi cocok dengan predikatnya.
CREATE INDEX IF NOT EXISTS idx_community_posts_feed_roots
  ON community_posts (created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND parent_post_id IS NULL;

-- Balasan sebuah kiriman, terurut waktu (dipakai GET /comments + comment_count).
CREATE INDEX IF NOT EXISTS idx_community_posts_replies
  ON community_posts (parent_post_id, created_at)
  WHERE is_reply = true AND deleted_at IS NULL;

-- Balasan yang tampil di profil penulis.
CREATE INDEX IF NOT EXISTS idx_community_posts_reply_author
  ON community_posts (agent_id, created_at DESC)
  WHERE is_reply = true AND deleted_at IS NULL;

COMMIT;

-- PostgREST menyimpan cache skema; tanpa ini kolom baru dibalas
-- PGRST204 "could not find column ... in schema cache".
NOTIFY pgrst, 'reload schema';

-- ── SEBELUM BAGIAN B: cek kolom `type` ──────────────────────────────────────
-- Beberapa instalasi pernah menjalankan draf Teras awal, di mana
-- `community_posts.type` NOT NULL tanpa default (server.js mengenali ini
-- lewat includeObsoleteType, baik di jalur kiriman maupun balasan). INSERT di
-- Bagian B TIDAK BISA aman untuk kedua kemungkinan (kolom ada & NOT NULL,
-- ATAU kolom sama sekali tidak ada) dalam satu pernyataan SQL -- menyebut
-- kolom yang tidak ada gagal "column does not exist", membiarkannya kosong
-- saat NOT NULL gagal 23502. Jalankan query ini DULU untuk memutuskan varian
-- mana yang dipakai di bawah:
--
--   SELECT column_name, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'community_posts';
--
-- - Kalau baris `type` TIDAK MUNCUL sama sekali, ATAU muncul dengan
--   is_nullable = 'YES', ATAU punya column_default bukan null -> pakai
--   VARIAN 1 (tanpa `type`).
-- - Kalau baris `type` muncul dengan is_nullable = 'NO' DAN column_default
--   NULL -> pakai VARIAN 2 (dengan `type`, nilai diturunkan dari `media`
--   persis seperti includeObsoleteType di server.js: 'foto' kalau ada media,
--   'tips' kalau tidak).

-- ── BAGIAN B, VARIAN 1 (kolom `type` tidak ada / bukan NOT NULL) ───────────
-- Idempoten (ON CONFLICT DO NOTHING) -- aman dijalankan lebih dari sekali,
-- termasuk kalau ragu apakah tadi sudah berhasil. Jalankan SEKALI, SESUDAH
-- deploy (lihat urutan wajib di atas) -- bukan lagi dua kali. Komentar lama
-- adalah BALASAN, bukan segmen utas -> is_reply = true.
INSERT INTO community_posts
  (id, agent_id, body, media, is_system, created_at, deleted_at,
   parent_post_id, root_post_id, is_reply)
SELECT c.id, c.agent_id, c.body, c.media, false, c.created_at, c.deleted_at,
       c.post_id, c.post_id, true
FROM community_post_comments c
ON CONFLICT (id) DO NOTHING;

-- ── BAGIAN B, VARIAN 2 (kolom `type` ADA dan NOT NULL tanpa default) ───────
-- Pakai INI SEBAGAI GANTI Varian 1 di atas -- jangan jalankan keduanya.
-- Nilai `type` ditentukan sama seperti includeObsoleteType di server.js:
-- 'foto' kalau baris punya media, 'tips' kalau tidak. Komentar lama adalah
-- BALASAN, bukan segmen utas -> is_reply = true.
-- INSERT INTO community_posts
--   (id, agent_id, body, media, is_system, created_at, deleted_at,
--    parent_post_id, root_post_id, is_reply, type)
-- SELECT c.id, c.agent_id, c.body, c.media, false, c.created_at, c.deleted_at,
--        c.post_id, c.post_id, true,
--        CASE WHEN jsonb_array_length(coalesce(c.media, '[]'::jsonb)) > 0 THEN 'foto' ELSE 'tips' END
-- FROM community_post_comments c
-- ON CONFLICT (id) DO NOTHING;

-- Verifikasi backfill: HARUS 0. Menghitung baris community_post_comments yang
-- BELUM punya padanan id di community_posts -- BUKAN membandingkan dua count
-- total (count(community_post_comments) vs count(community_posts WHERE
-- parent_post_id IS NOT NULL)), yang salah begitu ada satu balasan BARU
-- lahir lewat kode baru: angka kedua langsung lebih besar secara permanen
-- (balasan baru itu benar, bukan kegagalan backfill), padahal perbandingan
-- count-vs-count akan terus menyalahkan backfill dan menahan Anda dari
-- menjalankan Bagian C.
-- SELECT count(*) FROM community_post_comments c
-- WHERE NOT EXISTS (SELECT 1 FROM community_posts p WHERE p.id = c.id);

-- ── BAGIAN C (paling akhir; lihat alasannya) ────────────────────────────────
-- FK ke community_mentions.comment_id sudah dilepas di Bagian A (lihat komentar
-- di sana). Di sini ia dipasang KEMBALI, kini menunjuk community_posts, setelah
-- Bagian B selesai menyalin seluruh komentar lama jadi baris community_posts.
-- ADD CONSTRAINT memvalidasi SELURUH baris comment_id yang ada saat ini, jadi
-- ia hanya lolos kalau setiap id yang tersimpan sudah punya padanan di
-- community_posts. Menjalankannya lebih awal (sebelum verifikasi backfill di
-- atas menunjukkan 0) akan gagal validasi selama masih ada comment_id lama
-- yang belum tersalin.
BEGIN;

ALTER TABLE community_mentions
  ADD CONSTRAINT community_mentions_comment_id_fkey
  FOREIGN KEY (comment_id) REFERENCES community_posts(id) ON DELETE CASCADE;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── LANGKAH 6, nanti setelah yakin (JANGAN sekarang) ────────────────────────
-- Tabel lama di-rename, bukan di-DROP: itu jaring pengaman rollback.
-- ALTER TABLE community_post_comments RENAME TO community_post_comments_legacy;
--
-- Sebelum menjalankan ini: larik `tables` di purgeDeletedCommunityMedia
-- (server.js) masih mendaftarkan community_post_comments secara langsung --
-- BUKAN masalah lagi sejak review akhir rekonsiliasi ini. Sebelum fix
-- tersebut, communityMediaUrlStillReferenced (server.js) memakai
-- isCommunityMediaSchemaMissing yang hanya menoleransi kolom hilang
-- (42703/PGRST204), bukan tabel hilang (42P01/PGRST205) -- jadi begitu tabel
-- ini di-rename, fungsi itu melempar dan purge media gagal tiap baris.
-- Sekarang communityMediaUrlStillReferenced DAN loop purgeDeletedCommunityMedia
-- (kedua tempat yang membaca community_post_comments) menoleransi tabel itu
-- hilang lewat isCommunityCommentsTableMissing (server.js) -- entri
-- community_post_comments di larik `tables` sengaja DIBIARKAN (bukan
-- dihapus): loop-nya melewatinya diam-diam setelah rename, tidak perlu
-- ubahan kode susulan sebelum menjalankan langkah ini.
