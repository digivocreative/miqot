# Alhijaz Indowisata — Project Summary

## 1. Identitas & Tujuan Project

- **Nama**: `alhijaz-umroh-schedule` (internal), **alhijaz.co** (domain publik)
- **Deskripsi**: Web app jadwal paket umroh Alhijaz Indowisata — menampilkan daftar paket umroh, harga, hotel, itinerary, brosur, dan profile agent. Berfungsi juga sebagai platform tools internal bagi para agent (kalkulasi harga, compare paket, quotation PDF, statistik jamaah, dll).
- **Masalah yang diselesaikan**: Agent-agent Alhijaz membutuhkan cara mudah untuk menampilkan jadwal umroh ke calon jamaah melalui link personal (alhijaz.co/nama-agent), tanpa harus mengirim gambar/brosur manual.
- **Target pengguna**:
  - **Calon jamaah umroh** — lihat jadwal, harga, brosur, itinerary, dan langsung chat agent via WhatsApp
  - **Agent Alhijaz** — dashboard internal untuk kalkulasi harga, compare paket, generate quotation PDF, statistik & estimasi komisi, dan tracking Meta CAPI

## 2. Tech Stack

| Layer | Teknologi |
|-------|-----------|
| **Frontend** | React 18 + TypeScript, Vite 4, TailwindCSS 3 |
| **Backend** | Express 5 (Node.js), ES Modules |
| **Database** | Supabase (PostgreSQL) — 3 tabel: `agents`, `capi_configs`, `jamaah` |
| **Auth** | JWT custom (bcrypt + jsonwebtoken), bukan Supabase Auth |
| **PDF** | `@react-pdf/renderer` (generate quotation), `react-pdf` + pdfjs (view itinerary) |
| **Charts** | Recharts (AreaChart, BarChart — untuk Statistik page) |
| **Scraping** | Native `fetch` + Cheerio (modul Jamaah/Laporan — lightweight, no Playwright) |
| **Screenshot** | `modern-screenshot` (capture PackageCard untuk dibagikan) |
| **Animation** | Framer Motion |
| **Icons** | Lucide React |
| **PWA** | vite-plugin-pwa (offline support, install banner) |
| **Notifications** | Telegram Bot API + node-cron (seat alerts, weekly summary, AI insights) |
| **Hosting** | VPS (Ubuntu), systemd service `miqot.service` |
| **Deploy** | GitHub webhook → `deploy-webhook.js` → `deploy.sh` (pull + build + restart) |
| **Container** | Docker + docker-compose (alternatif) |

## 3. Arsitektur & Struktur Folder

### Tipe: **Monolith fullstack** — Express serves both API and SPA

```
Client (Browser)
    │
    ├── SPA (React) ────── Vite dev server (port 5173)
    │     └── fetch /api/* ──┐
    │                        ▼
    └──── Express server (port 3000)
              ├── /api/auth/*        ← JWT login/session
              ├── /api/admin/*       ← Agent CRUD, photo upload
              ├── /api/laporan/*     ← Jamaah management (login, sync, list, stats)
              ├── /api/capi/*        ← Meta Conversion API config
              ├── /api/ai-copy       ← OpenAI proxy (caption generator)
              ├── /api/api-get/*     ← Proxy to jadwal.alhijaz.co (package data)
              ├── /itinerary/*       ← Proxy PDF/images from jadwal.alhijaz.co
              ├── /brosur/*          ← Proxy brochure images
              ├── /:slug/umroh       ← SSR landing page (OG tags for social sharing)
              └── /*                 ← SPA fallback (dist/index.html with OG injection)
                                          └── Supabase (PostgreSQL)
```

### Struktur Folder

