import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  /**
   * Render the popover into document.body (fixed-positioned) so it escapes an
   * ancestor with `overflow:hidden`/scroll (e.g. an animated/collapsing filter panel).
   */
  portal?: boolean;
  /** Emerald-tinted trigger skin for accent header pills (e.g. Jamaah/Haji year filter). Default gray. */
  accent?: boolean;
  /** Tailwind z-index class for the portaled panel (default `z-50`). Raise it (e.g. `z-[10000]`)
   *  when the dropdown lives inside a high-z modal so the panel renders above it. */
  portalZClass?: string;
  /** Remove the option-list height cap so every option is visible without inner scrolling. */
  showAllOptions?: boolean;
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
  portal = false,
  accent = false,
  portalZClass = 'z-50',
  showAllOptions = false,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const lastTouchYRef = useRef<number | null>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, right: 0, width: 0, alignRight: false });

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
      lastTouchYRef.current = null;
      panelRef.current?.setAttribute('inert', '');
      return;
    }
    panelRef.current?.removeAttribute('inert');
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      // panelRef may live in a portal (outside rootRef), so check it too.
      if (!rootRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
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

  // Measure the trigger box so the portaled (fixed) panel can anchor to it. Anchor to
  // the trigger's right edge when it sits past the viewport midline, so a panel wider
  // than the trigger grows left instead of overflowing the right edge.
  const measure = useCallback(() => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    setCoords({ top: r.bottom + 4, left: r.left, right: vw - r.right, width: r.width, alignRight: r.left + r.width / 2 > vw / 2 });
  }, []);

  // Portal mode: the panel is fixed-positioned in <body>, so follow the trigger on
  // scroll/resize. The initial position is measured synchronously in the trigger's
  // onClick (before opening) to avoid a first-open flash at the top-left corner.
  useLayoutEffect(() => {
    if (!portal || !open) return;
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [portal, open, measure]);

  const handleScrollableTouchStart = useCallback((e: TouchEvent) => {
    lastTouchYRef.current = e.touches[0]?.clientY ?? null;
  }, []);

  const handleScrollableTouchMove = useCallback((e: TouchEvent) => {
    const scroller = scrollAreaRef.current;
    const currentY = e.touches[0]?.clientY;
    const lastY = lastTouchYRef.current;
    if (!scroller || currentY == null || lastY == null) return;

    const deltaY = currentY - lastY;
    lastTouchYRef.current = currentY;
    e.stopPropagation();

    if (scroller.scrollHeight <= scroller.clientHeight) {
      e.preventDefault();
      return;
    }

    const atTop = scroller.scrollTop <= 0;
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
    if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
      e.preventDefault();
    }
  }, []);

  const resetScrollableTouch = useCallback(() => {
    lastTouchYRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    const scroller = scrollAreaRef.current;
    if (!scroller) return;

    scroller.addEventListener('touchstart', handleScrollableTouchStart, { passive: true });
    scroller.addEventListener('touchmove', handleScrollableTouchMove, { passive: false });
    scroller.addEventListener('touchend', resetScrollableTouch);
    scroller.addEventListener('touchcancel', resetScrollableTouch);

    return () => {
      scroller.removeEventListener('touchstart', handleScrollableTouchStart);
      scroller.removeEventListener('touchmove', handleScrollableTouchMove);
      scroller.removeEventListener('touchend', resetScrollableTouch);
      scroller.removeEventListener('touchcancel', resetScrollableTouch);
    };
  }, [open, handleScrollableTouchStart, handleScrollableTouchMove, resetScrollableTouch]);

  // Size (geometry) is per-variant; skin (colors) is gray by default or emerald when
  // `accent` is set. Kept separate so accent can swap colors without conflicting
  // Tailwind utilities (you can't reliably override a class by appending another).
  const TRIGGER_BASE = 'w-full flex items-center justify-between border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500/50';
  const TRIGGER_SIZE: Record<'mini' | 'compact' | 'default', string> = {
    mini: 'h-7 gap-1.5 px-2.5 text-[10px] font-bold rounded-lg',
    compact: 'h-9 gap-2 px-3 text-xs font-bold rounded-lg',
    default: 'gap-2 px-3 py-2.5 text-sm font-medium rounded-xl',
  };
  const graySkin = variant === 'default'
    ? 'bg-gray-100/80 dark:bg-slate-800/80 border-transparent dark:border-transparent text-gray-700 dark:text-slate-200 hover:bg-gray-200/80 dark:hover:bg-slate-700/80'
    : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700/70';
  const emeraldSkin = 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30';
  const triggerClass = `${TRIGGER_BASE} ${TRIGGER_SIZE[variant]} ${
    disabled
      ? 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed'
      : `cursor-pointer ${accent ? emeraldSkin : graySkin}`
  }`;
  const chevronSize = variant === 'default' ? 16 : variant === 'compact' ? 14 : 12;
  const chevronColor = accent ? 'text-emerald-500 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-400';

  // Panel width: at least the trigger width, but grow to fit the longest option
  // (options have a left check-mark slot the trigger lacks, and the selected label
  // shown in the trigger is often shorter than other options — so a trigger-width
  // panel truncates). Portal mode positions fixed in <body> and anchors to the
  // trigger's right edge near the viewport edge so it grows left, not off-screen.
  const panelStyle: CSSProperties | undefined = portal
    ? {
        position: 'fixed',
        top: coords.top,
        minWidth: coords.width,
        width: 'max-content',
        ...(coords.alignRight
          ? { right: coords.right, maxWidth: `calc(100vw - ${coords.right + 8}px)` }
          : { left: coords.left, maxWidth: `calc(100vw - ${coords.left + 8}px)` }),
      }
    : undefined;
  const optionsListClass = showAllOptions
    ? 'overflow-visible'
    : 'max-h-60 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]';

  // Always mounted so both open AND close animate. Core transition utilities only —
  // tailwindcss-animate isn't installed here.
  const panel = (
      <div
        ref={panelRef}
        role="listbox"
        aria-label={ariaLabel}
        aria-hidden={!open}
        style={panelStyle}
        className={`${portal ? `${portalZClass} ${coords.alignRight ? 'origin-top-right' : 'origin-top'}` : 'absolute left-0 top-full mt-1 z-40 min-w-full w-max max-w-[90vw] origin-top'} rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden transition duration-150 ease-out ${
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
        <div
          ref={scrollAreaRef}
          data-filter-dropdown-scroll="true"
          className={optionsListClass}
        >
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
  );

  return (
    <div ref={rootRef} className={`relative ${widthClass}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => { if (portal && !open) measure(); setOpen(o => !o); }}
        className={triggerClass}
      >
        <span className="truncate">{selectedLabel || '—'}</span>
        <ChevronDown
          size={chevronSize}
          className={`shrink-0 ${chevronColor} transition-transform duration-150 ${open ? 'rotate-180' : ''} ${disabled ? 'opacity-50' : ''}`}
        />
      </button>
      {portal ? createPortal(panel, document.body) : panel}
    </div>
  );
}
