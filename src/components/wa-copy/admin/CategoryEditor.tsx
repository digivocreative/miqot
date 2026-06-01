import { useState } from 'react';
import { CATEGORY_ICON_OPTIONS } from '../lib/categoryIcons';
import type { CategoryDraft, CategoryMeta } from '../lib/types';
import IconPicker from './IconPicker';

interface CategoryEditorProps {
  unitLabel: string; // "Kategori" | "Fase"
  initial?: CategoryMeta;
  onSave: (draft: CategoryDraft) => void;
  onCancel: () => void;
}

const INPUT_CLASS =
  'w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400';
const LABEL_CLASS = 'block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300 mb-1.5';

export default function CategoryEditor({ unitLabel, initial, onSave, onCancel }: CategoryEditorProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [iconName, setIconName] = useState(initial?.iconName ?? CATEGORY_ICON_OPTIONS[0].name);
  const [tip, setTip] = useState(initial?.tip ?? '');

  const canSave = label.trim().length > 0;
  const handleSave = () => {
    if (!canSave) return;
    onSave({ label: label.trim(), iconName, tip: tip.trim() });
  };

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">
      <div>
        <label className={LABEL_CLASS}>Nama {unitLabel}</label>
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder={`Mis. ${unitLabel} Baru`}
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label className={LABEL_CLASS}>Ikon</label>
        <IconPicker value={iconName} onChange={setIconName} />
      </div>

      <div>
        <label className={LABEL_CLASS}>Tip (opsional)</label>
        <input
          type="text"
          value={tip}
          onChange={e => setTip(e.target.value)}
          placeholder="Penjelasan singkat untuk agent…"
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 active:scale-95 transition-all"
        >
          Batal
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="flex-1 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
        >
          Simpan
        </button>
      </div>
    </div>
  );
}
