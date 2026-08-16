// Ukuran chrome dashboard yang dipakai bersama beberapa halaman.
//
// Angka di sini hasil UKURAN di browser, bukan taksiran: sub-bar sticky milik
// halaman anak harus menempel persis di bawah header sub-halaman, dan header
// (z-30) menimpa sub-bar (z-20) — jadi offset yang kependekan tidak terlihat
// sebagai celah, melainkan menyembunyikan bagian atas sub-bar diam-diam.

// Tinggi header sub-halaman DashboardLayout varian normal (BUKAN compactHeader
// milik Teras): py-3 (24) + chip tombol back h-11 dengan -m-1 → efektif 36 +
// border-b (1) = 61.
//
// Kalau padding header, ukuran chip, atau border-nya diubah di
// DashboardLayout.tsx, angka ini WAJIB diukur ulang di browser:
//   document.querySelector('header').getBoundingClientRect().height
// Verifikasi menempelnya (harus 0, diukur setelah halaman di-scroll):
//   subBar.getBoundingClientRect().top - header.getBoundingClientRect().bottom
export const DASHBOARD_SUBPAGE_HEADER_H = 61;
