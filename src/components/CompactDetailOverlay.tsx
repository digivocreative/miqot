import { useMemo } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import type { UmrohPackage } from '@/types';
import type { AgentData } from '@/data/agents';
import { PackageCard } from './PackageCard';

/** Kotak kartu ringkas di layar (koordinat viewport). */
export interface CardRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Ukur kartu ringkas `jadwalId` di dalam daftar. null kalau kartu tidak ada atau
 * sepenuhnya di luar layar — tak ada asal yang bisa dilihat, overlay jatuh ke fade.
 * Cari HANYA di dalam `listEl`: PackageCard di overlay memakai data-jadwal-id yang sama.
 */
export function measureCompactCard(listEl: HTMLElement | null, jadwalId: string | null): CardRect | null {
  if (!listEl || !jadwalId) return null;
  const el = listEl.querySelector<HTMLElement>(`[data-jadwal-id="${CSS.escape(jadwalId)}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.bottom <= 0 || r.top >= window.innerHeight || r.width === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

// rounded-xl CompactCard
const CARD_RADIUS = 12;
const EASE_STANDARD = [0.4, 0, 0.2, 1] as const;
const EASE_DECELERATE = [0.2, 0, 0, 1] as const;

/**
 * Transform yang menaruh permukaan layar-penuh tepat di atas kartu. Origin kiri-atas,
 * jadi x/y = posisi kartu dan skala = rasio ukuran. Radius dibagi skala per sumbu
 * supaya sudut tetap terbaca 12px meski skala X dan Y jauh berbeda (±0,96 vs ±0,19).
 */
function overCard(rect: CardRect) {
  const sx = rect.width / window.innerWidth;
  const sy = rect.height / window.innerHeight;
  return {
    x: rect.left,
    y: rect.top,
    scaleX: sx,
    scaleY: sy,
    borderRadius: `${CARD_RADIUS / sx}px / ${CARD_RADIUS / sy}px`,
  };
}

interface CompactDetailOverlayProps {
  package: UmrohPackage;
  agent?: AgentData | null;
  /** Kotak kartu saat dibuka — permukaan tumbuh dari sini. */
  origin: CardRect | null;
  onClose: () => void;
}

/**
 * Detail Tampilan Ringkas: permukaan putih tumbuh dari kartu yang diketuk sampai
 * layar penuh, lalu konten muncul; saat ditutup urutannya terbalik dan permukaan
 * menyusut ke kartunya. Hanya transform + opacity — kontennya PackageCard terbuka
 * (±1500px), clip-path/height per frame akan me-repaint semuanya.
 *
 * Kotak tujuan saat ditutup datang dari `custom` AnimatePresence di App (diukur
 * ulang saat tutup), bukan dari props — komponen yang sedang keluar tak bisa
 * menerima props baru.
 */
export function CompactDetailOverlay({ package: pkg, agent, origin, onClose }: CompactDetailOverlayProps) {
  const reduceMotion = useReducedMotion();

  const surfaceVariants = useMemo<Variants>(() => ({
    hidden: (rect: CardRect | null) => (rect && !reduceMotion ? { ...overCard(rect), opacity: 0 } : { opacity: 0 }),
    open: {
      x: 0, y: 0, scaleX: 1, scaleY: 1, borderRadius: '0px / 0px', opacity: 1,
      transition: reduceMotion ? { duration: 0.15 } : {
        // Spring tanpa pantulan, senada dengan expand PackageCard.
        default: { type: 'spring', duration: 0.5, bounce: 0 },
        borderRadius: { duration: 0.4, ease: EASE_DECELERATE },
        // Menutup isi kartu ringkas dengan cepat — terbaca sebagai kartunya yang membesar.
        opacity: { duration: 0.12, ease: 'linear' },
      },
    },
    exit: (rect: CardRect | null) => (rect && !reduceMotion ? {
      ...overCard(rect), opacity: 0,
      transition: {
        default: { duration: 0.34, ease: EASE_STANDARD },
        // Pudar di ujung saja: kartu ringkas di bawahnya muncul kembali tepat saat
        // permukaan mendarat di atasnya.
        opacity: { duration: 0.12, delay: 0.22, ease: 'linear' },
      },
    } : { opacity: 0, transition: { duration: 0.15 } }),
  }), [reduceMotion]);

  const contentVariants = useMemo<Variants>(() => ({
    hidden: { opacity: 0, y: reduceMotion ? 0 : 16 },
    // Ditunda sampai permukaan hampir penuh — konten adalah lapisan saudara, bukan
    // anak permukaan, jadi muncul lebih awal = konten menjorok di luar permukaan.
    open: { opacity: 1, y: 0, transition: { delay: reduceMotion ? 0 : 0.2, duration: 0.26, ease: EASE_DECELERATE } },
    exit: { opacity: 0, y: reduceMotion ? 0 : 8, transition: { duration: 0.12, ease: 'linear' } },
  }), [reduceMotion]);

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex flex-col"
      initial="hidden"
      animate="open"
      exit="exit"
    >
      <motion.div
        aria-hidden
        custom={origin}
        variants={surfaceVariants}
        style={{ originX: 0, originY: 0 }}
        className="absolute inset-0 bg-white dark:bg-slate-900 will-change-transform"
      />

      {/* Full Screen Container */}
      <motion.div
        variants={contentVariants}
        className="relative flex-1 overflow-y-auto bg-gray-50 dark:bg-slate-950"
      >
        {/* Full PackageCard — tanpa px-4 agar kartu full-bleed.
            Safe-area: layar penuh di app terpasang iOS menyentuh status bar & home indicator. */}
        <div className="max-w-lg mx-auto pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))]">
          <PackageCard
            package={pkg}
            isExpanded={true}
            onToggle={onClose}
            agent={agent}
          />
        </div>
      </motion.div>

      {/* Floating Close Button — Bottom Center */}
      <motion.div
        variants={contentVariants}
        className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-0 right-0 flex justify-center z-20 pointer-events-none"
      >
        <button
          onClick={onClose}
          className="
            pointer-events-auto
            flex items-center gap-2
            px-6 py-3 rounded-full
            bg-gray-900/90 dark:bg-white/90
            text-white dark:text-gray-900
            font-semibold text-sm
            shadow-lg shadow-black/20
            hover:bg-gray-800 dark:hover:bg-white
            active:scale-95
            transition-all duration-200
            backdrop-blur-sm
          "
          aria-label="Tutup"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          Tutup
        </button>
      </motion.div>
    </motion.div>
  );
}

export default CompactDetailOverlay;
