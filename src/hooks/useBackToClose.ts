import { useEffect, useRef } from 'react';
import { openOverlayEntry } from '../lib/overlayHistory';

/**
 * Overlay (modal, bottom sheet, penampil media) yang tertutup oleh tombol/gestur back.
 *
 * Tanpa ini, back Android saat modal terbuka menutup HALAMAN di bawahnya — atau keluar
 * dari app kalau modal dibuka di layar pertama. Saat `open` menjadi true, satu entri
 * riwayat (URL sama) ditambahkan; back membuang entri itu dan memanggil `onClose`.
 * Ditutup lewat UI (tombol X, backdrop) → entri itu dibuang lagi supaya back berikutnya
 * tidak "kosong". Koordinasi antar-overlay (tutup A + buka B sekaligus, induk + anak)
 * ada di src/lib/overlayHistory.ts.
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
    return openOverlayEntry(() => onCloseRef.current());
  }, [open]);
}
