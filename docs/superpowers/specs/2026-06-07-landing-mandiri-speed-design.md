# Landing Mandiri + Ngebut — umroh & haji-plus

**Tanggal:** 2026-06-07
**Status:** Disetujui user (full mandiri, asset → Bunny, scope umroh + haji)

## Tujuan

1. **Mandiri**: hilangkan semua ketergantungan runtime & template pada `alhijazindonesia.com` / `wa.alhijazindonesia.com`, plus dependensi third-party yang bisa di-self-host (Google Fonts, cdnjs FontAwesome).
2. **Ngebut**: perbaiki critical render path (defer JS, hapus lottie mati, preload LCP) dan serve asset statis dari Bunny CDN PoP Jakarta — **karena agent ber-custom-domain tidak lewat proxy Cloudflare**, optimasi harus di level origin/Bunny.

## Konteks arsitektur (hasil audit 2026-06-07)

- Halaman live = hasil transform `functions/[slug]/umroh.ts` & `haji.ts` (**sumber TypeScript**; `functions/*-landing.mjs` adalah **build artifact** esbuild via `npm run build` — JANGAN edit .mjs langsung).
- Template `public/umroh.html` (374KB) & `public/haji-plus.html` dibaca dari disk saat serve, di-cache in-memory 1 jam.
- Express (`server.js`) serve static via 2× `express.static` polos (tanpa maxAge/compression); Cloudflare hanya aktif untuk `alhijaz.co` dan **tidak meng-edge-cache apa pun** (`cf-cache-status: DYNAMIC`).
- Bunny `alhijaz.b-cdn.net` = pull zone (id 5673255) di atas Storage Zone; upload via `bunnyUpload()` (`server.js:13892`, env `BUNNY_STORAGE_*` + `BUNNY_CDN_HOSTNAME`).
- Transform saat ini meng-inject Google Fonts css2 (Inter 400-700, Montserrat 500-800) + cdnjs FA 5.15.4 penuh — dua dependensi eksternal yang akan dihapus.
- Ikon FA terpakai: umroh 10 distinct, haji 18 distinct (union ~24; haji punya 1 ikon `far` calendar-alt).
- Skrip bawah body (jQuery→Elementor chain, ~350KB setelah lottie dihapus) **tanpa defer** — upstream WP aslinya pakai defer, hilang saat export statis.
- `wa.alhijazindonesia.com/?message=...` di template = placeholder CTA (13× umroh, 7× haji), di-rewrite saat serve ke `https://api.whatsapp.com/send?phone=<agent>` (umroh.ts ~baris 86-87 versi .mjs).
- `DEFAULT_PHONE = "62822900020"` tersedia di kedua .ts.

## Desain

### 1. Asset statis → Bunny CDN

- **Script baru** `scripts/sync-landing-assets.mjs`: upload rekursif `public/wp-content/`, `public/wp-includes/`, `public/fonts/` ke Bunny Storage dengan **path identik** (agar `url()` relatif dalam CSS tetap resolve). Env: `BUNNY_STORAGE_API_KEY`, `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_HOSTNAME`, `BUNNY_CDN_HOSTNAME`. Idempotent (skip jika sudah ada & ukuran sama; flag `--force` untuk overwrite). Dijalankan manual saat asset berubah.
- **Rewrite saat serve** (kedua .ts): jika `process.env.BUNNY_CDN_HOSTNAME` terisi → ganti referensi `"/wp-content/` dan `"/wp-includes/` (atribut `src`/`href` dan `url("` di CSS inline) menjadi `https://<BUNNY_CDN_HOSTNAME>/...`. Rewrite dijalankan **di akhir pipeline transform** (setelah semua regex struktur template yang mencocokkan path lokal). Env kosong → tetap self-hosted (dev lokal aman).
- Verifikasi template: 0 kemunculan `\/wp-content` JSON-escaped (sudah dicek, aman untuk replace sederhana).
- Cache-bust: pola `?ver=`/`?v=` existing tetap dipakai; perubahan konten file = bump versi (pola repo) atau purge Bunny.

### 2. Font self-host (hapus Google Fonts)

- Download sekali (saat implementasi) woff2 **latin subset**: Inter 400/500/600/700 + Montserrat 500/600/700/800 (8 file, ~120KB) → commit ke `public/fonts/`.
- Kedua .ts: ganti blok `<link>` css2 Google dengan **inline `<style>@font-face`** (`font-display: swap`, src menunjuk `/fonts/...` yang ikut ter-rewrite ke Bunny saat env aktif).
- `<link rel="preload" as="font" crossorigin>` untuk 2 weight above-fold (ditentukan saat implementasi, perkiraan Inter 600 + Montserrat 700).
- Hapus `preconnect` fonts.googleapis/gstatic (tidak relevan lagi); tambah `preconnect` ke Bunny.
- **Prasyarat ops (manual, user)**: aktifkan CORS/`Access-Control-Allow-Origin` di Bunny pull zone untuk font cross-origin. Wajib diverifikasi setelah deploy; jika gagal, fallback = font tetap di origin (same-origin, tanpa CORS).

### 3. Ikon → inline SVG (hapus cdnjs)

