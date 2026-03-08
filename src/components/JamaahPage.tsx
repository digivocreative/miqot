import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Eye, EyeOff, LogIn, Loader2, User, Lock, Search,
  Calendar, Building2, Trash2, KeyRound, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, RefreshCw, MessageCircle,
  ArrowUpDown, SlidersHorizontal, X, Check,
} from 'lucide-react';
import { getAuthHeaders } from './LoginPage';

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
  onConnectionChange?: (connected: boolean, user: string) => void;
}

export default function JamaahPage({ jamaahConnected, jamaahUser, onConnectionChange }: JamaahPageProps) {
  // Compute current Hijriah year dynamically
  const currentHijriYear = (() => {
    const now = new Date();
    const gYear = now.getFullYear();
    const approx = Math.floor((gYear - 622) * (33 / 32));
    return approx;
  })();
  const hijriahOptions = [currentHijriYear + 1, currentHijriYear];
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
  const [hijriahYear, setHijriahYear] = useState(String(currentHijriYear));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('semua');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('nama');
  const [page, setPage] = useState(1);
  const [loadingData, setLoadingData] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [backgroundSyncing, setBackgroundSyncing] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deletingCreds, setDeletingCreds] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      await handleSync(true);
    } catch {
      setError('Gagal menghubungi server');
      setView('login');
    }
  };

  // ── Sync handler (progressive) ──
  const handleSync = async (isFirstSync = false, specificYear?: string) => {
    setSyncing(true);
    setError('');
    if (isFirstSync) setView('syncing');

    try {
      const res = await fetch('/api/laporan/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ hijriahYear: specificYear || null }),
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
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/laporan/sync-status', { headers: { ...getAuthHeaders() } });
        const result = await res.json();
        if (result.success && !result.data.isSyncing) {
          // Sync complete — stop polling & refresh data
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setBackgroundSyncing(false);
          setSyncing(false);
          fetchJamaah(page);
        }
      } catch { /* ignore polling errors */ }
    }, 3000);
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // ── Delete credentials ──
  const handleDeleteCreds = async () => {
    setDeletingCreds(true);
    try {
      await fetch('/api/laporan/credentials', { method: 'DELETE', headers: { ...getAuthHeaders() } });
      setView('login');
      setConnectedUser('');
      setData(null);
      onConnectionChange?.(false, '');
    } catch { /* ignore */ }
    setDeletingCreds(false);
  };

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
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-emerald-500" />
        <span className="ml-2 text-sm text-gray-500 dark:text-slate-400">Memeriksa status...</span>
      </div>
    );
  }
  if (view === 'syncing') {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        {/* 3 bouncing dots */}
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-bounce" style={{animationDelay: '0ms'}} />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-bounce" style={{animationDelay: '150ms'}} />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-bounce" style={{animationDelay: '300ms'}} />
        </div>
        <p className="text-sm font-medium text-gray-500 dark:text-slate-400 mt-4">Menyinkronkan data jamaah...</p>
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

  // ── Data View ──
  if (view === 'data') {
    const SORT_OPTIONS: { key: SortKey; label: string }[] = [
      { key: 'nama', label: 'Nama (A-Z)' },
      { key: 'sisa_desc', label: 'Sisa terbesar' },
      { key: 'berangkat', label: 'Berangkat terdekat' },
      { key: 'terbaru', label: 'Terbaru' },
    ];

    return (
      <div className="px-4 pt-4 pb-8 space-y-2">

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
            <div className="border-t border-gray-50 dark:border-slate-700/50 px-3 py-2.5 space-y-2.5">
              {/* Status pills */}
              <div className="flex gap-1.5">
                {([
                  ['semua', `Semua (${data?.counts.semua ?? 0})`],
                  ['belum', `Belum Lunas (${data?.counts.belumLunas ?? 0})`],
                  ['berangkat', `Berangkat (${data?.counts.berangkat ?? 0})`],
                ] as [StatusFilter, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => { setStatusFilter(key); setPage(1); }}
                    className={`flex-1 h-7 px-2.5 py-0 rounded-lg text-[10px] font-bold transition-all ${
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
                  className="w-full h-7 appearance-none pl-7 pr-3 py-0 bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-700 rounded-xl text-[11px] font-semibold text-gray-600 dark:text-slate-300 outline-none cursor-pointer"
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
                  ? `Belum Lunas (${data?.counts.belumLunas ?? 0})`
                  : `Berangkat (${data?.counts.berangkat ?? 0})`
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
              Menyinkronkan sisa data...
            </span>
          ) : (
            <span className="text-[10px] text-gray-400 dark:text-slate-500">
              Sync: {formatSyncTime(data?.lastSync || null)}
            </span>
          )}
          <button
            onClick={() => handleSync()}
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
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-emerald-500" />
          </div>
        ) : data?.items.length === 0 ? (
          <div className="text-center py-12">
            {searchQuery ? (
              <p className="text-xs text-gray-400 dark:text-slate-500">Tidak ada jamaah yang cocok dengan pencarian</p>
            ) : (
              <>
                <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Belum ada data untuk {hijriahYear} H</p>
                <button
                  onClick={() => handleSync(false, hijriahYear)}
                  disabled={syncing}
                  className="mt-3 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-50"
                >
                  {syncing ? 'Syncing...' : 'Sync Sekarang'}
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {data?.items.map(item => {
              const isExpanded = expandedId === item.id;
              const isLunas = item.sisa === 0 && item.bayar > 0;
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

              return (
                <div
                  key={item.id}
                  className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden"
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
                      {isLunas && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-800 flex items-center justify-center">
                          <Check size={9} className="text-white" strokeWidth={3} />
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
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {isLunas ? (
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">✓ Lunas</span>
                      ) : item.sisa > 0 ? (
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">{formatShort(item.sisa)}</span>
                      ) : (
                        <span className="text-[10px] text-gray-400">—</span>
                      )}
                      {daysUntil > 0 && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          daysUntil <= 10
                            ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                            : daysUntil <= 30
                              ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                              : 'bg-gray-50 dark:bg-slate-700 text-gray-400 dark:text-slate-500'
                        }`}>
                          ✈ {daysUntil}hr
                        </span>
                      )}
                    </div>

                    {/* Chevron */}
                    <ChevronDown size={14} className={`text-gray-300 dark:text-slate-600 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-3 pb-3 pt-2 border-t border-gray-50 dark:border-slate-700/50 space-y-3">
                      {/* Section 1: Payment card */}
                      <div className="bg-gray-50 dark:bg-slate-900/50 rounded-xl p-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Pembayaran</span>
                          <span className={`text-[10px] font-bold ${isLunas ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{pct}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isLunas ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[10px] text-gray-500 dark:text-slate-400">Bayar <span className="font-semibold text-gray-700 dark:text-slate-200">{formatRupiah(item.bayar)}</span></span>
                          <span className="text-[10px] text-gray-500 dark:text-slate-400">Sisa <span className={`font-semibold ${isLunas ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{isLunas ? 'Lunas' : formatRupiah(item.sisa)}</span></span>
                        </div>
                      </div>

                      {/* Section 2: Info grid 2x2 */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide">📱 WhatsApp</p>
                          {item.wa ? (
                            <a href={`https://wa.me/${item.wa.replace(/^0/, '62').replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{item.wa}</a>
                          ) : (
                            <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">-</p>
                          )}
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide">🎂 Tgl Lahir</p>
                          <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">{formatDate(item.tgl_lahir)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide">📋 Daftar</p>
                          <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">{formatDate(item.tgl_daftar)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide">✈️ Berangkat</p>
                          <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">{formatDate(item.tgl_berangkat)}</p>
                        </div>
                      </div>

                      {/* Section 3: Action buttons */}
                      <div className="flex gap-2">
                        {item.wa && (
                          <a
                            href={`https://wa.me/${item.wa.replace(/^0/, '62').replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all active:scale-95 ${item.sisa > 0 ? 'flex-1' : 'w-full'}`}
                          >
                            <MessageCircle size={12} /> WhatsApp
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
                  )}
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
        <div className="px-5 pt-6 pb-5 text-center border-b border-gray-50 dark:border-slate-700/50">
          <img
            src="/logo-alhijaz.webp"
            alt="Alhijaz"
            className="w-14 h-14 mx-auto mb-3 rounded-2xl object-contain"
          />
          <h2 className="text-base font-bold text-gray-800 dark:text-white">Login Sistem Internal</h2>
          <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">Masukkan kredensial untuk sinkronisasi data jamaah</p>
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
              placeholder="SMxxxx"
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
                placeholder="Masukkan password"
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

        {/* Delete saved credentials */}
        {connectedUser && view === 'login' && (
          <div className="px-5 pb-5 -mt-1">
            <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/15 border border-blue-100 dark:border-blue-800/30 rounded-xl">
              <div className="flex items-center gap-1.5">
                <KeyRound size={12} className="text-blue-500 dark:text-blue-400" />
                <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                  Credentials tersimpan
                </span>
              </div>
              <button
                onClick={handleDeleteCreds}
                disabled={deletingCreds}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
              >
                {deletingCreds ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                Hapus
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
