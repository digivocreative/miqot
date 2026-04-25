import { Check } from 'lucide-react';
import type { BioTheme } from '../bio/types';

interface Props {
  value: BioTheme;
  onChange: (theme: BioTheme) => void;
}

const THEMES: { id: BioTheme; label: string; bg: string; accent: string }[] = [
  { id: 'emerald',  label: 'Emerald',   bg: '#f6faf7', accent: '#0f766e' },
  { id: 'desert',   label: 'Desert',    bg: '#faf5ec', accent: '#9a6d2d' },
  { id: 'midnight', label: 'Midnight',  bg: '#0b1220', accent: '#facc15' },
  { id: 'rosegold', label: 'Rose Gold', bg: '#fbf4f1', accent: '#b76a5b' },
  { id: 'sunset',   label: 'Sunset',    bg: '#fff3e3', accent: '#dd6b20' },
  { id: 'mono',     label: 'Mono',      bg: '#f7f7f7', accent: '#151515' },
];

export default function ThemePicker({ value, onChange }: Props) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3">
      <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold mb-2">TEMA</p>
      <div className="relative">
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-thin">
          {THEMES.map(t => {
            const active = value === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange(t.id)}
                className={`shrink-0 rounded-xl border-2 transition-all active:scale-95 ${
                  active
                    ? 'border-emerald-500 shadow-md shadow-emerald-500/20'
                    : 'border-transparent hover:border-gray-200 dark:hover:border-slate-600'
                }`}
                aria-label={t.label}
              >
                <div
                  className="relative w-16 h-20 rounded-lg overflow-hidden flex flex-col items-center justify-center"
                  style={{ background: t.bg }}
                >
                  <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ background: t.accent }} />
                  <div className="w-8 h-1.5 rounded-full mt-1.5" style={{ background: t.accent, opacity: 0.25 }} />
                  <div className="w-7 h-1 rounded-full mt-0.5" style={{ background: t.accent, opacity: 0.15 }} />
                  {active && (
                    <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                      <Check size={10} className="text-white" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <p className={`text-[10px] font-semibold mt-1 ${active ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-600 dark:text-slate-300'}`}>
                  {t.label}
                </p>
              </button>
            );
          })}
        </div>
        {/* Right-edge fade hint — signals that more themes are scrollable */}
        <div className="pointer-events-none absolute top-0 right-0 h-[5.75rem] w-10 bg-gradient-to-l from-white dark:from-slate-800 to-transparent rounded-r-xl" />
      </div>
    </div>
  );
}
