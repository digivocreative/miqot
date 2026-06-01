import type { ElementType } from 'react';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  icon?: ElementType;
}

interface CategoryChipsProps<T extends string> {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Horizontal scrollable filter chips: soft rounded-full pills with an icon. */
export default function CategoryChips<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: CategoryChipsProps<T>) {
  return (
    <div className={`no-scrollbar flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 ${className}`}>
      {options.map(opt => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`h-8 shrink-0 inline-flex items-center gap-1.5 px-3 rounded-full text-[11px] font-bold transition-all active:scale-95 whitespace-nowrap ${
              active
                ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/25'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700/70'
            }`}
          >
            {Icon && <Icon size={13} strokeWidth={2.4} className="flex-shrink-0" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