```
alhijaz/
├── server.js              # Express backend (~1599 lines) — API, proxy, auth, sync, stats, SPA serve
├── laporan-api.js          # Lightweight HTTP session-based fetch + HTML parse (Cheerio)
├── jamaah-api.js           # Legacy: Playwright-based jamaah scraping (deprecated, replaced by laporan-api.js)
├── telegram-notifier.js    # Telegram alerts (seat, price, weekly summary, AI insights)
├── deploy-webhook.js       # GitHub webhook listener (port 9000) → auto deploy
├── deploy.sh               # Deploy script: pull, install, build, restart systemd
├── Dockerfile              # Docker multi-stage build
├── docker-compose.yml      # Docker compose config
├── vite.config.ts          # Vite config (600+ lines) — dev plugins, PWA, proxy, build
├── package.json            # Dependencies & scripts
│
├── src/                    # Frontend (React + TypeScript)
│   ├── main.tsx            # Entry point — routing, PWA registration, page resolution
│   ├── App.tsx             # Main SPA component — package list, filters, layout
│   ├── index.css           # Global CSS (TailwindCSS + custom animations)
│   ├── components/         # 19 React components
│   │   ├── PackageCard.tsx     # Card paket umroh (komponen terbesar, ~103KB, 2241 lines)
│   │   ├── CapiPage.tsx        # Meta Conversion API config UI (~1774 lines)
│   │   ├── KalkulasiPage.tsx   # Hitung harga + generate quotation PDF (~1493 lines)
│   │   ├── ComparePage.tsx     # Bandingkan 2 paket side-by-side (~1084 lines)
│   │   ├── JamaahPage.tsx      # View jamaah data, sync & filter (~1018 lines)
│   │   ├── StatistikPage.tsx   # Dashboard statistik: ringkasan jamaah, komisi, chart tren (~678 lines)
│   │   ├── DashboardProfile.tsx # Edit profile + photo crop modal
│   │   ├── FilterHeader.tsx    # Header filter (search, sort, filter mode)
│   │   ├── DashboardLayout.tsx # Dashboard home + navigation + tab routing
│   │   ├── QuotationDocument.tsx # react-pdf quotation template
│   │   ├── LoginPage.tsx       # Login + JWT session management
│   │   ├── ItineraryModal.tsx  # Fullscreen PDF/image itinerary viewer
│   │   ├── FilterModal.tsx     # Fullscreen filter modal (mobile)
│   │   ├── FloatingControls.tsx # Floating dark mode / scroll-to-top
│   │   ├── BrochureModal.tsx   # Fullscreen brochure viewer
│   │   ├── CompactCard.tsx     # Compact card variant
│   │   ├── FloatingAgentBar.tsx # Floating WhatsApp CTA bar
│   │   ├── AgentProfile.tsx    # Agent info card on package
│   │   └── index.ts            # Barrel re-exports
│   ├── data/
│   │   ├── agents.ts           # Agent data + Supabase fetch + fallback
│   │   ├── hotelService.ts     # Hotel proximity data (jarak ke Masjid)
│   │   └── temperatureData.ts  # Cuaca Mekah/Madinah per bulan
│   ├── services/
│   │   └── data-service.ts     # API client + cache (stale-while-revalidate)
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client init (frontend/anon key)
│   │   └── capi.ts             # Meta CAPI event sender
│   ├── utils/
│   │   ├── filter-logic.ts     # Filter/sort logic for packages
│   │   └── index.ts            # Re-exports
│   └── types/
│       ├── umroh-package.ts    # TypeScript interfaces for package data
│       └── index.ts            # Re-exports
│
├── functions/              # SSR functions
│   ├── [slug]/umroh.ts     # SSR landing page template (Cloudflare-compatible)
│   └── umroh-landing.mjs   # Compiled version (auto-generated, gitignored)
│
├── scripts/                # Utility scripts
│   ├── generate-og.mjs         # Generate OG images per agent
│   ├── hash-passwords.js       # Hash agent passwords with bcrypt
│   ├── migrate-agents-to-supabase.js # Migrate agent data to Supabase
│   ├── migrate-admin-columns.js     # Add email/role columns to agents table
│   ├── migrate-jamaah-table.js      # Create jamaah table in Supabase
│   ├── migrate-jamaah-columns.js    # Add perlengkapan/dokumen columns
│   ├── add-perlengkapan-cols.js     # Add perlengkapan columns to jamaah table
│   ├── migrate-paspor-columns.js    # Add no_paspor/paspor_expired columns
│   ├── fix-hijriah-year.js          # Fix hijriah year based on departure dates
│   ├── debug-cols.js                # Debug legacy HTML table column structure
│   ├── telegram-notify.mjs          # Manual telegram notification script
│   └── sync-umroh-dates.mjs        # Sync departure dates for OG images
│
├── public/                 # Static assets
│   ├── agents/             # Agent profile photos (slug.jpg)
│   ├── og/                 # OG images per agent (slug.png)
│   ├── fonts/              # Custom fonts
│   ├── logo-bank/          # Bank logos for quotation (bca.png, bsi.png, mandiri.png)
│   └── *.png, *.svg, *.webp # Logos, icons
│
└── data/
    ├── notifier-state.json  # Telegram notifier state (persisted snapshot)
    └── capi/               # Local CAPI config files (dev only, deprecated)
```

