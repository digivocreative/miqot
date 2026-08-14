# Manasik Mendatang — desain

Tanggal: 2026-08-14
Status: disetujui untuk diimplementasikan

## Masalah

Kartu kalender di `/dashboard` punya section "Berangkat Mendatang" yang memberi agen daftar
jamaah yang akan berangkat dalam 60 hari, lengkap sampai daftar nama + tombol Chat WA.
Tidak ada padanannya untuk manasik, padahal manasik adalah acara yang jamaahnya perlu
diingatkan agen supaya hadir.

Tujuan section baru ini: **agen melihat sesi manasik terdekat, lalu mengirim pengingat ke
jamaah yang harus hadir.** Itu berarti tiap sesi harus bisa dibuka menjadi daftar nama +
kontak WA, bukan sekadar tanggal.

## Fakta data yang diukur lebih dulu

Diukur langsung dari `umroh_schedules` (100 jadwal) pada 2026-08-14, bukan diasumsikan:

| Yang diukur | Hasil |
|---|---|
| Jarak `berangkat_tgl − manasik_tgl` | **6–18 hari** (70% di 8–14 hari; 26% di 15–21) |
| `manasik_tgl` kosong/null | 0 baris |
| `manasik_tgl` bernilai sentinel `0000-00-00` | **2 baris** — JBU0679 (WAITINGLIST), JBU1577 (UMRAH PRIVAT 9HR) |
| `manasik_jam` | terisi 100%, format `HH:MM:SS` (`08:00:00`, `08:30:00`) |
| Jadwal berangkat ≤60 hari | 32 — **6 di antaranya manasiknya sudah lewat** |
| Tanggal+jam manasik dipakai >1 paket (jendela 42 hari) | **8 dari 11** |

Dua konsekuensi yang membentuk seluruh desain ini:

1. **Manasik adalah acara gabungan, bukan acara per paket.** 8 dari 11 sesi dihadiri lebih
   dari satu paket; 19 Sep bahkan punya dua sesi berbeda (08:00 untuk 4 paket, 08:30 untuk
   1 paket). Mengelompokkan per paket seperti Berangkat Mendatang akan menghasilkan baris
   kembar dengan tanggal & jam identik.
2. **Jendela manasik ≤42 hari dijamin utuh oleh jendela berangkat 60 hari yang sudah ada**
   (42 + gap maksimum 18 = 60). Di atas itu bocor: pada jendela 60 hari, 4 jadwal tak
   terjangkau karena keberangkatannya di luar 60 hari.

## Pendekatan yang dipilih

**Klien murni.** Section ini diturunkan dari payload `/api/calendar/berangkat-mendatang`
yang sudah di-fetch kartu ini saat mount — `buildBerangkatGroups` sudah membawa
`manasik_tgl` dan `manasik_jam` per grup. Tidak ada endpoint baru, tidak ada request
tambahan, tidak ada kunci cache baru.

Dua alternatif yang ditolak:

- **Melebarkan jendela fetch endpoint jadi 90 hari** — jendela manasik jadi bebas, tapi
  payload jamaah naik ~50% dan `buildBerangkatMendatang` (dipakai bersama kartu Statistik)
  harus tetap dikunci di 60 hari, menciptakan titik sinkron baru yang mudah lepas.
- **Endpoint `/api/calendar/manasik-mendatang` sendiri** — paling benar secara semantik dan
  paling lentur, tapi menambah endpoint + cache key + tes untuk data yang 95% sudah ada di
  klien.

Kelemahan pendekatan terpilih — lubang di ujung jendela bila pola gap berubah — ditutup
secara struktural, lihat bagian konstanta di bawah.

## Arsitektur

### Modul baru: `lib/manasik-sessions.js`

Satu tugas: `BerangkatGroup[]` → `ManasikSession[]`. Ditaruh terpisah dari
`lib/berangkat-groups.js` supaya modul itu tetap tentang berangkat saja — dia ikut terpakai
halaman Statistik, yang tidak butuh manasik.

