'use client';

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { isSessionValid } from '@/utils/authUtils';
import type { UmrohPackage } from '@/types';
import {
  FilterMode,
  SortOrder,
  groupByMonth,
  extractUniqueDurations,
  extractUniqueLandings,
  type MonthGroup,
} from '@/utils';
import logoAlhijaz from '@/logo-alhijaz.webp';
import { Sun, Moon, Search, X, SlidersHorizontal, LayoutList, LogIn, Home } from 'lucide-react';
import { AGENTS_DATA } from '@/data/agents';
import FilterDropdown from './FilterDropdown';

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
  { value: 'LANDING DI', label: 'LANDING DI' },
  { value: 'UMROH CUTI 5 HARI', label: 'UMROH CUTI 5 HARI' },
  { value: 'PROMO', label: 'UMROH PROMO' },
  { value: 'UMROH REGULER', label: 'UMROH REGULER' },
  { value: 'UMROH MUSIM DINGIN', label: 'UMROH MUSIM DINGIN' },
  { value: 'BINTANG 5', label: 'UMROH BINTANG 5' },
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
  const loggedIn = useMemo(() => isSessionValid(), []);



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

  // Secondary filter choices must match the packages those modes can show.
  // Sold-out packages remain accessible only through "SEMUA DATA".
  const availablePackages = useMemo(() => {
    return packages.filter(pkg => pkg.seatSisa > 0);
  }, [packages]);

  // Group available packages by month
  const monthGroups = useMemo<MonthGroup[]>(() => {
    return groupByMonth(availablePackages);
  }, [availablePackages]);

  // Extract unique durations from available packages
  const durationOptions = useMemo(() => {
    return extractUniqueDurations(availablePackages);
  }, [availablePackages]);

  // Extract unique landing cities from available packages
  const landingOptions = useMemo(() => {
    return extractUniqueLandings(availablePackages);
  }, [availablePackages]);

  // Check if secondary dropdown should be shown
  const showSortDropdown = filterMode === 'AVAILABLE' || filterMode === 'LIBURAN_SEKOLAH' || filterMode === 'UMROH CUTI 5 HARI' || filterMode === 'PROMO' || filterMode === 'UMROH REGULER' || filterMode === 'UMROH MUSIM DINGIN' || filterMode === 'BINTANG 5';
  const showDurationDropdown = filterMode === 'DURASI PERJALANAN';
  const showMonthDropdown = filterMode === 'DATA PER-BULAN';
  const showLandingDropdown = filterMode === 'LANDING DI';

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
            })()} className="group relative block cursor-pointer transition-opacity hover:opacity-80">
              <img 
                src={logoAlhijaz} 
                alt="Alhijaz Indowisata" 
                className="h-8 w-auto object-contain md:h-10"
              />
              <img
                src={logoAlhijaz}
                alt=""
                aria-hidden="true"
                className="animate-logo-shine pointer-events-none absolute inset-0 h-8 w-auto object-contain md:h-10"
              />
            </a>
          </div>

           {/* Year Dropdown & Dark Mode Toggle */}
          <div className="flex items-center gap-2">

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

             {/* Login / Dashboard Button */}
             <button
               onClick={() => {
                 window.location.href = loggedIn ? '/dashboard' : '/login';
               }}
               className="
                 flex items-center justify-center
                 w-[38px] h-[38px] rounded-xl
                 bg-gray-100/80 text-gray-600
                 hover:bg-gray-200/80
                 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700/80
                 transition-all duration-200
                 focus:outline-none focus:ring-2 focus:ring-emerald-500
                 active:scale-95
               "
               aria-label={loggedIn ? 'Dashboard' : 'Masuk'}
               title={loggedIn ? 'Dashboard' : 'Masuk'}
             >
               {loggedIn ? <Home size={16} /> : <LogIn size={16} />}
             </button>

           </div>
        </div>

        {/* ============================================ */}
        {/* ROW 2: Filter Dropdowns */}
        {/* ============================================ */}
        <div className="flex gap-2 mt-3">
          {/* Main Filter Dropdown */}
          <FilterDropdown
            variant="default"
            value={filterMode}
            onChange={(v) => {
              const newMode = v as FilterMode;
              onFilterModeChange(newMode);
              // Reset secondary value and sort when mode changes
              onSecondaryValueChange('');
              onSortOrderChange?.(null);
            }}
            options={FILTER_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            ariaLabel="Filter paket"
            widthClass="flex-1"
            showAllOptions
          />

          {/* Secondary Dropdown: Sort Order (for AVAILABLE & PROMO) */}
          {showSortDropdown && (
            <FilterDropdown
              variant="default"
              value={sortOrder || ''}
              onChange={(v) => onSortOrderChange?.((v as SortOrder) || null)}
              options={[{ value: '', label: '- Urutkan -' }, ...SORT_OPTIONS]}
              ariaLabel="Urutkan"
              widthClass="flex-1"
            />
          )}

          {/* Secondary Dropdown: Landing City */}
          {showLandingDropdown && (
            <FilterDropdown
              variant="default"
              value={secondaryValue || ''}
              onChange={onSecondaryValueChange}
              options={[
                { value: '', label: '- Pilih Landing -' },
                ...landingOptions.map((l) => ({ value: l.code, label: `${l.name} (${l.packageCount} paket)` })),
              ]}
              ariaLabel="Pilih Landing"
              widthClass="flex-1"
            />
          )}

          {/* Secondary Dropdown: Months */}
          {showMonthDropdown && (
            <FilterDropdown
              variant="default"
              value={secondaryValue || ''}
              onChange={onSecondaryValueChange}
              options={[
                { value: '', label: '- Pilih Bulan -' },
                ...monthGroups.map((m) => ({ value: m.monthKey, label: `${m.monthName} (${m.availableSeat}/${m.totalSeat})` })),
              ]}
              ariaLabel="Pilih Bulan"
              widthClass="flex-1"
            />
          )}

          {/* Secondary Dropdown: Duration */}
          {showDurationDropdown && (
            <FilterDropdown
              variant="default"
              value={secondaryValue || ''}
              onChange={onSecondaryValueChange}
              options={[
                { value: '', label: '- Pilih Durasi -' },
                ...durationOptions.map((d) => ({ value: d.days.toString(), label: `${d.label} (${d.count} paket)` })),
              ]}
              ariaLabel="Pilih Durasi"
              widthClass="flex-1"
            />
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
