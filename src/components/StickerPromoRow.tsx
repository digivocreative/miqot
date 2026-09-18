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
import {
  promoStateAfterDismiss,
  readPromoState,
  serializePromoState,
  shouldShowPromo,
} from '../lib/stickerPromoGate.js';

const STATE_KEY = 'stickerPromoState';

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

/**
 * Boleh muncul? Gerbangnya di src/lib/stickerPromoGate.js; di sini hanya I/O.
 * localStorage yang melempar (mode privat, site data diblokir) = TIDAK boleh:
 * tanpa penyimpanan kita tak bisa menghitung apa pun, dan callout yang muncul
 * tiap buka halaman jauh lebih mengganggu daripada yang tidak pernah muncul.
 */
function bolehMuncul(): boolean {
  try {
    return shouldShowPromo(readPromoState(localStorage.getItem(STATE_KEY)), Date.now());
  } catch {
    return false;
  }
}

/** @param counted true hanya untuk tombol "Coba sekarang"/"Nanti". */
function catatTutup(counted: boolean) {
  try {
    const next = promoStateAfterDismiss(
      readPromoState(localStorage.getItem(STATE_KEY)),
      Date.now(),
      counted,
    );
    localStorage.setItem(STATE_KEY, serializePromoState(next));
  } catch { /* klaim tingkat modul tetap menahannya selama sesi ini */ }
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
  /**
   * 'auto' mengikuti tema aplikasi. 'light' memaksa gaya terang: dipakai di
   * kartu pratinjau Brosur Jadwal yang latarnya DIPAKU putih lewat inline style
   * karena ia meniru kertas, bukan permukaan aplikasi. Tanpa ini barisnya
   * berubah gelap di atas kartu putih begitu agent memakai mode gelap.
   */
  surface?: 'auto' | 'light';
}

export function StickerPromoRow({ onOpen, disabled = false, allowCallout = true, onCalloutChange, surface = 'auto' }: StickerPromoRowProps) {
  const [showCallout, setShowCallout] = useState(false);
  const claimedRef = useRef(false);
  const reduceMotion = useReducedMotion();
  const terang = surface === 'light';
  const cls = {
    row: terang
      ? 'bg-slate-50 border-slate-200 hover:bg-slate-100'
      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-800',
    ring: terang ? 'ring-white' : 'ring-white dark:ring-slate-800',
    judul: terang ? 'text-gray-900' : 'text-gray-900 dark:text-white',
    sub: terang ? 'text-gray-500' : 'text-gray-500 dark:text-slate-400',
    panah: terang ? 'text-gray-400' : 'text-gray-400 dark:text-slate-500',
    balon: terang ? 'bg-white ring-black/5' : 'bg-white dark:bg-slate-800 ring-black/5 dark:ring-white/10',
    balonJudul: terang ? 'text-gray-900' : 'text-gray-900 dark:text-white',
    balonIsi: terang ? 'text-gray-500' : 'text-gray-500 dark:text-slate-400',
    ekor: terang ? 'bg-white' : 'bg-white dark:bg-slate-800',
    nanti: terang ? 'text-gray-500' : 'text-gray-500 dark:text-slate-400',
  };

  const calloutChangeRef = useRef(onCalloutChange);
  calloutChangeRef.current = onCalloutChange;
  useEffect(() => { calloutChangeRef.current?.(showCallout); }, [showCallout]);
  useEffect(() => () => { calloutChangeRef.current?.(false); }, []);

  useEffect(() => {
    if (!allowCallout || disabled || calloutClaimed) return;
    if (!forcedByUrl() && !bolehMuncul()) return;
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

  /**
   * @param counted true = agent menjawab ajakannya lewat tombol callout, jadi
   *   ikut menghitung menuju batas 10. Membuka baris langsung hanya menunda
   *   4 jam berikutnya.
   */
  function dismiss(counted: boolean) {
    // Hanya mencatat kalau callout memang sedang tampil: membuka baris di luar
    // itu tidak boleh diam-diam menggeser jadwal munculnya.
    // Saat dipaksa lewat URL, sengaja tidak mencatat apa pun — peragaan
    // berikutnya cukup memuat ulang halaman.
    if (showCallout && !forcedByUrl()) catatTutup(counted);
    setShowCallout(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        data-sticker-open
        onClick={(e) => { e.stopPropagation(); dismiss(false); onOpen(); }}
        disabled={disabled}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left border-t transition-colors disabled:opacity-60 ${cls.row}`}
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
              className={`absolute top-0 w-[30px] h-[30px] rounded-full object-contain bg-white ring-2 shadow-sm ${cls.ring}`}
              style={{ left: i * 19, zIndex: STICKER_PROMO_PREVIEW.length - i }}
            />
          ))}
        </span>

        <span className="min-w-0 flex-1">
          <span className={`block text-xs font-bold leading-tight ${cls.judul}`}>
            Tempel sticker ke brosur
          </span>
          <span className={`block text-[10px] leading-tight mt-0.5 truncate ${cls.sub}`}>
            Sisa seat, promo, hotel bintang 5
          </span>
        </span>

        <ChevronRight size={18} className={`flex-none ${cls.panah}`} />
      </button>

      <AnimatePresence>
        {showCallout && (
          <motion.div
            data-sticker-callout
            className={`absolute bottom-full right-3 z-30 mb-2 w-[232px] rounded-2xl p-3.5 shadow-xl ring-1 ${cls.balon}`}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', damping: 22, stiffness: 320, delay: 0.4 }}
          >
            <div className="flex items-center gap-1.5">
              <Sparkles size={14} className="flex-none text-amber-500" />
              <p className={`text-xs font-extrabold ${cls.balonJudul}`}>Baru — Tempel Sticker</p>
            </div>
            <p className={`mt-1.5 text-[11px] leading-relaxed ${cls.balonIsi}`}>
              Tempel “SISA 2 SEAT” atau “PROMO TERBATAS” langsung di brosurnya.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                data-sticker-callout-try
                onClick={(e) => { e.stopPropagation(); dismiss(true); onOpen(); }}
                className="rounded-full bg-emerald-500 px-3.5 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-emerald-600"
              >
                Coba sekarang
              </button>
              <button
                type="button"
                data-sticker-callout-later
                onClick={(e) => { e.stopPropagation(); dismiss(true); }}
                className={`rounded-full px-2.5 py-1.5 text-[11px] font-semibold ${cls.nanti}`}
              >
                Nanti
              </button>
            </div>
            {/* Ekor balon menunjuk ke baris di bawahnya. */}
            <span className={`absolute -bottom-1.5 right-7 h-3 w-3 rotate-45 rounded-[2px] ${cls.ekor}`} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default StickerPromoRow;
