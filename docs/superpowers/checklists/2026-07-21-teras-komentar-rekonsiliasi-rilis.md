# Checklist Rilis — Rekonsiliasi Komentar-jadi-Kiriman di atas Utas Composer

**Tanggal:** 2026-07-21
**Branch:** `worktree-teras-reconcile` (dari `main`)
**Berdiri sendiri** — ikuti tanpa perlu membaca spec/plan.

Fitur ini menjadikan komentar Teras bisa direaksi, dibalas berjenjang, dan dikutip
(komentar dilebur jadi baris `community_posts` dengan `is_reply = true`), **berdampingan**
dengan fitur utas composer yang sudah ada (segmen utas = `is_reply = false`). Pembedanya
kolom baru `is_reply`.

> **DB lokal = PRODUKSI. DDL Anda tempel sendiri di Supabase SQL Editor.**
> **Merge/push ke `main` = auto-deploy (webhook → deploy.sh: pull + build + restart).**
> Jadi merge ITU SENDIRI adalah langkah deploy — jangan merge sebelum Bagian A selesai.

---

## 0. Pra-cek (sekali, sebelum mulai)

- [ ] Cek apakah kolom utas sudah ada di prod (`main` mungkin belum ter-deploy ke origin):
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name='community_posts' AND column_name IN ('parent_post_id','root_post_id','is_reply');
  ```
  Migrasi pakai `IF NOT EXISTS`, jadi aman baik kolom parent/root sudah ada maupun belum.
- [ ] Cek varian kolom `type` (menentukan varian backfill di Bagian B):
  ```sql
  SELECT column_name, is_nullable, column_default FROM information_schema.columns
  WHERE table_name='community_posts' AND column_name='type';
  ```
  - Baris `type` tidak muncul / bukan NOT NULL → **VARIAN 1** (tanpa `type`).
  - `is_nullable='NO'` DAN `column_default` NULL → **VARIAN 2** (dengan `type`).

---

## 1. Urutan rilis — A → deploy → B → C (TIDAK boleh ditukar)

Urutan ini kritis: kode lama tidak punya filter `parent_post_id IS NULL`, jadi backfill
sebelum deploy akan membanjiri linimasa dengan komentar lama. **Bagian A dulu**, baru deploy,
baru backfill.

### Langkah 1 — Bagian A (SEBELUM merge/deploy)
- [ ] Tempel **BAGIAN A** dari `migrations/20260726000000_community_post_thread.sql` ke Supabase SQL Editor.
      Menambah `is_reply` + indeks, melepas FK lama `community_mentions.comment_id`.
      (Kolom parent/root pakai `IF NOT EXISTS` — tidak diulang kalau sudah ada.)

### Langkah 2 — Deploy
- [ ] Merge `worktree-teras-reconcile` → `main`, lalu push. Ini memicu deploy otomatis.
- [ ] Tunggu `deploy.sh` selesai (pull + build + restart). `node server.js` tidak hot-reload —
      pastikan service benar-benar restart.

### Langkah 3 — Bagian B (backfill, SETELAH deploy)
- [ ] Tempel **BAGIAN B** (VARIAN 1 atau 2 sesuai pra-cek). Menyalin komentar lama
      `community_post_comments` → `community_posts` dengan `is_reply = true`. Idempoten
      (`ON CONFLICT (id) DO NOTHING`) — cukup **sekali** (kode baru sudah menyaring balasan,
      jadi tidak perlu backfill kedua).
- [ ] Verifikasi backfill (harus **0**):
  ```sql
  SELECT count(*) FROM community_post_comments c
  WHERE NOT EXISTS (SELECT 1 FROM community_posts p WHERE p.id = c.id);
  ```

### Langkah 4 — Bagian C (SEGERA setelah B)
- [ ] Tempel **BAGIAN C**. Memasang kembali FK `community_mentions.comment_id` menunjuk
      `community_posts`. Jalankan **segera** — antara deploy dan Bagian C, mention pada balasan
      yang terhapus masih bisa muncul di lonceng (over-notify sementara; sengaja dipilih
      ketimbang hilang senyap).

### Antara Langkah 1 dan restart (Langkah 2)
Server **lama** yang masih jalan memakai embed mention ke tabel lama → gagal PGRST200 dan
ditoleransi, jadi mention sementara hilang dari lonceng sampai restart. Bukan kerusakan data.

---

## 2. Konfirmasi nama relasi (setelah Bagian A, opsional tapi disarankan)

Kode notifikasi memakai embed self-referential `parent:community_posts!parent_post_id`.
`community_posts` kini punya 3 FK ke dirinya sendiri (`quoted_post_id`, `parent_post_id`,
`root_post_id`) — kode sudah memakai petunjuk **nama kolom** (bukan nama constraint) dan
menoleransi `PGRST201` supaya embed ambigu tidak mematikan lonceng. Untuk memastikan:
- [ ] Setelah restart, cek status lonceng (ganti token dev Anda):
  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
    http://localhost:3000/api/community/notifications
  ```
  Harus `200`. Kalau `500`, cek log — kemungkinan embed relasi; jangan lanjut sebelum beres.

