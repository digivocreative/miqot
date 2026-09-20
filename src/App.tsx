import { useEffect, useLayoutEffect, useState, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PackageCard, CompactCard, FilterHeader, FilterModal, type QuickFilterType, type TimeRange } from '@/components';
import { getPackages, refreshPackages, isPackagesCacheFresh, type GetPackagesResult } from '@/services';
import {
  filterPackages,
  sortPackages,
  buildFilterSlug,
  resolveFilterSlug,
  filterModeLabel,
  filterDimension,
  buildFilterSearch,
  parseFilterSearch,
  URGENT_SEAT_THRESHOLD,
  MODES_WITH_SORT,
  MODES_WITH_AVAILABILITY_TOGGLE,
  type FilterMode,
  type SortOrder,
} from '@/utils';
import { getLandingAirportCode, getLandingCityName } from '@/utils/journey';
import { packageTypeLabel } from '@/lib/packageType';
import { buildFilterShareMeta } from '../lib/filter-share-meta.js';
import { customDomainSlugFrom, isViaCustomDomain, readAgentContext } from '@/lib/agent-context';
import type { UmrohPackage } from '@/types';
import { AGENTS_DATA, loadAgentsFromSupabase, type AgentData } from '@/data/agents';
import { initFromCache, buildDatabaseFromPackages } from '@/data/hotelService';
import { beginProgrammaticScroll, endProgrammaticScroll } from '@/lib/programmatic-scroll';
import { captureListAnchor, restoreListAnchor, type ListAnchor } from '@/lib/list-scroll-anchor';
import FloatingAgentBar from '@/components/FloatingAgentBar';
import { AnimatePresence } from 'framer-motion';
import { useWideLayout } from '@/hooks/useWideLayout';
import RailShell from '@/components/jadwal-rails/RailShell';
import ItineraryRail from '@/components/jadwal-rails/ItineraryRail';
import DetailRail from '@/components/jadwal-rails/DetailRail';
import { Loader2 } from 'lucide-react';
import { sendCapiEvent } from '@/lib/capi';
import { trackPublicEvent } from '@/utils/analytics';
import { describeLoadError } from '@/lib/loadError';
import { useBackToClose } from '@/hooks/useBackToClose';
import PortalJamaahRouter from '@/components/portal-jamaah/PortalJamaahRouter';
import PullToRefresh from '@/components/pwa/PullToRefresh';
import { hasInAppHistory } from './lib/appHistory';

function getLocalStorageItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setLocalStorageItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // unavailable storage should not block public schedule rendering
  }
}


/**
 * Refresh latar TERAKHIR yang gagal (revalidasi data tersimpan, interval 30 menit,
 * atau "Coba lagi"). Dibuang begitu ada refresh yang berhasil.
 */
interface RefreshFailure {
  /** Pesan mentah data-service — hanya untuk describeLoadError, jangan dirender. */
  error?: string;
  /** Kapan data yang sedang tampil terakhir diambil dari server (epoch ms). */
  dataFetchedAt: number | null;
  /** Data yang tampil sudah melewati TTL cache: kursi & harga bisa sudah berubah. */
  stale: boolean;
}

function isStaleNoticeVisible(failure: RefreshFailure | null): failure is RefreshFailure & { dataFetchedAt: number } {
  return !!failure && failure.stale && failure.dataFetchedAt !== null;
}

/** "14.05" kalau hari ini, "16 Sep, 14.05" kalau datanya dari hari lain. */
function formatDataTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Pita kecil di bawah header: data yang tampil dari simpanan lokal dan refresh-nya gagal. */
function StaleDataNotice({ fetchedAt, retrying, onRetry }: { fetchedAt: number; retrying: boolean; onRetry: () => void }) {
  return (
    <div
      role="status"
      data-stale-data-notice
      className="mb-3 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <p className="min-w-0 flex-1 leading-snug">
        {/* nowrap: di HP sempit baris patah SEBELUM "diperbarui", bukan di tengah "16 Sep, 20.36" */}
        Menampilkan data tersimpan · <span className="whitespace-nowrap">diperbarui {formatDataTime(fetchedAt)}</span>
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="relative touch-hit shrink-0 font-semibold text-amber-900 hover:underline disabled:opacity-60 disabled:no-underline dark:text-amber-100"
      >
        {retrying ? 'Memuat…' : 'Coba lagi'}
      </button>
    </div>
  );
}

// ============================================
// Main App Component
// ============================================

