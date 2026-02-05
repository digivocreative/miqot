'use client';

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import type { UmrohPackage } from '@/types';
import { 
  FilterMode, 
  extractUniqueLandings, 
  groupByMonth,
  type LandingCity,
  type MonthGroup,
} from '@/utils';
import logoAlhijaz from '@/logo-alhijaz.webp';
import { Sun, Moon, Search, X, SlidersHorizontal } from 'lucide-react';

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
  /** Secondary filter value (city name or month key) */
  secondaryValue?: string;
  /** Callbacks */
  onYearChange: (year: string) => void;
  onFilterModeChange: (mode: FilterMode) => void;
  onSecondaryValueChange: (value: string) => void;
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
}

// Filter mode options for dropdown
const FILTER_MODE_OPTIONS: { value: FilterMode; label: string }[] = [
  { value: 'AVAILABLE', label: 'AVAILABLE' },
  { value: 'LANDING', label: 'LANDING' },
  { value: 'PROMO', label: 'PROMO' },
  { value: 'DATA PER-BULAN', label: 'DATA PER-BULAN' },
  { value: 'SEMUA DATA', label: 'SEMUA DATA' },
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
  onYearChange,
  onFilterModeChange,
  onSecondaryValueChange,
  isDarkMode,
  onToggleDarkMode,
  searchQuery,
  onSearchChange,
  onToggleFilter,
  isFilterActive = false,
  onClearFilter,
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

  // Extract unique landing cities from packages
  const landingCities = useMemo<LandingCity[]>(() => {
    return extractUniqueLandings(packages);
  }, [packages]);

  // Group packages by month
  const monthGroups = useMemo<MonthGroup[]>(() => {
    return groupByMonth(packages);
  }, [packages]);

  // Check if secondary dropdown should be shown
  const showLandingDropdown = filterMode === 'LANDING';
  const showMonthDropdown = filterMode === 'DATA PER-BULAN';

  return (
    <header 
      className={`
        fixed top-0 left-0 right-0 z-50
        bg-white/85 dark:bg-slate-900/85
        backdrop-blur-lg
        border-b border-gray-200/50 dark:border-slate-700/50
        supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-slate-900/60
        transition-transform duration-300 ease-in-out
        ${isVisible ? 'translate-y-0' : '-translate-y-full'}
      `}
    >
      <div className="max-w-lg mx-auto px-4 pt-4 pb-4">
        {/* ============================================ */}
        {/* ROW 1: Title & Year Dropdown */}
        {/* ============================================ */}
        <div className="flex justify-between items-center">
          {/* Logo */}
          <div className="flex-shrink-0">
            <a href="/" className="block cursor-pointer">
              <img 
                src={logoAlhijaz} 
                alt="Alhijaz Indowisata" 
                className="h-8 md:h-10 w-auto object-contain hover:opacity-80 transition-opacity"
              />
            </a>
          </div>

          {/* Year Dropdown & Dark Mode Toggle */}
          <div className="flex items-center gap-3">
             {/* Dark Mode Toggle */}
             <button
              onClick={onToggleDarkMode}
              className="
                flex items-center gap-2
                px-3 py-2 rounded-full
                bg-gray-100/80 text-gray-600
                hover:bg-gray-200/80
                dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700/80
                transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-emerald-500
              "
              aria-label="Toggle Dark Mode"
            >
              {isDarkMode ? <Moon size={16} /> : <Sun size={16} />}
              <span className="text-xs font-medium hidden sm:inline-block">
                {isDarkMode ? 'Dark' : 'Light'}
              </span>
            </button>

            {/* Year Dropdown */}
          <div className="relative">
            <select
              value={year}
              onChange={(e) => onYearChange(e.target.value)}
              className="
                appearance-none
                px-3 py-2 pr-8
                text-sm font-medium text-gray-700
                bg-gray-100/80 border border-transparent
                dark:bg-slate-800/80 dark:border-transparent dark:text-slate-200
                rounded-xl
                cursor-pointer
                hover:bg-gray-200/80 dark:hover:bg-slate-700/80
                focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:bg-white dark:focus:bg-slate-800
                transition-all
              "
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y} H
                </option>
              ))}
            </select>
            {/* Dropdown Arrow */}
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              viewBox="0 0 20 20" 
              fill="currentColor" 
              className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            >
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </div>
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
                // Reset secondary value when mode changes
                onSecondaryValueChange('');
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

          {/* Secondary Dropdown: Landing Cities */}
          {showLandingDropdown && (
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
                <option value="">- pilih kota landing -</option>
                {landingCities.map((city) => (
                  <option key={city.code} value={city.code}>
                    {city.name}
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
                <option value="">- pilih bulan -</option>
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
        </div>

        {/* ============================================ */}
        {/* ROW 3: Search Bar & Filter Button */}
        {/* ============================================ */}
        <div className="flex items-center gap-2 mt-3">
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
        </div>

      </div>
    </header>
  );
}

export default FilterHeader;
