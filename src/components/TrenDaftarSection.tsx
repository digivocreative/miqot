import { useState, useEffect, useCallback, useRef } from 'react';
import {
  TrendingDown, Clock,
  CheckCircle, Package, ChevronDown, ChevronUp,
} from 'lucide-react';
import { getAuthHeaders } from './LoginPage';
import { pickNearestMasehiYear } from './StatistikPage';
import FilterDropdown from './FilterDropdown';
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area,
  CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts';
import { trackEvent } from '../utils/analytics';

// ── Types ──

interface TrenSummary {
  totalDaftar: number; totalDaftarPrev: number; growthPct: number; avgPerMonth: number;
  growthMonths: number; growthLabel: string;
  peakMonth: string; peakMonthCount: number; slowestMonth: string; slowestMonthCount: number;
}

interface MonthlyItem { month: number; label: string; count: number; countPrev: number; }
interface RevenueMonthly { month: number; label: string; total: number; }
interface AgentRank { slug: string; name: string; photo: string; count: number; }
interface PaketRank { paket: string; count: number; pct: number; }
interface DistItem { range: string; pct: number; }
interface AgeItem { range: string; count: number; pct: number; }

interface TrenData {
  period: string; periodPrev: string;
  summary: TrenSummary;
  monthly: MonthlyItem[];
  heatmap: Record<string, number[]>;
  revenue: { totalMasuk: number; avgPerMonth: number; monthly: RevenueMonthly[]; };
  insights: { leadTimeAvg: number; conversionRate: number; conversionRateBerangkat: number; sudahBerangkat: number; totalJamaah: number; lunasCount: number; topPaket: string; };
  gender: { perempuan: number; lakiLaki: number; };
  ageDistribution: AgeItem[];
  ageAvg: number;
  leadTimeDistribution: DistItem[];
  daftarVsBerangkat: number[][];
  agentRanking: AgentRank[];
  paketRanking: PaketRank[];
}

interface HajiYearsData { keberangkatan: string[]; pendaftaran: string[]; }
type HajiRankingMode = 'pendaftaran' | 'keberangkatan';

// ── Helpers ──

function fmtRpShort(n: number): string {
  if (!n) return 'Rp0';
  if (n >= 1_000_000_000) return `Rp${(n / 1_000_000_000).toFixed(1).replace('.0', '')}M`;
  if (n >= 1_000_000) { const j = n / 1_000_000; return `Rp${j % 1 === 0 ? j : j.toFixed(1)}jt`; }
  if (n >= 1_000) return `Rp${Math.round(n / 1_000)}rb`;
  return `Rp${n.toLocaleString('id-ID')}`;
}

