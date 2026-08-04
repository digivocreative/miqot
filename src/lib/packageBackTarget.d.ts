export interface PackageBackTarget {
  href: string;
  label: string;
}

export const PACKAGE_BACK_TARGETS: Record<string, PackageBackTarget>;

/**
 * Tujuan tombol kembali di halaman Detail Paket berdasarkan token `?from=`.
 * Token di luar daftar tertutup (termasuk path/URL sembarang) jatuh ke
 * `fallbackHref`.
 */
export function resolvePackageBackTarget(
  from: unknown,
  fallbackHref: string,
): PackageBackTarget;
