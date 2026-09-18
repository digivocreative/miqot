# Spec: Add Sticker — tempel sticker ke brosur sebelum diunduh/dibagikan

**Tanggal:** 2026-09-18
**Status:** Disetujui (brainstorm di chat; user memberi otonomi "eksekusi inline sampai selesai")
**Area:** `src/lib/stickerCatalog.js`, `src/lib/stickerLayout.js` (+ `.d.ts`), `src/utils/compositeStickers.ts`,
`src/components/StickerStudio.tsx` (baru) + 3 titik panggil: `PackageCard.tsx`, `BrochureModal.tsx`,
`BrochureSchedulePage.tsx` + aset `public/img-sticker/`

## 1. Masalah

Agent mengirim brosur ke calon jamaah apa adanya. Tidak ada cara menempelkan penanda pemasaran
("SOLD OUT", "SISA 2 SEAT", "PLUS TURKI", "HOTEL DEKAT HARAM") ke gambar yang dikirim. User sudah
mengunggah 21 sticker PNG ke Bunny CDN di `https://alhijaz.b-cdn.net/sticker/<id>.png` dan ingin
sticker itu ikut menempel **pada berkas yang diunduh/dibagikan**, bukan cuma hiasan di layar.

## 2. Keputusan yang diambil saat brainstorm

| Pertanyaan | Keputusan |
|---|---|
| Permukaan | Brosur paket di kartu Jadwal, Brosur Paket (dashboard), Brosur Jadwal (dashboard). **Bukan** screenshot kartu paket. |
| Siapa yang memilih | Agent, manual, tiap kali. Tidak ada saran otomatis dari data, tidak ada penempelan oleh admin. |
| Penempatan | Geser bebas + atur ukuran. Bukan preset sudut. |
| Jumlah sticker | Beberapa, bebas. |
| Penyimpanan | Sekali pakai. Tutup studio = hilang. Tidak ada localStorage, tidak ada DB. |
| Sumber katalog | Hardcode di repo. Sticker baru = ubah kode + deploy. |
| Aset turunan | Thumbnail 256px WebP lokal di `public/img-sticker/` (di-commit); komposit menarik PNG asli dari Bunny. |

**Di luar cakupan (sengaja):** Katalog PDF (alur multi-halaman dengan pemilih cover; sticker
sifatnya sekali-pakai per gambar), screenshot kartu paket, rotasi sticker, opacity, susun-ulang
layer, hapus latar.

## 3. Arsitektur: rasterisasi dulu, lalu satu studio

Kontraknya satu baris: **blob masuk → blob keluar.**

```
[Brosur paket — kartu Jadwal]   ┐
[Brosur Paket — dashboard]      ├─→ blob ─→ StickerStudio ─→ blob ber-sticker ─→ Simpan / Bagikan
[Brosur Jadwal — dashboard]     ┘
```

`StickerStudio` tidak tahu apa-apa soal paket, jadwal, tier, atau desain brosur. Ia menerima satu
`Blob` gambar dan satu nama berkas, mengembalikan gambar yang sudah ditempeli. Itulah yang membuat
tiga permukaan (dan permukaan keempat nanti) dilayani satu implementasi.

**Kenapa bukan lapisan DOM di dalam tiap template:** brosur paket bukan DOM — ia gambar jadi dari
hulu. Jalur DOM tetap butuh jalur kanvas kedua untuk brosur paket, jadi ada dua implementasi
komposit yang harus dijaga agar sepakat. Ditambah `modern-screenshot` memaku `width`/`height`
piksel ke klon (lihat `reference_modern_screenshot_pinning`), jadi lapisan DOM baru membawa risiko
render yang tidak dimiliki jalur kanvas.

**Kenapa bukan memperluas `stampAgentOnBrochure`:** modul itu sengaja *fail-silent* — semua jalur
gagal mengembalikan blob asli tanpa suara. Benar untuk identitas agent (brosur tanpa identitas
masih berguna), salah untuk sticker (sticker ADALAH yang diminta). Dan ia tidak melayani Brosur
Jadwal sama sekali.

### Urutan lapisan tidak boleh dibalik

