# Kartu Teras "Ticker Hidup" — Design

**Tanggal:** 2026-08-16
**Pemicu:** Feedback user di /dashboard — kartu Teras "kurang menarik dan cenderung statis banget", minta tampilan dinamis dan informatif.
**Arah terpilih:** A — Ticker hidup (dipilih user dari 3 mockup: ticker / mini-feed / papan denyut).

## Ringkasan

Kartu Teras di dashboard (`src/components/TerasCard.tsx`) tetap ringkas, tapi baris cuplikan
menjadi ticker yang merotasi 3 kiriman terbaru dengan animasi halus, waktu relatif, dan
thumbnail foto. Server memperluas payload teaser dari 1 kiriman menjadi 3 — hampir gratis
karena query sudah mengambil 12 kiriman.

## Layout

Tiga baris di dalam tombol kartu yang sama (tinggi ~88px → ~100px):

1. **Baris header (tetap):** ikon Teras, judul "Teras", badge unread merah — ditambah titik
   putih berdenyut halus di dalam badge saat `unread_count > 0` — tumpukan 3 avatar, chevron.
2. **Baris ticker (baru):** area setinggi 1 baris merotasi 3 kiriman terbaru. Tiap frame:
   avatar penulis, nama tebal, cuplikan lewat `MentionText` (penanda emerald untuk mention
   dipertahankan), waktu relatif di kanan via `timeAgo` yang sudah ada ("Baru saja" /
   "N menit" / "N jam" / "N hari"), thumbnail 26px rounded bila kiriman punya foto.
3. **Baris kaki (tipis, hanya saat rotasi aktif):** 3 titik indikator posisi di tengah
   (titik aktif teal, sisanya teal muda). Label "N kiriman hari ini" DIBUANG atas feedback
   user 2026-08-16; `today_count` tetap di payload (dipakai badge/masa depan).

## Gerak

- Rotasi tiap **4,5 detik** via `setInterval` (bukan rAF — rAF suspended di browser pane).
- Transisi framer-motion: `AnimatePresence mode="wait"`, fade + translateY ±10px, ~0.3s.
- **Jeda** saat: kursor di atas kartu (mouseenter/leave), tab tersembunyi
  (`document.visibilitychange`), atau `prefers-reduced-motion` aktif (rotasi mati total,
  tampil kiriman terbaru statis — perilaku hari ini).
- Ticker `aria-live="off"` supaya screen reader tidak dibanjiri pergantian teks.

## Data & server

`loadCommunityTeaserSharedData` (server.js) sudah mengambil 12 kiriman terbaru:

- Select ditambah kolom `photo_url` saja (selalu ada di skema — tanpa query baru).
- Payload ditambah **`latest_posts`**: maksimal 3 entri `{ author: {name, photo},
  body_snippet (120 char, Array.from unicode-safe), mentions (resolusi terhadap snippet,
  pola sama dengan `latest`), created_at, thumb }`.
- `thumb` = `photo_url` (server sudah memeliharanya sebagai gambar pertama kiriman saat
  create/edit/purge). Kolom `media` sengaja TIDAK di-select — kolom itu butuh deteksi
  skema (`isCommunityMediaSchemaMissing`) yang tidak layak untuk teaser.
- **`latest` lama tetap dikirim** (kompat mundur). Klien baru pakai `latest_posts`,
  fallback ke `[latest]` bila absen — aman untuk urutan deploy mana pun.
- `today_count`, `recent_avatars`, `unread_count`, cache 60 detik: tidak berubah.

## Fallback & edge

- 1 kiriman saja → tanpa rotasi, tanpa titik indikator.
- 0 kiriman → empty state kopi yang sekarang (tidak berubah).
- Error / loading → perilaku sekarang (shell + skeleton).
- Mention di frame mana pun → penanda `AtSign` + latar emerald per frame (logika `hasMention`
  pindah ke per-frame).

## Verifikasi

- Unit test: helper waktu relatif; `normalizeTeaserData` menerima `latest_posts`, fallback
  `[latest]`, dan menoleransi payload lama.
- `npm run build` hijau (gate FE = build, bukan tsc-clean — ada ~6 error tsc pre-existing).
- Checklist manual untuk user (rotasi, pause hover, reduced-motion, dark mode, kartu 1/0
  kiriman); suite e2e dijalankan user.
- Deploy: butuh restart/deploy `server.js` agar `latest_posts` terkirim; FE aman dirilis
  duluan karena fallback.
