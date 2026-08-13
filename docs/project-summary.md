# Alhijaz Indowisata - Project Summary

Terakhir diperbarui: 2026-07-19

Dokumen ini adalah peta kerja untuk repo `miqot` / `alhijaz-umroh-schedule`. Isinya dibuat dari audit struktur repo, route backend, modul frontend, migrasi, test, dan flow operasional yang aktif pada 2026-07-12, ditambah audit fitur Teras (komunitas agent) pada 2026-07-19.

## Cara Pakai Cepat

Kalau baru masuk ke project:

1. Baca **Ringkasan Eksekutif**, **Command Cepat**, dan **Data Flow Utama**.
2. Pakai **Peta Folder** untuk mencari file yang perlu disentuh.
3. Baca **Audit & Risiko Operasional** sebelum mengubah sync, auth, pendaftaran jamaah, service worker, atau background job.
4. Untuk UI, ikuti [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md).

Saat menambah fitur besar, update bagian:

- **Fitur Aktif** jika ada surface baru.
- **API & Endpoint** jika ada route baru.
- **Environment** jika ada env var baru.
- **Audit & Risiko Operasional** jika ada keputusan teknis atau debt baru.

## Ringkasan Eksekutif

| Area | Status |
| --- | --- |
| Produk | Public package listing, landing agent, dashboard agent/admin, jamaah umroh/haji, Portal Jamaah, Teras (feed komunitas antar-agent), AI tools, flight tracking, analytics, Telegram notification, MCP assistant. |
| Arsitektur | Fullstack monolith: React/Vite SPA + Express 5 backend dalam satu repo. Express juga serve SPA, public SSR-like pages, API, cron/background jobs, proxy, and MCP. |
| Runtime utama | `server.js` (~21.5k lines), `laporan-api.js`, `awapi-client.js`, `haji-api.js`, `calendar-api.js`, `telegram-notifier.js`, `mcp-server.js`. |
| Frontend utama | `src/main.tsx`, `src/App.tsx`, `src/components/DashboardLayout.tsx`, `JamaahPage.tsx`, `UmrahRegisterPage.tsx`, `PackageCard.tsx`, `DashboardProfile.tsx`, Portal Jamaah folder. |
| Data utama | Supabase PostgreSQL. `agents.id` UUID adalah identitas canonical. `slug` hanya identitas URL dan bisa berubah. |
| Auth | Custom JWT untuk dashboard. Portal Jamaah memakai magic link + cookie. MCP memakai bearer key agent-scoped. |
| Upstream | `jadwal.alhijaz.co`, legacy internal `115.124.86.220/aiw`, AWAPI official, AirLabs, Bank Mandiri, OpenAI, Google TTS, Telegram, Bunny CDN. |
| Deploy | VPS Ubuntu via systemd `miqot.service`; webhook deploy menarik repo, build, lalu restart service. |
| Test | 126 file `node:test`; fokus pure/business logic, generator, dan source guards. 5 file `*.browser.test.js` (Playwright Chromium + Vite dev server) meng-cover permukaan Teras; e2e browser di luar itu masih manual. |

## Command Cepat

```bash
npm install
npm run dev              # Vite dev server, default 5173
npm run start            # Express server, default 3000
npm run build:spa        # Build SPA ke dist/
npm run build:functions  # Bundle functions/[slug]/umroh.ts dan haji.ts
npm run build            # SPA + functions
npm run lint             # ESLint
node --test tests/*.test.js
npm run verify:landing
npm run generate:top-partner-og
```

Smoke check yang sering dipakai setelah perubahan backend/frontend:

```bash
node --check server.js
node --check laporan-api.js
node --test tests/umrah-register-session-retry.test.js
git diff --check
npm run build:spa
sudo systemctl restart miqot.service
systemctl is-active miqot.service
```

Catatan:

- Untuk development penuh, jalankan `npm run dev` dan `npm run start` di terminal berbeda.
- `postinstall` menjalankan `playwright install chromium`; ini dibutuhkan fallback browser untuk submit pendaftaran umrah.
- Perubahan route/API besar tetap perlu smoke test manual karena coverage API end-to-end belum lengkap.

## Data Flow Utama

| Flow | Entry point | Modul utama | Output |
| --- | --- | --- | --- |
| Public jadwal paket | `/`, `/:slug`, `/:slug/:jadwalId` | `src/App.tsx`, `src/services/data-service.ts`, `/api/api-get/*`, `/api/schedules/:yearCode` | Paket umroh, filter, CTA WhatsApp, analytics public. |
| Landing agent | `/:slug/umroh`, `/:slug/haji`, `/:slug/bio`, `/dashboard/ai-tools/landing-page/:type` | `functions/[slug]/*`, SSR injection di `server.js`, `LandingPagePage.tsx`, bio editor | SEO/OG page agent, Link Bio, custom domain context. |
| Dashboard | `/dashboard/*` | `DashboardLayout.tsx`, lazy-loaded feature pages | Tools agent/admin, jamaah, statistik, AI tools, settings. |
| Teras (komunitas agent) | `/dashboard/teras`, `/dashboard/teras/post/:id`, `/teras/:slugAtauKode` | `TerasPage.tsx`, `TerasCard.tsx`, `TerasProfileHeader.tsx`, `NotificationBell.tsx`, `useTerasNotifications`, `/api/community/*`, `lib/community-*.js`, `lib/teras-*.js` | Feed antar-agent, detail post, profil publik agent, share link, mention, media, link preview, notifikasi bell + Telegram. |
| Sync jamaah umroh | `/api/laporan/sync`, background loop | `awapi-client.js`, `laporan-api.js`, sync helpers in `lib/` | Upsert `jamaah`, payment provenance, notification, CAPI Purchase. |
| Pendaftaran umrah | `/dashboard/jamaah/daftar`, `/api/umrah/*` | `UmrahRegisterPage.tsx`, `server.js`, `laporan-api.js`, Playwright fallback | Submit jamaah baru/tambah jamaah ke legacy Alhijaz. |
| Sync jamaah haji | `/api/haji/sync`, background loop | `awapi-client.js`, `haji-api.js`, `lib/haji-stats.js` | Upsert `jamaah_haji`, docs, stats. |
| Portal Jamaah | `/:slug/jamaah...`, `/api/portal/jamaah/*` | `src/components/portal-jamaah/`, portal API in `server.js` | Magic link, dashboard jamaah, persiapan, payment/doc/travel view. |
| Calendar & flight | `/api/calendar/*`, `/api/flights/*`, `/f/:code`, `/og/flight/:code.png` | `calendar-api.js`, flight helpers, `FlightStatusCard.tsx`, `FlightSharePage.tsx`, `FlightRouteLine.tsx`, `flightStatusPresentation.ts`, `lib/og-generator.mjs` | Calendar events, AirLabs status, public flight share, dan OG image spesifik penerbangan. |
| AI tools | `/api/ai-copy`, `/api/ask-ai/*`, `/api/ai-tools/*` | OpenAI proxy, `AskAIModal.tsx`, AI tools pages | Captions, Tanya AI, script/voice, brochure schedule data. |
| CAPI analytics | `/api/capi/*`, `/api/analytics/*` | CAPI helpers in `server.js`, `lib/analytics-maintenance.js` | Meta events, logs, admin analytics, daily aggregate. |
| Telegram | `/api/telegram/*`, `telegram-notifier.js` | Bot webhook + cron jobs | Deep link connect, preference, alerts, reminders, kurs. |
| MCP assistant | `/mcp`, `/api/mcp-key` | `mcp-server.js`, MCP key routes | Read-only AI assistant tools scoped per agent. |
| Dev-MCP (developer) | `/dev-mcp`, `/oauth/dev/*`, `/.well-known/oauth-*` | `dev-mcp.js` | Read-only MCP developer-tool (docs/struktur/cari kode) untuk brainstorming di claude.ai; OAuth 2.1 single-user. |
| Top Partner | `/top-partner`, `/api/top-partner` | `TopPartnerPage.tsx`, `lib/top-partner*.js` | Public partner directory + cached photos/OG. |

