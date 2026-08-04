// Tujuan tombol "kembali" di halaman Detail Paket (/:slug/:jadwalId).
//
// Dulu tombol itu SELALU menuju daftar jadwal (/:slug), berapa pun jalan yang
// dipakai agent untuk sampai ke sana. Dari Bani efeknya terasa salah: agent
// mengetuk baris tabel, membaca paketnya, menekan kembali — dan mendarat di
// daftar jadwal, bukan di percakapan yang barusan ditinggalkan.
//
// Asal halaman ditandai lewat query `?from=<token>`. TOKEN, bukan path: path
// dari URL berarti siapa pun bisa menaruh tujuan sembarang di tombol kembali
// (termasuk host luar). Di sini token hanya dicocokkan ke daftar tertutup, dan
// apa pun yang tak dikenal jatuh ke tujuan bawaan pemanggil.

/** @type {Record<string, { href: string, label: string }>} */
export const PACKAGE_BACK_TARGETS = {
  bani: { href: '/dashboard/bani', label: 'Kembali ke Bani' },
};

/**
 * @param {unknown} from token dari query `?from=`
 * @param {string} fallbackHref tujuan bawaan (biasanya daftar jadwal agent)
 * @returns {{ href: string, label: string }}
 */
export function resolvePackageBackTarget(from, fallbackHref) {
  const fallback = { href: typeof fallbackHref === 'string' && fallbackHref ? fallbackHref : '/', label: 'Kembali' };
  const key = typeof from === 'string' ? from.trim().toLowerCase() : '';
  if (!key || !Object.prototype.hasOwnProperty.call(PACKAGE_BACK_TARGETS, key)) return fallback;

  const target = PACKAGE_BACK_TARGETS[key];
  // Sabuk pengaman kedua: hanya path internal satu garis miring yang lolos,
  // sehingga "//evil.com" atau URL absolut tidak pernah bisa jadi tujuan.
  const internal = typeof target?.href === 'string' && /^\/(?!\/)/.test(target.href);
  return internal ? target : fallback;
}
