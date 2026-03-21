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
| **Database** | Supabase (PostgreSQL) — 6 tabel: `agents`, `capi_configs`, `jamaah`, `calendar_events`, `calendar_insights`, `ai_credits` |
| **Telegram** | Telegram Bot API — group alerts (node-cron) + per-agent DM (deep link connect, departure reminders, pembayaran masuk) |
| **Auth** | JWT custom (bcrypt + jsonwebtoken), bukan Supabase Auth |
| **PDF** | `@react-pdf/renderer` (generate quotation), `react-pdf` + pdfjs (view itinerary) |
| **Charts** | Recharts (AreaChart, BarChart — untuk Statistik page) |
| **Scraping** | Native `fetch` + Cheerio (jamaah/laporan + calendar — lightweight, no Playwright) |
| **Screenshot** | `modern-screenshot` (capture PackageCard untuk dibagikan) |
| **Animation** | Framer Motion |
| **Icons** | Lucide React |
| **PWA** | vite-plugin-pwa (offline support, install banner) |
| **Notifications** | Telegram Bot API + node-cron (seat alerts, weekly summary, AI insights) |
| **Email** | Resend (transactional emails: password reset) |
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
              ├── /api/ai-tools/*    ← AI Tools (voice over script & TTS)
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
├── server.js              # Express backend (~2400 lines) — API, proxy, auth, sync, stats, AI insight, AI tools, SPA serve
├── laporan-api.js          # Lightweight HTTP session-based fetch + HTML parse (Cheerio)
├── calendar-api.js         # Calendar scraper — fetch FullCalendar events from internal system, detail via _jmodal.php
├── jamaah-api.js           # Legacy: Playwright-based jamaah scraping (deprecated, replaced by laporan-api.js)
├── telegram-notifier.js    # Telegram alerts (seat, price, weekly, AI insights, per-agent departure reminders, pembayaran masuk)
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
│   ├── components/         # 20 React components
│   │   ├── PackageCard.tsx     # Card paket umroh (komponen terbesar, ~103KB, 2241 lines)
│   │   ├── CapiPage.tsx        # Meta Conversion API config UI (~1774 lines)
│   │   ├── KalkulasiPage.tsx   # Hitung harga + generate quotation PDF (~1493 lines)
│   │   ├── ComparePage.tsx     # Bandingkan 2 paket side-by-side (~1084 lines)
│   │   ├── JamaahPage.tsx      # View jamaah umroh data, sync & filter (~1018 lines)
│   │   ├── HajiPage.tsx        # View jamaah haji data (embedded as tab in Jamaah), login to legacy, sync, document viewer popup
│   │   ├── StatistikPage.tsx   # Dashboard statistik: ringkasan jamaah, komisi, chart tren (~678 lines)
│   │   ├── UpcomingSchedule.tsx # Calendar widget — mini grid with colored dots + bottom sheet detail
│   │   ├── CalendarInsight.tsx   # AI Insight alert bar + bottom sheet popup (OpenAI-generated)
│   │   ├── DashboardProfile.tsx # Edit profile + photo crop + Telegram section (notification prefs, disconnect dialog)
│   │   ├── SettingsPage.tsx    # Unified settings: iOS segmented control (3 tabs: Profil, Telegram, CAPI)
│   │   ├── ResetPasswordPage.tsx # Reset password page (from email link)
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
│   │   ├── AgentProfile.tsx    # Agent info card on package page
│   │   ├── AIToolsPage.tsx     # AI Tools hub page (tool cards grid)
│   │   ├── VoiceOverPage.tsx   # Voice Over Generator (3-step: script → voice → audio player)
│   │   ├── PhotoCropModal.tsx  # Reusable photo crop modal (react-easy-crop)
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
│   │   ├── authUtils.ts        # Shared auth utility (isSessionValid)
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
│   ├── migrate-calendar-table.js    # Create calendar_events table in Supabase
│   ├── migrate-jamaah-columns.js    # Add perlengkapan/dokumen columns
│   ├── add-perlengkapan-cols.js     # Add perlengkapan columns to jamaah table
│   ├── migrate-paspor-columns.js    # Add no_paspor/paspor_expired columns
│   ├── migrate-telegram-link.js     # Add telegram_chat_id + telegram_link_token columns
│   ├── setup-telegram-webhook.js    # Register Telegram bot webhook URL
│   ├── fix-hijriah-year.js          # Fix hijriah year based on departure dates
│   ├── seed-bagas.js                # Create agent "bagas" with dummy jamaah data
│   ├── debug-cols.js                # Debug legacy HTML table column structure
│   ├── telegram-notify.mjs          # Manual telegram notification script
│   └── sync-umroh-dates.mjs        # Sync departure dates for OG images
│
├── public/                 # Static assets
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
- Login dengan JWT (365 days expiry)
- **Auto-redirect**: Agent yang sudah login otomatis redirect dari `/` atau `/login` ke `/dashboard` (synchronous, sebelum React render)
- **Subtle login/dashboard button** di public header: `LogIn` icon jika belum login, `LayoutDashboard` icon jika sudah login
- Lupa password → reset via email (Resend API)
- Edit profil (nama, website, phone, email, slug, foto crop & upload ke Supabase Storage)
- **Settings Page** — unified settings dengan iOS segmented control (3 tab dengan Lucide icons):
  - **Profil** (`User` icon): edit profil agent
  - **Telegram** (`Send` icon): hubungkan Telegram via deep link, **notification preferences** (10 kategori toggle per group: Jamaah, Paket, Lainnya), disconnect dialog
  - **CAPI** (`Code` icon): Meta Pixel & Conversions API configuration
  - Tab bar: segmented control (`bg-gray-100 dark:bg-slate-800 rounded-xl p-1`), active = white bg + emerald text + shadow, inactive = transparent + gray
- **Menu Jadwal** — menu pertama di dashboard, membuka halaman publik agent (`/{slug}`) di tab baru dengan `ExternalLink` indicator
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
- Meta CAPI config (Pixel ID, Access Token, event toggle) — auto-bypass login dari dashboard
- Admin: manage all agents (CRUD)
- Jamaah management — 2 tab: **Umroh** (`/dashboard/jamaah/umroh`) dan **Haji** (`/dashboard/jamaah/haji`)
  - Tab Umroh: sync dari sistem internal legacy, filter, sort, pagination
    - Progressive sync: first 10 jamaah shown immediately, rest synced in background
    - Fetch range diperlebar 6 bulan sebelum awal tahun Hijriah untuk capture jamaah yang didaftarkan lebih awal
    - Filter by hijriah year, payment status, departure window
    - Sort by nama, sisa pembayaran, berangkat terdekat, pendaftaran terbaru
    - Perlengkapan & dokumen tracking (batik, bergo, paspor, dll)
  - Tab Haji (`HajiPage.tsx`): login ke legacy system, sync, list jamaah haji
    - Card collapsed: avatar (gender ring, lunas checkmark), nama, `{id_haji} • {paket}`, tahun masehi keberangkatan (orange bold)
    - Card expanded: detail grid (Thn Hijriyah, Jenis, Perwakilan, Marketing, Staff, Status Bayar), telp, alamat
    - Action buttons (30/50/20): BPIH (blue), Pernyataan (violet), WhatsApp icon (emerald filled)
    - BPIH & Pernyataan → full-screen document viewer popup (iframe, framer-motion slide-up animation, native share)
    - URL routing: slug-based tab switching di Jamaah page
- **Kalender** — mini calendar widget di Dashboard home:
  - Calendar grid bulanan dengan colored dots (Manasik, Keberangkatan, Kepulangan)
  - Navigasi bulan (prev/next) dengan caching data per bulan
  - Bottom sheet popup saat klik tanggal — detail group cards (pesawat, jam, paket, PAX, TL)
  - Data di-scrape dari internal system (FullCalendar events + _jmodal.php detail)
- **AI Insight** — alert bar + bottom sheet popup (OpenAI-generated):
  - 3 insight cards: Hari Ini, 7 Hari ke Depan, Cuaca Tanah Suci
  - Data cuaca Mekah/Madinah (suhu rata-rata per bulan dari temperatureData.ts)
  - Bahasa kasual & hangat (target: agen perempuan 40-50 tahun)
  - Auto-generate via cron setiap hari jam 06:15 WIB + setelah calendar sync pertama
  - In-memory cache + Supabase fallback
  - Bold markdown parsing (`**text**` → `<strong>`)
- **AI Tools** — Hub page (`/dashboard/ai-tools`) untuk fitur-fitur AI:
  - **Voice Over Generator** (`/dashboard/ai-tools/voice-over`):
    - Step 1: Script — pilih paket (drop-down dari data-service) atau tulis manual, pilih durasi (10/20/30 detik), AI generate script via OpenAI GPT-4o-mini (bahasa santai/gaul, karakter dibatasi per durasi)
    - Step 2: Voice — pilih gender (Wanita/Pria) → pilih suara dari 8 voice Chirp3-HD (4 wanita: Dwi, Afaf, Misko, Nissa + 4 pria: Achmad, Sofyan, Rizky, Miko), 2-column grid layout
    - Step 3: Result — custom audio player (play/pause, progress bar, seek, time display), download MP3 langsung, download WAV (on-demand API call), auto-scroll ke hasil
    - Uses Google Cloud TTS API v1 (Chirp3-HD voices, `id-ID` language, speakingRate 1.1, headphone audio profile)
    - Credit system: 25K karakter/agent/bulan, stored in `ai_credits` table, auto-reset setiap 30 hari
    - Char limit: 1000 karakter per script
  - "Segera Hadir" card (disabled) untuk fitur AI mendatang

### Fitur Infrastruktur
- AI Copywriting (OpenAI proxy — generate caption WhatsApp)
- Telegram Notifier (node-cron based, runs inside Express process):
  - **Group chat** (TELEGRAM_CHAT_ID): real-time alerts (seat/price), daily briefing, weekly summary, hot deals, AI insights
  - **Per-agent DM** (telegram_chat_id): departure reminders conversational
    - Pagi (07:00 WIB): semua milestone H-14/H-7/H-3/H-1 dalam 1 pesan, progressive detail
    - Sore (17:00 WIB): H-1 only, urgent reminder
    - Anti-duplikat via state keys per agent per hari
  - **Pembayaran masuk** detection: saat sync jamaah, bandingkan `bayar` before vs after → kirim notif ke agent jika ada kenaikan pembayaran
  - **Notification preferences**: per-agent toggle (10 kategori: departure, paspor, pelunasan, perlengkapan, manasik, seat_alert, paket_baru, perubahan_harga, pembayaran_masuk, ringkasan_mingguan). Disimpan di `agents.notification_prefs` (JSONB)
  - Deep link connect: agent klik tombol di dashboard → Telegram bot auto-link chat_id
- Background sync jamaah (semua agent, setiap 1 jam, per kantor agent masing-masing)
- Calendar sync (scrape FullCalendar dari internal system, setiap 12 jam via `setInterval`)
  - Login ke internal system → fetch halaman Beranda → parse FullCalendar events JSON
  - Fetch detail popup via `_jmodal.php` per event → parse HTML table (group, pesawat, jam, paket, PAX, staff, TL)
  - Upsert ke `calendar_events` table
- AI Calendar Insight (OpenAI `gpt-4o-mini`):
  - Generate via cron harian (06:15 WIB) + setelah first calendar sync jika cache kosong
  - Prompt includes calendar events + Mekah/Madinah temperature data
  - 3 fields: `today`, `weekly`, `cuaca`
  - Cache: in-memory + Supabase `calendar_insights` table
- Agent photo storage: Supabase Storage bucket `agent-photos` (migrated from local `/public/agents/`)
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
telegram_chat_id  TEXT                -- Telegram chat ID (diisi otomatis via deep link)
telegram_link_token TEXT              -- Token sementara untuk deep link connect
notification_prefs JSONB              -- Per-agent notification preferences (10 toggles, default semua true)
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

### Tabel `calendar_events`
```
id            TEXT PRIMARY KEY     -- "{date}_{type}_{group}" e.g. "2026-03-25_keberangkatan_163"
event_date    DATE NOT NULL        -- tanggal event
event_type    TEXT NOT NULL        -- "manasik" | "keberangkatan" | "kepulangan"
group_number  TEXT                 -- nomor group ("163")
pesawat       TEXT                 -- "SAUDIA - SV 827"
jam           TEXT                 -- "00.40"
paket         TEXT                 -- nama paket
pax           INTEGER DEFAULT 0   -- jumlah jamaah
staff         TEXT                 -- nama staff
tour_leader   TEXT                 -- nama TL
raw_data      JSONB                -- data mentah scraping
synced_at     TIMESTAMPTZ          -- terakhir sync
-- Indexes: event_date, event_type
```

### Tabel `ai_credits`
```
agent_slug    TEXT PRIMARY KEY     -- FK to agents.slug
chars_used    INTEGER DEFAULT 0    -- karakter TTS yang sudah dipakai
first_used_at TIMESTAMPTZ          -- timestamp pertama kali pakai (reset setelah 30 hari)
created_at    TIMESTAMPTZ          -- record creation time
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
| POST | `/api/auth/forgot-password` | — | Send password reset email via Resend |
| POST | `/api/auth/reset-password` | — | Verify reset token + update password |

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

### Telegram
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/telegram/link` | Bearer | Generate deep link token + URL untuk connect Telegram |
| GET | `/api/telegram/status` | Bearer | Check apakah Telegram sudah terhubung |
| POST | `/api/telegram/disconnect` | Bearer | Putuskan koneksi Telegram (clear chat_id + token) |
| GET | `/api/telegram/prefs` | Bearer | Get notification preferences (merged with defaults) |
| PUT | `/api/telegram/prefs` | Bearer | Update notification preferences (partial update, JSONB merge) |
| POST | `/api/telegram/webhook` | — | Webhook handler dari Telegram bot (process /start {token}) |

### AI Tools
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/ai-tools/credits` | Bearer | Get credit usage (quota 25K/agent/bulan, remaining, reset info) |
| POST | `/api/ai-tools/generate-script` | Bearer | Generate script voice over dari data paket (OpenAI GPT-4o-mini, bahasa santai) |
| POST | `/api/ai-tools/generate-voice` | Bearer | Convert script ke audio MP3/WAV (Google Cloud TTS Chirp3-HD, credit deduction) |

### Calendar
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/calendar/events` | Bearer | Get calendar events (query: `month`, `year`) — grouped by date+type |
| GET | `/api/calendar/insight` | Bearer | Get AI-generated insight (in-memory cache → Supabase fallback) |

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
- **JWT**: `Authorization: Bearer <token>`, 365 days expiry
- **Payload**: `{ slug, name, role }`
- **Session isolation**: `clearSession()` wipes all agent-specific data (auth, CAPI sessions, UI state) on login/logout

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
| `OPENAI_API_KEY` | OpenAI API key untuk fitur AI Copywriting + Telegram AI insights + AI Tools (script generation) |
| `GOOGLE_TTS_API_KEY` | Google Cloud TTS API key untuk Voice Over Generator (Chirp3-HD voices) |
| `CAPI_ENCRYPTION_KEY` | 32-byte base64 key untuk encrypt Meta access token + jamaah password |
| `JWT_SECRET` | Secret key untuk JWT signing |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key (frontend) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (backend only) |
| `VITE_SUPABASE_URL` | Same as SUPABASE_URL (exposed to frontend via Vite) |
| `VITE_SUPABASE_ANON_KEY` | Same as SUPABASE_ANON_KEY (exposed to frontend) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token untuk notifier + deep link bot |
| `TELEGRAM_BOT_USERNAME` | Username bot Telegram (tanpa @, untuk deep link URL) |
| `TELEGRAM_WEBHOOK_URL` | Webhook URL untuk Telegram bot (e.g. `https://alhijaz.co/api/telegram/webhook`) |
| `TELEGRAM_CHAT_ID` | Chat ID production untuk notifikasi group |
| `TELEGRAM_CHAT_ID_DEV` | Chat ID dev untuk testing notifikasi |
| `NOTIFIER_YEAR_CODES` | Kode tahun paket yang di-monitor (default: "1448") |
| `NOTIFIER_BASE_URL` | Base URL API untuk notifier (default: localhost:3000) |
| `RESEND_API_KEY` | Resend API key untuk transactional emails (password reset) |

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
- Telegram per-agent: deep link connect, conversational departure reminders (pagi H-14/H-7/H-3/H-1 + sore H-1)
- Telegram notification preferences (10 categories, per-agent toggle, JSONB in agents table)
- Pembayaran masuk detection (sync-time comparison, auto-notify agent via Telegram DM)
- Settings page: iOS segmented control tab bar (Lucide icons), Telegram brand badge with animations, skeleton loading, disconnect confirmation dialog
- Background sync jamaah (hourly, all agents, single kantor per agent, 6-month widened fetch range)
- Single package view (deep link ke 1 paket)
- Quotation PDF dengan logo bank (BCA, BSI, Mandiri)
- Calendar scraping & display (internal system → Supabase → dashboard mini calendar + bottom sheet)
- AI Calendar Insight (OpenAI `gpt-4o-mini`, cron daily, alert bar + popup, 3 cards incl. weather)
- Password reset via email (Resend API)
- Agent photo storage migrated to Supabase Storage
- Photo crop modal (react-easy-crop) for profile & agent management
- Easy login access (auto-redirect, header login/dashboard button, shared `authUtils.ts`)
- Prevent auto-logout (365d JWT, simplified client-side auth check, no session cleanup on verification failure)
- Session isolation (enhanced `clearSession()` wipes CAPI sessions, insight state; full page reload on login/logout)
- Jadwal menu in dashboard (opens public page in new tab)
- Removed redundant Hitung/Compare buttons from public header
- CAPI auto-bypass login from dashboard context
- Seed script for dummy agent "bagas" with 25 jamaah records
- Haji tab integration (embedded in Jamaah page, slug-based URL routing, legacy login, card list, document viewer popup)
- AI Tools hub page + Voice Over Generator (3-step flow: script generation, voice selection, audio player with download)
- Voice Over upgraded to Google Cloud TTS Chirp3-HD (8 voices: 4 wanita + 4 pria, natural Indonesian)
- AI credit system (25K chars/agent/month, `ai_credits` table, auto-reset 30 days, banner with progress bar)
- Script generation with casual/gaul Indonesian, duration-aware character limits, AI-friendly word choices

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
| **JWT 365d expiry** | Agent tidak boleh auto-logout — session harus bertahan sangat lama. Client tidak cek expiry. |
| **Session isolation** | `clearSession()` wipes all agent-specific keys before new login to prevent data leak between agents. Full page reload (`window.location.href`) on login/logout to clear React state. |
| **Proxy semua external request** | Bypass CORS dari jadwal.alhijaz.co, kontrol caching, dan menjaga secret keys di server |
| **Data paket tidak di-database** | Data paket di-own oleh sistem legacy (jadwal.alhijaz.co), cukup di-fetch & cache di client |
| **Native fetch + Cheerio untuk Jamaah** | Awalnya pakai Playwright (300MB+), diganti native fetch + Cheerio (lightweight) — cukup POST login + GET HTML + parse table |
| **jamaah-api.js deprecated** | File ini masih ada di repo (menggunakan Playwright) tapi tidak lagi digunakan; semua jamaah flow sudah menggunakan `laporan-api.js` |
| **Recharts untuk Statistik** | Lightweight charting library, sudah termasuk ResponsiveContainer, mendukung AreaChart dan BarChart yang diperlukan |
| **Supabase free tier + keep-alive** | Budget terbatas, keep-alive ping dari server cegah auto-pause |
| **Telegram untuk notifikasi** | Agent lebih aktif di Telegram/WhatsApp daripada cek dashboard, notif otomatis lebih efektif |
| **node-cron in-process** | Tidak perlu external cron/scheduler — cron jobs jalan di dalam Express process yang sama |
| **Single-kantor sync** | Fetch hanya dari kantor agent yang terdaftar (jamaah_kantor), tidak fetch kantor lain |
| **Widened fetch range** | `HIJRIAH_YEARS.tglAwal` dimundurkan 6 bulan dari awal tahun Hijriah untuk capture jamaah yang didaftarkan lebih awal tapi berangkat di tahun Hijriah tersebut. `HIJRIAH_RANGES` (penentuan hijriah_year berdasarkan tgl_berangkat) tetap akurat |

### Known Issues / Technical Debt
- **PackageCard.tsx terlalu besar** (~103KB, 2241 baris) — perlu di-split ke sub-components
- **CapiPage.tsx terlalu besar** (~1774 baris) — bisa di-modularisasi
- **Tidak ada test suite** — risiko regresi saat refactor
- **No error boundary** — React errors bisa crash seluruh app

- **CAPI endpoints tidak pakai auth** — hanya dilindungi oleh agent slug (not secret)
- **server.js monolith** (~2000 baris) — perlu di-split ke route modules
- **telegram-notifier.js besar** (~1640 baris) — bisa di-modularisasi
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
- ✅ **DO**: Selalu panggil `clearSession()` sebelum menyimpan sesi baru di login flow — cegah data leak
- ❌ **DON'T**: Jangan cek JWT expiry di client-side — biarkan server yang handle validasi token
- ❌ **DON'T**: Jangan clear session saat `/api/auth/me` gagal (bisa karena network error) — cegah auto-logout