```
buildManasikSessions(groups, todayStr)
  ├─ buang grup yang manasik_tgl-nya bukan tanggal nyata   ← menangkap "0000-00-00"
  ├─ buang manasik yang sudah lewat (< todayStr)
  ├─ buang manasik di luar jendela (> todayStr + MANASIK_WINDOW_DAYS)
  ├─ kelompokkan per `${manasik_tgl}|${jam}`               ← 19 Sep 08:00 ≠ 19 Sep 08:30
  └─ urutkan tanggal → jam
```

Konstanta jendela **diturunkan di kode, bukan ditulis sebagai angka**, supaya invariannya
tak pernah lepas diam-diam bila jendela berangkat digeser:

```js
import { BERANGKAT_MENDATANG_WINDOW_DAYS } from './laporan-stats.js';  // 60; modul ini nol dependensi
export const MANASIK_MAX_LEAD_DAYS = 18;                                // gap maksimum terukur
export const MANASIK_WINDOW_DAYS = BERANGKAT_MENDATANG_WINDOW_DAYS - MANASIK_MAX_LEAD_DAYS;
```

`lib/laporan-stats.js` sudah diperiksa: nol `import`, jadi aman ditarik ke bundel klien.

### Bentuk `ManasikSession`

```ts
{
  key: string;              // `${manasik_tgl}|${jam ?? ''}`
  manasik_tgl: string;      // 'YYYY-MM-DD'
  manasik_jam: string|null; // 'HH:MM' (dipangkas dari 'HH:MM:SS')
  hari_lagi: number;        // 0 = hari ini
  count: number;            // total jamaah lintas paket
  groups: BerangkatGroup[]; // untuk sub-judul per paket di detail
  items: BerangkatItem[];   // rata & terurut nama, untuk daftar
}
```

Deklarasi tipe ikut ditulis di `lib/manasik-sessions.d.ts`, mengikuti pola
`lib/berangkat-groups.d.ts`.

### Tanggal "hari ini" di klien

Dihitung dengan offset WIB eksplisit (pola `jakartaDateString` di `calendar-api.js`), bukan
jam perangkat — supaya `hari_lagi` dan batas jendela tidak meleset sehari bagi agen di luar
WIB atau yang membuka aplikasi lewat tengah malam.

## UI

### Tab menggantikan judul section

Tinggi kartu tidak bertambah. Header section menjadi pill tab, dengan subjudul yang ikut tab
aktif:

```
┌─────────────────────────────────────────────┐
│  [ Berangkat ][ Manasik ]            ✈      │
│  128 jamaah · 6 paket · Agustus 2026        │
├─────────────────────────────────────────────┤
│  🇸🇦  UMRAH HEMAT 9HR                       │
│      📅 5 September 2026  ·  👥 18 Jamaah   │
├─────────────────────────────────────────────┤
│              Lihat lainnya  ⌄                │
└─────────────────────────────────────────────┘
```

- Gaya pill mengikuti tab yang sudah ada di sheet tanggal kartu ini (`bg-gray-50 rounded-xl
  p-1 flex gap-1`), supaya tak ada kosakata visual baru.
- Tab Manasik memakai **ungu** — warna yang sudah jadi milik manasik di legenda dan titik
  kalender kartu ini (`TAB_CONFIG.manasik`).
- Tab aktif awal = **Berangkat**, sehingga tampilan bagi agen yang tak peduli manasik tidak
  berubah. Tidak disimpan antar-kunjungan.
- Preview tetap 3 baris; "Lihat lainnya" membuka sheet untuk tab yang sedang aktif.
- Subjudul tab Manasik: `{N} jamaah · {S} sesi · {MANASIK_WINDOW_DAYS} hari ke depan`.
  Angka jendela **diinterpolasi dari konstanta**, tidak ditulis "42" di teks — kalau jendela
  berangkat digeser, salinan teksnya tidak boleh berbohong.

### Baris sesi manasik

```
┌─────────────────────────────────────────────┐
│  ┌────┐  19 September 2026                  │
│  │ 19 │  🕐 08:00 · 4 paket · 37 jamaah     │   [5 hari lagi]  ›
│  │Sep │                                      │
└─────────────────────────────────────────────┘
```

Bendera destinasi diganti chip tanggal ungu: satu sesi memuat banyak paket dengan destinasi
berbeda, sehingga bendera justru menyesatkan di sini.

