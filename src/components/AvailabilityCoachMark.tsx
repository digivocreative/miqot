'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Lama ronde pengukuran susulan sesudah gelembung muncul — cukup untuk melewati
 * transisi buka-tutup header (300ms) plus margin.
 */
const SETTLE_MS = 450;

/** Jarak antar-pengukuran di ronde susulan. */
const SETTLE_TICK_MS = 60;

/** Lebar maksimum gelembung; dipakai juga saat menjepit posisi ke tepi layar. */
const BUBBLE_WIDTH = 232;

/** Jarak aman dari tepi kiri/kanan viewport. */
const EDGE_GUTTER = 10;

interface BubbleCoords {
  top: number;
  left: number;
  /** Posisi panah, relatif terhadap kiri gelembung. */
  arrow: number;
}

/**
 * Gelembung diletakkan di bawah jangkar dan DIJEPIT dari tepi layar — di HP
 * tombol ini nyaris menempel ke tepi kanan, jadi balon selebar BUBBLE_WIDTH
 * pasti keluar layar kalau dipusatkan mentah-mentah. Panahnya dihitung
 * terpisah supaya tetap menunjuk tombol walau balonnya sudah digeser.
 */
/** Cegah setState yang tidak mengubah apa pun saat mengukur ulang tiap frame. */
function sameCoords(a: BubbleCoords, b: BubbleCoords): boolean {
  return a.top === b.top && a.left === b.left && a.arrow === b.arrow;
}

function measureFrom(el: HTMLElement): BubbleCoords {
  const r = el.getBoundingClientRect();
  const anchorCenter = r.left + r.width / 2;
  const maxLeft = window.innerWidth - BUBBLE_WIDTH - EDGE_GUTTER;
  const left = Math.max(EDGE_GUTTER, Math.min(anchorCenter - BUBBLE_WIDTH / 2, maxLeft));
  return { top: r.bottom + 10, left, arrow: anchorCenter - left };
}

export interface AvailabilityCoachMarkProps {
  /** Tombol yang ditunjuk gelembung ini. */
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  /** Dipanggil oleh SETIAP jalur pembubaran; pemanggil yang mencatat "sudah lihat". */
  onDismiss: () => void;
}

/**
 * Gelembung sekali-tampil yang menerangkan tombol "hanya seat tersedia".
 *
 * KENAPA PORTAL: baris filter hidup di dalam pembungkus `overflow-hidden` yang
 * menciut saat halaman digulir (grid 1fr/0fr di FilterHeader). Sebagai anak
 * biasa, gelembung ini akan terpotong — alasan yang sama membuat FilterDropdown
 * memakai portal.
 *
 * Posisinya diukur saat muncul lalu DIJAGA: gelembung ini bertahan sampai
 * diklik, jadi ia harus ikut bergerak waktu baris filter menciut/mengembang.
 */
export default function AvailabilityCoachMark({ anchorRef, open, onDismiss }: AvailabilityCoachMarkProps) {
  const [coords, setCoords] = useState<BubbleCoords | null>(null);
  const [shown, setShown] = useState(false);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      setShown(false);
      return;
    }
    const el = anchorRef.current;
    if (!el) return;
    setCoords(measureFrom(el));
  }, [open, anchorRef]);

  // Fade + scale masuk lewat double rAF: tanpa frame kosong di antaranya, kedua
  // state jatuh di satu frame yang sama dan transisinya tidak pernah main.
  // (Pola yang sama dipakai bio-editor/HintBanner.)
  //
  // Bergantung pada `open`, BUKAN `coords`: coords kini berubah tiap pengukuran
  // ulang, dan menyalakan ulang animasi masuk tiap kali header bergeser.
  useEffect(() => {
    if (!open) return;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      if (r2) cancelAnimationFrame(r2);
    };
  }, [open]);

  // Gelembung ini TIDAK pernah bubar sendiri — tidak ada timer, guliran tidak
  // menutupnya. Yang tersisa cuma menjaga posisinya tetap benar: headernya
  // memang `fixed`, tapi baris filter menciut/mengembang saat digulir, jadi
  // jangkarnya bergerak.
  useEffect(() => {
    if (!open) return;

    let frame = 0;
    const measure = () => {
      if (frame) return; // satu pengukuran per frame, sepola FilterDropdown
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = anchorRef.current;
        if (!el) return;
        const next = measureFrom(el);
        setCoords(prev => (prev && sameCoords(prev, next) ? prev : next));
      });
    };

    // Header mengembang lewat transisi CSS 300ms; pengukuran pertama jatuh di
    // tengah animasi. Ronde susulan singkat menangkap posisi akhirnya tanpa
    // perlu rAF yang berputar selamanya. Interval-nya menghentikan dirinya
    // sendiri — tidak ada timer kedua yang bisa tertinggal hidup.
    let ticksLeft = Math.ceil(SETTLE_MS / SETTLE_TICK_MS);
    const settle = window.setInterval(() => {
      measure();
      if (--ticksLeft <= 0) window.clearInterval(settle);
    }, SETTLE_TICK_MS);

    // Capture: yang bergulir bisa jadi kontainer di dalam halaman, bukan window.
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.clearInterval(settle);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [open, anchorRef]);

  if (!open || !coords) return null;

  return createPortal(
    <div
      role="status"
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        width: BUBBLE_WIDTH,
        zIndex: 10000,
      }}
      className={`
        transition-all duration-200 ease-out
        ${shown ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-1 scale-95'}
      `}
    >
      {/* Panah menunjuk tombolnya. Diposisikan relatif terhadap gelembung supaya
          tetap menempel di tombol walau gelembungnya digeser dari tepi layar. */}
      <div
        style={{ left: coords.arrow }}
        className="absolute -top-[5px] -ml-[6px] w-3 h-3 rotate-45 rounded-[2px] bg-slate-900 dark:bg-slate-700"
      />
      <div className="relative rounded-xl bg-slate-900 dark:bg-slate-700 text-white shadow-lg shadow-slate-900/25 px-3 py-2.5 pr-8">
        <p className="text-[12px] leading-snug">
          Tap untuk <span className="font-semibold">sembunyikan paket yang sudah habis</span>
        </p>
        <button
          onClick={onDismiss}
          className="
            absolute top-1.5 right-1.5
            flex items-center justify-center w-5 h-5 rounded-md
            text-slate-400 hover:text-white hover:bg-white/10
            transition-colors
          "
          aria-label="Tutup petunjuk"
        >
          <X size={12} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
