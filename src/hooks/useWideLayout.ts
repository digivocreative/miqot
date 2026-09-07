import { useSyncExternalStore } from 'react';

import { WIDE_MEDIA_QUERY, subscribeWide } from '@/lib/wideLayout';

// MediaQueryList di-cache di level modul: halaman daftar merender ratusan kartu,
// dan setiap window.matchMedia() baru adalah objek baru yang memaksa
// useSyncExternalStore berlangganan ulang tiap render.
let cachedMql: MediaQueryList | null = null;

function mediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  if (!cachedMql) cachedMql = window.matchMedia(WIDE_MEDIA_QUERY);
  return cachedMql;
}

/**
 * true saat viewport ≥1024px — ambang tempat rail jadwal mulai dirender.
 *
 * Aman di SSR: harness tes merender komponen di node tanpa `window`, dan
 * getServerSnapshot mengembalikan false. Artinya HTML hasil render server selalu
 * berperilaku seperti HP — tepat seperti yang kita mau, karena semua perilaku
 * di bawah 1024px memang tidak boleh berubah.
 */
export function useWideLayout(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = mediaQuery();
      return mql ? subscribeWide(mql, onChange) : () => {};
    },
    () => mediaQuery()?.matches ?? false,
    () => false,
  );
}

export default useWideLayout;
