# Popup Itinerary 2 Tab (Itinerary Parsed + Preview PDF) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Popup itinerary di Jadwal (saat ini PDF-only) menjadi 2 tab: Tab **"Itinerary"** menampilkan hasil parsing (tampilan yang sama dengan halaman link share `/:slug/:jadwalId/itinerary`), Tab **"Preview PDF"** mempertahankan viewer PDF yang ada.

**Architecture:** Semua perubahan frontend terpusat di `src/components/ItineraryModal.tsx` — keempat call-site (PackageCard, UpcomingSchedule, AskAIModal, BaniPage) **tidak disentuh** karena props yang dibutuhkan (`paket` / `jadwalId`) sudah dikirim semua. Tab bar memakai `SegmentedControl` kanon. Tab Itinerary merender `WebItineraryView` (komponen presentasional murni yang sudah dipakai SharePage) dengan data dari `GET /api/itinerary/:jadwalId` cache-only. Tab PDF = seluruh blok viewer react-pdf existing, lazy-mount saat pertama aktif lalu keep-alive via `hidden`. Server hanya mendapat satu perubahan aditif: field `source_sha256` di respons `/api/itinerary` untuk deteksi cache basi.

**Catatan sejarah:** fitur ini sudah diantisipasi kode lama — komentar `AskAIModal.tsx:40` dan `server.js:2173` menyebut "tab Tampilan web di ItineraryModal (fetch /api/itinerary/:jadwalId)"; prop `jadwalId` di ItineraryModal ditambahkan untuk itu.

## Keputusan Produk (terkunci 8 Agt 2026)

1. **Tab default = "Itinerary"** (parsed). Bila data tidak tersedia **dan** user belum menyentuh tab, auto-fallback diam-diam ke tab PDF.
2. **Cache-only**: fetch `/api/itinerary/:jadwalId` **tanpa** `?pdfUrl` (pola SharePage). Paket belum ter-cache → fallback PDF; parsing diserahkan background sync 12 jam. Tidak ada parse on-demand dari modal.
3. **Tombol "Itinerary PDF" & "Brosur" milik JourneyStrip disembunyikan** di dalam modal via prop baru `hideDocActions` di `WebItineraryView` (duplikatif dengan footer modal; BrochureModal nested akan bentrok z-index). SharePage tidak berubah.
4. **Deteksi cache basi ikut rilis pertama**: server kembalikan `source_sha256`, FE banding dengan `?v=sha16` di `fileUrl` → banner "sedang disinkronkan" bila beda (kasus JBU1513).

## Global Constraints

- **stopPropagation WAJIB di root modal**, mendarat di commit yang sama dengan tab bar — memory `portal-modal-bubbles-to-card-toggle`; tiru `BrochureModal.tsx:225-227` beserta komentarnya. ItineraryModal saat ini belum punya (bug laten).
- **JANGAN tambah handler Escape** di modal — `UpcomingSchedule.tsx:252-262` mengandalkan ketiadaannya untuk menahan Escape sheet di bawahnya.
- Pane parsed **light-only by design** (token `itin-*`, latar `#F6F1EA`) — diperlakukan sebagai "dokumen terang" di atas modal gelap, sama seperti kertas PDF putih. **JANGAN** hapus kelas `dark` dari `<html>` ala SharePage (mengubah tema seluruh app). Jangan men-dark-mode-kan token `itin-*`.
- **JANGAN pakai `animate-in`/`fade-in-*`** — `tailwindcss-animate` tidak terpasang, kelas itu no-op. Tab bar: utilitas transisi inti. Pergantian konten TANPA animasi key-swap (lihat deviasi di Task 5 — key-swap bertabrakan dengan keep-alive pane PDF).
- `ItineraryModal` tetap **lazy import + Suspense** di PackageCard — jangan ubah jadi import statis.
- Dua pola lifecycle call-site berbeda: PackageCard always-mounted + toggle `isOpen`; tiga lainnya conditional-render `isOpen={true}`. Semua reset state baru masuk **useEffect `[isOpen, fileUrl]` yang sudah ada** (baris ~166-176) agar konsisten di kedua pola.
- `effectiveJadwalId = paket?.jadwalId ?? jadwalId` bisa **null** (attachment AskAI) → tab bar disembunyikan total, modal berperilaku persis seperti sekarang (PDF-only). Tanpa tab disabled.
- Bentuk data `content = {days:[{dayNumber,title,location,activities:[{time,text}|string]}]}` dipakai banyak konsumen — **jangan ubah skema**; perubahan server hanya aditif.
- `activities` bisa string polos ATAU `{time,text}` — sudah ditangani WebItineraryView, jangan asumsikan objek.
- Verifikasi tipe **hanya `npx tsc --noEmit`** — JANGAN `npm run build` di working dir prod (memory `build-in-prod-dir-blanks-site`).
- Perubahan `server.js` + FE **satu commit** — push = auto-deploy ~1 menit (memory `push-auto-deploys-via-webhook`).

