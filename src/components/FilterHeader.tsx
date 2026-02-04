'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import type { UmrohPackage } from '@/types';
import { 
  FilterMode, 
  extractUniqueLandings, 
  groupByMonth,
  type LandingCity,
  type MonthGroup,
} from '@/utils';
import logoAlhijaz from '@/logo-alhijaz.webp';
import { Sun, Moon } from 'lucide-react';

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
}: FilterHeaderProps) {
  // ============================================
  // Scroll-responsive state
  // ============================================
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  // Scroll handler
  const handleScroll = useCallback(() => {
    const currentScrollY = window.scrollY;
    
    // Always show header at the very top
    if (currentScrollY <= 50) {
      setIsVisible(true);
    } else if (currentScrollY > lastScrollY) {
      // Scrolling down -> hide header
      setIsVisible(false);
    } else {
      // Scrolling up -> show header
      setIsVisible(true);
    }
    
    setLastScrollY(currentScrollY);
  }, [lastScrollY]);

  // Attach scroll listener
  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

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
        bg-white dark:bg-slate-900 
        backdrop-blur-md shadow-sm 
        border-b border-gray-100 dark:border-slate-800 
        transition-transform duration-300 ease-in-out
        ${isVisible ? 'translate-y-0' : '-translate-y-full'}
      `}
    >
      <div className="max-w-lg mx-auto px-4 py-4">
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
                bg-gray-100 text-gray-600
                hover:bg-gray-200 
                dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700
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
                bg-white border border-gray-200
                dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200
                rounded-xl
                cursor-pointer
                hover:border-gray-300 dark:hover:border-slate-600
                focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent
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
                bg-white border border-gray-200
                dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200
                rounded-xl
                cursor-pointer
                hover:border-gray-300 dark:hover:border-slate-600
                focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent
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
                  bg-white border border-gray-200
                  dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200
                  rounded-xl
                  cursor-pointer
                  hover:border-gray-300 dark:hover:border-slate-600
                  focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent
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
                  bg-white border border-gray-200
                  dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200
                  rounded-xl
                  cursor-pointer
                  hover:border-gray-300 dark:hover:border-slate-600
                  focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent
                  transition-colors
                "
              >
                <option value="">- pilih bulan -</option>
                {monthGroups.map((month) => (
                  <option key={month.monthKey} value={month.monthKey}>
                    {month.monthName} (Sisa: {month.availableSeat} / Total: {month.totalSeat})
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
        {/* ROW 3: Quick Filter Chips */}
        {/* ============================================ */}

      </div>
    </header>
  );
}

export default FilterHeader;
