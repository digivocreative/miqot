// Pembagian bacaan untuk menu "Doa" dan "Dzikir" halaman Kloter 45.
// Sumbernya dipakai ulang dari Portal Jamaah supaya tidak ada dua salinan doa.
// Impor pakai path relatif (bukan alias @/) supaya bisa dijalankan langsung di
// node untuk tes.

import { DOA_CATEGORIES, type DoaCategory } from '../components/portal-jamaah/lib/doaData.ts';
import { DZIKIR_CATEGORIES } from '../components/portal-jamaah/lib/dzikirData.ts';

// Kategori doaData.ts yang sebenarnya dzikir — dipindah ke menu Dzikir.
export const DZIKIR_IDS_FROM_DOA: readonly string[] = ['dzikir-harian'];

export const KLOTER45_DOA_CATEGORIES: DoaCategory[] = DOA_CATEGORIES.filter(
  (category) => !DZIKIR_IDS_FROM_DOA.includes(category.id)
);

export const KLOTER45_DZIKIR_CATEGORIES: DoaCategory[] = [
  ...DZIKIR_CATEGORIES,
  ...DOA_CATEGORIES.filter((category) => DZIKIR_IDS_FROM_DOA.includes(category.id)),
];
