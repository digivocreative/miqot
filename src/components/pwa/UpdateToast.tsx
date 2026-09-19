import { useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { applyUpdate, getUpdateState, subscribeUpdate } from '../../lib/pwa/updateStore';
import { hasUnsavedChanges } from '../../lib/unsavedChanges';

const UNSAVED_CONFIRM = 'Ada perubahan yang belum disimpan. Refresh sekarang dan buang perubahan itu?';

// Pudar ke kiri: geometri mekar dari tepi kanan lalu hilang sebelum sampai ke teks, jadi
// judul dan deskripsi tetap duduk di atas hijau polos. Pola yang merata seluruh kartu
// terbaca ramai dan menggerus keterbacaan.
const PATTERN_MASK = 'linear-gradient(to left, #000 6%, transparent 68%)';

// Khatam/bintang delapan: dua persegi yang saling diputar 45°, ubin bersambung di tiap
// sudut supaya polanya menyambung mulus antar-ubin.
function KhatamPattern() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ maskImage: PATTERN_MASK, WebkitMaskImage: PATTERN_MASK }}
    >
      <defs>
        <g id="update-toast-star" fill="none" stroke="#fcd34d" strokeOpacity="0.55" strokeWidth="1">
          <path d="M0 -22.3 L22.3 0 L0 22.3 L-22.3 0 Z" />
          <path d="M-15.8 -15.8 H15.8 V15.8 H-15.8 Z" />
          <circle cx="0" cy="0" r="4.5" />
        </g>
        <pattern id="update-toast-khatam" width="54" height="54" patternUnits="userSpaceOnUse">
          <use href="#update-toast-star" x="27" y="27" />
          <use href="#update-toast-star" x="0" y="0" />
          <use href="#update-toast-star" x="54" y="0" />
          <use href="#update-toast-star" x="0" y="54" />
          <use href="#update-toast-star" x="54" y="54" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#update-toast-khatam)" />
    </svg>
  );
}

// Tawaran versi baru. Menggantikan reload otomatis tanpa peringatan (yang membuang teks
// yang sedang diketik dan me-reload semua tab sekaligus). Versi baru juga otomatis dipakai
// saat semua jendela app ditutup lalu dibuka lagi.
//
// Kartu ini sengaja berwarna penuh, bukan putih seperti kartu lain di dashboard: agen
// bekerja sambil lalu dan tawaran yang menyatu dengan halaman terlewat begitu saja.
// Denyut di ikon + slide masuk menarik mata sekali, lalu diam — tanpa suara, tanpa
// getaran. `prefers-reduced-motion` mematikan geraknya.
//
// Sengaja tanpa tombol tutup: versi lama boleh saja memanggil endpoint yang sudah
// berubah, jadi tawaran ini harus dijawab, bukan diabaikan. Pengaman ketikan yang belum
// disimpan tetap ada — Refresh minta konfirmasi lebih dulu (lihat `reload` di bawah).
// `dismissUpdate` di store dibiarkan: dipakai tes, dan jadi jalan keluar kalau suatu
// saat tombol tutup dihidupkan lagi.
export default function UpdateToast() {
  const state = useSyncExternalStore(subscribeUpdate, getUpdateState, getUpdateState);
  const reduceMotion = useReducedMotion();
  const visible = state.ready && !state.dismissed;

  const reload = () => {
    if (hasUnsavedChanges() && !window.confirm(UNSAVED_CONFIRM)) return;
    applyUpdate();
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[10001] flex justify-center px-4"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
    >
      <AnimatePresence>
        {visible && (
          <motion.div
            key="update-toast"
            role="status"
            aria-live="polite"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.96 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26, mass: 0.7 }}
            className="pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-800 via-emerald-900 to-teal-950 p-3 shadow-xl shadow-emerald-950/40 ring-1 ring-amber-200/20"
          >
            <KhatamPattern />
            <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-amber-200/10 blur-2xl" />
            <div className="relative">
              <div className="flex items-start gap-3">
                <span className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-amber-100">
                  {!reduceMotion && (
                    <motion.span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full bg-amber-200/35"
                      animate={{ scale: [1, 1.6], opacity: [0.5, 0] }}
                      transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 0.8, ease: 'easeOut' }}
                    />
                  )}
                  <RefreshCw size={16} className="relative" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm font-semibold leading-tight text-white">Versi baru tersedia</p>
                  <p className="mt-1 text-xs leading-snug text-emerald-100/80">Refresh untuk memakai pembaruan.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={reload}
                className="mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-white text-sm font-semibold text-emerald-800 shadow-sm transition-colors hover:bg-emerald-50 active:scale-[0.98]"
              >
                Refresh
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