## File Structure

| Berkas | Status | Tanggung jawab |
| ------ | ------ | -------------- |
| `server.js` (`/api/itinerary`, ~2880-2918) | Ubah (kecil) | Select + respons ikutkan `source_sha256`; cabang on-demand jadi upsert + `generated_at` |
| `src/components/WebItineraryView.tsx` | Ubah (kecil) | Prop `hideDocActions?: boolean` — jangan teruskan `pdfUrl`/`brosurUrl` ke JourneyStrip |
| `src/components/ItineraryModal.tsx` | Ubah (inti, ±150 baris) | stopPropagation, state tab, tab bar, fetch parsed, resolve paket, 2 pane, banner basi |

Tidak ada file baru, tidak ada perubahan di 4 call-site, `JourneyStrip.tsx` tidak disentuh (tombolnya sudah kondisional terhadap URL yang diteruskan — `JourneyStrip.tsx:112`).

---

### Task 1: Server — `source_sha256` di respons `/api/itinerary` + rapikan cabang on-demand

**Files:** Modify: `server.js` (~2880-2918)

- [x] Cabang cache-hit: `select('content, generated_at')` → tambah `source_sha256`; respons jadi `{success:true, data:content, cached:true, source_sha256}`.
- [x] Cabang on-demand (miss): sertakan `source_sha256` hasil parse di respons; ganti `insert` biasa → `upsert` `onConflict:'jadwal_id'` dengan `generated_at` eksplisit, dan periksa error-nya (log, jangan telan) — saat ini insert paralel gagal diam-diam.
- [x] Konsumen lama (SharePage, CompareDocument, PerjalananPage) hanya baca `.data` — field tambahan aman, verifikasi sekilas dengan grep.
- [x] Verifikasi: `node --check server.js`.

### Task 2: `WebItineraryView` — prop `hideDocActions`

**Files:** Modify: `src/components/WebItineraryView.tsx` (interface Props + pemanggilan JourneyStrip ~109-115)

- [x] Tambah `hideDocActions?: boolean` (default false). Bila true, teruskan `pdfUrl={undefined}` dan `brosurUrl={undefined}` (atau setara) ke `JourneyStrip` — tombol "Itinerary PDF" & "Brosur" otomatis tak render karena sudah kondisional.
- [x] SharePage tidak berubah (default false). Verifikasi: `npx tsc --noEmit`.

### Task 3: `ItineraryModal` — shell tab

**Files:** Modify: `src/components/ItineraryModal.tsx`