function fmtRp(n: number): string {
  if (!n) return 'Rp0';
  return `Rp${n.toLocaleString('id-ID')}`;
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// ── Card wrapper ──

function Card({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center justify-between">
        <p className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wide">{title}</p>
        {extra}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ── Reusable Agent Ranking List (pure render) ──

const RANK_BAR_COLORS = ['bg-emerald-500', 'bg-blue-500', 'bg-violet-500', 'bg-amber-500', 'bg-pink-500'];
const AVATAR_COLORS = ['bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400'];

function AgentRankingList({ agents }: { agents: AgentRank[] }) {
  const [showAll, setShowAll] = useState(false);
  const maxCount = agents[0]?.count || 1;
  const visible = showAll ? agents : agents.slice(0, 5);

  return (
    <>
      {visible.map((agent, i) => (
        <div key={agent.slug} className={`flex items-center gap-2.5 py-2 ${i < visible.length - 1 ? 'border-b border-gray-50 dark:border-slate-700/50' : ''}`}>
          <span className={`text-[10px] font-bold w-4 text-center ${i === 0 ? 'text-amber-500' : 'text-gray-500 dark:text-slate-400'}`}>#{i + 1}</span>
          {agent.photo ? (
            <img src={agent.photo} alt="" className="w-8 h-8 rounded-[10px] object-cover flex-shrink-0" />
          ) : (
            <div className={`w-8 h-8 rounded-[10px] flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
              {getInitials(agent.name)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-800 dark:text-white truncate">{agent.name}</p>
            <div className="h-2.5 bg-gray-100 dark:bg-slate-700 rounded-[4px] overflow-hidden mt-1">
              <div className={`h-full rounded-[4px] ${RANK_BAR_COLORS[i] || 'bg-gray-400'} transition-all duration-500`}
                style={{ width: `${(agent.count / maxCount) * 100}%` }} />
            </div>
          </div>
          <span className="text-xs font-bold text-gray-800 dark:text-white w-8 text-right">{agent.count}</span>
        </div>
      ))}
      {agents.length > 5 && (
        <button onClick={() => setShowAll(prev => !prev)}
          className="w-full py-2.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 transition-colors border-t border-gray-50 dark:border-slate-700/50 flex items-center justify-center gap-1">
          {showAll ? <><ChevronUp size={12} /> Tutup</> : <><ChevronDown size={12} /> Lihat semua agent</>}
        </button>
      )}
    </>
  );
}

// ── Umroh Agent Ranking Section (wraps list in Card) ──

function AgentRankingSection({ agents, year }: { agents: AgentRank[]; year: string }) {
  return (
    <Card title="Ranking Agent" extra={<span className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">{year}H</span>}>
      <AgentRankingList agents={agents} />
    </Card>
  );
}

// ── Haji Agent Ranking Section (independent fetch + mode toggle) ──

function HajiAgentRankingSection() {
  const [mode, setMode] = useState<HajiRankingMode>('pendaftaran');
  const [years, setYears] = useState<HajiYearsData>({ keberangkatan: [], pendaftaran: [] });
  const [yearsLoaded, setYearsLoaded] = useState(false);
  const [selectedYear, setSelectedYear] = useState('');
  const [data, setData] = useState<AgentRank[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  const activeYears = mode === 'keberangkatan' ? years.keberangkatan : years.pendaftaran;

  // Fetch years list once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/laporan/tren-daftar/haji-years', { headers: { ...getAuthHeaders() } });
        const json = await res.json();
        if (cancelled) return;
        if (json.success) {
          setYears(json.data);
          const initialActive = (mode === 'keberangkatan' ? json.data.keberangkatan : json.data.pendaftaran) as string[];
          setSelectedYear(pickNearestMasehiYear(initialActive));
          setYearsLoaded(true);
          // If both lists empty, no fetch will follow — clear loading here.
          if (!initialActive.length) { setData([]); setLoading(false); }
        } else {
          setError(json.error || 'Gagal memuat tahun haji');
          setLoading(false);
          setYearsLoaded(true);
        }
      } catch {
        if (!cancelled) { setError('Gagal terhubung ke server'); setLoading(false); setYearsLoaded(true); }
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When mode changes, re-pick selectedYear if current is not in new mode's list
  useEffect(() => {
    if (!yearsLoaded) return;
    if (!activeYears.length) {
      // Mode has no data → clear year, show empty state.
      if (selectedYear !== '') setSelectedYear('');
      setData([]);
      setLoading(false);
      return;
    }
    if (!activeYears.includes(selectedYear)) {
      setSelectedYear(pickNearestMasehiYear(activeYears));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, yearsLoaded]);

  // Fetch ranking whenever mode + year settle on a valid combo
  useEffect(() => {
    if (!yearsLoaded || !selectedYear) {
      // Initial mount (waiting for years) OR empty mode handled by mode-watcher effect.
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const res = await fetch(
          `/api/laporan/tren-daftar/haji-ranking?mode=${mode}&year=${selectedYear}`,
          { headers: { ...getAuthHeaders() } }
        );
        const json = await res.json();
        if (requestId !== requestIdRef.current) return; // stale response
        if (json.success) setData(json.data.ranking);
        else setError(json.error || 'Gagal memuat ranking haji');
      } catch {
        if (requestId === requestIdRef.current) setError('Gagal terhubung ke server');
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    })();
  }, [mode, selectedYear, yearsLoaded]);

  const headerExtra = (
    <div className="flex items-center gap-1.5">
      <div className="flex p-0.5 bg-gray-100 dark:bg-slate-700 rounded-md">
        {(['pendaftaran', 'keberangkatan'] as HajiRankingMode[]).map(m => (
          <button key={m}
            onClick={() => setMode(m)}
            className={`px-2 py-0.5 text-[9px] font-semibold rounded-[5px] transition-all ${
              mode === m
                ? 'bg-white dark:bg-slate-600 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-gray-400 dark:text-slate-400'
            }`}>
            {m === 'pendaftaran' ? 'Daftar' : 'Berangkat'}
          </button>
        ))}
      </div>
      <FilterDropdown
        variant="mini"
        value={selectedYear}
        onChange={setSelectedYear}
        options={activeYears.length === 0 ? [{ value: '', label: '—' }] : activeYears.map(y => ({ value: y, label: `${y} M` }))}
        ariaLabel="Pilih tahun"
        disabled={activeYears.length === 0}
        widthClass="shrink-0"
      />
    </div>
  );

  return (
    <Card title="Haji" extra={headerExtra}>
      {loading && (
        <div className="space-y-2 py-1">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-8 rounded bg-gray-100 dark:bg-slate-700 animate-pulse" />
          ))}
        </div>
      )}
      {!loading && error && (
        <p className="text-[11px] text-red-500 dark:text-red-400 text-center py-3">{error}</p>
      )}
      {!loading && !error && data && data.length === 0 && (
        <p className="text-[11px] text-gray-400 dark:text-slate-500 text-center py-3">
          {selectedYear
            ? `Belum ada data jamaah haji untuk tahun ${selectedYear} M`
            : 'Belum ada data jamaah haji'}
        </p>
      )}
      {!loading && !error && data && data.length > 0 && <AgentRankingList key={`${mode}-${selectedYear}`} agents={data} />}
    </Card>
  );
}

// ── Main Component ──

export default function TrenDaftarSection({ selectedYear }: { selectedYear: string }) {
  const [data, setData] = useState<TrenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const mounted = useRef(false);

  // Track page view once
  useEffect(() => { if (!mounted.current) { trackEvent('feature', 'open_tren_daftar'); mounted.current = true; } }, []);

  // Fetch tren data when year changes
  const fetchTren = useCallback(async (year: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/laporan/tren-daftar?hijriahYear=${year}`, { headers: { ...getAuthHeaders() } });
      const json = await res.json();
      if (json.success) setData(json.data);
      else setError(json.error || 'Gagal memuat data');
    } catch {
      setError('Gagal terhubung ke server');
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (selectedYear) fetchTren(selectedYear); }, [selectedYear, fetchTren]);

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const gridStroke = isDark ? '#1e293b' : '#f1f5f9';

  // Loading skeleton
  if (loading && !data) {
    return (
      <div className="px-4 pt-4 pb-8 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {[1,2,3,4].map(i => <div key={i} className="h-24 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />)}
        </div>
        <div className="h-52 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
        <div className="h-40 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
        <div className="h-40 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
      </div>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <div className="px-4 pt-4">
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl text-center">
          <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const d = data;

  return (
    <div className={`px-4 pt-4 pb-8 space-y-3 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>

      {/* Ranking Agent */}
      <AgentRankingSection agents={d.agentRanking} year={d.period} />

      {/* Ranking Agent Haji */}
      <HajiAgentRankingSection />

      {/* Section 2: Pendaftaran per Bulan */}
      <Card title="Pendaftaran per Bulan" extra={
        <span className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">{d.period}H vs {d.periodPrev}H</span>
      }>
        <div className="flex gap-3 mb-2">
          <span className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium"><span className="w-2 h-2 rounded-full bg-emerald-500" />{d.period}H</span>
          <span className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium"><span className="w-2 h-2 rounded-full bg-gray-300" />{d.periodPrev}H</span>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={d.monthly} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <Tooltip content={({ active, payload, label }: any) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-white dark:bg-slate-800 shadow-lg border border-gray-100 dark:border-slate-700 rounded-xl px-3 py-2">
                  <p className="text-[10px] text-gray-400 font-medium">{label}</p>
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{payload[0]?.value} jamaah</p>
                  {payload[1] && <p className="text-[10px] text-gray-400">{d.periodPrev}H: {payload[1].value}</p>}
                </div>
              );
            }} />
            <Bar dataKey="count" name={`${d.period}H`} fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={14} />
            <Bar dataKey="countPrev" name={`${d.periodPrev}H`} fill="#d1d5db" radius={[4, 4, 0, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Section 3: Revenue Masuk per Bulan */}
      <Card title="Revenue Masuk per Bulan" extra={
        <span className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">{d.period}H</span>
      }>
        <div className="flex gap-4 mb-3">
          <div>
            <p className="text-[10px] text-gray-400">Total Masuk</p>
            <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">{fmtRpShort(d.revenue.totalMasuk)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400">Rata-rata/bln</p>
            <p className="text-base font-bold text-gray-800 dark:text-white">{fmtRpShort(d.revenue.avgPerMonth)}</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={d.revenue.monthly} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="trenEmeraldGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
              tickFormatter={(v: number) => v >= 1_000_000_000 ? `${(v/1_000_000_000).toFixed(1)}M` : v >= 1_000_000 ? `${(v/1_000_000).toFixed(0)}jt` : String(v)} />
            <Tooltip content={({ active, payload, label }: any) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-white dark:bg-slate-800 shadow-lg border border-gray-100 dark:border-slate-700 rounded-xl px-3 py-2">
                  <p className="text-[10px] text-gray-400 font-medium">{label}</p>
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{fmtRp(payload[0]?.value as number)}</p>
                </div>
              );
            }} />
            <Area type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2.5} fill="url(#trenEmeraldGrad)"
              dot={{ r: 3, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Section 4: Heatmap Pendaftaran */}
      <Card title="Heatmap Pendaftaran">
        {(() => {
          const years = Object.keys(d.heatmap).sort((a, b) => b.localeCompare(a));
          const allVals = years.flatMap(y => d.heatmap[y]);
          const hMin = Math.min(...allVals.filter(v => v > 0), 0);
          const hMax = Math.max(...allVals, 1);
          const COLORS = ['#d1fae5', '#6ee7b7', '#34d399', '#10b981', '#065f46'];
          const getColor = (v: number) => v === 0 ? (isDark ? '#1e293b' : '#f3f4f6') : COLORS[Math.min(4, Math.floor(((v - hMin) / (hMax - hMin)) * 4.99))];
          const getTextColor = (v: number) => { const idx = v === 0 ? -1 : Math.min(4, Math.floor(((v - hMin) / (hMax - hMin)) * 4.99)); return idx >= 3 ? '#fff' : '#065f46'; };
          return (
            <div className="overflow-x-auto -mx-4 px-4">
              <div style={{ minWidth: '420px' }}>
                <div className="grid gap-[2px] mb-[2px]" style={{ gridTemplateColumns: '36px repeat(12, 1fr)' }}>
                  <div />
                  {MONTH_LABELS.map(m => <div key={m} className="text-[9px] text-gray-400 text-center">{m}</div>)}
                </div>
                {years.map(yr => (
                  <div key={yr} className="grid gap-[2px] mb-1" style={{ gridTemplateColumns: '36px repeat(12, 1fr)' }}>
                    <div className="text-[9px] font-bold text-gray-500 dark:text-slate-400 flex items-center">{yr}H</div>
                    {d.heatmap[yr].map((v, i) => (
                      <div key={i} className="min-h-[28px] rounded-[4px] flex items-center justify-center"
                        style={{ backgroundColor: getColor(v), color: v === 0 ? (isDark ? '#475569' : '#d1d5db') : getTextColor(v) }}>
                        <span className="text-[10px] font-bold">{v || ''}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="flex items-center justify-end gap-1.5 mt-2">
                  <span className="text-[9px] text-gray-400">Sedikit</span>
                  {COLORS.map((c, i) => <div key={i} className="w-3 h-3 rounded-[3px]" style={{ backgroundColor: c }} />)}
                  <span className="text-[9px] text-gray-400">Banyak</span>
                </div>
              </div>
            </div>
          );
        })()}
      </Card>

      {/* Section 5: Insight Cards */}
      <Card title="Insight">
        {(() => {
          const convDesc = d.insights.sudahBerangkat === 0
            ? `${d.insights.lunasCount}/${d.insights.totalJamaah} lunas (belum ada keberangkatan)`
            : `${d.insights.lunasCount}/${d.insights.totalJamaah} lunas (sudah berangkat: ${d.insights.conversionRateBerangkat}%)`;
          const rows = [
            { icon: Clock, bg: 'bg-emerald-50 dark:bg-emerald-900/20', iconColor: 'text-emerald-600 dark:text-emerald-400', title: 'Lead time rata-rata', desc: 'Dari daftar sampai berangkat', value: `${d.insights.leadTimeAvg} bln`, vColor: 'text-emerald-600 dark:text-emerald-400' },
            { icon: CheckCircle, bg: 'bg-blue-50 dark:bg-blue-900/20', iconColor: 'text-blue-600 dark:text-blue-400', title: 'Conversion rate', desc: convDesc, value: `${d.insights.conversionRate}%`, vColor: 'text-blue-600 dark:text-blue-400' },
            { icon: TrendingDown, bg: 'bg-amber-50 dark:bg-amber-900/20', iconColor: 'text-amber-600 dark:text-amber-400', title: 'Bulan paling sepi', desc: 'Pendaftaran terendah', value: `${d.summary.slowestMonth} (${d.summary.slowestMonthCount})`, vColor: 'text-amber-600 dark:text-amber-400' },
            { icon: Package, bg: 'bg-violet-50 dark:bg-violet-900/20', iconColor: 'text-violet-600 dark:text-violet-400', title: 'Paket terlaris', desc: 'Paling banyak diminati', value: d.insights.topPaket, vColor: 'text-violet-600 dark:text-violet-400' },
          ] as const;
          return rows.map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={i} className={`flex items-center gap-2.5 py-2.5 ${i < rows.length - 1 ? 'border-b border-gray-50 dark:border-slate-700/50' : ''}`}>
                <div className={`w-9 h-9 rounded-[10px] ${item.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={16} className={item.iconColor} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 dark:text-white">{item.title}</p>
                  <p className="text-[11px] text-gray-400 dark:text-slate-500">{item.desc}</p>
                </div>
                <span className={`text-sm font-bold flex-shrink-0 ${item.vColor}`}>{item.value}</span>
              </div>
            );
          });
        })()}
      </Card>

      {/* Section 6: Distribusi Gender */}
      <Card title="Distribusi Gender" extra={<span className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">{d.period}H</span>}>
        {(() => {
          const total = d.gender.perempuan + d.gender.lakiLaki || 1;
          const pPct = Math.round((d.gender.perempuan / total) * 100);
          const lPct = 100 - pPct;
          return (
            <div>
              <div className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full border-[3px] border-pink-500 bg-pink-50 dark:bg-pink-900/20 flex flex-col items-center justify-center">
                    <span className="text-xl font-bold text-pink-500">{pPct}%</span>
                    <span className="text-[10px] font-semibold text-pink-500">Perempuan</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">{d.gender.perempuan} orang</p>
                </div>
                <span className="text-[10px] font-bold text-gray-300 dark:text-slate-600">vs</span>
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full border-[3px] border-blue-500 bg-blue-50 dark:bg-blue-900/20 flex flex-col items-center justify-center">
                    <span className="text-xl font-bold text-blue-500">{lPct}%</span>
                    <span className="text-[10px] font-semibold text-blue-500">Laki-laki</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">{d.gender.lakiLaki} orang</p>
                </div>
              </div>
              <div className="flex h-2.5 rounded-full overflow-hidden w-full mt-3">
                <div className="bg-pink-500" style={{ width: `${pPct}%` }} />
                <div className="bg-blue-500" style={{ width: `${lPct}%` }} />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] font-semibold text-pink-500">{pPct}% Perempuan</span>
                <span className="text-[9px] font-semibold text-blue-500">{lPct}% Laki-laki</span>
              </div>
            </div>
          );
        })()}
      </Card>

      {/* Section 7: Distribusi Umur */}
      <Card title="Distribusi Umur Jamaah">
        {(() => {
          const AGE_COLORS: Record<string, string> = { '18-30': '#8b5cf6', '31-40': '#3b82f6', '41-50': '#10b981', '51-60': '#f59e0b', '60+': '#ef4444' };
          const maxPct = Math.max(...d.ageDistribution.map(a => a.pct), 1);
          const topAge = d.ageDistribution.reduce((a, b) => b.pct > a.pct ? b : a, d.ageDistribution[0]);
          return (
            <div>
              {d.ageDistribution.map((item) => (
                <div key={item.range} className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold text-gray-500 w-[50px] flex-shrink-0">{item.range}</span>
                  <div className="flex-1 h-4 bg-gray-100 dark:bg-slate-700 rounded-[5px] overflow-hidden">
                    <div className="h-full rounded-[5px] transition-all duration-500" style={{ width: `${(item.pct / maxPct) * 100}%`, backgroundColor: AGE_COLORS[item.range] }} />
                  </div>
                  <span className="text-[10px] font-bold w-9 text-right" style={{ color: AGE_COLORS[item.range] }}>{item.pct}%</span>
                </div>
              ))}
              <div className="mt-2.5 p-2.5 bg-gray-50 dark:bg-slate-900 rounded-[10px]">
                <p className="text-[11px] font-semibold text-gray-700 dark:text-slate-300">Mayoritas usia {topAge?.range} tahun ({topAge?.pct}%)</p>
                <p className="text-[10px] text-gray-400">Rata-rata umur: {d.ageAvg} tahun</p>
              </div>
            </div>
          );
        })()}
      </Card>

      {/* Section 8: Lead Time Pendaftaran */}
      <Card title="Lead Time Pendaftaran">
        <p className="text-[11px] text-gray-400 mb-3">Berapa bulan sebelum berangkat jamaah mendaftar</p>
        {(() => {
          const LT_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];
          const maxPct = Math.max(...d.leadTimeDistribution.map(l => l.pct), 1);
          return d.leadTimeDistribution.map((item, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-semibold text-gray-500 w-[60px] flex-shrink-0">{item.range}</span>
              <div className="flex-1 h-4 bg-gray-100 dark:bg-slate-700 rounded-[5px] overflow-hidden">
                <div className="h-full rounded-[5px] transition-all duration-500" style={{ width: `${(item.pct / maxPct) * 100}%`, backgroundColor: LT_COLORS[i] }} />
              </div>
              <span className="text-[10px] font-bold w-9 text-right" style={{ color: LT_COLORS[i] }}>{item.pct}%</span>
            </div>
          ));
        })()}
      </Card>

      {/* Section 9: Daftar vs Berangkat */}
      <Card title="Daftar vs Berangkat">
        <p className="text-[11px] text-gray-400 mb-2.5">Kapan jamaah daftar untuk berangkat bulan apa</p>
        {(() => {
          const allVals = d.daftarVsBerangkat.flat().filter(v => v > 0);
          const cMin = Math.min(...allVals, 0);
          const cMax = Math.max(...allVals, 1);
          const CORR_COLORS = ['#dbeafe', '#93c5fd', '#60a5fa', '#3b82f6', '#1e40af'];
          const getCorrColor = (v: number) => v === 0 ? (isDark ? '#1e293b' : '#f8fafc') : CORR_COLORS[Math.min(4, Math.floor(((v - cMin) / (cMax - cMin)) * 4.99))];
          const getCorrTextColor = (v: number) => { const idx = v === 0 ? -1 : Math.min(4, Math.floor(((v - cMin) / (cMax - cMin)) * 4.99)); return idx >= 3 ? 'white' : '#1e40af'; };
          return (
            <div className="overflow-x-auto -mx-4 px-4">
              <div style={{ minWidth: '360px' }}>
                <div className="grid gap-[2px] mb-[2px]" style={{ gridTemplateColumns: '28px repeat(12, 1fr)' }}>
                  <div />
                  {MONTH_LABELS.map(m => <div key={m} className="text-[8px] text-gray-400 dark:text-slate-500 text-center font-medium">{m}</div>)}
                </div>
                {d.daftarVsBerangkat.map((row, i) => (
                  <div key={i} className="grid gap-[2px] mb-[2px]" style={{ gridTemplateColumns: '28px repeat(12, 1fr)' }}>
                    <div className="text-[8px] text-gray-400 dark:text-slate-500 font-semibold flex items-center justify-end pr-1">{MONTH_LABELS[i]}</div>
                    {row.map((val, j) => (
                      <div key={j} className="flex items-center justify-center rounded-[2px]"
                        style={{ aspectRatio: '1', background: getCorrColor(val), color: val === 0 ? (isDark ? '#475569' : '#cbd5e1') : getCorrTextColor(val), fontSize: '7px', fontWeight: 700 }}>
                        {val > 0 ? val : ''}
                      </div>
                    ))}
                  </div>
                ))}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[9px] text-gray-400 dark:text-slate-500">&darr; Bulan daftar &rarr; Bulan berangkat</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] text-gray-400">Sedikit</span>
                    {CORR_COLORS.map((c, i) => <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c }} />)}
                    <span className="text-[8px] text-gray-400">Banyak</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </Card>

      {/* Section 12: Paket Terpopuler */}
      <Card title="Paket Terpopuler" extra={<span className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">{d.period}H</span>}>
        {d.paketRanking.map((item, i) => {
          const BADGE_COLORS = ['bg-emerald-500', 'bg-blue-500', 'bg-violet-500', 'bg-amber-500'];
          const bc = BADGE_COLORS[i] || 'bg-gray-400';
          return (
            <div key={i} className={`flex items-center gap-2.5 py-2 ${i < d.paketRanking.length - 1 ? 'border-b border-gray-50 dark:border-slate-700/50' : ''}`}>
              <div className={`w-5 h-5 rounded-[6px] ${bc} flex items-center justify-center flex-shrink-0`}>
                <span className="text-[10px] font-bold text-white">{i + 1}</span>
              </div>
              <span className="text-xs font-semibold text-gray-800 dark:text-white flex-1">{item.paket}</span>
              <span className="text-[13px] font-bold text-gray-800 dark:text-white">{item.count}</span>
              <span className="text-[10px] text-gray-400 ml-1">{item.pct}%</span>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
