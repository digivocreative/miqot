import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface RailShellProps {
  side: 'left' | 'right';
  /** Nama paket yang sedang dibahas — kepala rail mengulangnya supaya agent
   *  tak perlu menoleh ke kolom tengah saat menjelaskan. */
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Pembungkus geometri rail desktop.
 *
 * Geometrinya hidup di src/index.css (.jadwal-rail): `fixed`, dijangkar ke
 * --filter-header-h, lebarnya --jadwal-rail-w, dan dipasang di selokan lewat
 * calc() dari --jadwal-col-w. Ditaruh di CSS supaya kolom tengah tidak pernah
 * bergeser karena interaksi — hanya karena resize melewati breakpoint.
 *
 * Rail baru muncul di ≥1024px; di bawah itu `display: none` dan halaman
 * berperilaku persis seperti sebelum fitur ini ada.
 */
export default function RailShell({ side, title, onClose, children }: RailShellProps) {
  return (
    <aside
      className={`jadwal-rail jadwal-rail--${side}`}
      aria-label={side === 'left' ? 'Rencana perjalanan paket' : 'Detail paket'}
    >
      <div className="flex items-start justify-between gap-3 px-1 pb-2">
        <div className="min-w-0">
          <p className="text-[8.5px] font-extrabold uppercase tracking-[0.11em] text-[#B08968] dark:text-amber-500/80">
            Paket yang dibahas
          </p>
          <h2 className="mt-0.5 line-clamp-2 text-[13.5px] font-bold leading-tight text-gray-900 dark:text-white">
            {title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup panel paket"
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white/80 text-gray-500 backdrop-blur transition-colors hover:bg-white hover:text-gray-800 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <X size={14} />
        </button>
      </div>

      {children}
    </aside>
  );
}
