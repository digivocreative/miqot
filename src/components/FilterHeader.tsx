'use client';

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import type { UmrohPackage } from '@/types';
import { 
  FilterMode, 
  SortOrder,
  groupByMonth,
  extractUniqueDurations,
  type MonthGroup,
} from '@/utils';
import logoAlhijaz from '@/logo-alhijaz.webp';
import { Sun, Moon, Search, X, SlidersHorizontal, Calculator, LayoutList } from 'lucide-react';
import { AGENTS_DATA } from '@/data/agents';

// ============================================
// Types
// ============================================

export interface FilterHeaderProps {
  /** All packages for extracting filter options */
  packages: UmrohPackage[];
  /** Current Hijri year */
  year: string;
  /** Available years for selection */
  availableYears?: string[];
  /** Current filter mode */
  filterMode: FilterMode;
  /** Secondary filter value (month key) */
  secondaryValue?: string;
  /** Current sort order for AVAILABLE/PROMO */
  sortOrder?: SortOrder | null;
  /** Callbacks */
  onYearChange: (year: string) => void;
  onFilterModeChange: (mode: FilterMode) => void;
  onSecondaryValueChange: (value: string) => void;
  onSortOrderChange?: (order: SortOrder | null) => void;
  /** Dark mode state */
  isDarkMode: boolean;
  /** Toggle dark mode callback */
  onToggleDarkMode: () => void;
  /** Search query */
  searchQuery: string;
  /** Callback when search query changes */
  onSearchChange: (query: string) => void;
  /** Callback to toggle filter modal */
  onToggleFilter: () => void;
  /** Whether any filter is active */
  isFilterActive?: boolean;
  /** Callback to clear filters */
  onClearFilter?: () => void;
  /** Whether compact card view is enabled */
  isCompactView?: boolean;
  /** Callback to toggle compact view */
  onToggleCompact?: () => void;
}

// Filter mode options for dropdown
const FILTER_MODE_OPTIONS: { value: FilterMode; label: string }[] = [
  { value: 'AVAILABLE', label: 'SEAT TERSEDIA' },
  { value: 'LIBURAN_SEKOLAH', label: 'LIBURAN SEKOLAH' },
  { value: 'PROMO', label: 'UMROH PROMO' },
  { value: 'UMROH REGULER', label: 'UMROH REGULER' },
  { value: 'UMROH PLUS', label: 'UMROH PLUS' },
  { value: 'BINTANG 5', label: 'BINTANG 5' },
  { value: 'DURASI PERJALANAN', label: 'DURASI PERJALANAN' },
  { value: 'DATA PER-BULAN', label: 'DATA PER-BULAN' },
  { value: 'SEMUA DATA', label: 'SEMUA DATA' },
];

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'TANGGAL_TERDEKAT', label: 'Tanggal Terdekat' },
  { value: 'TANGGAL_TERJAUH', label: 'Tanggal Terjauh' },
  { value: 'HARGA_TERMURAH', label: 'Harga Termurah' },
  { value: 'HARGA_TERTINGGI', label: 'Harga Tertinggi' },
];

// ============================================
// Component
// ============================================

