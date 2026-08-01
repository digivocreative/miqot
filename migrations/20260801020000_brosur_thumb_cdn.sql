-- Thumbnail brosur untuk grid "Brosur Paket".
--
-- Brosur resmi AWAPI beresolusi CETAK. Terukur 1 Agt 2026: 64 brosur = 71,8 MB,
-- rata-rata 1,1 MB, terbesar 4500x6000 px / 8,1 MB. Grid menampilkannya sebagai
-- thumbnail ~180px, jadi >99% byte-nya terbuang — di Fast 3G empat thumbnail
-- pertama butuh ~10 detik. Bunny Optimizer tidak aktif (?width= diabaikan),
-- jadi turunan 400px dibuat sendiri saat sync (ensureBrosurThumb di server.js)
-- dan URL-nya disimpan di kolom ini.
--
-- Tidak perlu kolom sha terpisah: nama objek di CDN di-fingerprint dengan
-- sha256 SUMBER (sama seperti brosur_cdn), jadi URL thumb otomatis berubah
-- ketika brosurnya diganti.
--
-- NULL = thumb belum dibuat; frontend otomatis jatuh ke brosur_cdn penuh.

ALTER TABLE public.umroh_schedules
  ADD COLUMN IF NOT EXISTS brosur_thumb_cdn text;