Sticker selalu ditempel **di atas brosur yang identitas agent-nya sudah terbakar**.
`stampAgentOnBrochure` menemukan kotak kontak dengan **memindai piksel putih yang menyentuh dasar**
gambar; sticker yang menempel duluan bisa merusak pemindaian itu. Karena studio menerima blob yang
sudah di-stamp (`stampedBrosur.blob`), urutan ini terjamin secara struktural — bukan lewat
kesepakatan.

## 4. Unit

### 4.1 `src/lib/stickerCatalog.js` (+ `.d.ts`) — data murni

Pasangan `.js` + `.d.ts` mengikuti dua preseden terdekat di repo — `brochureContactSlot.js` dan
`agentBandLayout.js` — supaya tes `node:test` bisa mengimpornya langsung tanpa transpile esbuild.

```js
export const STICKER_BASE = 'https://alhijaz.b-cdn.net/sticker';
export const STICKER_THUMB_BASE = '/img-sticker';

// tipe di stickerCatalog.d.ts
interface StickerDef {
  id: string;        // 'sold-out' — sekaligus nama berkas di Bunny & thumbnail lokal
  label: string;     // 'Sold Out' — yang dibaca agent
  group: StickerGroupId;
  aspect: number;    // lebar/tinggi. Semua sticker saat ini 1254×1254 → 1
}
```

21 entri, dikelompokkan supaya grid bisa dipindai mata:

- **Ketersediaan** — `sisa-1-seat`, `sisa-2-seat`, `sisa-3-seat`, `seat-terbatas`,
  `tinggal-sedikit`, `hampir-full`, `last-seat`, `full-booked`, `sold-out`
- **Populer** — `best-seller`, `paling-dicari`, `favorit-jamaah`, `jadwal-favorit`,
  `pilihan-keluarga`
- **Fasilitas** — `hotel-bintang-5`, `hotel-dekat-haram`, `direct-flight`
- **Plus** — `plus-dubai`, `plus-redsea`, `plus-turki`
- **Promo** — `promo-terbatas`

**`aspect` ditulis di katalog, bukan dibaca dari `naturalWidth` saat runtime.** Ini menghapus
sekelas bug: geometri tidak pernah bergantung pada gambar sudah termuat atau belum, dan pratinjau
(thumbnail lokal) dijamin memakai rasio yang sama dengan komposit (PNG Bunny).

### 4.2 `src/lib/stickerLayout.js` (+ `.d.ts`) — geometri murni, teruji, tanpa DOM

Penempatan **ternormalisasi**:

```js
{ stickerId: 'sold-out', cx: 0.5, cy: 0.5, w: 0.3 }
```

`cx`/`cy` = titik tengah dalam 0..1 terhadap lebar/tinggi gambar. `w` = lebar sebagai pecahan lebar
gambar. **Tinggi tidak disimpan** — diturunkan dari `aspect` katalog.

Ini keputusan terpenting di seluruh desain. Brosur paket beredar dalam **4 ukuran** (1080×1440,
1081×1440, 1200×1600, 1279×1600 — lihat `project_brosur_profil_agent`), Brosur Jadwal 1080×1440,
dan editor menampilkannya diperkecil agar muat layar HP. Koordinat piksel dijamin salah. Pratinjau
dan ekspor memanggil fungsi konversi **yang sama**, hanya beda ukuran kontainer, jadi keduanya
tidak bisa berbeda pendapat.

API:

```js
STICKER_W_MIN = 0.10, STICKER_W_MAX = 1.0, STICKER_W_DEFAULT = 0.30
defaultPlacement(stickerId, index)      // bergeser per index supaya tidak menimpa persis
clampPlacement(placement, aspect, imageAspect)
placementToRect(placement, aspect, boxW, boxH)   // → { x, y, w, h } piksel
rectToPlacement(rect, boxW, boxH)                // kebalikannya
```

**Aturan clamp:** minimal 25% luas sticker wajib tetap di dalam gambar, supaya sticker tidak bisa
hilang di luar tepi dan jadi tak bisa dipilih lagi.

### 4.3 `src/utils/compositeStickers.ts` — kanvas

```ts
compositeStickers(base: Blob, placements: Placement[]): Promise<Blob>
```

