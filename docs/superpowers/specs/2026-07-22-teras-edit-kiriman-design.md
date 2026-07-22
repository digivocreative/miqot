# Spec: Edit Kiriman & Komentar Teras

Tanggal: 2026-07-22
Status: menunggu review user

## Tujuan

Penulis bisa memperbaiki teks kiriman dan komentarnya sendiri tanpa hapus-tulis-ulang. Saat ini satu-satunya jalan koreksi adalah `DELETE` — mahal kalau sudah ada balasan/reaksi.

## Kebijakan (keputusan user)

- **Jendela edit:** tanpa batas waktu. Rem sosialnya label "diedit" yang permanen.
- **Cakupan:** teks (`body`) saja. Media, kutipan (`quoted_post_id`), dan pratinjau link tidak bisa diubah lewat edit.
- **Efek samping: statis.** Edit TIDAK memicu notifikasi mention baru, TIDAK mencatat `community_mentions` baru, TIDAK mengambil ulang pratinjau link. Pill @mention tetap tampil benar karena di-render klien dari teks.
- **Siapa:** hanya penulis (pemilik `agent_id`). Admin tetap lewat jalur hapus yang sudah ada.
- **Riwayat:** tidak ada versi lama yang disimpan; hanya stempel `edited_at`.

## Ruang lingkup

- **Termasuk:** migrasi 1 kolom, endpoint PATCH, UI edit inline di TerasPage (feed, detail, komentar/balasan), label "diedit".
- **Tidak termasuk:** edit media, notifikasi ulang, refresh link preview, riwayat versi, jendela waktu, edit oleh admin.

## DB

```sql
ALTER TABLE community_posts ADD COLUMN edited_at timestamptz;
```

Nullable, additive, aman untuk data lama. DDL dijalankan user via Supabase SQL Editor (tidak ada jalur exec dari kode). **Urutan rilis: migrasi dulu, deploy server belakangan** — kolom menganggur tidak mengganggu kode lama, sebaliknya kode baru tanpa kolom akan gagal UPDATE.

## API

`PATCH /api/community/posts/:id` — authMiddleware, `express.json({ limit: '8kb' })` path-scoped mengikuti pola endpoint komentar (ingat jebakan parser global di server.js ~446-453: parser per-route hanya mengikat kalau path-scoped sebelum parser global).

Request: `{ "body": "teks baru" }`

Aturan (urutan cek):
1. `:id` harus UUID valid → 400.
2. Baris harus ada dan `deleted_at` NULL → 404 "Kiriman tidak ditemukan".
3. `agent_id` baris = id user login → 403 "Hanya penulis yang bisa mengedit".
4. Validasi body (helper murni, lihat bawah) → 400 dengan pesan spesifik.
5. Sukses: `UPDATE community_posts SET body = <trim>, edited_at = now() WHERE id = :id`, respons `{ data: { id, body, edited_at } }` — klien mem-patch state lokal, tidak perlu bentuk baris penuh.

### Helper murni validasi (baru): `lib/community-edit.js`

Tanpa DB, diuji unit. Satu fungsi:

```
validateCommunityEdit({ nextBody, previousBody, isReply })
  → { ok: true, body: <trimmed> } | { ok: false, error: <pesan> }
```

- Trim; hitung panjang per codepoint (`Array.from`), konsisten dengan `normalizeThreadSegments`.
- `isReply` true → 1–300 ("Isi komentar wajib 1–300 karakter"); false → 1–500 ("Isi posting wajib 1–500 karakter"). Batas diimpor/diselaraskan dengan `MAX_SEGMENT_BODY_CHARS` (lib/community-thread-compose.js) dan batas komentar yang ada.
- **@semua:** jika `hasEveryoneMention(nextBody)` true DAN `hasEveryoneMention(previousBody)` false → tolak: "Tidak bisa menambah @semua lewat edit". `@semua` yang sudah ada boleh dipertahankan atau dihapus.
- Tidak ada cek waktu (kebijakan tanpa batas).

## FE (TerasPage.tsx)

- **Pintu masuk:** menu yang sekarang menampung "Hapus" pada kiriman/komentar milik sendiri mendapat item "Edit" di atas "Hapus".
- **Mode edit inline:** body item berubah menjadi textarea terisi teks lama + counter karakter (300/500 sesuai jenis) + tombol Simpan & Batal; Esc = Batal. Textarea auto-grow: set nilai programatik wajib rAF + `autoGrowCommentInput` (pola `applyMention`; pelajaran dari fitur draf).
- **Satu mode edit aktif** pada satu waktu; membuka edit lain menutup yang sebelumnya (tanpa konfirmasi kalau teks belum berubah; kalau berubah, confirm "Buang perubahan?").
- **Simpan:** PATCH → sukses: patch state lokal (`body`, `edited_at`) di semua tempat baris itu hidup (feed, detail, commentPanels) tanpa refetch. Gagal: tetap di mode edit, teks tidak hilang, pesan galat server tampil.
- **Tidak menyentuh draf:** mode edit tidak membaca/menulis kunci `teras:draft:*`.
- **Label "diedit":** item dengan `edited_at` menampilkan `· diedit` kecil di samping timestamp — di feed, detail, dan komentar. GET feed/detail/comments ikut memilih kolom `edited_at` (tambah di select list; hati-hati pola PostgREST select string yang sudah ada).

## Penanganan galat

- Klien menampilkan pesan galat dari server apa adanya (400/403/404), pola yang sama dengan aksi komentar.
- Jaringan putus: mode edit bertahan, user bisa coba lagi.
- Server lama (belum deploy): PATCH ke rute yang belum ada → beda antara 404-rute vs 404-baris tidak bisa dibedakan dari status; klien cukup tampilkan pesan generik "Gagal menyimpan. Coba lagi." bila respons bukan JSON `{error}`. (Jebakan: node server.js tidak hot-reload.)

## Pengujian

- Unit `tests/community-edit.test.js` (node:test): batas 300/500 per codepoint (termasuk emoji), trim, @semua baru ditolak / dipertahankan / dihapus, isReply switching, pesan galat persis.
- FE: `npx tsc --noEmit` tanpa error baru di file tersentuh + `npm run build:spa`.
- Endpoint: curl manual di checklist user (bedakan 401 tanpa token vs 404 rute lama — verifikasi deploy).
- E2e manual (user): edit kiriman sendiri → teks berubah + label "diedit" muncul di feed & detail; edit komentar → sama di utas komentar; coba edit kiriman orang lain (tidak ada menu Edit); tambah @semua saat edit → ditolak dengan pesan; edit tanpa perubahan panjang ilegal (0 char / 501 char) → ditolak; refresh → hasil edit & label bertahan.

## Deploy

1. User jalankan migrasi SQL di Supabase.
2. Push + deploy server (server.js perlu restart).
3. Verifikasi curl: PATCH tanpa token → 401 (bukan 404) = rute hidup.
