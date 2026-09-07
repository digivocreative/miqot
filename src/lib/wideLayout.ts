/**
 * Ambang "layar lebar" untuk halaman jadwal publik.
 *
 * 1024px dipilih karena di situ kolom tengah menyempit ke 420px sehingga dua
 * rail muat di selokannya (lihat --jadwal-col-w di src/index.css). Angkanya
 * WAJIB sama dengan breakpoint pertama yang mengubah --jadwal-col-w di sana —
 * kalau berbeda, rail tampil lewat CSS tapi tak pernah diisi oleh JS, atau
 * sebaliknya. tests/wide-layout.test.js mengadu keduanya.
 */
export const WIDE_MEDIA_QUERY = '(min-width: 1024px)';

/** Bagian MediaQueryList yang benar-benar dipakai — supaya bisa dipalsukan di tes. */
type MediaQuerySource = Pick<MediaQueryList, 'addEventListener' | 'removeEventListener'>;

/**
 * Berlangganan perubahan media query.
 *
 * @returns fungsi pembatalan langganan; wajib dipanggil saat komponen dilepas,
 *   kalau tidak setiap kartu yang berganti meninggalkan listener menggantung.
 */
export function subscribeWide(mql: MediaQuerySource, onChange: () => void): () => void {
  const handler = () => onChange();
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}