## Peta Folder

```text
.
├── server.js                         # Express app, API, static serving, background jobs
├── instrument.mjs                    # Sentry init; must be imported first
├── laporan-api.js                    # Legacy AIW session, scrape, umrah registration submit
├── awapi-client.js                   # Official Alhijaz API client and normalization
├── haji-api.js                       # Legacy haji scrape/enrichment helpers
├── calendar-api.js                   # Calendar scrape/sync helpers
├── telegram-notifier.js              # Telegram bot, cron alerts, digest, reminders
├── mcp-server.js                     # MCP read-only server (data bisnis, per-agent)
├── dev-mcp.js                        # Dev-MCP: MCP developer-tool (docs/struktur/kode) + OAuth single-user
├── deploy-webhook.js                 # GitHub webhook deploy listener
├── lib/og-generator.mjs              # Generator OG Top Partner dan flight share
├── vite.config.ts                    # Vite, PWA, dev plugins, manual chunks
├── tailwind.config.js                # Tailwind tokens and animations
├── src/
│   ├── main.tsx                      # Path router, PWA registration, stale-build guard
│   ├── App.tsx                       # Public package listing
│   ├── index.css                     # Global CSS and custom animations
│   ├── components/                   # 100+ component files and feature folders
│   ├── data/                         # Agent/package metadata helpers
│   ├── hooks/                        # Shared frontend hooks
│   ├── lib/                          # Frontend helper modules
│   ├── services/                     # Client data service/cache
│   ├── types/                        # TS shared types
│   └── utils/                        # Validation, analytics, filters, auth
├── lib/                              # Server-side pure/business logic
├── functions/[slug]/                 # SSR-like landing functions and assets
├── scripts/                          # Migrations, backfills, one-off tools
├── migrations/                       # SQL migrations committed for recent schema changes
├── public/                           # Static assets, fonts, OG images, landing HTML
├── tests/                            # 106 node:test files
├── Dockerfile
└── docker-compose.yml
```

## Runtime Architecture

Express is the production boundary:

- Serves `/api/*` backend routes.
- Serves `dist/` assets and SPA fallback.
- Injects OG metadata/context for public landing pages dan membuat OG PNG dinamis untuk flight share.
- Runs Telegram notifier, sync loops, weather/top-partner refresh, schedule sync, DB health probes.
- Owns server-only secrets through `dotenv`.

Frontend routing is custom path parsing in `src/main.tsx`, not React Router. Dashboard subpages are lazy-loaded in `DashboardLayout.tsx`.

PWA is enabled only on `alhijaz.co`, `localhost`, and `127.0.0.1`. Custom domains intentionally unregister service workers and clear caches because SW-precache would otherwise overwrite host-specific `window.__AGENT_CONTEXT__`.

## Source Inventory

Snapshot audit 2026-07-19:

| Area | Count / note |
| --- | --- |
| `src` TS/TSX/CSS files | 229 |
| Test files | 126 `*.test.js` (5 di antaranya `*.browser.test.js` Playwright) |
| SQL migrations | 22 files under `migrations/` |
| Backend route declarations | 170+ `app.get/post/put/delete` declarations in `server.js` |
| Largest file | `server.js` (~21.5k lines) |
| Critical large frontend files | `PackageCard`, `DashboardProfile`, `JamaahPage`, `UmrahRegisterPage`, `KalkulasiPage`, `HajiPage`, `AskAIModal`, `StatistikPage`. |

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite 4, TailwindCSS 3 |
| Backend | Node.js ESM, Express 5, compression |
| Database | Supabase PostgreSQL with service-role backend access |
| Auth | bcrypt + jsonwebtoken custom JWT; Portal cookie; MCP bearer key |
| Scrape/API | native fetch, Cheerio, Playwright Chromium fallback |
| PDF/export | `@react-pdf/renderer`, `react-pdf`, `modern-screenshot`, `@zumer/snapdom`, `sharp` |
| Charts/maps | Recharts, Leaflet/React Leaflet |
| AI | OpenAI API for copy/Tanya AI/OCR, Google TTS for voice |
| Notifications | Telegram Bot API + node-cron |
| Email | Resend |
| Error tracking | Sentry via `instrument.mjs` |
| Validation/protocol | Zod, MCP SDK |
| CDN/storage | Bunny Storage/CDN, Supabase Storage |

## Fitur Aktif

### Public

- Jadwal umroh dengan filter paket, maskapai, tanggal, harga, seat, hotel, dan route.
- Semua mode filter selain `SEMUA DATA` hanya menampilkan paket dengan `seatSisa > 0`; opsi tipe paket, bulan, durasi, dan kota landing juga dibentuk dari paket yang masih tersedia agar pilihan sekunder tidak berujung kosong.
- Mode `TIPE PAKET` (slug `/tipe-paket`, sub-nilai di query `?tipe=`) memakai roster yang sama persis dengan dimensi "Tipe Paket" halaman Brosur. Roster, urutan, label, dan predikat keanggotaannya tinggal di `src/lib/packageType.js` — ubah di sana saja, jangan menulis predikat kedua di halaman mana pun. Keanggotaan "Umroh Rahmah" ditentukan tier di `paket_harga`, bukan nama paket.
- Agent-specific public page by slug and custom domain.
- Single package deep link and OG injection.
- Package card variants: default, split, spotlight, ticket, tiled, magazine.
- Brochure/itinerary view and share.
- Tanya AI per paket (`AskAIModal`) with attachment cards and WhatsApp nudge.
- Link Bio (`/:slug/bio`) with editor-driven tiles.
- Landing pages `/:slug/umroh`, `/:slug/haji`.
- Portal Jamaah (`/:slug/jamaah`) with magic-link flow.
- Flight share page `/f/:code` memakai status, warna, progress bar, dan animasi yang sama dengan kartu Dashboard. Header hanya memuat identitas penerbangan dan tombol share; status ditampilkan sekali di hero.
- Preview sosial flight share memakai OG PNG `1200x630` yang dibentuk dari snapshot penerbangan dan profil agent melalui `/og/flight/:code.png`.
- Top Partner directory `/top-partner`.
- Special landing `/rahmah-1-juli-2026` untuk pilihan pengambilan Air Zam-zam per jamaah.

### Dashboard Agent/Admin

- Login/register/reset password.
- Dashboard home with schedule, Telegram banner, calendar, weather, kurs, birthday, flight status.
- Settings: profile, Telegram, CAPI.
- Email alias `alias@alhijaz.co` (dipilih agent sekali, permanen; form di bawah field Email tab Profil): email masuk diteruskan ke email pribadi agent via Resend Inbound; tampil menggantikan email pribadi di kartu nama + vCard QR. Detail di §Email Alias Agent.
- Agent profile/photo/crop, slug cooldown, card variant, landing config.
- Custom domain management.
- Jamaah Umroh and Haji management.
- Pendaftaran jamaah baru/tambah jamaah through legacy AIW.
- Statistik umroh/haji and admin trend/ranking.
- Kalkulasi package price and quotation PDF.
- Compare package.
- Brosur Jadwal monthly export/catalog. 4 opsi desain via chip picker (persist localStorage `brosurDesignId`): Klasik (default, merah-emas; varian winter otomatis utk filter Musim Dingin) + 3 alternatif di `src/components/brochure-designs/` — Boarding Pass (tiket pesawat: stub tanggal, rute CGK✈landing, barcode, sisa seat), Serambi Nabawi (gading putih + foil emas, payung/arcade Nabawi; angka Playfair wajib lining-nums), Tasbih Hijau (putih-mint + tile tanggal zamrud, harga emas gelap). Zamrud Royal & Senja Haramain dicabut 18 Jul 2026 (terlalu gelap); id lama di localStorage fallback ke Klasik. Opsi berlaku utk preview/export gambar; katalog PDF selalu Klasik (rasterSafe).
- Nilai Plus Paket: prompt ad-creative grounded dari brosur+itinerary dengan rotasi 10 gaya desain + lampiran lembar identitas agent (lihat seksi di bawah).
- Kurs share image.
- Voice-over script and audio generation.
- Simulasi Haji Plus and Haji Plus export.
- Business card generator (5 desain × landscape/portrait; QR bisa diarahkan ke halaman web agent atau vCard "simpan kontak"; teks URL pakai custom domain bila aktif).
- Teras: feed komunitas antar-agent (detail di seksi Teras di bawah).
- MCP integration key management.
- Admin agent management and analytics.