- [x] **stopPropagation**: `onClick={(e) => e.stopPropagation()}` di root `motion.div` (~483) + komentar rujukan BrochureModal.
- [x] State: `activeTab: 'itinerary' | 'pdf'`, ref `userTouchedTab`. Initial: `'itinerary'` bila `effectiveJadwalId`, selain itu `'pdf'`. Reset keduanya di effect `[isOpen, fileUrl]` existing.
- [x] Tab bar `SegmentedControl` (import dari `common/SegmentedControl`): options `[{value:'itinerary', label:'Itinerary'}, {value:'pdf', label:'Preview PDF'}]`, accent emerald, ikon (mis. `Route`/`FileText`), sticky di bawah header: wrapper `flex-none px-4 py-2 bg-white dark:bg-slate-900 border-b border-gray-200/60 dark:border-slate-700/60`. **Hanya render bila `effectiveJadwalId`**. `onChange`: set tab + `userTouchedTab.current = true` + `trackEvent('action','itinerary_tab_switch',{tab})`.
- [x] Subtitle header dinamis: tab itinerary → `'N hari perjalanan'` (dari days; fallback `'Tampilan web'` saat loading), tab pdf → `'Dokumen PDF · N halaman'` seperti sekarang.

### Task 4: `ItineraryModal` — fetch parsed (cache-only) + resolve paket + auto-fallback

**Files:** Modify: `src/components/ItineraryModal.tsx`

- [x] State: `webContent`, `webStatus: 'idle'|'loading'|'ready'|'error'`, `webSha: string|null`, `resolvedPaket`. Reset di effect `[isOpen, fileUrl]`.
- [x] Effect fetch saat `isOpen && effectiveJadwalId`: `fetch('/api/itinerary/' + encodeURIComponent(id))` **TANPA `?pdfUrl`** (pola `SharePage.tsx:37-51`; jangan buka vektor cache-poisoning endpoint publik). HTTP 400/non-OK/days kosong → `'error'`. Simpan `source_sha256` → `webSha`. Flag `cancelled` di cleanup agar respons telat tidak menimpa state modal yang sudah ditutup/berganti file.
- [x] Paralel: bila `!paket`, `getPackageById(effectiveJadwalId)` (data-service, cache localStorage) → `resolvedPaket`; gagal = biarkan null (view render days-only tanpa FlightCard/HotelCard — degradasi anggun, non-blocking). `effectivePaket = paket ?? resolvedPaket`.
- [x] **Auto-fallback**: saat fetch resolve `'error'` DAN `!userTouchedTab.current` → `setActiveTab('pdf')` (tanpa menandai touched — tab Itinerary tetap bisa dibuka manual dan menampilkan empty-state). Jangan pernah override pilihan manual user (race fetch-vs-klik).

### Task 5: `ItineraryModal` — restrukturisasi konten jadi 2 pane

**Files:** Modify: `src/components/ItineraryModal.tsx` (konten ~509-625, effect measure ~183-197, effect pinch ~360-417)

- [x] Dua pane sibling, masing-masing `flex-1 min-h-0 overflow-y-auto` sendiri, toggle via kelas `hidden` (BUKAN unmount setelah pertama aktif).
- [x] **Pane Itinerary**: kontainer `bg-[#F6F1EA]`, isi `<div className="mx-auto max-w-md"><WebItineraryView content={webContent} loading={webStatus==='loading'} error={...} paket={effectivePaket} hideDocActions onRetryPdf={() => { setActiveTab('pdf'); userTouchedTab.current = true; }} /></div>` (max-w-md = lebar desain SharePage). *Deviasi sadar dari draf:* transisi konten `AnimatePresence key={activeTab}` TIDAK dipakai — key-swap meng-unmount pane dan membatalkan keep-alive PDF; pane di-toggle `hidden` tanpa animasi konten (pola SettingsPage), umpan balik visual dari transisi pill SegmentedControl.
- [x] **Pane PDF**: seluruh blok viewer existing (contentRef, zoom stage, Document/Page, image fallback, empty state) — **mount-on-first-activate**: belum pernah aktif → tidak dirender (react-pdf + unduhan PDF tak dipicu sia-sia; default tab itinerary berarti banyak sesi tak pernah memuatnya); sesudah aktif → keep-mounted, sembunyikan via `hidden`.
- [x] **Guard ResizeObserver** (measure pdfWidth ~187-191): early-return bila `el.clientWidth <= 0` — tanpa ini pengukuran saat `hidden` men-set lebar minimum 280 dan react-pdf re-render semua halaman 2× tiap pindah tab. Re-measure saat `activeTab` kembali ke `'pdf'`. (Measure zoomContent ~203-213 sudah punya guard sendiri.)
- [x] **Effect pinch-zoom** (~360-417): deps saat ini `[isOpen]` — contentRef baru ada setelah pane PDF pertama kali mount, jadi tambahkan dep state mount pane PDF agar listener ter-attach; gate kontrol zoom melayang + `touchAction` hanya saat `activeTab === 'pdf' && !isPdfLoading`.
- [x] Footer (Link + Bagikan/Unduh PDF) TIDAK berubah dan tampil di kedua tab — tombol "Link" menyalin URL SharePage yang tampilannya = Tab Itinerary, koheren.
- [x] Perbaikan kecil menumpang: tambah `onError` di cabang `<img>` (~612-621) agar `isPdfLoading` tidak macet `true` saat gambar gagal muat.

