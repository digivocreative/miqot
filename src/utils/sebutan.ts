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
