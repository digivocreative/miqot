import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { CategoryMeta } from '../lib/types';

interface DeleteCategoryPanelProps {
  unitLabel: string;
  category: CategoryMeta;
  others: CategoryMeta[];
  count: number;
  onConfirm: (reassignTo: string) => void;
  onCancel: () => void;
}

const INPUT_CLASS =
  'w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white';
const LABEL_CLASS = 'block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300 mb-1.5';

export default function DeleteCategoryPanel({
  unitLabel,
  category,
  others,
  count,
  onConfirm,
  onCancel,
}: DeleteCategoryPanelProps) {
  const [reassignTo, setReassignTo] = useState(others[0]?.value ?? '');
  const canDelete = others.length > 0 && reassignTo.length > 0;

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/70 dark:bg-amber-900/15 p-3">
        <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
          Hapus {unitLabel.toLowerCase()} <strong>{category.label}</strong>
          {count > 0 ? ` — ${count} konten akan dipindahkan.` : ' — tidak ada konten di dalamnya.'}
        </p>
      </div>

      {others.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-slate-400">
          Tidak bisa dihapus: ini satu-satunya {unitLabel.toLowerCase()}. Buat {unitLabel.toLowerCase()} lain dulu.
        </p>
      ) : (
        <div>
          <label className={LABEL_CLASS}>Pindahkan konten ke</label>
          <select value={reassignTo} onChange={e => setReassignTo(e.target.value)} className={INPUT_CLASS}>
            {others.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 active:scale-95 transition-all"
        >
          Batal
        </button>
        <button
          onClick={() => canDelete && onConfirm(reassignTo)}
          disabled={!canDelete}
          className="flex-1 py-3 rounded-xl text-sm font-bold bg-red-500 hover:bg-red-600 text-white shadow-md shadow-red-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
        >
          Hapus &amp; Pindahkan
        </button>
      </div>
    </div>
  );
}
