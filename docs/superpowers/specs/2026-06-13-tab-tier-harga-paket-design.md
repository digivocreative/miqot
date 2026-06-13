# Spec: Tab Tier Harga pada Kartu Paket (PackageCard)

**Tanggal:** 2026-06-13
**Status:** Disetujui untuk implementasi
**Area:** `src/components/PackageCard.tsx` (expanded view)

## 1. Latar Belakang & Masalah

Satu paket umroh punya beberapa **tier** (mis. HEMAT / UHUD / RAHMAH). Di data:

- `pkg.harga: Record<tier, { Quard?, Triple?, Double?, Single?, Infant? }>`
- `pkg.hotel: Record<tier, { mekkah_hotel, mekkah_bintang, mekkah_jarak, madinah_hotel, ... }>`

Tier **bukan sekadar beda harga** — tiap tier punya **hotel berbeda** (bintang & jarak ke masjid).

Saat ini `PackageCard.tsx` menghitung satu `cheapestTier` lalu **seluruh kartu** (blok hotel Mekkah/Madinah, header "MULAI", dan tabel "Rincian Biaya Paket") hanya menampilkan tier termurah itu. Tier lain tidak pernah terlihat.

## 2. Tujuan

Menampilkan harga (dan hotel) untuk **semua tier**, dengan perubahan sekecil mungkin pada desain kartu yang sudah ada.

**Non-tujuan:** redesign kartu, mengubah CompactCard / ComparePage / KalkulasiPage, mengubah tampilan collapsed.

## 3. Solusi (disetujui)

Tambahkan **tab tier** tepat di bawah judul **"RINCIAN BIAYA PAKET"** di expanded view.

- Memilih tab → **tabel Rincian Biaya** berganti ke tier tersebut, **dan** **blok hotel Mekkah/Madinah di atas** ikut berganti (sinkron penuh — satu sumber kebenaran `activeTier`).
- **Header "MULAI Rp X Jt" tetap menampilkan harga termurah** apa pun tier yang dipilih (pancingan "mulai dari" yang stabil; juga konsisten dengan tampilan collapsed di daftar).
- Tab **hanya muncul bila paket punya >1 tier**. Bila hanya 1 tier → tanpa tab, tampilan persis seperti sekarang.
- Default tier terpilih = **tier termurah** (`cheapestTier`), agar cocok dengan header & collapsed.
- Gaya tab: segmented control sederhana yang menyatu dengan desain kartu sekarang (tier aktif = aksen emerald). **Bukan** desain premium yang dieksplor sebelumnya.

### Yang berubah saat ganti tab
- Blok Hotel Mekkah/Madinah (nama, ★, jarak).
- Akomodasi Plus/Transit (`extraHotels`) & Urutan Perjalanan (`journeySteps`) — keduanya turunan dari `hotelInfo`, jadi otomatis ikut tier terpilih.
- Tabel Rincian Biaya Paket.

### Yang TIDAK berubah
- Header "MULAI" (tetap termurah), info penerbangan, manasik, tombol aksi, brosur, suhu.
- Tampilan kartu collapsed (tab hanya ada di area harga yang cuma dirender saat expanded).

## 4. Perubahan Teknis (`PackageCard.tsx`)

### 4.1 State & turunan
- Tambah state: `const [selectedTier, setSelectedTier] = useState<string | null>(null)`.
- Daftar tier: `const tiers = useMemo(() => Object.keys(pkg.harga), [pkg.harga])`.
- Tier aktif (guard agar tahan saat `pkg` berganti / tier tak valid):
  `const activeTier = (selectedTier && pkg.harga[selectedTier]) ? selectedTier : cheapestTier;`
- Ganti dua baris turunan yang sekarang memakai `cheapestTier`:
  - `const pricing = pkg.harga[activeTier] as RoomPricing;` (sebelumnya `cheapestTier`)
  - `const hotelInfo = pkg.hotel[activeTier];` (sebelumnya `cheapestTier`)
- `cheapestTier` & `absoluteMinPrice` **tetap dipertahankan** dan dipakai untuk header "MULAI" (tidak berubah).

Karena `extraHotels` (turunan `hotelInfo`), `journeySteps` (turunan `extraHotels`), `getShareMessage` (memakai `pricing`/`hotelInfo`/`extraHotels`) sudah membaca variabel turunan di atas, semuanya **otomatis** mengikuti `activeTier`. Untuk `buildAiCopyPayload` & `buildAiCopyFallback` yang mereferensikan `cheapestTier` secara langsung: **ganti ke `activeTier`** agar caption/Share konsisten dengan tier yang sedang dilihat (WYSIWYG).

### 4.2 UI tab (di section "Rincian Biaya Paket", sekitar baris 2132–2169)
- Di bawah `<h4>Rincian Biaya Paket</h4>`, render segmented control bila `tiers.length > 1`:
  - Satu pill per tier (label = nama tier apa adanya dari key).
  - Pill aktif = `activeTier`; `onClick` → `setSelectedTier(tier)` (hentikan propagasi agar kartu tidak ikut toggle collapse).
  - Beri atribut **`data-screenshot-ignore`** pada wadah tab (lihat 4.3).
- Tabel harga di bawahnya tetap seperti sekarang (membaca `pricing` yang kini = `activeTier`).
- Urutan tab: pakai urutan key `pkg.harga` apa adanya (umumnya sudah termurah→termahal). (Opsional kecil: urutkan naik berdasarkan harga minimum tier — boleh ditentukan saat implementasi.)

### 4.3 Screenshot / snapshot (`handleScreenshot`)
- Karena `pricing` & `hotelInfo` kini mengikuti `activeTier`, hasil screenshot **otomatis** menangkap tier yang dipilih — tidak perlu logika tier khusus.
- Wadah tab diberi `data-screenshot-ignore` sehingga **dihapus** dari hasil screenshot (kode snapshot sudah menghapus `[data-screenshot-ignore]`).
- Agar gambar tetap jelas tier-nya, tambahkan label tier aktif pada judul saat snapshot (mis. "Rincian Biaya Paket · {activeTier}") — manfaatkan blok kustomisasi judul yang sudah ada di kode snapshot (bagian "D1c"). Hanya bila `tiers.length > 1`.

## 5. Edge Cases
- **1 tier:** tidak ada tab; tampilan = sekarang.
- **Tier tanpa sebagian tipe kamar:** baris kamar tetap kondisional (`pricing?.Quard && …`) seperti sekarang.
- **≥4 tier:** segmented control harus tetap rapi — izinkan wrap/scroll horizontal agar tidak gepeng.
- **`pkg` berganti (mis. list re-render / virtualization):** `activeTier` jatuh ke `cheapestTier` bila `selectedTier` tak ada di `pkg.harga` baru (guard di 4.1).
- **Tier ada di `harga` tapi tidak di `hotel`:** `hotelInfo` jadi `undefined` — sudah aman karena semua akses pakai optional chaining.

## 6. Testing / Verifikasi
- `tsc` + `vite build` lulus (eslint v10 belum dikonfigurasi — lewati).
- Manual:
  - Paket >1 tier: tab muncul; ganti tab → hotel atas + tabel harga berubah; header "MULAI" tetap.
  - Paket 1 tier: tidak ada tab; identik dengan sekarang.
  - Default = tier termurah saat pertama expand.
  - Tombol "Simpan" (screenshot): gambar menangkap tier terpilih, tab tidak ikut tergambar, label tier muncul di judul harga.
  - Klik tab tidak meng-collapse kartu.

## 7. File Tersentuh
- `src/components/PackageCard.tsx` (satu-satunya).
