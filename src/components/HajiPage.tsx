import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Loader2, ChevronDown,
  ChevronLeft, ChevronRight, RefreshCw,
  SlidersHorizontal, Landmark, Phone, MapPin, Check,
  FileText, MessageCircle, User, Lock, Eye, EyeOff, LogIn,
  KeyRound, Trash2,
} from 'lucide-react';
import { getAuthHeaders } from './LoginPage';

// ── WhatsApp SVG icon ──
function WaIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ── Types ──
interface HajiJamaah {
  agent_slug: string;
  id_haji: string;
  id_jamaah: string;
  nama: string | null;
  jk: string | null;
  alamat: string | null;
  telp: string | null;
  thn_hijriyah: string | null;
  thn_masehi: string | null;
  perwakilan: string | null;
  marketing: string | null;
  paket: string | null;
  staff: string | null;
  jenis: string | null;
  status_bayar: string | null;
  status_berangkat: string | null;
  bpih_url: string | null;
  surat_pernyataan_url: string | null;
  synced_at: string | null;
}

interface HajiStats {
  total: number;
  uniqueHaji: number;
  lunas: number;
  cicilan: number;
  belumBayar: number;
  byTahun: Record<string, number>;
  byJenis: Record<string, number>;
}

type ViewState = 'loading' | 'login' | 'connecting' | 'data';


function resolveInternalUrl(url: string | null): string {
  if (!url) return '';
  // Proxy through our server to avoid Mixed Content (HTTPS→HTTP) blocking
  return `/api/haji/doc-proxy?url=${encodeURIComponent(url)}`;
}

// ── Status color helpers ──
function getStatusColors(status: string | null) {
  const s = (status || '').toUpperCase();
  if (s === 'LUNAS') return {
    avatar: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    badge: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/30',
  };
  if (s === 'CICILAN') return {
    avatar: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    badge: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/30',
  };
  if (s === 'LEBIH BAYAR') return {
    avatar: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    badge: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30',
  };
  return {
    avatar: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    badge: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30',
  };
}

// ── Sync time formatter ──
function formatSyncTime(d: string | null) {
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
}

