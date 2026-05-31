# Brosur "Musim Dingin" — Winter Theme (Direction B: Winter Wonderland)

## Ringkasan

Memberi tampilan brosur khusus bernuansa **musim dingin** ketika user memilih filter
**Umroh Musim Dingin** (dimensi Tipe Paket) di `/dashboard/ai-tools/brosur-jadwal`.

Saat ini filter tersebut hanya mengganti judul brosur jadi "MUSIM DINGIN"; visual brosur
tetap merah/emas seperti biasa. Perubahan ini menambah **varian tema "winter"** pada
`BrochureScheduleTemplate` — full cool makeover (biru/navy es) dengan landmark & pattern
yang di-tint dingin, salju moderat, dan ribbon tagline.

Direction dipilih lewat visual companion: **B · Winter Wonderland** (full cool makeover),
dengan keputusan detail:
- **Identity art** (Ka'bah/Nabawi + geometric pattern): **dipertahankan, di-tint dingin**.
- **Tagline ribbon**: "Umroh Sejuk & Nyaman".
- **Snow level**: moderat (flakes tersebar + drift lembut di bawah).

## Trigger

Winter aktif **jika dan hanya jika** filter brosur = Tipe Paket → `UMROH MUSIM DINGIN`.
Konstanta `TYPE_UMROH_MUSIM_DINGIN` sudah ada di `BrochureSchedulePage.tsx:150`.

Di `BrochureSchedulePage`:
```tsx
const isWinter = filterDim === 'tipe' && filterValue === TYPE_UMROH_MUSIM_DINGIN;
```
`variant={isWinter ? 'winter' : 'default'}` di-pass ke **kedua** instance
`BrochureScheduleTemplate` — preview on-screen (`BrochureSchedulePage.tsx:902`) dan node
export off-screen (`BrochureSchedulePage.tsx:969`) — supaya preview dan hasil JPG identik.

Tidak ada perubahan di backend (`/api/ai-tools/brosur-jadwal-bulan`), `filter-logic.ts`,
atau logika filter/`matchesPackageType` apa pun. Murni presentational.

## Arsitektur: Theme Token Object

`BrochureScheduleTemplate.tsx` meng-hardcode warna brand sebagai module constants
(`BRAND_RED`, `DEEP_RED`, `DARK_RED`, `GOLD`, `PALE_GOLD`, dst.) yang dipakai inline di
sepanjang komponen. Pendekatan: **kelompokkan warna brand-chrome ke dalam satu objek
`theme`, dipilih berdasarkan `variant`.**

### Prinsip kunci: zero regression untuk classic

Theme `CLASSIC` **memetakan setiap token ke nilai hex-nya yang sekarang persis**, sehingga
brosur non-winter render pixel-identik. Hanya keluarga warna merah/emas + background yang
di-tokenkan. Warna yang **tidak** berubah antar varian tetap jadi konstanta biasa di module
scope (tidak masuk theme):
- `INK` (#241A1C) — teks utama
- `#FFFFFF` — putih
- Warna sold-out (#475569, #1F2937, #64748B, #D71920, #374151)
- Warna pill paket (Hotel Bintang 5 #7A4F12, Kereta Cepat #0F766E, dll.)
- `#1D9BF0` — badge centang biru di foto agen

### Bentuk theme

```tsx
interface BrochureTheme {
  brandRed: string;       // BRAND_RED  → judul, aksen
  deepRed: string;        // DEEP_RED   → header tabel, harga, badge
  darkRed: string;        // DARK_RED   → gradient gelap
  gold: string;           // GOLD       → garis truncation
  paleGold: string;       // PALE_GOLD  → border/shadow aksen
  cream: string;          // CREAM      → footnote bg
  rowLine: string;        // ROW_LINE   → garis baris tabel
  canvasBackground: string;     // gradient background utama
  topBar: string;               // gradient accent bar atas
  titleGradient: string;        // gradient fill judul (linear-gradient ...)
  titleStroke: string;          // WebkitTextStroke color luar judul
  titleShadowGold: string;      // warna lapis bayangan judul (pale gold / frost)
  tableHeader: string;          // gradient header tabel
  badgeGradient: string;        // gradient badge tanggal
  badgeBorder: string;          // border badge tanggal
  footerGradient: string;       // gradient footer
  footerBorder: string;         // border footer
  patternUrl: string;           // ISLAMIC_PATTERN_BG (tint sesuai varian)
  landmarkFilter: string;       // CSS filter utk img landmark (warm vs cool)
}

const CLASSIC_THEME: BrochureTheme = { /* nilai hex existing, 1:1 */ };
const WINTER_THEME: BrochureTheme = { /* biru/navy es */ };

function getTheme(variant: 'default' | 'winter'): BrochureTheme {
  return variant === 'winter' ? WINTER_THEME : CLASSIC_THEME;
}
```

Di dalam komponen: `const theme = getTheme(variant);` lalu ganti referensi konstanta
brand inline → `theme.brandRed` dst. Konstanta warna brand lama boleh tetap ada sebagai
sumber nilai `CLASSIC_THEME` (mis. `brandRed: BRAND_RED`) agar diff kecil dan jelas.

## Perubahan visual WINTER vs CLASSIC

| Elemen | Classic | Winter |
|---|---|---|
| Canvas background | cream/putih/sage | gradient biru-putih es |
| Accent bar atas | gradient merah | gradient navy→biru→langit |
| Judul "MUSIM DINGIN" | gradient merah + shadow emas | gradient biru + stroke putih/frost |
| Header tabel | gradient deep-red | gradient navy→biru |
| Badge tanggal | gradient merah, border emas | gradient biru, border putih |
| Harga / jumlah hari | deep red | biru |
| Footer pill | gradient merah, border emas | gradient navy/biru, border frost |
| Geometric pattern | stroke merah+emas | stroke biru (data-URI tinted) |
| Landmark Ka'bah/Nabawi | warm | cool-tinted via CSS filter |

**Sama di kedua varian:** logo Alhijaz PNG, badge "5 Pasti Umrah" (aset brand — tidak
direcolor agar tidak distorsi), nama paket, pills, stamp SOLD OUT, layout & spacing,
ukuran font, `showFullDate` behavior.

### Palet winter (acuan, boleh di-tune saat implementasi)

- Navy gelap `#172554`, navy `#1E3A8A`, biru `#1D4ED8`/`#2563EB`, langit `#7DD3FC`
- Frost border `#BFDBFE`/`#93C5FD`, background es `#CFE0FB`→`#EAF2FF`→`#F7FBFF`→`#E3EDFF`
- Snowflake stroke `#BCD9FF` / `#9EC3F5`

### Pattern tinted

`ISLAMIC_PATTERN_BG` adalah data-URI SVG dengan `stroke='%23C8102E'` (merah) dan
`%23C98A2C` (emas). Versi winter: data-URI sama tapi stroke biru (mis. `%232563EB`).
Masuk sebagai `theme.patternUrl`.

### Landmark cool-tint

Img `DOME_IMAGE`, `KABAH_IMAGE`, `NABAWI_WIDE_IMAGE` saat ini pakai `filter: 'saturate(...)
...'`. Winter menambah hue-rotate ke biru, mis.:
`grayscale(1) brightness(1.15) sepia(1) hue-rotate(178deg) saturate(2.2) opacity(0.5)`.
Disimpan sebagai `theme.landmarkFilter` dan menggantikan/menggabung filter existing per img.
Nilai final di-tune saat implementasi agar landmark tetap terbaca, tidak terlalu pekat.

## Elemen winter-only (gated `variant === 'winter'`)

Dirender **hanya** saat winter; classic render path tidak tersentuh.

1. **Snowflakes** — ~5–7 inline **SVG** (BUKAN emoji ❄). Alasan: export JPG lewat
   `modern-screenshot` (DOM→canvas); glyph emoji render tidak konsisten antar device,
   SVG aman (pola sama seperti `WhatsAppIcon`). Tersebar low-opacity, `zIndex` di atas
   background tapi di bawah tabel/footer, posisi menghindari area tabel agar tidak ganggu
   keterbacaan. Absolute-positioned dalam container brosur.
2. **Snow drift** — radial-gradient putih lembut di sepanjang tepi bawah (di belakang
   footer, `zIndex` rendah).
3. **Ribbon tagline** — pill "❄ Umroh Sejuk & Nyaman ❄" di bawah judul, di atas/di dekat
   URL pill. Background gradient biru, teks putih, border frost. Teks statis (tidak
   bergantung data).

Snowflakes & ribbon memakai SVG/teks self-contained → tidak menambah font baru, aman export.

## Komponen & file

- `src/components/BrochureScheduleTemplate.tsx`
  - Tambah `variant?: 'default' | 'winter'` ke `BrochureScheduleTemplateProps`.
  - Tambah `BrochureTheme`, `CLASSIC_THEME`, `WINTER_THEME`, `getTheme`.
  - Ganti referensi warna brand inline → token `theme.*`.
  - Tambah blok winter-only (snowflakes, drift, ribbon) gated `variant === 'winter'`.
- `src/components/BrochureSchedulePage.tsx`
  - Hitung `isWinter` dan pass `variant` ke dua instance template.

Tidak ada file lain. Tidak ada perubahan backend/API/filter.

## Verifikasi manual

Tidak ada infra unit-test untuk brosur (precedent existing). Verifikasi:

1. Load `/dashboard/ai-tools/brosur-jadwal` dengan akun yang punya paket Des/Jan winter.
2. Tipe Paket → **Umroh Musim Dingin** → preview tampil bernuansa **biru winter**
   (background es, judul biru, header tabel biru, badge biru, footer biru), landmark &
   pattern ter-tint dingin, snowflakes + ribbon "Umroh Sejuk & Nyaman" + drift muncul.
3. Ganti ke filter lain (Bulan / Tipe lain / Maskapai) → brosur kembali **merah/emas
   persis seperti sebelumnya** (zero regression).
4. **Download** JPG saat winter → file cocok dengan preview; snowflakes (SVG) dan tint
   landmark/pattern ikut ter-render (tidak hilang/jadi kotak).
5. Multi-page (>10 paket winter): semua halaman konsisten winter.
6. Sold-out row di winter: stamp SOLD OUT tetap tampil benar (warna sold-out tidak
   di-tokenkan, jadi tidak berubah).

## Out of scope

- Tidak mengubah trigger/logika filter Musim Dingin (sudah ada).
- Tidak menambah varian musiman lain (Ramadan, Akhir Tahun) — tapi arsitektur theme-token
  membuatnya mudah ditambah nanti.
- Tidak merecolor aset PNG brand (logo, 5 Pasti Umrah).
- Tidak mengubah layout, spacing, kolom tabel, atau ukuran font.
- Tidak mengubah backend, API, atau `filter-logic.ts`.

## Catatan implementasi

- `CLASSIC_THEME` HARUS 1:1 dengan nilai sekarang — bandingkan render sebelum/sesudah pada
  filter non-winter untuk memastikan tidak ada pergeseran warna.
- Snowflakes: pakai SVG stroke, bukan `❄` emoji (alasan export di atas).
- Semua elemen winter absolute-positioned & gated; pastikan `zIndex` tidak menutupi tabel
  atau footer (snow di belakang konten utama).
- Tune `landmarkFilter` & opacity snow agar brosur tetap terbaca, tidak ramai.
