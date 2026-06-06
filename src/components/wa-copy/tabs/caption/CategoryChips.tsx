import { useCallback, useEffect, useRef, useState } from 'react';
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

/** Max edge-fade width (px); fade grows with scroll distance so it tracks the swipe. */
const FADE_MAX = 32;

/** Horizontal scrollable filter chips: soft rounded-full pills with an icon. */
export default function CategoryChips<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: CategoryChipsProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ left: 0, right: 0 });

  // Fade each edge only when content is hidden behind it, scaled by how far
  // it can still scroll — so the fade eases in/out as the user swipes.
  const updateFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const left = Math.round(Math.max(0, Math.min(el.scrollLeft, FADE_MAX)));
    const right = Math.round(Math.max(0, Math.min(maxScroll - el.scrollLeft, FADE_MAX)));
    setFade(prev => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  // Dep on options.length (not options) — consumers build the array inline each render.
  useEffect(() => {
    updateFade();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateFade);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateFade, options.length]);

  const mask = `linear-gradient(to right, transparent 0, black ${fade.left}px, black calc(100% - ${fade.right}px), transparent 100%)`;

  return (
    <div
      ref={scrollRef}
      onScroll={updateFade}
      style={{ WebkitMaskImage: mask, maskImage: mask }}
      className={`no-scrollbar flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 ${className}`}
    >
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