### Teras (Komunitas Agent)

Feed komunitas ala Threads untuk sesama agent. Mulanya pilot allowlist slug (nikita); sejak 2026-07-19 terbuka untuk **semua agent login** — gate efektifnya tinggal `authMiddleware`, tetapi helper `lib/community-access.js` + `src/lib/communityAccess.ts` sengaja dipertahankan sebagai satu titik keputusan bila kelak dibatasi lagi (mis. per-role).

Surface & routing:

- Tab "Teras" di dashboard (`/dashboard/teras`, lazy `TerasPage.tsx`), detail post `/dashboard/teras/post/:id`.
- Profil publik agent `/teras/<slug>` dan share link post `/teras/<kode-8-hex>` (`lib/teras-share.js`). Keduanya diparse `src/lib/terasRoutes.ts`; bentuk kode share **menang** atas slug karena sudah beredar di WhatsApp lebih dulu. Keduanya dirender di dalam shell dashboard; pengunjung belum login diarahkan ke login dengan tujuan tersimpan (`teras_share_next`).
- Slug `teras` masuk `RESERVED_SPA_SLUGS`; slug agent berbentuk kode share juga ditolak validasi slug.

Komposer & konten post:

- Teks dengan clamp tampilan, URL di body otomatis jadi tautan (`lib/teras-linkify.js`, dipakai FE dan server); URL yang sudah diwakili kartu preview disembunyikan dari teks.
- Media post/komentar: maksimum 10 item, gambar ≤ 3MB, video ≤ 20MB — batas disinkron di **tiga titik**: klien, `server.js` (`COMMUNITY_MAX_MEDIA_ITEMS` dkk), dan constraint DB. Upload via `POST /api/community/media` ke Bunny CDN path `community/` (fallback Supabase Storage bila Bunny belum dikonfigurasi); video dapat poster pratinjau via media fragment.
- Quote post ala Threads (`quoted_post_id`).
- Polling ala Threads (2026-07-26): 2-4 opsi teks, durasi dipilih dari daftar tetap `poll.duration` 1d/3d/7d (24 jam default — angka bebas ditolak), hasil (persentase + bar) tampil setelah memilih, suara bisa diganti selama terbuka (upsert, tidak bisa dicabut). Daftar pemilih TIDAK anonim (keputusan produk): label "N suara" membuka popover pemilih (nama + opsi pilihannya) via `GET /api/community/posts/:id/poll-voters`; komponen di `src/components/teras/PollBlock.tsx`. Tabel `community_polls` + `community_poll_votes` (migrasi `20260726010000`), helper murni `lib/community-poll.js`, vote via `POST /api/community/posts/:id/poll-vote`; poll milik segmen pertama utas dan tidak bisa digabung media segmen itu/quote (server & komposer sama-sama menolak). Feed/detail memuat poll lewat `loadCommunityPollMaps` (query terpisah ala engagement maps, degradasi senyap bila tabel belum ada).
- Link preview ala Threads: metadata di kolom `community_posts.link_preview` (jsonb), diambil saat compose lewat proxy `GET /api/community/link-preview` dengan guard anti-SSRF (blokir IP privat, termasuk IPv6-embedded/6to4 IPv4) di `lib/community-link-preview.js`.
- Mention `@slug` antar-agent: helper murni dua sisi (`lib/community-mentions.js` + `src/lib/communityMentions.ts`), maksimum 10 mention/post, pill mention dirender klien dari daftar `/members` dan menautkan ke profil. Pencatatan idempoten (read-then-insert karena partial unique index tidak bisa dipakai `on_conflict`); mention baru juga dikirim sebagai notifikasi Telegram ke agent tersebut dengan link detail post.

Notifikasi:

- Bell di header dashboard (`NotificationBell.tsx` + hook `useTerasNotifications`), agregasi **mention + komentar + reaksi** pada post milik agent (`lib/community-notifications.js`).
- Endpoint: `GET /api/community/notifications[/head]`, `POST /api/community/notifications/seen` (watermark; tanpa watermark semua item dihitung unread). Kegagalan muat tidak menandai terbaca dan tampil sebagai galat di panel.

Data & operasional:

- Tabel: `community_posts` (+ `media` jsonb, `quoted_post_id`, `link_preview`, `pinned_at`), `community_post_reactions`, `community_post_comments` (+ `media`), `community_post_reports`, `community_reads`, `community_mentions` (unique parsial level post vs komentar), `community_polls` + `community_poll_votes` (polling).
- **DDL diterapkan manual** dengan menempel SQL `migrations/2026071x-2x_community_*.sql` di Supabase SQL Editor (tidak ada pipeline migrasi otomatis). Endpoint post/komentar mengembalikan **503 "Migrasi ... Teras belum diterapkan"** bila kolom media/quote/mention belum ada — itu sinyal migrasi tertinggal, bukan bug kode.
- Feed mode profil memakai `GET /api/community/feed?agent=<slug>`; identitas profil dari `GET /api/community/members`. `POST /api/community/read` menyimpan watermark baca feed untuk teaser unread (`TerasCard` di dashboard home via `/api/community/teaser`).
- Moderasi ringan: report post, hapus post/komentar milik sendiri, pin (`pinned_at`).
- Rate limit upload media per-agent (window in-memory di `server.js`).
- Test: `tests/community-*.test.js`, `tests/teras-*.test.js`, termasuk 5 browser test Playwright (feed, profil, bell).

### Nilai Plus Paket (AI Tools brosur)

Entry: BrochureModal → AI Tools → "Nilai Plus Paket" (`PackageValueModal.tsx`). Tujuan: menonjolkan keunggulan paket sebagai prompt ad-creative siap tempel ke ChatGPT, bukan menyalin brosur mentah.

- `POST /api/package-value` (auth agent): analisis grounded via gpt-4o-mini atas brosur terstruktur + itinerary cache; hasil = headline hook, summary, visualIdea, 2-3 advantages (title/benefit experiential/description faktual, evidence-locked), bestFor.
- Prompt banner dirakit deterministik di `lib/package-value-prompt.js` dengan SATU preset dari `PACKAGE_VALUE_STYLES` (10 arah desain berbeda: editorial, sinematik, Swiss, tipografi, luxury malam, dokumenter, kolase, poster vintage, geometri islami, gradien mihrab). Server merotasi gaya per request; body `excludeStyle` (tombol "Ganti Gaya") menjamin gaya baru tanpa AI call — cache hit merakit ulang prompt saja.
- Panjang prompt dijaga ≤ ~4.9k (plafon native share 5000) lewat degradasi bertingkat `PROMPT_DEGRADE_STAGES`.
- Cache `package_value_cache` menyimpan HANYA analisis (tanpa bannerPrompt/style); key = sha256(promptVersion|jadwalId|tier|documentHash). Bump `PACKAGE_VALUE_PROMPT_VERSION` menginvalidasi otomatis. Rate limit 15 analisis AI/2 jam per agent (cache hit tidak dihitung).
- `GET /api/package-value/agent-card`: PNG 1200x630 "lembar referensi identitas" (`generatePackageValueAgentCardPng` di `lib/og-generator.mjs`) — asset board berlabel chip 01·FOTO…06·LOGO berisi foto (fallback monogram + caption "jangan buat wajah"), nama (auto 2 baris), peran Konsultan Umroh & Haji, WhatsApp lokal, website (custom domain aktif > `agents.website`), logo. Dilampirkan bersama prompt via native share file+text (fallback: buka ChatGPT + salin + unduh).
- Tests: `tests/package-value-*.test.js` (kontrak prompt/gaya/panjang, modal, endpoint, kartu identitas).

