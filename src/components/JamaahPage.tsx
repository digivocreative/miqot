import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye, EyeOff, LogIn, Loader2, User, Users, Lock, Search,
  Calendar, Building2, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, RefreshCw,
  ArrowUpDown, SlidersHorizontal, X, Check, Plane, Landmark,
} from 'lucide-react';
import { getAuthHeaders } from './LoginPage';
import { trackEvent } from '../utils/analytics';
import HajiPage from './HajiPage';

// ── Animated Counter: smooth count-up between values ──
function AnimatedCounter({ value, duration = 600 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) return;
    prevRef.current = to;

    const start = performance.now();
    const diff = to - from;
    let raf: number;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out for natural deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + diff * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{display.toLocaleString('id-ID')}</>;
}



// ── Types ──
interface JamaahItem {
  id: number;
  id_umroh: string;
  nama: string;
  jk: string | null;
  wa: string | null;
  tgl_lahir: string | null;
  paket: string | null;
  bayar: number;
  sisa: number;
  tgl_berangkat: string | null;
  tgl_daftar: string | null;
  hijriah_year: string | null;
  perlengkapan: Record<string, boolean> | null;
  dokumen: Record<string, boolean> | null;
  no_paspor: string | null;
  paspor_expired: string | null;
  raw_data: { staf?: string; status_bayar?: string; [key: string]: unknown } | null;
  synced_at: string;
}

interface JamaahData {
  items: JamaahItem[];
  total: number;
  page: number;
  totalPages: number;
  lastSync: string | null;
  counts: { semua: number; belumLunas: number; berangkat: number };
  piutang: number;
}

type ViewState = 'loading' | 'login' | 'connecting' | 'syncing' | 'data';
type StatusFilter = 'semua' | 'belum' | 'berangkat';
type SortKey = 'nama' | 'sisa_desc' | 'berangkat' | 'terbaru';

// ── Props (session persistence from parent) ──
interface JamaahPageProps {
  jamaahConnected?: boolean;
  jamaahUser?: string;
  initialSubTab?: 'umroh' | 'haji';
  onConnectionChange?: (connected: boolean, user: string) => void;
}

