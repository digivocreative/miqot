# Hasil Bandingkan Paket: rombak desain & ganti keluaran ke PDF

Tanggal: 2026-08-05
Berkas mockup: `~/Downloads/compare-pdf.pen` — frame `FINAL — Tabel + Hero Keputusan`
(tiga alternatif yang ditolak/diserap tetap di berkas yang sama: `ALT 1 — Dua Kolom
Klasik`, `ALT 2 — Kartu Pemenang`, `ALT 3 — Linimasa Perjalanan`)

Lanjutan dari `2026-08-05-compare-tier-paket-design.md`; seluruh aturan tier di
sana tetap berlaku dan tidak diulang di sini.

## Masalah

Keluaran halaman Bandingkan Paket sekarang adalah **PNG hasil tangkapan DOM**:
`handleExportPDF` merakit ±300 baris `document.createElement` di luar layar, lalu
`domToBlob` dari `modern-screenshot` memotretnya (`ComparePage.tsx:489`).

1. **Teksnya raster.** Tidak bisa dicari, tidak bisa di-zoom tanpa pecah, dan di
   WhatsApp gambar panjang dikompresi sampai angka harga kabur.
2. **Dua desain terpisah untuk data yang sama.** Modal di layar dan DOM ekspor
   dirakit sendiri-sendiri, jadi tiap perubahan harus dikerjakan dua kali dan bisa
   berbeda diam-diam. Bug tier kemarin muncul di dua tempat karena ini.
3. **Isinya kurang menjual.** Tak ada kesimpulan, tak ada selisih harga, rincian
   penerbangan hilang dari gambar walau ada di modal, dan rantai perjalanan —
   pembeda terbesar antara paket PLUS dan REGULER — tidak muncul sama sekali.
4. **Font ditambal.** `cachedInterFontCSS` mengunduh 4 file woff2 dari
   `fonts.gstatic.com` lalu menyuntikkannya sebagai data URI, padahal Inter sudah
   di-self-host di `/public/fonts` untuk PDF quotation.

## Bentuk yang dipilih

Satu dokumen PDF, lebar A4 potret (595.28pt), **tinggi dinamis, selalu satu
halaman** — pola yang sudah terbukti di `QuotationDocument.tsx:239`. Susunannya:

```
┌ accent bar burgundy 4pt ────────────────────────────────┐
│ PT ALHIJAZ INDOWISATA          [PERBANDINGAN PAKET]     │
├─────────────────────────────────────────────────────────┤
│ SELISIH HARGA           ┌ HARGA ┐┌ HOTEL ┐┌ SEAT ┐      │  hero
│ Rp 2.700.000            │PAKET A││PAKET B││PAKET A│     │  burgundy
│ lebih hemat di PAKET A  └───────┘└───────┘└──────┘      │
├──────────────────────────┬──────────────────────────────┤
│ PAKET A         [HEMAT]  │ PAKET B          [UHUD]      │  pita paket
│ HEMAT PLUS DUBAI 10HR    │ REGULER 9HR                  │  burgundy
│ EMIRATES • 10 HARI       │ GARUDA • 9 HARI              │
│ (Tur Dubai)›(Madinah)›(Umroh) │ (Umroh)›(Madinah)       │
├──────────┬───────────────┴──────────────────────────────┤
│ ▪ HARGA PER JAMAAH                                      │
│ KAMAR    │ Rp 31.200.000     │ Rp 33.900.000            │  sel menang
│ QUAD     │ hemat Rp 2.700.000│                          │  berlatar emas
│ … PENERBANGAN · HOTEL & AKOMODASI · KETERSEDIAAN …      │
│ ITINERARY│ [QR] rincian harian │ [QR] rincian harian    │
├─────────────────────────────────────────────────────────┤
│ agent + kontak            disclaimer + kode jadwal      │  footer burgundy
└─────────────────────────────────────────────────────────┘
```

