# Portal Jamaah — Ganti menu Perlengkapan & Manasik → Al-Quran & Doa/Dzikir

Tanggal: 2026-07-22

## Ringkasan

Di Portal Jamaah (`src/components/portal-jamaah/`), hapus dua menu grid **Perlengkapan** dan
**Manasik** (beserta halamannya), ganti dengan dua fitur baru: **Al-Quran** (pembaca surah dalam
app) dan **Doa & Dzikir** (kumpulan doa umroh/haji statis).

Ruang lingkup FE murni — tidak menyentuh `server.js`, DB, atau pipeline deploy.

## Keputusan (dikonfirmasi user)

- **Al-Quran** = pembaca surah dalam app: daftar 114 surah → buka surah → ayat Arab + Latin +
  terjemahan Indonesia. Data dari API publik **equran.id v2**. Tanpa audio (untuk sekarang).
- **Doa & Dzikir** = kurasi doa/dzikir relevan perjalanan ibadah, teks di-*bundle* statis (offline).
- **Perlengkapan & Manasik** dihapus total (menu + file halaman). Komponen bersama yang mereka
  pinjam tetap ada karena dipakai tab Persiapan.

## Verifikasi data source (sudah dicek)

`GET https://equran.id/api/v2/surat` dan `.../surat/{nomor}`:
- `access-control-allow-origin: *` → aman dipanggil langsung dari browser, tanpa proxy backend.
- Daftar surah: `data[]` dengan `nomor`, `namaLatin`, `nama` (Arab), `arti`, `jumlahAyat`,
  `tempatTurun`, `deskripsi`.
- Detail surah: `data.ayat[]` dengan `nomorAyat`, `teksArab`, `teksLatin`, `teksIndonesia`.
  (Objek `audio`/`audioFull` ada tapi diabaikan untuk sekarang.)

## Perubahan menu & routing (3 file, harus sinkron)

1. `hooks/usePortalRoute.ts` — di `PortalRoute` union dan array `PORTAL_ROUTES`: buang
   `'perlengkapan'` & `'manasik'`, tambah `'al-quran'` & `'doa-dzikir'`. URL menjadi
   `<dashboardPath>/al-quran` dan `/doa-dzikir`.
2. `lib/portalMenu.ts` — buang objek kartu `perlengkapan` & `manasik`; tambah:
   - `al-quran` — label "Al-Quran", desc "114 surah + terjemah", icon `BookOpen`, tema
     emerald/teal.
   - `doa-dzikir` — label "Doa & Dzikir", desc "Doa perjalanan ibadah", icon `HandHeart`,
     tema rose/pink.
   (Semua icon sudah dipastikan ada di `lucide-react` terpasang.)
3. `pages/PortalDashboard.tsx` — buang `lazy` import + baris render `PerlengkapanPage` &
   `ManasikSpiritualPage`; tambah `lazy` import + baris render `AlQuranPage` & `DoaDzikirPage`.
4. **Hapus file** `pages/PerlengkapanPage.tsx` dan `pages/ManasikSpiritualPage.tsx`.
   (Satu-satunya referensi eksternal keduanya ada di `PortalDashboard.tsx`.)

## Fitur Al-Quran

- `lib/quranApi.ts` — modul fetch murni + cache:
  - `fetchSurahList(): Promise<QuranSurahMeta[]>` — cache di `localStorage`
    (`portal_quran_surah_list_v1`, karena hampir tak pernah berubah) + memoisasi in-memory.
  - `fetchSurahDetail(nomor): Promise<QuranSurahDetail>` — cache in-memory per nomor.
  - Tipe ramping: hanya field yang dipakai (di atas). Buang HTML `deskripsi` mentah bila tak
    ditampilkan; jika ditampilkan, render sebagai teks (jangan `dangerouslySetInnerHTML` tanpa
    sanitasi — cukup strip tag sederhana atau tampilkan `arti` saja).
- `hooks/useQuranSurahList.ts` + `hooks/useQuranSurahDetail.ts` — pola `{ data, loading, error,
  refetch }` mengikuti `usePortalPersiapan`. `useQuranSurahDetail(nomor|null)` refetch saat nomor
  berubah.
- `pages/AlQuranPage.tsx` — master→detail via state lokal `selectedSurah: number | null`:
  - Daftar: `PortalBackBar` (title "Al-Quran", icon `BookOpen`) + kotak cari (filter `namaLatin`/
    `arti`) + daftar 114 kartu surah (nomor, namaLatin, arti, jumlahAyat, badge Mekah/Madinah).
  - Reader: `PortalBackBar` (title = nama surah) + header Bismillah (kecuali surah 1 & 9) + tiap
    ayah: nomor ayat, teks Arab (RTL, `dir="rtl"`, font besar `leading-loose`), Latin (italic),
    terjemahan Indonesia.
  - `onBack`: dari reader → kembali ke daftar (set `selectedSurah=null`); dari daftar → `onBack`
    prop (kembali ke beranda).
  - Pakai ulang pola skeleton-loading / error-retry / empty-state dari halaman existing.

## Fitur Doa & Dzikir

- `lib/doaData.ts` — dataset statis berkelompok. Tipe entri:
  `{ id, title, arab, latin, terjemahan, sumber? }`. Kategori: Doa Safar/Perjalanan,
  Niat & Ihram, Talbiyah, Masjidil Haram/Thawaf/Sa'i, Arafah–Muzdalifah–Mina, Madinah/Raudhah,
  Dzikir Harian. Konten doa yang umum & masyhur; sertakan `sumber` bila memungkinkan.
- `pages/DoaDzikirPage.tsx` — `PortalBackBar` (title "Doa & Dzikir", icon `HandHeart`) + kotak
  cari (filter judul/terjemahan) + daftar berkelompok per kategori (section header + kartu doa
  Arab RTL / Latin / terjemahan). Sepenuhnya offline.

## Catatan & risiko

- **Akurasi konten religius:** teks Arab Doa & Dzikir yang saya susun harus ditinjau tim sebelum
  dianggap final. Batasi ke doa masyhur/otentik, cantumkan sumber bila ada.
- **Ketergantungan jaringan:** Al-Quran butuh internet (equran.id). Cache `localStorage` daftar
  surah mengurangi request berulang; detail surah butuh online saat pertama dibuka.
- **Tidak ada audio** pada iterasi ini (field audio API sengaja diabaikan; mudah ditambah nanti).

## Verifikasi (gate FE)

- `npx tsc --noEmit` bersih untuk file baru (proyek punya ~6 error pre-existing — gate = build,
  bukan tsc-clean).
- `npm run build` (vite) sukses.
- Uji manual di preview browser: buka Al-Quran → daftar termuat → buka beberapa surah (mis. 1, 2,
  9, 112) → Arab/Latin/terjemah tampil; buka Doa & Dzikir → kategori & pencarian jalan.
- Tidak menyentuh server.js/DB/deploy.