Badge kanan memakai `hari_lagi`; `0` ditulis "Hari ini".

### Sheet detail manasik

- Header: "Detail Manasik", subjudul `19 September 2026 · 08:00 · 37 jamaah`.
- Grid meta: Tanggal, Jam, Paket (jumlah), Jamaah (jumlah).
- Daftar jamaah **dikelompokkan per paket**: tiap paket punya sub-judul kecil berisi nama
  paket + tanggal berangkatnya, isinya baris jamaah dengan tombol **Chat WA**.

### Komponen baru & perubahan pada komponen bersama

Tampilan manasik ditaruh di berkas sendiri, `src/components/berangkat/ManasikSessionViews.tsx`
(`ManasikSessionSummaryRow`, `ManasikSessionDetail`), supaya `BerangkatGroupViews.tsx` — yang
dipakai bersama halaman Statistik — tidak ikut membengkak oleh kode yang tak dipakainya.

Agar baris jamaah bisa dipakai keduanya, `BerangkatRow` di `BerangkatGroupViews.tsx`:

- **dinamai ulang menjadi `JamaahRow` dan diekspor.** Sudah diperiksa: komponen ini
  file-internal, tidak diimpor dari mana pun, jadi tidak ada yang patah. Namanya diganti
  karena setelah ini ia melayani manasik juga, bukan berangkat saja. `FieldLabel` dan
  `GroupMeta` ikut diekspor untuk grid meta sheet manasik.
- **mendapat satu prop opsional** `buildWaText?: (item: BerangkatItem) => string`, default
  tetap `buildBerangkatWaText`, sehingga perilaku lamanya tidak berubah.

Pesan WA manasik dibangun oleh `buildManasikWaText(item, session)` — memuat sapaan
Bapak/Ibu sesuai `jk`, nama jamaah, tanggal & jam manasik, serta nama paket, mengikuti
struktur `buildBerangkatWaText` yang sudah ada.

## Penanganan tepi

| Kasus | Perlakuan |
|---|---|
| `manasik_tgl = "0000-00-00"` atau cacat | Grup dibuang dari tab Manasik. **Sekaligus membetulkan bug yang sudah hidup**: `BerangkatGroupDetail` kini menampilkan literal "Invalid Date" di field Manasik untuk JBU0679 & JBU1577 (`fmtTglLong('0000-00-00')` → `"Invalid Date"`); validator yang sama membuatnya jadi "-". |
| `manasik_jam` kosong | Sesi tetap tampil tanpa jam; kuncinya `${tgl}|`. Jamaah tidak boleh hilang hanya karena jamnya kosong. |
| Manasik hari ini | Ikut tampil, badge "Hari ini". |
| Tab Manasik kosong, Berangkat ada isi | Kedua pill tetap tampil; tab kosong berisi satu baris `Belum ada manasik dalam {MANASIK_WINDOW_DAYS} hari ke depan` (angka diinterpolasi, bukan literal). Pill yang muncul-hilang membuat kartu tak bisa ditebak. |
| Kedua tab kosong | Section tidak dirender sama sekali — persis perilaku sekarang. Karena sesi manasik diturunkan dari grup berangkat, manasik mustahil berisi saat berangkat kosong. |
| Fetch `/api/calendar/berangkat-mendatang` gagal | Tak ada perubahan perilaku: section hilang, kartu kalender tetap utuh. |

## Invarian sheet

Kartu ini punya invarian yang sudah dijaga hati-hati: `anySheetOpen`, `inert` pada kartu di
belakang, dan satu Escape hanya menutup satu keluarga sheet. Menambah keluarga sheet ketiga
akan melipatgandakan logika itu.

Karena itu: **satu keluarga sheet, bukan dua.** Sheet hanya dapat dibuka dari tab yang sedang
aktif, dan saat sheet terbuka kartu di belakang `inert` sehingga tab tidak bisa berganti.
Maka satu pasang state (`showAllList`, `selectedKey`) cukup; hanya pencariannya yang
bercabang mengikuti tab aktif:

```js
const selectedEntity = activeSection === 'manasik'
  ? manasikSessions.find(s => s.key === selectedKey)
  : berangkatGroups.find(g => g.key === selectedKey);
```

