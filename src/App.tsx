import { useEffect, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { PackageCard, CompactCard, FilterHeader, FilterModal, type QuickFilterType, type TimeRange } from '@/components';
import { getPackages, refreshPackages } from '@/services';
import { filterPackages, sortPackages, getFilterSlug, getFilterModeFromSlug, type FilterMode, type SortOrder } from '@/utils';
import type { UmrohPackage } from '@/types';
import { AGENTS_DATA, loadAgentsFromSupabase, type AgentData } from '@/data/agents';
import { initFromCache, buildDatabaseFromPackages } from '@/data/hotelService';
import FloatingAgentBar from '@/components/FloatingAgentBar';
import { Loader2 } from 'lucide-react';
import { sendCapiEvent } from '@/lib/capi';
import { trackPublicEvent } from '@/utils/analytics';

// ============================================
// Main App Component
// ============================================

function App({ singlePackageId }: { singlePackageId?: string | null }) {
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
  const [sortOrder, setSortOrder] = useState<SortOrder | null>('TANGGAL_TERDEKAT');
  const [compactDetailId, setCompactDetailId] = useState<string | null>(null);
  const [isGoingBack, setIsGoingBack] = useState(false);
  const [isCompactView, setIsCompactView] = useState(() => {
    return localStorage.getItem('compactView') === 'true';
  });

  const toggleCompactView = useCallback(() => {
    setIsCompactView(prev => {
      const next = !prev;
      localStorage.setItem('compactView', next.toString());
      return next;
    });
  }, []);

  // ============================================
  // Dark Mode State
  // ============================================
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check localStorage first
    const savedMode = localStorage.getItem('darkMode');
    if (savedMode !== null) {
      return savedMode === 'true';
    }
    // Default to light mode for new users
    return false;
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

  // Detect agent + filter slug from URL (shared state for SEO + FloatingAgentBar).
  // Hydrate eagerly from server-injected __AGENT_CONTEXT__ so action buttons that
  // depend on currentAgent (Diskusi, Hitung, etc.) render on the first paint —
  // otherwise first-time visitors with empty AGENTS_DATA cache flash a button-less
  // toolbar until Supabase populates the cache.
  const [currentAgent, setCurrentAgent] = useState<AgentData | null>(() => {
    const ctx = typeof window !== 'undefined' ? window.__AGENT_CONTEXT__ : undefined;
    if (!ctx) return null;
    return {
      name: ctx.name,
      website: ctx.website || '',
      phone: ctx.phone || '',
      photo: ctx.photo || '',
      card_variant: 'default',
    };
  });

  // Custom-domain context injected by the server into window.__AGENT_CONTEXT__.
  // When set, the agent is determined by the host (custom domain), not the path.
  const serverAgentContext = typeof window !== 'undefined' ? window.__AGENT_CONTEXT__ : undefined;
  const isCustomDomain = !!serverAgentContext?.customDomain;
  const customDomainSlug = serverAgentContext?.slug || null;

  // Load agents from Supabase on mount, then fetch card_variant from server API.
  // On custom domain, agent slug comes from server context; on alhijaz.co, from URL.
  useEffect(() => {
    loadAgentsFromSupabase().then(() => {
      let slug: string | null = null;
      if (customDomainSlug) {
        slug = customDomainSlug.toLowerCase();
      } else {
        const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
        if (segments.length >= 1) slug = segments[0]?.toLowerCase() || null;
      }
      if (!slug) return;
      const possibleAgent = AGENTS_DATA[slug];
      if (possibleAgent) {
        setCurrentAgent(possibleAgent);
        fetch(`/api/agent/${slug}/card-variant`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data?.card_variant && data.card_variant !== 'default') {
              const updated = { ...AGENTS_DATA[slug!], card_variant: data.card_variant };
              AGENTS_DATA[slug!] = updated;
              setCurrentAgent(updated);
            }
          })
          .catch(() => {});
      }
    });
  }, [customDomainSlug]);

  useEffect(() => {
    const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
    // segments can be: [], ['nikita'], ['liburan-sekolah'], ['nikita', 'liburan-sekolah']
    // On custom domain, agent is from host — segments[0] is a filter slug (or empty).

    let agent: AgentData | undefined;
    let filterSlugFromUrl: string | undefined;

    if (customDomainSlug) {
      agent = AGENTS_DATA[customDomainSlug.toLowerCase()];
      if (segments.length >= 1) filterSlugFromUrl = segments[0];
    } else if (segments.length >= 1) {
      const possibleAgent = AGENTS_DATA[segments[0]?.toLowerCase()];
      if (possibleAgent) {
        agent = possibleAgent;
        if (segments.length >= 2) filterSlugFromUrl = segments[1];
      } else {
        filterSlugFromUrl = segments[0];
      }
    }

    setCurrentAgent(agent || null);

    // Apply filter from URL slug
    if (filterSlugFromUrl) {
      const modeFromUrl = getFilterModeFromSlug(filterSlugFromUrl);
      if (modeFromUrl) {
        setFilterMode(modeFromUrl);
        // Set default sort for modes with sort sub-dropdown
        const modesWithSort: FilterMode[] = ['AVAILABLE', 'LIBURAN_SEKOLAH', 'PROMO', 'UMROH REGULER', 'UMROH MUSIM DINGIN', 'BINTANG 5'];
        setSortOrder(modesWithSort.includes(modeFromUrl) ? 'TANGGAL_TERDEKAT' : null);
      }
    }

    // Dynamic SEO: Update title & description
    if (agent) {
      document.title = `Jadwal Umroh Alhijaz | ${agent.name}`;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute('content', `Dapatkan info lengkap paket umrah Alhijaz Indowisata bersama ${agent.name}. Klik untuk konsultasi via WhatsApp.`);
      }
    } else {
      document.title = 'Jadwal Umroh - Alhijaz Indowisata';
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute('content', 'Cek jadwal dan harga paket Umroh Alhijaz Indowisata');
      }
    }
  }, []);

  // ── CAPI: get agent slug string ──
  const currentAgentSlug = useMemo(() => {
    if (!currentAgent) return '';
    return Object.entries(AGENTS_DATA).find(([, v]) => v === currentAgent)?.[0] || '';
  }, [currentAgent]);

  // ── CAPI: PageView event ──
  const capiPageViewFired = useState(false);
  useEffect(() => {
    if (!currentAgentSlug || capiPageViewFired[0]) return;
    capiPageViewFired[1](true);
    sendCapiEvent(currentAgentSlug, 'pageView');
    trackPublicEvent(currentAgentSlug, 'page_view', { path: window.location.pathname });
  }, [currentAgentSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── CAPI: Search event (debounced) ──
  useEffect(() => {
    if (!currentAgentSlug || !searchQuery.trim()) return;
    const timer = setTimeout(() => {
      sendCapiEvent(currentAgentSlug, 'search');
    }, 1000); // debounce 1s
    return () => clearTimeout(timer);
  }, [searchQuery, currentAgentSlug]);

  /**
   * Helper to build the URL path from current agent + filter mode.
   * On custom domain the host already identifies the agent, so slug is omitted.
   */
  const buildUrlPath = useCallback((mode: FilterMode) => {
    const agentSlug = isCustomDomain
      ? ''
      : currentAgent
        ? Object.entries(AGENTS_DATA).find(([, v]) => v === currentAgent)?.[0] || ''
        : '';
    const filterSlug = getFilterSlug(mode);

    if (agentSlug && filterSlug) return `/${agentSlug}/${filterSlug}`;
    if (agentSlug) return `/${agentSlug}`;
    if (filterSlug) return `/${filterSlug}`;
    return '/';
  }, [currentAgent, isCustomDomain]);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => !prev);
  };

  // New Time Filter States
  const [departureTimeRanges, setDepartureTimeRanges] = useState<TimeRange[]>([]);
  const [returnTimeRanges, setReturnTimeRanges] = useState<TimeRange[]>([]);

  // ============================================
  // Fetch Packages (triggered by year change)
  // ============================================
  const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 jam

  const fetchPackages = useCallback(async (yearCode: string, silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    
    // If silent (background refresh), force from API
    const result = silent
      ? await refreshPackages({ yearCode, silent: true })
      : await getPackages({ yearCode });
    
    if (result.success) {
      setPackages(result.packages);
      // Auto-populate hotel distance database from API data
      buildDatabaseFromPackages(result.packages);

      // If data came from stale cache, trigger background API refresh
      if (result.fromCache && !silent) {
        refreshPackages({ yearCode, silent: true }).then(freshResult => {
          if (freshResult.success) {
            setPackages(freshResult.packages);
            buildDatabaseFromPackages(freshResult.packages);
            console.log('[App] Background revalidation complete');
          }
        });
      }
    } else if (!silent) {
      // Only show error on non-silent fetches
      setError(result.error || 'Gagal memuat data');
      setPackages([]);
    }

    if (!silent) {
      setLoading(false);
    }
  }, []);

  // Initial fetch, cache init, and refetch on year change
  useEffect(() => {
    initFromCache(); // Load hotel distances from cache on startup
    fetchPackages(selectedYear);
  }, [selectedYear, fetchPackages]);

  // Auto-refresh from API every 1 hour
  useEffect(() => {
    const intervalId = setInterval(() => {
      console.log('[App] Auto-refresh triggered (1h interval)');
      fetchPackages(selectedYear, /* silent */ true);
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [selectedYear, fetchPackages]);

  // Auto-expand card from URL query param (?expand=<jadwalId>) — used when coming back from Kalkulasi
  useEffect(() => {
    if (loading || packages.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const expandId = params.get('expand');
    if (expandId) {
      const match = packages.find((p) => p.jadwalId === expandId);
      if (match) {
        setExpandedCardId(expandId);
        // Scroll to the card after rendering settles
        setTimeout(() => {
          const card = document.querySelector(`[data-jadwal-id="${expandId}"]`);
          card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 500);
      }
      // Clean up the URL params
      params.delete('expand');
      params.delete('transition');
      const cleanUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
      window.history.replaceState(null, '', cleanUrl);
    }
  }, [loading, packages]);

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

        // 4. Hotel Names (only check the cheapest/displayed tier)
        const matchHotel = (() => {
          // Find cheapest tier (same logic as PackageCard)
          let minPrice = Infinity;
          let minTier = Object.keys(pkg.harga)[0];
          for (const [tier, tierPricing] of Object.entries(pkg.harga)) {
            const prices = [tierPricing.Quard, tierPricing.Triple, tierPricing.Double];
            for (const priceStr of prices) {
              if (priceStr) {
                const val = parseInt(priceStr, 10);
                if (val > 0 && val < minPrice) { minPrice = val; minTier = tier; }
              }
            }
          }
          const displayedHotel = pkg.hotel[minTier];
          if (!displayedHotel) return false;
          const mekkahHotel = (displayedHotel as { mekkah_hotel?: string }).mekkah_hotel || '';
          const madinahHotel = (displayedHotel as { madinah_hotel?: string }).madinah_hotel || '';
          return mekkahHotel.toLowerCase().includes(query) || 
                 madinahHotel.toLowerCase().includes(query);
        })();

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

    // Apply sort order from sub-dropdown (AVAILABLE/PROMO)
    if (sortOrder) {
      result = sortPackages(result, sortOrder);
    } else if (!quickFilter || (quickFilter !== 'urgent' && quickFilter !== 'termurah')) {
      // Default: sort by departure date
      result.sort((a, b) => 
        new Date(a.keberangkatan.tgl).getTime() - new Date(b.keberangkatan.tgl).getTime()
      );
    }
    
    return result;
  }, [packages, filterMode, filterSecondaryValue, searchQuery, quickFilter, departureTimeRanges, returnTimeRanges, sortOrder]);

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
    setSortOrder('TANGGAL_TERDEKAT');
    setDepartureTimeRanges([]);
    setReturnTimeRanges([]);
    // Reset URL to default (no filter slug)
    window.history.replaceState(null, '', buildUrlPath('AVAILABLE'));
  };

  const handleFilterModeChange = (mode: FilterMode) => {
    setFilterMode(mode);
    setFilterSecondaryValue('');
    // Set default sort for modes with sort sub-dropdown
    const modesWithSort: FilterMode[] = ['AVAILABLE', 'LIBURAN_SEKOLAH', 'PROMO', 'UMROH REGULER', 'UMROH MUSIM DINGIN', 'BINTANG 5'];
    setSortOrder(modesWithSort.includes(mode) ? 'TANGGAL_TERDEKAT' : null);
    // Sync URL slug
    window.history.replaceState(null, '', buildUrlPath(mode));
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


  // Set document title & meta tags for single-package view
  useEffect(() => {
    if (!singlePackageId) return;
    const pkg = packages.find(p => p.jadwalId === singlePackageId);
    if (pkg) {
      const agentName = currentAgent?.name || '';
      const title = [pkg.nama, agentName, 'Alhijaz Indowisata'].filter(Boolean).join(' | ');
      document.title = title;

      // Update meta tags for share preview
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute('content', title);
      const metaDesc = document.querySelector('meta[name="description"]');
      const ogDesc = document.querySelector('meta[property="og:description"]');
      const desc = agentName
        ? `Info paket ${pkg.nama} bersama ${agentName}. Alhijaz Indowisata.`
        : `Info paket ${pkg.nama}. Alhijaz Indowisata.`;
      if (metaDesc) metaDesc.setAttribute('content', desc);
      if (ogDesc) ogDesc.setAttribute('content', desc);
    }
  }, [singlePackageId, packages, currentAgent]);


  // ============================================
  // Render
  // ============================================
  // ============================================
  // Single Package Mode (early return)
  // ============================================
  if (singlePackageId) {
    const singlePkg = packages.find(p => p.jadwalId === singlePackageId);
    const agentSlug = currentAgent
      ? Object.entries(AGENTS_DATA).find(([, v]) => v === currentAgent)?.[0] || ''
      : '';
    // On custom domain, host already identifies the agent — go to host root.
    const backHref = isCustomDomain ? '/' : (agentSlug ? `/${agentSlug}` : '/');

    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-950 transition-colors duration-300">
        {/* Back Header */}
        <div className="sticky top-0 z-30 backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-b border-gray-100 dark:border-slate-700/50">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
            <button
              type="button"
              disabled={isGoingBack}
              onClick={() => {
                setIsGoingBack(true);
                window.location.href = backHref;
              }}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100/80 dark:bg-slate-800/80 hover:bg-emerald-50 dark:hover:bg-slate-700/80 text-gray-500 dark:text-slate-400 hover:text-emerald-600 transition-all duration-300 active:scale-95"
              title="Kembali"
            >
              {isGoingBack ? <Loader2 size={18} className="animate-spin" /> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>}
            </button>
            <h1 className="text-base font-bold text-gray-800 dark:text-white truncate">Detail Paket</h1>
          </div>
        </div>

        <main className="max-w-lg mx-auto px-4 pt-4 pb-8">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-4 border-emerald-100"></div>
                <div className="w-12 h-12 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin absolute top-0 left-0"></div>
              </div>
              <p className="mt-4 text-gray-500 font-medium">Memuat paket...</p>
            </div>
          )}

          {!loading && !singlePkg && (
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-5 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-gray-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
              </div>
              <p className="text-gray-700 dark:text-white font-semibold text-lg mb-1">Paket tidak ditemukan</p>
              <p className="text-gray-400 text-sm mb-6">Paket yang Anda cari mungkin sudah tidak tersedia.</p>
              <button
                onClick={() => { window.location.href = agentSlug ? `/${agentSlug}` : '/'; }}
                className="px-5 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium hover:bg-emerald-600 active:scale-95 transition-all shadow-md shadow-emerald-500/20"
              >
                Lihat Semua Paket
              </button>
            </div>
          )}

          {!loading && singlePkg && (
            <PackageCard
              package={singlePkg}
              isExpanded={true}
              onToggle={() => {}}
              agent={currentAgent}
              isSingleView={true}
            />
          )}
        </main>

      </div>
    );
  }

  // ============================================
  // Normal Mode (full app)
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
        sortOrder={sortOrder}
        onYearChange={handleYearChange}
        onFilterModeChange={handleFilterModeChange}
        onSecondaryValueChange={handleSecondaryValueChange}
        onSortOrderChange={setSortOrder}
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onToggleFilter={() => setIsFilterModalOpen(true)}
        isFilterActive={!!quickFilter || departureTimeRanges.length > 0 || returnTimeRanges.length > 0}
        onClearFilter={() => {
          setQuickFilter(null);
          setDepartureTimeRanges([]);
          setReturnTimeRanges([]);
        }}
        isCompactView={isCompactView}
        onToggleCompact={toggleCompactView}
      />

      {/* ============================================ */}
      {/* MAIN CONTENT */}
      {/* ============================================ */}
      <main className="max-w-lg mx-auto px-4 pt-48 pb-8">
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
          <div className={isCompactView ? 'space-y-1.5' : 'space-y-3'}>
            {/* Package Cards */}
            {filteredPackages.map((pkg) => (
              isCompactView ? (
                <CompactCard
                  key={pkg.jadwalId}
                  package={pkg}
                  onToggle={() => setCompactDetailId(pkg.jadwalId)}
                  agent={currentAgent}
                />
              ) : (
                <PackageCard
                  key={pkg.jadwalId}
                  package={pkg}
                  isExpanded={expandedCardId === pkg.jadwalId}
                  onToggle={() => handleToggleCard(pkg.jadwalId)}
                  agent={currentAgent}
                />
              )
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
      {/* FILTER MODAL */}
      {/* ============================================ */}
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

      {/* ============================================ */}
      {/* FLOATING AGENT BAR (only in agent mode) */}
      {/* ============================================ */}
      {currentAgent && <FloatingAgentBar agent={currentAgent} />}

      {/* ============================================ */}
      {/* COMPACT DETAIL MODAL */}
      {/* ============================================ */}
      {compactDetailId && (() => {
        const detailPkg = filteredPackages.find(p => p.jadwalId === compactDetailId);
        if (!detailPkg) return null;
        return createPortal(
          <div
            className="fixed inset-0 z-[9999] flex flex-col"
          >
            {/* Full Screen Container */}
            <div className="relative flex-1 overflow-y-auto bg-gray-50 dark:bg-slate-900">
              {/* Full PackageCard */}
              <div className="max-w-lg mx-auto px-4 pt-4 pb-24">
                <PackageCard
                  package={detailPkg}
                  isExpanded={true}
                  onToggle={() => setCompactDetailId(null)}
                  agent={currentAgent}
                />
              </div>
            </div>

            {/* Floating Close Button — Bottom Center */}
            <div className="absolute bottom-6 left-0 right-0 flex justify-center z-20 pointer-events-none">
              <button
                onClick={() => setCompactDetailId(null)}
                className="
                  pointer-events-auto
                  flex items-center gap-2
                  px-6 py-3 rounded-full
                  bg-gray-900/90 dark:bg-white/90
                  text-white dark:text-gray-900
                  font-semibold text-sm
                  shadow-lg shadow-black/20
                  hover:bg-gray-800 dark:hover:bg-white
                  active:scale-95
                  transition-all duration-200
                  backdrop-blur-sm
                "
                aria-label="Tutup"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                Tutup
              </button>
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
}

export default App;
