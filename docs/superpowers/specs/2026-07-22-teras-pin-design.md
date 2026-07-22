# Spec: Pin/Pengumuman Teras

Tanggal: 2026-07-22
Status: menunggu review user

## Tujuan

Admin bisa menyematkan satu kiriman sebagai pengumuman resmi di puncak feed Teras (info keberangkatan, kebijakan, dsb) supaya tidak tenggelam oleh obrolan.

## Kebijakan (keputusan user)

- **Hak pin:** admin saja (`req.user.role === 'admin'`). Bukan `canModerateCommunityContent` — moderasi ≠ kurasi.
- **Slot:** tepat SATU pin aktif. Pin baru otomatis menggantikan yang lama, tanpa konfirmasi bertingkat.
- **Kelayakan:** hanya kiriman induk — `parent_post_id` NULL dan `is_reply` false. Utas dipin lewat segmen pertamanya; balasan dan segmen lanjutan tidak bisa dipin.
- **Tanpa:** notifikasi saat pin, pin profil per-agent, multi-pin, riwayat pin.

## Ruang lingkup

- **Termasuk:** migrasi kolom + index, endpoint pin/unpin, blok pin di feed utama, label "Disematkan", menu admin.
- **Tidak termasuk:** semua yang tercantum di "Tanpa" di atas; perubahan feed profil (blok pin hanya di linimasa utama).

## DB

```sql
ALTER TABLE community_posts ADD COLUMN pinned_at timestamptz;
CREATE UNIQUE INDEX community_posts_single_pin ON community_posts ((true)) WHERE pinned_at IS NOT NULL;
```

- Index parsial unik pada konstanta menegakkan maksimal-satu-pin di level DB.
- DDL dijalankan user via Supabase SQL Editor. **Urutan rilis: migrasi dulu, lalu deploy** (kode baru tanpa kolom → degradasi + 503, lihat bawah; kolom tanpa kode = menganggur, aman).

## Helper murni (baru): `lib/community-pin.js`

```
canPinCommunityPost(post) → { ok: true } | { ok: false, error }
```

- `post` = baris `{ deleted_at, parent_post_id, is_reply }`.
- Ditolak bila: `deleted_at` terisi ("Kiriman tidak ditemukan"); `is_reply === true` ("Balasan tidak bisa disematkan"); `parent_post_id` bukan NULL ("Hanya segmen pertama utas yang bisa disematkan").
- `is_reply`/`parent_post_id` `undefined` (pra-migrasi-thread) diperlakukan lolos — konsisten degradasi fitur utas.
- Diuji unit (node:test), tanpa DB.

## API

Kedua endpoint: authMiddleware; cek admin `req.user.role === 'admin'` → 403 "Hanya admin yang bisa menyematkan"; `isCommunityUuid` → 404; tanpa body (tidak perlu parser JSON).

### `POST /api/community/posts/:id/pin`

1. Muat baris (`id, deleted_at, parent_post_id, is_reply`; fallback thread-schema-missing seperti PATCH edit).
2. `canPinCommunityPost` → 400/404 dengan pesan helper.
3. Lepas pin lama: `UPDATE community_posts SET pinned_at = NULL WHERE pinned_at IS NOT NULL` (bukan hanya satu id — jaring pengaman bila ada >1 karena data lama).
4. Set `pinned_at = now-ISO` pada target. Galat kolom hilang (42703/PGRST204 + /pinned_at/, helper `isCommunityPinSchemaMissing`) di langkah 3 ATAU 4 → 503 "Migrasi pin Teras belum diterapkan".
5. Respons `{ data: { id, pinned_at } }`.

Race unpin-lama→pin-baru tidak ditransaksikan; kalau index unik menolak (23505, dua admin bersamaan) → 409 "Pin sedang diubah, coba lagi".

### `DELETE /api/community/posts/:id/pin`

`UPDATE ... SET pinned_at = NULL WHERE id = :id` (idempoten — unpin kiriman yang tidak dipin tetap 200). Kolom hilang → 503 sama.

## Feed & payload

- **Halaman pertama feed utama** (tanpa cursor `before`, bukan mode profil): respons membawa field baru `pinned: <payload kiriman> | null` — query terpisah `.not('pinned_at', 'is', null).is('deleted_at', null).maybeSingle()` dengan select ber-flag yang sama, dipetakan lewat **builder payload yang sama dengan baris feed** (pelajaran fitur edit: kolom wajib sampai ke builder, bukan cuma select). Halaman berikutnya & mode profil: tanpa field `pinned`.
- **`pinned_at` ikut di payload** baris feed dan detail (`pinned_at: row.pinned_at ?? null`) supaya label bisa dirender di mana pun kartu tampil. Segmen utas & komentar tidak perlu (`tidak bisa dipin`).
- Select feed/detail menambah `pinned_at` di bawah flag `includePin` + retry `isCommunityPinSchemaMissing`, pola persis fallback `edited_at`.
- Degradasi pra-migrasi: `pinned` = null, `pinned_at` absen → FE tanpa blok pin, tanpa galat.

## FE (TerasPage.tsx)

- **Blok pin:** kartu kiriman yang dipin dirender di puncak feed utama dengan badge "📌 Disematkan" di atas kartu. Kartu memakai jalur render kartu kiriman yang ada (reaksi/komentar/kutip tetap berfungsi). Hanya di linimasa utama (`!profileSlug`, tanpa deep-link detail).
- **Dedup:** daftar kronologis menyaring `post.id === pinned.id` saat render (filter klien; query/cursor tidak berubah). Pin dilepas → kiriman tampil normal kembali (ada di state feed atau via refetch normal).
- **Menu admin:** item "Sematkan" (atau "Lepas sematan" bila `pinned_at` terisi) di menu titik-tiga kartu kiriman, hanya bila `agent.role === 'admin'` dan kiriman layak (induk). Klik → POST/DELETE → state `pinned` lokal diperbarui tanpa refetch penuh.
- **Label:** kartu ber-`pinned_at` menampilkan badge kecil "Disematkan" juga di halaman detail.
- **Tipe:** `pinned_at?: string | null` di `CommunityPost`; bentuk respons feed dapat field `pinned` opsional.

## Penanganan galat

- Pesan server (400/403/404/409/503) diteruskan apa adanya ke toast/inline, pola aksi Teras yang ada.
- Feed gagal memuat `pinned` (galat pada query pinned saja) → degradasi senyap ke `pinned: null`, feed tetap tampil.

## Pengujian

- Unit `tests/community-pin.test.js`: semua cabang `canPinCommunityPost` + pesan persis + kasus `undefined` pra-migrasi.
- FE: tsc tanpa error baru di file tersentuh + `npm run build:spa`.
- Curl pasca-deploy: POST pin tanpa token → 401 (rute hidup; domain produksi `alhijaz.co`).
- E2e manual (user): admin pin → blok muncul di atas + baris kronologis hilang; pin kiriman lain → menggantikan; lepas sematan → blok hilang, kiriman kembali normal; akun non-admin tidak melihat menu Sematkan; hapus kiriman yang dipin → blok hilang; refresh setelah tiap langkah.

## Deploy

1. User jalankan 2 statement SQL di Supabase.
2. Push + deploy (webhook).
3. Curl verifikasi rute pin (401 = hidup).
