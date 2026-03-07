# Alhijaz Indowisata — Project Summary

## 1. Identitas & Tujuan Project

- **Nama**: `alhijaz-umroh-schedule` (internal), **alhijaz.co** (domain publik)
- **Deskripsi**: Web app jadwal paket umroh Alhijaz Indowisata — menampilkan daftar paket umroh, harga, hotel, itinerary, brosur, dan profile agent. Berfungsi juga sebagai platform tools internal bagi para agent (kalkulasi harga, compare paket, quotation PDF, dll).
- **Masalah yang diselesaikan**: Agent-agent Alhijaz membutuhkan cara mudah untuk menampilkan jadwal umroh ke calon jamaah melalui link personal (alhijaz.co/nama-agent), tanpa harus mengirim gambar/brosur manual.
- **Target pengguna**:
  - **Calon jamaah umroh** — lihat jadwal, harga, brosur, itinerary, dan langsung chat agent via WhatsApp
  - **Agent Alhijaz** — dashboard internal untuk kalkulasi harga, compare paket, generate quotation PDF, dan tracking Meta CAPI

## 2. Tech Stack

| Layer | Teknologi |
|-------|-----------|
| **Frontend** | React 18 + TypeScript, Vite 4, TailwindCSS 3 |
| **Backend** | Express 5 (Node.js), ES Modules |
| **Database** | Supabase (PostgreSQL) — 2 tabel: `agents`, `capi_configs` |
| **Auth** | JWT custom (bcrypt + jsonwebtoken), bukan Supabase Auth |
| **PDF** | `@react-pdf/renderer` (generate quotation), `react-pdf` + pdfjs (view itinerary) |
| **Scraping** | Playwright + Cheerio (modul Jamaah) |
| **Screenshot** | `modern-screenshot` (capture PackageCard untuk dibagikan) |
| **Animation** | Framer Motion |
| **Icons** | Lucide React |
| **PWA** | vite-plugin-pwa (offline support, install banner) |
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
              ├── /api/jamaah/*      ← Scraping internal system
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
├── server.js              # Express backend (~770 lines) — API, proxy, auth, SPA serve
├── jamaah-api.js           # Playwright scraping for internal Jamaah system
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
│   ├── index.css           # Global CSS (TailwindCSS)
│   ├── components/         # 18 React components
│   │   ├── PackageCard.tsx     # Card paket umroh (komponen terbesar, ~100KB)
│   │   ├── KalkulasiPage.tsx   # Hitung harga + generate quotation PDF
│   │   ├── ComparePage.tsx     # Bandingkan 2 paket side-by-side
│   │   ├── CapiPage.tsx        # Meta Conversion API config UI
│   │   ├── FilterHeader.tsx    # Header filter (search, sort, filter mode)
│   │   ├── FilterModal.tsx     # Fullscreen filter modal (mobile)
│   │   ├── CompactCard.tsx     # Compact card variant
│   │   ├── FloatingAgentBar.tsx # Floating WhatsApp CTA bar
│   │   ├── AgentProfile.tsx    # Agent info card on package
│   │   ├── FloatingControls.tsx # Floating dark mode / scroll-to-top
│   │   ├── BrochureModal.tsx   # Fullscreen brochure viewer
│   │   ├── ItineraryModal.tsx  # Fullscreen PDF/image itinerary viewer
│   │   ├── QuotationDocument.tsx # react-pdf quotation template
│   │   ├── LoginPage.tsx       # Login + JWT session management
│   │   ├── DashboardLayout.tsx # Dashboard home + navigation
│   │   ├── DashboardProfile.tsx # Edit profile + photo crop modal
│   │   ├── JamaahPage.tsx      # View jamaah data (scraping UI)
│   │   └── index.ts            # Re-exports
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
│   │   └── filter-logic.ts     # Filter/sort logic for packages
│   └── types/
│       └── umroh-package.ts    # TypeScript interfaces for package data
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
│   └── sync-umroh-dates.mjs        # Sync departure dates for OG images
│
├── public/                 # Static assets
│   ├── agents/             # Agent profile photos (slug.jpg)
│   ├── og/                 # OG images per agent (slug.png)
│   ├── fonts/              # Custom fonts
│   └── *.png, *.svg, *.webp # Logos, icons
│
└── data/
    └── capi/               # Local CAPI config files (dev only)
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
- Download/share brosur (image) dan itinerary (PDF/image)
- Agent profile card + WhatsApp CTA
- Landing page per agent (`/:slug/umroh`) dengan OG tags untuk social sharing
- Dark mode, PWA install, offline support
- Single package view (`/:agent/:jadwalId`)

### Fitur Dashboard (Agent/Admin)
- Login dengan JWT (7 days expiry)
- Edit profil (nama, website, phone, email, slug, foto crop & upload)
- Kalkulasi harga (hitung harga per tipe kamar + generate PDF quotation)
- Compare 2 paket side-by-side
- Meta CAPI config (Pixel ID, Access Token, event toggle)
- Admin: manage all agents (CRUD)
- Jamaah data viewer (scraping dari sistem internal legacy)

### Fitur Infrastruktur
- AI Copywriting (OpenAI proxy — generate caption WhatsApp)
- GitHub webhook auto-deploy (webhook → pull → build → restart)
- Supabase keep-alive (ping setiap 3 hari, cegah free-tier pause)
- OG image generation per agent
- Stale-while-revalidate data caching (localStorage, 3 jam TTL)

## 6. Data Model / Schema

### Tabel `agents`
```
slug        TEXT PRIMARY KEY    -- "nikita", "andra", dll (lowercase)
name        TEXT NOT NULL       -- "Nikita"
website     TEXT                -- "alhijazindonesia.com"
phone       TEXT                -- "62822900020"
photo       TEXT                -- "/agents/nikita.jpg?v=1234"
email       TEXT                -- "agent@email.com"
password    TEXT                -- bcrypt hash
role        TEXT DEFAULT 'agent' -- "agent" | "admin"
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

### Jamaah
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| POST | `/api/jamaah/connect` | Bearer | Login ke sistem internal (Playwright) |
| POST | `/api/jamaah/fetch` | Bearer | Fetch data dari session |
| POST | `/api/jamaah/disconnect` | Bearer | Clear session |

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
| `OPENAI_API_KEY` | OpenAI API key untuk fitur AI Copywriting |
| `CAPI_ENCRYPTION_KEY` | 32-byte base64 key untuk encrypt Meta access token |
| `JWT_SECRET` | Secret key untuk JWT signing |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key (frontend) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (backend only) |
| `VITE_SUPABASE_URL` | Same as SUPABASE_URL (exposed to frontend via Vite) |
| `VITE_SUPABASE_ANON_KEY` | Same as SUPABASE_ANON_KEY (exposed to frontend) |

### Deployment (Production)
- Server: VPS Ubuntu, systemd service `miqot.service`
- Auto-deploy: Push ke `main` → GitHub webhook → `deploy-webhook.js` (port 9000) → `deploy.sh`
- Deploy script: `git pull` → `npm install` → `npm run build` → `systemctl restart miqot.service`
- Telegram notifikasi deploy (via bot API)

## 9. Status & Roadmap

- **Fase**: Production (live di alhijaz.co)
- **Versi**: 0.2.2

### Yang Sudah Selesai
- Core SPA (paket list, filters, dark mode, PWA)
- Agent dashboard (login, profile, kalkulasi, compare, CAPI)
- Auto-deploy pipeline (GitHub webhook)
- Supabase migration (dari hardcoded data)
- OG image generation
- Jamaah data viewer (scraping)
- AI Copywriting (OpenAI integration)

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
| **Playwright untuk Jamaah** | Sistem internal legacy tidak punya API, harus login via browser lalu scrape |
| **Supabase free tier + keep-alive** | Budget terbatas, keep-alive ping dari server cegah auto-pause |

### Known Issues / Technical Debt
- **PackageCard.tsx terlalu besar** (~103KB, 2000+ baris) — perlu di-split ke sub-components
- **Tidak ada test suite** — risiko regresi saat refactor
- **No error boundary** — React errors bisa crash seluruh app
- **Agent photos di-serve lokal** — idealnya pakai CDN/object storage
- **CAPI endpoints tidak pakai auth** — hanya dilindungi oleh agent slug (not secret)
- **Playwright dependency berat** — ~300MB, diperlukan hanya oleh fitur Jamaah

### Do's and Don'ts
- ✅ **DO**: Selalu tambahkan `onError` fallback untuk semua `<img>` tag agent photo
- ✅ **DO**: Gunakan proxy path (`/itinerary/...`, `/brosur/...`) bukan URL langsung ke jadwal.alhijaz.co
- ✅ **DO**: Invalidate `agentCache = null` setelah mutasi data agent di server
- ❌ **DON'T**: Jangan expose `SUPABASE_SERVICE_ROLE_KEY` ke frontend — hanya gunakan di server.js
- ❌ **DON'T**: Jangan hardcode agent data — selalu ambil dari Supabase (fallback di `agents.ts`)
- ❌ **DON'T**: Jangan tambahkan `crossOrigin` pada img tag brosur/itinerary — bisa break loading
