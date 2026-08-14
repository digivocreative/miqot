// Cakupan katalog PDF berbeda TEGAS antara dua mode halaman Brosur.
//
//   • Brosur Jadwal — dimensi Bulan sengaja mengabaikan bulan yang dipilih:
//     katalognya membentang semua bulan yang masih punya paket tersedia, dan
//     dropdown bulan hanya memilih pratinjau di layar. Satu halaman brosur
//     jadwal memuat 10 keberangkatan sekaligus, jadi katalog semusim tetap
//     tipis. Aturan itu tinggal di buildCatalogPlan()/catalogMonthEntries pada
//     BrochureSchedulePage — JANGAN disamakan dengan yang di bawah.
//
//   • Brosur Paket — satu paket = satu halaman brosur resmi. Menggabung semua
//     bulan berarti mengunduh puluhan sampai ratusan halaman yang tidak diminta
//     dan tidak cocok dengan grid di layar (grid hanya menampilkan bulan
//     terpilih). Jadi katalognya mengikuti filter aktif apa adanya — termasuk
//     Bulan. Yang tampil di layar = yang masuk PDF.
//
// Paket, label berkas, dan ringkasan cover dihitung di SATU tempat supaya
// ketiganya tidak bisa bergeser sendiri-sendiri: bug aslinya persis itu —
// halamannya semua bulan, covernya menulis "Semua Bulan", grid-nya satu bulan.

export interface PaketKatalogPackage {
  brosur?: string | null;
}

export interface PaketKatalogScope<P> {
  /** Paket yang benar-benar punya brosur resmi — satu halaman PDF per paket. */
  packages: Array<P & { brosur: string }>;
  /** Label filter aktif; dipakai untuk nama berkas dan deskripsi picker cover. */
  label: string;
  /** Baris ringkasan di cover katalog. Selalu sejalan dengan `packages`. */
  summary: Array<{ label: string; count: number }>;
}

const FALLBACK_LABEL = 'Filter aktif';

/**
 * Rakit cakupan katalog Brosur Paket dari hasil filter yang sedang tampil.
 *
 * `filteredPackages` adalah sumber yang sama dengan yang dipakai grid di layar,
 * sehingga PDF tidak pernah memuat bulan (atau tipe/maskapai/landing) yang
 * tidak terlihat oleh agent saat menekan tombolnya.
 */
export function buildPaketKatalogScope<P extends PaketKatalogPackage>(
  filteredPackages: readonly P[] | null | undefined,
  filterLabel: string | null | undefined,
): PaketKatalogScope<P> {
  const packages = (filteredPackages ?? []).filter(
    (pkg): pkg is P & { brosur: string } =>
      typeof pkg?.brosur === 'string' && pkg.brosur.trim().length > 0,
  );
  const label = String(filterLabel ?? '').trim() || FALLBACK_LABEL;
  return {
    packages,
    label,
    summary: packages.length > 0 ? [{ label, count: packages.length }] : [],
  };
}
