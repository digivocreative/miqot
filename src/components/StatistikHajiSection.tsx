import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Users, Wallet, Clock, TrendingUp, RefreshCw } from 'lucide-react';
import { getAuthHeaders } from './LoginPage';

// ── Types ──
export interface HajiStatsData {
  total: number;
  uniqueHaji: number;
  lunas: number;
  cicilan: number;
  belumBayar: number;
  lebihBayar: number;
  lunasPercent: number;
  availableYears: string[];
  masehiYear: string | null;
  lastSync: string | null;
  komisi: {
    rate: number;
    stage1: number;
    stage2: number;
    totalKomisi: number;
    sudahCair: number;
    sudahCairCount: number;
    belumCair: number;
    belumCairCount: number;
    potensi: number;
    potensiCount: number;
    breakdownTahun: Array<{
      tahun: string;
      total: number;
      lunas: number;
      cicilan: number;
      belumBayar: number;
      komisiCair: number;
      komisiTotal: number;
    }>;
  };
}

// ── Formatters ──
function fmtUSD(n: number): string {
  if (!n) return '$0';
  if (n >= 1000) return `$${(n / 1000).toFixed(1).replace('.0', '')}k`;
  return `$${n.toLocaleString('en-US')}`;
}

function fmtUSDFull(n: number): string {
  return `$${(n || 0).toLocaleString('en-US')}`;
}

function fmtSync(d: string | null): string {
  if (!d) return '-';
  try {
    const date = new Date(d);
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ', ' + date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB';
  } catch { return d; }
}

// ── Skeleton ──
function HajiSkeleton() {
  const pulse = 'bg-gray-200 dark:bg-slate-700 animate-pulse';
  const card = 'bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm';
  return (
    <div className="px-4 pt-4 pb-8 space-y-3 max-w-lg mx-auto">
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`${card} p-3.5`}>
            <div className={`w-8 h-8 rounded-lg ${pulse}`} />
            <div className={`h-7 w-16 rounded-md ${pulse} mt-3`} />
            <div className={`h-3 w-24 rounded-md ${pulse} mt-2`} />
          </div>
        ))}
      </div>
      <div className={`${card} p-4 h-48`} />
      <div className={`${card} p-4 h-48`} />
    </div>
  );
}

// ── Component ──
interface Props {
  selectedYear: string;
  onYearsLoaded?: (years: string[]) => void;
}

export default function StatistikHajiSection({ selectedYear, onYearsLoaded }: Props) {
  const [data, setData] = useState<HajiStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onYearsLoadedRef = useRef(onYearsLoaded);
  onYearsLoadedRef.current = onYearsLoaded;

  const fetchStats = useCallback(async (year?: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      const yr = year !== undefined ? year : selectedYear;
      if (yr) params.set('year', yr);
      const res = await fetch(`/api/haji/stats?${params}`, { headers: { ...getAuthHeaders() } });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        onYearsLoadedRef.current?.(json.data.availableYears || []);
      } else {
        setError(json.error || 'Gagal memuat statistik haji');
      }
    } catch {
      setError('Gagal menghubungi server');
    }
    setLoading(false);
  }, [selectedYear]);

  useEffect(() => { fetchStats(selectedYear); }, [selectedYear, fetchStats]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/haji/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      });
      const result = await res.json();
      if (!result.success) { setSyncing(false); return; }

      if (pollRef.current) clearInterval(pollRef.current);
      const pollStart = Date.now();
      pollRef.current = setInterval(async () => {
        if (Date.now() - pollStart > 5 * 60 * 1000) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setSyncing(false);
          fetchStats(selectedYear);
          return;
        }
        try {
          const sr = await fetch('/api/haji/sync-status', {
            headers: { ...getAuthHeaders() },
            signal: AbortSignal.timeout(10000),
          });
          const st = await sr.json();
          if (st.success && !st.data.isSyncing) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setSyncing(false);
            fetchStats(selectedYear);
          }
        } catch { /* ignore single failure, keep polling */ }
      }, 3000);
    } catch { setSyncing(false); }
  };

  if (loading && !data) return <HajiSkeleton />;

  if (error && !data) {
    return (
      <div className="px-4 pt-6">
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl text-center">
          <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-3">{error}</p>
          <button onClick={() => fetchStats(selectedYear)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500 text-white shadow-md shadow-red-500/20 hover:bg-red-600 transition-all active:scale-95">
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isEmpty = data.total === 0 && !data.lastSync;
  const isEmptyForYear = data.total === 0 && !!data.lastSync;
  const belumLunasCount = data.cicilan + data.belumBayar;

  if (isEmpty) {
    return (
      <div className="px-4 pt-10 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center">
          <Users size={28} className="text-gray-300 dark:text-slate-600" />
        </div>
        <p className="text-sm font-semibold text-gray-600 dark:text-slate-300">Belum ada data jamaah haji</p>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Sync di halaman Haji dulu.</p>
      </div>
    );
  }

  return (
    <div className={`px-4 pt-4 pb-8 space-y-3 max-w-lg mx-auto transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>

      {isEmptyForYear ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-6 text-center">
          <p className="text-sm text-gray-500 dark:text-slate-400">Belum ada jamaah haji untuk tahun ini.</p>
        </div>
      ) : (
        <>
          {/* ── Headline 4 cards ── */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Total Jamaah */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center border border-emerald-100 dark:border-emerald-800/40 mb-2">
                <Users size={16} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">{data.total}</p>
              <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium">Total Jamaah</p>
            </div>

            {/* Komisi Cair */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center border border-emerald-100 dark:border-emerald-800/40 mb-2">
                <Wallet size={16} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{fmtUSD(data.komisi.sudahCair)}</p>
              <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium">Komisi Cair (USD)</p>
            </div>

            {/* Belum Lunas */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center border border-amber-100 dark:border-amber-800/40 mb-2">
                <Clock size={16} className="text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">{belumLunasCount}</p>
              <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium">Belum Lunas</p>
              <p className="text-[9px] text-gray-400 dark:text-slate-500 mt-0.5">{data.cicilan} cicilan · {data.belumBayar} belum bayar</p>
            </div>

            {/* % Pelunasan */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center border border-blue-100 dark:border-blue-800/40 mb-2">
                <TrendingUp size={16} className="text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{data.lunasPercent}%</p>
              <p className="text-[10px] text-gray-400 dark:text-slate-400 font-medium">% Pelunasan</p>
              <p className="text-[9px] text-gray-400 dark:text-slate-500 mt-0.5">{data.lunas + data.lebihBayar} dari {data.total} lunas</p>
            </div>
          </div>

          {/* Komisi card + Breakdown chart added in Task 4 */}
        </>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-gray-300 dark:text-slate-500">Data per sync terakhir · {fmtSync(data.lastSync)}</span>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors disabled:opacity-50">
          {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          <span className={syncing ? 'animate-pulse' : ''}>{syncing ? 'Syncing...' : 'Sync Ulang'}</span>
        </button>
      </div>
    </div>
  );
}