### Special Landing Rahmah Juli

Route `/rahmah-1-juli-2026` adalah tool publik mobile-first untuk 43 jamaah kloter Rahmah 1–9 Juli 2026.

- Jamaah dikelompokkan per keluarga dan dapat dicari berdasarkan nama/nomor WA.
- Setiap kartu selalu menampilkan status Zam-zam: `Belum Pilih`, `Ambil Sendiri`, atau `Diantar ke Rumah`.
- Opsi antar mewajibkan nama penerima, nomor HP, dan alamat lengkap.
- Tombol simpan menunggu respons API, mencegah klik ganda, dan menampilkan status sukses/fallback lokal.
- Data persisten disimpan per jamaah di `booking_persiapan.tahapan[trip_slug].jamaah` melalui `GET/PUT /api/tour-leader-prep/:tripSlug`.
- Frontend tetap memakai `localStorage` sebagai fallback perangkat, tetapi penyimpanan server memerlukan proses `miqot.service` yang sudah memuat kode backend terbaru; build SPA saja tidak cukup setelah route berubah.
- Kartu jamaah tidak lagi menampilkan CTA WhatsApp atau checklist persiapan/kamar. CTA Chat WA hanya tersedia pada kartu Tour Leader/Muthowif.

## Flow Kritis: Pendaftaran Umrah

Files:

- Frontend: `src/components/UmrahRegisterPage.tsx`
- Button source: `src/components/JamaahPage.tsx`
- Backend routes: `server.js` `/api/umrah/*`
- Legacy integration: `laporan-api.js`
- Guard test: `tests/umrah-register-session-retry.test.js`

Current behavior:

1. Frontend calls `GET /api/umrah/form-options`.
2. Backend ensures legacy session, scrapes form fields/selects/hidden values.
3. In add-jamaah mode, `idb` must be full `id_umroh.id_jadwal`, for example `AIW0029560.JBU1535`.
4. Frontend submits JSON to `POST /api/umrah/register`.
5. Backend enriches compatibility fields required by legacy PHP (`jadwal`, `pakets`, `tgl_pendaftaran`, name variants, `plahir`, `tlahir`, `tjamaah`, `status`).
6. `lib/umrah-submit-orchestrator.js` memilih tepat satu transport:
   - jika password legacy tersimpan, Playwright/browser adalah jalur utama karena form membutuhkan JavaScript dan reCAPTCHA;
   - direct multipart hanya dipakai untuk sesi legacy aktif yang tidak memiliki password tersimpan.
7. Jalur browser:
   - login through legacy page,
   - open form,
   - trigger dependency AJAX,
   - baca harga paket dari browser agar snapshot SPA yang stale tidak menimpanya,
   - execute reCAPTCHA v3 in browser,
   - submit the real form.
8. Browser submit allows informational `sisa seat = N` dialogs when `N > 0`, but treats zero seat or other alerts as blocking.
9. Kegagalan upstream dikembalikan sebagai JSON terstruktur (`success:false`, `reason`, `retryable`, `error`) dengan HTTP 424; frontend juga merangkum HTML/proxy failure menjadi pesan yang aman dibaca.

Why this exists:

- Alhijaz legacy POST dapat menolak direct multipart sebagai expired session atau HTTP 403 walau form GET berhasil.
- The final form requires browser-executed JavaScript/reCAPTCHA context.
- Menjalankan dua transport secara berurutan berisiko submit ganda; orchestrator sengaja memilih tepat satu jalur.

Operational checklist after touching this flow:

```bash
node --check laporan-api.js
node --check server.js
node --test tests/umrah-submit-orchestrator.test.js
node --test tests/umrah-register-session-retry.test.js
npm run build:spa
sudo systemctl restart miqot.service
```

Manual smoke:

- `GET /api/umrah/form-options?idb=<id_umroh.id_jadwal>` should return `success:true`.
- Submit new jamaah with a test `CODEX ...` name.
- Submit add-jamaah with the full `idb`.
- Check `journalctl -u miqot.service` for `UmrahSubmit`, `UmrahBrowserSubmit`, `Pendaftaran berhasil`, and HTTP 403 retry logs.

## Sync & Data Integrity

### Umroh

Primary path is AWAPI when `AWAPI_SYNC_ENABLED=true`. Legacy scrape remains for credentials discovery, fallback, and enrichment depending on env gates.

Important guards:

- `agent_id` UUID is the row owner key.
- Cleanup is allowed only after complete/successful upstream fetch.
- Partial AWAPI fetch must not delete rows.
- `jamaah-payment-provenance.js` prevents stale legacy payment columns from overwriting trusted AWAPI/manual data.
- Batch size is intentionally small through `JAMAAH_UPSERT_BATCH` to avoid Supabase Disk IO/work_mem pressure.
- Background cycles persist `data/sync-state.json` to avoid restart storms.

Itinerary AI cache (`itineraries` table, dipakai kartu "Urutan Perjalanan", viewer itinerary, Ask-AI, terminal kalender):

