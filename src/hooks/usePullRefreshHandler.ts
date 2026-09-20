import { useEffect, useRef } from 'react';
import { pushRefreshHandler } from '@/lib/pwa/refresh-registry';

/**
 * Daftarkan cara menyegarkan halaman ini ke gestur tarik-untuk-segarkan.
 *
 * `handler` boleh berganti identitas tiap render (closure biasa) — yang
 * didaftarkan adalah pembungkus stabil yang membaca ref, jadi pendaftarannya
 * tidak dicopot-pasang tiap render. Yang benar-benar mendaftar/lepas hanyalah
 * perubahan `enabled`: pakai itu untuk halaman yang kadang boleh disegarkan dan
 * kadang tidak (mis. form yang belum disimpan).
 *
 * Halaman anak yang mendaftar akan MENANG atas pendaftaran shell selama ia
 * terpasang, lalu giliran kembali otomatis saat ia dilepas.
 */
export function usePullRefreshHandler(handler: () => unknown, enabled = true): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    return pushRefreshHandler(() => handlerRef.current());
  }, [enabled]);
}

export default usePullRefreshHandler;
