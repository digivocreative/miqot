import { useEffect, useRef } from 'react';

const OVERLAY_KEY = '__overlay';
let overlaySeq = 0;

/**
 * Overlay (modal, bottom sheet, penampil media) yang tertutup oleh tombol/gestur back.
 *
 * Tanpa ini, back Android saat modal terbuka menutup HALAMAN di bawahnya — atau keluar
 * dari app kalau modal dibuka di layar pertama. Saat `open` menjadi true, hook menambah
 * satu entri riwayat (URL sama); back membuang entri itu dan memanggil `onClose`.
 * Ditutup lewat UI (tombol X, backdrop) → entri itu dibuang dengan history.back() bila
 * masih di puncak, supaya back berikutnya tidak "kosong".
 *
 * Catatan pemakai: pasang di komponen yang MEMILIKI state buka/tutup overlay-nya. Jangan
 * dipakai untuk overlay yang sudah mengelola riwayatnya sendiri (mis. sub-halaman yang
 * mengubah URL).
 */
export function useBackToClose(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    overlaySeq += 1;
    const token = `overlay-${overlaySeq}`;
    let pushed = false;
    let closedByBack = false;

    // Ditunda satu tick: StrictMode (dev) menjalankan efek → cleanup → efek seketika; cleanup
    // pertama membatalkan timer sehingga tidak ada entri riwayat yatim.
    const timer = window.setTimeout(() => {
      const state = (window.history.state as Record<string, unknown> | null) ?? {};
      window.history.pushState({ ...state, [OVERLAY_KEY]: token }, '', window.location.href);
      pushed = true;
    }, 0);

    const onPopState = () => {
      if (!pushed) return;
      const state = window.history.state as Record<string, unknown> | null;
      if (state?.[OVERLAY_KEY] === token) return;
      closedByBack = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('popstate', onPopState);
      const state = window.history.state as Record<string, unknown> | null;
      if (pushed && !closedByBack && state?.[OVERLAY_KEY] === token) {
        window.history.back();
      }
    };
  }, [open]);
}