---

## 3. Verifikasi manual di aplikasi (setelah A+B+C)

Balasan komentar:
- [ ] Balas sebuah kiriman, lalu balas balasan itu (thread 3 tingkat).
- [ ] Reaksi pada komentar bertahan setelah reload.
- [ ] Tekan Balas pada komentar → kolom bawah berganti chip "Membalas ke …", balasan muncul
      sebagai cuplikan **tanpa pindah halaman**.
- [ ] Balasan >2 pada satu komentar → muncul "Lihat N balasan lainnya".
- [ ] Kutip komentar → kiriman baru berisi kartu komentar itu.
- [ ] Klik baris komentar → buka halaman thread komentar itu.

Halaman thread & detail:
- [ ] Halaman detail balasan menampilkan rantai leluhur di atasnya.
- [ ] Hapus kiriman induk → leluhurnya jadi "Kiriman sudah dihapus", halaman tetap terbuka (bukan 404).

Profil & feed:
- [ ] Profil penulis **memuat** balasannya dengan baris "Membalas ke @X".
- [ ] **Segmen utas TIDAK muncul** di profil (hanya kiriman induk + balasan).
- [ ] Buka profil dengan >20 kiriman campuran, tekan "muat lagi" → halaman ke-2 **tidak** memunculkan segmen utas.
- [ ] Feed utama TIDAK memuat balasan maupun segmen; pil "kiriman baru" & badge "X baru" tidak menghitungnya.

**Fitur utas composer (regresi guard — harus MASIH jalan):**
- [ ] Composer bersegmen: tambah segmen ("Tambahkan ke utas"), terbitkan → muncul sebagai utas.
- [ ] Chip "1/N" tampil di kartu utas.
- [ ] Halaman detail utas menampilkan seluruh segmennya.
- [ ] `thread_count` (ukuran utas) TIDAK menggelembung karena balasan.

Lonceng & Telegram:
- [ ] Balasan atas kiriman saya memberi notifikasi lonceng; balasan atas balasan saya juga.
- [ ] Digest Telegram untuk balasan berjalan (bukan hanya mention instan) — sumbernya sudah
      dipindah ke `community_posts`.
- [ ] Kartu OG link share `/teras/<code>` menampilkan hitungan komentar yang benar.

Anti-kunci:
- [ ] Buka komposer lalu tekan tombol Back browser → halaman **tidak** terkunci.

---

## 4. Ditunda — Langkah 6 (rename tabel lama), JANGAN sekarang

Setelah yakin semuanya stabil beberapa hari:
- [ ] **Prasyarat kode sudah ada** (sudah di branch ini): `communityMediaUrlStillReferenced`
      dan loop `purgeDeletedCommunityMedia` kini toleran tabel `community_post_comments` hilang
      (helper `isCommunityCommentsTableMissing`). Tanpa ini, purge media gagal tiap malam
      setelah rename — jadi rename hanya aman **setelah** kode branch ini ter-deploy.
- [ ] `ALTER TABLE community_post_comments RENAME TO community_post_comments_legacy;`
      (di-rename, BUKAN di-drop — jaring pengaman rollback).
- [ ] Semua pembaca tabel lama sudah dipindah ke `community_posts` (bell R7, digest, kartu OG,
      GET /comments, comment_count). Setelah rename, verifikasi lonceng + digest + purge tetap jalan.

---

## Catatan

- Migrasi idempoten: aman dijalankan pada DB yang kolom parent/root-nya sudah ada (fitur utas
  sudah deploy) maupun belum. `is_reply` selalu baru.
- Jendela "parent/root ada, is_reply belum": semua hitungan (comment_count/thread_count/thread)
  degradasi ke 0 dan feed bisa sedikit bocor — terlindungi guard skema, dan sembuh begitu
  Bagian A jalan. Inilah sebabnya **A harus sebelum deploy**.