- **Modul baru** `functions/[slug]/fa-icons.ts`: map ~24 ikon union (umroh+haji) → `{ viewBox, path }` dari Font Awesome Free 5.15.4 (lisensi ikon CC BY 4.0 — atribusi di komentar modul).
- Kedua .ts: replace `<i class="...fa-xxx..."></i>` → `<svg class="(class asli)" viewBox="..." width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="..."/></svg>` + 1 rule CSS kecil (`vertical-align:-0.125em`) di inject `<style>`.
- Hapus `<link>` cdnjs FA dari inject. Jika ada ikon di markup yang tak ada di map → log warning saat transform (jangan crash) dan biarkan `<i>` apa adanya.

### 4. Critical render path

- **Template (kedua file)**: tambah `defer` ke semua `<script src>` first-party bawah body (jQuery + chain Elementor). Aman: semua inline script template & CAPI script sudah vanilla JS (dikonfirmasi audit + komentar eksplisit di template); upstream WP production memakai defer untuk script yang sama.
- **Template umroh**: hapus `<script>` lottie.min.js + widget lottie (satu-satunya, hidden tablet/mobile, JSON dari alhijazindonesia.com) → -246KB parse di semua device. (Haji: cek & hapus jika ada juga.)
- **Transform**: inject `preconnect` ke `https://<BUNNY_CDN_HOSTNAME>` + `<link rel="preload" as="image" fetchpriority="high">` untuk hero background (umroh: `pt-alhijaz-indowisata.webp` — section `64c34f3d`; haji: ditentukan saat implementasi dari section hero `f55e3ca`). URL preload mengikuti rewrite Bunny.
- **Transform**: blanket `loading="lazy"` (umroh.ts ~baris 158 versi .mjs) **tidak boleh** mengenai gambar above-fold/LCP (logo sudah ber-`loading` eksplisit; pastikan gambar promo milad b-cdn dapat `loading="eager"`/`fetchpriority="high"` sebelum blanket lazy berjalan).

### 5. CTA WhatsApp mandiri

- **Template (kedua file)**: ganti semua `https://wa.alhijazindonesia.com/?message=X` → `https://wa.me/62822900020?text=X` (DEFAULT_PHONE; template berfungsi standalone tanpa server WP).
- **Transform (kedua .ts)**: update regex rewrite dari pola `wa.alhijazindonesia.com` ke pola `https://wa.me/\d+?text=...` → `waBase + "&text=$1"` (pesan paket dipertahankan). Pola `wa.me` dipilih karena tanpa `&` sebelum `text=` → bebas masalah `&amp;` di atribut HTML.
- Bersihkan regex/komentar sisa yang menyebut wa.alhijazindonesia.com.

### 6. Origin hardening (krusial untuk custom domain)

- `npm i compression`; `app.use(compression())` sebelum static & routes di `server.js` (custom domain tak punya kompresi CF; HTML 346KB → ~35KB).
- Kedua `express.static` → `{ index: false, maxAge: '30d', immutable: true }` (kebijakan cache milik origin, tak bergantung CF).

### 7. Build & deploy

- Edit sumber `.ts` → `npm run build` (regenerate `.mjs` + vite build) → commit keduanya (pola repo: artifacts di-commit).
- Commit langsung ke `main` (pola kerja repo; verifikasi `git branch --show-current` sebelum commit).
- Setelah deploy VPS: jalankan `scripts/sync-landing-assets.mjs`, set env `BUNNY_CDN_HOSTNAME` di service, restart.

## Verifikasi

1. **Lokal tanpa env Bunny**: start server → curl `/:slug/umroh` & `/:slug/haji` → assert: 0 `alhijazindonesia.com`, 0 `cdnjs`, 0 `fonts.googleapis`, ada `defer` di chain jQuery, ada `<svg` ikon, `@font-face` inline, path asset tetap relatif.
2. **Lokal dengan env Bunny dummy**: assert URL asset ter-rewrite ke hostname CDN.
3. **Visual**: screenshot localhost kedua halaman (ikon SVG, font, hero, sticky bar) — bandingkan dengan produksi.
4. **Produksi**: `cdn-cache: HIT` di asset Bunny, font termuat (CORS OK), PageSpeed Insights sebelum/sesudah.

## Di luar scope

- Pruning CSS Elementor/Elementor-Pro (~376KB; proyek terpisah, risiko regresi visual).
- Cloudflare Cache Rule untuk alhijaz.co (aksi dashboard user; tetap direkomendasikan).
- Legacy scrape `alhijazindonesia.com` untuk sync data haji/calendar/forms (sistem sync, bukan landing).
- Tracking GTM/FB pixel di template (sudah di-strip saat serve; bukan dependensi alhijazindonesia.com).

## Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| CORS font di Bunny belum aktif → font tak termuat | Verifikasi wajib pasca-deploy; fallback: font di origin (same-origin) |
| Regex rewrite CDN mengenai string yang salah | Rewrite di akhir pipeline; assert jumlah replace; test curl |
| `defer` mengubah timing init Elementor | Upstream WP production sudah pakai defer di script yang sama — terbukti aman |
| Update asset tanpa purge Bunny → stale | Pakai pola `?ver=` bump (existing); dokumentasikan di README script sync |
| Edit `.mjs` tertimpa build | Semua perubahan transform di `functions/[slug]/*.ts`; `.mjs` hanya hasil build |
