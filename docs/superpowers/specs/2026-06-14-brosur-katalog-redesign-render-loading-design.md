# Spec: Cover Katalog PDF baru + Render Konsisten + Modal Loading

**Tanggal:** 2026-06-14
**Status:** Disetujui (brainstorm via visual companion; user memberi otonomi "lanjutkan sampai selesai")
**Area:** `src/components/BrochureScheduleTemplate.tsx`, `src/components/BrochureSchedulePage.tsx` (+ komponen modal baru, + aset)

## 1. Tiga masalah (dari user)
1. **Cover katalog PDF** (`/dashboard/brosur` → "Unduh Katalog (PDF)") kurang menarik.
2. **Render PDF tidak konsisten antar perangkat** — di sebagian HP rapi, di HP lain shadow tidak sempurna/rusak.
3. **Animasi loading** tombol "Unduh Katalog (PDF)" membosankan.

## 2. Akar masalah render (hasil workflow investigasi, confidence tinggi)
`modern-screenshot` **tidak menggambar sendiri** — ia serialize DOM → SVG `<foreignObject>` → `<img>` → `ctx.drawImage()`. Jadi **setiap shadow/filter/clip dirender oleh engine browser di HP masing-masing** (Blink/Android, WebKit/iOS, webview WhatsApp/IG/FB). Engine berbeda → fidelity blur/spread beda, sebagian webview men-drop efek. DPR **bukan** penyebab (canvas deterministik `Math.floor(w*scale)`). Diperparah skala non-integer `1.5×` (offset shadow jadi pixel pecahan) + JPEG `q=0.82` (banding gradien).

**Primitif paling rapuh (wajib dihilangkan):** `background-clip:text`+transparent fill, `filter: drop-shadow()`, `box-shadow` blur besar, `box-shadow` **negative-spread**, `filter: brightness(0) invert(1)`, `mask-image` gradient.

**Prinsip fix:** jangan andalkan engine — "bake" jadi bentuk deterministik: **flat solid fill**, **solid offset shape** (bukan blur), **PNG pra-proses** (alpha/warna sudah jadi), **skala integer 2×**, **PNG / JPEG q tinggi** untuk cover. Gradien CSS linear/radial & `background-image` SVG-pattern opacity rendah **boleh** (render cukup konsisten; yang fatal adalah daftar primitif di atas).

## 3. Workstream A — Cover baru (target visual = mockup "D1 v4" yang disetujui)
Komponen `BrochureCatalogCover` (`BrochureScheduleTemplate.tsx:1146-1419`) ditulis ulang. Kanvas tetap `BROCHURE_W×BROCHURE_H = 1080×1620`. **Semua ukuran mockup (lebar 344) diskalakan ~×3.14 ke 1080.**

Struktur atas→bawah (sesuai D1 v4):
1. **Background**: radial maroon (`#74121f→#5A0010→#2c0007`) + **pattern islami bintang-8** (SVG data-URI, gold, opacity ~8%, tile) + **glow** radial hangat di tengah + **rays** (boleh di-bake jadi PNG `cover-rays.png`, atau `repeating-conic-gradient` dengan toleransi degradasi anggun) + **bingkai arch mihrab** (border emas solid, rounded-top).
2. **Wordmark** "ALHIJAZ INDOWISATA" (teks, pale-gold, tracking lebar).
3. **Eyebrow** "KATALOG UMROH" (gold, tracking lebar).
4. **Judul "PAKET UMROH"** — **flat solid gold** (mis. `#D9A84A`) + **twin offset solid** gelap di belakang (depth). **TANPA** `background-clip:text`/transparent/`text-stroke`/`drop-shadow`. (Opsi premium: PNG `cover-title.png` pra-render foil — boleh menyusul.) Font: display (Playfair/serupa) — gunakan font brosur yang sudah self-host bila ada; kalau tidak, tetap pakai stack brosur.
5. **Date pill** "JUNI – DESEMBER 2026" (border emas solid, bg semi-transparan tipis).
6. **Hero Ka'bah** = `kabah.png` (PNG alpha). Blend via **glow radial** + **bayangan pijakan** (radial-gradient ellipse, BUKAN box-shadow/drop-shadow) + **gradien lantai** bawah. Ka'bah besar & membumi; area hero boleh menyusut (`flex:1; min-height:0; max-height`) agar footer selalu muat.
7. **TANPA ribbon statistik** (hapus "Paket Pilihan/Bulan Berangkat").
8. **Footer agent WOW**: panel solid maroon-gelap + **garis emas solid** di atas (bukan box-shadow), label "INFO & PENDAFTARAN", foto agent (di-**pre-inline** sbg dataURL) dgn **ring emas solid** + badge **verified** solid, **nama** (display) + **jabatan**, dan **tombol WhatsApp foil** (flat gold, no blur) **menampilkan nomor WA**. Footer `flex-shrink:0` supaya tidak terpotong.

