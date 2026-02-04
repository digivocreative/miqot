import { useEffect, useState, useMemo, useCallback } from 'react';
import { PackageCard, FilterHeader, FloatingControls, FilterModal, type QuickFilterType, type TimeRange } from '@/components';
import { getPackages } from '@/services';
import { filterPackages, type FilterMode } from '@/utils';
import type { UmrohPackage } from '@/types';

// ============================================
// Main App Component
// ============================================

function App() {
  // ============================================
  // Data State
  // ============================================
  const [packages, setPackages] = useState<UmrohPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // Filter State
  // ============================================
  const [selectedYear, setSelectedYear] = useState('1448');
  const [filterMode, setFilterMode] = useState<FilterMode>('AVAILABLE');
  const [filterSecondaryValue, setFilterSecondaryValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [quickFilter, setQuickFilter] = useState<QuickFilterType | null>(null);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  // ============================================
  // Dark Mode State
  // ============================================
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check localStorage first
    const savedMode = localStorage.getItem('darkMode');
    if (savedMode !== null) {
      return savedMode === 'true';
    }
    // Check system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Apply Dark Mode Class
  useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('darkMode', isDarkMode.toString());
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => !prev);
  };

  // New Time Filter States
  const [departureTimeRanges, setDepartureTimeRanges] = useState<TimeRange[]>([]);
  const [returnTimeRanges, setReturnTimeRanges] = useState<TimeRange[]>([]);

  // ============================================
  // Fetch Packages (triggered by year change)
  // ============================================
  const fetchPackages = useCallback(async (yearCode: string) => {
    setLoading(true);
    setError(null);
    
    const result = await getPackages({ yearCode });
    
    if (result.success) {
      setPackages(result.packages);
    } else {
      setError(result.error || 'Gagal memuat data');
      setPackages([]);
    }
    setLoading(false);
  }, []);

  // Initial fetch and refetch on year change
  useEffect(() => {
    fetchPackages(selectedYear);
  }, [selectedYear, fetchPackages]);

  /**
   * Helper to check if a time (HH:MM) falls within selected ranges ('00-06', etc)
   */
  const isTimeInRanges = (timeStr: string, ranges: string[]): boolean => {
    if (ranges.length === 0) return true; // No filter applied

    // timeStr format "HH:MM", take hour
    const hour = parseInt(timeStr.split(':')[0], 10);

    return ranges.some(range => {
      if (range === '00-06') return hour >= 0 && hour < 6;
      if (range === '06-12') return hour >= 6 && hour < 12;
      if (range === '12-18') return hour >= 12 && hour < 18;
      if (range === '18-24') return hour >= 18 && hour <= 24;
      return false;
    });
  };

  // ============================================
  // Filtered Packages (Client-side filtering)
  // ============================================
  const filteredPackages = useMemo(() => {
    // First apply mode filter
    let result = filterPackages(packages, {
      mode: filterMode,
      secondaryValue: filterSecondaryValue,
    });

    // Apply Time Filters
    if (departureTimeRanges.length > 0) {
      result = result.filter(pkg => isTimeInRanges(pkg.keberangkatan.jam, departureTimeRanges));
    }
    if (returnTimeRanges.length > 0) {
      result = result.filter(pkg => isTimeInRanges(pkg.kepulangan.jam, returnTimeRanges));
    }

    // Apply quick filter
    if (quickFilter) {
      switch (quickFilter) {
        case 'promo':
          result = result.filter(pkg => pkg.isPromo);
          break;
        case 'urgent':
          // Sort by lowest remaining seats (Ascending)
          result = [...result].sort((a, b) => a.seatSisa - b.seatSisa);
          break;
        case 'termurah':
          // Sort by price ascending
          result = [...result].sort((a, b) => {
            const getMin = (pkg: UmrohPackage) => {
              let min = Infinity;
              for (const tier of Object.values(pkg.harga)) {
                const prices = [tier.Quard, tier.Triple, tier.Double].filter(Boolean);
                for (const p of prices) {
                  const val = parseInt(p!, 10);
                  if (val > 0 && val < min) min = val;
                }
              }
              return min;
            };
            return getMin(a) - getMin(b);
          });
          break;
        case 'rahmah':
          result = result.filter(pkg => pkg.nama.toLowerCase().includes('rahmah'));
          break;
      }
    }

    // Then apply search query (Omni Search)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(pkg => {
        // 1. Package Name
        const matchName = pkg.nama.toLowerCase().includes(query);

        // 2. Airline & Flight Code
        const matchAirline = pkg.maskapai.toLowerCase().includes(query);
        const matchFlightCode = 
          pkg.keberangkatan.kodePenerbangan.toLowerCase().includes(query) ||
          pkg.kepulangan.kodePenerbangan.toLowerCase().includes(query);

        // 3. Landing City (from route)
        const landingCity = pkg.keberangkatan.rute.split(' - ')[1] || '';
        const matchLanding = landingCity.toLowerCase().includes(query);

        // 4. Hotel Names (Deep Check across all tiers)
        const matchHotel = Object.values(pkg.hotel).some(hotelInfo => {
          const mekkahHotel = (hotelInfo as { mekkah_hotel?: string }).mekkah_hotel || '';
          const madinahHotel = (hotelInfo as { madinah_hotel?: string }).madinah_hotel || '';
          return mekkahHotel.toLowerCase().includes(query) || 
                 madinahHotel.toLowerCase().includes(query);
        });

        // 5. Smart Date (Indonesian format: "12 Oktober 2026")
        const departureDate = new Date(pkg.keberangkatan.tgl);
        const departureDateString = departureDate.toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).toLowerCase();
        const matchDate = departureDateString.includes(query);

        // 6. Raw date (YYYY-MM-DD format)
        const matchRawDate = pkg.keberangkatan.tgl.includes(query) ||
                             pkg.kepulangan.tgl.includes(query);

        return matchName || matchAirline || matchFlightCode || matchLanding || matchHotel || matchDate || matchRawDate;
      });
    }

    // Sort by departure date (unless urgent/termurah already sorted)
    if (!quickFilter || (quickFilter !== 'urgent' && quickFilter !== 'termurah')) {
      return result.sort((a, b) => 
        new Date(a.keberangkatan.tgl).getTime() - new Date(b.keberangkatan.tgl).getTime()
      );
    }
    
    return result;
  }, [packages, filterMode, filterSecondaryValue, searchQuery, quickFilter, departureTimeRanges, returnTimeRanges]);

  // ============================================
  // Handlers
  // ============================================
  const handleYearChange = (year: string) => {
    setSelectedYear(year);
    // Reset filters when year changes
    setFilterMode('AVAILABLE');
    setFilterSecondaryValue('');
    setSearchQuery('');
    setQuickFilter(null);
    setDepartureTimeRanges([]);
    setReturnTimeRanges([]);
  };

  const handleFilterModeChange = (mode: FilterMode) => {
    setFilterMode(mode);
    setFilterSecondaryValue('');
  };

  const handleSecondaryValueChange = (value: string) => {
    setFilterSecondaryValue(value);
  };

  const handleToggleCard = (id: string) => {
    setExpandedCardId(prevId => prevId === id ? null : id);
  };

  const handleResetFilters = () => {
    setFilterMode('AVAILABLE');
    setFilterSecondaryValue('');
    setSearchQuery('');
    setQuickFilter(null);
    setDepartureTimeRanges([]);
    setReturnTimeRanges([]);
  };



  // ============================================
  // Render
  // ============================================
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-950 transition-colors duration-300">
      {/* ============================================ */}
      {/* FILTER HEADER */}
      {/* ============================================ */}
      <FilterHeader
        packages={packages}
        year={selectedYear}
        availableYears={['1448', '1449']}
        filterMode={filterMode}
        secondaryValue={filterSecondaryValue}
        onYearChange={handleYearChange}
        onFilterModeChange={handleFilterModeChange}
        onSecondaryValueChange={handleSecondaryValueChange}
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />

      {/* ============================================ */}
      {/* MAIN CONTENT */}
      {/* ============================================ */}
      <main className="max-w-lg mx-auto px-4 pt-32 pb-24">
        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-4 border-emerald-100"></div>
              <div className="w-12 h-12 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin absolute top-0 left-0"></div>
            </div>
            <p className="mt-4 text-gray-500 font-medium">Memuat paket umroh...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 bg-red-100 rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-red-500">
                <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-red-700 font-medium mb-1">Gagal Memuat Data</p>
            <p className="text-red-600 text-sm mb-4">{error}</p>
            <button 
              onClick={() => fetchPackages(selectedYear)}
              className="px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 active:scale-95 transition-all"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {/* Package List */}
        {!loading && !error && (
          <div className="space-y-3">
            {/* Package Cards */}
            {filteredPackages.map((pkg) => (
              <PackageCard
                key={pkg.jadwalId}
                package={pkg}
                isExpanded={expandedCardId === pkg.jadwalId}
                onToggle={() => handleToggleCard(pkg.jadwalId)}
              />
            ))}

            {/* Empty State */}
            {filteredPackages.length === 0 && packages.length > 0 && (
              <div className="text-center py-16">
                <div className="w-20 h-20 mx-auto mb-5 bg-gray-100 rounded-full flex items-center justify-center">
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    strokeWidth={1.5} 
                    stroke="currentColor" 
                    className="w-10 h-10 text-gray-400"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                </div>
                <p className="text-gray-700 font-semibold text-lg mb-1">
                  Tidak ada paket ditemukan
                </p>
                <p className="text-gray-400 text-sm mb-6 max-w-xs mx-auto">
                  Tidak ada paket dengan kriteria "{filterMode}"
                  {filterSecondaryValue && ` - ${filterSecondaryValue}`}
                  {searchQuery && ` dan pencarian "${searchQuery}"`}
                </p>
                <button
                  onClick={handleResetFilters}
                  className="
                    px-5 py-2.5 
                    bg-emerald-500 text-white 
                    rounded-xl text-sm font-medium 
                    hover:bg-emerald-600 
                    active:scale-95 
                    transition-all
                    shadow-md shadow-emerald-500/20
                  "
                >
                  Reset Filter
                </button>
              </div>
            )}

            {/* No Data State */}
            {packages.length === 0 && !loading && !error && (
              <div className="text-center py-16">
                <div className="w-20 h-20 mx-auto mb-5 bg-gray-100 rounded-full flex items-center justify-center">
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    strokeWidth={1.5} 
                    stroke="currentColor" 
                    className="w-10 h-10 text-gray-400"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m6 4.125 2.25 2.25m0 0 2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                  </svg>
                </div>
                <p className="text-gray-700 font-semibold text-lg mb-1">
                  Tidak ada paket tersedia
                </p>
                <p className="text-gray-400 text-sm">
                  Belum ada paket untuk tahun {selectedYear} H
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ============================================ */}
      {/* FLOATING CONTROLS & MODALS */}
      {/* ============================================ */}
      <FloatingControls
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Cari..."
        onToggleFilter={() => {
          // Open filter modal
          setIsFilterModalOpen(true);
        }}
        isFilterActive={!!quickFilter || departureTimeRanges.length > 0 || returnTimeRanges.length > 0}
        activeFilterLabel={quickFilter ? (() => {
          switch(quickFilter) {
            case 'promo': return 'Promo Spesial';
            case 'urgent': return 'Urgent';
            case 'termurah': return 'Termurah';
            case 'rahmah': return 'Rahmah';
            default: return null;
          }
        })() : (departureTimeRanges.length > 0 || returnTimeRanges.length > 0) ? `Waktu: ${departureTimeRanges.length + returnTimeRanges.length} terpilih` : null}
        onClearFilter={() => {
          setQuickFilter(null);
          setDepartureTimeRanges([]);
          setReturnTimeRanges([]);
        }}
      />

      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        selectedFilter={quickFilter}
        onSelectFilter={setQuickFilter}
        departureRanges={departureTimeRanges}
        onDepartureRangeChange={setDepartureTimeRanges}
        returnRanges={returnTimeRanges}
        onReturnRangeChange={setReturnTimeRanges}
      />
    </div>
  );
}

export default App;
