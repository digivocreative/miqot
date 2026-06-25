# Spec: Multi-Cover Katalog (7 pilihan cover)

**Tanggal:** 2026-06-25
**Fitur:** Agent bisa memilih salah satu dari 7 cover untuk PDF "Unduh Katalog" di `/dashboard/brosur`.
**Status:** Design — menunggu review user sebelum writing-plans.

## Latar belakang

Fitur "Unduh Katalog" (`BrochureSchedulePage.handleDownloadCatalog`) menghasilkan PDF =
halaman cover + satu halaman per bulan (paket tersedia, 10/halaman), dirender off-screen
lalu di-stitch dengan jsPDF. Cover dirender oleh komponen `BrochureCatalogCover`
(`src/components/BrochureScheduleTemplate.tsx`).

Saat ini cover **hanya 1**: artwork `public/img-brosur/cover-katalog.png` (langit merah,
logo + landmark + foto jamaah dibakar ke gambar) dengan dua overlay kode:
- **Headline** ("KATALOG UMROH / Paket Umroh / rentang bulan") di `top:150`, emas+putih
  di atas scrim radial kemerahan.
- **Pita kontak agent** di bawah (`height:158`, gradient maroon): foto, nama,
  "KONSULTAN UMROH ALHIJAZ", ikon WhatsApp + nomor.

Tujuan: tambah 6 cover sehingga agent bisa memilih yang disukai.

## Keputusan (hasil brainstorming)

1. **Sumber cover:** 6 PNG jadi dari desainer, sudah di-download ke
   `public/img-brosur/cover-katalog-2.png` … `cover-katalog-7.png` (sumber:
   `https://alhijaz.b-cdn.net/png/cover-katalog-N.png`). Disimpan di `public/`
   (same-origin) — **wajib** demi keamanan capture canvas (hindari taint); BUKAN
   lewat rewrite Bunny (itu khusus landing mandiri).
2. **Persistensi pilihan:** `localStorage` key `catalogCoverId`, divalidasi ke registry,
   default = `classic`. Backward-compatible: user lama tanpa key → classic (nol
   perubahan perilaku).
3. **Model overlay:** registry + config per-cover. Satu komponen `BrochureCatalogCover`
   membaca config; nilai classic = default.
4. **Headline:** tetap tampil di **semua** cover; karena 6 cover baru berlangit cerah
   (biru/sunset), tiap cover menyetel **scrim** sendiri agar headline terbaca. Warna teks
   (emas/putih/krem) tetap sama. Constraint raster-safe (tanpa text-shadow/drop-shadow)
   → legibilitas hanya dari scrim, jadi scrim cover cerah harus cukup gelap.
5. **Pita kontak agent:** tetap di semua cover (inti personalisasi). Gradient maroon
   existing (`#3c0008`, hampir hitam) terbaca sebagai pita gelap di atas latar apa pun →
   dipakai sama untuk semua (on-brand), field tetap bisa di-override per-cover bila perlu.
6. **Picker:** modal/bottom-sheet berisi grid 7 thumbnail (gambar penuh, `loading="lazy"`,
   di-mount hanya saat dibuka), yang terpilih di-highlight, simpan saat dipilih. Trigger =
   baris ringkas "Cover: [thumb] · Ganti" di atas tombol "Unduh Katalog".

## Inventaris cover

| id        | file                   | karakter                                   | scrim         |
|-----------|------------------------|--------------------------------------------|---------------|
| `classic` | `cover-katalog.png`    | langit merah, foto grup + landmark         | reddish (def) |
| `cover-2` | `cover-katalog-2.png`  | langit biru siang, foto grup + Kabah+tower | bright        |
| `cover-3` | `cover-katalog-3.png`  | langit biru, 1 jamaah ihram (minimalis)    | bright        |
| `cover-4` | `cover-katalog-4.png`  | langit biru, 1 jamaah ihram (lantai kayu)  | bright        |
| `cover-5` | `cover-katalog-5.png`  | sunset hangat, foto grup + landmark        | bright        |
| `cover-6` | `cover-katalog-6.png`  | langit biru+awan, tangan berdoa di bawah   | bright        |
| `cover-7` | `cover-katalog-7.png`  | langit biru, jamaah + koper Alhijaz        | bright        |

- **scrim `reddish` (default/classic):**
  `radial-gradient(58% 64% at 50% 30%, rgba(90,0,16,0.45) 0%, rgba(90,0,16,0) 72%)` (existing).
- **scrim `bright` (cover 2–7):** netral gelap top-gradient agar headline (≈y 9%–30%)
  terbaca di langit cerah, mis.
  `linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.28) 32%, rgba(0,0,0,0) 58%)`.
  Satu nilai dipakai untuk keenam cover (warna netral → aman di biru maupun sunset);
  per-cover bisa disetel ulang belakangan tanpa ubah komponen.

> Catatan tradeoff: pita ≈10% bawah akan menutup sebagian elemen bawah di #6 (tangan)
> & #7 (koper). Diterima sebagai konsekuensi (nomor WA agent wajib ada).

