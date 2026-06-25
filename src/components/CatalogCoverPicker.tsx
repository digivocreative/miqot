import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { CATALOG_COVERS } from '@/lib/catalogCovers';

export interface CatalogCoverPickerProps {
  open: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/**
 * Bottom-sheet grid for choosing the catalog PDF cover. Live on-screen UI (NOT
 * captured into the PDF), so normal CSS effects are fine here. Lazy-mounts:
 * returns null when closed, so the cover artwork is only fetched once the agent
 * opens the picker. Selection is persisted by the parent (localStorage).
 */
export function CatalogCoverPicker({ open, selectedId, onSelect, onClose }: CatalogCoverPickerProps) {
  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pilih cover katalog"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(8,2,5,0.62)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-white dark:bg-slate-900"
        style={{
          maxWidth: 480, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column', boxShadow: '0 -16px 50px -12px rgba(0,0,0,0.5)',
        }}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 dark:border-slate-800">
          <div className="min-w-0">
            <div className="text-base font-bold text-gray-900 dark:text-white">Pilih Cover Katalog</div>
            <div className="text-xs text-gray-500 dark:text-slate-400">Dipakai untuk PDF & diingat di perangkat ini</div>
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
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default CatalogCoverPicker;
