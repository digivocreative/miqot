# Teras: pill "Ada kiriman baru" (near-realtime feed)

Tanggal: 2026-07-19 · Status: disetujui (opsi polling + pill)

## Masalah

Feed Teras (`/dashboard/teras`) murni pull. Agent yang standby di feed tidak pernah
tahu ada post baru dari agent lain sampai reload manual.

## Keputusan

Polling ringan + pill "Ada kiriman baru" ala Threads/Twitter. Alternatif yang
ditolak: SSE (moving parts: koneksi, heartbeat, proxy, reconnect; patah kalau
multi-instance) dan Supabase Realtime dari browser (butuh membuka RLS
`community_posts`, bocor dari gate `requireCommunityAccess`).

## Desain

### Server (server.js)

- Endpoint baru `GET /api/community/feed/head` dengan middleware sama seperti
  feed: `dbLoadShedGuard`, `authMiddleware`, lalu `getAgentById` +
  `requireCommunityAccess`.
- Respons: `{ success: true, data: { latest_id, latest_created_at } | null }` —
  post teratas non-deleted, urutan sama dengan feed (`created_at desc, id desc`).
- Cache in-memory shared ber-TTL 10 detik (pola `communityTeaserSharedCache`):
  beban DB maksimal ~1 query per 10 detik untuk semua agent yang polling.
- Setelah insert sukses di `POST /api/community/posts`, cache di-overwrite
  langsung dengan `{id, created_at}` post baru — latensi efektif ≈ interval
  polling client, bukan interval + TTL.

### Client (TerasPage.tsx)

- Polling `setInterval` 20 detik, hanya saat `document.visibilityState ===
  'visible'`; saat tab kembali visible, poll sekali langsung.
- Head dibandingkan dengan semua post yang sudah dikenal di state (termasuk
  pending posts milik sendiri) → post sendiri tidak memicu pill. Kalau
  `latest_id` belum dikenal dan lebih baru → tampilkan pill.
- Error polling di-swallow tanpa toast (load-shed 503 / jaringan putus tidak
  berisik).
- Pill sticky di atas feed, "Ada kiriman baru ↑", mengikuti bahasa visual Teras.
  Klik → `refreshFeed()` yang sudah ada + scroll ke atas + pill hilang. Pill
  juga hilang saat refresh manual.

## Non-scope

Notifikasi komentar/reaksi, badge unread menu dashboard (sudah ditangani
teaser), push saat tab tidak aktif. Nol DDL/migrasi.

## Verifikasi

`npx tsc --noEmit` + `npx vite build`; uji manual dua sesi dev-JWT (resep di
memory Teras): sesi B ngepost → pill muncul di sesi A ≤ ~20 detik → klik pill
memunculkan post baru di atas feed.