1. `decodeImageBlob(base)` (sudah ada di `src/utils/canvasImage`)
2. kanvas seukuran **natural** gambar dasar — tidak pernah diskalakan
3. `drawImage` dasar di 0,0
4. tiap placement berurutan: ambil PNG penuh dari Bunny **sebagai blob lalu decode**, hitung rect
   lewat `placementToRect`, `drawImage`
5. `canvasToBlob(canvas, 'image/jpeg', 0.9)` — cocok dengan `BROSUR_EXPORT_QUALITY` dan nama berkas
   `.jpg` yang sudah dipakai

**Jangan pernah `<img crossOrigin>` di jalur ini.** Gambar lintas-origin yang di-`drawImage` lewat
elemen `<img>` bisa menodai kanvas, dan `toBlob` baru melempar **setelah** semuanya tergambar —
jebakan yang sudah menggigit di jalur stamp agent. Bunny mengirim `access-control-allow-origin: *`
(diverifikasi 2026-09-18), jadi `fetch` → blob → `decodeImageBlob` berjalan tanpa proxy.

Sticker yang sudah di-decode disimpan di cache modul (`Map<id, HTMLImageElement>`), jadi pemakaian
kedua gratis.

**Penjaga keras:** dimensi keluaran wajib sama persis dengan dimensi masukan.

### 4.4 `src/components/StickerStudio.tsx` — UI

Modal layar penuh lewat portal. Badan: brosur diperkecil agar muat (`object-fit: contain`), sticker
sebagai `<img>` absolut di atasnya memakai thumbnail lokal. Bawah: **Tambah Sticker · Simpan ·
Bagikan**. Picker naik dari bawah, grid berkelompok, tap = sticker menempel dan langsung terpilih.

- **Geser:** satu jari/pointer di atas sticker. Pointer Events + `setPointerCapture`,
  `touch-action: none` — mouse dan sentuh lewat satu jalur kode.
- **Ukuran:** cubit dua jari di atas sticker; desktop pakai pegangan di sudut kanan-bawah.
- **Terpilih** ditandai garis putus-putus + tombol `×`. Tap di luar = lepas pilihan. Ornamen editor
  hidup di DOM dan **tidak pernah** masuk kanvas, jadi tidak mungkin bocor ke berkas.
- Urutan tumpuk = urutan tambah, yang baru di atas. Tidak ada susun-ulang.
- Tutup pakai `useBackToClose` — gestur back Android/iOS menutup studio, bukan halaman. Studio
  bersarang di dalam `BrochureModal` yang juga memakai hook itu; koordinasi riwayat overlay
  bersarang sudah ditangani kerja PWA (`c40e151`).

Pratinjau memakai thumbnail lokal, komposit memakai PNG penuh dari Bunny. Ketajamannya beda;
**geometrinya tidak**, karena keduanya memakai `aspect` katalog yang sama dan fungsi konversi yang
sama.

## 5. Titik panggil

| Permukaan | Dari mana blob-nya | Perubahan |
|---|---|---|
| `PackageCard` (kartu Jadwal) | `stampedBrosur.blob ?? await (await fetch(brosurImageUrl)).blob()` — persis ekspresi yang sudah dipakai `downloadBrosurFile` | 1 tombol di baris aksi brosur |
| `BrochureModal` | `stampedBlob` yang sudah ada, fallback fetch `renderUrl` | 1 tombol di footer — **sekaligus melayani dashboard Brosur Paket**, karena `BrochurePaketGrid` memakai modal ini |
| `BrochureSchedulePage` | jalur kanonis yang sama dengan `handleDownload(pageIndex)` | 1 tombol per halaman |

Alur di semua permukaan identik: tombol **Sticker** → gambar jadi disiapkan → studio terbuka →
agent tempel & atur → **Simpan/Bagikan keluar dari dalam studio**. Tidak ada keadaan "sudah tempel
tapi lupa terapkan".

## 6. Aset

