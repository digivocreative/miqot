import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

interface RailShellProps {
  side: 'left' | 'right';
  /** Id paket yang sedang tampil. Berubah = isi rail ganti dengan pudar masuk,
   *  bukan berganti mendadak saat agent pindah kartu. */
  contentKey: string;
  children: ReactNode;
}

/**
 * Pembungkus geometri rail desktop.
 *
 * Geometrinya hidup di src/index.css (.jadwal-rail): `fixed` membentang penuh
 * dari atas viewport, jaraknya lewat padding-top yang membaca
 * --filter-header-visible-h + --jadwal-top-gap (token yang sama dipakai kolom
 * tengah, jadi ketiganya mulai di garis yang sama), lebarnya --jadwal-rail-w,
 * dan dipasang di selokan lewat calc() dari --jadwal-col-w.
 *
 * Rail muncul di ≥1024px; di bawah itu `display: none` dan halaman berperilaku
 * persis seperti sebelum fitur ini ada.
 *
 * TANPA kepala: nama paket sudah terbaca di kartu tengah yang terbuka tepat di
 * antara kedua rail. `aria-label` menggantikan judul yang dulu terlihat.
 * Menutup rail lewat klik kartu lagi atau Escape (App.tsx).
 *
 * Gerak masuknya memakai pegas yang SAMA dengan animasi muai kartu (0,55s,
 * bounce 0) supaya terbaca sebagai satu gerakan — kartu membuka, rail
 * mengiringi — bukan dua efek yang kebetulan bersamaan. Keluarnya sengaja lebih
 * cepat: menutup tidak perlu ditunggui.
 */
export default function RailShell({ side, contentKey, children }: RailShellProps) {
  const reduceMotion = useReducedMotion();
  // Masuk dari arah selokannya sendiri — kiri dari kiri, kanan dari kanan —
  // jadi geraknya menjauh dari kartu, bukan menabraknya.
  const dx = side === 'left' ? -18 : 18;

  return (
    <motion.aside
      className={`jadwal-rail jadwal-rail--${side}`}
      aria-label={side === 'left' ? 'Rencana perjalanan paket' : 'Hotel paket'}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: dx }}
      animate={{ opacity: 1, x: 0 }}
      exit={
        reduceMotion
          ? { opacity: 0, transition: { duration: 0.12 } }
          : { opacity: 0, x: dx, transition: { duration: 0.18, ease: 'easeIn' } }
      }
      transition={
        reduceMotion ? { duration: 0 } : { type: 'spring', duration: 0.55, bounce: 0 }
      }
    >
      <motion.div
        key={contentKey}
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </motion.aside>
  );
}
