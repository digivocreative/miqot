'use client';

// Baris ajakan "Tempel sticker ke brosur" — satu-satunya pintu masuk fitur
// sticker, dipakai sama persis di ketiga permukaan brosur.
//
// Menggantikan pil melayang di pojok brosur, dan itu keputusan desain: pil kecil
// hanya menyebut NAMA fitur, sementara baris ini memperlihatkan wujud sticker-nya,
// menjawab "buat apa" lewat subjudul, dan memberi area tap selebar kartu. Bonusnya
// brosur tidak tertutup apa pun.
//
// Callout di dalamnya muncul SEKALI seumur perangkat, untuk agent yang belum
// pernah memakai fitur ini. Dua penjaga menahannya: bendera localStorage (antar
// sesi) dan klaim tingkat modul (dalam satu layar — halaman Jadwal merender
// banyak kartu sekaligus, dan tanpa klaim itu callout-nya muncul berkali-kali).
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, Sparkles } from 'lucide-react';

import { STICKER_PROMO_PREVIEW, stickerThumbUrl } from '../lib/stickerCatalog.js';

const SEEN_KEY = 'stickerPromoSeen';

/** Hanya satu baris di layar yang boleh menampilkan callout. */
let calloutClaimed = false;

/**
 * `?stiker=1` memaksa callout muncul untuk demo, tanpa menyentuh localStorage —
 * jadi memperagakannya berkali-kali tidak perlu membersihkan apa pun, dan agent
 * sungguhan yang sudah pernah melihatnya tidak ikut terganggu.
 *
 * Nilainya diingat sepanjang sesi karena app menulis ulang URL-nya sendiri
 * (sub-tab, filter); tanpa ini bendera itu hilang begitu URL berubah.
 */
let forcedSession = false;
function forcedByUrl(): boolean {
  if (forcedSession) return true;
  try {
    if (typeof window === 'undefined') return false;
    if (new URLSearchParams(window.location.search).get('stiker') === '1') {
      forcedSession = true;
      return true;
    }
  } catch { /* URL aneh: perlakukan sebagai tidak dipaksa */ }
  return false;
}

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    // Mode privat / site data diblokir: perlakukan sebagai sudah pernah lihat.
    // Callout yang muncul terus tiap buka halaman lebih mengganggu daripada
    // callout yang tidak pernah muncul.
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch { /* tidak apa-apa; klaim modul tetap menahannya selama sesi ini */ }
}

export interface StickerPromoRowProps {
  /** Membuka studio sticker. */
  onOpen: () => void;
  /** Mati saat gambar dasarnya belum siap. */
  disabled?: boolean;
  /**
   * Izin menampilkan callout perkenalan. Permukaan yang barisnya belum tentu
   * terlihat (mis. kartu yang sedang tertutup) mengirim false.
   */
  allowCallout?: boolean;
  /**
   * Dipanggil saat callout muncul/hilang. BrochureModal memakainya untuk
   * menyingkirkan kontrol zoom yang melayang tepat di area balon itu.
   */
  onCalloutChange?: (open: boolean) => void;
}

export function StickerPromoRow({ onOpen, disabled = false, allowCallout = true, onCalloutChange }: StickerPromoRowProps) {
  const [showCallout, setShowCallout] = useState(false);
  const claimedRef = useRef(false);
  const reduceMotion = useReducedMotion();

  const calloutChangeRef = useRef(onCalloutChange);
  calloutChangeRef.current = onCalloutChange;
  useEffect(() => { calloutChangeRef.current?.(showCallout); }, [showCallout]);
  useEffect(() => () => { calloutChangeRef.current?.(false); }, []);

  useEffect(() => {
    if (!allowCallout || disabled || calloutClaimed) return;
    if (!forcedByUrl() && alreadySeen()) return;
    calloutClaimed = true;
    claimedRef.current = true;
    setShowCallout(true);
    return () => {
      if (claimedRef.current) {
        calloutClaimed = false;
        claimedRef.current = false;
      }
    };
  }, [allowCallout, disabled]);

  function dismiss() {
    // Saat dipaksa lewat URL, sengaja TIDAK menandai sudah-dilihat: peragaan
    // berikutnya cukup memuat ulang halaman.
    if (!forcedByUrl()) markSeen();
    setShowCallout(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        data-sticker-open
        onClick={(e) => { e.stopPropagation(); dismiss(); onOpen(); }}
        disabled={disabled}
        className="w-full flex items-center gap-3 px-4 py-3 text-left bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-700/50 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
      >
        {/* Sticker aslinya, bertumpuk. Ini yang menjelaskan fitur tanpa kata —
            ikon generik tidak akan memberi tahu apa pun. */}
        <span className="relative flex-none h-[30px]" style={{ width: 30 + 19 * (STICKER_PROMO_PREVIEW.length - 1) }}>
          {STICKER_PROMO_PREVIEW.map((id, i) => (
            <img
              key={id}
              src={stickerThumbUrl(id)}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute top-0 w-[30px] h-[30px] rounded-full object-contain bg-white ring-2 ring-white dark:ring-slate-800 shadow-sm"
              style={{ left: i * 19, zIndex: STICKER_PROMO_PREVIEW.length - i }}
            />
          ))}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold text-gray-900 dark:text-white leading-tight">
            Tempel sticker ke brosur
          </span>
          <span className="block text-[10px] text-gray-500 dark:text-slate-400 leading-tight mt-0.5 truncate">
            Sisa seat, promo, hotel bintang 5
          </span>
        </span>

        <ChevronRight size={18} className="flex-none text-gray-400 dark:text-slate-500" />
      </button>

      <AnimatePresence>
        {showCallout && (
          <motion.div
            data-sticker-callout
            className="absolute bottom-full right-3 z-30 mb-2 w-[232px] rounded-2xl bg-white dark:bg-slate-800 p-3.5 shadow-xl ring-1 ring-black/5 dark:ring-white/10"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', damping: 22, stiffness: 320, delay: 0.4 }}
          >
            <div className="flex items-center gap-1.5">
              <Sparkles size={14} className="flex-none text-amber-500" />
              <p className="text-xs font-extrabold text-gray-900 dark:text-white">Baru — Tempel Sticker</p>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500 dark:text-slate-400">
              Tandai brosurmu: sisa seat, promo, atau hotel bintang 5. Menempel langsung ke gambar yang kamu kirim.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                data-sticker-callout-try
                onClick={(e) => { e.stopPropagation(); dismiss(); onOpen(); }}
                className="rounded-full bg-emerald-500 px-3.5 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-emerald-600"
              >
                Coba sekarang
              </button>
              <button
                type="button"
                data-sticker-callout-later
                onClick={(e) => { e.stopPropagation(); dismiss(); }}
                className="rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 dark:text-slate-400"
              >
                Nanti
              </button>
            </div>
            {/* Ekor balon menunjuk ke baris di bawahnya. */}
            <span className="absolute -bottom-1.5 right-7 h-3 w-3 rotate-45 rounded-[2px] bg-white dark:bg-slate-800" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default StickerPromoRow;
