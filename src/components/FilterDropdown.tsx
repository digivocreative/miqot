import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';

export interface FilterDropdownOption {
  value: string;
  label: string;
}

export interface FilterDropdownProps {
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<FilterDropdownOption>;
  ariaLabel: string;
  widthClass?: string;
  disabled?: boolean;
  /**
   * Trigger size/skin (the popover panel, animation and behavior are identical across all):
   * - 'mini'    → h-7 / rounded-lg / text-[10px] (very tight header pills & inline controls,
   *               replaces native selects sized h-6/h-7/h-8; shares the compact gray skin)
   * - 'compact' → h-9 / rounded-lg / text-xs (filter rows, e.g. brosur-jadwal)
   * - 'default' → py-2.5 / rounded-xl / text-sm (page headers/forms, e.g. jadwal paket)
   */
  variant?: 'mini' | 'compact' | 'default';
}

/**
 * Custom dropdown — the canonical replacement for native `<select>` across the
 * dashboard. Implements the "Custom Filter Dropdown" pattern documented in
 * docs/DESIGN-SYSTEM.md: a button trigger + an animated popover panel (always
 * mounted so OPEN and CLOSE both animate), emerald-highlighted rows with a Check
 * mark, and a search pill once the list grows past 8 options. Closes on
 * outside-click / Escape.
 *
 * Animation uses CORE Tailwind transition utilities on purpose — `tailwindcss-animate`
 * (animate-in/fade-in/zoom-in/slide-in) is NOT installed in this project and those
 * classes generate no CSS.
 */
export default function FilterDropdown({
  value,
  onChange,
  options,
  ariaLabel,
  widthClass = '',
  disabled = false,
  variant = 'default',
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const selectedLabel = options.find(o => o.value === value)?.label ?? '';
  const showSearch = options.length >= 8;
  const filtered = showSearch && query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  // Close on outside pointer + Escape; reset query each time the panel closes.
  // The panel stays mounted for the close animation, so toggle the native `inert`
  // attribute to keep its options out of the tab order / a11y tree while hidden.
  useEffect(() => {
    if (!open) {
      setQuery('');
      panelRef.current?.setAttribute('inert', '');
      return;
    }
    panelRef.current?.removeAttribute('inert');
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Focus the search field on open (preventScroll so a sticky filter row stays put).
  useEffect(() => {
    if (open && showSearch) searchRef.current?.focus({ preventScroll: true });
  }, [open, showSearch]);

  // Size/skin per variant. 'mini' and 'compact' share the gray-50 skin and differ
  // only in size; 'default' has its own larger, softer (gray-100/80, rounded-xl) skin.
  const TRIGGER_BASE = 'w-full flex items-center justify-between border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500/50';
  const TRIGGER_SIZE_SKIN: Record<'mini' | 'compact' | 'default', string> = {
    mini: 'h-7 gap-1.5 px-2.5 text-[10px] font-bold rounded-lg bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700',
    compact: 'h-9 gap-2 px-3 text-xs font-bold rounded-lg bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700',
    default: 'gap-2 px-3 py-2.5 text-sm font-medium rounded-xl bg-gray-100/80 dark:bg-slate-800/80 border-transparent dark:border-transparent',
  };
  const TRIGGER_TEXT: Record<'mini' | 'compact' | 'default', string> = {
    mini: 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700/70',
    compact: 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700/70',
    default: 'text-gray-700 dark:text-slate-200 hover:bg-gray-200/80 dark:hover:bg-slate-700/80',
  };
  const triggerClass = `${TRIGGER_BASE} ${TRIGGER_SIZE_SKIN[variant]} ${
    disabled ? 'text-gray-400 dark:text-slate-500 cursor-not-allowed' : `cursor-pointer ${TRIGGER_TEXT[variant]}`
  }`;
  const chevronSize = variant === 'default' ? 16 : variant === 'compact' ? 14 : 12;

  return (
    <div ref={rootRef} className={`relative ${widthClass}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={triggerClass}
      >
        <span className="truncate">{selectedLabel || '—'}</span>
        <ChevronDown
          size={chevronSize}
          className={`shrink-0 text-gray-400 dark:text-slate-400 transition-transform duration-150 ${open ? 'rotate-180' : ''} ${disabled ? 'opacity-50' : ''}`}
        />
      </button>

      {/* Always mounted so both open AND close animate. Core transition utilities
          only — tailwindcss-animate isn't installed here. */}
      <div
        ref={panelRef}
        role="listbox"
        aria-label={ariaLabel}
        aria-hidden={!open}
        className={`absolute left-0 right-0 top-full mt-1 z-40 origin-top rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden transition-all duration-150 ease-out ${
          open
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'
        }`}
      >
        {showSearch && (
          <div className="p-2 border-b border-gray-100 dark:border-slate-700">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 dark:bg-slate-900 rounded-lg">
              <Search size={14} className="shrink-0 text-gray-400 dark:text-slate-500" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari..."
                className="w-full bg-transparent text-xs text-gray-700 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Hapus pencarian"
                  className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}
        <div className="max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] text-gray-400 dark:text-slate-500">Tidak ada hasil</div>
          ) : (
            filtered.map(o => {
              const selected = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={`w-full flex items-start gap-2 px-3 py-2 text-xs text-left transition-colors ${
                    selected
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-semibold'
                      : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center mt-0.5">
                    {selected && <Check size={14} strokeWidth={3} className="text-emerald-600 dark:text-emerald-400" />}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{o.label}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