- `syncAllItineraries` (server.js, startup + tiap 12 jam) menstrukturkan PDF dan menyimpan `content` + `source_sha256` (sha PDF yang diproses). Sync dokumen harian 03:30 WIB langsung memanggil siklus ini setelah fingerprint/CDN diperbarui, jadi tidak ada lagi jeda acak hingga 12 jam.
- Re-parse terjadi bila: belum ada cache, cache legacy tanpa `source_sha256`, atau `umroh_schedules.itinerary_source_sha256` (diperbarui Bunny sync) ≠ sha cache. `GET /api/itinerary/:jadwalId` juga membandingkan kedua hash sebelum menyajikan konten dan melakukan refresh single-flight dari URL jadwal tepercaya. Bila refresh gagal, API fail-closed ke PDF terbaru dan tidak mengirim konten web lama.
- Konsumen internal `getItineraryContext`, urutan perjalanan jadwal, dan filter itinerary Bani mengabaikan cache dengan hash berbeda. Parser menolak byte PDF yang tidak cocok dengan fingerprint jadwal sebelum memanggil model atau menulis cache.
- Guard tambahan di endpoint jadwal: `saudiOrderContradictsRoute` (lib/journey-order.js) membuang `journey_order` hasil itinerary bila landing MED tapi itinerary bilang Umroh dulu (cache pasti basi) → frontend fallback ke inferensi rute. Sinyal landing JED sengaja tidak dipakai (pola Jum'atain Madinah–Mekkah–Madinah ambigu).
- Teks PDF untuk prompt dipotong di 20k karakter (dulu 6k — itinerary 15 hari kehilangan hari-hari ekor).

Brosur resmi (`umroh_schedules.brosur*`, dipakai halaman Paket, halaman Brosur, Bani, Ask-AI, dan bio):

- Sync jadwal 30-menit langsung memindai fingerprint isi brosur. File utama dan thumbnail memakai nama objek ber-hash, sehingga perubahan byte menghasilkan URL baru dan tidak dapat tertukar dengan cache edge lama.
- Perubahan URL sumber mengosongkan CDN, thumbnail, dan fingerprint lama dalam upsert yang sama. Bila replacement upload/metadata gagal setelah byte baru terdeteksi, CDN lama juga di-fail-closed dan pembaca jatuh ke sumber saat ini.
- Semua pembaca memakai resolver yang mencocokkan hash pada nama objek dengan `brosur_source_sha256`; thumbnail berbeda versi tidak pernah ditampilkan bersama brosur utama. Jalur proxy sumber dan service worker tidak menyimpan URL brosur stabil yang isinya dapat berubah.

### Haji

AWAPI owns frequent sync if enabled. Legacy haji scraper is scheduled enrichment and can be disabled with legacy background gates. Currency displayed on Haji rows is USD.

### Calendar & Flight Integrity

Public calendar transport and flight tracking fail closed when upstream evidence is incomplete:

- `lib/calendar-public-source.js` tries the official TLS hostname first, then an optional origin-IP fallback with preserved Host/SNI behavior and cooldowns.
- `lib/calendar-public-snapshot.js` rejects snapshots below the minimum event count or missing required event types.
- Calendar stale deletion is skipped for degraded/fallback snapshots, bounded by a maximum delete ratio, and requires confirmation across snapshots before rows are removed.
- The primary calendar origin is re-probed periodically; recovery triggers a full authoritative sync.
- Flight rows are matched against flight number, operational date, departure, and arrival before provider evidence is accepted.
- Provider status has per-state freshness windows. Only fresh `en-route`/`delayed` evidence may show `LIVE`.
- Calendar-only or expired active states become `unverified`/`Perlu Cek`; scheduled snapshots expire at planned takeoff instead of pretending to be live.
- Verified itinerary timing overrides are keyed by schedule/date/flight and guarded by itinerary SHA-256.

Presentation status penerbangan sengaja dibagi sebagai shared UI agar Dashboard dan landing publik tidak menyimpang:

- `src/lib/flightStatusPresentation.ts` adalah sumber tunggal normalisasi status, label, dan warna untuk `scheduled`, `en-route`, `delayed`, `landed`, `cancelled`, dan `unverified`.
- `src/components/FlightRouteLine.tsx` adalah SVG bersama untuk kartu Dashboard dan `/f/:code`: scheduled memakai marching dash, en-route menampilkan garis yang sudah ditempuh dan pulse pesawat, delayed memakai dash merah, landed memakai garis/check hijau, sedangkan cancelled statis.
- `FlightStatusCard.tsx` dan `FlightSharePage.tsx` harus memakai dua modul shared tersebut. Jangan menyalin kembali mapping status atau SVG route ke masing-masing surface.
- Public flight share me-refresh `/api/flight-share/:code` setiap 30 menit dengan `cache: no-store`, sama seperti cadence Dashboard.
- OG image `/og/flight/:code.png` mengambil snapshot `flight_shares` dan identitas agent. Gambar sengaja tidak mengklaim status operasional sementara karena cache crawler dapat hidup lebih lama dari status penerbangan.
- HTML `/f/:code` menyuntikkan canonical, Open Graph, Twitter Card, alt text, dan query version SHA-1 pada URL gambar agar perubahan data utama mem-bust cache crawler.

### DB Protection

`lib/db-health.js` and `lib/db-circuit.js` protect the app when Supabase is slow/unreachable:

- DB health probe alerts via Telegram.
- Circuit breaker sheds heavy read routes and background sync.
- Heavy endpoints use `dbLoadShedGuard`.
- Log hygiene caps huge Cloudflare/HTML error bodies in journald.

Do not increase background sync cadence, upsert batch size, or route polling without measuring DB and Supabase Disk IO impact.

## API & Endpoint Groups

`server.js` owns the route surface. Major groups:

| Group | Prefix |
| --- | --- |
| Auth/PIN | `/api/auth/*` |
| Admin/profile | `/api/admin/*` |
| Agent public metadata | `/api/agent/*`, `/api/agents/:slug/public` |
| Telegram | `/api/telegram/*` |
| Email alias | `/api/resend-inbound` (webhook Resend, raw body), `/api/agent/email-alias` |
| CAPI | `/api/capi/:slug/*` |
| AWAPI smoke | `/api/awapi/test` |
| Laporan/Jamaah Umroh | `/api/laporan/*` |
| Umrah registration | `/api/umrah/*` |
| Rahmah tour-leader prep | `/api/tour-leader-prep/:tripSlug/*` |
| Haji | `/api/haji/*` |
| Calendar | `/api/calendar/*` |
| Flights | `/api/flights/*`, `/api/flight-share/*`, `/og/flight/:code.png` |
| AI | `/api/ai-copy`, `/api/ask-ai/*`, `/api/ai-tools/*`, `/api/package-value`, `/api/package-value/agent-card` |
| Analytics | `/api/analytics/*` |
| Weather/Kurs | `/api/weather/*`, `/api/kurs*` |
| Landing/Bio/Domain | `/api/landing-config`, `/api/bio/*`, `/api/agent/custom-domain` |
| Portal Jamaah | `/api/portal/jamaah/*` |
| Teras/Community | `/api/community/*` (teaser, read, feed[/head], posts + reaction/comments/report, media, members, notifications[/head, /seen], link-preview) |
| MCP | `/mcp`, `/api/mcp-key` |
| Dev-MCP | `/dev-mcp`, `/oauth/dev/*`, `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server` |
| Top Partner | `/api/top-partner` |
| Schedule cache | `/api/schedules/:yearCode` |
| Static/proxy/public | `/itinerary/*`, `/brosur/*`, `/:slug/umroh`, `/:slug/haji`, `/:slug/bio`, `/top-partner`, `/f/:code`, `/og/flight/:code.png`, SPA fallback |

Auth format for dashboard endpoints:

```http
Authorization: Bearer <jwt>
Content-Type: application/json
```

Common success shape:

```json
{ "success": true, "data": {} }
```

Common failure shape:

```json
{ "success": false, "error": "Pesan error" }
```

### Dev-MCP (developer tool untuk brainstorming di claude.ai)

`dev-mcp.js` — MCP read-only KEDUA, **berbeda dari `mcp-server.js`**: bukan data bisnis per-agent, melainkan **struktur project + dokumentasi + kode** untuk developer. Dipakai dari custom connector claude.ai supaya Claude paham codebase saat brainstorming. Endpoint `POST /dev-mcp`.

- **Tools (7, read-only):** `project_overview` (project-summary.md), `design_system` (DESIGN-SYSTEM.md), `list_docs`, `read_doc`, `project_tree`, `search_code` (git grep), `read_file`.
- **Batas aman = git:** hanya file **ter-track** yang bisa dibaca (`git ls-files`/`git grep`); `.env` & secret gitignore otomatis TAK terjangkau. Path-traversal di-guard, git dipanggil via `execFile` (no shell). Blocklist opsional `DEV_MCP_BLOCK_GLOBS`.
- **Auth OAuth 2.1 single-user:** connector claude.ai wajib OAuth (bukan bearer statis). Gerbang **satu password** `DEV_MCP_PASSWORD`; semua artefak (client_id/code/access/refresh) = JWT bertanda-tangan → **tanpa tabel DB**. Discovery RFC 9728/8414 (`/.well-known/oauth-*`), DCR RFC 7591 (`/oauth/dev/register`), authorize+PKCE S256 (`/oauth/dev/authorize`), token (`/oauth/dev/token`). Access token aud-bound ke `<base>/dev-mcp`, exp 8 jam; refresh 30 hari. Token response memakai opaque wrapper (`mcp_at_...`, `mcp_rt_...`) dengan klaim internal `iss`/`aud`/`client_id`/`jti`/`scope`.
- **Secret:** `DEV_MCP_SECRET` (kalau kosong diturunkan dari `JWT_SECRET` via HMAC → token dev terpisah kriptografis dari JWT dashboard). **Revoke** = rotate `DEV_MCP_SECRET` + restart.
- **Aktivasi:** kosongkan `DEV_MCP_PASSWORD` = endpoint nonaktif (default). Baca repo di disk VPS → mencerminkan versi **ter-deploy** (bukan working-dir belum di-commit).
- **Pakai:** claude.ai → Settings → Connectors → Add custom connector → `https://alhijaz.co/dev-mcp` → login password dev. Status 2026-07-10: Claude Web connector berhasil terhubung.
- **Cloudflare wajib allowlist:** Anthropic outbound range `160.79.104.0/21` harus di-allow. Karena Cloudflare IP Access Rules hanya menerima `/16` atau `/24`, pecah menjadi `160.79.104.0/24` sampai `160.79.111.0/24`. Tambahkan WAF Skip untuk `/dev-mcp`, `/oauth/dev/*`, dan `/.well-known/oauth-*`; matikan Bot Fight Mode biasa bila aktif karena tidak bisa di-bypass oleh WAF Skip.
- **Claude Project:** Project Instructions sebaiknya mewajibkan Claude memakai Dev-MCP dulu (`project_overview`, `design_system`, `project_tree`, `search_code`, `read_file`) sebelum menjawab pertanyaan repo. Project Files tidak perlu menyimpan salinan `project-summary.md`/`DESIGN-SYSTEM.md` kecuali fallback, karena bisa stale.
- **Test:** `tests/dev-mcp.test.js` (unit murni + guard read-only; 21 pass saat setup berhasil). Tes Claude Web: minta `project_overview`, lalu `search_code` untuk `initDevMcp`; pantau tool call via `sudo journalctl -u miqot.service -f | grep --line-buffered DevMCP`.

Some legacy-sensitive endpoints intentionally return HTTP 200 with `success:false` so proxies do not replace useful JSON with generic HTML error pages.

## Email Alias Agent (alias@alhijaz.co)

Forwarding email per-agent via **Resend Inbound** (bukan Cloudflare Email Routing — dipilih karena zero friksi: tidak ada verifikasi destination per agent, tidak ada limit 200 alias, dan Resend sudah dipakai untuk outbound).

Arsitektur: MX apex `alhijaz.co` → Resend (catch-all seluruh domain) → webhook `email.received` → `POST /api/resend-inbound` (raw body, verifikasi Svix manual di `email-alias.js`) → lookup local-part vs `agents.email_alias` (via cache `getAgentByAlias`, hemat DB) → `resend.emails.receiving.get` + attachments (signed `download_url`, berlaku 1 jam) → `resend.emails.send` dengan `from: "Pengirim (email@asli)" <alias@alhijaz.co>`, `replyTo` pengirim asli, header `References`/`In-Reply-To` untuk threading Gmail.

Keputusan desain (Jul 2026):

- **Receive-only** — agent membalas dari email pribadinya; reply-as-alias sengaja tidak dibuat (API key Resend hanya bisa di-scope per-domain → risiko impersonation lintas-agent).
- **Alias dipilih agent sendiri, SEKALI, permanen** — bukan otomatis dari slug. Form inline di bawah field Email pada Settings → Profil (`EmailAliasField` di `DashboardProfile.tsx`); `POST /api/agent/email-alias` menolak perubahan setelah terisi (`ALIAS_LOCKED`; guard race: update `.is('email_alias', null)` + unique index `lower(email_alias)`). Salah ketik = perbaikan hanya via SQL admin (`UPDATE agents SET email_alias=... WHERE slug=...`).
- Karena tidak terikat slug, alias TETAP hidup saat agent ganti username.
- Alias tidak boleh: reserved (`RESERVED_EMAIL_LOCAL_PARTS` di `email-alias.js`), sama dengan slug agent lain (anti-squatting), atau sudah dipakai agent lain.
- **Local-part tak dikenal di-drop** (dicatat di `email_forward_log`, tidak diforward ke siapa pun) — termasuk balasan ke `bismillah@`.
- `RESERVED_EMAIL_LOCAL_PARTS` juga diblok sebagai slug baru (dua titik validasi slug di `server.js`).
- Kartu nama + vCard QR menampilkan alias menggantikan email pribadi saat sudah dibuat (`BusinessCardPage.tsx`; `/api/auth/me` expose `email_alias`).

Setup manual (sekali, belum dilakukan otomatis):

1. Dashboard Resend → domain alhijaz.co → enable receiving → pasang MX apex di Cloudflare (DNS-only, priority terendah). Tidak konflik dengan record outbound Resend (`send.alhijaz.co`).
2. Dashboard Resend → webhook `email.received` → `https://alhijaz.co/api/resend-inbound` → simpan signing secret ke `RESEND_WEBHOOK_SECRET` (fitur nonaktif selama kosong; endpoint balas 503).
3. Tambah DMARC: `_dmarc.alhijaz.co TXT "v=DMARC1; p=none; rua=mailto:..."`.

Gotcha operasional: 1 email diforward = 2 unit kuota Resend (received + sent); free tier 3.000/bln + cap 100/hari → naik ke Pro saat adopsi tumbuh. Email >40MB gagal diforward. Retensi Resend 30 hari; `email_forward_log` adalah arsip metadata satu-satunya setelah itu. Webhook di-retry saat non-200 — idempotensi dijaga unique index `(resend_email_id, agent_id)` status `forwarded`. Edukasi agent: spam yang lolos di-delete, jangan "Report spam" (merusak reputasi jalur forwarding, peringatan eksplisit Google).

## Data Model Ringkas

Core tables referenced by current code/docs:

| Table | Purpose |
| --- | --- |
| `agents` | Canonical user/agent row, login, profile, slug, CAPI config refs, legacy credentials, AWAPI key, MCP key, landing/bio config, Telegram prefs, `email_alias` (immutable, unique) + `email_alias_enabled`. |
| `email_forward_log` | Log forwarding email alias (status forwarded/dropped_*/failed per `resend_email_id` + agent); juga guard idempotensi webhook retry. RLS on, tanpa policy (server-only). |
| `agent_slug_history` | Slug change history/cooldown. |
| `jamaah` | Jamaah umroh rows, owned by `agent_id`; booking id, jm_id, payment, docs, equipment, notes, raw_data. |
| `jamaah_haji` | Jamaah haji rows, owned by `agent_id`; official and legacy fields, docs, notes, payment. |
| `calendar_events` | Manasik/berangkat/pulang events with flight/pax fields. |
| `calendar_insights` | AI insights around calendar data. |
| `umroh_schedules` | Cached schedule rows and CDN fingerprint metadata. |
| `flight_status` | Cached AirLabs flight status. |
| `flight_shares` | Public `/f/:code` payload. |
| `analytics_events` | Raw analytics events. |
| `analytics_events_daily` | Daily aggregate after retention cleanup. |
| `capi_configs`, `capi_event_logs` | Meta CAPI config/logs. |
| `ai_credits`, `ask_ai_cache` | AI usage/cache. |
| `jamaah_portal_tokens`, `jamaah_portal_sessions`, `booking_persiapan` | Portal Jamaah auth plus JSON preparation/Zam-zam choices per booking and jamaah. |
| `jamaah_document_cache` | Cached printable document HTML/PDF proxy source. |
| `community_posts`, `community_post_reactions`, `community_post_comments`, `community_post_reports` | Feed Teras: post (media/quote/link_preview/pinned), reaksi, komentar (media), laporan. RLS on, akses via service role. |
| `community_reads`, `community_mentions` | Watermark baca feed per agent; inbox mention (unique parsial post/komentar, unread via `read_at`). |
| `weather_cache`, `kurs_cache`, `top_partners_cache` | Server-side external data cache. |
| `haji_plus_stats` | Haji Plus stats source. |

Recent committed migrations:

- Portal Jamaah tables.
- Haji AWAPI columns.
- Umroh schedule CDN fingerprints.
- Jamaah document cache.
- Analytics FK/index maintenance.
- Weather cache.
- MCP key columns.
- Calendar pax fields.
- Top Partner cache.
- Teras community feed: posts/reactions/comments/reports, reads, media post+komentar, quote, mentions, link preview (additive-only; diterapkan manual via Supabase SQL Editor).

## Environment

Essential:

| Env | Used for |
| --- | --- |
| `PORT` | Express port, default 3000. |
| `SUPABASE_URL` | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase service role. Never expose to frontend. |
| `VITE_SUPABASE_URL` | Frontend Supabase URL. |
| `VITE_SUPABASE_ANON_KEY` | Frontend anon key. |
| `JWT_SECRET` | Dashboard JWT signing. Must be set in production. |
| `CAPI_ENCRYPTION_KEY` | Encrypt/decrypt sensitive CAPI and legacy credential data. |
| `MASTER_PASSWORD` | Emergency/master login path used in auth/CAPI login. |
| `DEV_MCP_PASSWORD` | **Wajib untuk MENGAKTIFKAN Dev-MCP `/dev-mcp`** (kosong = nonaktif). Password gerbang OAuth developer. |
| `DEV_MCP_SECRET` | Opsional. JWT signing Dev-MCP; kalau kosong diturunkan aman dari `JWT_SECRET`. Rotate = revoke semua token Dev-MCP. |
| `DEV_MCP_BLOCK_GLOBS` | Opsional. Glob dipisah koma untuk menyembunyikan berkas tertentu dari Dev-MCP. |

External services:

| Env | Used for |
| --- | --- |
| `OPENAI_API_KEY` | AI copy, Tanya AI, KTP OCR, bio tagline. |
| `GOOGLE_TTS_API_KEY` | Voice generator. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_CHAT_ID`, `OPS_ALERT_CHAT_ID` | Telegram bot and alerts. |
| `AIRLABS_API_KEY` | Flight status. |
| `RESEND_API_KEY` | Password reset email + kirim ulang forwarding email alias. |
| `RESEND_WEBHOOK_SECRET` | Signing secret Svix webhook `email.received` (whsec_...). Kosong = fitur email alias nonaktif. |
| `BUNNY_STORAGE_API_KEY`, `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_HOSTNAME`, `BUNNY_CDN_HOSTNAME` | CDN mirroring and generated assets. |
| `VPS_PUBLIC_IP` | Custom domain DNS verification. |
| `PORTAL_BASE_URL` | Portal Jamaah generated link base. |

Legacy/AWAPI:

| Env | Used for |
| --- | --- |
| `AWAPI_SYNC_ENABLED` | Enable AWAPI-based umroh/haji sync. |
| `AWAPI_BASE` | Official Alhijaz API base. |
| `INTERNAL_API_BASE` | Legacy AIW internal base, default `http://115.124.86.220`. |
| `LEGACY_BROWSER_API_BASE` | Browser fallback base for legacy submit. |
| `UMRAH_RECAPTCHA_SITE_KEY` | reCAPTCHA site key used by legacy form. |
| `UMRAH_RECAPTCHA_FIELD_NAME` | Hidden field name for reCAPTCHA token. |
| `DISABLE_BACKGROUND_JOBS`, `DISABLE_JAMAAH_BACKGROUND_SYNC`, `DISABLE_LEGACY_BACKGROUND_SYNC` | Background job gates via `lib/background-jobs.js`. |
| `SYNC_COOLDOWN_MINUTES`, `HAJI_AWAPI_SYNC_COOLDOWN_MINUTES` | Background sync cadence. |
| `JAMAAH_UPSERT_BATCH` | Upsert batch size. Keep conservative. |

DB and cache tunables:

| Env | Used for |
| --- | --- |
| `DB_CIRCUIT_FAILS`, `DB_CIRCUIT_COOLDOWN_MS`, `DB_DEGRADED_RECHECK_MS` | DB circuit breaker. |
| `DB_HEALTH_PROBE_MS`, `DB_HEALTH_LATENCY_MS` | DB health probe. |
| `KURS_REFRESH_INTERVAL_MS`, `KURS_SHARE_CACHE_TTL_DAYS`, `KURS_SHARE_CACHE_MAX_MB` | Kurs refresh/cache. |
| `CALENDAR_PUBLIC_FALLBACK_ORIGIN_IP`, `CALENDAR_PUBLIC_FALLBACK_DETAIL_CONCURRENCY` | Optional calendar origin-IP failover and conservative detail concurrency. |
| `CALENDAR_PUBLIC_ORIGIN_COOLDOWN_MS`, `CALENDAR_PUBLIC_TRANSIENT_COOLDOWN_MS`, `CALENDAR_PRIMARY_REPROBE_MINUTES` | Primary/fallback circuit cooldowns and recovery probe cadence. |
| `CALENDAR_PUBLIC_MIN_EVENT_COUNT`, `CALENDAR_PUBLIC_REQUIRED_EVENT_TYPES`, `CALENDAR_PUBLIC_MAX_STALE_DELETE_RATIO` | Snapshot completeness and stale-delete safety thresholds. |

## Deployment & Runtime Notes

- Production service: `miqot.service`.
- Static SPA is served from `dist/`.
- `index.html` is served with `Cache-Control: no-cache` and weak ETag to avoid stale chunk references.
- Hashed JS/CSS assets are served immutable.
- `/api/version` helps frontend detect stale service-worker shells.
- After frontend changes in production, run build and restart service.
- Existing PWA clients may need one reload; `src/main.tsx` contains stale-build guard and SW cache cleanup.
- Edge: `alhijaz.co` lewat Cloudflare → Caddy `:443` → node `:3000`; sedangkan `sb.alhijaz.co` (Supabase self-hosted) dan custom domain agent (on-demand TLS) langsung ke Caddy tanpa Cloudflare.
- HTTP/3/QUIC sengaja **dimatikan** di Caddy (9 Agt 2026, global options `servers { protocols h1 h2 }` di `/etc/caddy/Caddyfile`): carrier seluler Indonesia men-throttle/blackhole UDP sehingga ~28% transfer foto agent & aset landing putus mid-stream (`H3_REQUEST_CANCELLED` / QUIC idle timeout di `journalctl -u caddy`) padahal upstream menjawab <10ms. Buffer UDP sysctl sudah pernah dinaikkan (Jun 2026) dan terbukti bukan solusinya — jangan re-enable h3 tanpa data baru.

## Audit & Risiko Operasional

### High Risk

- `server.js` is too large and mixes API, cron, sync, proxy, SSR injection, and static serving. Keep changes tightly scoped and add tests/source guards for fragile flows.
- `JWT_SECRET` has a fallback in code. Production must always set a strong env value.
- Supabase service-role key is central. Never import server-side Supabase code into frontend bundles.
- Legacy AIW POST is unstable by design. Do not remove Playwright/reCAPTCHA fallback unless Alhijaz provides a stable API for registration.
- Sync cleanup can delete real jamaah if upstream fetch is partial. Preserve `computeSafeDeletions` and complete-list checks.
- Background sync can exhaust Supabase Disk IO. Preserve cooldown, small upsert batches, DB circuit breaker, and skip-unchanged diff.

### Medium Risk

- Custom path routing is hand-written. New routes must update `src/main.tsx`, `DashboardLayout.tsx`, and Express fallback/SSR handling if public.
- Many routes return mixed shapes because some legacy failures are normalized to `success:false` with HTTP 200. Frontend must handle both `res.ok` and `success:false`.
- PWA/custom-domain interaction is subtle. Service worker must remain disabled on custom domains.
- Public landing and OG behavior depends on both `functions/[slug]/*` and `server.js` injection. Update both if metadata shape changes.
- Flight share metadata dan endpoint PNG berada di `server.js`, sedangkan rendering gambarnya di `lib/og-generator.mjs`. Pertahankan dimensi `1200x630`, URL versioned, dan hindari status live pada aset yang dicache crawler.
- Test suite is strong on pure logic, weak on browser end-to-end. Critical user flows need manual smoke or Playwright tests if expanded.

### Low Risk / Maintenance

- There are old migration scripts plus SQL migrations. Prefer committed SQL under `migrations/` for new schema changes.
- `jamaah-api.js` is legacy Playwright scraping and should not be expanded unless explicitly needed.
- Some dashboard component files are very large; extract only when it reduces real complexity and preserves local UI patterns.

## Do's and Don'ts

Do:

- Use `agent_id` UUID for owned data.
- Keep `slug` for URL-facing identity only.
- Keep AWAPI as first choice for jamaah sync when enabled.
- Preserve payment provenance and manual-lunas guards.
- Use structured parsers/helpers instead of ad hoc HTML/string parsing when a helper exists.
- Add focused tests for sync, payment, registration, cache, and routing guard changes.
- Build SPA after frontend changes that affect production.

Don't:

- Do not delete rows after partial upstream fetch.
- Do not increase background sync frequency casually.
- Do not expose service-role, AWAPI, CAPI, OpenAI, Telegram, or Google keys to frontend.
- Do not replace custom dropdowns with native `<select>` in dashboard UI.
- Do not serve stale SPA shell on custom domains.
- Do not assume legacy AIW session behavior is stable.
- Do not revert unrelated dirty files in the worktree.

## Verification Matrix

| Change area | Minimum checks |
| --- | --- |
| Backend syntax | `node --check server.js` |
| Legacy umrah integration | `node --check laporan-api.js`, `node --test tests/umrah-register-session-retry.test.js`, manual submit smoke |
| Sync/payment logic | Related `tests/*sync*`, `jamaah-payment*`, `booking-outstanding*`, `awapi*` tests |
| Frontend dashboard | `npm run build:spa`, browser smoke on target route |
| Teras/community | `node --test tests/community-*.test.js tests/teras-*.test.js` (browser test butuh Playwright Chromium), `npm run build:spa` |
| Landing pages | `npm run verify:landing`, check OG/public URL |
| Flight status/share | `node --test tests/flight-*.test.js`, `npm run build`, cek meta `/f/:code`, header/cache/dimensi `/og/flight/:code.png`, dan visual PNG |
| Design-only change | `npm run build:spa` if class/component code changed; docs-only can use `git diff --check` |
| Production deploy | build, restart `miqot.service`, check `systemctl is-active`, then relevant endpoint smoke |

## Current Audit Notes (2026-07-19)

- Teras terbuka untuk semua agent login; allowlist pilot sudah dicabut tetapi titik keputusan akses tetap satu di `lib/community-access.js`.
- `/teras/<kode-share>` menang atas `/teras/<slug>` profil; jangan ubah prioritas parsing di `src/lib/terasRoutes.ts` karena kode share sudah beredar.
- Migrasi Teras diterapkan manual (Supabase SQL Editor). Respons 503 "Migrasi ... Teras belum diterapkan" berarti kolom DB tertinggal dari kode, bukan bug.
- Batas media Teras (10 item, gambar 3MB, video 20MB) harus diubah serentak di klien, `server.js`, dan constraint DB.
- Notifikasi bell tidak menandai terbaca saat fetch gagal; `seen` memakai watermark eksplisit.

Catatan audit 2026-07-12 yang masih berlaku:

- Pendaftaran umrah memakai browser/reCAPTCHA sebagai jalur utama ketika password legacy tersedia; direct multipart adalah jalur terbatas tanpa saved password.
- Add-jamaah must use `id_umroh.id_jadwal`; sending only `id_umroh` can target stale/zero-seat booking state.
- Frontend submit now parses non-JSON/HTML proxy responses and shows a user-readable error instead of raw `<!DOCTYPE html>`.
- Calendar sync validates snapshot completeness, preserves data during degraded fallback, and re-probes the primary source before authoritative cleanup.
- Dashboard dan `/f/:code` kini memakai shared status presentation serta `FlightRouteLine`; perubahan status atau animasi harus dilakukan pada modul shared.
- Header flight share tidak lagi menampilkan badge status duplikat. Status tunggal berada di hero, sementara OG image dinamis menampilkan fakta itinerary yang aman dicache.
- Filter publik selain `SEMUA DATA` hanya memproses paket yang masih memiliki kursi; opsi filter sekunder berasal dari subset tersedia yang sama.
- Filter jadwal "Umroh Cuti 5 Hari", "Umroh Promo", "Umroh Reguler", "Umroh Musim Dingin", dan "Umroh Bintang 5" dicabut dari dropdown dan digantikan mode `TIPE PAKET` (roster bersama dengan Brosur, `src/lib/packageType.js`). Spec/plan bertanggal 2026-04-18 soal filter cuti 5 hari karena itu arsip, bukan keadaan sekarang. Slug lama `/umroh-promo`, `/umroh-reguler`, `/umroh-musim-dingin`, `/bintang-5` TETAP dikenali sebagai alias ke tipe terdekat (`LEGACY_FILTER_SLUGS`) — jangan dihapus: `src/main.tsx` memakai `getFilterModeFromSlug` sebagai gerbang negatif, jadi slug tak dikenal dirender sebagai halaman detail paket "Paket tidak ditemukan" (HTTP 200). `/cuti-5-hari` tidak punya padanan di roster sehingga modenya dipertahankan sebagai mode URL-saja, seperti `liburan-sekolah`.
- Unduhan itinerary di Analytics terbelah dua karena satu tombol "Unduh PDF" di `ItineraryModal` melayani dua berkas: `itinerary_own_pdf_download` (PDF Rencana Perjalanan rakitan klien) vs `itinerary_office_pdf_download` (dokumen asli kantor, bisa PDF atau gambar — lihat metadata `format`). Keduanya ditembakkan di titik yang sama dalam handler masing-masing supaya angkanya sebanding. `download_itinerary` bukan event unduhan: itu menyala saat kartu paket membuka modal (nama dipertahankan demi data historis, label = "Buka Itinerary"). Tombol "Itinerary PDF" di `JourneyStrip` melengkapi keluarga ini dari sisi jamaah: `itinerary_pdf_download_share` (halaman share publik) dan `itinerary_pdf_download_portal` (portal jamaah), bertipe `public` — pelakunya jamaah, jadi sengaja TIDAK ikut menggelembungkan metrik aksi agen. `JourneyStrip` sendiri tak tahu nama event: ia memanggil prop `onPdfDownload` (diteruskan `WebItineraryView`) karena komponennya dipakai tiga permukaan dengan sesi berbeda; di `ItineraryModal` tombolnya memang disembunyikan (`hideDocActions`). Callback ditembakkan saat KLIK, bukan sesudah berkas siap — jalur desktop memakai `location.assign` yang meninggalkan halaman.
- Event bertipe `public` dulu tidak punya breakdown hitungan di mana pun (hanya lewat di umpan aktivitas terbaru), jadi ditambahkan `publicTracking` di `GET /api/analytics/summary` + panel "Aktivitas Jamaah" di tab Fitur. `page_view` dibuang dari tally karena volumenya menenggelamkan sisanya. Ini sekaligus memunculkan event portal/share lama (`open_portal_*`, `open_itinerary_share`, `ask_ai_*`) yang selama ini tercatat tapi tak terhitung. Drill-down per-agen belum punya panel ini.
- Rahmah July Zam-zam selection persists in `booking_persiapan` through the public tour-leader prep API.
- `src/main.tsx` already has stale-build and stuck-SW escape hatches; preserve them.
- `docs/project-summary.md` and `docs/DESIGN-SYSTEM.md` were refreshed from current source structure and route audit.