### Task 6: Banner cache basi (kasus JBU1513)

**Files:** Modify: `src/components/ItineraryModal.tsx` (pane Itinerary)

- [x] Ekstrak param `v` (sha16) dari `fileUrl` CDN (`?v=` — hanya ada di URL Bunny). Bila `webSha` ada, `v` ada, dan `!webSha.startsWith(v)` → tampilkan banner kecil non-blocking di atas pane Itinerary: "PDF baru diperbarui — tampilan web sedang disinkronkan otomatis". Konten parsed tetap ditampilkan di bawah banner (sync 12 jam akan re-parse; guard server tidak menyaring konten mentah endpoint ini, banner adalah satu-satunya sinyal ke user).
- [x] `fileUrl` tanpa `?v=` (jalur proxy non-CDN) atau respons tanpa `source_sha256` → tanpa banner (fail-open).

### Task 7: Verifikasi & QA

- [x] `npx tsc --noEmit` bersih (13 error pre-existing yang sama persis dengan baseline — bukan dari perubahan ini) + `node --check server.js` + `node --test tests/itinerary-modal-zoom.test.js tests/upcoming-schedule-itinerary.test.js` 7/7 hijau. (JANGAN `npm run build` di dir prod.)
- [ ] Matriks manual — 4 call-site × light/dark:
  - **PackageCard**: klik-klik area tab & pane TIDAK men-toggle kartu di belakang; exit animation tetap jalan (pola always-mounted).
  - **UpcomingSchedule**: modal di atas bottom sheet; Escape menutup modal via guard sheet (kontrak tetap); `jadwalId` null → tab bar hilang, PDF-only.
  - **AskAIModal**: attachment dengan `jadwal_id` null → PDF-only; dengan `jadwal_id` → tab jalan, FlightCard/HotelCard muncul via `getPackageById`.
  - **BaniPage**: buka dari kartu media Bani.
- [ ] Pinch-zoom PDF tetap berfungsi setelah bolak-balik tab dua arah; lebar halaman tidak kolaps ke 280.
- [ ] Paket tanpa cache parsed (atau `jadwalId` fiktif) → auto-fallback ke tab PDF tanpa flash error; tab Itinerary manual → empty-state + tombol "Buka dokumen PDF".
- [ ] Dark mode: pane Itinerary tampil sebagai dokumen terang; sambungan visual tab bar gelap → pane terang wajar.
- [ ] Commit FE + server utuh satu commit; push = auto-deploy.

## Risiko yang diterima secara sadar

- Paket baru di antara dua siklus sync 12 jam → tab Itinerary "belum tersedia" (fallback PDF) sampai sync berikutnya. Trade-off keputusan cache-only.
- `getPackageById` bergantung cache `getPackages` — sesi dingin di jalur AskAI/Bani bisa tanpa FlightCard/HotelCard (days-only tetap tampil).
- Chunk lazy ItineraryModal membengkak (ikut menyeret WebItineraryView + DayRail dkk) — tetap code-split; lirik ukuran chunk saat deploy.
- Worker pdf.js masih dari CDN unpkg (UmrohPernyataanPdfPreview sudah bundle lokal) — penyeragaman DILUAR scope ini, jangan tambah setup worker ketiga.
