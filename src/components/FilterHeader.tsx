'use client';

import { useMemo, useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { isSessionValid } from '@/utils/authUtils';
import { isProgrammaticScrollActive } from '@/lib/programmatic-scroll';
import type { UmrohPackage } from '@/types';
import {
  FilterMode,
  SortOrder,
  MODES_WITH_SORT,
  filterModeLabel,
  groupByMonth,
  extractUniqueDurations,
  extractUniqueLandings,
  type MonthGroup,
} from '@/utils';
import {
  getMusimDinginWindow,
  listPackageTypeOptions,
  packageTypeLabel,
  umrohTypeSubject,
} from '@/lib/packageType';
import logoAlhijazColored from '@/new-logo/new-logo-alhijaz-colored.png';
import logoAlhijazWhite from '@/new-logo/new-logo-alhijaz-white.png';
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
  /** Secondary filter value (month key, durasi, kode landing, atau tipe paket) */
  secondaryValue?: string;
  /** Current sort order — hanya untuk mode tanpa sub-nilai sendiri (MODES_WITH_SORT) */
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

// Trigger sizing for the filter-row dropdowns: two of them share the row (flex-1),
// so on <sm the default variant's text-sm truncates long labels ("Umroh Musim Dingin",
// "Madinah (12 paket)"). Shrink font + padding on mobile only; ≥sm keeps the
// default-variant look. Passed as triggerSizeClass (replaces, not appends).
// h-9 pins the mobile height to the search row below it (both 36px); `sm:h-auto`
// hands height back to sm:py-2.5 so the ≥sm look is unchanged.
const FILTER_ROW_TRIGGER_SIZE =
  'h-9 gap-1.5 px-2.5 text-xs sm:h-auto sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm font-medium rounded-xl';

// Search icon + the two square action buttons shrink with the row on mobile.
// lucide's `size` prop writes width/height attributes, which CSS beats — so the
// responsive sizing has to come from classes, not the prop.
const ROW_ICON_SIZE = 'w-4 h-4 sm:w-[18px] sm:h-[18px]';

// Filter mode options for dropdown.
// 'LIBURAN_SEKOLAH' & 'UMROH CUTI 5 HARI' sengaja tidak di sini — mode URL saja
// (lihat FilterMode di src/utils/filter-logic.ts).
// Label datang dari FILTER_MODE_LABELS: nilai mode terikat slug URL & logika
// filter, teksnya tidak — mis. 'TIPE PAKET' tampil sebagai "JENIS PAKET".
const FILTER_MODE_OPTIONS: { value: FilterMode; label: string }[] = [
  { value: 'AVAILABLE', label: filterModeLabel('AVAILABLE') },
  { value: 'TIPE PAKET', label: filterModeLabel('TIPE PAKET') },
  { value: 'LANDING DI', label: filterModeLabel('LANDING DI') },
  { value: 'DURASI PERJALANAN', label: filterModeLabel('DURASI PERJALANAN') },
  { value: 'DATA PER-BULAN', label: filterModeLabel('DATA PER-BULAN') },
  { value: 'SEMUA DATA', label: filterModeLabel('SEMUA DATA') },
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
  const headerRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollYRef = useRef(0);
  const loggedIn = useMemo(() => isSessionValid(), []);

  // The header is `fixed`, so <main> offsets itself by --filter-header-h. Publish the
  // measured height instead of letting that offset hardcode it — the two drifted apart
  // once the rows were resized, leaving a visible gap above the first card.
  //
  // Measure only the SETTLED EXPANDED height. Sampling per-frame (ResizeObserver) would
  // feed the collapse/expand animation into <main>'s padding and shove the page content
  // around under the fixed header while the user scrolls. Hence: on mount (nothing is
  // animating yet), on viewport resize, and on transitionend — all gated on `isVisible`,
  // so a collapsed header never overwrites the value.
  //
  // JEBAKAN: `transitionend` MENGGELEMBUNG. Di dalam header ada 13 elemen bertransisi,
  // dan beberapa (`transition-all` 0,15s/0,2s pada input cari + tombol) selesai SEBELUM
  // animasi buka header sendiri (0,3s). Tanpa saringan, publish() ikut jalan di tengah
  // animasi lalu mengukur tinggi antara — 165px dan 175px, bukan 181px yang sudah tenang.
  // Tiap nilai baru mengubah padding <main>, yang memaksa relayout SELURUH dokumen
  // (~11ms untuk 33 kartu di desktop; jauh lebih mahal di iPhone) dan menggeser seluruh
  // daftar kartu. Efeknya: daftar tersentak 176→186→192px tiap header muncul —
  // persis "flicker" yang terlihat saat menggulir. Karena itu hanya transisi yang
  // BENAR-BENAR menentukan tinggi header (grid-template-rows + padding pada dua
  // pembungkus di bawah ini) yang boleh memicu pengukuran.
  const isVisibleRef = useRef(isVisible);
  isVisibleRef.current = isVisible;
  const padBoxRef = useRef<HTMLDivElement>(null);
  const collapseRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    let lastPublished = '';
    const publish = () => {
      if (!isVisibleRef.current) return;
      const h = Math.round(el.getBoundingClientRect().height);
      if (h <= 0) return;
      const value = `${h}px`;
      // Menulis nilai yang sama tidak dibaca ulang oleh engine, tapi tetap murah untuk
      // dijaga di sini supaya niatnya eksplisit.
      if (value === lastPublished) return;
      lastPublished = value;
      document.documentElement.style.setProperty('--filter-header-h', value);
    };
    const onTransitionEnd = (e: TransitionEvent) => {
      const settled =
        (e.target === collapseRef.current && e.propertyName === 'grid-template-rows') ||
        (e.target === padBoxRef.current && e.propertyName.startsWith('padding'));
      if (settled) publish();
    };
    publish(); // mount: expanded, nothing animating yet
    window.addEventListener('resize', publish);
    el.addEventListener('transitionend', onTransitionEnd);
    return () => {
      window.removeEventListener('resize', publish);
      el.removeEventListener('transitionend', onTransitionEnd);
    };
  }, []);



  const handleScroll = useCallback(() => {
    const currentScrollY = window.scrollY;
    const lastScrollY = lastScrollYRef.current;

    // Scroll kompensasi anchor kartu, bukan gestur user — jangan toggle header
    // di tengah animasi pindah kartu (header melebar bisa menutupi kartu yang di-tap).
    if (isProgrammaticScrollActive()) {
      lastScrollYRef.current = currentScrollY;
      return;
    }

    const windowHeight = window.innerHeight;
    // Bacaan `scrollHeight` ini MEMAKSA layout sinkron. Murah saat layout bersih, tapi
    // saat kartu terbuka framer-motion menganimasikan `height` panel tiap frame (dan
    // kartu ber-content-visibility keluar-masuk viewport), jadi layout hampir selalu
    // kotor — sekali baca = relayout seluruh dokumen. Dulu ini jalan sekali per EVENT
    // scroll; iOS Safari menembakkan event scroll lebih rapat dari frame saat momentum,
    // sehingga satu frame bisa menanggung beberapa relayout penuh dan scroll-nya
    // tersendat. Sekarang digas rAF (lihat useEffect di bawah): maksimal sekali per frame.
    const documentHeight = document.documentElement.scrollHeight;

    if (currentScrollY === 0) {
      // Mentok atas -> muncul
      lastScrollYRef.current = currentScrollY;
      setIsVisible(true);
      return;
    }
    if (windowHeight + currentScrollY >= documentHeight - 10) {
      // Mentok bawah (toleransi 10px) -> muncul
      lastScrollYRef.current = currentScrollY;
      setIsVisible(true);
      return;
    }

    // Ambang 4px: rubber-band dan momentum iOS melaporkan delta sub-pixel yang
    // bolak-balik arah, dan tiap pembalikan me-restart animasi 300ms header —
    // header jadi terlihat berkedip buka-tutup. Delta sekecil itu bukan gestur.
    // Sengaja HANYA menggerbangi toggle berbasis arah; mentok atas/bawah di atas
    // tetap tanpa syarat supaya header selalu muncul di kedua ujung halaman.
    // `lastScrollYRef` tidak diperbarui saat di bawah ambang, supaya guliran pelan
    // tetap terakumulasi sampai melewati 4px dan tidak hilang begitu saja.
    const delta = currentScrollY - lastScrollY;
    if (Math.abs(delta) < 4) return;
    lastScrollYRef.current = currentScrollY;

    // Scroll ke bawah -> sembunyi, ke atas -> muncul
    setIsVisible(delta < 0);
  }, []);

  useEffect(() => {
    // Gas rAF: banyak event scroll dalam satu frame dilipat jadi satu pemanggilan,
    // supaya `scrollHeight` di atas tidak memaksa relayout berkali-kali per frame.
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        handleScroll();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
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

  // Jendela musim dingin dihitung sekali per sesi — sama seperti halaman Brosur;
  // window tidak bergeser mid-day untuk use case ini.
  const musimDinginWindow = useMemo(() => getMusimDinginWindow(new Date()), []);

  // Tipe paket: roster, urutan, label, dan gerbang "hanya yang punya paket"
  // datang dari modul bersama, jadi daftarnya identik dengan halaman Brosur.
  const packageTypeOptions = useMemo(() => {
    const options = listPackageTypeOptions(availablePackages.map(umrohTypeSubject), musimDinginWindow);
    // Sub-nilai dari tautan lama (mis. /umroh-musim-dingin di tahun tanpa paket
    // Des/Jan) tetap ditampilkan supaya trigger tidak kosong dan user tahu
    // filter apa yang sedang aktif.
    if (secondaryValue && !options.some(o => o.value === secondaryValue)) {
      options.push({ value: secondaryValue, label: packageTypeLabel(secondaryValue) });
    }
    return options;
  }, [availablePackages, musimDinginWindow, secondaryValue]);

  // Mode URL-saja (mis. /cuti-5-hari, /liburan-sekolah) tidak ada di roster
  // dropdown. Tanpa entri sintetis, FilterDropdown tidak menemukan labelnya dan
  // trigger jatuh ke placeholder '—' — pengunjung yang datang dari tautan lama
  // tidak tahu filter apa yang sedang aktif.
  const filterModeOptions = useMemo(() => {
    const options = FILTER_MODE_OPTIONS.map(o => ({ value: o.value as string, label: o.label }));
    if (!options.some(o => o.value === filterMode)) {
      options.push({ value: filterMode, label: filterModeLabel(filterMode) });
    }
    return options;
  }, [filterMode]);

  // Check if secondary dropdown should be shown
  const showSortDropdown = MODES_WITH_SORT.includes(filterMode);
  const showTypeDropdown = filterMode === 'TIPE PAKET';
  const showDurationDropdown = filterMode === 'DURASI PERJALANAN';
  const showMonthDropdown = filterMode === 'DATA PER-BULAN';
  const showLandingDropdown = filterMode === 'LANDING DI';

  return (
    <header
      ref={headerRef}
      className={`
        fixed top-0 left-0 right-0 z-50
        bg-white/85 dark:bg-slate-900/85
        backdrop-blur-lg
        border-b border-gray-200/50 dark:border-slate-700/50
        supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-slate-900/60
      `}
    >
      {/* Vertical padding slims symmetrically (16px -> 8px) while the rows are hidden */}
      <div
        ref={padBoxRef}
        className="max-w-lg mx-auto px-4 transition-[padding] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{
          paddingTop: isVisible ? '16px' : '8px',
          paddingBottom: isVisible ? '16px' : '8px',
        }}
      >
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
                src={isDarkMode ? logoAlhijazWhite : logoAlhijazColored}
                alt="Alhijaz Indowisata"
                className="h-7 w-auto object-contain md:h-9"
              />
              <img
                src={isDarkMode ? logoAlhijazWhite : logoAlhijazColored}
                alt=""
                aria-hidden="true"
                className="animate-logo-shine pointer-events-none absolute inset-0 h-7 w-auto object-contain md:h-9"
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
        {/* ROW 2 + ROW 3: Filters & Search (collapsible on scroll) */}
        {/* ============================================ */}
        {/* Grid-rows 1fr/0fr animates to the exact content height (max-height overshoot causes a laggy start). */}
        {/* Dropdown panels render via portal so the overflow-hidden collapse wrapper can't clip them. */}
        <div
          ref={collapseRef}
          className="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{
            gridTemplateRows: isVisible ? '1fr' : '0fr',
            opacity: isVisible ? 1 : 0,
          }}
        >
        <div className="min-h-0 overflow-hidden p-1 -m-1">
        <div
          className="transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{ transform: isVisible ? 'translateY(0)' : 'translateY(-10px)' }}
        >
        <div className="flex gap-2 mt-3">
          {/* Main Filter Dropdown */}
          <FilterDropdown
            variant="default"
            triggerSizeClass={FILTER_ROW_TRIGGER_SIZE}
            portal
            value={filterMode}
            onChange={(v) => {
              const newMode = v as FilterMode;
              onFilterModeChange(newMode);
              // Reset secondary value and sort when mode changes
              onSecondaryValueChange('');
              onSortOrderChange?.(null);
            }}
            options={filterModeOptions}
            ariaLabel="Filter paket"
            widthClass="flex-1"
            showAllOptions
          />

          {/* Secondary Dropdown: Package Type — roster identik halaman Brosur */}
          {showTypeDropdown && (
            <FilterDropdown
              variant="default"
              triggerSizeClass={FILTER_ROW_TRIGGER_SIZE}
              portal
              value={secondaryValue || ''}
              onChange={onSecondaryValueChange}
              options={[
                { value: '', label: '- Pilih Jenis -' },
                ...packageTypeOptions,
              ]}
              // Roster jenis paket lewat 8 opsi, jadi FilterDropdown otomatis
              // memunculkan kotak Cari — tidak berguna di sini: daftarnya pendek,
              // muat satu layar, dan halaman ini sudah punya kotak Cari sendiri
              // tepat di bawahnya.
              searchable={false}
              ariaLabel="Pilih Jenis Paket"
              widthClass="flex-1"
            />
          )}

          {/* Secondary Dropdown: Sort Order (mode tanpa sub-nilai sendiri) */}
          {showSortDropdown && (
            <FilterDropdown
              variant="default"
              triggerSizeClass={FILTER_ROW_TRIGGER_SIZE}
              portal
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
              triggerSizeClass={FILTER_ROW_TRIGGER_SIZE}
              portal
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
              triggerSizeClass={FILTER_ROW_TRIGGER_SIZE}
              portal
              value={secondaryValue || ''}
              onChange={onSecondaryValueChange}
              options={[
                { value: '', label: '- Pilih Bulan -' },
                // Nama bulan saja — hitungan kursi (sisa/total) sengaja tidak
                // ikut: angkanya lebar, memaksa trigger terpotong di mobile,
                // dan sisa seat sudah terbaca per kartu.
                ...monthGroups.map((m) => ({ value: m.monthKey, label: m.monthName })),
              ]}
              ariaLabel="Pilih Bulan"
              widthClass="flex-1"
            />
          )}

          {/* Secondary Dropdown: Duration */}
          {showDurationDropdown && (
            <FilterDropdown
              variant="default"
              triggerSizeClass={FILTER_ROW_TRIGGER_SIZE}
              portal
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

          <div className="flex items-center gap-2 mt-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search
                className={`absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 pointer-events-none ${ROW_ICON_SIZE}`}
              />
              <input
                ref={inputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Cari..."
                className="
                  w-full h-9 pl-9 pr-9 sm:h-auto sm:pl-10 sm:pr-10 sm:py-2.5
                  bg-gray-100/80 dark:bg-slate-800/80
                  border border-transparent
                  rounded-xl
                  text-xs sm:text-sm font-medium
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
                    absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2
                    flex items-center justify-center
                    w-4 h-4 sm:w-5 sm:h-5 rounded-full
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
                w-9 h-9 sm:w-11 sm:h-11 shrink-0
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
              <SlidersHorizontal className={ROW_ICON_SIZE} />
              {isFilterActive && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
              )}
            </button>

            {/* Compact View Toggle */}
            <button
              onClick={onToggleCompact}
              className={`
                relative flex items-center justify-center
                w-9 h-9 sm:w-11 sm:h-11 shrink-0
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
              <LayoutList className={ROW_ICON_SIZE} />
            </button>
          </div>
        </div>
        </div>
        </div>

      </div>


    </header>
  );
}

export default FilterHeader;