function App({ singlePackageId }: { singlePackageId?: string | null }) {
  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  const portalSlug = pathSegments[0]?.toLowerCase();
  const isPortalJamaah = pathSegments[1] === 'jamaah';

  if (isPortalJamaah) {
    if (portalSlug && AGENTS_DATA[portalSlug]) {
      return <PortalJamaahRouter slug={portalSlug} subPath={pathSegments.slice(2)} />;
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 font-sans">
        <section className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-950">Agent tidak ditemukan</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Pastikan alamat portal yang Anda buka sudah benar.</p>
        </section>
      </div>
    );
  }

  // ============================================
  // Data State
  // ============================================
  const [packages, setPackages] = useState<UmrohPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Refresh latar gagal (lihat RefreshFailure) + revalidasi yang sedang jalan.
  const [refreshFailure, setRefreshFailure] = useState<RefreshFailure | null>(null);
  const [revalidating, setRevalidating] = useState(false);
  /** Kapan data di layar diambil dari server — sumber "diperbarui <jam>" di pita data tersimpan. */
  const dataFetchedAtRef = useRef<number | null>(null);

  // ============================================
  // Filter State
  // ============================================
  const [selectedYear, setSelectedYear] = useState('1448');
  const [filterMode, setFilterMode] = useState<FilterMode>('AVAILABLE');
  // Mode aktif untuk handler yang dipanggil di event yang SAMA dengan pergantian
  // mode (lihat handleSecondaryValueChange) — di sana state closure masih basi.
  const filterModeRef = useRef<FilterMode>('AVAILABLE');
  filterModeRef.current = filterMode;
  // URL baru boleh ditulis ulang SETELAH filter dari URL selesai dibaca.
  // Tanpa gerbang ini, efek sinkron di bawah jalan lebih dulu dengan state
  // bawaan dan menghapus ?landing=/?cepat= dari link yang baru saja dibuka.
  const urlSyncReadyRef = useRef(false);
  const [filterSecondaryValue, setFilterSecondaryValue] = useState('');
  // Tombol "hanya seat tersedia" (baris Cari). Bawaannya mati: mode berdimensi
  // memuat paket habis, dan tombol ini jalan keluar buat menyempitkannya.
  const [availableOnly, setAvailableOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [quickFilter, setQuickFilter] = useState<QuickFilterType | null>(null);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder | null>('TANGGAL_TERDEKAT');
  const [compactDetailId, setCompactDetailId] = useState<string | null>(null);
  const [isGoingBack, setIsGoingBack] = useState(false);
  const [isCompactView, setIsCompactView] = useState(() => {
    return getLocalStorageItem('compactView') === 'true';
  });

  const toggleCompactView = useCallback(() => {
    setIsCompactView(prev => {
      const next = !prev;
      setLocalStorageItem('compactView', next.toString());
      return next;
    });
  }, []);

  // ============================================
  // Dark Mode State
  // ============================================
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check localStorage first
    const savedMode = getLocalStorageItem('darkMode');
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
    setLocalStorageItem('darkMode', isDarkMode.toString());
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
    };
  });

  // Custom-domain context injected by the server into window.__AGENT_CONTEXT__.
  // Kesimpulan "disajikan lewat custom domain" WAJIB lewat helper bersama — ia
  // memakai flag eksplisit dari server, bukan ada/tidaknya field `customDomain`
  // (yang terisi juga di alhijaz.co). Lihat src/lib/agent-context.js.
  const serverAgentContext = readAgentContext();
  const isCustomDomain = isViaCustomDomain(serverAgentContext);
  const customDomainSlug = customDomainSlugFrom(serverAgentContext);

  // Load agents from Supabase on mount.
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
      if (possibleAgent) setCurrentAgent(possibleAgent);
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
      if (!agent && serverAgentContext) {
        agent = {
          name: serverAgentContext.name,
          website: serverAgentContext.website || '',
          phone: serverAgentContext.phone || '',
          photo: serverAgentContext.photo || '',
        };
      }
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

    if (agent) {
      setCurrentAgent(agent);
    } else if (!customDomainSlug) {
      setCurrentAgent(null);
    }

    // Filter dari URL: mode ada di segmen path, seluruh sisanya di query
    // (?tipe/?landing/?bulan/?durasi/?cepat/?berangkat/?pulang/?urut — lihat
    // src/utils/filter-url.ts). Query dibaca TANPA syarat slug: /nikita?cepat=promo
    // itu link yang sah, dan filter sheet tidak punya slug sendiri.
    const parsedUrl = parseFilterSearch(window.location.search);
    setQuickFilter(parsedUrl.quickFilter);
    setDepartureTimeRanges(parsedUrl.departureRanges);
    setReturnTimeRanges(parsedUrl.returnRanges);
    // Slug lama (mis. /umroh-promo) membawa preset tipe paket — lihat
    // LEGACY_FILTER_SLUGS di src/utils/filter-logic.ts.
    const resolvedFromSlug = filterSlugFromUrl ? resolveFilterSlug(filterSlugFromUrl) : null;

    // Flag ?tersedia hanya sah di mode yang benar-benar merender tombolnya.
    // Tanpa gerbang ini link `/nikita?tersedia` menghidupkan state saringan yang
    // tombolnya tidak ada di layar — tak ada cara mematikannya.
    setAvailableOnly(
      parsedUrl.availableOnly &&
      MODES_WITH_AVAILABILITY_TOGGLE.includes(resolvedFromSlug?.mode ?? 'AVAILABLE'),
    );

    if (filterSlugFromUrl) {
      if (resolvedFromSlug) {
        const resolved = resolvedFromSlug;
        filterModeRef.current = resolved.mode;
        setFilterMode(resolved.mode);
        // Sub-nilai dari query menang atas preset slug: itu yang ditulis saat
        // user memilih sendiri, jadi URL yang di-share tidak pernah berbohong.
        const secondary = parsedUrl.secondary[resolved.mode] || resolved.secondaryValue;
        if (secondary) setFilterSecondaryValue(secondary);
        setSortOrder(
          parsedUrl.sortOrder ?? (MODES_WITH_SORT.includes(resolved.mode) ? 'TANGGAL_TERDEKAT' : null),
        );
      }
    } else if (parsedUrl.sortOrder) {
      setSortOrder(parsedUrl.sortOrder);
    }

    // Mulai sekarang URL boleh ditulis ulang dari state (lihat efek sinkron URL).
    urlSyncReadyRef.current = true;

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
   * Helper to build the URL path from current agent + filter.
   * On custom domain the host already identifies the agent, so slug is omitted.
   *
   * Mode DAN sub-nilainya menyatu di satu segmen (`/nikita/landing-madinah`) —
   * lihat buildFilterSlug di src/utils/filter-logic.ts.
   */
  const buildUrlPath = useCallback((mode: FilterMode, secondaryValue?: string) => {
    const agentSlug = isCustomDomain
      ? ''
      : currentAgent
        ? Object.entries(AGENTS_DATA).find(([, v]) => v === currentAgent)?.[0] || ''
        : '';
    const filterSlug = buildFilterSlug(mode, secondaryValue);

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

  /**
   * SATU-SATUNYA penulis URL untuk filter.
   *
   * Efek, bukan handler: dropdown mode memanggil onSecondaryValueChange('') di
   * event yang SAMA persis setelah onFilterModeChange, jadi handler mana pun
   * melihat state yang basi — dulu itu membuat pindah Tipe Paket → Landing
   * menulis balik URL ke /tipe-paket. Efek jalan setelah kedua state duduk,
   * jadi path + query selalu menggambarkan filter yang benar-benar aktif.
   *
   * replaceState (bukan push): filter bukan langkah navigasi, dan tombol Back
   * harus mengembalikan pengunjung ke halaman sebelumnya, bukan menelusuri
   * setiap pilihan filter.
   *
   * history.state DIPERTAHANKAN, bukan null: sheet Filter menulis filter selagi
   * terbuka, dan entri riwayatnya (useBackToClose) menyimpan token di state.
   * Token terhapus = menutup sheet tidak membuang entrinya, jadi back berikutnya
   * "kosong" dan URL mundur ke filter lama.
   */
  const filterUrlRef = useRef<string | null>(null);
  const writeFilterUrl = useCallback((next: string) => {
    filterUrlRef.current = next;
    if (next === `${window.location.pathname}${window.location.search}`) return;
    window.history.replaceState(window.history.state, '', next);
  }, []);

  useEffect(() => {
    if (!urlSyncReadyRef.current) return;
    // Tampilan satu paket (/{agent}/{jadwalId}) memakai path yang sama sekali
    // bukan path filter — menulisinya akan menghapus deep link paketnya.
    if (singlePackageId) return;
    const path = buildUrlPath(filterMode, filterSecondaryValue);
    const search = buildFilterSearch({
      availableOnly,
      quickFilter,
      departureRanges: departureTimeRanges,
      returnRanges: returnTimeRanges,
      sortOrder,
    });
    writeFilterUrl(`${path}${search}`);
  }, [
    writeFilterUrl,
    buildUrlPath,
    singlePackageId,
    filterMode,
    filterSecondaryValue,
    availableOnly,
    quickFilter,
    departureTimeRanges,
    returnTimeRanges,
    sortOrder,
  ]);

  // Overlay yang ditutup (back Android, atau tombol yang membuang entrinya lewat
  // history.back()) mendaratkan riwayat di entri SEBELUM overlay dibuka — URL-nya
  // masih filter lama kalau filter diubah dari dalam sheet. Filter bukan state
  // riwayat, jadi URL-lah yang mengikuti state, bukan sebaliknya.
  useEffect(() => {
    if (singlePackageId) return;
    const onPopState = () => {
      if (filterUrlRef.current) writeFilterUrl(filterUrlRef.current);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [singlePackageId, writeFilterUrl]);

  /**
   * Telemetri filter. Sebelum ini halaman jadwal hanya melaporkan page_view dan
   * klik WA, jadi tidak ada satu pun data tentang filter mana yang dipakai —
   * setiap keputusan produk soal filter jadi tebakan. Event publik (keyed by
   * slug agent) karena pengunjungnya jamaah, bukan agent yang login.
   */
  const trackFilterChange = useCallback((filter: string, value: string) => {
    if (!currentAgentSlug) return;
    trackPublicEvent(currentAgentSlug, 'jadwal_filter', { filter, value: value || '(kosong)' });
  }, [currentAgentSlug]);

  // ============================================
  // Fetch Packages (triggered by year change)
  // ============================================
  const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 menit

  /**
   * Refresh latar menukar SELURUH array packages. Kalau data segar menjatuhkan
   * paket yang posisinya di atas viewport (kursi habis → tersaring keluar mode
   * AVAILABLE), seluruh kartu di bawahnya naik — terukur 524px untuk dua kartu,
   * dua pertiga layar, tepat saat pengguna mulai menggulir.
   *
   * Jadi setiap penerapan hasil latar mencatat kartu jangkar DULU (sinkron,
   * selagi DOM masih daftar lama), lalu useLayoutEffect di bawah meluruskannya
   * kembali sebelum paint. Muatan datanya tidak ditunda sedikit pun — yang
   * diredam cuma pergeserannya.
   */
  const pendingAnchorRef = useRef<ListAnchor | null>(null);

  const applyPackages = useCallback((next: UmrohPackage[], preserveScroll: boolean) => {
    if (preserveScroll) pendingAnchorRef.current = captureListAnchor();
    setPackages(next);
    // Auto-populate hotel distance database from API data
    buildDatabaseFromPackages(next);
  }, []);

  /**
   * Satu pintu status refresh latar. Pita "data tersimpan" menyisip/lepas di ATAS
   * daftar, jadi aturannya sama dengan swap paket: kartu yang sedang dibaca di
   * tengah daftar tidak boleh ikut terdorong. Di puncak halaman sengaja dibiarkan
   * mendorong — di sana pitanya justru yang harus terlihat, bukan digulir keluar.
   * Jangkar hanya dicatat kalau keterlihatan pita BENAR-BENAR berubah: jangkar yang
   * tak pernah dikonsumsi useLayoutEffect akan meluruskan swap berikutnya ke posisi
   * basi.
   */
  const staleNoticeShownRef = useRef(false);
  const updateRefreshFailure = useCallback((next: RefreshFailure | null) => {
    const willShow = isStaleNoticeVisible(next);
    if (willShow !== staleNoticeShownRef.current) {
      staleNoticeShownRef.current = willShow;
      if (window.scrollY > 0) pendingAnchorRef.current = captureListAnchor();
    }
    setRefreshFailure(next);
  }, []);
  const staleNoticeVisible = isStaleNoticeVisible(refreshFailure);

  useLayoutEffect(() => {
    const anchor = pendingAnchorRef.current;
    if (!anchor) return;
    pendingAnchorRef.current = null;

    // Tandai sebagai scroll programatik supaya auto-hide FilterHeader &
    // FloatingAgentBar tidak membacanya sebagai gestur user lalu menoggle overlay.
    // Keduanya digas rAF, jadi penandanya harus bertahan beberapa frame — bukan
    // dilepas seketika di baris berikutnya.
    beginProgrammaticScroll();
    try {
      restoreListAnchor(anchor);
    } finally {
      window.setTimeout(endProgrammaticScroll, 150);
    }
  }, [packages, staleNoticeVisible]);

  /** Hasil sukses menghapus pita & galat; gagal dicatat — pita menyala kalau data di layar sudah basi. */
  const noteRefreshResult = useCallback((yearCode: string, result: GetPackagesResult) => {
    if (result.success) {
      dataFetchedAtRef.current = Date.now() - (result.cacheAge ?? 0);
      setError(null);
      updateRefreshFailure(null);
      return;
    }
    updateRefreshFailure({
      error: result.error,
      dataFetchedAt: dataFetchedAtRef.current,
      stale: !isPackagesCacheFresh(yearCode),
    });
  }, [updateRefreshFailure]);

  /** Tarik data segar di latar tanpa mengosongkan daftar (revalidasi cache, "Coba lagi"). */
  const revalidatePackages = useCallback(async (yearCode: string) => {
    setRevalidating(true);
    try {
      const fresh = await refreshPackages({ yearCode, silent: true });
      if (fresh.success) {
        applyPackages(fresh.packages, /* preserveScroll */ true);
        console.log('[App] Background revalidation complete');
      }
      noteRefreshResult(yearCode, fresh);
    } finally {
      setRevalidating(false);
    }
  }, [applyPackages, noteRefreshResult]);

  const fetchPackages = useCallback(async (yearCode: string, silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
      updateRefreshFailure(null);
    }

    // If silent (background refresh), force from API.
    // Non-silent: serve any cache (fresh OR stale) instantly so the listing paints
    // without a blocking spinner; the `fromCache` branch below revalidates stale
    // data in the background (one fetch, off the critical path).
    const result = silent
      ? await refreshPackages({ yearCode, silent: true })
      : await getPackages({ yearCode, nonBlockingStale: true });

    if (result.success) {
      // Muatan non-silent mengganti daftar yang baru saja dikosongkan spinner
      // (atau daftar kosong saat mount) — tidak ada jangkar yang perlu dijaga.
      // Refresh interval 30 menit menukar daftar di bawah mata pengguna: jaga.
      applyPackages(result.packages, /* preserveScroll */ silent);
      noteRefreshResult(yearCode, result);

      // If data came from cache, revalidate against the API in the background
      if (result.fromCache && !silent) {
        void revalidatePackages(yearCode);
      }
    } else if (!silent) {
      // Only show error on non-silent fetches
      setError(result.error || 'Gagal memuat data');
      setPackages([]);
    } else {
      // Interval 30 menit gagal: data di layar makin tua tanpa ada yang memberi tahu.
      noteRefreshResult(yearCode, result);
    }

    if (!silent) {
      setLoading(false);
    }
  }, [applyPackages, noteRefreshResult, revalidatePackages, updateRefreshFailure]);

  // Initial fetch, cache init, and refetch on year change
  useEffect(() => {
    initFromCache(); // Load hotel distances from cache on startup
    fetchPackages(selectedYear);
  }, [selectedYear, fetchPackages]);

  // Auto-refresh from API every 30 minutes
  useEffect(() => {
    const intervalId = setInterval(() => {
      console.log('[App] Auto-refresh triggered (30m interval)');
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
      // Bersih-bersih ?expand/?transition. Query filter DIRAKIT ULANG lewat
      // builder yang sama dengan efek sinkron — kalau memakai
      // params.toString(), koma kembali jadi %2C dan flag `?promo` jadi
      // `?promo=`, persis bentuk berantakan yang sudah ditinggalkan.
      const from = params.get('from');
      const search = buildFilterSearch({
        availableOnly,
        quickFilter,
        departureRanges: departureTimeRanges,
        returnRanges: returnTimeRanges,
        sortOrder,
      });
      const fromPart = from ? `${search ? '&' : '?'}from=${encodeURIComponent(from)}` : '';
      window.history.replaceState(null, '', `${window.location.pathname}${search}${fromPart}`);
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
      availableOnly,
    });

    // Apply Time Filters
    if (departureTimeRanges.length > 0) {
      result = result.filter(pkg => isTimeInRanges(pkg.keberangkatan.jam, departureTimeRanges));
    }
    if (returnTimeRanges.length > 0) {
      result = result.filter(pkg => isTimeInRanges(pkg.kepulangan.jam, returnTimeRanges));
    }

    // Filter cepat (bottom sheet). Keduanya MENYARING, tidak mengurutkan:
    // urutan tetap milik dropdown Urutkan, jadi "Promo termurah" mungkin.
    if (quickFilter === 'promo') {
      result = result.filter(pkg => pkg.isPromo);
    } else if (quickFilter === 'urgent') {
      result = result.filter(pkg => pkg.seatSisa > 0 && pkg.seatSisa <= URGENT_SEAT_THRESHOLD);
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

        // 3. Landing City — lewat helper yang sama dengan kartu & filter.
        // Dulu `rute.split(' - ')[1]`: untuk rute multi-leg ("CGK-DXB/DXB-MED",
        // 18 dari 44 paket) hasilnya undefined, dan untuk rute tunggal hanya
        // kodenya — mengetik "jeddah" tidak pernah cocok, hanya "jed".
        const matchLanding =
          getLandingAirportCode(pkg).toLowerCase().includes(query) ||
          getLandingCityName(pkg).toLowerCase().includes(query);

        // 3b. Kode paket (JBU1589) — dipakai agent saat koordinasi internal.
        const matchPackageId = pkg.jadwalId.toLowerCase().includes(query);

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

        return matchName || matchPackageId || matchAirline || matchFlightCode || matchLanding || matchHotel || matchDate || matchRawDate;
      });
    }

    // Urutan: dropdown Urutkan kalau ada, selain itu tanggal berangkat terdekat.
    // Filter cepat tidak lagi ikut mengurutkan, jadi tidak ada pengecualian.
    if (sortOrder) {
      result = sortPackages(result, sortOrder);
    } else {
      result = [...result].sort((a, b) =>
        new Date(a.keberangkatan.tgl).getTime() - new Date(b.keberangkatan.tgl).getTime()
      );
    }
    
    return result;
  }, [packages, filterMode, filterSecondaryValue, availableOnly, searchQuery, quickFilter, departureTimeRanges, returnTimeRanges, sortOrder]);

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
    setAvailableOnly(false);
    // URL menyusul lewat efek sinkron di atas.
  };

  const handleFilterModeChange = (mode: FilterMode) => {
    filterModeRef.current = mode;
    setFilterMode(mode);
    setFilterSecondaryValue('');
    // Set default sort for modes with sort sub-dropdown
    setSortOrder(MODES_WITH_SORT.includes(mode) ? 'TANGGAL_TERDEKAT' : null);
    // Toggle "hanya seat tersedia" hidup hanya selama tombolnya terlihat. Kalau
    // nilainya disimpan diam-diam, user kembali ke mode berdimensi dan mendapati
    // daftarnya pendek karena saringan yang tombolnya sempat hilang dari layar.
    // Pindah antar mode yang SAMA-SAMA punya tombol tidak mereset.
    if (!MODES_WITH_AVAILABILITY_TOGGLE.includes(mode)) setAvailableOnly(false);
    trackFilterChange('mode', mode);
  };

  const handleToggleAvailableOnly = () => {
    const next = !availableOnly;
    setAvailableOnly(next);
    trackFilterChange('tersedia', next ? 'on' : 'off');
  };

  const handleSecondaryValueChange = (value: string) => {
    setFilterSecondaryValue(value);
    // Lewat ref, BUKAN state: dropdown mode memanggil onSecondaryValueChange('')
    // di event yang SAMA persis setelah onFilterModeChange, jadi `filterMode` di
    // closure masih mode LAMA di titik ini.
    if (!value) return; // reset saat ganti mode — bukan pilihan user
    trackFilterChange(filterDimension(filterModeRef.current), value);
  };

  const handleQuickFilterChange = (next: QuickFilterType | null) => {
    setQuickFilter(next);
    trackFilterChange('cepat', next || '');
  };

  const handleDepartureRangeChange = (ranges: TimeRange[]) => {
    setDepartureTimeRanges(ranges);
    trackFilterChange('berangkat', ranges.join(','));
  };

  const handleReturnRangeChange = (ranges: TimeRange[]) => {
    setReturnTimeRanges(ranges);
    trackFilterChange('pulang', ranges.join(','));
  };

  const handleSortOrderChange = (order: SortOrder | null) => {
    setSortOrder(order);
    trackFilterChange('urut', order || '');
  };

  // Saat pindah kartu (A terbuka → tap B), panel A ditutup INSTAN (prop
  // instantCollapse di PackageCard) dan pergeserannya dikompensasi atomik oleh
  // ResizeObserver (jalan setelah layout, sebelum paint) supaya kartu B tidak
  // bergerak sama sekali — satu-satunya gerakan yang terlihat adalah panel B yang
  // membuka. Kalau ikut dianimasikan, menutupnya panel A (~1200px) membuat seluruh
  // konten di atasnya mengalir deras di viewport: itu yang terasa
  // "lompat-lompatan" meski kartu yang di-tap sendiri diam.
  // Bila header kartu B ada di bagian bawah layar (kontennya bakal membuka di
  // bawah fold), anchor-nya digeser perlahan ke dekat atas viewport (glide rAF)
  // supaya yang membuka langsung terlihat.
  // Baca state via ref: memo PackageCard mengabaikan onToggle, jadi closure
  // handleToggleCard di kartu bisa basi.
  const cardAnchorCleanupRef = useRef<(() => void) | null>(null);
  const expandedCardIdRef = useRef<string | null>(null);
  expandedCardIdRef.current = expandedCardId;
  const [instantCollapseId, setInstantCollapseId] = useState<string | null>(null);

  // >=1024px: kartu tidak memuai, detailnya pindah ke rail kiri/kanan.
  // Dipanggil di sini karena hook wajib jalan di setiap render — di bawah ada
  // early return untuk halaman Detail Paket.
  const isWide = useWideLayout();

  const GLIDE_TRIGGER_RATIO = 0.62; // header di bawah 62% tinggi layar → glide
  const GLIDE_TARGET_GAP = 12;      // jarak header kartu dari dasar header fixed
  const GLIDE_DURATION_MS = 500;    // seirama animasi expand panel (spring ~0.55s di PackageCard)

  const anchorCardDuringToggle = (closingId: string, openingId: string) => {
    cardAnchorCleanupRef.current?.();
    const closingPanel = document.querySelector(`[data-jadwal-id="${closingId}"] [data-expand-panel]`);
    const card = document.querySelector(`[data-jadwal-id="${openingId}"]`);
    if (!closingPanel || !card) return;

    const startTop = card.getBoundingClientRect().top;
    const glide = startTop > window.innerHeight * GLIDE_TRIGGER_RATIO;
    // Tinggi header fixed diukur saat tap (bisa 55px collapsed atau 181px expanded;
    // supresi overlay membekukannya selama glide, jadi nilai ini stabil).
    const glideTargetTop = (document.querySelector('header')?.getBoundingClientRect().bottom ?? 56) + GLIDE_TARGET_GAP;
    // anchorTop bergeser selama glide; RO (atomik, utk collapse instan) dan loop
    // glide sama-sama mengoreksi posisi kartu ke nilai ini.
    let anchorTop = startTop;
    let rafId: number | null = null;

    const correct = () => {
      const delta = card.getBoundingClientRect().top - anchorTop;
      if (delta !== 0) window.scrollBy(0, delta);
    };

    const observer = new ResizeObserver(() => {
      if (!card.isConnected) {
        cleanup();
        return;
      }
      correct();
    });
    beginProgrammaticScroll();
    let cleanedUp = false;
    const timer = setTimeout(() => cleanup(), 750); // window kompensasi + margin (> glide 500ms + settle spring)
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
      clearTimeout(timer);
      endProgrammaticScroll();
      cardAnchorCleanupRef.current = null;
    };
    cardAnchorCleanupRef.current = cleanup;
    observer.observe(closingPanel);

    if (glide) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        anchorTop = glideTargetTop;
        correct();
        return;
      }
      const glideStart = performance.now();
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
      const step = () => {
        if (!card.isConnected) {
          cleanup();
          return;
        }
        const t = Math.min(1, (performance.now() - glideStart) / GLIDE_DURATION_MS);
        anchorTop = startTop + (glideTargetTop - startTop) * easeOutCubic(t);
        correct();
        rafId = t < 1 ? requestAnimationFrame(step) : null;
      };
      rafId = requestAnimationFrame(step);
    }
  };

  const handleToggleCard = (id: string) => {
    const currentId = expandedCardIdRef.current;

    if (currentId !== null && currentId !== id) {
      // Pindah kartu: kartu lama menutup instan, hanya kartu baru yang beranimasi.
      setInstantCollapseId(currentId);
      anchorCardDuringToggle(currentId, id);
    } else {
      setInstantCollapseId(null);
      if (currentId === id) {
        // Menutup kartu tanpa membuka yang lain: dekat dasar halaman, docHeight yang
        // menyusut membuat browser meng-clamp scrollY — terbaca "scroll naik" oleh
        // overlay auto-hide. Supresi HANYA bila clamp memang akan terjadi (jarak ke
        // dasar < tinggi panel), supaya gestur user normal tetap responsif.
        const panel = document.querySelector(`[data-jadwal-id="${id}"] [data-expand-panel]`);
        const panelH = panel?.getBoundingClientRect().height ?? 0;
        const distanceToBottom = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
        if (panelH > 0 && distanceToBottom < panelH + 100) {
          beginProgrammaticScroll();
          setTimeout(endProgrammaticScroll, 600);
        }
      }
    }
    setExpandedCardId(prevId => prevId === id ? null : id);
  };

  // Rail terbuka = momen agent mulai menjelaskan satu paket. Event PUBLIK
  // (keyed by slug agent) karena yang melihat layar adalah jamaah, bukan agent
  // yang login — trackEvent butuh sesi agent dan akan gagal di sini.
  const railOpenedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!isWide || !expandedCardId || !currentAgentSlug) return;
    if (railOpenedFor.current === expandedCardId) return;
    railOpenedFor.current = expandedCardId;
    trackPublicEvent(currentAgentSlug, 'jadwal_rail_open', { paket: expandedCardId });
  }, [isWide, expandedCardId, currentAgentSlug]);

  // Escape membatalkan pilihan di layar lebar. Di bawah 1024px tombol ini tidak
  // dipasang sama sekali — menutup kartu di sana punya kompensasi gulirnya sendiri.
  useEffect(() => {
    if (!isWide || !expandedCardId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedCardId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isWide, expandedCardId]);

  // Detail Tampilan Ringkas menutupi seluruh layar: back Android/iOS menutupnya,
  // bukan meninggalkan halaman jadwal di baliknya.
  const closeCompactDetail = useCallback(() => setCompactDetailId(null), []);
  useBackToClose(compactDetailId !== null, closeCompactDetail);

  // Dipulihkan dari back-forward cache (back Android/iOS, atau tombol Kembali
  // Kalkulasi/Bandingkan yang kini memakai history.back()): DOM kembali persis
  // seperti saat ditinggal — termasuk body.navigating dari tirai transisi
  // PackageCard, yang menutup halaman dengan lapisan buram tak bisa diketuk.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      document.body.classList.remove('navigating');
      setIsGoingBack(false);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const handleResetFilters = () => {
    setFilterMode('AVAILABLE');
    setFilterSecondaryValue('');
    setSearchQuery('');
    setQuickFilter(null);
    setDepartureTimeRanges([]);
    setReturnTimeRanges([]);
    setAvailableOnly(false);
  };


  // Dynamic SEO — judul tab & description mengikuti filter yang sedang aktif.
  //
  // Server sudah menulis meta yang benar untuk muat pertama (SPA fallback di
  // server.js), termasuk kartu OG-nya. Efek ini menangani apa yang SSR TIDAK
  // bisa jangkau: pengguna berpindah filter tanpa reload. Ia memakai modul yang
  // SAMA dengan server supaya judul tab dan kartu WhatsApp tidak pernah
  // menyebut filter yang sama dengan dua nama berbeda.
  //
  // Dulu blok ini duduk di dalam efek pembaca URL — jalan SEKALI saat mount,
  // jadi judulnya selalu judul agent generik dan menimpa judul filter dari SSR
  // sedetik setelah halaman tampil.
  //
  // Paket tunggal punya efeknya sendiri yang lebih spesifik; digerbang di sini
  // supaya keduanya tidak berebut document.title.
  useEffect(() => {
    if (singlePackageId) return;
    const agentName = currentAgent?.name || '';
    const filterSlug = buildFilterSlug(filterMode, filterSecondaryValue);
    const meta = buildFilterShareMeta({ filterSlug, agentName });

    document.title = meta?.title
      || (agentName ? `Jadwal Umroh Alhijaz | ${agentName}` : 'Jadwal Umroh - Alhijaz Indowisata');
    const description = meta?.description
      || (agentName
        ? `Dapatkan info lengkap paket umrah Alhijaz Indowisata bersama ${agentName}. Klik untuk konsultasi via WhatsApp.`
        : 'Cek jadwal dan harga paket Umroh Alhijaz Indowisata');
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [singlePackageId, currentAgent, filterMode, filterSecondaryValue]);

  // Set document title & meta tags for single-package view.
  // Hanya CADANGAN: server sudah menulis judul, deskripsi, dan kartu OG paket
  // (renderPackageShareSSR di server.js) untuk setiap jadwal yang ada di DB —
  // menimpanya di sini cuma membuat judul tab berkedip ganti bentuk. Yang tersisa
  // untuk ditangani di klien adalah paket yang SSR-nya menyerah (kode tak ada di
  // umroh_schedules) dan halaman jatuh ke meta generik milik agent.
  useEffect(() => {
    if (!singlePackageId) return;
    if (document.querySelector('meta[property="og:image"][content*="/og/paket/"]')) return;
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

    // Paket tak ada di data tersimpan (link paket baru dari WhatsApp, cache lama):
    // selagi revalidasi jalan, jangan buru-buru bilang "tidak ditemukan".
    const showSingleLoader = loading || (!singlePkg && revalidating);
    // "Tidak ditemukan" hanya sah kalau datanya BERHASIL dimuat dari server. Muat
    // awal gagal, atau paketnya tak ada di data tersimpan dan refresh gagal, belum
    // membuktikan apa-apa — itu gagal muat (sinyal buruk, server down).
    const singleLoadFailed = !showSingleLoader && !singlePkg && (error !== null || refreshFailure !== null);
    const retrySingleLoad = () => {
      if (error !== null) fetchPackages(selectedYear);
      else void revalidatePackages(selectedYear);
    };

    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-slate-950 dark:to-black transition-colors duration-300">
        {/* Back Header — pt safe-area: app terpasang di iOS digambar di bawah status bar */}
        <div className="sticky top-0 z-30 pt-[env(safe-area-inset-top)] backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-b border-gray-100 dark:border-slate-700/50">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
            <button
              type="button"
              disabled={isGoingBack}
              onClick={() => {
                // Dibuka dari dalam app → mundur, jangan menumpuk entri baru.
                if (hasInAppHistory()) {
                  window.history.back();
                  return;
                }
                // Dibuka langsung (link WhatsApp): ganti entri ini dengan daftar paket,
                // supaya back berikutnya keluar — bukan memantul ke Detail Paket lagi.
                setIsGoingBack(true);
                window.location.replace(backHref);
              }}
              className="relative touch-hit w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100/80 dark:bg-slate-800/80 hover:bg-emerald-50 dark:hover:bg-slate-700/80 text-gray-500 dark:text-slate-400 hover:text-emerald-600 transition-all duration-300 active:scale-95"
              title="Kembali"
              aria-label="Kembali"
            >
              {isGoingBack ? <Loader2 size={18} className="animate-spin" /> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>}
            </button>
            <h1 className="text-base font-bold text-gray-800 dark:text-white truncate">Detail Paket</h1>
          </div>
        </div>

        <main className="max-w-lg mx-auto px-4 pt-4 pb-8">
          {showSingleLoader && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-4 border-emerald-100"></div>
                <div className="w-12 h-12 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin absolute top-0 left-0"></div>
              </div>
              <p className="mt-4 text-gray-500 font-medium">Memuat paket...</p>
            </div>
          )}

          {singleLoadFailed && (
            <div role="alert" data-load-error className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-5 bg-red-50 dark:bg-red-950/40 rounded-full flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-red-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
              </div>
              <p className="text-gray-700 dark:text-white font-semibold text-lg mb-1">Paket belum bisa dimuat</p>
              <p className="text-gray-400 text-sm mb-6 max-w-xs mx-auto">{describeLoadError(error ?? refreshFailure?.error)}</p>
              <button
                type="button"
                onClick={retrySingleLoad}
                className="px-5 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium hover:bg-emerald-600 active:scale-95 transition-all shadow-md shadow-emerald-500/20"
              >
                Coba Lagi
              </button>
            </div>
          )}

          {!showSingleLoader && !singlePkg && !singleLoadFailed && (
            <div data-not-found className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-5 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-gray-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
              </div>
              <p className="text-gray-700 dark:text-white font-semibold text-lg mb-1">Paket tidak ditemukan</p>
              <p className="text-gray-400 text-sm mb-6">Paket yang Anda cari mungkin sudah tidak tersedia.</p>
              <button
                // replace: halaman "tidak ditemukan" tak perlu dikunjungi lagi lewat back.
                onClick={() => { window.location.replace(backHref); }}
                className="px-5 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium hover:bg-emerald-600 active:scale-95 transition-all shadow-md shadow-emerald-500/20"
              >
                Lihat Semua Paket
              </button>
            </div>
          )}

          {!showSingleLoader && singlePkg && staleNoticeVisible && (
            <StaleDataNotice
              fetchedAt={refreshFailure.dataFetchedAt}
              retrying={revalidating}
              onRetry={() => { void revalidatePackages(selectedYear); }}
            />
          )}

          {!showSingleLoader && singlePkg && (
            <div className="-mx-4">
              <PackageCard
                package={singlePkg}
                isExpanded={true}
                onToggle={() => {}}
                agent={currentAgent}
                isSingleView={true}
              />
            </div>
          )}
        </main>

      </div>
    );
  }

  // ============================================
  // Normal Mode (full app)
  // ============================================

  // Paket yang sedang dibahas di rail. Dicari dari filteredPackages, bukan
  // packages: kalau kartunya tersaring keluar, railnya harus ikut menutup.
  const selectedPkg = isWide && expandedCardId
    ? filteredPackages.find(p => p.jadwalId === expandedCardId) ?? null
    : null;
  const railAgentSlug = currentAgent
    ? Object.entries(AGENTS_DATA).find(([, v]) => v === currentAgent)?.[0] || null
    : null;

  return (
    <div className="jadwal-page min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-slate-950 dark:to-black transition-colors duration-300">
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
        onSortOrderChange={handleSortOrderChange}
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
        availableOnly={availableOnly}
        onToggleAvailableOnly={handleToggleAvailableOnly}
      />

      {/* ============================================ */}
      {/* TARIK-UNTUK-SEGARKAN (app terpasang) */}
      {/* ============================================ */}
      {/* Refresh yang sama dengan interval 30 menit & tombol "Coba lagi": tarik data
          segar tanpa mengosongkan daftar. SENGAJA bukan location.reload() — muat ulang
          membuang posisi gulir dan jauh lebih lambat daripada satu fetch.
          Dimatikan selama muat pertama; sesudahnya tetap hidup di layar galat, jadi
          tarikan juga jalan keluar dari "Gagal Memuat Data". */}
      <PullToRefresh enabled={!loading} onRefresh={() => revalidatePackages(selectedYear)} />

      {/* ============================================ */}
      {/* MAIN CONTENT */}
      {/* ============================================ */}
      {/* Offset = tinggi FilterHeader (fixed) + jarak 11px ke kartu pertama.
          Dulu ini `pt-48` (192px) dan langsung meleset 14px begitu baris header
          dikecilkan di mobile — karena itu angkanya sekarang datang dari
          --filter-header-h yang diukur FilterHeader sendiri. */}
      <main className="jadwal-shell jadwal-list-main px-4 pb-8">
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

        {/* Error State — pesan mentah ("HTTP error! status: 503") tak pernah dirender */}
        {error && !loading && (
          <div role="alert" data-load-error className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-2xl p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-red-500">
                <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-red-700 dark:text-red-300 font-medium mb-1">Gagal Memuat Data</p>
            <p className="text-red-600 dark:text-red-400 text-sm mb-4">{describeLoadError(error)}</p>
            <button
              onClick={() => fetchPackages(selectedYear)}
              className="px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 active:scale-95 transition-all"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {/* Data tersimpan yang gagal diperbarui — kursi & harga bisa sudah berubah */}
        {!loading && !error && staleNoticeVisible && (
          <StaleDataNotice
            fetchedAt={refreshFailure.dataFetchedAt}
            retrying={revalidating}
            onRetry={() => { void revalidatePackages(selectedYear); }}
          />
        )}

        {/* Package List */}
        {!loading && !error && (
          <div className={isCompactView ? 'space-y-1.5' : '-mx-4 space-y-2 [overflow-anchor:none]'}>
            {/* [overflow-anchor:none] — matikan scroll anchoring bawaan browser; saat panel
                collapse+expand bersamaan, browser bisa memilih anchor node di dalam panel yang
                membuka dan ikut men-scroll halaman. Kompensasi ditangani anchorCardDuringToggle. */}
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
                  railMode={isWide}
                  instantCollapse={instantCollapseId === pkg.jadwalId}
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
                  Tidak ada paket dengan kriteria "{filterModeLabel(filterMode)}"
                  {filterSecondaryValue && ` - ${filterMode === 'TIPE PAKET' ? packageTypeLabel(filterSecondaryValue) : filterSecondaryValue}`}
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
      {/* RAIL DESKTOP (>=1024px) — lihat .jadwal-rail di src/index.css */}
      {/* ============================================ */}
      <AnimatePresence>
        {selectedPkg && (
          <RailShell key="rail-kiri" side="left" contentKey={selectedPkg.jadwalId}>
            <ItineraryRail pkg={selectedPkg} />
          </RailShell>
        )}
        {selectedPkg && (
          <RailShell key="rail-kanan" side="right" contentKey={selectedPkg.jadwalId}>
            <DetailRail pkg={selectedPkg} agentSlug={railAgentSlug} />
          </RailShell>
        )}
      </AnimatePresence>

      {/* ============================================ */}
      {/* FILTER MODAL */}
      {/* ============================================ */}
      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        selectedFilter={quickFilter}
        onSelectFilter={handleQuickFilterChange}
        departureRanges={departureTimeRanges}
        onDepartureRangeChange={handleDepartureRangeChange}
        returnRanges={returnTimeRanges}
        onReturnRangeChange={handleReturnRangeChange}
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
            <div className="relative flex-1 overflow-y-auto bg-gray-50 dark:bg-slate-950">
              {/* Full PackageCard — tanpa px-4 agar kartu full-bleed.
                  Safe-area: layar penuh di app terpasang iOS menyentuh status bar & home indicator. */}
              <div className="max-w-lg mx-auto pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))]">
                <PackageCard
                  package={detailPkg}
                  isExpanded={true}
                  onToggle={closeCompactDetail}
                  agent={currentAgent}
                />
              </div>
            </div>

            {/* Floating Close Button — Bottom Center */}
            <div className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-0 right-0 flex justify-center z-20 pointer-events-none">
              <button
                onClick={closeCompactDetail}
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
