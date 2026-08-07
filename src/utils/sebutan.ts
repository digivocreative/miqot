// Sebutan (honorific) yang bisa dipilih agen untuk menyapa jamaah di fitur
// Ulang Tahun. Berkas terpisah dan bukan konstanta di BirthdayWidget.tsx:
// BirthdayDetailSheet di-lazy-load (DashboardLayout.tsx:125), jadi mengimpor
// NILAI ini dari BirthdayWidget akan menyeret komponen widget itu ke dalam
// chunk sheet.

export const SEBUTAN_LIST = [
  'Bapak',
  'Pak',
  'Ibu',
  'Bu',
  'Bunda',
  'Kak',
  'Mas',
  'Mba',
] as const;

export type Sebutan = typeof SEBUTAN_LIST[number];

export const SEBUTAN_OPTIONS: ReadonlyArray<{ value: Sebutan; label: Sebutan }> =
  SEBUTAN_LIST.map(s => ({ value: s, label: s }));

export function isSebutan(value: string): value is Sebutan {
  return (SEBUTAN_LIST as readonly string[]).includes(value);
}

export const GELAR_LIST = ['', 'H.', 'Hj.'] as const;

export type Gelar = typeof GELAR_LIST[number];

export const GELAR_OPTIONS: ReadonlyArray<{ value: Gelar; label: string }> = [
  { value: '', label: '—' },
  { value: 'H.', label: 'H.' },
  { value: 'Hj.', label: 'Hj.' },
];

export function isGelar(value: string): value is Gelar {
  return (GELAR_LIST as readonly string[]).includes(value);
}

export function formatSapaan(sebutan: Sebutan, gelar: Gelar): string {
  return gelar ? `${sebutan} ${gelar}` : sebutan;
}

// Awalan WAJIB diikuti titik atau spasi. Tanpa syarat itu "HASAN" ikut
// terpotong jadi "ASAN" — kesalahan yang jauh lebih merusak daripada gelar
// yang tidak terdeteksi. Alternasi diurut dari yang terpanjang supaya HJH/HAJAH
// tidak keburu tertangkap sebagai HJ/H. Hanya satu awalan yang dibuang.
const GELAR_PREFIX = /^\s*(HJH|HAJAH|HAJI|HJ|H)[.\s]\s*/i;

export function splitGelarFromNama(nama: string): { gelar: Gelar; nama: string } {
  const match = (nama || '').match(GELAR_PREFIX);
  if (!match) return { gelar: '', nama };
  const kata = match[1].toUpperCase();
  const gelar: Gelar = kata === 'HJ' || kata === 'HJH' || kata === 'HAJAH' ? 'Hj.' : 'H.';
  return { gelar, nama: nama.slice(match[0].length) };
}
