// Pembagian bacaan untuk menu "Doa" dan "Dzikir" halaman Kloter 45.
// Sumbernya dipakai ulang dari Portal Jamaah supaya tidak ada dua salinan doa.
// Impor pakai path relatif (bukan alias @/) supaya bisa dijalankan langsung di
// node untuk tes.

import { DOA_CATEGORIES, type DoaCategory, type DoaEntry } from '../components/portal-jamaah/lib/doaData.ts';
import { DZIKIR_CATEGORIES } from '../components/portal-jamaah/lib/dzikirData.ts';

export interface BacaanTab {
  id: string;
  label: string;
  entries: DoaEntry[];
}

// Kategori doaData.ts yang sebenarnya dzikir — dipindah ke menu Dzikir.
export const DZIKIR_IDS_FROM_DOA: readonly string[] = ['dzikir-harian'];

export const KLOTER45_DOA_CATEGORIES: DoaCategory[] = DOA_CATEGORIES.filter(
  (category) => !DZIKIR_IDS_FROM_DOA.includes(category.id)
);

export const KLOTER45_DZIKIR_CATEGORIES: DoaCategory[] = [
  ...DZIKIR_CATEGORIES,
  ...DOA_CATEGORIES.filter((category) => DZIKIR_IDS_FROM_DOA.includes(category.id)),
];

// Urutan tab "Doa Umroh" mengikuti alur manasik (disamakan dengan urutan yang
// sudah biasa dilihat jamaah di aplikasi travel lain): dari berangkat rumah
// sampai tahalul. Satu id = satu entri di doaData.ts.
export const DOA_UMROH_ORDER: readonly string[] = [
  'berangkat-dari-rumah',
  'naik-kendaraan',
  'niat-umroh',
  'setelah-berihram',
  'talbiyah',
  'masuk-kota',
  'masuk-masjid',
  'melihat-kabah',
  'doa-tawaf',
  'awal-sai',
  'tahalul',
];

export const DOA_HARIAN_ORDER: readonly string[] = [
  'sebelum-tidur',
  'bangun-tidur',
  'masuk-kamar-mandi',
  'bercermin',
  'keluar-rumah',
  'masuk-rumah',
  'ilmu-bermanfaat',
  'sebelum-belajar',
  'sesudah-belajar',
  'sebelum-wudhu',
  'setelah-wudhu',
  'sebelum-baca-quran',
  'setelah-baca-quran',
  'sebelum-mandi',
  'doa-safar',
  'masuk-kota',
  'sebelum-makan',
  'sesudah-makan',
  'masuk-masjid',
  'keluar-masjid',
];

const DOA_ENTRY_BY_ID = new Map<string, DoaEntry>(
  DOA_CATEGORIES.flatMap((category) => category.entries.map((entry) => [entry.id, entry] as const))
);

// Judul untuk tab dibuat lebih pendek/seragam dari judul entri aslinya.
const DOA_TAB_TITLE_OVERRIDES: Record<string, string> = {
  'masuk-kota': 'Doa Memasuki Kota Mekkah',
  'masuk-masjid': 'Doa Memasuki Masjidil Haram',
  'melihat-kabah': 'Doa Ketika Melihat Ka’bah',
  'talbiyah': 'Kalimat Talbiyah',
  'awal-sai': 'Doa Sa’i',
  'doa-safar': 'Doa hendak bepergian',
};
const DOA_HARIAN_TITLE_OVERRIDES: Record<string, string> = {
  'doa-safar': 'Doa hendak bepergian',
  'masuk-kota': 'Doa ketika sampai di tempat tujuan',
  'masuk-masjid': 'Doa masuk masjid',
};

function resolveEntries(order: readonly string[], overrides: Record<string, string>): DoaEntry[] {
  return order.map((id) => {
    const entry = DOA_ENTRY_BY_ID.get(id);
    if (!entry) throw new Error(`Doa dengan id "${id}" tidak ada di doaData.ts`);
    return overrides[id] ? { ...entry, title: overrides[id] } : entry;
  });
}

export const KLOTER45_DOA_TABS: BacaanTab[] = [
  { id: 'umroh', label: 'Doa Umroh', entries: resolveEntries(DOA_UMROH_ORDER, DOA_TAB_TITLE_OVERRIDES) },
  { id: 'harian', label: 'Doa Harian', entries: resolveEntries(DOA_HARIAN_ORDER, DOA_HARIAN_TITLE_OVERRIDES) },
];

const DZIKIR_TAB_LABELS: Record<string, string> = {
  'dzikir-pagi-petang': 'Pagi & Petang',
  'dzikir-setelah-shalat': 'Setelah Shalat',
  'dzikir-harian': 'Harian',
};

export const KLOTER45_DZIKIR_TABS: BacaanTab[] = KLOTER45_DZIKIR_CATEGORIES.map((category) => ({
  id: category.id,
  label: DZIKIR_TAB_LABELS[category.id] ?? category.title,
  entries: category.entries,
}));