## 4. Konvensi & Aturan

- **Bahasa kode**: Campuran — variabel/fungsi dalam English, komentar & UI text dalam Bahasa Indonesia
- **Framework**: React functional components + hooks, no class components
- **Styling**: TailwindCSS (utility-first), dark mode via `dark:` prefix, responsive mobile-first
- **State management**: `useState` + `useEffect` + `useCallback`, no external state library
- **File naming**: camelCase untuk utils/services, PascalCase untuk components
- **Branching**: Trunk-based (push to `main` → auto deploy via webhook)
- **No tests**: Project ini tidak memiliki test suite
- **Design palette**: "Premium Teal & Earthy" — primary emerald/teal, dark slate backgrounds
- **Routing**: Custom path-based routing di `main.tsx` (bukan React Router)

## 5. Fitur Utama

### Fitur Public (Calon Jamaah)
- Daftar paket umroh dengan filter (maskapai, hotel, harga, tanggal, waktu penerbangan)
- View card detail paket (harga per room type, info hotel, seat tersisa)
- Compact view mode (toggle antara card lengkap dan card ringkas)
- Download/share brosur (image) dan itinerary (PDF/image)
- Agent profile card + WhatsApp CTA
- Landing page per agent (`/:slug/umroh`) dengan OG tags untuk social sharing
- Single package view (`/:agent/:jadwalId`) — deep link ke 1 paket tertentu
- Dark mode, PWA install, offline support
- AI-powered caption generator (OpenAI) untuk promosi WhatsApp

### Fitur Dashboard (Agent/Admin)
- Login dengan JWT (7 days expiry)
- Edit profil (nama, website, phone, email, slug, foto crop & upload)
- **Statistik** — dashboard ringkasan data jamaah per tahun Hijriah:
  - Headline stats: Total Jamaah, Komisi Cair, Berangkat Segera, Jamaah Baru
  - Estimasi Komisi dengan 3-segment bar (Sudah Cair / Belum Cair / Potensi)
  - Chart: Komisi Cair per Bulan (BarChart) + Tren Jamaah Baru (AreaChart) — menggunakan Recharts
  - List: Berangkat Mendatang + Jamaah Belum Lunas (dengan modal detail)
  - Progress bar Status Pembayaran (lunas vs belum lunas)
  - Month-over-month comparison badges
  - Sync ulang data langsung dari halaman Statistik
- Kalkulasi harga (hitung harga per tipe kamar + generate PDF quotation)
- Compare 2 paket side-by-side
- Meta CAPI config (Pixel ID, Access Token, event toggle)
- Admin: manage all agents (CRUD)
- Jamaah management (sync dari sistem internal legacy, filter, sort, pagination)
  - Progressive sync: first 10 jamaah shown immediately, rest synced in background
  - Multi-kantor sync: fetches from multiple kantor values to capture all jamaah
  - Filter by hijriah year, payment status, departure window
  - Sort by nama, sisa pembayaran, berangkat terdekat, pendaftaran terbaru
  - Perlengkapan & dokumen tracking (batik, bergo, paspor, dll)

### Fitur Infrastruktur
- AI Copywriting (OpenAI proxy — generate caption WhatsApp)
- Telegram Notifier (node-cron based, runs inside Express process):
  - Real-time alerts tiap 30 menit: seat kritis, sold out, paket baru, harga berubah
  - Daily briefing (pagi): ringkasan + AI insight
  - Departure reminders (H-7, H-3, H-1)
  - Hot deal alerts (berangkat <14 hari, seat masih banyak)
  - Weekly summary (Senin 08:00)
  - AI-powered talking points via OpenAI
- Background sync jamaah (semua agent, setiap 1 jam)
- GitHub webhook auto-deploy (webhook → pull → build → restart)
- Supabase keep-alive (ping setiap 3 hari, cegah free-tier pause)
- OG image generation per agent
- Stale-while-revalidate data caching (localStorage, 3 jam TTL)
- Auto-refresh paket data dari API setiap 1 jam (silent background)

