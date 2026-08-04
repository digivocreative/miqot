// Pemenggalan daftar keberangkatan menjadi halaman brosur.
//
// Dipakai DUA tempat: halaman /dashboard/brosur dan brosur jadwal yang dirender
// langsung di dalam Bani. Kalau angkanya berbeda di antara keduanya, brosur
// yang sama akan terpotong di baris yang berbeda — dan agent akan melihat dua
// "brosur Oktober" yang isinya tidak sama.
//
// Tipe BrochureMonth/BrochurePackage diimpor sebagai TIPE saja, jadi modul ini
// tidak menyeret komponen template ke bundle pemanggilnya.
import type { BrochureMonth, BrochurePackage } from '../components/BrochureScheduleTemplate';

/** Baris per gambar. Tinggi baris template menyesuaikan kanvas 1080×1620. */
export const PACKAGES_PER_IMAGE = 10;

export function splitPackagesIntoPages(
  packages: BrochurePackage[],
  pageKeyPrefix: string,
  label: string,
): BrochureMonth[] {
  const pages: BrochureMonth[] = [];
  for (let start = 0; start < packages.length; start += PACKAGES_PER_IMAGE) {
    pages.push({
      key: `${pageKeyPrefix}-page-${pages.length + 1}`,
      label,
      monthIndexId: -1,
      year: 0,
      packages: packages.slice(start, start + PACKAGES_PER_IMAGE),
      truncatedCount: 0,
    });
  }
  return pages;
}
