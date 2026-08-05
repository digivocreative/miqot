# Compare: paket bertier banyak (UHUD/RAHMAH/HEMAT)

Tanggal: 2026-08-05
Berkas: `src/components/ComparePage.tsx` (rute `/dashboard/ai-tools/compare`)

## Masalah

Halaman Bandingkan Paket memperlakukan satu `jadwalId` sebagai satu paket. Data
hulu tidak begitu: `paket_harga` dan `paket_hotel` adalah peta **per tier**
(HEMAT, UHUD, RAHMAH, PRIVATE), dan tiap tier punya harga **dan hotel** sendiri.

Potret data live `1448` (85 jadwal, diambil 2026-08-05):

- 70 jadwal bertier tunggal, 14 jadwal bertier dua, 1 jadwal bertier tiga
- total **101 kombinasi paket–tier**, sementara dropdown hanya memunculkan 85

Tiga akibatnya di kode sekarang:

1. **16 kombinasi tak bisa dipilih sama sekali.** `packageOptions`
   (`ComparePage.tsx:297`) memetakan satu opsi per `jadwalId`.

2. **Harga diambil dari tier pertama menurut urutan API.** `getPriceForType`
   (`ComparePage.tsx:350`) memakai `Object.keys(pkg.harga)[0]` — bukan termurah,
   bukan pilihan siapa pun, dan urutannya ditentukan hulu.

3. **Hotel dicampur lintas tier.** `getHotelInfo` (`ComparePage.tsx:334`)
   menggabung semua tier lalu mengambil nilai non-kosong pertama per kota. Untuk
   JBU1500 (`PLUS CAIRO + ALEXANDRIA 12HR MIX`) tiap tier hotelnya benar-benar
   berbeda:

   | Tier   | Mekkah                | Madinah            | Cairo                |
   | ------ | --------------------- | ------------------ | -------------------- |
   | UHUD   | ANJUM                 | AL RITZ AL MADINAH | TIBA PYRAMID (★4)    |
   | HEMAT  | AL MASSA GRAND/SETARAF| ODST ALMADINAH     | —                    |
   | RAHMAH | MOVENPICK             | AL RITZ AL MADINAH | —                    |

   Yang tampil hanya ANJUM + Cairo milik UHUD. Bagian Harga di modal justru
   memajang chip `UHUD` `HEMAT` `RAHMAH` bertiga di atas angka satu tier
   (`ComparePage.tsx:971`) — pembaca wajar menyangka satu tabel itu berlaku untuk
   ketiganya.

Butir 3 lebih berat daripada keluhan awal "belum lengkap": bukan data yang
kurang, tapi data yang salah pasang, dan hasilnya ikut ke gambar yang dikirim
agent ke jamaah.

## Bentuk yang dipilih

Pemilihan dua langkah, meniru KalkulasiPage (`KalkulasiPage.tsx:660`) — tool
sebelah yang dipakai agent tiap hari:

```
┌ PAKET A ──────────────────────┐
│ 5 September 2026              │
│ PLUS CAIRO + ALEXANDRIA 12HR  │
└───────────────────────────────┘
  Tipe Paket
  ┌──────────┬──────────┬──────────┐
  │ ✓ HEMAT  │  UHUD    │  RAHMAH  │
  │ Mek ★4   │ Mek ★5   │ Mek ★5   │
  │ 34,9 jt  │ 41,7 jt  │ 47,5 jt  │
  └──────────┴──────────┴──────────┘
```

Alternatif yang ditolak: memipihkan tier jadi 101 baris dropdown. Dropdown ini
di-scan per tanggal keberangkatan; 101 baris yang label tanggal-dan-namanya
kembar-kembar membuat pemindaian itu lebih susah, dan polanya menyimpang dari
Kalkulasi.

- Chip hanya muncul bila tier > 1. Paket bertier tunggal tak menyisakan pilihan,
  jadi tak perlu barisnya — nama tiernya tetap terbaca sebagai lencana di modal.
- Default tier = **termurah**, sama seperti PackageCard di daftar paket dan
  `pickBrochurePackageDetails` di endpoint Brosur. Angka "mulai dari" itulah yang
  disebut agent lebih dulu.
- Ganti paket → tier balik ke termurah milik paket baru.

### Identitas pilihan = paket + tier

Tombol Bandingkan sekarang menolak `paketA === paketB`. Aturan barunya menolak
hanya bila **jadwal dan tier sama**. Membandingkan UHUD lawan RAHMAH pada jadwal
yang sama jadi mungkin, dan itu justru pertanyaan yang paling sering diadu
jamaah: pesawat sama, tanggal sama, hotelnya beda berapa.

## Aturan: apa yang ikut tier, apa yang tidak

| Bagian                             | Sumber                                                        |
| ---------------------------------- | ------------------------------------------------------------- |
| Harga Quad/Triple/Double           | tier terpilih                                                 |
| Hotel, bintang, jarak              | tier terpilih — tidak lagi digabung                           |
| Baris kota yang tampil di modal    | union kota tier A & tier B; yang kosong di satu sisi → "—"    |
| **Suhu saat keberangkatan**        | union kota **semua** tier paket                               |
| Bendera 🇪🇬/🇹🇷 & teks cari dropdown | union semua tier                                              |
| Penerbangan, seat, manasik, durasi | per jadwal, tak tersentuh                                     |

