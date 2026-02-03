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
  placeholder = 'Cari...',
  isFilterActive = false,
  activeFilterLabel,
  onClearFilter,
}: FloatingControlsProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastScrollY = useRef(0);

  // Auto-focus input when search opened
  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchOpen]);

  // Scroll Logic for Visibility (Reverse Logic)
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const isAtBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 50;
      
      const isScrollingUp = currentScrollY < lastScrollY.current;
      const isAtTop = currentScrollY < 100;

      // Logic: Show if Scrolling UP OR at top OR at bottom OR if search is OPEN
      if (isSearchOpen) {
        setIsVisible(true);
      } else if (isAtTop || isAtBottom || isScrollingUp) {
        setIsVisible(true);
      } else {
        // Hide only if scrolling DOWN and not at extremes
        setIsVisible(false);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isSearchOpen]);

  // Handle close search
  const handleCloseSearch = () => {
    onChange(''); // Clear search
    setIsSearchOpen(false);
  };

  return (
    <div 
      className={`
        fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3
        transition-all duration-500 ease-out transform
        ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0 pointer-events-none'}
      `}
    >
      {/* ============================================ */}
      {/* FILTER BUTTON & BADGE (Top) */}
      {/* ============================================ */}
      {!isSearchOpen && (
        <div className="relative flex items-center">
          
          {/* Active Filter Badge (Left of button) */}
          {isFilterActive && activeFilterLabel && (
            <div className="
              absolute right-14 mr-2
              flex items-center gap-1.5
              pl-3 pr-1 py-1
              bg-white/90 backdrop-blur border border-emerald-100
              text-emerald-700 text-xs font-bold
              rounded-full shadow-md
              animate-in slide-in-from-right-4 fade-in duration-300
              whitespace-nowrap
            ">
              <span>{activeFilterLabel}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClearFilter?.();
                }}
                className="p-1 hover:bg-emerald-100 rounded-full text-emerald-500 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Filter Button */}
          <button
            onClick={onToggleFilter}
            className={`
              flex items-center justify-center w-12 h-12
              bg-white text-gray-700
              border border-gray-200
              rounded-full shadow-lg hover:shadow-xl
              hover:bg-gray-50 hover:text-emerald-600
              transition-all duration-300
              active:scale-95
              relative
              z-10
            `}
            aria-label="Filter"
          >
            <SlidersHorizontal size={20} />
            {/* Active Indicator Dot (Only if no label shown, optional, keeping for completeness) */}
            {isFilterActive && !activeFilterLabel && (
              <span className="absolute top-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></span>
            )}
            {/* If label shown, maybe change icon color or border? */}
            {isFilterActive && (
              <span className="absolute inset-0 rounded-full border-2 border-emerald-500 pointer-events-none animate-pulse"></span>
            )}
          </button>
        </div>
      )}

      {/* ============================================ */}
      {/* SEARCH BUTTON / BAR (Bottom) */}
      {/* ============================================ */}
      
      {/* Collapsed: Search Button */}
      <button
        onClick={() => setIsSearchOpen(true)}
        className={`
          flex items-center justify-center
          bg-emerald-600 hover:bg-emerald-700
          text-white rounded-full shadow-xl
          transition-all duration-300 ease-out
          ${isSearchOpen 
            ? 'w-0 h-0 opacity-0 scale-0 absolute' 
            : 'w-14 h-14 opacity-100 scale-100'
          }
        `}
        aria-label="Open search"
      >
        <Search size={24} />
      </button>

      {/* Expanded: Search Input */}
      <div
        className={`
          flex items-center gap-2
          bg-white border border-gray-200
          shadow-2xl
          transition-all duration-300 ease-out origin-right
          ${isSearchOpen 
            ? 'w-72 sm:w-80 h-14 rounded-full px-4 opacity-100 scale-100' 
            : 'w-0 h-0 rounded-full px-0 opacity-0 scale-0 overflow-hidden'
          }
        `}
      >
        {/* Search Icon */}
        <Search size={20} className="text-gray-400 flex-shrink-0" />

        {/* Input Field */}
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`
            flex-1 bg-transparent outline-none
            text-gray-900 placeholder-gray-400
            text-sm font-medium
            ${isSearchOpen ? 'block' : 'hidden'}
            [&::-webkit-search-cancel-button]:appearance-none
            [&::-webkit-search-decoration]:appearance-none
          `}
        />

        {/* Close Button */}
        <button
          onClick={handleCloseSearch}
          className={`
            flex items-center justify-center shrink-0
            w-6 h-6 rounded-full
            bg-gray-100 hover:bg-gray-200
            text-gray-500 hover:text-gray-700
            transition-colors
            ${isSearchOpen ? 'block' : 'hidden'}
          `}
          aria-label="Close search"
        >
          <X size={14} className="leading-none" />
        </button>
      </div>

    </div>
  );
}

export default FloatingControls;