Sticker asli: **1254×1254 PNG, ±420–510 KB per keping, 21 keping ≈ 9,5 MB** (diukur 2026-09-18).
Bunny Image Optimizer **tidak aktif** di pull zone ini — `?width=`, `?format=webp`, `?class=`
ketiganya dikembalikan utuh sebagai PNG 448 KB. Jadi galeri yang menampilkan 21 thumbnail apa
adanya akan menarik 9,5 MB di kuota HP agent.

Solusi: `scripts/build-sticker-thumbs.mjs` mengunduh sticker dari Bunny dan menulis thumbnail
**256px WebP** ke `public/img-sticker/<id>.webp` (±30 KB/keping, ±630 KB total), di-commit ke repo.
Script ini dijalankan ulang tiap ada sticker baru.

**Precache aman.** `PRECACHE_GLOB_PATTERNS` hanya menyapu `assets/**`, `index.html`, `offline.html`,
ikon, dan font brosur. Berkas `public/` mendarat di akar `dist/`, jadi `public/img-sticker/` tidak
tertarik ke precache — sama seperti `public/img-brosur/` yang isinya cover 1 MB-an. Budget precache
1,5 MB hasil audit PWA 2026-09-18 tidak tersentuh. Thumbnail tetap di-cache saat runtime lewat
matcher `isSameOriginImage` yang sudah ada.

## 7. Kegagalan: berisik, bukan diam-diam

Sikap ini **kebalikan** `stampAgentOnBrochure`, dan sengaja. Di sana gagal → blob asli dikembalikan
tanpa suara, karena brosur tanpa identitas agent masih berguna. Di sini sticker justru yang diminta
— sticker yang hilang diam-diam berarti agent mengirim brosur yang dikira ada tempelannya.

| Kegagalan | Perilaku |
|---|---|
| PNG sticker gagal diambil saat komposit | Galat terlihat di studio, simpan/bagikan **dibatalkan**. Placement tidak hilang — agent bisa coba lagi. |
| Rasterisasi halaman Brosur Jadwal gagal | Galat di halaman, studio **tidak dibuka** (bukan dibuka kosong). |
| `canvasToBlob` gagal / kanvas ternoda | Galat yang sama; simpan dibatalkan. |
| Thumbnail lokal gagal muat (picker) | Kotak sticker tetap bisa ditap, label tetap terbaca. Ini hanya hiasan picker. |
| Offline | Sama dengan "gagal diambil". |

## 8. Pengujian

| Berkas | Menjaga apa |
|---|---|
| `tests/sticker-layout.test.js` (murni, node) | clamp 25%-terlihat, geser default per index, konversi normal↔piksel bolak-balik di 5 ukuran kanvas (4 brosur paket + 1080×1440), rasio terjaga, batas `w` 0,10–1,0 |
| `tests/sticker-catalog.test.js` (murni, node) | 21 id unik, tiap `id` punya thumbnail yang **benar-benar ada** di `public/img-sticker/`, URL Bunny terbentuk benar, tiap `group` terdaftar |
| `tests/sticker-composite.browser.test.js` (playwright, pola `export-wrap-probe`) | komposit sungguhan: dimensi keluaran == masukan, piksel di tengah tiap sticker berubah, piksel di luar kotak sticker **tidak** berubah |

Tes browser ketiga itu yang mengunci invarian inti: **yang dilihat agent == yang terkirim.**

Sesuai cara kerja yang disepakati ([[feedback_user_runs_e2e_tests]]): suite penuh/e2e dijalankan
user; sesi ini menjalankan `node --check`, `npx tsc`, `npm run build`, dan tes terkait.

**Baseline merah yang sudah ada (bukan regresi):** `npx tsc` ±23 galat pre-existing;
`brochure-export-consistency.browser.test.js` subtes 1, 4, 5;
`tests/native-share-payload.browser.test.js`.

## 9. Yang sengaja tidak dibangun

- Saran sticker otomatis dari data paket (sisa seat → `sisa-1-seat`, dst). Semua data ada, tapi
  sticker pemasaran seperti `best-seller` tidak punya sumber data, dan user memilih kendali penuh.
- Penyimpanan penempatan (localStorage atau DB).
- Rotasi, opacity, susun-ulang layer, hapus latar.
- Manifest/endpoint katalog — daftar hardcode sudah cukup selama sticker baru jarang.
