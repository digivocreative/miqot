import { CATEGORY_ICON_OPTIONS } from '../lib/categoryIcons';

interface IconPickerProps {
  value: string;
  onChange: (name: string) => void;
}

/** Grid of curated lucide icons; the selected one is highlighted. */
export default function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {CATEGORY_ICON_OPTIONS.map(({ name, icon: Icon }) => {
        const active = name === value;
        return (
          <button
            key={name}
            type="button"
            aria-label={name}
            aria-pressed={active}
            onClick={() => onChange(name)}
            className={`aspect-square flex items-center justify-center rounded-xl border transition-all active:scale-95 ${
              active
                ? 'border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
            }`}
          >
            <Icon size={18} />
          </button>
        );
      })}
    </div>
  );
}
