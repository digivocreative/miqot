# Alhijaz Indowisata — Project Summary

Terakhir diperbarui: 2026-06-03

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
| **Database** | Supabase (PostgreSQL) — 22 tabel utama: `agents`, `agent_slug_history`, `capi_configs`, `capi_event_logs`, `jamaah`, `jamaah_haji`, `calendar_events`, `calendar_insights`, `ai_credits`, `ask_ai_cache`, `flight_status`, `flight_shares`, `itineraries`, `haji_plus_stats`, `analytics_events`, `analytics_events_daily`, `umroh_schedules`, `kurs_cache`, `jamaah_portal_tokens`, `jamaah_portal_sessions`, `booking_persiapan`, `jamaah_document_cache` |
| **Telegram** | Telegram Bot API — group alerts (node-cron) + per-agent DM (deep link connect, departure reminders, pembayaran masuk) |
| **Auth** | JWT custom (bcrypt + jsonwebtoken), bukan Supabase Auth |
| **PDF** | `@react-pdf/renderer` (generate quotation), `react-pdf` + pdfjs (view itinerary) |
| **Charts** | Recharts (AreaChart, BarChart — untuk Statistik page, Haji Plus, Analytics) |
| **Maps** | Leaflet + React Leaflet (Flight Share route map) |
| **Scraping** | Native `fetch` + Cheerio untuk flow aktif (laporan/jamaah, calendar, haji); Playwright masih ada hanya untuk legacy/deprecated tooling |
| **Screenshot / Export** | `modern-screenshot` (Brosur Jadwal, Compare share, Haji Plus export/simulasi), `@zumer/snapdom` (PackageCard share image, Kurs Share, kartu ulang tahun, Kartu Nama Digital) |
| **Animation** | Framer Motion |
| **Icons** | Lucide React |
| **QR / Drag** | `qrcode` untuk Kartu Nama Digital, `@dnd-kit` untuk Bio editor drag reorder |
| **PWA** | vite-plugin-pwa (offline support, install banner) |
| **Notifications** | Telegram Bot API + node-cron (seat alerts, weekly summary, AI insights) |
| **Email** | Resend (transactional emails: password reset) |
| **Error Tracking** | Sentry (Node.js SDK + Express integration via `instrument.mjs`) |
| **Hosting** | VPS (Ubuntu), systemd service `miqot.service` |
| **Deploy** | GitHub webhook → `deploy-webhook.js` → `deploy.sh` (pull + build + restart) |
| **Container** | Docker + docker-compose (alternatif) |
| **Tests** | `node:test` + `assert` untuk logic pure (`haji-stats`, `haji-pernyataan`, `analytics-maintenance`, `brochure-schedule`) |

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
              ├── /api/agent/:slug/* ← Public agent metadata (card variant)
              ├── /api/jamaah/*      ← Lightweight dashboard helpers (birthdays)
              ├── /api/laporan/*     ← Jamaah management (login, sync, list, stats)
              ├── /api/capi/*        ← Meta Conversion API config
              ├── /api/awapi/test    ← Official Alhijaz API credential smoke test
              ├── /api/ai-copy       ← OpenAI proxy (caption generator)
              ├── /api/ai-tools/*    ← AI Tools (Brosur Jadwal, voice over script & TTS)
              ├── /api/flights/*     ← Flight status tracking (AirLabs API)
              ├── /api/flight-share  ← Flight share link creation & retrieval
              ├── /api/weather/*     ← Weather data (Open-Meteo API)
              ├── /api/kurs          ← Currency exchange rates (USD, SAR)
              ├── /api/analytics/*   ← Event tracking & analytics
              ├── /api/haji-plus/*   ← Haji Plus statistics
              ├── /api/bio/:slug/*   ← Link Bio config, SEO image, photo upload, featured package preview
              ├── /api/api-get/*     ← Proxy to jadwal.alhijaz.co (package data)
              ├── /itinerary/*       ← Proxy PDF/images from jadwal.alhijaz.co
              ├── /brosur/*          ← Proxy brochure images
              ├── /f/:code           ← Public flight share page (OG injection)
              ├── /:slug/umroh       ← SSR landing page (OG tags for social sharing)
              ├── /:slug/haji        ← SSR Haji Plus landing page (OG tags for social sharing)
              ├── /:slug/bio         ← Public Link Bio page with SSR OG injection
              └── /*                 ← SPA fallback (dist/index.html with OG injection)
                                          └── Supabase (PostgreSQL)
```

### Struktur Folder

```
alhijaz/
├── server.js              # Express backend (~15748 lines) — API, proxy, auth, register, sync, stats, birthday lookup, AI insight, AI tools, Tanya AI (public), flight tracking, analytics (+ daily aggregation), CAPI event logs, PIN auth, landing-config, bio-config (+ AI tagline-generate), umrah register (form-scrape + OCR KTP), Portal Jamaah (magic link issue/consume/me/persiapan), Haji AWAPI sync, Haji agent ranking, CDN fingerprint sync, SPA serve
├── instrument.mjs         # Sentry initialization (must be imported before everything else)
├── laporan-api.js          # Lightweight HTTP session-based fetch + HTML parse (Cheerio)
├── calendar-api.js         # Calendar scraper — fetch FullCalendar events from internal system, detail via _jmodal.php
├── haji-api.js             # Haji data scraper (HTTP session + Cheerio, parallel batch sync to `jamaah_haji` table)
├── jamaah-api.js           # Legacy: Playwright-based jamaah scraping (deprecated, replaced by laporan-api.js)
├── awapi-client.js         # Alhijaz Official API client (post-2026-04-26 umroh sync via official API instead of legacy scrape)
├── telegram-notifier.js    # Telegram alerts (~3041 lines) — seat, price, weekly, AI insights, per-agent departure reminders, cicilan/pelunasan masuk, birthday digest, kurs update
├── deploy-webhook.js       # GitHub webhook listener (port 9000) → auto deploy
├── deploy.sh               # Deploy script: pull, install, build, restart systemd
├── Dockerfile              # Docker multi-stage build
├── docker-compose.yml      # Docker compose config
├── vite.config.ts          # Vite config (~519 lines) — dev plugins, PWA, proxy, manual chunks, build constants
├── package.json            # Dependencies & scripts
│
├── src/                    # Frontend (React + TypeScript)
│   ├── main.tsx            # Entry point — routing, PWA registration, page resolution
│   ├── App.tsx             # Main SPA component — package list, filters, layout
│   ├── index.css           # Global CSS (TailwindCSS + custom animations)
│   ├── components/         # 58 top-level React components + feature folders (portal-jamaah, dashboard, bio, bio-editor)
│   │   ├── PackageCard.tsx        # Card paket umroh (komponen terbesar, ~2610 lines) — flag overlay, "Diskusi" button (Tanya AI), share link row
│   │   ├── DashboardProfile.tsx   # Edit profile + photo crop + card variant picker + Telegram + AIW internal system + PIN management (~2351 lines)
│   │   ├── CapiPage.tsx           # Meta Conversion API config UI + event log (~2144 lines)
│   │   ├── JamaahPage.tsx         # View jamaah umroh data, sync, notes, diskon, filter + "Jamaah Baru" entry ke UmrahRegisterPage (~1968 lines)
│   │   ├── UmrahRegisterPage.tsx  # Pendaftaran jamaah umroh ke sistem legacy (~1808 lines) — form-options scrape, KTP OCR (OpenAI Vision), searchable select, idb binding (family/group), preview modal, dummy-fill buttons
│   │   ├── KalkulasiPage.tsx      # Hitung harga + generate quotation PDF (~1625 lines)
│   │   ├── HajiPage.tsx           # View jamaah haji data, login to legacy, sync, notes, document viewer popup (~1238 lines)
│   │   ├── FlightStatusCard.tsx   # Real-time flight tracking with AirLabs API, grouped kloter cards, share link (~1160 lines)
│   │   ├── ComparePage.tsx        # Bandingkan 2 paket side-by-side (~1101 lines)
│   │   ├── AskAIModal.tsx         # Tanya AI fullscreen modal (~1080 lines) — chip pool 24 soalan (reshuffle + pinned "brosur"), typewriter reveal, WA nudge, brosur/itinerary inline attachments, iOS Safari keyboard handling, AiAvatar (agent photo + Sparkles badge)
│   │   ├── StatistikPage.tsx      # Dashboard statistik: ringkasan jamaah, komisi, chart tren, PIN-gated, lazy StatistikHajiSection (~1117 lines)
│   │   ├── DashboardLayout.tsx    # Dashboard home + navigation + tab routing (~981 lines) — TelegramConnectBanner, BirthdayWidget, Kurs share, AI Tools sub-page override icon/color
│   │   ├── LandingPagePage.tsx    # Landing page config — 3 tab Umroh/Haji/Bio; SEO title/description/OG image untuk /:slug/umroh & /:slug/haji, plus entry point Bio editor (~907 lines)
│   │   ├── AgentManagementPage.tsx # Admin: manage all agents CRUD + approval (~851 lines)
│   │   ├── FlightSharePage.tsx    # Public flight share page /f/:code — hero card, map, boarding pass, weather, agent CTA (~830 lines)
│   │   ├── BrochureScheduleTemplate.tsx # 1080×1620 (2:3) Brosur Jadwal export template — `variant` prop (default red/gold | winter icy-blue), tokenized theme, package table, sold-out stamp, winter-only snowflakes + snow drift
│   │   ├── SimulasiHajiPlus.tsx   # Haji Plus simulation calculator — package pricing, USD→IDR, inflation projection, export PNG (~676 lines)
│   │   ├── LoginPage.tsx          # Login + JWT session management (~724 lines)
│   │   ├── AnalyticsPage.tsx      # Analytics dashboard with event tracking charts + agent drill-down modal (~616 lines)
│   │   ├── BusinessCardPage.tsx   # Digital business card generator (~574 lines)
│   │   ├── HajiPlusExportPage.tsx # Haji Plus infographic export PNG (~555 lines)
│   │   ├── RegisterPage.tsx       # Agent self-registration form — slug auto-gen, validation, pending approval workflow (~581 lines)
│   │   ├── TrenDaftarSection.tsx   # Registration trend section for Statistik (~510 lines)
│   │   ├── VoiceOverPage.tsx      # Voice Over Generator (3-step: script → voice → audio player) (~505 lines)
│   │   ├── FilterHeader.tsx       # Header filter (search, sort, filter mode) (~502 lines) — includes `UMROH CUTI 5 HARI` + `UMROH BINTANG 5`
│   │   ├── QuotationDocument.tsx  # react-pdf quotation template (~501 lines)
│   │   ├── BrochureSchedulePage.tsx # AI Tools: monthly umroh brochure preview/export/share, split 10 paket per image (~935 lines)
│   │   ├── UpcomingSchedule.tsx   # Calendar widget — mini grid with colored dots + bottom sheet detail (~470 lines)
│   │   ├── ResetPasswordPage.tsx  # Reset password page (from email link) (~465 lines)
│   │   ├── CardVariants.tsx       # Multiple card layout variants: Split, Spotlight, Ticket, Tiled, Magazine (~403 lines)
│   │   ├── KursPage.tsx           # Currency exchange rates page (USD, SAR) (~382 lines)
│   │   ├── WebItineraryView.tsx   # AI-parsed itinerary timeline view (~373 lines)
│   │   ├── ItineraryModal.tsx     # Fullscreen PDF/image itinerary viewer + pinch-to-zoom (~357 lines)
│   │   ├── CuacaWidget.tsx        # Weather widget — Mekah/Madinah/Jakarta/Surabaya (~331 lines)
│   │   ├── CalendarInsight.tsx    # AI Insight alert bar + bottom sheet popup (~310 lines)
│   │   ├── HajiPlusPage.tsx       # Haji Plus stats visualization + chart (~300 lines)
│   │   ├── BirthdayCardTemplates.tsx # 1080×1080 birthday card renderers: classic + Islamic (~662 lines)
│   │   ├── BirthdayDetailSheet.tsx # Bottom sheet for birthday message, card preview/download, WA send (~415 lines)
│   │   ├── BirthdayWidget.tsx     # Dashboard birthday widget for today + next 3 days (~240 lines)
│   │   ├── BirthdayListSheet.tsx  # Grouped list sheet for birthday entries (~142 lines)
│   │   ├── AgentDrillDownModal.tsx # Admin analytics detail per agent, 7-day timeline/heatmap/funnel (~411 lines)
│   │   ├── StatistikHajiSection.tsx # Lazy Haji stats section inside Statistik page (~417 lines)
│   │   ├── TelegramConnectBanner.tsx # Dashboard home CTA if Telegram not connected (~92 lines)
│   │   ├── BrochureModal.tsx      # Fullscreen brochure viewer + CDN + pinch-to-zoom (~275 lines)
│   │   ├── FilterModal.tsx        # Fullscreen filter modal (mobile) (~253 lines)
│   │   ├── FlightMap.tsx          # Leaflet map component for flight routes (lazy-loaded) (~224 lines)
│   │   ├── FloatingControls.tsx   # Floating dark mode / scroll-to-top (~207 lines)
│   │   ├── CapiEventLog.tsx       # CAPI event log viewer — pagination, filtering, auto-refresh 30s (~222 lines)
│   │   ├── CompactCard.tsx        # Compact card variant (~131 lines)
│   │   ├── PhotoCropModal.tsx     # Reusable photo crop modal (react-easy-crop) (~181 lines)
│   │   ├── AIToolsPage.tsx        # AI Tools hub page (tool cards grid — Brosur Jadwal, Compare, Kurs, Simulasi Haji Plus, Landing Page, Voice Over, Kartu Nama) (~152 lines)
│   │   ├── SettingsPage.tsx       # Unified settings: iOS segmented control (3 tabs: Profil, Telegram, CAPI) (~257 lines)
│   │   ├── FloatingAgentBar.tsx   # Floating WhatsApp CTA bar (~107 lines)
│   │   ├── AgentProfile.tsx       # Agent info card on package page (~85 lines)
│   │   ├── PinInput.tsx           # 6-digit PIN input component (visual boxes, error state) (~59 lines)
│   │   ├── ShareKursModal.tsx     # Fullscreen modal untuk preview + share/download infografis kurs 16:10 (JPG) (~293 lines)
│   │   ├── KursShareTemplates.tsx # Single Hero USD kurs share template — fixed 1400×1000 canvas (~332 lines)
│   │   ├── CustomDomainPage.tsx   # Feature-gated custom domain management — DNS status, verification steps, embed tutorial
│   │   ├── CustomDomainTrigger.tsx # Compact card untuk dashboard sidebar (loading/empty/active/setup states)
│   │   ├── bio/                   # Public Link Bio page (`/:slug/bio`) — 12 files (~768 lines): BioPage, BioHero, BioSocialRow, KaabaIcon, WhatsAppIcon, TileFeatured, TileProduct, TileWA, TileLink, TilePhoto, TileTestimonial, TileText
│   │   ├── bio-editor/            # Dashboard Bio editor — 18 files (~2742 lines): BioEditorPage, TileList/Row, SheetEditTile/Hero/Seo/AddTile/Base, PaketPicker, PhotoUploadField, HeroCard, SaveToast, UrlCard, SeoCard, HintBanner, ThemePicker, BottomBar, LinkIconPicker
│   │   ├── dashboard/             # Agent-side magic link controls — MagicLinkButton (132 lines, gated on 'nikita' slug for rollout), MagicLinkModal (272 lines: WhatsApp/SMS/copy distribution)
│   │   ├── portal-jamaah/         # Portal Jamaah jamaah-facing app (`/:slug/jamaah/...`) — magic link auth, 7-route state machine, ~2300 lines across:
│   │   │   ├── PortalJamaahRouter.tsx     # Top-level router resolves landing / auth-consume / dashboard / error states
│   │   │   ├── pages/                     # 11 pages: PortalDashboard (state machine), BerandaPage (home), PerjalananPage, PembayaranPage, DokumenPage, PerlengkapanPage, ManasikSpiritualPage, FaqPage, LandingPage (magic form), AuthConsumePage, AuthErrorPage
│   │   │   ├── components/                # 17 components: HeroCountdown, StickyWhatsAppCta, RosterItem, SmartAlertsStrip, KodeBookingForm, ItineraryList, TaskListWidget, JamaahPaymentCard, FlightCard, AgentHeaderBar, HotelCard, PortalBackBar, PortalMenuCard, PortalTopBar, PortalMenuGrid, ThemeToggle, MagicLinkSuccessCard
│   │   │   ├── hooks/                     # usePortalRoute (state machine), usePortalMe (profile/booking/agent), usePortalPersiapan (checklist), usePortalTheme
│   │   │   ├── lib/                       # portalSession (sessionStorage + magic-code regex), portalApi (logout/refetch), portalMenu (PORTAL_MENUS constant), portalTasks (derive urgent tasks), portalAlerts, faq, fetchAgentBySlug
│   │   │   ├── tabs/persiapan/            # Subcomponents untuk rendering preparation checklist
│   │   │   └── utils/                     # formatDate, formatRupiah, formatText helpers
│   │   └── index.ts               # Barrel re-exports
│   ├── data/
│   │   ├── agents.ts           # Agent data + Supabase fetch + fallback
│   │   ├── hotelService.ts     # Hotel proximity data (jarak ke Masjid)
│   │   └── temperatureData.ts  # Cuaca Mekah/Madinah per bulan
│   ├── services/
│   │   └── data-service.ts     # API client + cache (stale-while-revalidate)
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client init (frontend/anon key)
│   │   └── capi.ts             # Meta CAPI event sender
│   ├── hooks/
│   │   └── useTypingPlaceholder.ts  # Animated typing placeholder for jamaah notes (72 rotating suggestions)
│   ├── utils/
│   │   ├── authUtils.ts        # Shared auth utility (isSessionValid)
│   │   ├── filter-logic.ts     # Filter/sort logic for packages
│   │   ├── validation.ts       # 8 shared validators + 2 cleaners (name, phone, email, website, slug, password)
│   │   ├── analytics.ts        # Event tracking helper (trackEvent, trackPublicEvent)
│   │   └── index.ts            # Re-exports
│   └── types/
│       ├── umroh-package.ts    # TypeScript interfaces for package data
│       └── index.ts            # Re-exports
│
├── functions/              # SSR functions
│   ├── [slug]/umroh.ts     # SSR landing page template (Cloudflare-compatible)
│   ├── [slug]/haji.ts      # SSR Haji Plus landing page
│   ├── [slug]/[packageId].ts # Single package OG meta injection for bot/crawler
│   ├── umroh-dates.json    # Generated/cache data tanggal umroh untuk OG/landing support
│   ├── umroh-landing.mjs   # Compiled umroh landing (auto-generated, gitignored)
│   └── haji-landing.mjs    # Compiled haji landing (auto-generated, gitignored)
│
├── scripts/                # Utility scripts
│   ├── generate-og.mjs         # Generate OG images per agent
│   ├── hash-passwords.js       # Hash agent passwords with bcrypt
│   ├── migrate-agents-to-supabase.js # Migrate agent data to Supabase
│   ├── migrate-admin-columns.js     # Add email/role columns to agents table
│   ├── migrate-agent-status.js      # Add status/registered_at columns to agents
│   ├── migrate-jamaah-table.js      # Create jamaah table in Supabase
│   ├── migrate-calendar-table.js    # Create calendar_events table in Supabase
│   ├── migrate-jamaah-columns.js    # Add perlengkapan/dokumen columns
│   ├── add-perlengkapan-cols.js     # Add perlengkapan columns to jamaah table
│   ├── migrate-paspor-columns.js    # Add no_paspor/paspor_expired columns
│   ├── migrate-telegram-link.js     # Add telegram_chat_id + telegram_link_token columns
│   ├── migrate-telegram-chatid.js   # Migrate telegram chat ID column
│   ├── setup-telegram-webhook.js    # Register Telegram bot webhook URL
│   ├── fix-hijriah-year.js          # Fix hijriah year based on departure dates
│   ├── fix-nikita.mjs               # Fix agent data for specific agent
│   ├── seed-bagas.js                # Create agent "bagas" with dummy jamaah data
│   ├── debug-cols.js                # Debug legacy HTML table column structure
│   ├── telegram-notify.mjs          # Manual telegram notification script
│   ├── sync-umroh-dates.mjs         # Sync departure dates for OG images
│   ├── migrate-flight-shares.js     # Create flight_shares table
│   ├── migrate-flight-status.js     # Create flight_status table
│   ├── migrate-flight-status-column.js # Add flight_status column to flight_shares
│   ├── migrate-haji-table.js        # Create jamaah_haji table
│   ├── migrate-notification-prefs.js # Add notification_prefs JSONB to agents
│   ├── migrate-photos-to-supabase.js # Migrate agent photos to Supabase Storage
│   ├── migrate-capi-last-bayar.js   # Add last_bayar tracking to CAPI
│   ├── migrate-capi-event-logs.js   # Create capi_event_logs table
│   ├── migrate-capi-purchase-status.js # Add capi_purchase_status to jamaah tables
│   ├── migrate-umroh-schedules-table.js # Create umroh_schedules table
│   ├── migrate-ai-credits.js        # Create ai_credits table
│   ├── migrate-ask-ai-cache.js      # Create ask_ai_cache table (Tanya AI cache)
│   ├── migrate-landing-config.js    # Add landing_config JSONB column to agents
│   ├── migrate-bio-config.js        # Add bio_config JSONB column to agents
│   ├── migrate-analytics-daily.js   # Create analytics_events_daily aggregate table
│   ├── backfill-analytics-daily.js  # One-shot backfill for historical analytics aggregation
│   ├── backfill-capi-crossagent.js  # Backfill CAPI events across agents
│   ├── backfill-capi-purchase.js    # Backfill CAPI Purchase status
│   ├── migrate-jamaah-diskon.js     # Add diskon column to jamaah table
│   ├── migrate-agents-awapi.js      # Migrate agents schema for AWApi integration
│   ├── migrate-agents-fk-cascade.js # Add ON DELETE CASCADE to agent FK references
│   ├── migrate-agents-fk-cascade-sweep.js # Sweep dangling FKs after cascade migration
│   ├── test-awapi-client.js         # Test harness for AWApi client (Alhijaz Official API)
│   ├── test-awapi.js                # Lower-level AWApi smoke test
│   ├── test-perlengkapan-upsert.js  # Test harness for perlengkapan upsert flow
│   ├── test-cleanup-guard.mjs       # Test harness for cleanup guard logic
│   └── check-ai-credits.js          # Debug script for AI credit status
│
├── public/                 # Static assets
│   ├── og/                 # OG images per agent (slug.png)
│   ├── fonts/              # Custom fonts
│   ├── flags/              # Country flag images (saudi.png, turki.png, mesir.png, china.png, uae.png)
│   ├── img-brosur/         # Image assets for Brosur Jadwal template (Kaaba/Nabawi backdrop)
│   ├── logo-bank/          # Bank logos for quotation (bca.png, bsi.png, mandiri.png)
│   ├── haji-plus.html      # Static Haji Plus landing page (SEO, Yoast/OG/Schema.org)
│   ├── umroh.html          # Static Umroh landing page (SEO, Yoast/OG/Schema.org)
│   └── *.png, *.svg, *.webp # Logos, icons
│
├── lib/                    # Shared server-side pure/business logic
│   ├── analytics-maintenance.js # Daily analytics aggregation + raw/CAPI log retention cleanup
│   ├── awapi-sync-outcome.js # `classifyAwapiSyncOutcome` — pure decision helper untuk tail sync umroh AWAPI (full/partial/hardfail → shouldBump/shouldNotify/shouldCleanup)
│   ├── background-jobs.js    # `shouldRunBackgroundJobs`, `shouldRunJamaahBackgroundSync`, `shouldRunLegacyBackgroundSync` + `parseEnvBoolean` — gate cron/notifier and jamaah sync loops by env flags
│   ├── birthdays.js          # Birthday lookup/date helpers
│   ├── brochure-schedule.js  # Harga/hotel cleanup, sold-out parsing, grouping package by month for Brosur Jadwal
│   ├── cdn-file-sync.js      # CDN file sync decisions (skip/upload/verify) by comparing SHA256 fingerprints
│   ├── haji-stats.js         # Haji stats + document/pernyataan helpers
│   ├── jamaah-document-cache.js # Cache HTML surat pernyataan AWAPI + wrap jadi shell A4 print-ready (794×1123, SHA256 dedup, strip <script>)
│   ├── jamaah-payment-provenance.js # Guard provenance pembayaran — cegah kolom legacy (bayar/sisa/diskon) menimpa data AWAPI; stamp `payment_source` awapi|legacy di raw_data
│   ├── jamaah-phase1-enrichment.js # Preserve enrichment user (wa/tgl_lahir/no_paspor/perlengkapan/dokumen) lintas sync; default `hijriah_year` '1447'
│   ├── jamaah-phase2-policy.js # Schedule Jakarta-time umroh Phase 2 notification windows (default 01:00 & 14:00 WIB)
│   ├── journey-order.js      # Infer Saudi itinerary sequence (Madinah-first vs Umroh-first) from day-by-day schedule text
│   ├── kurs-image-generator.mjs # Kurs image generation helper
│   ├── kurs-mandiri.js       # Parse + normalize Bank Mandiri exchange rate timestamps (WIB → ISO)
│   ├── kurs-share-cache.mjs  # Versioned cache directory for generated kurs share JPEG (TTL + size limit, slug-safe names)
│   ├── laporan-stats.js      # `buildBerangkatMendatang` — ringkasan keberangkatan terdekat (group bulan pertama, hari_lagi, lunas/sisa) untuk dashboard laporan
│   ├── notifier-package-source.js # Build notifier API endpoint URL for paket schedule
│   ├── og-generator.mjs      # OG image generation helper
│   ├── sync-cleanup.js       # Cleanup guard helpers for jamaah sync (`computeSafeDeletions`, listComplete check)
│   └── umroh-schedules.js    # Merge cached + upstream schedule rows with versioning; append SHA256 fingerprints to file URLs
│
├── data/
│   ├── notifier-state.json  # Telegram notifier state (persisted snapshot)
│   └── capi/                # Local CAPI config files (dev only, deprecated)
└── tests/                   # node:test smoke/unit coverage for pure logic (jalankan: `node --test tests/*.test.js`)
    ├── analytics-maintenance.test.js
    ├── awapi-client.test.js
    ├── awapi-partial-no-fallback.test.js # Fix A: partial fetch TIDAK fallback ke legacy, bump label tetap jalan
    ├── awapi-sync-guard.test.js     # AWAPI sync validation/safeguards
    ├── awapi-sync-outcome.test.js   # classifyAwapiSyncOutcome (full/partial/hardfail flags)
    ├── background-jobs.test.js      # shouldRunBackgroundJobs/parseEnvBoolean gating
    ├── birthdays.test.js
    ├── brochure-schedule.test.js
    ├── calendar-insight-style.test.js
    ├── cdn-file-sync.test.js         # CDN sync decisions (skip/upload/verify by SHA256)
    ├── haji-awapi-sync.test.js       # Haji AWAPI sync core (keberangkatan/pendaftaran fetch, normalisasi row)
    ├── haji-filters.test.js          # Haji jamaah filters (tahun daftar, status bayar, paket)
    ├── haji-page-currency.test.js    # Haji format USD (paket/bayar/sisa)
    ├── haji-pernyataan.test.js
    ├── haji-plus-simulation.test.js  # Kalkulator Simulasi Haji Plus (harga USD per tipe kamar, proyeksi)
    ├── haji-stats-daftar-year.test.js # Statistik Haji per tahun pendaftaran vs keberangkatan
    ├── haji-stats.test.js
    ├── jamaah-advanced-filters.test.js # Filter lanjutan Umroh (bayar/keberangkatan/dokumen/perlengkapan/catatan)
    ├── jamaah-auto-sync.test.js
    ├── jamaah-document-cache.test.js # Cache row build + printable A4 HTML wrapper
    ├── jamaah-filter-animation.test.js # Animasi expand/collapse panel filter (Framer Motion)
    ├── jamaah-payment-provenance.test.js # Guard provenance pembayaran (awapi vs legacy)
    ├── jamaah-payment-ui.test.js     # Persentase pembayaran ter-clamp 0–100 (handle sisa negatif)
    ├── jamaah-pernyataan-document.test.js # Surat pernyataan: marker `dokumen.pernyataan` durable lintas sync
    ├── jamaah-phase1-enrichment.test.js # preserveUmrohPhase1Enrichment (preserve data user)
    ├── jamaah-phase2-policy.test.js  # Phase 2 schedule time calc across WIB boundaries
    ├── jamaah-refresh-staff.test.js  # Merge raw_data (preserve `staf` legacy) saat refresh
    ├── journey-order.test.js         # Madinah-first vs Umroh-first detection
    ├── kurs-mandiri.test.js          # Mandiri timestamp parsing + date key generation
    ├── kurs-share-cache.test.js      # Cache eviction, TTL, slug safety
    ├── laporan-stats.test.js         # buildBerangkatMendatang (group bulan, hari_lagi, lunas/sisa)
    ├── notifier-package-source.test.js # URL builder smoke test
    ├── portal-jamaah.test.js         # Portal Jamaah migration tables (RLS, FK, JSONB)
    ├── portal-jamaah-frontend.test.js # Portal Jamaah frontend (route URL-sync, komponen)
    ├── portal-jamaah-redesign.test.js # Portal Jamaah redesign component file inventory
    └── umroh-schedules.test.js       # Schedule row merging + version append
```

### Migrations (recent)
- `migrations/20260515000000_portal_jamaah.sql` — `jamaah_portal_tokens`, `jamaah_portal_sessions`, `booking_persiapan` (RLS-protected)
- `migrations/20260520000000_haji_awapi_columns.sql` — 13 kolom baru di `jamaah_haji` (porsi, spph, paspor, finansial, tanggal, dokumen JSONB) + composite indexes
- `migrations/20260522000000_umroh_schedule_cdn_fingerprints.sql` — 8 kolom CDN sync (sha256/bytes/content-type/synced_at) untuk brosur & itinerary di `umroh_schedules`
- `migrations/20260523000000_jamaah_document_cache.sql` — tabel `jamaah_document_cache` (`agent_id` UUID FK CASCADE, `jm_id`, `document_type`, `content_html`, `html_sha256`, `source_url`, `content_type`, `fetched_at`/`updated_at`; UNIQUE `(agent_id, jm_id, document_type)`, RLS-protected) untuk cache surat pernyataan AWAPI

## 4. Konvensi & Aturan

- **Bahasa kode**: Campuran — variabel/fungsi dalam English, komentar & UI text dalam Bahasa Indonesia
- **Framework**: React functional components + hooks, no class components
- **Styling**: TailwindCSS (utility-first), dark mode via `dark:` prefix, responsive mobile-first
- **State management**: `useState` + `useEffect` + `useCallback`, no external state library
- **File naming**: camelCase untuk utils/services, PascalCase untuk components
- **Branching**: Trunk-based (push to `main` → auto deploy via webhook)
- **Tests**: Ada test ringan berbasis `node:test` untuk logic pure; belum ada script npm khusus, jalankan langsung dengan `node --test tests/*.test.js`
- **Design palette**: "Premium Teal & Earthy" — primary emerald/teal, dark slate backgrounds
- **Routing**: Custom path-based routing di `main.tsx` (bukan React Router)
- **Agent status**: Self-registration workflow (`pending` → `active`/`rejected`)

## 5. Fitur Utama

### Fitur Public (Calon Jamaah)
- Daftar paket umroh dengan filter (maskapai, hotel, harga, tanggal, waktu penerbangan)
- **Filter mode spesifik**: `AVAILABLE`, `PROMO`, `LIBURAN_SEKOLAH`, `UMROH REGULER`, `UMROH MUSIM DINGIN`, `UMROH CUTI 5 HARI` (berangkat Jumat malam/Sabtu, pulang Sabtu/Minggu/Senin dini hari), `BINTANG 5` (label UI: "UMROH BINTANG 5", semua hotel bintang 5)
- View card detail paket (harga per room type, info hotel, seat tersisa)
- Compact view mode (toggle antara card lengkap dan card ringkas)
- Per-agent card variant (`default`, `split`, `spotlight`, `ticket`, `tiled`, `magazine`) — dipilih di Settings > Profil dan disuntikkan ke SSR body via `data-agent-card-variant`
- Download/share brosur (image) dan itinerary (PDF/image)
- Agent profile card + WhatsApp CTA
- **Tanya AI** (`Diskusi` button pada PackageCard) — fullscreen modal asisten AI per paket:
  - Header: back button + `AiAvatar` (foto agent + Sparkles "AI" badge overlay) + title "Asisten [FirstName]" + subtitle "AI · siap bantu jawab"
  - Chip pool 24 pertanyaan (shuffled tiap open; "Minta brosur paket dong" pinned)
  - 4 default chips + 4 extras under "Lihat pertanyaan lain" + follow-up pills dibawah AI bubble
  - Typewriter word-by-word reveal (22ms/word), strip unmatched markdown saat partial state
  - Inline **brosur** / **itinerary** attachment card (auto-trigger dari AI; lazy-load `BrochureModal` / `ItineraryModal`)
  - **WA Nudge card** setiap 3 pesan AI + saat fallback (agent photo + soft CTA ke WhatsApp)
  - Client-side rate limit: 8 query/session; server rate limit 10 req/60s/IP
  - 7-day cache (hash-based, per `jadwal_id` + `agent_id` + `question_hash`)
  - Fallback responses: "Waduh, koneksinya lagi lambat, Kak 😅 Coba chat [agent] langsung aja ya."
  - iOS Safari keyboard handling (body-lock `position:fixed`, `visualViewport.offsetTop` tracking, auto-scroll undo)
- Landing page per agent (`/:slug/umroh`, `/:slug/haji`) dengan OG tags untuk social sharing (custom title/description/OG image per agent via Landing Page config)
- **Portal Jamaah** (`/:slug/jamaah[/<magic-code>][/dashboard]`) — jamaah-facing companion app dengan magic-link auth (no password):
  - **Akses**: agent generate magic link dari dashboard (`MagicLinkButton` + `MagicLinkModal` di `src/components/dashboard/`) → distribusi via WhatsApp/SMS/copy → jamaah klik link, token dikonsumsi sekali, session cookie tersimpan
  - **Self-service entry**: `/:slug/jamaah` LandingPage punya form "Kode Booking + WhatsApp" yang request magic link langsung (rate-limited public endpoint), syarat booking sudah DP
  - **Magic code regex**: `/^(?=.*[a-z])(?=.*[2-9])[a-z2-9]{5}$/i` (5-char alphanumeric, harus ada huruf + digit 2-9; menghindari 0/1/i/l/o yang sulit dibaca)
  - **7-route state machine** di `PortalDashboard` (via `usePortalRoute` hook): `beranda` (home, default), `perjalanan` (itinerary penerbangan + hotel), `pembayaran` (status DP/lunas + history card), `dokumen` (checklist 6 dokumen wajib), `perlengkapan` (status perlengkapan), `manasik` (resource spiritual prep), `faq` (accordion)
  - **Beranda**: `HeroCountdown` (departure countdown gradient emerald + flight info), `SmartAlertsStrip` (tone-aware alerts merah/amber/violet/purple), `TaskListWidget` (urgent tasks kategori), `PortalMenuGrid` 3×3 (6 menu dengan icon + accent color), roster jamaah grup (`RosterItem` dengan gender ring + payment status overlay + progress bar)
  - **StickyWhatsAppCta**: pill footer emerald-white gradient yang muncul saat scroll up, hilang saat scroll down
  - **PortalTopBar / PortalBackBar**: glassmorphism header (backdrop-blur-xl + saturate-150) per DESIGN-SYSTEM
  - **ThemeToggle**: dark mode toggle per session jamaah (independent dari agent theme), persisted di sessionStorage
- Link Bio publik (`/:slug/bio`) — halaman personal Linktree-style untuk agent dengan hero profile, badge, social links, tile WhatsApp, jadwal Umroh, Haji Plus, featured paket, custom link, teks, foto, dan testimoni. Public page hanya merender bagian `visible && !orphaned`.
- Single package view (`/:agent/:jadwalId`) — deep link ke 1 paket tertentu, OG meta injection untuk bot/crawler
- Dark mode, PWA install, offline support
- AI-powered caption generator (OpenAI) untuk promosi WhatsApp
- Country flag overlays on package cards (Saudi, Turki, Mesir, China, UAE)
- Static SEO landing pages (`/haji-plus.html`, `/umroh.html`) dengan Yoast/OG/Schema.org metadata

### Fitur Dashboard (Agent/Admin)
- **Agent self-registration** (`/register`) — form pendaftaran dengan slug auto-gen, validasi per-field, status pending hingga admin approve
- Login dengan JWT (365 days expiry)
- **Auto-redirect**: Agent yang sudah login otomatis redirect dari `/` atau `/login` ke `/dashboard` (synchronous, sebelum React render)
- **Subtle login/dashboard button** di public header: `LogIn` icon jika belum login, `LayoutDashboard` icon jika sudah login
- Lupa password → reset via email (Resend API)
- Edit profil (nama, website, phone, email, slug cooldown 30 hari, foto crop & upload ke Supabase Storage, pilihan tampilan card paket)
- **Settings Page** — unified settings dengan iOS segmented control (3 tab dengan Lucide icons):
  - **Profil** (`User` icon): edit profil agent
  - **Telegram** (`Send` icon): hubungkan Telegram via deep link, **notification preferences** (15 toggle visible: Jamaah/Paket/Lainnya; backend juga punya legacy `pembayaran_masuk` dan hidden `insight_harian` default), disconnect dialog
  - **CAPI** (`Code` icon): Meta Pixel & Conversions API configuration
  - Tab bar: segmented control (`bg-gray-100 dark:bg-slate-800 rounded-xl p-1`), active = white bg + emerald text + shadow, inactive = transparent + gray
- **TelegramConnectBanner** — CTA di dashboard home yang muncul hanya jika Telegram belum terhubung; tombol mengarah ke Settings > Telegram.
- **Menu Jadwal** — menu pertama di dashboard, membuka halaman publik agent (`/{slug}`) di tab baru dengan `ExternalLink` indicator
- **Statistik** — dashboard ringkasan data jamaah per tahun Hijriah:
  - Headline stats: Total Jamaah, Komisi Cair, Berangkat Segera, Jamaah Baru
  - Estimasi Komisi dengan 3-segment bar (Sudah Cair / Belum Cair / Potensi)
  - Chart: Komisi Cair per Bulan (BarChart) + Tren Jamaah Baru (AreaChart) — menggunakan Recharts
  - List: Berangkat Mendatang + Jamaah Belum Lunas (dengan modal detail)
  - Progress bar Status Pembayaran (lunas vs belum lunas)
  - Month-over-month comparison badges
  - Sync ulang data langsung dari halaman Statistik
  - **Tren Pendaftaran** (Admin only) — 12 section analytics: monthly growth, revenue, gender/age distribution, agent rankings, package popularity, lead time, conversion rates. Termasuk **Ranking Agent Haji** (`HajiAgentRankingSection`) di tab Tren Daftar dengan toggle Pendaftaran/Keberangkatan (default Pendaftaran) — mengkonsumsi `/api/laporan/tren-daftar/haji-years` + `/api/laporan/tren-daftar/haji-ranking`. Komponen reusable `AgentRankingList` di-extract untuk dipakai bersama list ranking umroh.
  - **Statistik Haji** lazy section (`StatistikHajiSection`) untuk ringkasan jamaah Haji per tahun
- Kalkulasi harga (hitung harga per tipe kamar + generate PDF quotation)
- Compare 2 paket side-by-side
- Meta CAPI config (Pixel ID, Access Token, event toggle) — auto-bypass login dari dashboard
  - **CAPI Event Log** — real-time event log viewer (pagination 20/page, filter by event type, auto-refresh 30s, status OK/Error, value in Rp format)
  - **CAPI Purchase Status** tracking — deduplication untuk Purchase events (dp/lunas status per jamaah)
  - **CAPI circuit breaker** — backend pause per-agent setelah 10 kegagalan Meta beruntun, cooldown 30 menit, untuk mencegah spam retry token/config yang rusak
- Admin: manage all agents (CRUD + agent approval pending/active/rejected)
- Jamaah management — 2 tab: **Umroh** (`/dashboard/jamaah/umroh`) dan **Haji** (`/dashboard/jamaah/haji`), plus sub-route `/dashboard/jamaah/daftar` untuk form pendaftaran
  - Tab Umroh: sync dari sistem internal legacy, filter, sort, pagination
    - Progressive sync: first 10 jamaah shown immediately, rest synced in background
    - Fetch range diperlebar 6 bulan sebelum awal tahun Hijriah untuk capture jamaah yang didaftarkan lebih awal
    - **Filter lanjutan** (panel expand/collapse beranimasi Framer Motion, easing `[0.22,1,0.36,1]` 0.28s): tahun Hijriah, status pembayaran (`belum_dp`/`belum_lunas`/`lunas`/`lebih_bayar`), window keberangkatan (30/60/90 hari/`departed`), dokumen (`paspor_missing`/`paspor_expiring`/`documents_incomplete`), perlengkapan (`equipment_pending`/`equipment_incomplete`), catatan (`has_notes`/`no_notes`), dan filter teks paket — menggantikan baris chip lama
    - Sort by nama, sisa pembayaran, berangkat terdekat, pendaftaran terbaru
    - Perlengkapan & dokumen tracking (batik, bergo, paspor, dll)
    - Catatan agent per jamaah (`notes`, `notes_updated_at`) dan tampilan diskon kantor/marketing dari AWAPI
    - **3-status pembayaran** dengan visual indicators:
      - **Belum Bayar** (bayar=0): avatar amber "?", amount amber, card tint amber tipis (`bg-amber-50/60`)
      - **Sudah DP** (bayar>0, sisa>0): avatar blue clock, amount blue, card normal
      - **Lunas** (sisa≤0): avatar green checkmark, "✓ Lunas" emerald, card normal
    - Expanded detail: progress bar + bayar/sisa warna mengikuti status (emerald/blue/amber). Persentase pembayaran di-**clamp 0–100** (`safeSisaForPct = Math.max(0, sisa)`) agar sisa negatif (lebih bayar) tidak merusak bar
    - **Surat Pernyataan viewer**: tombol "Surat Pernyataan" membuka modal fullscreen (`UmrohPernyataanViewer`) — render HTML cache via `/api/laporan/jamaah/doc-proxy`, zoom 1×–3× (step 0.25), "Unduh PDF", dan "Bagikan PDF" (native share di mobile). Marker `dokumen.pernyataan` durable lintas sync
    - Progressive sync menampilkan `totalSynced`/`initialCount`/`phase` secara incremental; label Phase 2: "Melengkapi dokumen & perlengkapan". Refresh merge `raw_data` (preserve `staf` legacy) lewat `mergeRefreshedJamaahItem`
    - **Defensive guard**: `filterSafeJamaahRows` — blokir ghost rows (`__name_` prefix) saat upsert ke Supabase
  - **Jamaah Baru / Umrah Self-Registration** (`/dashboard/jamaah/daftar`, via `UmrahRegisterPage.tsx`):
    - Scrape form HTML dari sistem internal (`GET /api/umrah/form-options`) — selects, inputs, textareas, hidden fields
    - **KTP OCR** inline (OpenAI Vision via `POST /api/umrah/ocr-ktp`) → auto-fill NIK, nama (split first/middle/last), tgl lahir, alamat
    - Auto-default: Jenis Daftar = "Jamaah Baru", Jenis Kelamin = Laki-laki, Pendamping = "Berangkat Sendiri", Pengalaman = "Belum Pernah", tgl_daftar = hari ini
    - Hidden fields auto-submit: `mahram=X`, `kondisi_jamaah=X`, `keterangan=X`, `tlp_pendaftar=1111111111`
    - **SearchableSelect** untuk options banyak (tgl berangkat, paket, marketing, koordinator) — built-in search + keyboard nav
    - **Dependent options**: pilih tgl berangkat → fetch `GET /api/umrah/dependent-options` → load paket, marketing, koordinator terkait
    - **`?idb=<id_umroh>` binding**: untuk family/group registration — auto-select parent's jadwal, pilih candidate jadwal yang sesuai dengan `paket` parent
    - Section layout: Info Pendaftaran → Data Jamaah → Alamat → Paket → Info Pendaftar → **Info Otomatis** (locked fields: Jenis Daftar, Marketing, Koordinator) → Lainnya
    - Dummy-fill buttons (emerald micro-buttons "Insert data dummy" untuk dev/testing)
    - File upload: file_ktp preview + preview modal sebelum submit
    - `POST /api/umrah/register` → submit ke legacy system dengan multipart form
  - **Magic Link generator** (per jamaah, agent-only): tombol di `JamaahPage`/`HajiPage` membuka `MagicLinkModal` (272 lines) → endpoint `POST /api/portal/jamaah/:slug/magic-link/generate` return URL + expires_at + anggota_count → distribusi WhatsApp/SMS/copy. Token disimpan di `jamaah_portal_tokens`, reuse jika masih valid
  - Tab Haji (`HajiPage.tsx`): sync AWAPI-first (`AWAPI_SYNC_ENABLED`), list jamaah haji; scraper legacy turun jadi scheduled enrichment terpisah dan bisa dimatikan via `DISABLE_LEGACY_BACKGROUND_SYNC`
    - Card collapsed: avatar (gender ring, lunas checkmark), nama, `{id_haji} • {paket}`, tahun masehi keberangkatan (orange bold)
    - Card expanded: detail grid (Thn Hijriyah, Jenis, Perwakilan, Marketing, Staff, Status Bayar), telp, alamat
    - **Filter lanjutan** (panel beranimasi sama seperti Umroh): tahun pendaftaran (`daftar_year`, dari range `tgl_daftar`), status bayar, dan filter teks paket
    - **Mata uang USD**: `paket_harga`/`bayar`/`sisa` diformat `formatUsd` (`USD {n.toLocaleString('id-ID')}`), bukan Rupiah
    - Action buttons (30/50/20): BPIH (blue), Pernyataan (violet), WhatsApp icon (emerald filled)
    - BPIH & Pernyataan → full-screen document viewer popup (iframe, framer-motion slide-up animation, native share)
    - URL routing: slug-based tab switching di Jamaah page
- **Kalender & Status Penerbangan** — mini calendar widget dan dashboard status penerbangan:
  - Calendar grid bulanan dengan colored dots (Manasik, Keberangkatan, Kepulangan)
  - Bottom sheet popup saat klik tanggal — detail group cards
  - Real-time flight tracking menggunakan AirLabs API (menggabungkan group/kloter dengan nomor penerbangan sama dalam 1 card `FlightStatusCard`)
  - **Flight Share**: Public share link per penerbangan (`/f/:code`) — hero card, peta rute (Leaflet), boarding pass, cuaca destinasi, agent CTA WhatsApp
  - Server-side OG injection untuk link preview: title "Lacak Penerbangan [maskapai] [kode] - [agent]", og:image per agent
  - **Penting:** Pengambilan data scraper (_jmodal.php_) untuk `event_type = perjalanan` field `.jam` adalah waktu *kedatangan (arrival)* di tanah air, bukan keberangkatan dari Saudi. Dashboard memodifikasi logic override dan cron hanya mengecek schedule aktif, serta mem-filter "landed" flight setelah beberapa jam untuk mencegah clutter.
- **Cuaca Widget** — compact weather widget di dashboard home:
  - Open-Meteo API untuk Mekah, Madinah, Jakarta, Surabaya
  - Pill cards: flag + kode mata uang + suhu + ikon cuaca
  - In-memory cache (30 menit TTL)
- **Birthday Widget** — kartu dashboard untuk jamaah yang ulang tahun hari ini sampai H+3:
  - Endpoint `/api/jamaah/birthdays` berbasis `agent_id`, timezone Asia/Jakarta, cache 10 menit + timeout fallback
  - Bottom sheet detail berisi pesan WhatsApp editable, toggle kartu ucapan, 2 template kartu 1080×1080 (Classic dan Islamic), export JPEG via `@zumer/snapdom`, download kartu, dan buka WhatsApp
  - `BirthdayListSheet` mengelompokkan jamaah ulang tahun per offset hari; Telegram digest harian jam 07:00 WIB tersedia opt-in via `notification_prefs.birthday_digest`
- **Kurs Mata Uang** — halaman kurs `/dashboard/ai-tools/kurs`:
  - Scrape dari sumber kurs, tampilkan sell rate USD & SAR
  - Compact widget di dashboard home
  - **Share Kurs** — tombol Share muncul untuk semua agent saat USD tersedia; membuka `ShareKursModal` (full-screen) dengan single Hero USD template 1400×1000 (16:10). File final Download/Share dibuat server-side on-demand via `/api/kurs/share-image`, cached sementara di `data/kurs-share-cache`, native share file-only, download, dan copy caption
- **Analytics** — event tracking dashboard (`/dashboard/analytics`):
  - Track page views, actions, conversions per agent
  - Chart tren harian/mingguan, agent activity, feature/action usage, health badge
  - Admin drill-down per agent (`AgentDrillDownModal`) berisi 7-day timeline, hourly heatmap, feature/action breakdown, funnel, dan recent events
  - Data raw disimpan di `analytics_events` selama 14 hari; `analytics_events_daily` menyimpan agregat harian untuk rentang lama
- **AI Insight** — alert bar + bottom sheet popup (OpenAI-generated):
  - 3 insight cards: Hari Ini, 7 Hari ke Depan, Cuaca Tanah Suci
  - Data cuaca Mekah/Madinah (suhu rata-rata per bulan dari temperatureData.ts)
  - Bahasa kasual & hangat (target: agen perempuan 40-50 tahun)
  - Auto-generate via cron setiap hari jam 06:15 WIB + setelah calendar sync pertama
  - In-memory cache + Supabase fallback
  - Bold markdown parsing (`**text**` → `<strong>`)
- **AI Tools** — Hub page (`/dashboard/ai-tools`) untuk fitur-fitur AI & tools lainnya:
  - **Brosur Jadwal** (`/dashboard/ai-tools/brosur-jadwal`, tool pertama di hub):
    - Generate brosur paket umroh per bulan dari `umroh_schedules` cache dan profil agent.
    - Endpoint `GET /api/ai-tools/brosur-jadwal-bulan` mengambil paket mendatang (default 24 bulan, query `monthsAhead` max 36), memilih harga termurah valid dengan prioritas `Quard → Triple → Double`, mengabaikan harga `Infant`, dan menandai sold out bila `seat_sisa <= 0`.
    - Preview/export memakai template fixed **1080×1620 (2:3)** (`BrochureScheduleTemplate`) dengan layout merah/gold Alhijaz, logo, badge "5 Pasti Umrah", tabel paket, hotel Mekkah/Madinah, harga jutaan, stamp `SOLD OUT`, dan footer agent.
    - Jika paket dalam 1 bulan lebih dari 10, frontend split otomatis menjadi beberapa gambar (`PACKAGES_PER_IMAGE=10`) agar tabel tetap terbaca.
    - **Filter berdasarkan** (Tipe Paket / Maskapai / Durasi) di header brosur. Tipe Paket `UMROH MUSIM DINGIN` menyaring paket yang berangkat di window **Desember–Januari** dan otomatis mengaktifkan **tema Winter "Musim Dingin"**.
    - **Tema Winter**: `BrochureScheduleTemplate` punya prop `variant: 'default' | 'winter'` (default `'default'`). `BrochureSchedulePage` set `variant='winter'` saat `filterDim==='tipe' && filterValue==='UMROH MUSIM DINGIN'`. Variant winter mengganti seluruh chrome merah/gold jadi palet biru es (navy/blue/frost), label brosur jadi "MUSIM DINGIN", plus dekorasi winter-only: 6 snowflake SVG (six-point star) + snow drift radial-gradient di dasar kanvas. (Tagline ribbon sempat dibuat lalu dibatalkan — tidak dirender.)
    - Export PNG via `modern-screenshot` (`domToCanvas`) dengan embedded font CSS, blank-canvas guard, dan cache blob per halaman. Tombol Download selalu tersedia; tombol Share muncul pada perangkat touch/native-share dan fallback ke download jika share file tidak didukung.
  - **Landing Page** (`/dashboard/ai-tools/landing-page`):
    - Segmented tab: **Umroh** (emerald accent) | **Haji** (amber accent) | **Bio** (teal accent). Tab Bio tersedia untuk agent/admin dan URL tab tersimpan di `/dashboard/ai-tools/landing-page/{umroh|haji|bio}`.
    - Kustomisasi per landing type: **Judul** (max 60 char + counter), **Deskripsi** (max 160 char + counter), **Gambar Pratinjau / OG Image** (1200×630 px, upload via PhotoCropModal, aspect rect)
    - **Pratinjau WhatsApp** card real-time (72×72 thumb + alhijaz.co + title + desc)
    - **DefaultOgPreview** synthetic fallback (gradient + agent photo + badge "JADWAL UMROH" / "HAJI PLUS RAHMAH & UHUD") jika `/og/{slug}.png` belum ada
    - URL bar dengan Copy + Open icon
    - Reset OG button (kembali ke `/og/{slug}.png` default) + Reset semua button
    - Toast notifications (fadeIn 150ms, success/error)
    - Auto-trigger OG regen (`triggerOgRegen`) + invalidate landing caches saat upload
    - **Bio editor** (`/dashboard/ai-tools/landing-page/bio`) — Link Bio editor dengan link publik `alhijaz.co/{slug}/bio`, one-time hint banner, 6 theme picker, Hero editor, SEO editor (`seo.title`, `seo.description`, `seo.og_image_url`), drag reorder, visibility toggle per tile, dan bottom bar fixed 2 tombol: Preview + Lihat Bio. Editor tidak menampilkan toggle Bio aktif/nonaktif; UI menormalkan Bio tetap aktif.
    - Bio tile types: `wa`, `umroh`, `umroh_landing`, `haji`, `featured`, `link`, `text`, `photo`, `testi`. Tile baru default menyimpan intent `visible: true`; backend tetap menerima autosave incomplete dengan config tersanitasi, sementara public tile component mengembalikan `null` sampai field wajib lengkap. Toggle visible dari hidden ke on tetap memvalidasi field wajib. Row menampilkan status `SIAP`, `TERSEMBUNYI`, `PERLU DILENGKAPI`, atau `ORPHAN`.
    - Bio preview: modal fullscreen dengan iframe public page di phone frame, di-scale 90% agar lebih banyak konten terlihat.
  - **Bandingkan Paket / Compare** (`/dashboard/ai-tools/compare`) — dipindahkan dari header publik ke AI Tools hub
  - **Voice Over Generator** (`/dashboard/ai-tools/voice-over`):
    - Step 1: Script — pilih paket (drop-down dari data-service) atau tulis manual, pilih durasi (10/20/30 detik), AI generate script via OpenAI GPT-4o-mini (bahasa santai/gaul, karakter dibatasi per durasi)
    - Step 2: Voice — pilih gender (Wanita/Pria) → pilih suara dari 8 voice Chirp3-HD (4 wanita: Dwi, Afaf, Misko, Nissa + 4 pria: Achmad, Sofyan, Rizky, Miko), 2-column grid layout
    - Step 3: Result — custom audio player (play/pause, progress bar, seek, time display), download MP3 langsung, download WAV (on-demand API call), auto-scroll ke hasil
    - Uses Google Cloud TTS API v1 (Chirp3-HD voices, `id-ID` language, speakingRate 1.1, headphone audio profile)
    - Credit system: 25K karakter/agent/bulan, stored in `ai_credits` table, auto-reset setiap 30 hari
    - Char limit: 1000 karakter per script
  - **Kurs Hari Ini** (`/dashboard/ai-tools/kurs`): Cek & hitung kurs valas USD/SAR
  - **Simulasi Haji Plus** (`/dashboard/ai-tools/haji-plus`): Buat penawaran untuk calon jamaah haji; default tab menampilkan kalkulator harga Haji Plus dengan export PNG dan share native.
  - **Simulasi Haji Plus** (`/dashboard/ai-tools/haji-plus/simulasi`): Kalkulator harga Haji Plus — pilih paket RAHMAH/UHUD, pilih tipe kamar Double/Triple/Quad (default Quad), DP $4,500/orang, pilih tahun keberangkatan **2036–2041** (default 2036), pelunasan 6 bulan sebelum berangkat, proyeksi inflasi 1.5%/tahun (harga dasar aktual Mei 2026), export PNG + share via native share.
  - **Kartu Nama Digital** (`/dashboard/ai-tools/business-card`): generator sudah tersedia di route langsung, tetapi kartu hub masih `Segera Hadir`/disabled. Mendukung 5 desain, format landscape/portrait, QR code ke link agent, export PNG resolusi tinggi via `@zumer/snapdom`, dan native share file-only.

### Fitur Infrastruktur
- **Tanya AI (public)** — `POST /api/ask-ai/:slug/:jadwalId` (no auth, CORS-enabled):
  - OpenAI GPT-4o-mini dengan system prompt khusus (~4KB): tone hangat (sapa "Kak"), ban filler starters ("Nih,", "Nah," "Oke,"), konsultan terminology, markdown `**bold**` / `*italic*` / `__underline__`
  - Hard-coded product knowledge: DP Rp 5 juta, pelunasan max 30 hari, AMITRA cicilan syariah, Saudia bagasi 2×23kg (lain 30kg), Zurich Syariah asuransi, visa diurus tim, manasik 2-3 minggu sebelum
  - Per-IP rate limit 10 req/60s (in-memory `askAiRateLimitMap`)
  - Cache 7-hari (Supabase `ask_ai_cache` table, unique `jadwal_id` + `agent_id` + `question_hash`)
  - Builds context dari package data (`fetchAskAiPackage`), hotel proximity, cached itinerary (`getItineraryContext`)
  - Attachment auto-trigger: "brosur" / "itinerary" jika ada `pkg.brosur_cdn` / `pkg.itinerary_cdn`
  - Analytics: `trackPublicEvent` (`ask_ai_opened`, `ask_ai_chip_tapped`, `ask_ai_free_query`, `ask_ai_wa_clicked`)
- AI Copywriting (OpenAI proxy — generate caption WhatsApp)
- Telegram Notifier (node-cron based, runs inside Express process):
  - **Group chat** (TELEGRAM_CHAT_ID): real-time alerts (seat/price), daily briefing, weekly summary, hot deals, AI insights
  - **Per-agent DM** (telegram_chat_id): departure reminders conversational
    - Pagi (07:00 WIB): semua milestone H-14/H-7/H-3/H-1 dalam 1 pesan, progressive detail
    - Sore (17:00 WIB): H-1 only, urgent reminder
    - Anti-duplikat via state keys per agent per hari
  - **Pembayaran masuk** detection: saat sync jamaah, bandingkan `bayar` before vs after → pisahkan event `pembayaran_cicilan` dan `pembayaran_pelunasan` untuk notifikasi agent
  - **Birthday digest**: opt-in digest harian jam 07:00 WIB untuk jamaah yang ulang tahun hari ini, dengan inline keyboard WhatsApp
  - **Passport reminder** (`passportReminder`, **09:30 WIB**): jamaah berangkat ≤30 hari yang paspornya belum kumpul ATAU expired sebelum berangkat. Paspor dianggap collected jika `dokumen.paspor === true` ATAU `no_paspor` sudah terisi. Per-agent, gated `notification_prefs.paspor`, anti-duplikat via state key `paspor_{slug}_{today}`
  - **Notification preferences**: per-agent toggle/default (`jamaah_baru`, `departure`, `paspor`, `pelunasan`, `perlengkapan`, `manasik`, `birthday_digest`, `seat_alert`, `paket_baru`, `perubahan_harga`, `pembayaran_cicilan`, `pembayaran_pelunasan`, `ringkasan_mingguan`, `flight_status`, `kurs_dollar`; backend compatibility juga menyimpan `pembayaran_masuk` dan hidden default `insight_harian`). Disimpan di `agents.notification_prefs` (JSONB)
  - Deep link connect: agent klik tombol di dashboard → Telegram bot auto-link chat_id
  - Concurrency protection: `isCheckRunning` flag prevents overlapping `checkAndNotify` cycles
- AWAPI official sync path: jika `AWAPI_SYNC_ENABLED=true` dan agent punya `awapi_key`, sync umroh & haji memakai Alhijaz Official API (`awapi-client.js`).
  - **Trigger**: (a) **manual** — `POST /api/laporan/sync` (umroh, → `syncUmrahViaApiCore`) & `POST /api/haji/sync` (haji, → `syncHajiViaApiCore`), keduanya `authMiddleware`; (b) **background** terjadwal (lihat "Background sync jamaah" di bawah). Mutex `syncingAgents` cegah sync ganda untuk agent yang sama.
  - **Asimetri fallback**: umroh manual — bila AWAPI throw (`hardfail`), otomatis **fallback ke legacy scrape** (retry penuh). Umroh background hanya fallback bila `DISABLE_LEGACY_BACKGROUND_SYNC` tidak aktif; production default 2026-06-03 menonaktifkan fallback legacy background. Haji — **tidak ada fallback**: error cukup di-log, siklus berikutnya coba lagi; pengayaan field legacy haji hanya jalan jika legacy background scheduler aktif.
  - **Outcome classifier** (`lib/awapi-sync-outcome.js` → `classifyAwapiSyncOutcome`): hasil sync dipetakan ke `full` / `partial` / `hardfail`. Hanya `hardfail` (upsert gagal, atau fetch gagal & tidak ada row sama sekali) yang throw → trigger fallback legacy scrape. **Fix A (2026-05-31)**: `partial` (sebagian endpoint gagal tapi ada row) TIDAK fallback ke legacy lagi — supaya label "last sync" tetap di-bump (`last_jamaah_sync_at`) dan tidak ada flap notif. Notifikasi + CAPI + cleanup hanya jalan saat `full`. Manual sync response & background log kini menyertakan flag `partial`/`status`. Diterapkan ke umroh (`syncUmrahViaApiCore`) dan haji (`syncHajiViaApiCore`).
  - **Payment provenance guard** (`lib/jamaah-payment-provenance.js`): setelah sync AWAPI pertama, kolom legacy (`bayar`/`sisa`/`diskon_kantor`/`diskon_marketing`) tidak boleh menimpa data AWAPI. Setiap row di-stamp `payment_source` (`awapi`|`legacy`) + `payment_synced_at` di `raw_data`; Phase 2 enrichment legacy jadi payment-free.
  - **Phase 1 enrichment preservation** (`lib/jamaah-phase1-enrichment.js`): data input user (`wa`, `tgl_lahir`, `no_paspor`, `paspor_expired`, `perlengkapan`, `dokumen`) di-preserve lintas sync agar tidak hilang saat row API menimpa. Guard tambahan: kalau parse `tgl_berangkat` baru gagal (`null`), pertahankan tanggal + `hijriah_year` lama (jangan timpa dengan nilai salah).
  - **Endpoint & klasifikasi tahun**: umroh ambil keberangkatan `/bh/{tahunH}` + pendaftaran `/dh/{tahunH}` (berbasis Hijriah); haji ambil keberangkatan `/bm/{tahunMasehi}` + pendaftaran `/dh/{tahunH}` (keberangkatan pakai Masehi karena trip lintas tahun kalender). Untuk umroh, `hijriah_year` **dihitung** dari `tgl_berangkat` via `getHijriahYear()` + tabel `HIJRIAH_RANGES` (mis. 1447 = 2025-06-26…2026-06-15, 1448 = 2026-06-16…2027-06-05); haji memakai `thn_hijriyah` langsung dari API.
  - **Fix parser bulan Indonesia** (`be6efc6`, 2026-06-01): jalur fallback legacy scrape dulu pakai peta bulan English-only dengan fallback `|| '01'`, sehingga token "Des"/"Desember" diam-diam jadi Januari → `tgl_berangkat` rusak (`2026-12-xx` → `2026-01-xx`) dan jamaah musim dingin (1448) salah masuk 1447. Diperbaiki via `lib/legacy-date-parse.js` (`parseLegacyDmyDate` + `MONTH_TOKEN_MAP` ID+EN, fail-safe `null`, tak pernah mengarang Januari), dipakai di `fetchUmrahBookings` & `fetchUmrahDetail`. Jalur AWAPI tidak terdampak (tanggal sudah ter-format dari API). Data lama diperbaiki via `scripts/repair-dec-tgl-berangkat.mjs` (sumber kebenaran `raw_data`, tak ditimpa).
  - **Surat pernyataan cache** (`lib/jamaah-document-cache.js` + tabel `jamaah_document_cache`): HTML surat pernyataan AWAPI di-cache (SHA256 dedup) dan disajikan via proxy ter-auth `GET /api/laporan/jamaah/doc-proxy` (format `html`|`pdf`, A4 print-ready, `Cache-Control: no-store`). Marker `dokumen.pernyataan` durable lintas sync (`mergeUmrohDokumen`).
  - **Jalur legacy scrape (fallback umroh, 2 fase)**: Fase 1 `fetchUmrahBookings` (`laporan-api.js`) — scan cepat daftar booking (id_umroh, tgl_daftar, tgl_berangkat, paket, bayar); Fase 2 `fetchUmrahDetail` — detail per jamaah (jm_id, nama, jk, bayar, sisa, diskon, tgl_berangkat). Keduanya parse tanggal via `parseLegacyDmyDate` (lihat fix bulan Indonesia). Sebelum upsert, `mergeExistingUmrohPhase1Enrichment` menjaga data input user, lalu `prepareLegacyPaymentRowsForUpsert` melucuti kolom payment bila row eksisting bersumber AWAPI.
  - **raw_data = sumber kebenaran**: untuk row AWAPI, `raw_data` menyimpan payload mentah + provenance dan **tak pernah ditimpa** oleh jalur legacy → bisa dipakai merekonstruksi kolom turunan (mis. perbaikan `tgl_berangkat`). Conflict target upsert: umroh `agent_id,id_umroh,jm_id`; haji `agent_id,id_haji,id_jamaah`.
  - **Cleanup guard** (`lib/sync-cleanup.js` → `computeSafeDeletions`): penghapusan row jamaah yang hilang dari sumber hanya dijalankan saat sync `full` (bukan `partial`), dan hanya bila daftar terbukti lengkap — cegah jamaah terhapus karena fetch sebagian. CAPI Purchase juga hanya di-fire saat `full`.
- **Background jobs gating** (`lib/background-jobs.js`): cron kurs & init Telegram notifier hanya jalan kalau `shouldRunBackgroundJobs()` true — default production, atau dev/test yang set `ENABLE_BACKGROUND_JOBS=true`. Jamaah sync punya kill switch terpisah: `DISABLE_JAMAAH_BACKGROUND_SYNC=true` mematikan semua loop jamaah otomatis (AWAPI + legacy) tanpa mematikan notifier/cron lain; `DISABLE_LEGACY_BACKGROUND_SYNC=true` mematikan fallback/enrichment legacy otomatis.
- Background sync jamaah (semua agent AWAPI-enabled, chain-scheduled — siklus berikutnya mulai setelah yang sebelumnya selesai): umroh AWAPI **default production 60 menit** (`SYNC_COOLDOWN_MS` via `parseSyncCooldownMs`, override env `SYNC_COOLDOWN_MINUTES`; mulai 30 dtk setelah boot via `runSyncCycleLoop`, dengan guard anti restart-storm yang menunda siklus pertama bila baru saja sync — state di `data/sync-state.json`), haji AWAPI **default production 60 menit** (`HAJI_AWAPI_SYNC_COOLDOWN_MINUTES`; first cycle juga ditunda sesuai cooldown, bukan 90 dtk setelah boot), legacy background/fallback/enrichment otomatis bisa dimatikan via `DISABLE_LEGACY_BACKGROUND_SYNC=true`. Cooldown AWAPI dulu hardcoded 10 mnt lalu 30 mnt; dinaikkan ke 60 mnt karena full-fleet jamaah sync bisa menguras/menekan Disk IO budget Supabase (insiden 2026-06-01/2026-06-03).
- Calendar sync (scrape FullCalendar dari internal system, setiap 12 jam via `setInterval`)
  - Login ke internal system → fetch halaman Beranda → parse FullCalendar events JSON
  - Fetch detail popup via `_jmodal.php` per event → parse HTML table (group, pesawat, jam, paket, PAX, staff, TL)
  - Upsert ke `calendar_events` table
- AI Calendar Insight (OpenAI `gpt-4o-mini`):
  - Generate via cron harian (06:15 WIB) + setelah first calendar sync jika cache kosong
  - Prompt includes calendar events + Mekah/Madinah temperature data
  - 3 fields: `today`, `weekly`, `cuaca`
  - Cache: in-memory + Supabase `calendar_insights` table
- Sentry error tracking (`@sentry/node` + `instrument.mjs`): automatic Express error capture, runs before all imports
- Agent photo storage: Supabase Storage bucket `agent-photos` (migrated from local `/public/agents/`)
- GitHub webhook auto-deploy (webhook → pull → build → restart)
- Supabase keep-alive (ping setiap 3 hari, cegah free-tier pause)
- OG image generation per agent
- Stale-while-revalidate data caching (localStorage, 3 jam TTL)
- Auto-refresh paket data dari API setiap 1 jam (silent background)

## 6. Data Model / Schema

### Tabel `agents`
```
id                UUID PRIMARY KEY    -- migrated from slug (commit 9c614a6); canonical agent identity
slug              TEXT UNIQUE NOT NULL -- "nikita", "andra", dll (lowercase); used in URLs/JWT
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
notification_prefs JSONB              -- Per-agent notification preferences (15 UI toggles + compatibility/backend defaults)
pin_hash          TEXT                -- bcrypt-hashed 6-digit PIN (optional, untuk gate Statistik/komisi)
card_variant      TEXT DEFAULT 'default' -- PackageCard layout: default/split/spotlight/ticket/tiled/magazine
awapi_code        TEXT                -- kode Alhijaz Official API per agent
awapi_key         TEXT                -- x-api-key untuk AWAPI (server-only)
last_jamaah_sync_at TIMESTAMPTZ       -- sync umroh terakhir
last_jamaah_haji_sync_at TIMESTAMPTZ  -- sync haji terakhir
landing_config    JSONB DEFAULT '{}'  -- Per-agent landing page customization: { umroh: {title, description, og_image_url}, haji: {...} }
bio_config        JSONB DEFAULT '{}'  -- Per-agent Link Bio config: { theme, enabled, hero, seo, tiles[] }
status            TEXT DEFAULT 'active' -- "pending" | "active" | "rejected" (CHECK constraint)
registered_at     TIMESTAMPTZ        -- timestamp pendaftaran (self-registration)
-- UNIQUE INDEX on email (WHERE email IS NOT NULL AND email != '')
```

### JSONB `agents.bio_config`
Konfigurasi Link Bio publik untuk `/:slug/bio`. Disimpan di kolom agent agar tidak perlu tabel baru.
```
theme       string       -- emerald | desert | midnight | rosegold | sunset | mono
enabled     boolean      -- editor menormalkan true; public API tetap returns 404 jika false dari config lama/manual untuk non-owner/non-admin
hero        object       -- { tagline, badges[0..3], socials: { instagram, tiktok, youtube } }
seo         object       -- { title, description, og_image_url }
tiles       array        -- ordered tile list: { id, type, visible, order, config, orphaned? runtime only }
```

Tile types:
- `wa`, `umroh` (Jadwal — list semua jadwal paket), `umroh_landing` (link ke `/:slug/umroh`), `haji` (link ke `/:slug/haji`) are system tiles.
- `featured` links to one `umroh_schedules.jadwal_id` preview.
- `link`, `text`, `photo`, `testi` are custom content tiles.

Backend accepts incomplete visible tiles during autosave by sanitizing config with hidden-draft rules, then preserves the stored `visible` intent. Public Bio filters to `visible && !orphaned`, and custom tile components must still return `null` when required props are missing.

### Tabel `agent_slug_history`
Tracks past slugs untuk backward-compat JWT resolution setelah agent rename slug.
```
agent_id      UUID NOT NULL        -- FK to agents.id
old_slug      TEXT NOT NULL        -- slug sebelum diubah
changed_at    TIMESTAMPTZ DEFAULT NOW()
-- Digunakan di authMiddleware: jika decoded.slug tidak ditemukan di agents, cek history → resolve ke agent_id
```

### Tabel `capi_configs`
```
agent_id          UUID PRIMARY KEY    -- FK to agents.id (migrated from slug FK)
pixel_id          TEXT               -- Meta Pixel ID
access_token      TEXT               -- AES-256-GCM encrypted
test_event_code   TEXT               -- Meta test event code
test_mode         BOOLEAN            -- true/false
events            JSONB              -- { contact: { enabled, eventName, ... }, ... }
updated_at        TIMESTAMPTZ
```

### Tabel `jamaah`
```
agent_id      UUID NOT NULL      -- FK to agents.id (ON DELETE CASCADE)
id_umroh      TEXT               -- e.g. "AIW0025094" (composite key part)
jm_id         TEXT               -- legacy jamaah/member id, e.g. "JM..." (composite key part)
nama          TEXT               -- nama jamaah
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
diskon_kantor BIGINT             -- potongan kantor dari AWAPI
diskon_marketing BIGINT          -- potongan marketing/agent dari AWAPI; mengurangi komisi net agent
notes         TEXT               -- catatan agent untuk jamaah
notes_updated_at TIMESTAMPTZ     -- timestamp update catatan
raw_data      JSONB              -- metadata parsing (jm_id, cols_count)
capi_purchase_status TEXT         -- "dp" | "lunas" (CAPI Purchase event dedup)
synced_at     TIMESTAMPTZ        -- kapan terakhir di-sync
-- UNIQUE(agent_id, id_umroh, jm_id)
-- Indexes: agent_id, agent_id+tgl_lahir, agent_id+tgl_berangkat
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
jam_kumpul    TEXT                 -- waktu kumpul (enriched dari PDF itinerary)
titik_kumpul  TEXT                 -- titik kumpul / gathering point (enriched dari PDF itinerary)
synced_at     TIMESTAMPTZ          -- terakhir sync
-- Indexes: event_date, event_type
```

### Tabel `calendar_insights`
```
id            TEXT PRIMARY KEY     -- "latest" untuk AI Insight, "airlabs_quota" untuk counter kuota bulanan
data          JSONB NOT NULL       -- payload insight {today, weekly, cuaca, dateFor, generatedAt} atau quota {count, month}
generated_at  TIMESTAMPTZ          -- timestamp generation untuk row insight utama
updated_at    TIMESTAMPTZ          -- opsional, tergantung migrasi/manual DDL
```

Dipakai sebagai persistent fallback untuk `CalendarInsight`, source Telegram AI insight harian, dan penyimpanan counter kuota AirLabs agar tidak reset saat proses Express restart.

### Tabel `jamaah_haji`
```
agent_id             UUID NOT NULL     -- FK to agents.id (ON DELETE CASCADE)
id_haji              TEXT              -- ID haji dari legacy system
id_jamaah            TEXT              -- ID jamaah
nama                 TEXT              -- nama jamaah
jk                   TEXT              -- "L" / "P"
alamat               TEXT              -- alamat
telp                 TEXT              -- nomor telepon
thn_hijriyah         TEXT              -- tahun Hijriah keberangkatan
thn_masehi           TEXT              -- tahun Masehi keberangkatan
perwakilan           TEXT              -- kantor perwakilan
marketing            TEXT              -- nama marketing
paket                TEXT              -- jenis paket haji
staff                TEXT              -- nama staff
jenis                TEXT              -- jenis haji (reguler/plus/dll)
status_bayar         TEXT              -- status pembayaran
status_berangkat     TEXT              -- status keberangkatan
bpih_url             TEXT              -- URL dokumen BPIH
surat_pernyataan_url TEXT              -- URL surat pernyataan
capi_purchase_status TEXT              -- "dp" | "lunas" (CAPI Purchase event dedup)
notes                TEXT              -- catatan agent untuk jamaah haji
notes_updated_at     TIMESTAMPTZ       -- timestamp update catatan
-- AWAPI sync enrichment (migration 20260520000000_haji_awapi_columns.sql):
nomor_porsi          TEXT              -- nomor porsi haji
nomor_spph           TEXT              -- nomor SPPH
no_paspor            TEXT              -- nomor paspor
paspor_expired       TEXT              -- tanggal expired paspor
paket_harga          BIGINT            -- harga paket dari AWAPI
diskon_marketing     BIGINT            -- diskon marketing (mengurangi komisi net agent)
diskon_kantor        BIGINT            -- diskon kantor
bayar                BIGINT            -- jumlah sudah dibayar
sisa                 BIGINT            -- sisa pembayaran
tgl_lahir            DATE              -- tanggal lahir
tgl_daftar           DATE              -- tanggal pendaftaran
tgl_berangkat        DATE              -- tanggal keberangkatan (lebih granular dari thn_masehi)
dokumen              JSONB             -- dokumen checklist
synced_at            TIMESTAMPTZ DEFAULT NOW()
-- UNIQUE(agent_id, id_haji, id_jamaah)
-- Composite indexes: (agent_id, tgl_daftar), (agent_id, tgl_berangkat), (agent_id, tgl_lahir)
```

### Tabel `flight_status`
```
id            TEXT PRIMARY KEY       -- "{event_date}_{flight_iata}" e.g. "2026-05-02_SV827"
event_date    DATE NOT NULL          -- tanggal event/penerbangan
flight_iata   TEXT NOT NULL        -- "GA961", "SV827"
airline_name  TEXT                 -- "Garuda Indonesia"
airline_iata  TEXT                 -- kode maskapai
airline_logo  TEXT                 -- logo maskapai
group_number  TEXT                 -- group/kloter terkait
dep_iata      TEXT                 -- "CGK"
dep_city      TEXT
dep_terminal  TEXT
dep_gate      TEXT
arr_iata      TEXT                 -- "JED"
arr_city      TEXT
arr_terminal  TEXT
arr_gate      TEXT
dep_scheduled TIMESTAMPTZ          -- jadwal berangkat
arr_scheduled TIMESTAMPTZ          -- jadwal tiba
dep_actual    TIMESTAMPTZ          -- aktual berangkat
arr_estimated TIMESTAMPTZ          -- estimasi tiba dari AirLabs
status        TEXT                 -- "scheduled" | "en-route" | "landed" | "delayed" | "cancelled"
progress      INTEGER              -- 0-100%
pax           INTEGER DEFAULT 0    -- total pax/group
tour_leader   TEXT
lat/lng       DOUBLE PRECISION     -- posisi live jika tersedia
alt           DOUBLE PRECISION     -- altitude (feet)
speed         DOUBLE PRECISION     -- kecepatan
direction     DOUBLE PRECISION     -- heading
delayed       INTEGER DEFAULT 0    -- menit delay
raw_api       JSONB                -- payload mentah AirLabs
synced_at     TIMESTAMPTZ          -- terakhir update dari AirLabs
created_at    TIMESTAMPTZ
```

### Tabel `flight_shares`
```
code          TEXT PRIMARY KEY     -- random 8-char code (e.g. "bz1LvzJg")
agent_id      UUID NOT NULL        -- FK to agents.id (ON DELETE CASCADE)
flight_number TEXT NOT NULL        -- "GA 961"
flight_date   DATE NOT NULL        -- tanggal penerbangan
dep_iata      TEXT NOT NULL        -- "CGK"
arr_iata      TEXT NOT NULL        -- "JED"
dep_city      TEXT                 -- "Jakarta"
arr_city      TEXT                 -- "Jeddah"
dep_time      TEXT                 -- "06:30"
arr_time      TEXT                 -- "12:15"
duration      TEXT                 -- "9 jam"
group_number  TEXT                 -- "168"
pax           INTEGER              -- jumlah pax
tour_leader   TEXT                 -- nama tour leader
airline_code  TEXT                 -- "GA", "SV"
flight_status TEXT DEFAULT 'scheduled' -- status penerbangan
created_at    TIMESTAMPTZ          -- waktu dibuat
-- UNIQUE(agent_id, flight_number, flight_date)
```

### Tabel `itineraries`
```
jadwal_id     TEXT PRIMARY KEY     -- ID paket jadwal
content       JSONB                -- Parsed itinerary content (AI-extracted)
created_at    TIMESTAMPTZ          -- waktu di-parse
```

### Tabel `analytics_events`
```
id            SERIAL PRIMARY KEY
agent_id      UUID                 -- FK to agents.id; nullable untuk preserve history saat agent dihapus
event_type    TEXT                 -- "login" | "feature" | "action" | "public"
event_name    TEXT                 -- nama event
metadata      JSONB                -- metadata event
ip            TEXT                 -- IP client (server-side log helper)
user_agent    TEXT                 -- user agent client
created_at    TIMESTAMPTZ          -- waktu event
-- Raw retention: 14 hari; data lama dibaca dari analytics_events_daily
```

### Tabel `analytics_events_daily`
```
date        DATE NOT NULL        -- hari (YYYY-MM-DD)
agent_id    UUID NOT NULL        -- FK to agents.id; '00000000-...-000' utk anonymous (login_failed no-agent)
event_type  TEXT NOT NULL        -- sama seperti analytics_events.event_type
event_name  TEXT NOT NULL        -- sama seperti analytics_events.event_name
count       INTEGER NOT NULL     -- jumlah event untuk kombinasi (date, agent_id, event_type, event_name)
updated_at  TIMESTAMPTZ          -- waktu agregat terakhir di-upsert
-- PRIMARY KEY (date, agent_id, event_type, event_name)
-- Index: idx_analytics_daily_date ON (date DESC)
-- Index: idx_analytics_daily_agent ON (agent_id, date DESC)
-- Populated by: cron 02:00 WIB (runAnalyticsMaintenance)
```

### Tabel `haji_plus_stats`
```
id            TEXT PRIMARY KEY     -- "current"
data          JSONB                -- [{ year: 2020, pax: 482 }, ...]
synced_at     TIMESTAMPTZ          -- terakhir sync
```

### Tabel `ai_credits`
```
agent_id      UUID PRIMARY KEY     -- FK to agents.id (ON DELETE CASCADE)
chars_used    INTEGER DEFAULT 0    -- karakter TTS yang sudah dipakai
first_used_at TIMESTAMPTZ          -- timestamp pertama kali pakai (reset setelah 30 hari)
created_at    TIMESTAMPTZ          -- record creation time
```

### Tabel `capi_event_logs`
```
id            BIGSERIAL PRIMARY KEY
agent_id      UUID NOT NULL        -- FK to agents (UUID)
event_name    TEXT NOT NULL        -- "Purchase", "Contact", "PageView", "Search", "ViewContent"
status        TEXT NOT NULL        -- "success" | "error"
value         BIGINT               -- value event dalam Rupiah (opsional)
error_message TEXT                 -- pesan error jika gagal
source        TEXT NOT NULL DEFAULT 'browser' -- "browser" | "sync"
created_at    TIMESTAMPTZ DEFAULT now()
-- Index: idx_capi_event_logs_agent ON (agent_id, created_at DESC)
-- Auto-cleanup: 14-day raw retention via runAnalyticsMaintenance
```

### Tabel `umroh_schedules`
```
jadwal_id                    TEXT NOT NULL     -- ID jadwal paket (PK part)
year_code                    TEXT NOT NULL     -- kode tahun (PK part)
jadwal_nama                  TEXT NOT NULL     -- nama paket
promo                        TEXT DEFAULT '0'  -- flag promo
seat_total                   TEXT DEFAULT '0'  -- total seat
seat_sisa                    TEXT DEFAULT '0'  -- sisa seat
maskapai                     TEXT              -- nama maskapai
berangkat_tgl                DATE              -- tanggal keberangkatan
berangkat_jam                TEXT              -- jam keberangkatan
berangkat_rute               TEXT              -- rute keberangkatan
berangkat_kode_penerbangan   TEXT              -- kode penerbangan berangkat
pulang_tgl                   DATE              -- tanggal kepulangan
pulang_jam                   TEXT              -- jam kepulangan
pulang_rute                  TEXT              -- rute kepulangan
pulang_kode_penerbangan      TEXT              -- kode penerbangan pulang
manasik_tgl                  TEXT              -- tanggal manasik
manasik_jam                  TEXT              -- jam manasik
brosur                       TEXT              -- URL brosur (legacy)
itinerary                    TEXT              -- URL itinerary (legacy)
perlengkapan_harga           TEXT              -- harga perlengkapan
paket_harga                  JSONB             -- harga per tipe kamar
paket_hotel                  JSONB             -- info hotel per tier
brosur_cdn                   TEXT              -- URL brosur CDN
itinerary_cdn                TEXT              -- URL itinerary CDN
-- CDN fingerprints (migration 20260522000000_umroh_schedule_cdn_fingerprints.sql):
brosur_sha256                TEXT              -- SHA256 brosur source untuk cache-bust detection
brosur_bytes                 BIGINT            -- ukuran bytes brosur
brosur_content_type          TEXT              -- MIME type brosur
brosur_synced_at             TIMESTAMPTZ       -- timestamp upload terakhir ke Bunny CDN
itinerary_sha256             TEXT              -- SHA256 itinerary source
itinerary_bytes              BIGINT            -- ukuran bytes itinerary
itinerary_content_type       TEXT              -- MIME type itinerary
itinerary_synced_at          TIMESTAMPTZ       -- timestamp upload terakhir ke Bunny CDN
synced_at                    TIMESTAMPTZ DEFAULT NOW()
-- PRIMARY KEY (jadwal_id, year_code)
-- Indexes: year_code, berangkat_tgl
```

### Tabel `kurs_cache`
```
id            TEXT PRIMARY KEY     -- "mandiri"
data          JSONB                -- { rates: { USD: number, SAR: number, ... }, updatedAt: string }
synced_at     TIMESTAMPTZ          -- terakhir sync
```

### Tabel `ask_ai_cache`
Cache untuk fitur **Tanya AI** (Diskusi button pada PackageCard public).
```
id              BIGSERIAL PRIMARY KEY
jadwal_id       TEXT NOT NULL     -- ID paket jadwal
agent_id        UUID NOT NULL     -- FK to agents.id (scope cache per agent)
question_hash   TEXT NOT NULL     -- SHA-256 hash dari pertanyaan (lowercase, trim)
question        TEXT NOT NULL     -- pertanyaan original user (<=500 char)
answer          TEXT NOT NULL     -- jawaban AI (max 120 words, markdown styling)
note            TEXT              -- WA nudge text (<=200 char)
attachment_type TEXT              -- "brosur" | "itinerary" | null
created_at      TIMESTAMPTZ DEFAULT NOW()
-- UNIQUE(agent_id, jadwal_id, question_hash)
-- Index: idx_ask_ai_cache_lookup ON (agent_id, jadwal_id, question_hash)
-- Index: idx_ask_ai_cache_created ON (created_at)
-- TTL: 7 hari (enforced at query time via `created_at >= now() - 7 days` filter)
```

### Tabel `jamaah_portal_tokens`
One-time magic link tokens untuk Portal Jamaah (`/:slug/jamaah`). RLS-protected.
```
token             TEXT PRIMARY KEY   -- 5-char alphanumeric (regex /^(?=.*[a-z])(?=.*[2-9])[a-z2-9]{5}$/i)
agent_id          UUID NOT NULL      -- FK to agents.id (CASCADE)
id_umroh          TEXT NOT NULL      -- ID booking umroh
jamaah_id         TEXT               -- ID jamaah utama (head of group)
phone_e164        TEXT               -- nomor WA tujuan magic link
issued_by         TEXT               -- "agent" | "self_service"
issued_at         TIMESTAMPTZ DEFAULT NOW()
consumed_at       TIMESTAMPTZ        -- timestamp first consume (null = belum dipakai)
consumed_session_id UUID             -- FK ke jamaah_portal_sessions
expires_at        TIMESTAMPTZ        -- TTL token
meta              JSONB              -- metadata distribusi (channel, source, etc.)
-- Index: (agent_id, id_umroh), (phone_e164)
```

### Tabel `jamaah_portal_sessions`
Multi-user session untuk Portal Jamaah (cookie `jamaah_session`).
```
id              UUID PRIMARY KEY     -- session id (random UUID)
token           TEXT                 -- FK to jamaah_portal_tokens.token
agent_id        UUID NOT NULL        -- FK to agents.id (CASCADE)
id_umroh        TEXT NOT NULL        -- booking scope
created_at      TIMESTAMPTZ DEFAULT NOW()
last_seen_at    TIMESTAMPTZ          -- aktivitas terakhir (touched on /me, /persiapan, etc.)
expires_at      TIMESTAMPTZ          -- cookie TTL
user_agent      TEXT                 -- browser fingerprint untuk audit
ip              TEXT
-- Index: (agent_id, id_umroh), (last_seen_at)
```

### Tabel `booking_persiapan`
Per-booking preparation checklist (JSONB) untuk Portal Jamaah.
```
agent_id        UUID NOT NULL        -- FK to agents.id (CASCADE)
id_umroh        TEXT NOT NULL        -- ID booking umroh
data            JSONB                -- { tahapan: [{ id, label, done }], spiritual: [{ id, label, done, substeps[] }] }
updated_at      TIMESTAMPTZ DEFAULT NOW()
-- PRIMARY KEY (agent_id, id_umroh)
```

### Data Paket Umroh (External API)
Sumber kebenaran paket tetap external API `https://jadwal.alhijaz.co/jadwal/api-get/{yearCode}`. SPA public mengambil data via proxy dan cache browser (localStorage), sementara server juga menyimpan cache operasional di `umroh_schedules` untuk fitur yang butuh query server-side seperti Link Bio featured package, Tanya AI context, dan Brosur Jadwal. Lihat `UmrohPackage` type di `src/types/umroh-package.ts`.

**Lama Perjalanan / Duration Calculation:** Khusus untuk paket Extended/Plus (mis. Turki, Kairo), kalkulasi durasi tidak bisa mengandalkan selisih `keberangkatan.tgl` dan `kepulangan.tgl` (karena tanggal tersebut hanya mencakup leg penerbangan ke/dari Saudi). Referensi durasi paling akurat adalah nama paket itu sendiri (e.g., "PLUS TURKEY 15HR"), dan `calculateDuration()` di `data-service.ts` memprioritaskan regex extract dari `pkg.nama`.

## 7. API & Endpoints

**Base URL**: `http://localhost:3000` (production langsung ke server)

### Auth
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| POST | `/api/auth/login` | — | Login, return JWT + user data |
| GET | `/api/auth/me` | Bearer | Get current user data |
| POST | `/api/auth/forgot-password` | — | Send password reset email via Resend |
| POST | `/api/auth/reset-password` | — | Verify reset token + update password |
| GET | `/api/auth/pin-status` | Bearer | Check if PIN is set (returns hasPIN boolean) |
| POST | `/api/auth/set-pin` | Bearer | Create/update 6-digit PIN (bcrypt, requires current PIN if already set) |
| POST | `/api/auth/verify-pin` | Bearer | Verify PIN (5 attempts max, 15min lockout) |
| POST | `/api/auth/pin-reset-request` | Bearer | Request PIN reset via email OTP |
| POST | `/api/auth/pin-reset-verify` | Bearer | Verify OTP and reset PIN to null |
| POST | `/api/auth/register` | — | Self-register new agent (rate limited, status=pending, Telegram notify admin) |
| GET | `/api/auth/slug-cooldown` | Bearer | Check sisa cooldown sebelum agent boleh ganti slug lagi (anti-spam slug rename) |

### Admin
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| PUT | `/api/admin/profile` | Bearer | Update own profile |
| POST | `/api/admin/photo` | Bearer | Upload profile photo (base64 JPEG, max 5MB) |
| GET | `/api/admin/agents` | Bearer+Admin | List all agents |
| POST | `/api/admin/agents` | Bearer+Admin | Create agent |
| PUT | `/api/admin/agents/:slug` | Bearer+Admin | Update agent |
| DELETE | `/api/admin/agents/:slug` | Bearer+Admin | Delete agent |
| PUT | `/api/admin/agents/:slug/approve` | Bearer+Admin | Approve pending agent |
| PUT | `/api/admin/agents/:slug/reject` | Bearer+Admin | Reject pending agent |

### Agent Metadata
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/agent/:slug/card-variant` | — | Public read card variant untuk render PackageCard sebelum Supabase cache fresh |

### CAPI (Meta Conversion API)
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| POST | `/api/capi/:slug/login` | — | Verify agent password |
| GET | `/api/capi/:slug/config` | — | Get CAPI config (decrypted token) |
| POST | `/api/capi/:slug/config` | — | Save CAPI config |
| DELETE | `/api/capi/:slug/config` | — | Reset config |
| POST | `/api/capi/:slug/event` | — | Send event ke Meta (rate limited) |
| POST | `/api/capi/:slug/validate` | — | Validate pixel + token |
| GET | `/api/capi/:slug/logs` | — | Get CAPI event logs (pagination, filter by event_name, 14-day raw retention) + circuit breaker status |

### AWAPI
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| POST | `/api/awapi/test` | Bearer | Test credential Alhijaz Official API (`awapi_key`/`awapi_code` dari body atau agent profile) |

### Jamaah Helpers
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/jamaah/birthdays` | Bearer | Get jamaah ulang tahun hari ini sampai H+3 (Asia/Jakarta, cached 10 menit, timeout fallback) |
| POST | `/api/dev/trigger-birthday-digest` | Bearer | Dev only: trigger Telegram birthday digest secara manual (tidak aktif di production) |

### Laporan / Jamaah
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/laporan/status` | Bearer | Check credentials + session + last sync |
| POST | `/api/laporan/login` | Bearer | Login ke sistem internal (native fetch, auto-save credentials) |
| POST | `/api/laporan/sync` | Bearer | Fetch → parse → progressive upsert to Supabase |
| GET | `/api/laporan/sync-status` | Bearer | Check if background sync is in progress |
| GET | `/api/laporan/jamaah/:idJamaah/refresh` | Bearer | Refresh data 1 jamaah on-demand dari legacy (bypass cache) |
| GET | `/api/laporan/umrah/:idUmrah/refresh` | Bearer | Refresh data 1 jadwal umroh on-demand dari legacy |
| POST | `/api/laporan/jamaah/note` | Bearer | Save catatan agent untuk jamaah (free text, persisted di Supabase) |
| GET | `/api/laporan/jamaah` | Bearer | List jamaah (filter, search, sort, pagination) |
| GET | `/api/laporan/stats` | Bearer | Statistik jamaah: total, lunas, komisi, tren, berangkat, outstanding |
| POST | `/api/laporan/disconnect` | Bearer | Clear in-memory session |
| DELETE | `/api/laporan/credentials` | Bearer | Delete saved credentials from Supabase |
| GET | `/api/laporan/tren-daftar/years` | Bearer+Admin | Get available Hijriah years for tren daftar |
| GET | `/api/laporan/tren-daftar` | Bearer+Admin | Get registration trend data (monthly breakdown, rankings) |
| GET | `/api/laporan/tren-daftar/haji-years` | Bearer+Admin | Get distinct years untuk Haji ranking (`{keberangkatan, pendaftaran}` dari `jamaah_haji.thn_masehi` + `tgl_daftar`) |
| GET | `/api/laporan/tren-daftar/haji-ranking` | Bearer+Admin | Haji agent ranking. Query: `year` (YYYY, required), `mode` (`pendaftaran` default \| `keberangkatan`). Return: `{ranking: [{slug, name, photo, count}], mode, year}` desc by count |

### Portal Jamaah (Magic Link)
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| POST | `/api/portal/jamaah/:slug/magic-link/request-by-booking` | Rate-limited (public) | Self-service: jamaah submit id_umroh + WA → send magic link via WhatsApp jika booking sudah DP |
| POST | `/api/portal/jamaah/:slug/magic-link/generate` | Bearer (agent) | Agent generate magic link untuk jamaah. Body: `{ jamaah_id }`. Response: `{ url, expires_at, jamaah_name, id_umroh, anggota_count }`. Reuse token jika masih valid |
| GET | `/api/portal/jamaah/:slug/auth/consume/:token` | Rate-limited (public) | Consume magic token, validasi DP, create session, set `jamaah_session` cookie, redirect ke dashboard |
| GET | `/api/portal/jamaah/auth/consume/:token` | Rate-limited (public) | Alt consume endpoint (slug optional, resolve dari token) |
| GET | `/api/portal/jamaah/me` | Portal session cookie | Return booking + jamaah roster + agent info + schedule details untuk session aktif |
| GET | `/api/portal/jamaah/persiapan` | Portal session cookie | Return preparation checklist (tahapan + spiritual + substeps) dengan progress |
| PUT | `/api/portal/jamaah/persiapan/item` | Portal session cookie | Toggle individual prep item checked/unchecked → update `booking_persiapan.data` (rate-limited) |
| POST | `/api/portal/jamaah/auth/logout` | Portal session cookie | Hapus session row + clear `jamaah_session` cookie |
| GET | `/api/portal/jamaah/sessions` | Bearer (agent) | List session aktif untuk agent (admin view, audit) |

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
| GET | `/api/ai-tools/brosur-jadwal-bulan` | Bearer | Get grouped upcoming umroh schedules for Brosur Jadwal (query `monthsAhead`, default 24, max 36), enriched with agent profile and sold-out/price data |
| POST | `/api/ai-tools/generate-script` | Bearer | Generate script voice over dari data paket (OpenAI GPT-4o-mini, bahasa santai) |
| POST | `/api/ai-tools/generate-voice` | Bearer | Convert script ke audio MP3/WAV (Google Cloud TTS Chirp3-HD, credit deduction) |

### Tanya AI (Public)
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| OPTIONS | `/api/ask-ai/:slug/:jadwalId` | — | CORS preflight (explicit for public embed-ability) |
| POST | `/api/ask-ai/:slug/:jadwalId` | — | Tanya AI — OpenAI GPT-4o-mini dengan package context. Rate limit 10 req/60s/IP, 7-day cache. Body: `{ question, chipKey, yearCode }`. Response: `{ success, answer, note, cached, attachment: { type, url, title } | null }` |

### Landing Page Config
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/landing-config` | Bearer | Get `{ data: agent.landing_config, defaults, currentMeta }` — currentMeta = raw description from HTML untuk placeholder |
| PUT | `/api/landing-config` | Bearer | Update title & description untuk umroh/haji (JSONB merge). Trigger OG regen + invalidate landing caches |
| POST | `/api/landing-config/og-image` | Bearer | Upload custom OG image (JSON base64, max 6MB). Validates MIME (jpeg/png/webp), upload ke Supabase Storage `og-images` bucket, delete previous URL jika ada |
| DELETE | `/api/landing-config/og-image` | Bearer | Reset OG image ke default (null = fallback ke `/og/{slug}.png`) |

### Bio Page Config
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/bio/:slug/config` | — | Public read config for `/:slug/bio`; auto-populates default config on first access. If `enabled=false`, returns 404 unless optional Bearer owner/admin is provided |
| PUT | `/api/bio/:slug/config` | Bearer | Save normalized `bio_config` for owner/admin. Incomplete visible tiles are accepted for autosave with sanitized config; public tile renderers return `null` until required fields are complete |
| POST | `/api/bio/:slug/og-image` | Bearer | Upload Bio SEO OG image as JSON base64 (`image/png` or `image/jpeg`, max 5MB) to Supabase Storage `agent-photos/bio/*`; returns `{ url }` for client to persist in `seo.og_image_url` |
| POST | `/api/bio/:slug/tagline-generate` | Bearer | Generate tagline 1-line via OpenAI dari konteks agent (nama, jadwal, dll). Owner/admin only |
| POST | `/api/bio/:slug/photo-upload` | Bearer | Upload image for `photo` tile as JSON base64 (`image/png`, `image/jpeg`, `image/webp`, max 6MB); returns public URL |
| GET | `/api/bio/:slug/featured-paket-preview?jadwal_id=...` | — | Public package preview for `featured` tile, sourced from `umroh_schedules` by latest `year_code` |

### Umrah Self-Registration
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/umrah/form-options` | Bearer | Scrape form registrasi dari legacy system: selects, inputs, textareas, hidden fields, selectedValues, formAction. Query `?idb=<id_umroh>` untuk family/group binding |
| GET | `/api/umrah/dependent-options` | Bearer | Refetch dependent dropdowns (e.g. paket per jadwal) setelah user pilih tgl berangkat |
| GET | `/api/umrah/paket-options` | Bearer+Admin | Get all paket options untuk referensi admin |
| POST | `/api/umrah/register` | Bearer | Submit multipart form ke legacy system + upload file_ktp. Response `{ success, message }` |
| POST | `/api/umrah/ocr-ktp` | Bearer | OCR KTP image via OpenAI Vision → extract { nik, nama, tempat_lahir, tgl_lahir, jenis_kelamin, alamat, rt_rw, kelurahan, kecamatan, agama, status_perkawinan, pekerjaan, kewarganegaraan } |
| GET | `/api/umrah/form-debug` | Bearer | Debug dump raw HTML form structure dari legacy system |

### Flight Status
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/flights/status` | Bearer | Get all active flights for agent (merged with calendar groups) |
| GET | `/api/flights/:flightId` | Bearer | Get detail single flight (live status + boarding info dari AirLabs cache) |

### Flight Share
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| POST | `/api/flight-share` | Bearer | Create or retrieve share link (upsert by agent+flight+date) |
| GET | `/api/flight-share/:code` | — | Get flight share data (public, enriched with live flight status) |

### Weather
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/weather/cities` | Bearer | Get weather for Mekah, Madinah, Jakarta, Surabaya (Open-Meteo, 30min cache) |

### Kurs
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/kurs` | — | Get currency exchange rates (USD, SAR sell rates) |

### Analytics
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| POST | `/api/analytics/event` | Bearer | Track an analytics event |
| POST | `/api/analytics/public` | — | Public event logging (rate-limited 30 req/min per IP) |
| GET | `/api/analytics/summary` | Bearer+Admin | Comprehensive analytics summary (monthly summary via raw 14d + daily aggregate) |
| GET | `/api/analytics/agent/:slug` | Bearer+Admin | Agent drill-down 7 hari terakhir: timeline, heatmap, funnel, recent events |

### Haji Plus
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/haji-plus/data` | Bearer | Get Haji Plus yearly stats (scraped from alhijazindowisata.com) |

### Haji (Jamaah)
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| POST | `/api/haji/sync` | Bearer | Sync jamaah haji dari legacy system (HTTP session + Cheerio, parallel batch) |
| GET | `/api/haji/sync-status` | Bearer | Background sync status untuk jamaah haji |
| GET | `/api/haji/jamaah` | Bearer | List jamaah haji (filter, pagination) |
| POST | `/api/haji/jamaah/note` | Bearer | Save catatan agent untuk jamaah haji |
| GET | `/api/haji/stats` | Bearer | Statistik jamaah haji per tahun |
| GET | `/api/haji/doc-proxy` | Bearer | Proxy dokumen BPIH/Surat Pernyataan (bypass CORS legacy) |

### Schedules / Cache
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/schedules/:yearCode` | — | Get cached `umroh_schedules` rows untuk year_code (server-side cache, fallback ke proxy jika kosong) |

### Calendar
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/calendar/events` | Bearer | Get calendar events (query: `month`, `year`) — grouped by date+type |
| POST | `/api/calendar/enrich-kumpul` | Bearer | Enrich calendar keberangkatan events with jam_kumpul & titik_kumpul from PDF itineraries |
| GET | `/api/calendar/insight` | Bearer | Get AI-generated insight (in-memory cache → Supabase fallback) |
| POST | `/api/calendar/insight/refresh` | Bearer | Force regenerate AI Calendar Insight (admin manual refresh, bypass cache) |
| GET | `/api/calendar/insight-jamaah` | Bearer | Jamaah-specific insights: belum lunas, paspor status, 7-day departures |

### Itinerary
| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/itinerary/:jadwalId` | — | Get cached itinerary content (AI-parsed, Supabase fallback) |

### Proxy
| Method | Path | Deskripsi |
|--------|------|-----------|
| ALL | `/api/*` | Proxy ke `jadwal.alhijaz.co/jadwal/*` (data paket) |
| GET | `/itinerary/*` | Proxy PDF/image itinerary (timeout 15s, retry 1x) |
| GET | `/brosur/*` | Proxy brochure image (timeout 15s, retry 1x) |

### SSR / Public Pages
| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/f/:code` | Public flight share page dengan server-side OG injection (title, image, description) |
| GET | `/:slug/umroh` | SSR landing page Umroh dengan OG meta tags |
| GET | `/:slug/haji` | SSR landing page Haji Plus dengan OG meta tags |
| GET | `/:slug/bio` | Public Link Bio page dengan SSR OG meta injection dari `bio_config.seo` |
| GET | `/:slug/:packageId` | Single package page dengan OG meta injection untuk bot/crawler |

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
| `AIRLABS_API_KEY` | AirLabs API key untuk real-time flight status (quota counter disimpan di `calendar_insights`) |
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
| `SENTRY_DSN` | Sentry DSN untuk error tracking (server-side, loaded in `instrument.mjs`) |
| `INTERNAL_API_BASE` | Base URL sistem internal legacy (`/aiw/staff`) untuk laporan/calendar/haji scrape |
| `CALENDAR_USERNAME`, `CALENDAR_PASSWORD`, `CALENDAR_KANTOR` | Credential calendar scraper internal |
| `AWAPI_SYNC_ENABLED` | Feature flag untuk sync umroh via Alhijaz Official API |
| `AWAPI_BASE` | Base URL upstream AWAPI (default `http://115.124.86.220`) |
| `BUNNY_STORAGE_API_KEY`, `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_HOSTNAME`, `BUNNY_CDN_HOSTNAME` | Bunny Storage/CDN config untuk mirror brosur/itinerary CDN |
| `WEBHOOK_SECRET` | Secret untuk GitHub deploy webhook (`deploy-webhook.js`) |
| `PORT` | Port Express server (default `3000`) |
| `MASTER_PASSWORD` | Master password optional untuk bypass login internal/debug flow tertentu |

### Deployment (Production)
- Server: VPS Ubuntu, systemd service `miqot.service`
- Auto-deploy: Push ke `main` → GitHub webhook → `deploy-webhook.js` (port 9000) → `deploy.sh`
- Deploy script: `git pull` → `npm install` → `npm run build` → `systemctl restart miqot.service`
- Telegram notifikasi deploy (via bot API)

## 9. Status & Roadmap

- **Fase**: Production (live di alhijaz.co)
- **Versi**: 0.2.2+ (active development; major milestones: Tanya AI public, Landing Page config, Umrah self-register, agents UUID migration)

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
- Telegram notification preferences (15 visible toggles, per-agent toggle, JSONB in agents table)
- Pembayaran masuk detection (sync-time comparison, split cicilan vs pelunasan, auto-notify agent via Telegram DM)
- Settings page: iOS segmented control tab bar (Lucide icons), Telegram brand badge with animations, skeleton loading, disconnect confirmation dialog
- Background sync jamaah (chain-scheduled: umroh AWAPI default 60 min via `SYNC_COOLDOWN_MINUTES`, haji AWAPI default 60 min via `HAJI_AWAPI_SYNC_COOLDOWN_MINUTES`; legacy background/fallback/enrichment bisa dimatikan via `DISABLE_LEGACY_BACKGROUND_SYNC`)
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
- AI Tools hub page + Brosur Jadwal + Voice Over Generator (3-step flow: script generation, voice selection, audio player with download)
- Voice Over upgraded to Google Cloud TTS Chirp3-HD (8 voices: 4 wanita + 4 pria, natural Indonesian)
- AI credit system (25K chars/agent/month, `ai_credits` table, auto-reset 30 days, banner with progress bar)
- Script generation with casual/gaul Indonesian, duration-aware character limits, AI-friendly word choices
- Sentry error tracking (server-side, `@sentry/node` + `instrument.mjs`)
- UI Polish Haji Plus Dashboard (stat cards dengan icon badges, ornamen dekoratif hero card, EMERALD_PALETTE untuk chart bars, custom spacing, override header tool icon)
- Dynamic navbar icon/color override logic untuk AI Tools sub-pages (Brosur Jadwal, Haji Plus, Voice Over, Kartu Nama)
- Kartu Nama Digital revamped to rich high-fidelity templates (gradient, glassmorphism, dynamic user data)
- AI Web Itinerary View with vertical timeline, time badges, OpenAI extraction + Supabase caching
- Haji Plus Export Improvements (mobile native share double-image fix, Recharts data labels inside bars, SVG fill compatibility for screenshot engine, and design system-standard CTA buttons)
- Real-time flight status tracking (AirLabs API integration, grouped kloter cards, multi-flight dashboard)
- Flight Share public pages (`/f/:code`) — hero card, Leaflet route map, boarding pass style schedule, destination weather, agent WhatsApp CTA
- Server-side OG meta injection for flight share pages — title: "Lacak Penerbangan [maskapai] [kode] - [agent]", og:image per agent
- Cuaca (Weather) widget on dashboard home — Open-Meteo API, 4 cities (Mekah, Madinah, Jakarta, Surabaya)
- Kurs mata uang page — currency exchange rates (USD, SAR sell rates)
- Analytics event tracking dashboard — page views, actions, conversions per agent
- Analytics admin drill-down per agent — 7-day timeline, hourly heatmap, funnel, feature/action breakdown, recent events
- Analytics raw retention + daily aggregation — raw `analytics_events`/`capi_event_logs` cleanup 14 hari, aggregate di `analytics_events_daily`, backfill + tests tersedia
- Agent Management page (Admin) — full CRUD for managing all agents
- Tren Pendaftaran section in Statistik — registration trend analysis
- AIW Internal System connection management moved to Settings > Profil (branded disconnect UI)
- Pembayaran masuk detection refined: 7-day buffer to prevent false positives near departure
- PIN authentication system (6-digit, bcrypt, 5-attempt lockout 15min, email OTP reset)
- PIN-gated Statistik/komisi data access (sessionStorage 1-hour validity, set/change/disable PIN di Settings)
- Kumpul enrichment (auto-extract jam_kumpul & titik_kumpul dari PDF itinerary ke calendar_events)
- Insight Jamaah endpoint (belum lunas, paspor status, 7-day departures summary)
- Public analytics endpoint (rate-limited 30 req/min per IP, no auth required)
- Admin analytics summary endpoint (daily logins, agent activity, feature usage)
- Haji data scraper (haji-api.js) dengan jamaah_haji table (HTTP session + Cheerio, parallel batch sync)
- Shared validation utilities (validation.ts — 8 validators + 2 cleaners untuk forms)
- Typing placeholder animation hook (useTypingPlaceholder.ts — 72 rotating catatan suggestions)
- PinInput component (6-digit visual boxes, error state, auto-focus)
- Agent self-registration (`/register`) with pending approval workflow (status: pending/active/rejected, Telegram notify admin)
- Admin approve/reject agent dari UI dan Telegram inline callback (`agent_approve:*`, `agent_reject:*`)
- Card Variant Picker di Settings > Profil — per-agent PackageCard layout `default/split/spotlight/ticket/tiled/magazine`, public API `/api/agent/:slug/card-variant`, SSR body attribute fallback
- CAPI Event Log viewer (CapiEventLog.tsx — real-time event tracking, pagination, filtering, auto-refresh 30s, 14-day raw retention)
- CAPI Purchase Status tracking (capi_purchase_status column on jamaah/jamaah_haji for deduplication dp/lunas)
- Simulasi Haji Plus (SimulasiHajiPlus.tsx — package pricing calculator RAHMAH/UHUD, USD→IDR, inflation projection, export PNG, share)
- Country flag overlays on PackageCard (saudi, turki, mesir, china, uae — semi-transparent background)
- Static SEO landing pages (haji-plus.html, umroh.html — Yoast/OG/Schema.org metadata)
- SSR Haji Plus landing page ([slug]/haji.ts + haji-landing.mjs)
- Single package OG meta injection ([slug]/[packageId].ts for bot/crawler)
- Tren Pendaftaran admin analytics (12 sections: monthly growth, revenue, gender/age distribution, agent rankings, package popularity)
- Umroh schedules caching (umroh_schedules table — server-side cache of jadwal data with CDN URLs)
- Kurs cache table (kurs_cache — Bank Mandiri rates, daily update)
- Telegram notifier concurrency protection (isCheckRunning flag)
- BrochureModal enhanced (CDN URL detection, pinch-to-zoom for touch devices)
- **Agents PK migrated from slug to UUID id** (commit 9c614a6) — slug kini `UNIQUE NOT NULL`, bukan PK. FK di `capi_configs`, `jamaah`, `jamaah_haji`, `ai_credits`, `flight_shares`, `analytics_events_daily`, `capi_event_logs`, `ask_ai_cache` semuanya migrated ke `agent_id` UUID. `agent_slug_history` table menjaga JWT backward-compat (token lama pakai slug → resolve via history jika slug berubah)
- **agent_slug removed from owned tables** — `jamaah`, `jamaah_haji`, `ai_credits`, dan `flight_shares` sekarang memakai `agent_id` UUID; legacy `agent_slug` columns di-drop via `migrate-jamaah-fk-to-agent-id.js`
- **AWAPI sync path** — official Alhijaz API credentials (`awapi_code`, `awapi_key`) disimpan di `agents`; sync umroh bisa lewat AWAPI dan fallback ke scrape legacy jika belum siap
- **Tanya AI fitur publik** (Diskusi button di PackageCard) — OpenAI GPT-4o-mini dengan system prompt hangat, chip pool 24 soalan (reshuffle + pinned), typewriter reveal, inline brosur/itinerary attachments, WA nudge, markdown rendering, iOS Safari keyboard fix
- **Landing Page Config tool** (`/dashboard/ai-tools/landing-page`) — 3 tab Umroh/Haji/Bio. Umroh & Haji mengatur custom title/description/OG image untuk `/:slug/umroh` dan `/:slug/haji`; Bio mengatur Link Bio publik `/:slug/bio` dengan theme picker, hero/socials, SEO/OG image, tile validation, drag reorder, autosave intent visible untuk tile baru, dan fullscreen preview 90%.
- **Umrah self-registration** (`/dashboard/jamaah/daftar` via UmrahRegisterPage) — scrape legacy form, KTP OCR via OpenAI Vision, searchable select, dependent dropdowns, `?idb=` family/group binding, auto-defaults (Jamaah Baru, L, Berangkat Sendiri, Belum Pernah, hidden mahram/kondisi/keterangan=X)
- **Filter baru `UMROH CUTI 5 HARI`** — berangkat Jumat malam/Sabtu, pulang Sabtu/Minggu/Senin dini hari; plus rename label `BINTANG 5` → UI label "UMROH BINTANG 5"
- **Analytics daily aggregation** — `analytics_events_daily` table + cron 02:00 WIB (`runAnalyticsMaintenance`): aggregate yesterday's raw events ke agregat harian, delete raw events + CAPI logs > 14 hari (UTC midnight cutoff), backfill script dan node tests tersedia
- **PackageCard button revamp** — Diskusi (Tanya AI) di row 1 dengan animated emerald ring border (`.diskusi-ai-border` conic gradient + mask-composite), Link dipindahkan ke row 2
- Public analytics events diperluas: `ask_ai_opened`, `ask_ai_chip_tapped`, `ask_ai_free_query`, `ask_ai_wa_clicked`, `bio_view` (plus existing `page_view`, `wa_click_public`, `inquiry_submitted`)
- Tanya AI hardcoded product knowledge (di system prompt): DP Rp 5jt, pelunasan 30 hari, AMITRA syariah, Saudia 2×23kg (lain 30kg), Zurich Syariah asuransi, visa diurus tim Alhijaz, manasik 2-3 minggu sebelum, Wi-Fi hotel (redirect SSID/password ke tour leader)
- **Tanya AI iOS Safari fixes** — track `visualViewport.offsetTop` (bukan hanya height) untuk handle keyboard slide-in, body-lock `position:fixed` agar auto-scroll tidak bleed, multi-leg route inference untuk Umroh start date
- **Bio Link publik** (`/:slug/bio`) — public Linktree-style page dengan 6 theme (emerald/desert/midnight/rosegold/sunset/mono), hero (foto, tagline, badges 0-3, socials IG/TikTok/YouTube), system tiles (umroh/umroh_landing/haji/wa), custom tiles (featured/link/text/photo/testi), SSR OG injection dari `bio_config.seo`
- **Bio editor** dengan 6 theme picker, Hero/SEO sheets, AI tagline generator (`/api/bio/:slug/tagline-generate` via OpenAI), drag reorder (@dnd-kit), tile validation, autosave debounce, fullscreen preview (90% scaled iframe di phone frame), explicit Simpan per sheet
- **Kurs Share** — `ShareKursModal` + `KursShareTemplates` single Hero USD template; fixed 1400×1000 canvas, preview auto-fit, final JPEG server-side on-demand lewat `/api/kurs/share-image` + disk cache TTL, native share files-only + download + copy caption; tombol Share tersedia untuk semua agent saat USD tersedia
- **Birthday workflow** — dashboard `BirthdayWidget`, grouped `BirthdayListSheet`, `BirthdayDetailSheet`, 2 template kartu 1080×1080, WA message generator, JPEG export via `@zumer/snapdom`, dan Telegram birthday digest opt-in jam 07:00 WIB
- **Brosur Jadwal** — AI Tools page untuk export brosur paket umroh bulanan 1080×1620 (2:3) PNG dari `umroh_schedules`; helper pure di `lib/brochure-schedule.js` dan test coverage di `tests/brochure-schedule.test.js`
- **CAPI circuit breaker** — pause per-agent setelah 10 kegagalan CAPI beruntun selama 30 menit, agar sync/public events tidak terus menembak token Meta yang error
- **Portal Jamaah** (`/:slug/jamaah`) — companion app jamaah-facing dengan magic-link auth (no password). 7-route state machine (beranda, perjalanan, pembayaran, dokumen, perlengkapan, manasik, faq), self-service entry via kode booking + WA, atau distribusi link dari agent (`MagicLinkButton` + `MagicLinkModal`). Glassmorphism PortalTopBar, HeroCountdown departure timer, SmartAlertsStrip tone-aware, TaskListWidget urgent kategori, PortalMenuGrid 3-col, RosterItem dengan gender ring + payment overlay, StickyWhatsAppCta pill footer, ThemeToggle independent. 3 tabel baru: `jamaah_portal_tokens`, `jamaah_portal_sessions`, `booking_persiapan` (RLS-protected). 9 endpoint `/api/portal/jamaah/*`. Komponen di `src/components/portal-jamaah/` (17 components + 11 pages + 4 hooks + 7 lib helpers).
- **Haji AWAPI enrichment** — `jamaah_haji` mendapat 13 kolom baru (nomor_porsi, nomor_spph, no_paspor, paspor_expired, paket_harga, diskon_marketing, diskon_kantor, bayar, sisa, tgl_lahir, tgl_daftar, tgl_berangkat, dokumen JSONB) + composite indexes. Memungkinkan Statistik Haji menampilkan data finansial dan timing lebih granular.
- **Ranking Agent Haji** di Tren Daftar — `HajiAgentRankingSection` dengan toggle Pendaftaran/Keberangkatan (default Pendaftaran). Komponen `AgentRankingList` di-extract reusable. Endpoints: `/api/laporan/tren-daftar/haji-years` + `/api/laporan/tren-daftar/haji-ranking`.
- **CDN file sync** — `lib/cdn-file-sync.js` + `lib/umroh-schedules.js` mirror brosur/itinerary ke Bunny CDN dengan SHA256 fingerprint check. 8 kolom baru di `umroh_schedules` (sha256/bytes/content-type/synced_at per file type) untuk skip re-upload identik.
- **Phase 2 notif scheduling** — `lib/jamaah-phase2-policy.js` menghitung jadwal notif umroh Phase 2 dalam timezone Asia/Jakarta (default 01:00 & 14:00 WIB).
- **Journey order inference** — `lib/journey-order.js` mendeteksi urutan itinerary (Madinah-first vs Umroh-first) dari pattern text per hari, untuk context Tanya AI dan UI portal.
- **Sync fix**: extract `id_jadwal` dari legacy umrah-detail scrape untuk linkage yang konsisten antara `jamaah` dan `umroh_schedules`.
- **CustomDomainPage/CustomDomainTrigger** — komponen feature-gated untuk custom domain agent (DNS status, verification, embed tutorial). Status: scaffold, belum aktif untuk semua agent.
- **Brosur Musim Dingin (winter theme)** (2026-05) — filter "Umroh Musim Dingin" (berangkat Des–Jan) di Brosur Jadwal + prop `variant='winter'` pada `BrochureScheduleTemplate` (palet biru es ter-tokenize, snowflakes, snow drift). Kanvas brosur diubah dari 1080×1920 ke **1080×1620 (2:3)**.
- **AWAPI sync Fix A** (2026-05-31) — `lib/awapi-sync-outcome.js` (`classifyAwapiSyncOutcome`): hasil sync dipetakan ke full/partial/hardfail; partial fetch tidak lagi fallback ke legacy dan label "last sync" tetap di-bump (`last_jamaah_sync_at`). Plus payment provenance guard (`jamaah-payment-provenance.js`), phase-1 enrichment preservation (`jamaah-phase1-enrichment.js`), dan surat-pernyataan cache (`jamaah-document-cache.js` + tabel `jamaah_document_cache`). Diterapkan ke umroh & haji.
- **Background jobs gating** — `lib/background-jobs.js` (`shouldRunBackgroundJobs`) gate cron kurs & Telegram notifier by `NODE_ENV` (override `ENABLE_BACKGROUND_JOBS`).
- **Jamaah/Haji filter & UI** (2026-05) — filter lanjutan beranimasi (bayar/keberangkatan/dokumen/perlengkapan/catatan), persentase pembayaran ter-clamp 0–100, viewer Surat Pernyataan (`UmrohPernyataanViewer` + proxy `/api/laporan/jamaah/doc-proxy`), dan format USD di Haji.
- **Passport reminder timing** (2026-05-26) — reminder paspor jam 09:30 WIB, anti-duplikat `paspor_{slug}_{today}`, paspor dianggap collected jika `dokumen.paspor` true ATAU `no_paspor` terisi.

### Rencana / Backlog
- [TODO] Perluas test suite ke route/API integration dan komponen React utama
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
| **Data paket external source + operational cache** | Source of truth paket tetap `jadwal.alhijaz.co`/AWAPI. Server menyimpan cache operasional di `umroh_schedules` untuk fitur yang butuh query server-side (Bio featured, Tanya AI, Brosur Jadwal, OG/landing), bukan sebagai master data. |
| **Native fetch + Cheerio untuk Jamaah** | Awalnya pakai Playwright (300MB+), diganti native fetch + Cheerio (lightweight) — cukup POST login + GET HTML + parse table |
| **jamaah-api.js deprecated** | File ini masih ada di repo (menggunakan Playwright) tapi tidak lagi digunakan; semua jamaah flow sudah menggunakan `laporan-api.js` |
| **Recharts untuk Statistik** | Lightweight charting library, sudah termasuk ResponsiveContainer, mendukung AreaChart dan BarChart yang diperlukan |
| **Supabase free tier + keep-alive** | Budget terbatas, keep-alive ping dari server cegah auto-pause |
| **Telegram untuk notifikasi** | Agent lebih aktif di Telegram/WhatsApp daripada cek dashboard, notif otomatis lebih efektif |
| **node-cron in-process** | Tidak perlu external cron/scheduler — cron jobs jalan di dalam Express process yang sama |
| **Single-kantor sync** | Fetch hanya dari kantor agent yang terdaftar (jamaah_kantor), tidak fetch kantor lain |
| **Widened fetch range** | `HIJRIAH_YEARS.tglAwal` dimundurkan 6 bulan dari awal tahun Hijriah untuk capture jamaah yang didaftarkan lebih awal tapi berangkat di tahun Hijriah tersebut. `HIJRIAH_RANGES` (penentuan hijriah_year berdasarkan tgl_berangkat) tetap akurat |
| **Agents PK = UUID, slug = UNIQUE** | Slug bisa berubah (agent rename), dan kita butuh stable FK untuk `jamaah`, `jamaah_haji`, `flight_shares`, `ai_credits`, `capi_configs`, `analytics_events_daily`, `ask_ai_cache`. `agent_slug_history` jadi lookup table untuk JWT backward-compat. |
| **Owned tables use `agent_id`** | `jamaah`, `jamaah_haji`, `ai_credits`, dan `flight_shares` sudah tidak bergantung ke `agents.slug`; rename slug cukup update `agents` + tulis history redirect. |
| **Kurs Share memakai JPEG 16:10** | Template terbaru fokus pada USD hero 1400×1000, lebih ringan untuk WhatsApp dibanding PNG square multi-template, dan tidak bergantung pada data SAR. |
| **Birthday lookup timezone Asia/Jakarta** | Ulang tahun harus mengikuti hari kerja agent di Indonesia; matching by literal month/day, 29 Februari hanya match saat leap year. |
| **Tanya AI public, no auth** | Agar dapat dipanggil langsung dari SPA publik (calon jamaah belum login). Dilindungi rate limit per IP + client-side query limit per session + cache 7-hari. |
| **Tanya AI product knowledge di system prompt** | Fakta standar Alhijaz (DP 5jt, AMITRA, Zurich, visa diurus) dihardcode di prompt, bukan di context data — supaya AI selalu konsisten meski data paket tidak punya field ini. Setiap perubahan fakta produk = update system prompt di `server.js`. |
| **UmrahRegisterPage scrape HTML** | Sistem internal legacy tidak punya API. Kita scrape form options + submit multipart, plus OCR KTP via OpenAI Vision untuk auto-fill. Rawan breakage kalau legacy form berubah. |
| **Landing config OG image 1200×630** | Standard OG size untuk Facebook/WhatsApp preview. Crop enforced via `PhotoCropModal` aspect=`1200/630`, output langsung ke ukuran tersebut (bukan resize post-upload). |
| **Bio config disimpan di `agents.bio_config`** | Link Bio bersifat per-agent dan volume datanya kecil. JSONB cukup untuk theme, hero, SEO, dan ordered tiles tanpa menambah tabel baru. |
| **Bio tile menyimpan intent visible, render publik tetap aman** | Tile baru default `visible:true` supaya setelah dilengkapi langsung tampil. Backend menerima incomplete visible tile dengan config tersanitasi agar autosave tidak gagal; public tile components tetap return `null` jika required field belum lengkap, dan toggle hidden→visible memvalidasi field wajib. |

### Known Issues / Technical Debt
- **PackageCard.tsx terlalu besar** (~2610 baris) — perlu di-split ke sub-components
- **DashboardProfile.tsx terlalu besar** (~2351 baris) — profile + telegram + PIN management + card variant picker, bisa di-split
- **CapiPage.tsx terlalu besar** (~2144 baris) — bisa di-modularisasi
- **server.js monolith** (~15748 baris) — perlu di-split ke route modules (ask-ai, landing-config, bio-config, umrah-register, birthdays, analytics, ai-tools, portal-jamaah, awapi-haji bisa jadi kandidat)
- **JamaahPage.tsx besar** (~1968 baris) — view + filter + pagination + entry ke UmrahRegisterPage + notes, bisa di-split per concern
- **UmrahRegisterPage.tsx sangat besar** (~1808 baris) — form config + OCR + SearchableSelect + preview modal bisa dipecah
- **HajiPage.tsx besar** (~1238 baris) — list, login legacy, notes, document viewer popup
- **AskAIModal.tsx besar** (~1080 baris) — bisa di-split ke sub-komponen (header, chat area, input, attachment card)
- **Test suite masih sempit** — sudah ada `node:test` untuk logic pure, belum ada API integration/React component coverage
- **No error boundary** — React errors bisa crash seluruh app
- **modern-screenshot alignment** — Export image (ComparePage, Haji Plus Export) rawan mengalami vertical overlap jika grid dicampur dengan flexbox; gunakan block layout standar untuk export elements.
- **CAPI endpoints tidak pakai auth** — hanya dilindungi oleh agent slug (not secret)
- **telegram-notifier.js besar** (~3041 baris) — bisa di-modularisasi
- **jamaah-api.js masih ada** — file Playwright-based yang deprecated, bisa dihapus
- **AirLabs API quota** — 1000 calls/bulan di free tier, tracked di `flight_status` table
- **Flight share `flight_status` column** — harus di-add manual via SQL jika belum ada
- **Umrah register legacy form fragile** — HTML scrape dari sistem internal; perubahan form di legacy = breakage
- **Tanya AI cost budget** — setiap query un-cached = 1 call OpenAI GPT-4o-mini; cache 7-hari membantu, tapi viral traffic dari share link bisa spike biaya
- **AWAPI fallback complexity** — selama transisi official API + legacy scrape, perlu jaga parity data (`jm_id`, diskon, perlengkapan) dan cleanup guard

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
- ✅ **DO**: Gunakan `agent.id` (UUID) sebagai FK di tabel baru — bukan `agent.slug`. Slug bisa berubah (tracked di `agent_slug_history`)
- ✅ **DO**: Untuk query owned data existing (`jamaah`, `jamaah_haji`, `ai_credits`, `flight_shares`, `capi_configs`, `ask_ai_cache`), pakai `agent_id`; jangan hidupkan lagi kolom legacy `agent_slug`.
- ✅ **DO**: `authMiddleware` otomatis resolve legacy token (slug-only → id via `agent_slug_history` jika slug sudah berubah). `req.user` selalu punya `{ id, slug, name, role }` setelah middleware.
- ✅ **DO**: Saat bikin form SPA-side yang submit ke `/api/umrah/register`, gunakan `SearchableSelect` untuk dropdown >8 options — native select sulit discroll di mobile
- ✅ **DO**: Saat upload OG image lewat `/api/landing-config/og-image`, send JSON base64 (bukan multipart) — endpoint expect `{ landing_type, mime, data }`
- ❌ **DON'T**: Jangan hardcode OG path `/og/{slug}.png` langsung — selalu cek `agent.landing_config?.[type]?.og_image_url` dulu, fallback ke `/og/{slug}.png` jika null
- ✅ **DO**: Untuk Bio editor, pertahankan intent `visible` user saat autosave; jangan paksa data dummy hanya agar validasi lolos. Biarkan backend sanitize config dan tile component public mengembalikan `null` sampai field wajib lengkap.
- ✅ **DO**: Public Bio harus tetap memfilter tiles dengan `visible && !orphaned`, dan custom tile component harus punya guard `return null` saat props wajib kosong; validasi backend tidak menggantikan guard render publik.
- ✅ **DO**: Upload gambar Bio melalui endpoint JSON base64 (`/api/bio/:slug/og-image` atau `/api/bio/:slug/photo-upload`) dan persist URL-nya lewat `PUT /api/bio/:slug/config`.
- ❌ **DON'T**: Jangan skip `triggerOgRegen(slug)` setelah update profile (nama/foto) — OG image per agent di-regenerate from fresh agent data
- ❌ **DON'T**: Jangan kirim `text`, `title`, atau `url` bersama `files` saat `navigator.share()` — trigger "double image" bug di WhatsApp mobile (lihat Design System section "Native Share Format")
- ❌ **DON'T**: Jangan ubah fakta produk Alhijaz (DP, pelunasan, AMITRA, visa, asuransi Zurich, bagasi per maskapai, manasik timing) tanpa update system prompt di endpoint `POST /api/ask-ai/:slug/:jadwalId` — itu hardcoded sebagai rule di prompt
- ✅ **DO**: Render Kurs share template di canvas tetap **1400×1000** lalu transform `scale(previewScale)` untuk preview — supaya layout preview & output JPEG benar-benar 1:1.
- ✅ **DO**: Saat native share file untuk Kurs/Birthday, kirim `{ files: [file] }` saja; caption dicopy via tombol terpisah.
- ❌ **DON'T**: Jangan gate `ShareKursModal` pada `kursData.sar`; template terbaru hanya membutuhkan USD dan agent info.
- ✅ **DO**: Untuk kartu ulang tahun, tunggu `document.fonts.ready` sebelum `snapdom()` agar output tidak fallback font.
- ✅ **DO**: Jalankan `node --test tests/*.test.js` sebelum mengubah logic haji stats, extraction haji, analytics retention, atau grouping/harga Brosur Jadwal.
