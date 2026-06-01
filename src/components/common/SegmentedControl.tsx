import type { ElementType } from 'react';

export type SegmentedAccent = 'emerald' | 'amber' | 'teal' | 'violet';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
  icon?: ElementType;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string = string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accent?: SegmentedAccent;
  className?: string;
}

const ACCENT_TEXT: Record<SegmentedAccent, string> = {
  emerald: 'text-emerald-500 dark:text-emerald-400',
  amber: 'text-amber-500 dark:text-amber-400',
  teal: 'text-teal-500 dark:text-teal-400',
  violet: 'text-violet-500 dark:text-violet-400',
};

/**
 * iOS-style segmented control (pill track + raised active tab).
 * Pure-CSS animation via `transition-all` — no Framer Motion.
 * Extracted from the SettingsPage tab bar; the sticky / max-w wrappers
 * stay in the caller, this component owns only the track + buttons.
 */
export default function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  accent = 'emerald',
  className = '',
}: SegmentedControlProps<T>) {
  const accentText = ACCENT_TEXT[accent];
  return (
    <div className={`flex gap-1 p-1 bg-gray-100 dark:bg-slate-800 rounded-xl w-full ${className}`}>
      {options.map(opt => {
        const isActive = value === opt.value;
        const Icon = opt.icon;
        const visual = isActive
          ? `bg-white dark:bg-slate-700 shadow-sm font-semibold ${accentText}`
          : opt.disabled
          ? 'bg-transparent text-gray-300 dark:text-slate-600 font-semibold opacity-70'
          : 'bg-transparent text-gray-400 dark:text-slate-500 font-semibold active:opacity-70';
        return (
          <button
            key={opt.value}
            type="button"
            disabled={opt.disabled}
            onClick={() => !opt.disabled && onChange(opt.value)}
            className={`min-w-0 flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all duration-200 ${visual}`}
          >
            {Icon && <Icon size={13} strokeWidth={isActive ? 2.4 : 2} className="flex-shrink-0" />}
            <span className="min-w-0 truncate text-[11px]">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