Tinggi mockup dengan data JBU1569 vs JBU1491: **893pt**.

Gabungan ini dipilih setelah tiga alternatif dibandingkan langsung. Tabel
berlabel-kiri menang untuk badan dokumen karena tugas utamanya memang
membandingkan: mata bergerak mendatar dan tak perlu mengingat angka seberang.
Hero dipakai karena "mana yang saya ambil" adalah pertanyaan pertama jamaah, dan
pita teks berpoin tiga (Alternatif 1 asli) menjawabnya terlalu pelan. Alternatif 3
(linimasa perjalanan) tidak dipakai utuh — kekuatannya sudah tertampung sebagai
pil rantai di pita paket, tanpa mengorbankan perbandingan harga per tipe kamar.

## Modal di layar

Modal berubah jadi **pratinjau PDF**, meniru alur Kalkulasi: tekan Bandingkan →
blob PDF dirender → tampil di viewer `react-pdf` → tombol Unduh/Bagikan. Tabel
HTML di modal dibuang seluruhnya.

Alasannya masalah nomor 2 di atas: selama ada dua tampilan untuk data yang sama,
keduanya akan menyimpang. Dengan pratinjau PDF, yang dilihat agent persis yang
diterima jamaah.

## Modul baru

### `src/lib/compareVerdict.js` + `.d.ts`

Logika kesimpulan sebagai fungsi murni (pola `packageTiers.js`), diuji di
`tests/compare-verdict.test.js`. Semua **fail-closed**: data kurang berarti chip
tidak menyebut pemenang, bukan menebak.

| Fungsi | Aturan |
| --- | --- |
| `headlinePriceGap(a, b)` | Selisih pada tipe kamar **termurah yang kedua sisinya > 0**, dicoba berurutan Quard → Triple → Double. Balik `null` bila tak ada satu pun tipe yang bisa dibandingkan. |
| `priceWinner(a, b)` | Sisi yang lebih murah di **mayoritas** tipe kamar yang bisa dibandingkan; seri atau tak ada data → `null`. |
| `hotelWinner(a, b)` | Skor = jumlah bintang Mekkah + Madinah. Seri → yang jaraknya lebih dekat (Mekkah dulu, lalu Madinah). Bintang tak lengkap di salah satu sisi → `null`. |
| `seatWinner(a, b)` | Sisa seat lebih banyak; sama → `null`. |
| `buildCompareVerdict(a, b)` | Merangkai keempatnya jadi objek hero: `{ gap, chips: [{aspek, pemenang, detail}] }`. |

Jarak hotel dibandingkan setelah dinormalkan dari teks bebas (`"±400m"`,
`"±1,5 km"`) ke meter. Format yang tak terbaca dianggap tak diketahui, bukan nol —
kalau tidak, hotel tanpa data jarak selalu "menang".

### `src/components/CompareDocument.tsx`

Dokumen `@react-pdf/renderer`, mencontoh `QuotationDocument.tsx`: `StyleSheet`,
Inter dari `/public/fonts` (`Font.register` + `registerHyphenationCallback`), warna
`C = { primary:'#b40200', gold:'#c18f1f', … }`, tinggi halaman dijumlah per blok.

Menerima paket + tier yang **sudah diresolusi** (`resolvePackageTier` dipanggil
pemanggil, bukan di dalam dokumen) supaya dokumen ini murni penyaji.

### `generateComparePdfBlob()`

Diekspor dari `CompareDocument.tsx`, meniru `generateQuotationPdfBlob`
(`KalkulasiResultModal.tsx:161`):

- **Foto agent lewat canvas → PNG data URL.** Wajib: react-pdf tidak bisa membaca
  progressive JPEG, dan foto agent dari Bunny sering progressive.
- **QR lewat `qrcode.toDataURL`** lalu dipasang sebagai `<Image>`. Dependensi
  `qrcode` sudah ada dan sudah dipakai `BusinessCardPage.tsx:102`; tidak perlu
  paket baru. `scale: 8, margin: 1, errorCorrectionLevel: 'M'` seperti di sana.