## 6. Data Model / Schema

### Tabel `agents`
```
slug              TEXT PRIMARY KEY    -- "nikita", "andra", dll (lowercase)
name              TEXT NOT NULL       -- "Nikita"
website           TEXT                -- "alhijazindonesia.com"
phone             TEXT                -- "62822900020"
photo             TEXT                -- "/agents/nikita.jpg?v=1234"
email             TEXT                -- "agent@email.com"
password          TEXT                -- bcrypt hash
role              TEXT DEFAULT 'agent' -- "agent" | "admin"
jamaah_username   TEXT                -- username sistem internal legacy
jamaah_password   TEXT                -- AES-256-GCM encrypted
jamaah_kantor     TEXT DEFAULT '2'    -- kode kantor ("2" = Cabang)
```

### Tabel `capi_configs`
```
slug              TEXT PRIMARY KEY    -- FK to agents.slug
pixel_id          TEXT               -- Meta Pixel ID
access_token      TEXT               -- AES-256-GCM encrypted
test_event_code   TEXT               -- Meta test event code
test_mode         BOOLEAN            -- true/false
events            JSONB              -- { contact: { enabled, eventName, ... }, ... }
updated_at        TIMESTAMPTZ
```

### Tabel `jamaah`
```
agent_slug    TEXT               -- FK to agents.slug (composite PK part)
id_umroh      TEXT               -- e.g. "AIW0025094" (composite PK part)
nama          TEXT               -- nama jamaah (composite PK part)
jk            TEXT               -- "L" / "P"
wa            TEXT               -- nomor WhatsApp
tgl_lahir     DATE               -- tanggal lahir
paket         TEXT               -- nama paket (e.g. "HEMAT Triple")
bayar         INTEGER            -- jumlah yang sudah dibayar
sisa          INTEGER            -- sisa pembayaran
tgl_berangkat DATE               -- tanggal keberangkatan
tgl_daftar    DATE               -- tanggal pendaftaran (dari col38 PENDAFTARAN)
hijriah_year  TEXT               -- tahun hijriah (e.g. "1447")
perlengkapan  JSONB              -- { batik: true, bergo: false, ... }
dokumen       JSONB              -- { paspor: true, vaksin: false, ... }
no_paspor     TEXT               -- nomor paspor
paspor_expired TEXT              -- tanggal expired paspor
raw_data      JSONB              -- metadata parsing (jm_id, cols_count)
synced_at     TIMESTAMPTZ        -- kapan terakhir di-sync
-- UNIQUE(agent_slug, id_umroh, nama)
```

### Data Paket Umroh (External API)
Data paket **tidak disimpan di database** — di-fetch dari `https://jadwal.alhijaz.co/jadwal/api-get/{yearCode}` dan di-cache di browser (localStorage). Lihat `UmrohPackage` type di `src/types/umroh-package.ts`.

## 7. API & Endpoints

**Base URL**: `http://localhost:3000` (production langsung ke server)

### Auth
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| POST | `/api/auth/login` | — | Login, return JWT + user data |
| GET | `/api/auth/me` | Bearer | Get current user data |

### Admin
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| PUT | `/api/admin/profile` | Bearer | Update own profile |
| POST | `/api/admin/photo` | Bearer | Upload profile photo (base64 JPEG, max 5MB) |
| GET | `/api/admin/agents` | Bearer+Admin | List all agents |
| POST | `/api/admin/agents` | Bearer+Admin | Create agent |
| PUT | `/api/admin/agents/:slug` | Bearer+Admin | Update agent |
| DELETE | `/api/admin/agents/:slug` | Bearer+Admin | Delete agent |

### CAPI (Meta Conversion API)
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| POST | `/api/capi/:slug/login` | — | Verify agent password |
| GET | `/api/capi/:slug/config` | — | Get CAPI config (decrypted token) |
| POST | `/api/capi/:slug/config` | — | Save CAPI config |
| DELETE | `/api/capi/:slug/config` | — | Reset config |
| POST | `/api/capi/:slug/event` | — | Send event ke Meta (rate limited) |
| POST | `/api/capi/:slug/validate` | — | Validate pixel + token |

