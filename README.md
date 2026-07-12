# Miqot / Alhijaz Umroh Schedule

Aplikasi fullstack Alhijaz untuk katalog paket publik, landing page agent, dashboard operasional, data jamaah Umroh/Haji, Portal Jamaah, flight tracking, analytics, Telegram, dan AI tools.

Production memakai React 18 + TypeScript + Vite pada frontend, Express 5 pada backend, dan Supabase PostgreSQL sebagai data store utama. `server.js` menjadi boundary produksi untuk API, static SPA, public metadata/OG, serta background jobs.

## Dokumentasi

- [Project summary](./docs/project-summary.md) — arsitektur, fitur, data flow, endpoint, environment, deployment, risiko, dan verification matrix.
- [Design system](./docs/DESIGN-SYSTEM.md) — token visual, komponen canonical, pola interaksi, animasi, export, dan checklist UI.
- [Agent profile](./docs/AGENT-PROFILE.md) — flow dan kontrak profil agent.
- [API integration spec](./docs/api-integration-spec.md) — spesifikasi integrasi eksternal terkait.
- [CAPI instructions](./docs/InstruksiCapi.md) — konfigurasi Meta Conversions API.
- `docs/superpowers/specs/` dan `docs/superpowers/plans/` — histori desain dan implementation plan fitur besar.

## Menjalankan Secara Lokal

Prasyarat: Node.js 20, npm, dan kredensial development yang sesuai.

```bash
npm install
cp .env.example .env
```

Isi minimal konfigurasi Supabase dan secret yang dibutuhkan oleh fitur yang hendak diuji. Jangan commit `.env` atau service-role key.

Jalankan frontend dan backend di terminal terpisah:

```bash
npm run dev
```

```bash
npm run start
```

Vite default berjalan pada port `5173`; Express default pada port `3000`. Background jobs nonaktif secara default di development dan hanya boleh diaktifkan pada satu runtime yang memang bertugas mengirim notifikasi/sync terjadwal.

## Command Utama

```bash
npm run build            # Build SPA dan bundle landing functions
npm run build:spa        # Build frontend saja ke dist/
npm run build:functions  # Bundle landing Umroh/Haji
npm run lint             # ESLint
npm run verify:landing   # Verifikasi landing bundle
node --test tests/*.test.js
```

`postinstall` memasang Chromium melalui Playwright karena pendaftaran Umrah memiliki browser fallback untuk integrasi legacy.

## Peta Singkat

```text
server.js                 Express API, public pages, OG injection, background jobs
src/                      React/TypeScript frontend
src/components/           Dashboard, public pages, Portal Jamaah, feature UI
lib/                      Server-side business logic dan generator
functions/[slug]/         Source landing Umroh/Haji yang dibundle
migrations/               SQL migrations
public/                   Static assets dan OG assets
tests/                    node:test suite dan source guards
docs/                     Dokumentasi produk dan engineering
```

Frontend memakai path parser custom di `src/main.tsx`, bukan React Router. Route dashboard lazy-loaded dari `DashboardLayout.tsx`; route publik yang memerlukan metadata crawler juga harus ditangani oleh Express.

## Aturan Kontribusi

- Gunakan `agents.id` (UUID) sebagai owner key; slug hanya untuk identitas URL.
- Jangan menghapus data setelah upstream fetch yang parsial atau degraded.
- Jangan mengekspos Supabase service role maupun secret AWAPI, CAPI, OpenAI, Telegram, atau Google ke bundle frontend.
- Pertahankan service worker hanya pada host resmi/localhost; custom domain sengaja tidak memakai PWA cache.
- Gunakan komponen shared yang sudah canonical. Khusus flight status, gunakan `FlightRouteLine` dan `flightStatusPresentation` pada Dashboard maupun public share.
- Tambahkan focused test dan jalankan build untuk perubahan frontend/route produksi.

## Verifikasi Sebelum Deploy

Baseline aman:

```bash
node --check server.js
node --test tests/*.test.js
npm run build
git diff --check
```

Tambahkan smoke test sesuai area di [Verification Matrix](./docs/project-summary.md#verification-matrix). Deployment produksi berjalan sebagai `miqot.service`; perubahan backend maupun frontend memerlukan build dan restart service melalui workflow deploy yang berlaku.
