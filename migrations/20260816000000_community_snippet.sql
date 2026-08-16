-- Lampiran Teks pada kiriman Teras: blok teks panjang (maks 10.000 karakter)
-- yang menempel pada segmen PERTAMA sebuah utas, dirender di feed sebagai
-- kartu cuplikan dan dibuka penuh di sheet fullscreen.
--
-- KENAPA tabel terpisah, bukan kolom baru di community_posts: query feed di
-- server.js memakai daftar kolom eksplisit, dan sebuah kolom `body` 10k
-- karakter di community_posts berarti setiap halaman feed menyeret ratusan KB
-- teks yang TIDAK PERNAH dirender (kartu cuplikan cuma butuh ~280 karakter
-- pertama). Dipisah begini, feed cukup membaca `preview` + `char_count`,
-- sedangkan `body` hanya disentuh endpoint detail saat sheet dibuka.
--
-- KENAPA `preview` didenormalisasi saat insert (bukan dihitung on the fly dari
-- `body` lewat view/generated column): tujuannya justru supaya query feed tidak
-- perlu menyentuh kolom `body` sama sekali. Generated column tetap menyimpan
-- `body` di baris yang sama, tapi yang mahal di sini adalah TRANSFER kolom
-- besar ke PostgREST — jadi pemisahan tabel + kolom preview siap-pakai itulah
-- inti optimasinya.
--
-- KENAPA `char_length`, bukan `octet_length` atau `length` sisi JS:
-- `char_length` Postgres menghitung KARAKTER (code point), sama persis dengan
-- `Array.from(x).length` di sisi JS — bukan `x.length` yang menghitung unit
-- UTF-16. Validasi dilakukan di DUA sisi (CHECK di sini + helper murni
-- normalizeCommunitySnippetInput di lib/community-snippet.js) dan keduanya
-- sepakat untuk emoji di luar BMP: satu 🕋 dihitung 1, bukan 2. Kalau sisi JS
-- kelak diubah jadi `body.length`, teks berisi 6.000 emoji akan ditolak app
-- padahal DB menerimanya (dan 10.000 emoji ditolak DB padahal app meloloskannya)
-- — batas kedua sisi jadi berbeda diam-diam. Itu alasan aturan Array.from di
-- helper, bukan sekadar selera.
CREATE TABLE IF NOT EXISTS community_post_snippets (
  post_id     UUID PRIMARY KEY REFERENCES community_posts(id) ON DELETE CASCADE,
  title       TEXT,
  body        TEXT NOT NULL,
  preview     TEXT NOT NULL,
  char_count  INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT community_post_snippets_body_len
    CHECK (char_length(body) BETWEEN 1 AND 10000),
  -- Judul opsional: NULL berarti "tanpa judul". String kosong sengaja DITOLAK
  -- (batas bawah 1) supaya hanya ada satu representasi untuk "tidak ada judul"
  -- — helper JS sudah menormalkan '   ' menjadi NULL sebelum insert.
  CONSTRAINT community_post_snippets_title_len
    CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 80),
  -- 400, bukan 280: preview dipotong 280 code point oleh helper, sisanya
  -- ruang aman kalau ambang itu dinaikkan tanpa migrasi susulan. CHECK ini
  -- jaring pengaman terhadap baris tercemar, bukan sumber kebenaran panjang.
  CONSTRAINT community_post_snippets_preview_len
    CHECK (char_length(preview) BETWEEN 1 AND 400)
);

-- RLS menyala tanpa policy apa pun — sama seperti community_polls: server
-- menulis/membaca lewat service role (BYPASSRLS), sedangkan anon &
-- authenticated ditolak total. Body lampiran ikut aturan akses Teras di
-- server.js, jangan sampai bisa diambil langsung lewat PostgREST publik.
ALTER TABLE community_post_snippets ENABLE ROW LEVEL SECURITY;

-- PostgREST menyimpan cache skema; tanpa ini tabel baru dibalas PGRST205
-- "could not find the table ... in the schema cache".
NOTIFY pgrst, 'reload schema';
