'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';

// ============================================
// Types
// ============================================

export interface FloatingControlsProps {
  /** Current search query */
  value: string;
  /** Callback when search query changes */
  onChange: (query: string) => void;
  /** Callback to open toggle filter modal */
  onToggleFilter: () => void;
  /** Placeholder text */
  placeholder?: string;
  /** Check if any filter is active to show indicator */
  isFilterActive?: boolean;
  /** Label for the active filter (e.g. "Promo") */
  activeFilterLabel?: string | null;
  /** Callback to clear/reset filter */
  onClearFilter?: () => void;
}

// ============================================
// Component
// ============================================

export function FloatingControls({
  value,
  onChange,
  onToggleFilter,
  placeholder = 'Cari paket, hotel, atau keberangkatan...',
  isFilterActive = false,
  activeFilterLabel,
  onClearFilter,
}: FloatingControlsProps) {
  const [isVisible, setIsVisible] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastScrollY = useRef(0);

  // Scroll Logic for Visibility
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const isAtBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 50;
      
      const isScrollingUp = currentScrollY < lastScrollY.current;
      const isAtTop = currentScrollY < 100;

      // Show if scrolling up, at top, or at bottom
      if (isAtTop || isAtBottom || isScrollingUp) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Handle clear search
  const handleClearSearch = () => {
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <div 
      className={`
        fixed bottom-6 left-4 right-4 z-40
        transition-all duration-500 ease-out transform
        ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0 pointer-events-none'}
      `}
    >
      {/* ============================================ */}
      {/* Main Container: Search + Filter */}
      {/* ============================================ */}
      <div className="max-w-lg mx-auto flex items-center gap-3">
        
        {/* ============================================ */}
        {/* Search Input (Dominant - Left) */}
        {/* ============================================ */}
        <div className="relative flex-1">
          {/* Search Icon (Inside Input - Left) */}
          <Search 
            size={18} 
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 pointer-events-none" 
          />

          {/* Input Field */}
          <input
            ref={inputRef}
            type="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="
              w-full pl-10 pr-10 py-3
              bg-white dark:bg-slate-800
              border border-gray-200 dark:border-slate-700
              rounded-full
              shadow-lg
              text-sm font-medium
              text-gray-900 dark:text-slate-100
              placeholder-gray-400 dark:placeholder-slate-500
              outline-none
              focus:ring-2 focus:ring-emerald-500 focus:border-transparent
              transition-all
              [&::-webkit-search-cancel-button]:appearance-none
              [&::-webkit-search-decoration]:appearance-none
            "
          />

          {/* Clear Button (Inside Input - Right) */}
          {value.length > 0 && (
            <button
              onClick={handleClearSearch}
              className="
                absolute right-3 top-1/2 -translate-y-1/2
                flex items-center justify-center
                w-5 h-5 rounded-full
                bg-gray-200 dark:bg-slate-600
                hover:bg-gray-300 dark:hover:bg-slate-500
                text-gray-500 dark:text-slate-300
                transition-colors
              "
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* ============================================ */}
        {/* Filter Button (Fixed - Right) */}
        {/* ============================================ */}
        <div className="relative shrink-0">
          {/* Active Filter Badge (Above button) */}
          {isFilterActive && activeFilterLabel && (
            <div className="
              absolute -top-10 right-0
              flex items-center gap-1.5
              pl-3 pr-1 py-1
              bg-white/95 dark:bg-slate-800/95 backdrop-blur
              border border-emerald-200 dark:border-emerald-700
              text-emerald-700 dark:text-emerald-400 text-xs font-bold
              rounded-full shadow-md
              animate-in slide-in-from-bottom-2 fade-in duration-300
              whitespace-nowrap
            ">
              <span>{activeFilterLabel}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClearFilter?.();
                }}
                className="p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-full text-emerald-500 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Filter Button */}
          <button
            onClick={onToggleFilter}
            className={`
              flex items-center justify-center
              w-12 h-12
              bg-white dark:bg-slate-800
              border border-gray-200 dark:border-slate-700
              text-gray-600 dark:text-slate-300
              rounded-full shadow-lg
              hover:bg-gray-50 dark:hover:bg-slate-700
              hover:text-emerald-600 dark:hover:text-emerald-400
              transition-all duration-200
              active:scale-95
              relative
            `}
            aria-label="Filter"
          >
            <SlidersHorizontal size={20} />
            
            {/* Active Indicator Ring */}
            {isFilterActive && (
              <span className="absolute inset-0 rounded-full border-2 border-emerald-500 pointer-events-none"></span>
            )}
            
            {/* Active Indicator Dot (fallback if no label) */}
            {isFilterActive && !activeFilterLabel && (
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-800 rounded-full"></span>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}

export default FloatingControls;
