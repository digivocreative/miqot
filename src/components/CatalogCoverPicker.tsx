import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, FileDown, X } from 'lucide-react';
import { CATALOG_COVERS } from '@/lib/catalogCovers';

export interface CatalogCoverPickerProps {
  open: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  /** Confirm the chosen cover and start the catalog PDF download. */
  onDownload: () => void;
  description?: string;
  downloadLabel?: string;
  /** Pilihan cakupan isi katalog (mis. "bulan ini" vs "semua bulan"). Tanpa
   * ini, sheet hanya memilih cover. */
  scopeOptions?: Array<{ value: string; label: string; hint?: string }>;
  scopeValue?: string;
  onScopeChange?: (value: string) => void;
}

/**
 * Bottom-sheet grid for choosing the catalog PDF cover. Live on-screen UI (NOT
 * captured into the PDF), so normal CSS effects are fine here. Animated per the
 * design-system sheet pattern (backdrop fade + slide-up, ease [0.32,0.72,0,1]);
 * AnimatePresence keeps it mounted through the exit, then unmounts — so the cover
 * artwork is only fetched once the agent opens the picker. Selection is persisted
 * by the parent (localStorage).
 */
export function CatalogCoverPicker({
  open,
  selectedId,
  onSelect,
  onClose,
  onDownload,
  description = 'Dipakai untuk PDF & diingat di perangkat ini',
  downloadLabel = 'Unduh Katalog (PDF)',
  scopeOptions,
  scopeValue,
  onScopeChange,
}: CatalogCoverPickerProps) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="cover-picker"
          role="dialog"
          aria-modal="true"
          aria-label="Pilih cover katalog"
          onClick={onClose}
          className="fixed inset-0 z-[9999] flex items-end justify-center"
          style={{ background: 'rgba(8,2,5,0.62)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white dark:bg-slate-900"
            style={{
              maxWidth: 480, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', boxShadow: '0 -16px 50px -12px rgba(0,0,0,0.5)',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 dark:border-slate-800">
              <div className="min-w-0">
                <div className="text-base font-bold text-gray-900 dark:text-white">Pilih Cover Katalog</div>
                <div className="text-xs text-gray-500 dark:text-slate-400">{description}</div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup"
                className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            {scopeOptions && scopeOptions.length > 1 && (
              <div className="px-5 pt-3">
                <div className="text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Isi katalog</div>
                <div role="radiogroup" aria-label="Isi katalog" className="grid grid-cols-2 gap-2">
                  {scopeOptions.map((opt) => {
                    const active = opt.value === scopeValue;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onScopeChange?.(opt.value)}
                        className={`min-w-0 rounded-xl border-2 px-3 py-2 text-left transition-colors ${
                          active
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
                            : 'border-gray-200 dark:border-slate-700'
                        }`}
                      >
                        <div className={`truncate text-sm font-bold ${active ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-800 dark:text-white'}`}>
                          {opt.label}
                        </div>
                        {opt.hint && <div className="truncate text-[11px] text-gray-500 dark:text-slate-400">{opt.hint}</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {CATALOG_COVERS.map((c) => {
                  const active = c.id === selectedId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onSelect(c.id)}
                      aria-pressed={active}
                      className={`relative rounded-xl overflow-hidden border-2 transition-all active:scale-[0.98] ${
                        active ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-gray-200 dark:border-slate-700'
                      }`}
                      style={{ aspectRatio: '2 / 3' }}
                    >
                      <img src={c.image} alt={c.label} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                      {active && (
                        <span className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                          <Check size={15} strokeWidth={3} />
                        </span>
                      )}
                      <span
                        className="absolute bottom-0 inset-x-0 px-2 py-1 text-[11px] font-semibold text-white text-left"
                        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.7) 100%)' }}
                      >
                        {c.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onDownload}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95"
              >
                <FileDown size={17} />
                <span>{downloadLabel}</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default CatalogCoverPicker;