### Laporan / Jamaah
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/laporan/status` | Bearer | Check credentials + session + last sync |
| POST | `/api/laporan/login` | Bearer | Login ke sistem internal (native fetch, auto-save credentials) |
| POST | `/api/laporan/sync` | Bearer | Fetch → parse → progressive upsert to Supabase |
| GET | `/api/laporan/sync-status` | Bearer | Check if background sync is in progress |
| GET | `/api/laporan/jamaah` | Bearer | List jamaah (filter, search, sort, pagination) |
| GET | `/api/laporan/stats` | Bearer | Statistik jamaah: total, lunas, komisi, tren, berangkat, outstanding |
| POST | `/api/laporan/disconnect` | Bearer | Clear in-memory session |
| DELETE | `/api/laporan/credentials` | Bearer | Delete saved credentials from Supabase |

### Jamaah (Legacy — deprecated)
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| POST | `/api/jamaah/connect` | Bearer | Login via Playwright (deprecated) |
| POST | `/api/jamaah/fetch` | Bearer | Fetch data using stored cookies (deprecated) |
| POST | `/api/jamaah/disconnect` | Bearer | Clear session (deprecated) |
| GET | `/api/jamaah/session/:id` | Bearer | Get session info (deprecated) |

### Proxy
| Method | Path | Deskripsi |
|--------|------|-----------|
| ALL | `/api/*` | Proxy ke `jadwal.alhijaz.co/jadwal/*` (data paket) |
| GET | `/itinerary/*` | Proxy PDF/image itinerary (timeout 15s, retry 1x) |
| GET | `/brosur/*` | Proxy brochure image (timeout 15s, retry 1x) |

### SSR
| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/:slug/umroh` | SSR landing page dengan OG meta tags |

### Auth Format
- **JWT**: `Authorization: Bearer <token>`, 7 days expiry
- **Payload**: `{ slug, name, role }`

### Response Format
```json
// Success
{ "success": true, "data": ... }

// Error
{ "error": "Pesan error" }
```

## 8. Environment & Konfigurasi

### Setup Lokal
```bash
git clone https://github.com/digivocreative/miqot.git alhijaz
cd alhijaz
npm install
cp .env.example .env   # Isi dengan value yang sesuai
npm run dev             # Vite dev server (port 5173)
npm run start           # Express server (port 3000) — di terminal terpisah
```

### Environment Variables
| Variable | Deskripsi |
|----------|-----------|
| `OPENAI_API_KEY` | OpenAI API key untuk fitur AI Copywriting + Telegram AI insights |
| `CAPI_ENCRYPTION_KEY` | 32-byte base64 key untuk encrypt Meta access token + jamaah password |
| `JWT_SECRET` | Secret key untuk JWT signing |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key (frontend) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (backend only) |
| `VITE_SUPABASE_URL` | Same as SUPABASE_URL (exposed to frontend via Vite) |
| `VITE_SUPABASE_ANON_KEY` | Same as SUPABASE_ANON_KEY (exposed to frontend) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token untuk notifier |
| `TELEGRAM_CHAT_ID` | Chat ID production untuk notifikasi |
| `TELEGRAM_CHAT_ID_DEV` | Chat ID dev untuk testing notifikasi |
| `NOTIFIER_YEAR_CODES` | Kode tahun paket yang di-monitor (default: "1448") |
| `NOTIFIER_BASE_URL` | Base URL API untuk notifier (default: localhost:3000) |

### Deployment (Production)
- Server: VPS Ubuntu, systemd service `miqot.service`
- Auto-deploy: Push ke `main` → GitHub webhook → `deploy-webhook.js` (port 9000) → `deploy.sh`
- Deploy script: `git pull` → `npm install` → `npm run build` → `systemctl restart miqot.service`
- Telegram notifikasi deploy (via bot API)

## 9. Status & Roadmap

- **Fase**: Production (live di alhijaz.co)
- **Versi**: 0.2.2

### Yang Sudah Selesai
- Core SPA (paket list, filters, dark mode, PWA, compact view)
- Agent dashboard (login, profile, kalkulasi, compare, CAPI)
- Statistik dashboard (headline stats, estimasi komisi 3-kategori, chart tren, berangkat mendatang, outstanding list)
- Auto-deploy pipeline (GitHub webhook)
- Supabase migration (dari hardcoded data)
- OG image generation
- Jamaah management (fetch + parse + sync ke Supabase, progressive UI, perlengkapan/dokumen/paspor tracking)
- AI Copywriting (OpenAI integration)
- Telegram Notifier (real-time seat/price alerts, daily briefing, AI insights)
- Background sync jamaah (hourly, all agents, multi-kantor)
- Single package view (deep link ke 1 paket)
- Quotation PDF dengan logo bank (BCA, BSI, Mandiri)

### Rencana / Backlog
- [TODO] Testing suite
- [TODO] Monitoring & error tracking (Sentry atau sejenis)
- [TODO] Image optimization pipeline (sharp/CDN)

## 10. Catatan & Keputusan Teknis

### Keputusan Penting
| Keputusan | Alasan |
|-----------|--------|
| **Custom routing** (bukan React Router) | Butuh SPA yang bisa diterjemahkan jadi landing page per agent via URL slug, cukup sederhana tanpa nested routes |
| **JWT custom** (bukan Supabase Auth) | Auth hanya untuk agent/admin, sangat sederhana (slug + password), tidak perlu Supabase Auth overhead |
| **Proxy semua external request** | Bypass CORS dari jadwal.alhijaz.co, kontrol caching, dan menjaga secret keys di server |
| **Data paket tidak di-database** | Data paket di-own oleh sistem legacy (jadwal.alhijaz.co), cukup di-fetch & cache di client |
| **Native fetch + Cheerio untuk Jamaah** | Awalnya pakai Playwright (300MB+), diganti native fetch + Cheerio (lightweight) — cukup POST login + GET HTML + parse table |
| **jamaah-api.js deprecated** | File ini masih ada di repo (menggunakan Playwright) tapi tidak lagi digunakan; semua jamaah flow sudah menggunakan `laporan-api.js` |
| **Recharts untuk Statistik** | Lightweight charting library, sudah termasuk ResponsiveContainer, mendukung AreaChart dan BarChart yang diperlukan |
| **Supabase free tier + keep-alive** | Budget terbatas, keep-alive ping dari server cegah auto-pause |
| **Telegram untuk notifikasi** | Agent lebih aktif di Telegram/WhatsApp daripada cek dashboard, notif otomatis lebih efektif |
| **node-cron in-process** | Tidak perlu external cron/scheduler — cron jobs jalan di dalam Express process yang sama |
| **Multi-kantor sync** | Jamaah bisa terdaftar di kantor cabang atau pusat, fetch dari multiple kantor values dan deduplikasi by `id_umroh|nama` |

### Known Issues / Technical Debt
- **PackageCard.tsx terlalu besar** (~103KB, 2241 baris) — perlu di-split ke sub-components
- **CapiPage.tsx terlalu besar** (~1774 baris) — bisa di-modularisasi
- **Tidak ada test suite** — risiko regresi saat refactor
- **No error boundary** — React errors bisa crash seluruh app
- **Agent photos di-serve lokal** — idealnya pakai CDN/object storage
- **CAPI endpoints tidak pakai auth** — hanya dilindungi oleh agent slug (not secret)
- **server.js monolith** (~1599 baris) — perlu di-split ke route modules
- **telegram-notifier.js besar** (~1340 baris) — bisa di-modularisasi
- **jamaah-api.js masih ada** — file Playwright-based yang deprecated, bisa dihapus

### Do's and Don'ts
- ✅ **DO**: Selalu tambahkan `onError` fallback untuk semua `<img>` tag agent photo
- ✅ **DO**: Gunakan proxy path (`/itinerary/...`, `/brosur/...`) bukan URL langsung ke jadwal.alhijaz.co
- ✅ **DO**: Invalidate `agentCache = null` setelah mutasi data agent di server
- ✅ **DO**: Gunakan `buildRows()` helper saat upsert jamaah data ke Supabase
- ❌ **DON'T**: Jangan expose `SUPABASE_SERVICE_ROLE_KEY` ke frontend — hanya gunakan di server.js
- ❌ **DON'T**: Jangan hardcode agent data — selalu ambil dari Supabase (fallback di `agents.ts`)
- ❌ **DON'T**: Jangan tambahkan `crossOrigin` pada img tag brosur/itinerary — bisa break loading
- ❌ **DON'T**: Jangan import dari `jamaah-api.js` untuk fitur baru — gunakan `laporan-api.js`
