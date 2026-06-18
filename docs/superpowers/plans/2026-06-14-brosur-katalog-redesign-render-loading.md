# Plan: Cover Katalog baru + Render Konsisten + Modal Loading

> Sumber desain: `docs/superpowers/specs/2026-06-14-brosur-katalog-redesign-render-loading-design.md`.
> Eksekusi otonom (user memberi izin "lanjutkan sampai selesai"). Verifikasi: `npx tsc --noEmit` + `npm run build` tiap milestone; review adversarial via workflow; commit + push ke `main`.

**Goal:** Cover katalog PDF lebih premium & raster-safe (sekaligus menyembuhkan render tidak konsisten antar perangkat), + modal loading "dokumen terisi" yang tidak mengubah layout.

**Tech:** React + TS + Tailwind inline-style; `modern-screenshot` + `jsPDF`; Framer Motion (ada).

---

## Task 1 — Cover baru `BrochureCatalogCover` (raster-safe, target = mockup D1 v4)
**File:** `src/components/BrochureScheduleTemplate.tsx` (rewrite `BrochureCatalogCover` ~1146-1419; helpers 1114-1141)
- [ ] Porting struktur D1 v4 ke kanvas 1080×1620 (skala ~×3.14 dari mockup 344).
- [ ] Background: radial maroon + pattern islami bintang-8 (SVG data-URI, opacity ~8%) + glow radial + rays (conic, toleransi) + arch mihrab (border emas solid).
- [ ] Judul "PAKET UMROH" = flat solid gold + twin offset solid (HAPUS background-clip:text/transparent/text-stroke/drop-shadow).
- [ ] Hero Ka'bah (`kabah.png`) + glow + bayangan pijakan (radial-gradient ellipse) + gradien lantai (BUKAN box-shadow/drop-shadow); hero `flex:1; min-height:0` + Ka'bah `max-height`.
- [ ] HAPUS ribbon statistik.
- [ ] Footer agent WOW: panel solid + garis emas solid + label + foto(ring emas+verified, dataURL) + nama + jabatan + tombol WhatsApp foil dgn nomor WA; `flex-shrink:0`.
- [ ] Tidak ada primitif terlarang (box-shadow blur, negative-spread, drop-shadow, brightness/invert, mask-image, background-clip:text).
- [ ] `npx tsc --noEmit`.

## Task 2 — Flatten schedule per-bulan (raster-safe)
**File:** `src/components/BrochureScheduleTemplate.tsx`
- [ ] Judul gradient-clipped (~667-677) → flat solid gold + twin.
- [ ] Negative-spread shadow (~1044) → solid offset.
- [ ] drop-shadow/box-shadow blur, brightness/invert, mask-image (bila ada) → solid/baked/PNG.
- [ ] `npx tsc --noEmit`.

## Task 3 — Pipeline hardening
**File:** `src/components/BrochureSchedulePage.tsx`
- [ ] `CATALOG_SCALE` 1.5 → 2 (~:37).
- [ ] Cover addImage → PNG atau JPEG q≥0.92 (~:38/:699).
- [ ] Pre-inline `agent.photo` → dataURL sebelum flushSync mount cover (fallback avatar deterministik).
- [ ] Wajibkan embedded font CSS untuk katalog (jangan fallback scrape swap, ~:596-601).
- [ ] `npx tsc --noEmit`.

## Task 4 — Modal loading "Dokumen terisi"
**File baru:** `src/components/CatalogLoadingModal.tsx`; wire di `BrochureSchedulePage.tsx`
- [ ] Komponen modal overlay (centered/bottom-sheet, pola DESIGN-SYSTEM, Framer Motion); props: open, stageLabel, done, total, status(loading/success/error), onClose.
- [ ] Animasi ikon PDF "terisi" mengikuti done/total + label langkah + maroon-gold; ✓ morph saat success; error state.
- [ ] `handleDownloadCatalog`: set open + update stage/progress; finally close/success/error.
- [ ] HAPUS progress bar inline + state busy inline dari tombol (~:962-981); tombol cukup disabled saat aktif (layout tidak berubah).
- [ ] `npx tsc --noEmit` + `npm run build`.

## Task 5 — Verifikasi akhir + review + commit/push
- [ ] `npx tsc --noEmit && npm run build`.
- [ ] Workflow review adversarial: raster-safety audit + spec-compliance + regresi schedule.
- [ ] Perbaiki temuan.
- [ ] Commit ke `main` + push origin. (Aset baru bila ada di-add eksplisit.)
- [ ] Ringkasan + catatan "cek manual PDF di iOS Safari + Android Chrome".
