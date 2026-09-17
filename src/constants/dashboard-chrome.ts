// Ukuran chrome dashboard yang dipakai bersama beberapa halaman.
//
// Angka di sini hasil UKURAN di browser, bukan taksiran: sub-bar sticky milik
// halaman anak harus menempel persis di bawah header sub-halaman, dan header
// (z-30) menimpa sub-bar (z-20) — jadi offset yang kependekan tidak terlihat
// sebagai celah, melainkan menyembunyikan bagian atas sub-bar diam-diam.

// Tinggi header sub-halaman DashboardLayout varian normal (BUKAN compactHeader
// milik Teras): py-3 (24) + chip tombol back h-11 dengan -m-1 → efektif 36 +
// border-b (1) = 61 — di luar safe area atas (lihat DASHBOARD_SUBPAGE_HEADER_OFFSET).
//
// Kalau padding header, ukuran chip, atau border-nya diubah di
// DashboardLayout.tsx, angka ini WAJIB diukur ulang di browser:
//   document.querySelector('header').getBoundingClientRect().height
// Verifikasi menempelnya (harus 0, diukur setelah halaman di-scroll):
//   subBar.getBoundingClientRect().top - header.getBoundingClientRect().bottom
export const DASHBOARD_SUBPAGE_HEADER_H = 61;

// App terpasang di iOS 26 digambar penuh di bawah status bar/Dynamic Island, jadi
// padding atas header ditambah env(safe-area-inset-top) (calc, BUKAN max — supaya
// tingginya tetap tepat 61px + inset). Semua `top:` sub-bar sticky dan
// `calc(100dvh - …)` wajib memakai dua konstanta di bawah, bukan angka piksel
// mentah: offset tanpa inset membuat sub-bar terselip di bawah header. Di Android
// dan peramban biasa inset = 0, jadi hasilnya sama dengan 61px.
export const SAFE_AREA_TOP = 'env(safe-area-inset-top, 0px)';

export const DASHBOARD_SUBPAGE_HEADER_OFFSET = `calc(${DASHBOARD_SUBPAGE_HEADER_H}px + ${SAFE_AREA_TOP})`;

/** Tinggi viewport di bawah header sub-halaman, dikurangi `extraPx` (chrome lain). */
export function dashboardViewportBelowHeader(extraPx = 0): string {
  return `calc(100dvh - ${DASHBOARD_SUBPAGE_HEADER_H + extraPx}px - ${SAFE_AREA_TOP})`;
}
