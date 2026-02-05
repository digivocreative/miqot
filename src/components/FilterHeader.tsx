'use client';

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { UmrohPackage } from '@/types';
import { 
  FilterMode, 
  extractUniqueLandings, 
  groupByMonth,
  type LandingCity,
  type MonthGroup,
} from '@/utils';
import logoAlhijaz from '@/logo-alhijaz.webp';
import { Sun, Moon, Search, X, SlidersHorizontal, User, Globe, Save, Trash2, CheckCircle } from 'lucide-react';

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

  // Agent Profile State
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [agentProfile, setAgentProfile] = useState({ name: '', phone: '', website: '' });
  const [hasSavedData, setHasSavedData] = useState(false);
  const [errors, setErrors] = useState({ name: false, phone: false, website: false });

  // Load agent profile from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('agentProfile');
    if (saved) {
      try { 
        setAgentProfile(JSON.parse(saved)); 
        setHasSavedData(true);
      } catch { /* ignore */ }
    }
  }, []);

  const handleCloseModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowProfileModal(false);
      setIsClosing(false);
      setErrors({ name: false, phone: false, website: false });
    }, 300);
  };

  const handleSaveProfile = () => {
    const newErrors = {
      name: !agentProfile.name.trim(),
      phone: !agentProfile.phone.trim(),
      website: !agentProfile.website.trim(),
    };
    setErrors(newErrors);
    if (newErrors.name || newErrors.phone || newErrors.website) return;

    localStorage.setItem('agentProfile', JSON.stringify(agentProfile));
    
    setHasSavedData(true);
    setToastMessage("Simpan Berhasil");
    setShowSuccess(true);
    handleCloseModal();
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handleDeleteProfile = () => {
    localStorage.removeItem('agentProfile');
    setAgentProfile({ name: '', phone: '', website: '' });
    setHasSavedData(false);
    setToastMessage("Berhasil Dihapus");
    setShowSuccess(true);
    handleCloseModal();
    setTimeout(() => setShowSuccess(false), 3000);
  };

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
             {/* Agent Profile Button */}
             <button
              onClick={() => setShowProfileModal(true)}
              className="
                flex items-center justify-center
                p-2 rounded-full
                bg-gray-100/80 text-gray-600
                hover:bg-gray-200/80
                dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700/80
                transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-emerald-500
              "
              aria-label="Agent Profile"
            >
              <User size={16} />
            </button>

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

      {/* --- MODAL AGENT PROFILE (via Portal → document.body) --- */}
      {showProfileModal && createPortal(
        <div
          className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ease-in-out
            ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}
        >
          <div
            className={`bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden ring-1 ring-gray-900/5 transform transition-all duration-300 ease-out
              ${isClosing ? 'scale-95 opacity-0 translate-y-4' : 'scale-100 opacity-100 translate-y-0 animate-in zoom-in-95'}`}
          >

            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-bold text-gray-800 text-lg">Profil Agent</h3>
              <button
                onClick={handleCloseModal}
                className="p-2 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body Form */}
            <div className="p-6 space-y-5">

              {/* INPUT: NAMA */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                  Nama Agent <span className="text-red-500">*</span>
                </label>
                <div className="relative group">
                  <User className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${errors.name ? 'text-red-500' : 'text-gray-400 group-focus-within:text-red-500'}`} />
                  <input
                    type="text"
                    value={agentProfile.name}
                    onChange={e => {
                      setAgentProfile({...agentProfile, name: e.target.value});
                      if (errors.name) setErrors({...errors, name: false});
                    }}
                    className={`w-full pl-10 pr-4 py-3 bg-gray-50 border rounded-xl outline-none transition-all text-sm font-medium text-gray-800 placeholder:text-gray-400
                      ${errors.name
                        ? 'border-red-500 focus:ring-2 focus:ring-red-200 bg-red-50/30'
                        : 'border-gray-200 focus:bg-white focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
                      }`}
                    placeholder="Nikita Sari"
                  />
                </div>
              </div>

              {/* INPUT: WHATSAPP (Icon WA SVG) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                  No. WhatsApp <span className="text-red-500">*</span>
                </label>
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
                    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 transition-colors ${errors.phone ? 'fill-red-500' : 'fill-gray-400 group-focus-within:fill-red-500'}`}>
                      <path d="M16 2C8.42 2 2.25 8.17 2.25 15.75c0 2.46.65 4.78 1.79 6.79L2.56 29.44l7.1-1.82a13.68 13.68 0 006.34 1.58c7.58 0 13.75-6.17 13.75-13.75S23.58 2 16 2zm0 25.15c-2.12 0-4.11-.6-5.83-1.63l-4.22 1.08 1.13-4.04A11.34 11.34 0 0116 4.3c6.31 0 11.45 5.14 11.45 11.45 0 6.31-5.14 11.45-11.45 11.4zm6.68-8.58c-.37-.18-2.17-1.07-2.51-1.19-.34-.12-.58-.18-.83.18-.25.37-.96 1.19-1.17 1.44-.22.25-.44.28-.8.1-.37-.18-1.56-.57-2.96-1.82-1.09-.97-1.83-2.17-2.04-2.54-.22-.37-.02-.57.16-.75.17-.16.37-.43.55-.64.18-.22.25-.37.37-.61.12-.25.06-.46-.03-.64-.09-.18-.83-2-.14-2.74-.3-.72-.61-.63-.83-.64-.22-.01-.46-.01-.71-.01-.25 0-.64.09-.98.46-.34.37-1.29 1.26-1.29 3.07 0 1.81 1.32 3.56 1.5 3.8.19.25 2.6 3.97 6.3 5.56 2.53 1.09 3.05.88 3.6.82.55-.05 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.08-.12-.29-.19-.66-.37z"/>
                    </svg>
                  </div>
                  <input
                    type="tel"
                    value={agentProfile.phone}
                    onChange={e => {
                      setAgentProfile({...agentProfile, phone: e.target.value});
                      if (errors.phone) setErrors({...errors, phone: false});
                    }}
                    className={`w-full pl-10 pr-4 py-3 bg-gray-50 border rounded-xl outline-none transition-all text-sm font-medium text-gray-800 placeholder:text-gray-400
                      ${errors.phone
                        ? 'border-red-500 focus:ring-2 focus:ring-red-200 bg-red-50/30'
                        : 'border-gray-200 focus:bg-white focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
                      }`}
                    placeholder="0822900020"
                  />
                </div>
              </div>

              {/* INPUT: WEBSITE */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                  Website <span className="text-red-500">*</span>
                </label>
                <div className="relative group">
                  <Globe className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${errors.website ? 'text-red-500' : 'text-gray-400 group-focus-within:text-red-500'}`} />
                  <input
                    type="text"
                    value={agentProfile.website}
                    onChange={e => {
                      setAgentProfile({...agentProfile, website: e.target.value});
                      if (errors.website) setErrors({...errors, website: false});
                    }}
                    className={`w-full pl-10 pr-4 py-3 bg-gray-50 border rounded-xl outline-none transition-all text-sm font-medium text-gray-800 placeholder:text-gray-400
                      ${errors.website
                        ? 'border-red-500 focus:ring-2 focus:ring-red-200 bg-red-50/30'
                        : 'border-gray-200 focus:bg-white focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
                      }`}
                    placeholder="alhijazindonesia.com"
                  />
                </div>
              </div>

            </div>


            
            {/* Footer */}
            <div className="px-6 pb-6 pt-2 space-y-3">
              <button
                onClick={handleSaveProfile}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-500/30 active:scale-[0.98] group"
              >
                <Save className="w-5 h-5 group-hover:scale-110 transition-transform" />
                Simpan Data
              </button>

              {hasSavedData && (
                <button 
                  onClick={handleDeleteProfile}
                  className="w-full bg-white border-2 border-red-100 hover:bg-red-50 text-red-600 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                >
                  <Trash2 className="w-5 h-5" />
                  Hapus Profil
                </button>
              )}
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* --- TOAST NOTIFICATION (LIQUID GLASS 1-LINE) --- */}
      {showSuccess && createPortal(
        <div 
          className="fixed top-8 left-1/2 -translate-x-1/2 z-[10000] 
          flex items-center gap-3 px-5 py-3 
          bg-emerald-600/85 backdrop-blur-xl supports-[backdrop-filter]:bg-emerald-600/60
          border border-white/20 
          text-white rounded-full
          shadow-[0_20px_40px_-10px_rgba(5,150,105,0.4)]
          animate-in slide-in-from-top-12 fade-in zoom-in-95 duration-700"
          style={{
              // Custom Cubic Bezier untuk efek bouncy "Liquid"
              animationTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' 
          }}
        >
          {/* Icon Container (Glossy Circle) */}
          <div className="flex-shrink-0 w-8 h-8 bg-white/20 rounded-full flex items-center justify-center border border-white/10 shadow-inner">
             {/* Render Icon sesuai konteks pesan (Hapus vs Simpan) */}
             {toastMessage.toLowerCase().includes('hapus') ? (
                 <Trash2 className="w-4 h-4 text-white drop-shadow-md" />
             ) : (
                 <CheckCircle className="w-4 h-4 text-white drop-shadow-md" />
             )}
          </div>

          <span className="font-bold text-sm tracking-tight whitespace-nowrap">{toastMessage}</span>

          {/* Glossy Reflection Overlay */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/10 to-transparent opacity-40 pointer-events-none"></div>
        </div>,
        document.body
      )}
    </header>
  );
}

export default FilterHeader;
