import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Star, Footprints, MapPin, ArrowDownAZ } from 'lucide-react';

interface HotelFilterSheetProps {
  landmark?: string;
  canSortByDistance: boolean;
  starOptions: number[];
  areaOptions: string[];
  sortByDistance: boolean;
  starFilter: number | null;
  areaFilter: string | null;
  resultCount: number;
  activeCount: number;
  onChangeSort: (value: boolean) => void;
  onChangeStar: (value: number | null) => void;
  onChangeArea: (value: string | null) => void;
  onReset: () => void;
  onClose: () => void;
}

// Filter pill + group label persis spesifikasi "Advanced Filter Panel" di
// docs/DESIGN-SYSTEM.md; h-9 menjaga touch target 36px yang juga diminta DS.
const OPTION_CLASS = 'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-all active:scale-95';
const OPTION_ACTIVE = 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20';
const OPTION_IDLE = 'bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-700';
const SECTION_LABEL = 'text-[9px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500';

export default function HotelFilterSheet({
  landmark,
  canSortByDistance,
  starOptions,
  areaOptions,
  sortByDistance,
  starFilter,
  areaFilter,
  resultCount,
  activeCount,
  onChangeSort,
  onChangeStar,
  onChangeArea,
  onReset,
  onClose,
}: HotelFilterSheetProps) {
  // Pola sheet mengikuti BirthdayListSheet: kunci scroll body + Escape menutup.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <>
      <motion.div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      <motion.div
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg bg-white dark:bg-slate-800 rounded-t-2xl border-t border-x border-gray-100 dark:border-slate-700 max-h-[85vh] overflow-y-auto shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label="Filter hotel"
      >
        <div className="sticky top-0 bg-white dark:bg-slate-800 z-10 flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-600" />
        </div>

        <div className="flex items-center gap-3 px-4 pt-2 pb-3 border-b border-gray-100 dark:border-slate-700/50">
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold text-gray-900 dark:text-white">Filter</div>
            <div className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
              {resultCount} hotel cocok
            </div>
          </div>
          {activeCount > 0 && (
            <button
              onClick={onReset}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
            >
              Reset
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="w-8 h-8 flex shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 transition-colors hover:bg-gray-200 dark:hover:bg-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-4 pt-4">
          {canSortByDistance && (
            <div>
              <p className={SECTION_LABEL}>Urutkan</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => onChangeSort(true)}
                  aria-pressed={sortByDistance}
                  className={`${OPTION_CLASS} ${sortByDistance ? OPTION_ACTIVE : OPTION_IDLE}`}
                >
                  <Footprints size={13} />
                  {landmark ? `Terdekat ke ${landmark}` : 'Terdekat'}
                </button>
                <button
                  onClick={() => onChangeSort(false)}
                  aria-pressed={!sortByDistance}
                  className={`${OPTION_CLASS} ${!sortByDistance ? OPTION_ACTIVE : OPTION_IDLE}`}
                >
                  <ArrowDownAZ size={13} />
                  Nama A-Z
                </button>
              </div>
            </div>
          )}

          {starOptions.length > 0 && (
            <div>
              <p className={SECTION_LABEL}>Bintang</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => onChangeStar(null)}
                  aria-pressed={starFilter === null}
                  className={`${OPTION_CLASS} ${starFilter === null ? OPTION_ACTIVE : OPTION_IDLE}`}
                >
                  Semua
                </button>
                {starOptions.map(star => {
                  const active = starFilter === star;
                  return (
                    <button
                      key={star}
                      onClick={() => onChangeStar(active ? null : star)}
                      aria-pressed={active}
                      className={`${OPTION_CLASS} ${active ? OPTION_ACTIVE : OPTION_IDLE}`}
                    >
                      {star}
                      <Star size={12} strokeWidth={0} fill="currentColor" className={active ? '' : 'text-amber-400'} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {areaOptions.length > 0 && (
            <div>
              <p className={SECTION_LABEL}>Kota</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => onChangeArea(null)}
                  aria-pressed={areaFilter === null}
                  className={`${OPTION_CLASS} ${areaFilter === null ? OPTION_ACTIVE : OPTION_IDLE}`}
                >
                  Semua
                </button>
                {areaOptions.map(area => {
                  const active = areaFilter === area;
                  return (
                    <button
                      key={area}
                      onClick={() => onChangeArea(active ? null : area)}
                      aria-pressed={active}
                      className={`${OPTION_CLASS} ${active ? OPTION_ACTIVE : OPTION_IDLE}`}
                    >
                      <MapPin size={12} />
                      {area}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Filter berlaku seketika, jadi tombol ini hanya menutup — labelnya
            memakai jumlah hasil supaya hasilnya terbaca sebelum sheet ditutup. */}
        <div className="sticky bottom-0 mt-4 border-t border-gray-100 bg-white px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-slate-700/50 dark:bg-slate-800">
          <button
            onClick={onClose}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-all duration-200 hover:bg-emerald-600 active:scale-95"
          >
            Lihat {resultCount} hotel
          </button>
        </div>
      </motion.div>
    </>,
    document.body
  );
}