## Arsitektur & modul

Tiga unit terpisah (satu tanggung jawab masing-masing):

```
catalogCovers.ts (data+helper)  ──►  BrochureCatalogCover (render cover)
        ▲                                     ▲
        └──── CatalogCoverPicker ──── BrochureSchedulePage (state+persist+wiring)
```

### `src/lib/catalogCovers.ts` (baru — pure, testable)
Mengikuti pola "pure logic di lib" (categoryOps, kontenRoutes).
```ts
export type CatalogCover = {
  id: string;
  label: string;          // ditampilkan di picker
  image: string;          // path public, mis. '/img-brosur/cover-katalog-2.png'
  scrim?: string;         // CSS background; default = scrim classic
  // override opsional (default = nilai classic):
  headlineColor?: string;
  ribbonGradient?: string;
};
export const CATALOG_COVERS: CatalogCover[];   // 7 entri, classic pertama
export const DEFAULT_COVER_ID = 'classic';
export function getCatalogCover(id: string | null | undefined): CatalogCover; // fallback ke default
```
Label picker: "Classic", "Siang", "Ihram I", "Ihram II", "Sunset", "Doa", "Keberangkatan"
(boleh disesuaikan user; default deskriptif).

### `src/components/BrochureScheduleTemplate.tsx` (edit)
Refactor `BrochureCatalogCover` agar terima `cover: CatalogCover`:
- Pakai `cover.image` untuk `<img>` full-bleed (ganti `CATALOG_HERO_IMAGE` hardcoded).
- Pakai `cover.scrim ?? <scrim classic>` untuk div scrim headline.
- Pakai `cover.ribbonGradient ?? <maroon classic>` untuk gradient pita.
- `CATALOG_HERO_IMAGE` tetap ada sebagai konstanta default classic; update komentar
  re-sync untuk mencakup cover-katalog-2..7.
- `<img onError>` → fallback ke `CATALOG_HERO_IMAGE` (degradasi bila file hilang).

### `src/components/CatalogCoverPicker.tsx` (baru)
Props: `{ open: boolean; selectedId: string; onSelect: (id: string) => void; onClose: () => void }`.
- Modal/bottom-sheet; render hanya saat `open` (lazy-mount → gambar baru diunduh saat dibuka).
- Grid 7 thumbnail (`<img loading="lazy">` dari `cover.image`), aspect 2:3, terpilih
  di-highlight (border emerald + check).
- Klik thumbnail → `onSelect(id)` (parent simpan + boleh langsung tutup).

### `src/components/BrochureSchedulePage.tsx` (edit)
- State `coverId`, init dari `localStorage['catalogCoverId']` divalidasi via `getCatalogCover`,
  default classic; setter menulis localStorage (try/catch seperti pemakaian lain).
- UI trigger ringkas "Cover: [mini-thumb] · Ganti" di atas tombol Unduh Katalog → buka picker.
- Render `<CatalogCoverPicker>`.
- Di stage off-screen, ganti `<BrochureCatalogCover agent month />` →
  `<BrochureCatalogCover agent month cover={getCatalogCover(coverId)} />`.

## Data flow
1. Mount → baca+validasi `localStorage` → `coverId`.
2. Klik "Ganti" → picker terbuka → pilih → set state + tulis localStorage → picker tutup.
3. Klik "Unduh Katalog" → `handleDownloadCatalog` render cover terpilih off-screen →
   capture → PDF (alur existing tak berubah selain prop `cover`).

## Edge cases
- `localStorage` id tidak dikenal/legacy → `getCatalogCover` kembalikan default.
- File gambar hilang → `<img onError>` fallback ke gambar classic.
- `localStorage` akses gagal (private mode) → try/catch, fallback default (tetap jalan).

## Testing
- **Unit** (`tests/catalog-covers.test.js`, node:test seperti tes lain):
  - id unik & tidak kosong; `DEFAULT_COVER_ID` ada di registry.
  - `getCatalogCover('ngawur'|null|undefined)` → cover default.
  - setiap cover punya `image` non-kosong; (opsional) file ada di `public/img-brosur/`.
- **Verify FE:** `npx tsc --noEmit` + `npm run build` (vite). eslint v10 unconfigured (sesuai catatan proyek).
- **Manual:** `/dashboard/brosur` → buka picker → pilih tiap cover → reload (persist) →
  Unduh Katalog → cover di PDF sesuai pilihan + headline terbaca di langit cerah.

## Out of scope
- Tema winter halaman bulan (independen, tidak diubah).
- Sinkron pilihan lintas perangkat / backend (sengaja localStorage saja).
- Edit/upload cover dari dalam app (cover dikelola desainer + commit).

## Catatan aset/perf
7 PNG di `public/img-brosur/` (~6.7MB total) = static asset, hanya di-fetch saat cover
dirender / picker dibuka (lazy). Re-sync: `https://alhijaz.b-cdn.net/png/cover-katalog-N.png`.