- Isi QR = URL itinerary web publik `/{slug}/{jadwalId}/itinerary` yang sudah live.
  Paket tanpa itinerary → baris QR-nya tidak dirender sama sekali.

## Yang dibuang dari ComparePage

- `handleExportPDF` seluruhnya, termasuk perakitan DOM manual dan `domToBlob`.
- `cachedInterFontCSS` dan pengunduhan woff2 dari `fonts.gstatic.com`.
- Seluruh markup tabel HTML di dalam modal.
- `CompareRow` dan `seatHighlight` — sudah mati sejak sebelum perubahan ini.

`modern-screenshot` **tetap sebagai dependensi**: masih dipakai
`stableDomCapture.ts`, `HajiPlusExportPage.tsx`, dan `SimulasiHajiPlus.tsx`.

## Catatan teknis yang mengikat

- **Tanpa emoji.** Mockup membuktikan bendera (🇦🇪) dan 🕋 tidak ter-render di
  keluaran; identitas kota diwakili teks + warna. Kota tur memakai emas, kota
  ibadah memakai burgundy.
- **Worker pdf.js.** `pdfjs.GlobalWorkerOptions.workerSrc` saat ini diatur di
  `KalkulasiResultModal.tsx:42`. Viewer di ComparePage harus memastikan worker
  sudah terset sebelum render, bukan mengandalkan modal Kalkulasi pernah dimuat.
- **react-pdf dimuat malas.** Halaman compare sudah `lazy()` di `main.tsx:58`
  justru karena pustaka PDF berat; jangan menaikkan impor `@react-pdf/renderer`
  ke jalur kritis.
- Aturan tier dari spec sebelumnya tidak berubah: harga/hotel/bintang/jarak dari
  tier terpilih, suhu/bendera/pencarian dari `packageCityHotels`.

## Pengujian

`tests/compare-verdict.test.js`, fixture dari data live JBU1569 vs JBU1491:

1. `headlinePriceGap` memilih Quad (selisih 2,7 jt), bukan Double yang selisihnya
   paling besar (4,5 jt) — angka yang dipajang harus angka yang ditawarkan
2. `headlinePriceGap` turun ke Triple saat Quad `'N/A'` di salah satu sisi; semua
   `'N/A'` → `null`
3. `priceWinner` mengembalikan sisi termurah di mayoritas tipe kamar
4. `priceWinner` → `null` saat masing-masing menang di jumlah tipe yang sama
5. `hotelWinner` memakai jumlah bintang; seri bintang diputus oleh jarak
6. `hotelWinner` → `null` bila bintang salah satu sisi tak ada
7. jarak `"±1,5 km"` dinormalkan ke 1500 m, format asing → tak diketahui
8. `seatWinner` dan perilaku serinya

Gerbang lain: `npm run build`. `tsc --noEmit` punya 15 error bawaan yang tak
terkait, jadi build yang jadi gerbangnya.

## Risiko

- **Waktu render di HP lama.** `pdf().toBlob()` memakan waktu; Kalkulasi sudah
  menanggung hal yang sama dan memakai tombol ber-status loading 1,5 detik. Pola
  yang sama dipakai di sini.
- **Hero bisa kosong isinya.** Dua paket dengan harga sama persis dan hotel
  seimbang menghasilkan hero tanpa satu pun pemenang. Dokumen harus tetap terbaca:
  saat `gap === null`, hero menampilkan judul dokumen dan tanggal, bukan ruang
  kosong bertanda "—".
- **QR menambah lebar dokumen efektif.** Kolom QR 54pt di dalam sel harus tidak
  memaksa nama hotel panjang patah lebih buruk; baris ITINERARY karena itu berdiri
  sendiri, bukan menempel di baris hotel.