export default function JamaahPage({ jamaahConnected, jamaahUser, initialSubTab = 'umroh', onConnectionChange }: JamaahPageProps) {
  // Compute current Hijriah year dynamically
  const currentHijriYear = (() => {
    const now = new Date();
    const gYear = now.getFullYear();
    const approx = Math.floor((gYear - 622) * (33 / 32));
    return approx;
  })();
  // Show from latest (current+2) down to 1447 minimum
  const hijriahOptions = Array.from(
    { length: currentHijriYear + 2 - 1447 + 1 },
    (_, i) => currentHijriYear + 2 - i
  ).filter(y => y >= 1447);
  const [view, setView] = useState<ViewState>('loading');

  // Login form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Connected state
  const [connectedUser, setConnectedUser] = useState(jamaahUser || '');
  const [error, setError] = useState('');

  // Data + filters
  const [data, setData] = useState<JamaahData | null>(null);
  const [hijriahYear, setHijriahYear] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('semua');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('terbaru');
  const [page, setPage] = useState(1);
  const [loadingData, setLoadingData] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedCount, setSyncedCount] = useState(0);
  const [syncPhase, setSyncPhase] = useState<number>(0);
  const [syncDone, setSyncDone] = useState(false);
  const [backgroundSyncing, setBackgroundSyncing] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [filterOpen, setFilterOpen] = useState(false);
  const [subTab, setSubTab] = useState<'umroh' | 'haji'>(initialSubTab);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);
  const hasAutoSynced = useRef(false);

  // Switch sub-tab and update URL
  const switchSubTab = useCallback((tab: 'umroh' | 'haji') => {
    setSubTab(tab);
    window.history.replaceState(null, '', `/dashboard/jamaah/${tab}`);
    document.title = tab === 'haji' ? 'Jamaah - Haji' : 'Jamaah';
  }, []);

  // ── Check status on mount / handle parent disconnect ──
  useEffect(() => {
    // Don't override if we're in the middle of syncing or connecting
    if (view === 'syncing' || view === 'connecting') return;

    if (jamaahConnected && jamaahUser) {
      setConnectedUser(jamaahUser);
      setView('data');
      return;
    }
    if (!jamaahConnected && view === 'data') {
      setView('login');
      setConnectedUser('');
      setData(null);
      setError('');
      setUsername('');
      return;
    }
    checkStatus();
  }, [jamaahConnected]);

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/laporan/status', { headers: { ...getAuthHeaders() } });
      const result = await res.json();
      if (result.success && result.data.hasCredentials) {
        setConnectedUser(result.data.username);
        setView('data');
        onConnectionChange?.(true, result.data.username);
        return;
      }
      setView('login');
    } catch {
      setView('login');
    }
  };

  // ── Fetch jamaah data from Supabase ──
  const fetchJamaah = useCallback(async (p = page) => {
    setLoadingData(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(p), limit: '10' });
      if (sortKey) params.set('sort', sortKey);
      if (hijriahYear) params.set('hijriahYear', hijriahYear);
      if (statusFilter !== 'semua') params.set('status', statusFilter);
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/laporan/jamaah?${params}`, { headers: { ...getAuthHeaders() } });
      const result = await res.json();
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error || 'Gagal memuat data');
      }
    } catch {
      setError('Gagal menghubungi server');
    }
    setLoadingData(false);
  }, [hijriahYear, statusFilter, searchQuery, sortKey, page]);

  // ── Load data when view=data or filters change ──
  useEffect(() => {
    if (view === 'data') fetchJamaah(page);
  }, [view, hijriahYear, statusFilter, searchQuery, sortKey, page]);

  // ── Resume polling if server-side sync is still in progress (e.g. after page refresh) ──
  useEffect(() => {
    if (view !== 'data' || syncing) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/laporan/sync-status', {
          headers: { ...getAuthHeaders() },
          signal: AbortSignal.timeout(5000),
        });
        const result = await res.json();
        if (cancelled) return;
        if (result.success && result.data.isSyncing && !result.data.background) {
          setSyncing(true);
          setBackgroundSyncing(true);
          if (result.data.totalSynced) setSyncedCount(result.data.totalSynced);
          if (result.data.phase) setSyncPhase(result.data.phase);
          startPolling();
        }
      } catch {
        // Silent — not critical
      }
    })();
    return () => { cancelled = true; };
  }, [view]);

  // ── Auto-sync on first load if connected but no data ──
  useEffect(() => {
    if (view === 'data' && !loadingData && !syncing && !hasAutoSynced.current && data && data.total === 0 && data.items.length === 0) {
      hasAutoSynced.current = true;
      handleSync(false, hijriahYear || String(currentHijriYear));
    }
  }, [view, loadingData, data]);

  // ── Login handler ──
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username || !password) { setError('Username dan password wajib diisi'); return; }
    if (username.length < 3 || username.length > 12 || !username.startsWith('SM')) { setError('Username tidak valid'); return; }

    setView('connecting');
    try {
      const res = await fetch('/api/laporan/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ username, password, kantor: '2' }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        setError(result.error || 'Login gagal');
        setView('login');
        return;
      }
      setConnectedUser(username);
      setPassword('');
      onConnectionChange?.(true, username);

      // Immediately show data view — load whatever Supabase already has
      setView('data');
      setPage(1);
      await fetchJamaah(1);

      // Then trigger sync in background (non-blocking)
      handleSync(false, hijriahYear || String(currentHijriYear));
    } catch {
      setError('Gagal menghubungi server');
      setView('login');
    }
  };

  // ── Sync handler (progressive) ──
  const handleSync = async (isFirstSync = false, specificYear?: string) => {
    setSyncing(true);
    setError('');
    setSyncPhase(1);
    if (isFirstSync) {
      setView('syncing');
      setSyncedCount(0);
      setSyncDone(false);
    }

    try {
      const res = await fetch('/api/laporan/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ hijriahYear: specificYear || null }),
        signal: AbortSignal.timeout(90_000), // 90s max — legacy system may be slow
      });
      const result = await res.json();
      if (!result.success) {
        setError(result.error || 'Gagal sync data');
        setSyncing(false);
        if (isFirstSync) setView('data');
        return;
      }

      // First batch arrived — show data immediately
      setView('data');
      setPage(1);
      await fetchJamaah(1);

      // If still syncing remaining, start polling
      if (result.data.syncing) {
        setBackgroundSyncing(true);
        startPolling();
      } else {
        setSyncing(false);
      }
    } catch {
      setError('Gagal menghubungi server');
      setSyncing(false);
      if (isFirstSync) setView('data');
    }
  };

  // ── Polling for background sync status ──
  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    let errorCount = 0;
    pollStartRef.current = Date.now();

    pollRef.current = setInterval(async () => {
      // Max polling duration: 5 minutes
      if (Date.now() - pollStartRef.current > 5 * 60 * 1000) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setBackgroundSyncing(false);
        setSyncing(false);
        fetchJamaah(page);
        return;
      }

      try {
        const res = await fetch('/api/laporan/sync-status', {
          headers: { ...getAuthHeaders() },
          signal: AbortSignal.timeout(10000),
        });
        const result = await res.json();
        errorCount = 0;
        if (result.success) {
          if (result.data.totalSynced) setSyncedCount(result.data.totalSynced);
          if (result.data.phase) setSyncPhase(result.data.phase);
          // Refetch data when transitioning Phase 1→2 (all core data is ready)
          if (result.data.phase === 2 && syncPhase === 1) {
            fetchJamaah(page);
          }
          if (!result.data.isSyncing) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setBackgroundSyncing(false);
            setSyncing(false);
            fetchJamaah(page);
          }
        }
      } catch {
        errorCount++;
        if (errorCount >= 5) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setBackgroundSyncing(false);
          setSyncing(false);
          fetchJamaah(page);
        }
      }
    }, 3000);
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Auto-refresh jamaah data every 5 minutes
  useEffect(() => {
    if (view !== 'data') return;
    const autoRef = setInterval(() => {
      if (!syncing && !backgroundSyncing) fetchJamaah(page);
    }, 5 * 60 * 1000);
    return () => clearInterval(autoRef);
  }, [view, syncing, backgroundSyncing, fetchJamaah, page]);



  // ── Search debounce ──
  useEffect(() => {
    const timer = setTimeout(() => { setSearchQuery(searchInput); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Format helpers ──
  const formatRupiah = (n: number) => n ? `Rp${n.toLocaleString('id-ID')}` : '-';
  const formatShort = (n: number): string => {
    if (!n) return '-';
    if (n >= 1_000_000_000) return `Rp${(n / 1_000_000_000).toFixed(1).replace('.0', '')}M`;
    if (n >= 1_000_000) {
      const jt = n / 1_000_000;
      return jt % 1 === 0 ? `Rp${jt}jt` : `Rp${jt.toFixed(1).replace('.0', '')}jt`;
    }
    if (n >= 1_000) return `Rp${Math.round(n / 1_000)}rb`;
    return `Rp${n}`;
  };
  const formatDate = (d: string | null) => {
    if (!d) return '-';
    try {
      return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return d; }
  };
  const formatSyncTime = (d: string | null) => {
    if (!d) return 'Belum pernah sync';
    try {
      const date = new Date(d);
      const now = new Date();
      const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
      if (diffMin < 1) return 'Baru saja';
      if (diffMin < 60) return `${diffMin}m lalu`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}j lalu`;
      return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) + ', ' + date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } catch { return d; }
  };

  // ── Loading / Syncing / Connecting ──
  if (view === 'loading') {
    return (
      <div className="px-4 pt-4 pb-8 space-y-2">
        {/* Skeleton command bar */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm px-3 py-1.5 flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded bg-gray-200 dark:bg-slate-700 animate-pulse shrink-0" />
          <div className="flex-1 h-9 rounded-lg bg-gray-100 dark:bg-slate-700/40 animate-pulse" />
          <div className="h-9 w-14 rounded-lg bg-gray-100 dark:bg-slate-700/40 animate-pulse shrink-0" />
          <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-slate-700/40 animate-pulse shrink-0" />
        </div>
        {/* Skeleton sync info */}
        <div className="flex items-center justify-between px-1 mt-2">
          <div className="h-3 w-32 rounded-md bg-gray-200 dark:bg-slate-700 animate-pulse" />
          <div className="h-3 w-20 rounded-md bg-gray-200 dark:bg-slate-700 animate-pulse" />
        </div>
        {/* Skeleton cards */}
        <div className="space-y-1.5">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm px-3 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-slate-700 animate-pulse shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="h-4 w-40 rounded-md bg-gray-200 dark:bg-slate-700 animate-pulse" />
                <div className="h-3 w-28 rounded-md bg-gray-100 dark:bg-slate-700/60 animate-pulse mt-1.5" />
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <div className="h-3.5 w-16 rounded-md bg-gray-200 dark:bg-slate-700 animate-pulse" />
                <div className="h-3 w-20 rounded-md bg-gray-100 dark:bg-slate-700/60 animate-pulse" />
              </div>
              <div className="w-3.5 h-3.5 rounded bg-gray-100 dark:bg-slate-700/40 animate-pulse shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (view === 'syncing') {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        {/* Animated plane + clouds */}
        <div className="relative w-36 h-24 mb-4">
          {/* Cloud 1 - top left */}
          <svg className="absolute top-1 left-2 w-10 h-6 text-gray-200 dark:text-slate-700" viewBox="0 0 40 24" fill="currentColor"
            style={{animation: 'syncFloat 3s ease-in-out infinite'}}>
            <ellipse cx="20" cy="16" rx="18" ry="8" />
            <ellipse cx="12" cy="12" rx="8" ry="6" />
            <ellipse cx="26" cy="10" rx="10" ry="7" />
          </svg>
          {/* Plane */}
          <svg className="absolute top-6 w-10 h-10 text-emerald-500" viewBox="0 0 24 24" fill="currentColor"
            style={{animation: 'syncFly 2.5s ease-in-out infinite', left: '50%', marginLeft: '-20px'}}>
            <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
          </svg>
          {/* Cloud 2 - bottom right */}
          <svg className="absolute bottom-0 right-1 w-12 h-7 text-gray-200 dark:text-slate-700" viewBox="0 0 48 28" fill="currentColor"
            style={{animation: 'syncFloat 4s ease-in-out infinite 1s'}}>
            <ellipse cx="24" cy="20" rx="22" ry="8" />
            <ellipse cx="14" cy="14" rx="10" ry="7" />
            <ellipse cx="32" cy="12" rx="12" ry="8" />
          </svg>
        </div>

        {/* 3 bouncing dots */}
        <div className="flex gap-1.5 mb-4">
          <div className="w-2 h-2 rounded-full bg-emerald-500" style={{animation: 'syncBounce 0.6s ease-in-out infinite alternate', animationDelay: '0ms'}} />
          <div className="w-2 h-2 rounded-full bg-emerald-500" style={{animation: 'syncBounce 0.6s ease-in-out infinite alternate', animationDelay: '150ms'}} />
          <div className="w-2 h-2 rounded-full bg-emerald-500" style={{animation: 'syncBounce 0.6s ease-in-out infinite alternate', animationDelay: '300ms'}} />
        </div>

        <p className="text-sm font-medium text-gray-500 dark:text-slate-400">Menyinkronkan jamaah umroh...</p>
        {syncedCount > 0 && (
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1"><AnimatedCounter value={syncedCount} /> jamaah tersinkron</p>
        )}

        {/* Inline keyframes */}
        <style>{`
          @keyframes syncFly {
            0%, 100% { transform: translateX(-20px) rotate(-2deg); }
            50% { transform: translateX(20px) rotate(2deg); }
          }
          @keyframes syncFloat {
            0%, 100% { transform: translateY(0); opacity: 0.4; }
            50% { transform: translateY(-6px); opacity: 0.7; }
          }
          @keyframes syncBounce {
            0% { transform: translateY(0); }
            100% { transform: translateY(-6px); }
          }
        `}</style>
      </div>
    );
  }
  if (view === 'connecting') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 size={28} className="animate-spin text-emerald-500" />
        <p className="text-sm font-semibold text-gray-600 dark:text-slate-300">Menghubungkan...</p>
      </div>
    );
  }

  // ── Sub-tab: Haji ──
  if (view === 'data' && subTab === 'haji') {
    return (
      <div className="px-4 pt-4 pb-8 space-y-2">
        {/* Sub-tab switcher */}
        <div className="flex gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl">
          <button
            onClick={() => switchSubTab('umroh')}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-bold transition-all bg-transparent text-gray-500 dark:text-slate-400"
          >
            <Users size={14} />
            Umroh
          </button>
          <button
            onClick={() => switchSubTab('haji')}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-bold transition-all bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm"
          >
            <Landmark size={14} />
            Haji
          </button>
        </div>
        <HajiPage
          jamaahConnected={jamaahConnected}
          jamaahUser={jamaahUser}
          onConnectionChange={onConnectionChange}
        />
      </div>
    );
  }

  // ── Data View ──
  if (view === 'data') {
    const SORT_OPTIONS: { key: SortKey; label: string }[] = [
      { key: 'nama', label: 'Nama (A-Z)' },
      { key: 'sisa_desc', label: 'Sisa terbesar' },
      { key: 'berangkat', label: 'Berangkat terdekat' },
      { key: 'terbaru', label: 'Terbaru' },
    ];

    return (
      <div className={`px-4 pt-4 pb-8 space-y-2 transition-opacity ${loadingData && data ? 'opacity-50 pointer-events-none' : ''}`}>

        {/* Sub-tab switcher */}
        <div className="flex gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl">
          <button
            onClick={() => switchSubTab('umroh')}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-bold transition-all bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm"
          >
            <Users size={14} />
            Umroh
          </button>
          <button
            onClick={() => switchSubTab('haji')}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-bold transition-all bg-transparent text-gray-500 dark:text-slate-400"
          >
            <Landmark size={14} />
            Haji
          </button>
        </div>

        {/* Command bar */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
          {/* Top bar — always visible */}
          <div className="flex items-center gap-2 px-3 py-1.5">
            <Search size={14} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Cari jamaah..."
              className="flex-1 h-9 bg-transparent text-xs text-gray-800 dark:text-white placeholder:text-gray-400 outline-none min-w-0"
            />
            <select
              value={hijriahYear}
              onChange={e => { setHijriahYear(e.target.value); setPage(1); }}
              className="h-9 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0 rounded-lg border border-emerald-200 dark:border-emerald-800/40 outline-none cursor-pointer shrink-0"
            >
              <option value="">Semua</option>
              {hijriahOptions.map(y => (
                <option key={y} value={String(y)}>{y} H</option>
              ))}
            </select>
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all active:scale-95 shrink-0 ${
                filterOpen || statusFilter !== 'semua'
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
              }`}
            >
              <SlidersHorizontal size={14} />
            </button>
          </div>

          {/* Expandable panel */}
          {filterOpen && (
            <div className="border-t border-gray-50 dark:border-slate-700/50 px-3 py-2.5 space-y-2">
              {/* Status pills */}
              <div className="flex gap-1.5">
                {([
                  ['semua', `Semua ${data?.counts.semua ?? 0}`],
                  ['belum', `Belum Lunas ${data?.counts.belumLunas ?? 0}`],
                  ['berangkat', `Berangkat ${data?.counts.berangkat ?? 0}`],
                ] as [StatusFilter, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => { setStatusFilter(key); setPage(1); }}
                    className={`flex-1 h-8 px-2 py-0 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all ${
                      statusFilter === key
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                        : 'bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Sort */}
              <div className="relative">
                <ArrowUpDown size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <select
                  value={sortKey}
                  onChange={e => { setSortKey(e.target.value as SortKey); setPage(1); }}
                  className="w-full h-8 appearance-none pl-7 pr-3 py-0 bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-700 rounded-lg text-[11px] font-semibold text-gray-600 dark:text-slate-300 outline-none cursor-pointer"
                >
                  {SORT_OPTIONS.map(o => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Active filter chip */}
        {statusFilter !== 'semua' && !filterOpen && (
          <div className="flex items-center gap-1">
            <div className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-full px-2.5 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                {statusFilter === 'belum'
                  ? `Belum Lunas ${data?.counts.belumLunas ?? 0}`
                  : `Berangkat ${data?.counts.berangkat ?? 0}`
                }
              </span>
              <button
                onClick={() => { setStatusFilter('semua'); setPage(1); }}
                className="text-emerald-500 hover:text-emerald-700 transition-colors"
              >
                <X size={10} />
              </button>
            </div>
          </div>
        )}

        {/* Sync info / background sync indicator */}
        <div className="flex items-center justify-between px-1">
          {backgroundSyncing ? (
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {syncPhase === 2
                ? 'Memperbarui data perlengkapan...'
                : <>Menyinkronkan jamaah umroh...{syncedCount > 0 && <>{' '}(<AnimatedCounter value={syncedCount} />)</>}</>
              }
            </span>
          ) : (
            <span className="text-[10px] text-gray-400 dark:text-slate-500">
              Sync: {formatSyncTime(data?.lastSync || null)}
            </span>
          )}
          <button
            onClick={() => handleSync(false, hijriahYear || String(currentHijriYear))}
            disabled={syncing}
            className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:opacity-70 transition-opacity disabled:opacity-50"
          >
            <RefreshCw size={10} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Ulang'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-[11px] text-red-600 dark:text-red-400 font-medium text-center">
            {error}
          </div>
        )}

        {/* Jamaah list */}
        {loadingData && !data ? (
          <div className="space-y-1.5">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm px-3 py-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-slate-700 animate-pulse shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="h-4 w-40 rounded-md bg-gray-200 dark:bg-slate-700 animate-pulse" />
                  <div className="h-3 w-28 rounded-md bg-gray-100 dark:bg-slate-700/60 animate-pulse mt-1.5" />
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <div className="h-3.5 w-16 rounded-md bg-gray-200 dark:bg-slate-700 animate-pulse" />
                  <div className="h-3 w-20 rounded-md bg-gray-100 dark:bg-slate-700/60 animate-pulse" />
                </div>
                <div className="w-3.5 h-3.5 rounded bg-gray-100 dark:bg-slate-700/40 animate-pulse shrink-0" />
              </div>
            ))}
          </div>
        ) : data?.items.length === 0 ? (
          <div className="text-center py-12">
            {searchQuery ? (
              <p className="text-xs text-gray-400 dark:text-slate-500">Tidak ada jamaah yang cocok dengan pencarian</p>
            ) : syncing ? (
              <div className="flex flex-col items-center py-4">
                <div className="relative w-36 h-24 mb-4">
                  <svg className="absolute top-1 left-2 w-10 h-6 text-gray-200 dark:text-slate-700" viewBox="0 0 40 24" fill="currentColor"
                    style={{animation: 'syncFloat 3s ease-in-out infinite'}}>
                    <ellipse cx="20" cy="16" rx="18" ry="8" /><ellipse cx="12" cy="12" rx="8" ry="6" /><ellipse cx="26" cy="10" rx="10" ry="7" />
                  </svg>
                  <svg className="absolute top-6 w-10 h-10 text-emerald-500" viewBox="0 0 24 24" fill="currentColor"
                    style={{animation: 'syncFly 2.5s ease-in-out infinite', left: '50%', marginLeft: '-20px'}}>
                    <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
                  </svg>
                  <svg className="absolute bottom-0 right-1 w-12 h-7 text-gray-200 dark:text-slate-700" viewBox="0 0 48 28" fill="currentColor"
                    style={{animation: 'syncFloat 4s ease-in-out infinite 1s'}}>
                    <ellipse cx="24" cy="20" rx="22" ry="8" /><ellipse cx="14" cy="14" rx="10" ry="7" /><ellipse cx="32" cy="12" rx="12" ry="8" />
                  </svg>
                </div>
                <div className="flex gap-1.5 mb-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" style={{animation: 'syncBounce 0.6s ease-in-out infinite alternate'}} />
                  <div className="w-2 h-2 rounded-full bg-emerald-500" style={{animation: 'syncBounce 0.6s ease-in-out infinite alternate', animationDelay: '150ms'}} />
                  <div className="w-2 h-2 rounded-full bg-emerald-500" style={{animation: 'syncBounce 0.6s ease-in-out infinite alternate', animationDelay: '300ms'}} />
                </div>
                <p className="text-sm font-medium text-gray-500 dark:text-slate-400">Menyinkronkan jamaah umroh...</p>
                {syncedCount > 0 && (
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-1"><AnimatedCounter value={syncedCount} /> jamaah tersinkron</p>
                )}
                <style>{`
                  @keyframes syncFly { 0%, 100% { transform: translateX(-20px) rotate(-2deg); } 50% { transform: translateX(20px) rotate(2deg); } }
                  @keyframes syncFloat { 0%, 100% { transform: translateY(0); opacity: 0.4; } 50% { transform: translateY(-6px); opacity: 0.7; } }
                  @keyframes syncBounce { 0% { transform: translateY(0); } 100% { transform: translateY(-6px); } }
                `}</style>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Belum ada data{hijriahYear ? ` untuk ${hijriahYear} H` : ''}</p>
                <button
                  onClick={() => handleSync(false, hijriahYear || String(currentHijriYear))}
                  disabled={syncing}
                  className="mt-3 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-50"
                >
                  Sync Sekarang
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {data?.items.map(item => {
              const isExpanded = expandedId === item.id;
              const paymentStatus: 'belum' | 'dp' | 'lunas' = item.sisa <= 0 ? 'lunas' : item.bayar > 0 ? 'dp' : 'belum';
              const initials = (item.nama || '?').split(' ').slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('');
              const genderRing = item.jk === 'P' ? 'ring-2 ring-pink-300' : 'ring-2 ring-blue-300';

              // Countdown for departure badge
              let daysUntil = -1;
              if (item.tgl_berangkat) {
                const dep = new Date(item.tgl_berangkat);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                daysUntil = Math.ceil((dep.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              }

              // Payment percentage
              const total = item.bayar + item.sisa;
              const pct = total > 0 ? Math.round((item.bayar / total) * 100) : 0;

              // Check if Phase 2 has enriched this jamaah (any Phase 2 field has data)
              const isEnriched = !!(item.wa || item.tgl_lahir || item.no_paspor || (item.perlengkapan && Object.keys(item.perlengkapan).length > 0));
              const pendingEnrichment = backgroundSyncing && !isEnriched;

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border shadow-sm overflow-hidden transition-all duration-200 ${
                    isExpanded
                      ? 'bg-white dark:bg-slate-800 border-emerald-200 dark:border-emerald-800/40 shadow-md shadow-emerald-500/5'
                      : 'bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700'
                  }`}
                >
                  {/* Collapsed row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-colors"
                  >
                    {/* Avatar with gender ring + lunas overlay */}
                    <div className="relative shrink-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-slate-300 ${genderRing}`}>
                        {initials}
                      </div>
                      {paymentStatus === 'lunas' ? (
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-800 flex items-center justify-center">
                          <Check size={9} className="text-white" strokeWidth={3} />
                        </div>
                      ) : paymentStatus === 'dp' ? (
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-blue-500 border-2 border-white dark:border-slate-800 flex items-center justify-center">
                          <svg width="9" height="9" viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="10,4 10,10 14,12" />
                          </svg>
                        </div>
                      ) : (
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-500 border-2 border-white dark:border-slate-800 flex items-center justify-center">
                          <span className="text-white text-[8px] font-bold leading-none">?</span>
                        </div>
                      )}
                    </div>

                    {/* Info center */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 dark:text-white truncate">{item.nama}</p>
                      {item.paket && (
                        <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5 truncate">{item.paket}</p>
                      )}
                    </div>

                    {/* Stacked right: payment + departure */}
                    <div className="text-right flex-shrink-0">
                      {paymentStatus === 'belum' ? (
                        <span className="inline-flex items-center text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-full px-2.5 py-1">
                          Belum DP
                        </span>
                      ) : (
                        <>
                          <div className={`text-xs font-semibold ${
                            paymentStatus === 'lunas'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-blue-600 dark:text-blue-400'
                          }`}>
                            {paymentStatus === 'lunas' ? '✓ Lunas' : formatShort(item.sisa)}
                          </div>
                          {daysUntil > 0 && (
                            <div className="flex items-center justify-end gap-1 mt-0.5 text-[10px] text-gray-400 dark:text-slate-500">
                              <Plane size={10} strokeWidth={2} />
                              <span>{(() => {
                                if (daysUntil < 3) return `${daysUntil * 24} jam lagi`;
                                if (daysUntil <= 30) return `${daysUntil} hari lagi`;
                                return `${Math.floor(daysUntil / 30)} bulan lagi`;
                              })()}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Chevron */}
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="text-gray-300 dark:text-slate-600 shrink-0"
                    >
                      <ChevronDown size={14} />
                    </motion.div>
                  </button>

                  {/* Expanded detail */}
                  <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      key="expanded-content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
                        opacity: { duration: 0.2, ease: 'easeInOut' }
                      }}
                      style={{ overflow: 'hidden' }}
                    >
                    <div className="border-t border-gray-50 dark:border-slate-700/50">

                      {/* ─── Section 1: Pembayaran (colored block) ─── */}
                      <div className={`px-3 py-2.5 ${
                        paymentStatus === 'lunas' ? 'bg-emerald-50/60 dark:bg-emerald-900/20'
                          : paymentStatus === 'dp' ? 'bg-blue-50/60 dark:bg-blue-900/20'
                          : 'bg-amber-50/60 dark:bg-amber-900/20'
                      }`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400">Pembayaran</span>
                          <span className={`text-xl font-extrabold ${
                            paymentStatus === 'lunas' ? 'text-emerald-600 dark:text-emerald-400'
                              : paymentStatus === 'dp' ? 'text-blue-600 dark:text-blue-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}>{pct}%</span>
                        </div>
                        <div className="h-2.5 bg-white/80 dark:bg-slate-700/60 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              paymentStatus === 'lunas' ? 'bg-emerald-500'
                                : paymentStatus === 'dp' ? 'bg-blue-500'
                                : 'bg-amber-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-xs text-gray-600 dark:text-slate-400">Bayar <span className="font-bold text-gray-800 dark:text-slate-200">{formatRupiah(item.bayar)}</span></span>
                          {paymentStatus === 'lunas' ? (
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">✓ Lunas</span>
                          ) : (
                            <span className="text-xs text-gray-600 dark:text-slate-400">Sisa <span className={`font-bold ${
                              paymentStatus === 'dp' ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'
                            }`}>{formatRupiah(item.sisa)}</span></span>
                          )}
                        </div>
                      </div>

                      {/* ─── Section 2: Info Grid (white block) ─── */}
                      <div className="px-3 py-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide">WhatsApp</p>
                          {item.wa ? (
                            <a href={`https://wa.me/${item.wa.replace(/^0/, '62').replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-emerald-600 dark:text-emerald-400 underline underline-offset-2">{item.wa}</a>
                          ) : (
                            <p className="text-[13px] font-bold text-gray-700 dark:text-slate-200">-</p>
                          )}
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Tgl Lahir</p>
                          {item.tgl_lahir ? (
                            <p className="text-[13px] font-bold text-gray-700 dark:text-slate-200">{formatDate(item.tgl_lahir)}</p>
                          ) : (
                            <p className="text-[13px] font-bold text-gray-700 dark:text-slate-200">-</p>
                          )}
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide">ID Umroh</p>
                          <p className="text-[13px] font-bold text-gray-700 dark:text-slate-200">{item.id_umroh || '-'}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Tgl Daftar</p>
                          {item.tgl_daftar ? (
                            <p className="text-[13px] font-bold text-gray-700 dark:text-slate-200">{formatDate(item.tgl_daftar)}</p>
                          ) : (
                            <p className="text-[13px] font-bold text-gray-700 dark:text-slate-200">-</p>
                          )}
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Berangkat</p>
                          <p className="text-[13px] font-bold text-gray-700 dark:text-slate-200">{formatDate(item.tgl_berangkat)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Paspor</p>
                          {item.no_paspor ? (
                            <div className="relative flex items-center gap-1">
                              <span className="text-[13px] font-bold text-gray-700 dark:text-slate-200">{item.no_paspor}</span>
                              {item.paspor_expired && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const tooltip = e.currentTarget.nextElementSibling;
                                    if (!tooltip) return;
                                    const isHidden = tooltip.classList.contains('hidden');
                                    tooltip.classList.toggle('hidden');
                                    if (isHidden) {
                                      const close = (ev: Event) => {
                                        if (!(e.currentTarget as HTMLElement)?.contains(ev.target as Node)) {
                                          tooltip.classList.add('hidden');
                                          document.removeEventListener('click', close);
                                        }
                                      };
                                      setTimeout(() => document.addEventListener('click', close), 0);
                                    }
                                  }}
                                  className="w-4 h-4 rounded-full bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-slate-300 text-[9px] font-bold flex items-center justify-center shrink-0 hover:bg-gray-300 dark:hover:bg-slate-500 transition-colors"
                                >
                                  i
                                </button>
                              )}
                              {item.paspor_expired && (
                                <span className="hidden absolute left-0 top-full mt-1 text-[10px] font-semibold text-gray-500 dark:text-slate-400 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-1 shadow-lg z-10 whitespace-nowrap">
                                  Expired {formatDate(item.paspor_expired)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <p className="text-[13px] font-bold text-gray-700 dark:text-slate-200">-</p>
                          )}
                        </div>
                        {item.raw_data?.staf && (
                          <div>
                            <p className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Staff</p>
                            <p className="text-[13px] font-bold text-gray-700 dark:text-slate-200">{item.raw_data.staf}</p>
                          </div>
                        )}
                      </div>

                      {/* ─── Section 3: Perlengkapan & Paspor (tinted block) ─── */}
                      {(() => {
                        // Filter perlengkapan by gender
                        const hasPerlengkapan = item.perlengkapan && Object.keys(item.perlengkapan).length > 0;
                        let genderItems: [string, boolean][] = [];
                        let done = 0;
                        const labels: Record<string, string> = { batik: 'Batik', buku_doa: 'Buku Doa', ikhram: 'Ikhram', koper: 'Koper', mukena: 'Mukena', sabuk: 'Sabuk', tas_paspor: 'Tas Paspor' };
                        if (hasPerlengkapan) {
                          genderItems = Object.entries(item.perlengkapan!).filter(([key]) => {
                            if (key === 'syal' || key === 'bergo' || key === 'sabuk') return false;
                            if (key === 'ikhram' && item.jk !== 'L') return false;
                            if ((key === 'mukena' || key === 'sabuk') && item.jk !== 'P') return false;
                            return true;
                          }) as [string, boolean][];
                          done = genderItems.filter(([, v]) => v).length;
                        }

                        return (hasPerlengkapan || item.no_paspor !== null || item.no_paspor === null) ? (
                          <div className="bg-gray-50/80 dark:bg-slate-900/40 px-3 py-2.5">
                            {/* Perlengkapan */}
                            {hasPerlengkapan && genderItems.length > 0 && (
                              <>
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Perlengkapan</span>
                                  <div className="w-16 h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-emerald-500 rounded-full transition-all"
                                      style={{ width: `${genderItems.length > 0 ? (done / genderItems.length) * 100 : 0}%` }}
                                    />
                                  </div>
                                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 ml-auto">{done}/{genderItems.length}</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {genderItems.map(([key, val]) => (
                                    <span key={key} className={`text-[11px] font-semibold px-2 py-1 rounded-lg inline-flex items-center gap-0.5 border ${
                                      val
                                        ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/40 shadow-sm shadow-emerald-500/10'
                                        : 'bg-white dark:bg-slate-800 text-gray-300 dark:text-slate-600 border-gray-100 dark:border-slate-700'
                                    }`}>
                                      {val ? (
                                        <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
                                      ) : (
                                        <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                      )}
                                      {labels[key] || key}
                                    </span>
                                  ))}
                                </div>
                              </>
                            )}

                            {/* Phase 2 loading hint — only for jamaah not yet enriched */}
                            {pendingEnrichment && (
                              <div className="flex items-center gap-2 py-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                                <span className="text-[10px] text-gray-400 dark:text-slate-500">Lagi cek info perlengkapan, bentar ya...</span>
                              </div>
                            )}
                            {/* Warnings (passport-related, below perlengkapan if applicable) */}
                            {!item.no_paspor && !pendingEnrichment && item.tgl_berangkat && (() => {
                              const dep = new Date(item.tgl_berangkat);
                              const now = new Date();
                              const monthsUntil = (dep.getFullYear() - now.getFullYear()) * 12 + dep.getMonth() - now.getMonth();
                              if (monthsUntil <= 3) {
                                return (
                                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl px-2.5 py-2 mt-2">
                                    <p className="text-[10px] font-bold text-red-600 dark:text-red-400">⚠ Paspor belum disetor — berangkat kurang dari 3 bulan</p>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                            {item.no_paspor && item.paspor_expired && item.tgl_berangkat && (() => {
                              const exp = new Date(item.paspor_expired);
                              const dep = new Date(item.tgl_berangkat);
                              const sixMonthsBefore = new Date(dep);
                              sixMonthsBefore.setMonth(sixMonthsBefore.getMonth() + 6);
                              if (exp <= sixMonthsBefore) {
                                return (
                                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl px-2.5 py-2 mt-2">
                                    <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400">⚠ Paspor exp kurang dari 6 bulan sebelum berangkat</p>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        ) : null;
                      })()}

                      {/* ─── Section 4: Action Buttons ─── */}
                      <div className="px-3 py-2.5 flex gap-2">
                        {item.wa && (
                          <a
                            href={`https://wa.me/${item.wa.replace(/^0/, '62').replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all active:scale-95"
                            onClick={() => trackEvent('action', 'wa_click_jamaah', { jamaah: item.nama })}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            WhatsApp
                          </a>
                        )}
                        {item.sisa > 0 && item.wa && (
                          <a
                            href={`https://wa.me/${item.wa.replace(/^0/, '62').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Assalamualaikum, mengingatkan sisa pembayaran umroh sebesar ${formatRupiah(item.sisa)}. Terima kasih.`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-all active:scale-95"
                          >
                            Tagih
                          </a>
                        )}
                      </div>
                    </div>
                    </motion.div>
                  )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex flex-col items-center gap-2 pt-1">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100/80 dark:bg-slate-800/80 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-30"
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: Math.min(5, data.totalPages) }, (_, i) => {
                let pageNum: number;
                if (data.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= data.totalPages - 2) {
                  pageNum = data.totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-8 h-8 flex items-center justify-center rounded-xl text-xs font-bold transition-all ${
                      page === pageNum
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                        : 'bg-gray-100/80 dark:bg-slate-800/80 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100/80 dark:bg-slate-800/80 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-30"
              >
                <ChevronRight size={14} />
              </button>
            </div>
            <span className="text-[10px] text-gray-400 dark:text-slate-500">
              {((page - 1) * 10) + 1}–{Math.min(page * 10, data.total)} dari {data.total} jamaah
            </span>
          </div>
        )}
      </div>
    );
  }

  // ── Login Form ──
  return (
    <div className="px-4 pt-4 pb-8">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 text-center border-b border-gray-50 dark:border-slate-700/50">
          <img
            src="/logo-alhijaz.webp"
            alt="Alhijaz"
            className="h-auto mx-auto mb-3 rounded-xl object-contain"
            style={{ width: '8rem' }}
          />
          <h2 className="text-[15px] font-bold text-gray-800 dark:text-white">AIW Agent Login</h2>
          <p className="text-[12px] text-gray-500 dark:text-slate-500 mt-0.5">Login untuk sinkronisasi data jamaah.</p>
        </div>

        <form onSubmit={handleLogin} className="p-5 space-y-4">
          {/* Kantor: hidden, always '2' (Cabang) — sent in handleLogin */}

          {/* Username */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              <User size={12} /> Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value.toUpperCase()); setError(''); }}
              placeholder="SM12345"
              maxLength={12}
              autoCapitalize="characters"
              autoCorrect="off"
              className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400"
            />
          </div>

          {/* Password */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              <Lock size={12} /> Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="Kata Sandi"
                className="w-full px-3 py-2.5 pr-10 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center justify-center gap-1.5 py-2">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span className="text-xs font-medium text-red-500">{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95"
          >
            <LogIn size={16} /> Login
          </button>
        </form>


      </div>
    </div>
  );
}