Baris suhu sengaja tidak ikut tier. Itinerary satu jadwal sama untuk semua
tiernya; yang berbeda hanya hotelnya. HEMAT di JBU1500 tak punya hotel Cairo
terdaftar, tapi jamaahnya tetap ke Cairo — kalau daftar kota suhu ikut tier
terpilih, Cairo malah lenyap justru di tier yang paling laku.

Bendera dan teks pencarian ikut alasan yang sama: paket yang hotel Cairo-nya
cuma ada di satu tier tetap harus muncul saat agent mengetik nama hotel itu.

## Modul murni baru

`src/lib/packageTiers.js` + `src/lib/packageTiers.d.ts`, mengikuti pola
`baniShownRefs.js` — logika murni di `.js` supaya bisa diuji `node --test`, tipe
di `.d.ts` untuk pemakai TSX.

| Fungsi                                  | Perilaku                                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `listPackageTiers(pkg)`                 | nama tier yang punya ≥1 harga kamar terpakai (Quard/Triple/Double/Single > 0). Fail-closed seperti `listBrochureTiers` |
| `cheapestPackageTier(pkg)`              | tier dengan harga kamar terendah; bila tak ada tier berharga, jatuh ke kunci pertama `harga` lalu `hotel`, supaya hotel tetap tampil |
| `resolvePackageTier(pkg, tier)`         | `tier` bila sah, selain itu `cheapestPackageTier(pkg)` — dipakai saat membaca parameter URL dan state basi   |
| `tierHotelInfo(pkg, tier)`              | hotel tier itu saja, `null` bila tak ada                                                                     |
| `packageCityHotels(pkg)`                | union semua tier: nilai non-kosong pertama per kunci — persis `getHotelInfo` lama, tapi kini hanya untuk suhu/bendera/pencarian |
| `tierRoomPrice(pkg, tier, roomType)`    | angka; `'N/A'`, kosong, dan NaN → 0                                                                          |
| `tierStartingPrice(pkg, tier)`          | termurah antar Quard/Triple/Double/Single dalam satu tier — angka di chip. `Infant` tak pernah ikut: itu harga per orang, bukan kamar |

Semua menerima paket berbentuk `{ harga, hotel }` saja, jadi tesnya cukup
literal objek dan modulnya bebas React.

## Modal dan gambar unduhan

- Deretan chip semua tier di bagian Harga diganti **satu lencana tier aktif**.
- Header sticky nama paket dapat lencana tier yang sama.
- Header gambar ekspor (`tierRow`, `ComparePage.tsx:616`) mendapat baris nama
  tier di bawah nama paket. Gambar ini dikirim agent ke jamaah; tanpa nama tier,
  harga RAHMAH terbaca seolah satu-satunya harga paket itu.
- `tierA`/`tierB` di `ComparePage.tsx:385` sekarang dihitung lalu tak pernah
  dipakai; keduanya jadi tier terpilih yang sesungguhnya.

## URL share

`?paketA=&paketB=` mendapat pasangan opsional `?tierA=&tierB=`. Tier yang tak
dikenal atau tak diisi jatuh ke `resolvePackageTier` → termurah, jadi tautan lama
tetap membuka halaman yang benar.

## Bersih-bersih terarah

`getMinPrice` (`ComparePage.tsx:324`) dihapus: sudah mati, buta tier, dan
persis jenis fungsi yang berbahaya kalau nanti dipasang orang. `CompareRow` dan
`seatHighlight` juga mati tapi tak ada urusan dengan tier — dibiarkan.

## Pengujian

`tests/package-tiers.test.js`, fixture dari data live:

1. `listPackageTiers` mengembalikan tiga tier JBU1500 sesuai urutan API
2. tier yang semua harga kamarnya `'N/A'` dilewati; `null`/`{}` → `[]`
3. `cheapestPackageTier` JBU1500 → `HEMAT` (34,9 jt), bukan `UHUD` (kunci pertama)
4. `cheapestPackageTier` jatuh ke kunci hotel pertama saat tak ada tier berharga
5. `tierHotelInfo(JBU1500, 'HEMAT')` tak membawa hotel Cairo milik UHUD — inti bug 3
6. `packageCityHotels(JBU1500)` memuat Cairo meski tier terpilih HEMAT
7. `tierRoomPrice` mengembalikan 0 untuk `'N/A'` dan untuk tier tak dikenal
8. `resolvePackageTier` menolak tier asing dan mengembalikan termurah

Gerbang lain: `npm run build`. `npx tsc --noEmit` proyek ini punya ~6 error
bawaan, jadi build yang jadi gerbangnya, bukan tsc bersih.

## Risiko

- **Hotel per tier bisa mengosongkan baris yang sebelumnya terisi.** Paket yang
  hotel Cairo-nya hanya ada di UHUD akan menampilkan "—" di kolom HEMAT. Itu
  memang keadaan datanya, dan lebih jujur daripada meminjam hotel tier lain,
  tetapi tampak seperti kemunduran bila tak dijelaskan.
- **Urutan kunci tier**. Di 85 jadwal live, kunci `paket_harga` dan `paket_hotel`
  selalu sama persis dan seurutan. Kode tetap tidak boleh menyandarkan hotel pada
  indeks — selalu dicocokkan lewat nama tier.
