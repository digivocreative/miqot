# Gabung strip Landing/Manasik ke kartu Urutan Perjalanan

Tanggal: 2026-08-04
Berkas mockup: `~/Downloads/AsoyCok.pen` (bagian **PILIHAN** dan **UJI PONSEL**)

## Masalah

Di panel expanded kartu jadwal ada dua kotak abu berdempetan:

1. Strip `Landing di` / `Manasik` — `PackageCard.tsx:1831`
2. Kartu `Urutan perjalanan` — `PackageCard.tsx:1870`

Dua latar abu berurutan membuat panel terasa berat, dan isinya sebagian
mengulang: `getLandingCityName` mengembalikan tujuan leg terakhir keberangkatan,
yang untuk rute berakhir MED sama persis dengan simpul pertama rantai
("Landing di Madinah" tepat di atas simpul "Madinah").

Pengulangan itu tidak selalu terjadi. Saat rute berakhir di JED,
`getSaudiLabelsFromRoute` menghasilkan simpul pertama `Umroh` — kata "Jeddah"
tidak pernah muncul sebagai simpul. Jadi informasi landing tidak boleh sekadar
dibuang; ia hanya redundan pada sebagian paket.

## Bentuk yang dipilih

Satu kartu, dengan pembagian: **baris judul memuat manasik, rantai memuat
landing.**

```
┌────────────────────────────────────────────────────────────┐
│ [⤳] PERJALANAN                    ( 📖 Manasik  16 Agu 26 ) │
│                                                             │
│        (🕌)✈             ──────›──────           🕋         │
│        Madinah                                  Umroh       │
└────────────────────────────────────────────────────────────┘
```

### Chip manasik

Di ujung kanan baris judul: ikon buku, kata **"Manasik"** (abu-abu, bobot
normal), lalu tanggal (bobot tebal, warna teks utama). Kata "Manasik" wajib
terbaca — chip ikon-saja ditolak.

Tanggal kosong → `TBA` dengan warna diredupkan, sama seperti perilaku sekarang.

### Judul kiri dipendekkan

`URUTAN PERJALANAN` → `PERJALANAN`. Alasannya ruang, bukan selera: di kartu
ponsel 343px lebar dalam kartu 319px, blok kiri 111px + chip manasik 139px =
250px. Dengan judul panjang jumlahnya 298px — masih muat tapi menyisakan 21px,
sehingga chip turun baris begitu tanggalnya sedikit lebih panjang.

### Penanda landing

Karena manasik naik ke header, rantai mulai langsung dari kota pertama dan tidak
punya titik asal untuk sebuah garis penerbangan. Penanda landing karena itu
menempel pada simpulnya:

- **Lencana pesawat** — bulatan `emerald-600` kecil dengan ikon `PlaneLanding`
  putih, di pojok kanan atas lingkaran simpul tempat mendarat.
- **Simpul mana** — indeks pertama dengan `tone !== 'tour'`. Tur pra-Saudi
  (Dubai) mendahului rantai tapi bukan titik landing yang ditampilkan
  `getLandingAirportCode` (leg terakhir keberangkatan).
- **Nama bandara** muncul sebagai keterangan kecil di bawah label simpul
  **hanya bila berbeda** dari label itu. Kasus MED tidak menulis "Madinah" dua
  kali; kasus JED menulis "Jeddah" di bawah "Umroh".

Alternatif yang ditolak: garis putus + pesawat sebagai kolom tersendiri di depan
rantai. Diukur pada kartu 343px dengan 4 simpul, kolom simpul menyusut dari 68px
jadi 58px. Keduanya masih muat satu baris, tapi stub menambah satu kolom penuh
tanpa memberi informasi lebih — lencana tidak memakan lebar sama sekali.

### Kasus rantai kosong

`getPackageJourneySteps` mengembalikan `[]` bila `getSaudiLabelsFromRoute` tidak
bisa menyimpulkan urutan (mis. berangkat dan pulang sama-sama lewat JED). Hari
ini kartu rantai disembunyikan sementara strip Landing/Manasik tetap tampil —
setelah digabung, menyembunyikan kartu berarti **kehilangan landing dan manasik
sekaligus**.

Karena itu kartu selalu dirender. Saat rantai kosong, isinya diganti satu baris:
ikon pesawat + "Landing di" + nama kota.

## Perubahan kode

### `src/utils/journey.ts`

Tambah satu helper murni:

```ts
export function getLandingStepIndex(steps: JourneyStep[]): number
```

Mengembalikan indeks simpul pertama yang `tone !== 'tour'`, atau `-1` bila tidak
ada. Ditaruh di sini, bukan di komponen, karena aturannya milik model perjalanan
dan bisa diuji tanpa merender.

### `src/components/PackageCard.tsx`

Blok `1831–1931` (strip + kartu rantai) diganti satu kartu. Yang **tidak**
berubah:

- `isCompactJourney`, `data-journey-layout`, template kolom grid, dan kelas label
  simpul — `tests/package-card-journey-layout.test.js` mencocokkan teks sumber
  persis pada bagian itu.
- Nada warna kartu (`bg-gray-50/70`, border `gray-100`, varian dark).

Yang ditambahkan pada tiap simpul: pembungkus `relative` di sekeliling lingkaran
(lingkarannya sendiri `overflow-hidden`, jadi lencana tidak bisa ditaruh di
dalamnya), lencana bersyarat, dan keterangan bandara bersyarat. Simpul landing
diberi atribut `data-landing-step` supaya bisa diuji dari HASIL render.

## Pengujian

`tests/package-journey.test.js` — unit `getLandingStepIndex`: rantai biasa
(indeks 0), rantai dengan tur pra-Saudi (indeks 1), rantai kosong (-1).

`tests/package-card-journey-header.test.js` (baru, memakai harness SSR
`tests/fixtures/package-card-render.js`):

1. Chip manasik memuat kata "Manasik" dan tanggal terformat.
2. `manasikTanggal` kosong → "TBA".
3. Rute berakhir MED → lencana di simpul pertama, tanpa keterangan "Madinah"
   kedua.
4. Rute berakhir JED → lencana di simpul "Umroh" dengan keterangan "Jeddah".
5. Tur Dubai pra-Saudi → lencana di simpul kedua, bukan pertama.
6. Rantai kosong → kartu tetap ada, memuat "Landing di" + nama kota + chip
   manasik.

## Di luar cakupan

- Mode compact (>3 simpul) tidak diubah; lencana dan keterangan mengikuti ukuran
  yang sudah ada.
- Tampilan brosur, katalog, dan Portal Jamaah tidak menyentuh blok ini.
