import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import FilterDropdown from './FilterDropdown';
import { useBackToClose } from '../hooks/useBackToClose';
import { lockDocumentScroll } from '../lib/scrollLock';
import {
  EMPTY_FILTERS, activeFilterCount, filterCalonHaji, formatKabKota, formatProvinsi, kabKotaOptions, provinsiOptions, withProvinsi,
  type CalonHajiFilters, type CalonHajiRow, type CalonHajiTab, type JknFilter,
} from '../lib/calonHaji';

interface CalonHajiFilterSheetProps {
  rows: CalonHajiRow[];
  tab: CalonHajiTab;
  query: string;
  value: CalonHajiFilters;
  onApply: (filters: CalonHajiFilters) => void;
  onClose: () => void;
}

const JKN_OPTIONS: ReadonlyArray<[JknFilter, string]> = [
  ['semua', 'Semua'], ['aktif', 'Aktif'], ['belum_aktif', 'Belum Aktif'], ['tidak_ada', 'Tidak Ada'],
];
// Pill & label sama persis dengan HotelFilterSheet (docs/DESIGN-SYSTEM.md "Advanced Filter Panel").
const OPTION_CLASS = 'inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-xs font-semibold transition-all active:scale-95';
const OPTION_ACTIVE = 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20';
const OPTION_IDLE = 'bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-700';
const SECTION_LABEL = 'text-[9px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500';
const ALL = '';

/**
 * Bottom sheet filter halaman Calon Haji 2027 (frame 03 mockup). Pilihan diubah
 * di draf; baru berlaku saat "Tampilkan N jamaah" diketuk. Hanya ter-mount
 * selama terbuka (pola HotelFilterSheet) → back Android menutup sheet.
 */
export default function CalonHajiFilterSheet({ rows, tab, query, value, onApply, onClose }: CalonHajiFilterSheetProps) {
  const [draft, setDraft] = useState<CalonHajiFilters>(value);

  useEffect(() => lockDocumentScroll(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useBackToClose(true, onClose);

  const provinsiOpts = useMemo(() => provinsiOptions(rows), [rows]);
  const kabKotaOpts = useMemo(() => kabKotaOptions(rows, draft.provinsi), [rows, draft.provinsi]);
  const resultCount = useMemo(() => filterCalonHaji(rows, { tab, query, filters: draft }).length, [rows, tab, query, draft]);

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
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl border-x border-t border-gray-100 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label="Filter calon haji"
      >
        <div className="sticky top-0 z-10 flex justify-center bg-white pt-2 pb-1 dark:bg-slate-800">
          <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-slate-600" />
        </div>
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 pt-2 pb-3 dark:border-slate-700/50">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold text-gray-900 dark:text-white">Filter</p>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-slate-400">{resultCount.toLocaleString('id-ID')} jamaah cocok</p>
          </div>
          {activeFilterCount(draft) > 0 && (
            <button
              onClick={() => setDraft({ ...EMPTY_FILTERS })}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
            >
              Reset
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="touch-hit relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-4 pt-4">
          <div>
            <p className={SECTION_LABEL}>Provinsi</p>
            <FilterDropdown
              variant="default"
              inputSkin
              portal
              portalZClass="z-[10000]"
              widthClass="mt-2 w-full"
              ariaLabel="Pilih provinsi"
              value={draft.provinsi ?? ALL}
              onChange={(v) => setDraft((d) => withProvinsi(d, v || null, rows))}
              options={[{ value: ALL, label: 'Semua provinsi' }, ...provinsiOpts.map((p) => ({ value: p, label: formatProvinsi(p) }))]}
            />
          </div>
          <div>
            <p className={SECTION_LABEL}>Kab/Kota</p>
            <FilterDropdown
              variant="default"
              inputSkin
              portal
              portalZClass="z-[10000]"
              widthClass="mt-2 w-full"
              ariaLabel="Pilih kab/kota"
              value={draft.kabKota ?? ALL}
              onChange={(v) => setDraft((d) => ({ ...d, kabKota: v || null }))}
              options={[{ value: ALL, label: 'Semua kab/kota' }, ...kabKotaOpts.map((k) => ({ value: k, label: formatKabKota(k) }))]}
            />
          </div>
          <div>
            <p className={SECTION_LABEL}>Kepesertaan JKN</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {JKN_OPTIONS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setDraft((d) => ({ ...d, jkn: key }))}
                  aria-pressed={draft.jkn === key}
                  className={`${OPTION_CLASS} ${draft.jkn === key ? OPTION_ACTIVE : OPTION_IDLE}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

        </div>

        <div className="sticky bottom-0 mt-4 border-t border-gray-100 bg-white px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-slate-700/50 dark:bg-slate-800">
          <button
            onClick={() => onApply(draft)}
            disabled={resultCount === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-all duration-200 hover:bg-emerald-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Tampilkan {resultCount.toLocaleString('id-ID')} jamaah
          </button>
        </div>
      </motion.div>
    </>,
    document.body,
  );
}