Aturan raster-safe cover: tidak ada `background-clip:text`, `box-shadow` blur, negative-spread, `filter: drop-shadow/brightness/invert`, `mask-image`. Bayangan = radial-gradient background / solid offset. Warna emas = solid. Foto agent = dataURL sebelum capture.

Aset: reuse `kabah.png`. Opsional baru di `public/img-brosur/`: `cover-rays.png` (rays), `cover-title.png` (foil judul). Pattern = SVG data-URI inline.

## 4. Workstream B — Render-consistency hardening
**Pipeline** (`BrochureSchedulePage.tsx`):
- `CATALOG_SCALE` `1.5` → **`2`** (integer) (`:37`).
- Cover: `pdf.addImage` pakai **PNG** (lossless) atau JPEG quality **≥0.92** (`:38/:699`).
- **Pre-inline** `agent.photo` → dataURL **sebelum** `flushSync` mount cover (`:682/:704/:615-617`), dengan fallback avatar deterministik → capture tidak tergantung jaringan/cache per-HP.
- Untuk katalog, **wajibkan** embedded font CSS; jangan fallback ke scrape `font-display:swap` on-DOM (`:596-601`).

**Schedule per-bulan** (`BrochureScheduleTemplate.tsx`) — flatten kelas efek yang sama agar **seluruh PDF** konsisten, bukan cover saja:
- Judul gradient-clipped (`:667-677`) → **flat solid gold + twin**.
- Negative-spread shadow (`:1044`) → **solid offset**.
- `drop-shadow`/`box-shadow` blur → solid/baked.
- `brightness(0) invert(1)` / `mask-image` (bila ada di halaman ini) → PNG pra-proses / hapus.

## 5. Workstream C — Modal loading (konsep "A · Dokumen terisi")
Komponen baru, mis. `src/components/CatalogLoadingModal.tsx`.
- **Modal overlay** — **TIDAK mengubah struktur layout** halaman. Tombol "Unduh Katalog (PDF)" tetap; **progress bar inline + state busy inline DIHAPUS** dari tombol (`:962-981`), dipindah ke modal. Tombol cukup `disabled` saat modal aktif.
- Muncul saat `handleDownloadCatalog` mulai; tertutup saat selesai/gagal.
- Isi: **ikon PDF "terisi" dari bawah** mengikuti `catalogProgress` (done/total), **label per-langkah** ("Menyusun sampul…", lalu "Menyiapkan {namaBulan}… {done}/{total}", "Merangkai PDF…"), progres **ASLI**.
- Tema **maroon-gold** (senada cover). [emerald = opsi]
- Selesai: morph **✓** + auto-close + **toast** sukses. Gagal: state **error** + tombol Tutup/Coba lagi (modal tidak menggantung).
- Pakai pola Modal DESIGN-SYSTEM (centered dialog / bottom sheet) + Framer Motion (sudah dep) atau CSS.
- Wiring: `handleDownloadCatalog` set state `catalogOpen=true` + update `catalogStage`/`catalogProgress`; `finally` menutup (atau menampilkan error).

## 6. Edge cases
- Banyak halaman → progress akurat (done/total). 1 bulan → tetap jalan.
- Gagal capture/timeout → modal error, tombol kembali normal (tidak menggantung).
- Agent tanpa foto → fallback avatar (sudah ada) + tetap pre-inline.
- Nomor WA → format util footer brosur yang ada (lokal); jabatan ikut data agent bila ada, default "Konsultan Umroh Alhijaz".
- Fitur katalog ter-gate ke slug tertentu (`BrochureSchedulePage.tsx:149`) — pertahankan gating.

## 7. Verifikasi
- `npx tsc --noEmit` + `npm run build` lulus.
- **Tidak bisa** diverifikasi lintas-perangkat oleh agent (perlu HP asli). Acceptance sebenarnya: regenerasi katalog PDF di **iOS Safari + Android Chrome** (idealnya in-app WhatsApp) → cover & shadow identik. **Ditandai untuk user cek manual.**
- Modal: muncul tanpa menggeser layout, progress jalan, sukses ✓+toast, error tertangani.
- Review adversarial (workflow): audit raster-safety (tidak ada primitif terlarang tersisa di cover), spec-compliance, correctness/regресi schedule page.

## 8. Files
- `src/components/BrochureScheduleTemplate.tsx` — rewrite `BrochureCatalogCover` + flatten schedule page.
- `src/components/BrochureSchedulePage.tsx` — pipeline hardening + trigger modal (hapus progress inline).
- **Baru:** `src/components/CatalogLoadingModal.tsx`.
- **Aset (opsional):** `public/img-brosur/cover-rays.png`, `cover-title.png`.