// ── Document Viewer with auth proxy ──
function DocViewerPopup({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState(true);
  const [docError, setDocError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url, { headers: { ...getAuthHeaders() } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (!cancelled) {
          setBlobUrl(URL.createObjectURL(blob));
          setDocLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setDocError(err.message || 'Gagal memuat dokumen');
          setDocLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [blobUrl]);

  return (
    <motion.div
      className="fixed inset-0 z-[9999] bg-white dark:bg-slate-900 flex flex-col"
      initial={{ opacity: 0, y: '100%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700 shrink-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl">
        <div className="flex flex-col min-w-0">
          <p className="text-sm font-bold text-gray-800 dark:text-white truncate">{title}</p>
          <span className="text-[10px] text-gray-400 dark:text-slate-500">Dokumen</span>
        </div>
        <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-slate-800 rounded-full text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors shrink-0">
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/></svg>
        </button>
      </div>

      {/* Content */}
      {docLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-emerald-500" />
        </div>
      ) : docError ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8">
          <p className="text-sm text-red-500 font-medium text-center">{docError}</p>
          <button onClick={onClose} className="text-xs text-gray-500 underline">Tutup</button>
        </div>
      ) : (
        <iframe
          src={blobUrl || ''}
          className="flex-1 w-full bg-gray-100 dark:bg-slate-950"
          title={title}
        />
      )}

      {/* Footer with share */}
      {blobUrl && (
        <div className="shrink-0 p-4 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <button
            onClick={async () => {
              if (navigator.share) {
                try {
                  const res = await fetch(blobUrl);
                  const blob = await res.blob();
                  const file = new File([blob], `${title}.pdf`, { type: blob.type });
                  await navigator.share({ title, files: [file] });
                } catch (err: any) {
                  if (err?.name !== 'AbortError') window.open(blobUrl, '_blank');
                }
              } else {
                window.open(blobUrl, '_blank');
              }
            }}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]"
          >
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx={18} cy={5} r={3}/><circle cx={6} cy={12} r={3}/><circle cx={18} cy={19} r={3}/><line x1={8.59} y1={13.51} x2={15.42} y2={17.49}/><line x1={15.41} y1={6.51} x2={8.59} y2={10.49}/></svg>
            Bagikan Dokumen
          </button>
        </div>
      )}
    </motion.div>
  );
}

interface HajiPageProps {
  jamaahConnected?: boolean;
  jamaahUser?: string;
  onConnectionChange?: (connected: boolean, user: string) => void;
}

export default function HajiPage({ jamaahConnected, jamaahUser, onConnectionChange }: HajiPageProps) {
  const [view, setView] = useState<ViewState>('loading');

  // Login
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Connected
  const [connectedUser, setConnectedUser] = useState(jamaahUser || '');
  const [error, setError] = useState('');
  const [deletingCreds, setDeletingCreds] = useState(false);

  // Data
  const [jamaahList, setJamaahList] = useState<HajiJamaah[]>([]);
  const [stats, setStats] = useState<HajiStats | null>(null);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [thnMasehi, setThnMasehi] = useState('');
  const [jenisFilter, setJenisFilter] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 10;

  // UI
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [backgroundSyncing, setBackgroundSyncing] = useState(false);
  const [syncedCount, setSyncedCount] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [docViewer, setDocViewer] = useState<{ url: string; title: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAutoSynced = useRef(false);

  const tahunOptions = stats ? Object.keys(stats.byTahun).sort((a, b) => b.localeCompare(a)) : [];

  // ── Check status on mount ──
  useEffect(() => {
    if (view === 'connecting') return;
    if (jamaahConnected && jamaahUser) {
      setConnectedUser(jamaahUser);
      setView('data');
      return;
    }
    if (!jamaahConnected && view === 'data') {
      setView('login');
      setConnectedUser('');
      setJamaahList([]);
      setStats(null);
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

  // ── Search debounce ──
  useEffect(() => {
    const timer = setTimeout(() => { setSearchQuery(search); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Fetch stats ──
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/haji/stats', { headers: { ...getAuthHeaders() } });
      const result = await res.json();
      if (result.success) setStats(result.data);
    } catch { /* ignore */ }
  }, []);

  // ── Fetch jamaah list ──
  const fetchJamaah = useCallback(async (p = page) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (searchQuery) params.set('search', searchQuery);
      if (thnMasehi) params.set('thn_masehi', thnMasehi);
      if (jenisFilter) params.set('jenis', jenisFilter);
      const res = await fetch(`/api/haji/jamaah?${params}`, { headers: { ...getAuthHeaders() } });
      const result = await res.json();
      if (result.success) {
        setJamaahList(result.data || []);
        setTotal(result.total || 0);
        if (result.data?.length > 0) setLastSync(result.data[0].synced_at);
      } else {
        setError(result.error || 'Gagal memuat data');
      }
    } catch {
      setError('Gagal menghubungi server');
    }
    setLoading(false);
  }, [searchQuery, thnMasehi, jenisFilter, page]);

  // ── Load data when view=data ──
  useEffect(() => {
    if (view === 'data') {
      fetchStats();
      fetchJamaah(page);
    }
  }, [view, searchQuery, thnMasehi, jenisFilter, page]);

  // ── Auto-sync on first load if connected but no data ──
  useEffect(() => {
    if (view === 'data' && !loading && !syncing && !hasAutoSynced.current && total === 0 && jamaahList.length === 0) {
      hasAutoSynced.current = true;
      handleSync();
    }
  }, [view, loading, total, jamaahList.length]);

  // ── Login ──
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
      setView('data');
      handleSync();
    } catch {
      setError('Gagal menghubungi server');
      setView('login');
    }
  };

  // ── Sync handler (progressive — same as Umroh) ──
  const handleSync = async () => {
    setSyncing(true);
    setError('');
    setSyncedCount(0);

    try {
      const res = await fetch('/api/haji/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        setError(result.error || 'Gagal sync data haji');
        setSyncing(false);
        return;
      }

      // First batch arrived — show data immediately
      setPage(1);
      await fetchStats();
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
    }
  };

  // ── Polling for background sync status (same as Umroh) ──
  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/laporan/sync-status', { headers: { ...getAuthHeaders() } });
        const result = await res.json();
        if (result.success) {
          if (result.data.totalSynced) setSyncedCount(result.data.totalSynced);
          if (!result.data.isSyncing) {
            // Sync complete — stop polling & refresh
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setBackgroundSyncing(false);
            setSyncing(false);
            await fetchStats();
            fetchJamaah(page);
          }
        }
      } catch { /* ignore polling errors */ }
    }, 3000);
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    if (view !== 'data') return;
    const autoRef = setInterval(() => {
      if (!syncing && !backgroundSyncing) fetchJamaah(page);
    }, 5 * 60 * 1000);
    return () => clearInterval(autoRef);
  }, [view, syncing, backgroundSyncing, fetchJamaah, page]);

  // ── Delete credentials ──
  const handleDeleteCreds = async () => {
    setDeletingCreds(true);
    try {
      await fetch('/api/laporan/credentials', { method: 'DELETE', headers: { ...getAuthHeaders() } });
      setView('login');
      setConnectedUser('');
      setJamaahList([]);
      setStats(null);
      onConnectionChange?.(false, '');
    } catch { /* ignore */ }
    setDeletingCreds(false);
  };

  const totalPages = Math.ceil(total / LIMIT);

  // ── Loading ──
  if (view === 'loading') {
    return (
      <div className="space-y-2">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm px-3 py-1.5 flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded bg-gray-200 dark:bg-slate-700 animate-pulse shrink-0" />
          <div className="flex-1 h-9 rounded-lg bg-gray-100 dark:bg-slate-700/40 animate-pulse" />
          <div className="h-9 w-14 rounded-lg bg-gray-100 dark:bg-slate-700/40 animate-pulse shrink-0" />
          <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-slate-700/40 animate-pulse shrink-0" />
        </div>
        <div className="space-y-1.5">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm px-3 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-slate-700 animate-pulse shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="h-4 w-40 rounded-md bg-gray-200 dark:bg-slate-700 animate-pulse" />
                <div className="h-3 w-28 rounded-md bg-gray-100 dark:bg-slate-700/60 animate-pulse mt-1.5" />
              </div>
              <div className="h-4 w-14 rounded-md bg-gray-200 dark:bg-slate-700 animate-pulse shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Connecting ──
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
    return (
      <>
      <div className={`space-y-2 transition-opacity ${loading && jamaahList.length > 0 ? 'opacity-50 pointer-events-none' : ''}`}>

        {/* Command bar — identical to JamaahPage */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5">
            <Search size={14} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari jamaah..."
              className="flex-1 h-9 bg-transparent text-xs text-gray-800 dark:text-white placeholder:text-gray-400 outline-none min-w-0"
            />
            <select
              value={thnMasehi}
              onChange={e => { setThnMasehi(e.target.value); setPage(1); }}
              className="h-9 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0 rounded-lg border border-emerald-200 dark:border-emerald-800/40 outline-none cursor-pointer shrink-0"
            >
              <option value="">Tahun</option>
              {tahunOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all active:scale-95 shrink-0 ${
                showFilters || jenisFilter
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
              }`}
            >
              <SlidersHorizontal size={14} />
            </button>
          </div>

          {showFilters && (
            <div className="border-t border-gray-50 dark:border-slate-700/50 px-3 py-2.5">
              <div className="flex gap-1.5">
                {([
                  ['', 'Semua'],
                  ['HAJI KEMENAG', 'Kemenag'],
                  ['AMITRA', 'Amitra'],
                ] as [string, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => { setJenisFilter(key); setPage(1); }}
                    className={`flex-1 h-8 px-2 py-0 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all ${
                      jenisFilter === key
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                        : 'bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-[11px] text-red-600 dark:text-red-400 font-medium text-center">
            {error}
          </div>
        )}

        {/* Sync info — identical to JamaahPage */}
        <div className="flex items-center justify-between px-1">
          {syncing ? (
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Menyinkronkan data haji...
            </span>
          ) : (
            <span className="text-[10px] text-gray-400 dark:text-slate-500">
              Sync: {formatSyncTime(lastSync)}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:opacity-70 transition-opacity disabled:opacity-50"
          >
            <RefreshCw size={10} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Ulang'}
          </button>
        </div>

        {/* Empty / Syncing State — matches Umroh */}
        {!loading && jamaahList.length === 0 && !error && (
          <div className="text-center py-16">
            {syncing ? (
              <>
                <div className="relative w-36 h-24 mb-4 mx-auto">
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
                <div className="flex gap-1.5 mb-3 justify-center">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" style={{animation: 'syncBounce 0.6s ease-in-out infinite alternate'}} />
                  <div className="w-2 h-2 rounded-full bg-emerald-500" style={{animation: 'syncBounce 0.6s ease-in-out infinite alternate', animationDelay: '150ms'}} />
                  <div className="w-2 h-2 rounded-full bg-emerald-500" style={{animation: 'syncBounce 0.6s ease-in-out infinite alternate', animationDelay: '300ms'}} />
                </div>
                <p className="text-sm font-medium text-gray-500 dark:text-slate-400">Menyinkronkan data haji...</p>
                <style>{`
                  @keyframes syncFly { 0%, 100% { transform: translateX(-20px) rotate(-2deg); } 50% { transform: translateX(20px) rotate(2deg); } }
                  @keyframes syncFloat { 0%, 100% { transform: translateY(0); opacity: 0.4; } 50% { transform: translateY(-6px); opacity: 0.7; } }
                  @keyframes syncBounce { 0% { transform: translateY(0); } 100% { transform: translateY(-6px); } }
                `}</style>
              </>
            ) : searchQuery ? (
              <p className="text-xs text-gray-400 dark:text-slate-500">Tidak ada data yang cocok dengan pencarian</p>
            ) : (
              <>
                <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Belum ada data haji{thnMasehi ? ` untuk ${thnMasehi}` : ''}</p>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="mt-3 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-50"
                >
                  Sync Sekarang
                </button>
              </>
            )}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && jamaahList.length === 0 && (
          <div className="space-y-1.5">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm px-3 py-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-slate-700 animate-pulse shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="h-4 w-40 rounded-md bg-gray-200 dark:bg-slate-700 animate-pulse" />
                  <div className="h-3 w-28 rounded-md bg-gray-100 dark:bg-slate-700/60 animate-pulse mt-1.5" />
                </div>
                <div className="h-4 w-14 rounded-md bg-gray-200 dark:bg-slate-700 animate-pulse shrink-0" />
                <div className="w-3.5 h-3.5 rounded bg-gray-100 dark:bg-slate-700/40 animate-pulse shrink-0" />
              </div>
            ))}
          </div>
        )}

        {/* Jamaah List */}
        {jamaahList.length > 0 && (
          <div className={`space-y-1.5 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
            {jamaahList.map(item => {
              const itemKey = `${item.id_haji}-${item.id_jamaah}`;
              const isExpanded = expandedId === itemKey;
              const isLunas = (item.status_bayar || '').toUpperCase() === 'LUNAS';
              const initials = (item.nama || '?').split(' ').slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('');
              const genderRing = item.jk === 'P' ? 'ring-2 ring-pink-300' : 'ring-2 ring-blue-300';

              return (
                <div
                  key={itemKey}
                  className={`bg-white dark:bg-slate-800 rounded-2xl border shadow-sm overflow-hidden transition-all duration-200 ${
                    isExpanded
                      ? 'border-emerald-200 dark:border-emerald-800/40 shadow-md shadow-emerald-500/5'
                      : 'border-gray-100 dark:border-slate-700'
                  }`}
                >
                  {/* Collapsed row — matches Umroh */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : itemKey)}
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
                      <p className="text-sm font-bold text-gray-800 dark:text-white truncate">{item.nama || '-'}</p>
                      <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5 truncate">
                        {item.id_haji} • {item.paket || '-'}
                      </p>
                    </div>

                    {/* Year right */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400">{item.thn_masehi || '-'}</span>
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

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        key="expanded"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{
                          height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
                          opacity: { duration: 0.2, ease: 'easeInOut' },
                        }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div className="border-t border-gray-50 dark:border-slate-700/50">
                          <div className="px-3 py-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                            <div>
                              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Thn Hijriyah</p>
                              <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">{item.thn_hijriyah || '-'} {item.thn_masehi ? `(${item.thn_masehi})` : ''}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Jenis</p>
                              <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">{item.jenis || '-'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Perwakilan</p>
                              <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">{item.perwakilan || '-'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Marketing</p>
                              <p className="text-xs font-semibold text-gray-700 dark:text-slate-200 truncate">{item.marketing || '-'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Staff</p>
                              <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">{item.staff || '-'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Status</p>
                              <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">{item.status_bayar || '-'}</p>
                            </div>
                          </div>

                          {(item.telp || item.alamat) && (
                            <div className="px-3 pb-2.5 space-y-1.5">
                              {item.telp && (
                                <a href={`tel:${item.telp}`} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                                  <Phone size={12} className="text-gray-400 shrink-0" />
                                  {item.telp}
                                </a>
                              )}
                              {item.alamat && (
                                <div className="flex items-start gap-1.5">
                                  <MapPin size={12} className="text-gray-400 shrink-0 mt-0.5" />
                                  <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-2">{item.alamat}</p>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="px-3 py-2.5 flex items-center gap-2 border-t border-gray-50 dark:border-slate-700/50">
                            {item.bpih_url && (
                              <button
                                onClick={() => setDocViewer({ url: resolveInternalUrl(item.bpih_url), title: `BPIH - ${item.nama}` })}
                                className="flex-[3] flex items-center justify-center gap-1.5 text-[11px] font-semibold text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20 px-2 py-2 rounded-xl border border-blue-100 dark:border-blue-800/40 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors active:scale-95">
                                <FileText size={13} /> BPIH
                              </button>
                            )}
                            {item.surat_pernyataan_url && (
                              <button
                                onClick={() => setDocViewer({ url: resolveInternalUrl(item.surat_pernyataan_url), title: `Pernyataan - ${item.nama}` })}
                                className="flex-[5] flex items-center justify-center gap-1.5 text-[11px] font-semibold text-violet-600 bg-violet-50 dark:text-violet-400 dark:bg-violet-900/20 px-2 py-2 rounded-xl border border-violet-100 dark:border-violet-800/40 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors active:scale-95">
                                <FileText size={13} /> Pernyataan
                              </button>
                            )}
                            {item.telp && (
                              <a
                                href={`https://wa.me/${item.telp.replace(/^0/, '62').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Assalamualaikum ${item.nama || ''}, saya dari Alhijaz Indowisata ingin menginformasikan terkait pendaftaran haji Anda (${item.id_haji}).`)}`}
                                target="_blank" rel="noopener noreferrer"
                                className="flex-[2] flex items-center justify-center text-white bg-emerald-500 py-2 rounded-xl shadow-sm shadow-emerald-500/20 hover:bg-emerald-600 transition-colors active:scale-95">
                                <WaIcon size={16} />
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
        {totalPages > 1 && (
          <div className="flex flex-col items-center gap-2 pt-1">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100/80 dark:bg-slate-800/80 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-30"
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) pageNum = i + 1;
                else if (page <= 3) pageNum = i + 1;
                else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = page - 2 + i;
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
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100/80 dark:bg-slate-800/80 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-30"
              >
                <ChevronRight size={14} />
              </button>
            </div>
            <span className="text-[10px] text-gray-400 dark:text-slate-500">
              {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} dari {total} jamaah
            </span>
          </div>
        )}
      </div>

      {/* Document viewer popup — full screen with animation */}
      <AnimatePresence>
        {docViewer && (
          <DocViewerPopup
            url={docViewer.url}
            title={docViewer.title}
            onClose={() => setDocViewer(null)}
          />
        )}
      </AnimatePresence>
      </>
    );
  }

  // ── Login Form — identical to JamaahPage ──
  return (
    <div>
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-4 text-center border-b border-gray-50 dark:border-slate-700/50">
          <img src="/logo-alhijaz.webp" alt="Alhijaz" className="h-auto mx-auto mb-3 rounded-xl object-contain" style={{ width: '8rem' }} />
          <h2 className="text-[15px] font-bold text-gray-800 dark:text-white">AIW Agent Login</h2>
          <p className="text-[12px] text-gray-500 dark:text-slate-500 mt-0.5">Login untuk sinkronisasi data jamaah.</p>
        </div>

        <form onSubmit={handleLogin} className="p-5 space-y-4">
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
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {error && (
            <div className="flex items-center justify-center gap-1.5 py-2">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span className="text-xs font-medium text-red-500">{error}</span>
            </div>
          )}
          <button type="submit"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95">
            <LogIn size={16} /> Login
          </button>
        </form>

        {connectedUser && view === 'login' && (
          <div className="px-5 pb-5 -mt-1">
            <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/15 border border-blue-100 dark:border-blue-800/30 rounded-xl">
              <div className="flex items-center gap-1.5">
                <KeyRound size={12} className="text-blue-500 dark:text-blue-400" />
                <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">Credentials tersimpan</span>
              </div>
              <button onClick={handleDeleteCreds} disabled={deletingCreds}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50">
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