export function FilterHeader({
  packages,
  year,
  availableYears = ['1448', '1449'],
  filterMode,
  secondaryValue,
  sortOrder,
  onYearChange,
  onFilterModeChange,
  onSecondaryValueChange,
  onSortOrderChange,
  isDarkMode,
  onToggleDarkMode,
  searchQuery,
  onSearchChange,
  onToggleFilter,
  isFilterActive = false,
  onClearFilter,
  isCompactView = false,
  onToggleCompact,
}: FilterHeaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);



  const handleScroll = useCallback(() => {
    const currentScrollY = window.scrollY;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;

    if (currentScrollY === 0) {
      // Mentok atas -> muncul
      setIsVisible(true);
    } else if (windowHeight + currentScrollY >= documentHeight - 10) {
      // Mentok bawah (toleransi 10px) -> muncul
      setIsVisible(true);
    } else if (currentScrollY > lastScrollY) {
      // Scroll ke bawah -> sembunyi
      setIsVisible(false);
    } else {
      // Scroll ke atas -> muncul
      setIsVisible(true);
    }

    setLastScrollY(currentScrollY);
  }, [lastScrollY]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const handleClearSearch = () => {
    onSearchChange('');
    inputRef.current?.focus();
  };

  // Group packages by month
  const monthGroups = useMemo<MonthGroup[]>(() => {
    return groupByMonth(packages);
  }, [packages]);

  // Extract unique durations from packages
  const durationOptions = useMemo(() => {
    return extractUniqueDurations(packages);
  }, [packages]);

  // Check if secondary dropdown should be shown
  const showSortDropdown = filterMode === 'AVAILABLE' || filterMode === 'LIBURAN_SEKOLAH' || filterMode === 'PROMO' || filterMode === 'UMROH REGULER' || filterMode === 'UMROH PLUS' || filterMode === 'BINTANG 5';
  const showDurationDropdown = filterMode === 'DURASI PERJALANAN';
  const showMonthDropdown = filterMode === 'DATA PER-BULAN';

  return (
    <header 
      className={`
        fixed top-0 left-0 right-0 z-50
        bg-white/85 dark:bg-slate-900/85
        backdrop-blur-lg
        border-b border-gray-200/50 dark:border-slate-700/50
        supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-slate-900/60
      `}
    >
      <div className="max-w-lg mx-auto px-4 pt-4 pb-4">
        {/* ============================================ */}
        {/* ROW 1: Title & Year Dropdown */}
        {/* ============================================ */}
        <div className="flex justify-between items-center">
          {/* Logo — preserve agent slug if present */}
          <div className="flex-shrink-0">
            <a href={(() => {
              const seg = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean)[0];
              return seg ? `/${seg}` : '/';
            })()} className="block cursor-pointer">
              <img 
                src={logoAlhijaz} 
                alt="Alhijaz Indowisata" 
                className="h-8 md:h-10 w-auto object-contain hover:opacity-80 transition-opacity"
              />
            </a>
          </div>

           {/* Year Dropdown & Dark Mode Toggle */}
          <div className="flex items-center gap-2">

             {/* Kalkulasi Icon – only if valid agent slug */}
             {(() => {
               const seg = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean)[0]?.toLowerCase();
               if (!seg || !AGENTS_DATA[seg]) return null;
               return (
                 <button
                   onClick={(e) => {
                     e.preventDefault();
                     document.body.classList.add('navigating');
                     setTimeout(() => {
                       window.location.href = `/${seg}/kalkulasi?transition=1`;
                     }, 280);
                   }}
                   className="
                     flex items-center gap-2
                     px-3 h-[38px] rounded-xl
                     bg-gray-100/80 text-gray-600
                     hover:bg-gray-200/80
                     dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700/80
                     transition-all duration-200
                     focus:outline-none focus:ring-2 focus:ring-emerald-500
                   "
                   aria-label="Kalkulasi Harga"
                   title="Kalkulasi Harga"
                 >
                   <Calculator size={16} />
                   <span className="text-xs font-medium">Hitung</span>
                 </button>
               );
             })()}

             {/* Compare Button */}
             {(() => {
               const seg = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean)[0]?.toLowerCase();
               if (!seg || !AGENTS_DATA[seg]) return null;
               return (
                 <button
                   onClick={() => {
                     document.body.classList.add('navigating');
                     setTimeout(() => {
                       window.location.href = `/${seg}/compare?transition=1`;
                     }, 280);
                   }}
                   className="
                     flex items-center justify-center
                     w-[38px] h-[38px] rounded-xl
                     bg-gray-100/80 text-gray-600
                     hover:bg-gray-200/80
                     dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700/80
                     hover:text-violet-600 dark:hover:text-violet-400
                     transition-all duration-200
                     focus:outline-none focus:ring-2 focus:ring-emerald-500
                   "
                   aria-label="Compare"
                   title="Compare Paket"
                 >
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                   </svg>
                 </button>
               );
             })()}

             {/* Dark Mode Toggle */}
             <button
              onClick={onToggleDarkMode}
              className="
                flex items-center justify-center
                w-[38px] h-[38px] rounded-xl
                bg-gray-100/80 text-gray-600
                hover:bg-gray-200/80
                dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700/80
                transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-emerald-500
              "
              aria-label="Toggle Dark Mode"
            >
              {isDarkMode ? <Moon size={16} /> : <Sun size={16} />}
            </button>

           </div>
        </div>

        {/* ============================================ */}
        {/* ROW 2: Filter Dropdowns */}
        {/* ============================================ */}
        <div className="flex gap-2 mt-3">
          {/* Main Filter Dropdown */}
          <div className="relative flex-1">
            <select
              value={filterMode}
              onChange={(e) => {
                const newMode = e.target.value as FilterMode;
                onFilterModeChange(newMode);
                // Reset secondary value and sort when mode changes
                onSecondaryValueChange('');
                onSortOrderChange?.(null);
              }}
              className="
                w-full appearance-none
                px-3 py-2.5 pr-8
                text-sm font-medium text-gray-700
                bg-gray-100/80 border border-transparent
                dark:bg-slate-800/80 dark:border-transparent dark:text-slate-200
                rounded-xl
                cursor-pointer
                hover:bg-gray-200/80 dark:hover:bg-slate-700/80
                focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:bg-white dark:focus:bg-slate-800
                transition-colors
              "
            >
              {FILTER_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              viewBox="0 0 20 20" 
              fill="currentColor" 
              className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
            >
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </div>

          {/* Secondary Dropdown: Sort Order (for AVAILABLE & PROMO) */}
          {showSortDropdown && (
            <div className="relative flex-1 animate-in slide-in-from-right-2 duration-200">
              <select
                value={sortOrder || ''}
                onChange={(e) => {
                  const val = e.target.value as SortOrder | '';
                  onSortOrderChange?.(val || null);
                }}
                className="
                  w-full appearance-none
                  px-3 py-2.5 pr-8
                  text-sm font-medium text-gray-700
                  bg-gray-100/80 border border-transparent
                  dark:bg-slate-800/80 dark:border-transparent dark:text-slate-200
                  rounded-xl
                  cursor-pointer
                  hover:bg-gray-200/80 dark:hover:bg-slate-700/80
                  focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:bg-white dark:focus:bg-slate-800
                  transition-colors
                "
              >
                <option value="">- Urutkan -</option>
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 20 20" 
                fill="currentColor" 
                className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              >
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </div>
          )}

          {/* Secondary Dropdown: Months */}
          {showMonthDropdown && (
            <div className="relative flex-1 animate-in slide-in-from-right-2 duration-200">
              <select
                value={secondaryValue || ''}
                onChange={(e) => onSecondaryValueChange(e.target.value)}
                className="
                  w-full appearance-none
                  px-3 py-2.5 pr-8
                  text-sm font-medium text-gray-700
                  bg-gray-100/80 border border-transparent
                  dark:bg-slate-800/80 dark:border-transparent dark:text-slate-200
                  rounded-xl
                  cursor-pointer
                  hover:bg-gray-200/80 dark:hover:bg-slate-700/80
                  focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:bg-white dark:focus:bg-slate-800
                  transition-colors
                "
              >
                <option value="">- Pilih Bulan -</option>
                {monthGroups.map((month) => (
                  <option key={month.monthKey} value={month.monthKey}>
                    {month.monthName} ({month.availableSeat}/{month.totalSeat})
                  </option>
                ))}
              </select>
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 20 20" 
                fill="currentColor" 
                className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              >
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </div>
          )}

          {/* Secondary Dropdown: Duration */}
          {showDurationDropdown && (
            <div className="relative flex-1 animate-in slide-in-from-right-2 duration-200">
              <select
                value={secondaryValue || ''}
                onChange={(e) => onSecondaryValueChange(e.target.value)}
                className="
                  w-full appearance-none
                  px-3 py-2.5 pr-8
                  text-sm font-medium text-gray-700
                  bg-gray-100/80 border border-transparent
                  dark:bg-slate-800/80 dark:border-transparent dark:text-slate-200
                  rounded-xl
                  cursor-pointer
                  hover:bg-gray-200/80 dark:hover:bg-slate-700/80
                  focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:bg-white dark:focus:bg-slate-800
                  transition-colors
                "
              >
                <option value="">- Pilih Durasi -</option>
                {durationOptions.map((dur) => (
                  <option key={dur.days} value={dur.days.toString()}>
                    {dur.label} ({dur.count} paket)
                  </option>
                ))}
              </select>
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 20 20" 
                fill="currentColor" 
                className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              >
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>

        {/* ============================================ */}
        {/* ROW 3: Search Bar & Filter Button (collapsible on scroll) */}
        {/* ============================================ */}
        <div
          className="transition-all duration-300 ease-in-out overflow-hidden p-1 -m-1"
          style={{
            maxHeight: isVisible ? '68px' : '0px',
            opacity: isVisible ? 1 : 0,
            marginTop: isVisible ? '12px' : '0px',
          }}
        >
          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 pointer-events-none"
              />
              <input
                ref={inputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Cari..."
                className="
                  w-full pl-10 pr-10 py-2.5
                  bg-gray-100/80 dark:bg-slate-800/80
                  border border-transparent
                  rounded-xl
                  text-sm font-medium
                  text-gray-900 dark:text-slate-100
                  placeholder-gray-400 dark:placeholder-slate-500
                  outline-none
                  focus:bg-white dark:focus:bg-slate-800
                  focus:ring-2 focus:ring-emerald-500/50
                  transition-all
                  [&::-webkit-search-cancel-button]:appearance-none
                  [&::-webkit-search-decoration]:appearance-none
                "
              />
              {searchQuery.length > 0 && (
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

            {/* Filter Button */}
            <button
              onClick={onToggleFilter}
              className={`
                relative flex items-center justify-center
                w-11 h-11 shrink-0
                bg-gray-100/80 dark:bg-slate-800/80
                border border-transparent
                text-gray-600 dark:text-slate-300
                rounded-xl
                hover:bg-gray-200/80 dark:hover:bg-slate-700/80
                hover:text-emerald-600 dark:hover:text-emerald-400
                transition-all duration-200
                active:scale-95
              `}
              aria-label="Filter"
            >
              <SlidersHorizontal size={18} />
              {isFilterActive && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
              )}
            </button>

            {/* Compact View Toggle */}
            <button
              onClick={onToggleCompact}
              className={`
                relative flex items-center justify-center
                w-11 h-11 shrink-0
                rounded-xl
                transition-all duration-200
                active:scale-95
                ${isCompactView
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
                  : 'bg-gray-100/80 text-gray-600 hover:bg-gray-200/80 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700/80'
                }
              `}
              aria-label="Toggle Compact View"
              title={isCompactView ? 'Tampilan Normal' : 'Tampilan Compact'}
            >
              <LayoutList size={18} />
            </button>
          </div>
        </div>

      </div>


    </header>
  );
}

export default FilterHeader;