Syarat `anySheetOpen` tetap memakai **hasil pencarian**, bukan kunci mentah — sesuai catatan
yang sudah ada di `UpcomingSchedule.tsx`: kunci yang tak cocok dengan apa pun tidak boleh
mengunci halaman tanpa ada sheet yang muncul, dan syarat di sana harus sama persis dengan
syarat render.

## Pengujian

`tests/manasik-sessions.test.js` baru, `node:test` murni yang **menjalankan fungsi
sungguhan** (bukan pencocokan teks sumber yang bisa basi diam-diam):

1. Banyak paket pada tanggal + jam sama → **satu** sesi
2. `19 Sep 08:00` dan `19 Sep 08:30` → **dua** sesi terpisah
3. `0000-00-00` dan tanggal cacat lain dibuang
4. Manasik kemarin dibuang; manasik **hari ini** ikut (`hari_lagi === 0`)
5. Manasik di hari ke-43 dibuang; hari ke-42 ikut
6. **Invarian jendela**: `MANASIK_WINDOW_DAYS + MANASIK_MAX_LEAD_DAYS <= BERANGKAT_MENDATANG_WINDOW_DAYS`
7. `manasik_jam` null tidak menghilangkan sesi
8. `items` terurut nama dan `count` sama dengan `items.length`

Verifikasi sebelum serah terima:

```
node --test tests/manasik-sessions.test.js tests/berangkat-groups.test.js tests/berangkat-enrich.test.js
npm run build
```

Suite penuh dan pemeriksaan browser dijalankan oleh user, sesuai kebiasaan kerja kita.

### Checklist manual untuk user

- [ ] Buka `/dashboard`: section menampilkan pill **Berangkat | Manasik**, tab Berangkat
      aktif, isinya persis seperti sebelum perubahan.
- [ ] Klik pill **Manasik**: muncul sesi terurut tanggal; sesi dengan jam berbeda pada
      tanggal sama tampil sebagai dua baris.
- [ ] Klik "Lihat lainnya" di tab Manasik: sheet memuat seluruh sesi.
- [ ] Buka satu sesi: daftar jamaah dikelompokkan per paket, jumlah jamaah cocok dengan
      angka di baris ringkasnya.
- [ ] Klik **Chat WA** salah satu jamaah: teks pengingat menyebut manasik (tanggal + jam),
      bukan keberangkatan.
- [ ] Escape menutup sheet manasik dan mengembalikan fokus ke pemicunya; kartu di belakang
      tidak bisa di-Tab selama sheet terbuka.
- [ ] Mode gelap: pill ungu dan chip tanggal terbaca.
- [ ] Buka detail grup di tab **Berangkat** untuk jadwal JBU1577 bila muncul: field Manasik
      menampilkan "-", bukan "Invalid Date".

## Yang sengaja tidak dikerjakan

- **Pelacakan analitik.** Tombol Chat WA di tab Berangkat pun saat ini tidak dilacak;
  menambahkannya hanya di manasik membuat angkanya timpang.
- **Kehadiran manasik.** Tidak ada data hadir/tidak di sumber mana pun.
- **Lokasi manasik.** `umroh_schedules` hanya punya `manasik_tgl` dan `manasik_jam`; tidak
  ada kolom tempat.

## Berkas yang tersentuh

| Berkas | Perubahan |
|---|---|
| `lib/manasik-sessions.js` | **baru** — `buildManasikSessions`, konstanta jendela, validator tanggal, normalisasi jam |
| `lib/manasik-sessions.d.ts` | **baru** — tipe `ManasikSession` |
| `src/components/berangkat/ManasikSessionViews.tsx` | **baru** — `ManasikSessionSummaryRow`, `ManasikSessionDetail`, `buildManasikWaText` |
| `src/components/UpcomingSchedule.tsx` | tab section, state tab aktif, generalisasi pencarian sheet |
| `src/components/berangkat/BerangkatGroupViews.tsx` | `BerangkatRow` → `JamaahRow` (diekspor) + prop `buildWaText`; ekspor `FieldLabel`/`GroupMeta`; perbaikan "Invalid Date" |
| `tests/manasik-sessions.test.js` | **baru** — 8 tes |
