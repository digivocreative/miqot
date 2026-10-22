import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import FilterDropdown from './FilterDropdown';
import { useBackToClose } from '../hooks/useBackToClose';
import { lockDocumentScroll } from '../lib/scrollLock';
import {
  EMPTY_FILTERS, filterCalonHaji, formatKabKota, formatProvinsi, kabKotaOptions, provinsiOptions, withProvinsi,
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
        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl border-x border-t border-gray-100 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label="Filter calon haji"
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-slate-600" />
        </div>
        <div className="flex items-center justify-between px-5 pt-2">
          <p className="text-[17px] font-bold text-gray-900 dark:text-white">Filter</p>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="touch-hit relative flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 pt-4 pb-[calc(1.75rem+env(safe-area-inset-bottom))]">
          <div className="space-y-1.5">
            <p className={SECTION_LABEL}>Provinsi</p>
            <FilterDropdown
              variant="default"
              inputSkin
              portal
              portalZClass="z-[10000]"
              widthClass="w-full"
              ariaLabel="Pilih provinsi"
              value={draft.provinsi ?? ALL}
              onChange={(v) => setDraft((d) => withProvinsi(d, v || null, rows))}
              options={[{ value: ALL, label: 'Semua provinsi' }, ...provinsiOpts.map((p) => ({ value: p, label: formatProvinsi(p) }))]}
            />
          </div>
          <div className="space-y-1.5">
            <p className={SECTION_LABEL}>Kab/Kota</p>
            <FilterDropdown
              variant="default"
              inputSkin
              portal
              portalZClass="z-[10000]"
              widthClass="w-full"
              ariaLabel="Pilih kab/kota"
              value={draft.kabKota ?? ALL}
              onChange={(v) => setDraft((d) => ({ ...d, kabKota: v || null }))}
              options={[{ value: ALL, label: 'Semua kab/kota' }, ...kabKotaOpts.map((k) => ({ value: k, label: formatKabKota(k) }))]}
            />
          </div>
          <div className="space-y-1.5">
            <p className={SECTION_LABEL}>Kepesertaan JKN</p>
            <div className="grid grid-cols-4 gap-1.5">
              {JKN_OPTIONS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setDraft((d) => ({ ...d, jkn: key }))}
                  aria-pressed={draft.jkn === key}
                  className={`h-9 rounded-lg px-1 text-[11px] font-bold whitespace-nowrap transition-all active:scale-95 ${
                    draft.jkn === key
                      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                      : 'border border-gray-200 bg-gray-50 text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2.5 pt-1.5">
            <button
              onClick={() => setDraft({ ...EMPTY_FILTERS })}
              className="h-11 w-28 shrink-0 rounded-xl border border-gray-200 text-[13px] font-bold text-gray-700 transition-all active:scale-95 dark:border-slate-600 dark:text-slate-200"
            >
              Reset
            </button>
            <button
              onClick={() => onApply(draft)}
              className="h-11 flex-1 rounded-xl bg-emerald-500 text-[13px] font-bold text-white shadow-md shadow-emerald-500/25 transition-all active:scale-95"
            >
              Tampilkan {resultCount.toLocaleString('id-ID')} jamaah
            </button>
          </div>
        </div>
      </motion.div>
    </>,
    document.body,
  );
}
