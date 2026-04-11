import { useState, useEffect, useCallback, useRef } from 'react';
import { Download, RefreshCw, BarChart3 as BarChart3Icon, Users, TrendingUp, CalendarRange, Calculator } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, LabelList } from 'recharts';
import { getAuthHeaders } from './LoginPage';
import { trackEvent } from '../utils/analytics';
import SimulasiHajiPlus from './SimulasiHajiPlus';

// ── Types ──
interface HajiPlusItem { year: number; pax: number; }
interface HajiPlusData {
  items: HajiPlusItem[];
  total: number; average: number;
  peak: HajiPlusItem; min: HajiPlusItem;
  current: HajiPlusItem | null;
  yearCount: number; synced_at: string;
}

type HajiPlusTab = 'statistik' | 'simulasi';

interface HajiPlusPageProps {
  agent: { slug: string; name: string; phone: string; email?: string; photo: string; website: string; };
  onExport?: () => void;
  initialTab?: HajiPlusTab;
}

const fmt = (n: number) => n.toLocaleString('id-ID');

// ── Custom Tooltip ──
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-100 dark:border-slate-700 px-3 py-2">
      <p className="text-[11px] font-bold text-gray-800 dark:text-white">{label}</p>
      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">{fmt(payload[0].value)} pax</p>
    </div>
  );
}


// ═══════════════════════════════════════
// Main Page
// ═══════════════════════════════════════
export default function HajiPlusPage({ agent, onExport, initialTab }: HajiPlusPageProps) {
  const mountTracked = useRef(false);
  useEffect(() => { if (!mountTracked.current) { trackEvent('feature', 'open_haji_plus'); mountTracked.current = true; } }, []);

  const [activeTab, setActiveTab] = useState<HajiPlusTab>(initialTab || 'statistik');
  const [data, setData] = useState<HajiPlusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');


  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/haji-plus/data', { headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success) setData(json.data);
      else setError(json.error || 'Gagal mengambil data');
    } catch { setError('Gagal terhubung ke server'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const currentYear = new Date().getFullYear();

  const TAB_CONFIG = [
    { id: 'statistik' as const, label: 'Statistik', icon: BarChart3Icon },
    { id: 'simulasi' as const, label: 'Simulasi', icon: Calculator },
  ];

  const switchTab = (tab: HajiPlusTab) => {
    setActiveTab(tab);
    const url = tab === 'simulasi' ? '/dashboard/ai-tools/haji-plus/simulasi' : '/dashboard/ai-tools/haji-plus';
    window.history.pushState(null, '', url);
  };

  // ── Loading skeleton (statistik tab only) ──
  if (activeTab === 'statistik' && loading) {
    return (
      <div>
        {/* Segmented Control */}
        <div className="px-4 pt-3 pb-1">
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-slate-800 rounded-xl w-full">
            {TAB_CONFIG.map(tab => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => switchTab(tab.id)} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all duration-200 active:opacity-70 ${isActive ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-500 dark:text-emerald-400 font-semibold' : 'bg-transparent text-gray-400 dark:text-slate-500 font-medium'}`} style={isActive ? { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : undefined}>
                  <Icon size={13} strokeWidth={2.2} />
                  <span className="text-[11px]">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="px-4 pt-3 pb-8 space-y-3">
          <div className="h-[100px] rounded-2xl bg-gray-100 dark:bg-slate-800 animate-pulse" />
          <div className="grid grid-cols-3 gap-2">
            {[1,2,3].map(i => <div key={i} className="h-[60px] rounded-2xl bg-gray-100 dark:bg-slate-800 animate-pulse" />)}
          </div>
          <div className="h-[260px] rounded-2xl bg-gray-100 dark:bg-slate-800 animate-pulse" />
          <div className="h-12 rounded-xl bg-gray-100 dark:bg-slate-800 animate-pulse" />
          <div className="h-[200px] rounded-2xl bg-gray-100 dark:bg-slate-800 animate-pulse" />
        </div>
      </div>
    );
  }

  // ── Error state (statistik tab only) ──
  if (activeTab === 'statistik' && (error || !data)) {
    return (
      <div>
        {/* Segmented Control */}
        <div className="px-4 pt-3 pb-1">
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-slate-800 rounded-xl w-full">
            {TAB_CONFIG.map(tab => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => switchTab(tab.id)} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all duration-200 active:opacity-70 ${isActive ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-500 dark:text-emerald-400 font-semibold' : 'bg-transparent text-gray-400 dark:text-slate-500 font-medium'}`} style={isActive ? { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : undefined}>
                  <Icon size={13} strokeWidth={2.2} />
                  <span className="text-[11px]">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="px-4 pt-6 pb-8">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
              <BarChart3Icon size={20} className="text-red-500" />
            </div>
            <p className="text-sm font-bold text-gray-800 dark:text-white mb-1">{error || 'Data tidak tersedia'}</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 mb-4">Data akan tersedia setelah sync pertama.</p>
            <button onClick={fetchData} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors active:scale-95">
              <RefreshCw size={14} /> Coba Lagi
            </button>
          </div>
        </div>
      </div>
    );
  }

  const yFmt = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K` : String(v);

  return (
    <div>
      {/* Segmented Control */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-slate-800 rounded-xl w-full">
          {TAB_CONFIG.map(tab => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => switchTab(tab.id)} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all duration-200 active:opacity-70 ${isActive ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-500 dark:text-emerald-400 font-semibold' : 'bg-transparent text-gray-400 dark:text-slate-500 font-medium'}`} style={isActive ? { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : undefined}>
                <Icon size={13} strokeWidth={2.2} />
                <span className="text-[11px]">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'simulasi' && <SimulasiHajiPlus />}

      {activeTab === 'statistik' && data && (
      <div className="px-4 pt-4 pb-8 space-y-4">

      {/* A. Hero Card */}
      <div className="rounded-2xl p-4 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #064e3b, #0F6E56, #065f46)' }}>
        {/* Decorative ornaments */}
        <div className="absolute top-[-40px] right-[-30px] w-[120px] h-[120px] rounded-full bg-white/5" />
        <div className="absolute bottom-[-20px] left-[-40px] w-[80px] h-[80px] rounded-full bg-white/[0.03]" />
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-[10px] text-emerald-200/70 font-semibold uppercase tracking-wide">Tahun Ini — {currentYear}</p>
            <p className="text-3xl font-bold mt-0.5">{data.current ? fmt(data.current.pax) : '—'}</p>
            <p className="text-[10px] text-emerald-200/60 mt-0.5">pax</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-emerald-200/70 font-medium">Peak: {data.peak.year}</p>
            <p className="text-lg font-bold">{fmt(data.peak.pax)}</p>
          </div>
        </div>
      </div>

      {/* B. Stat Cards */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { v: fmt(data.total), l: 'Total', icon: Users, bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-100 dark:border-emerald-800/40', iconColor: 'text-emerald-600 dark:text-emerald-400' },
          { v: fmt(data.average), l: 'Rata-rata', icon: TrendingUp, bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-100 dark:border-blue-800/40', iconColor: 'text-blue-600 dark:text-blue-400' },
          { v: String(data.yearCount), l: 'Tahun data', icon: CalendarRange, bg: 'bg-violet-50 dark:bg-violet-900/20', border: 'border-violet-100 dark:border-violet-800/40', iconColor: 'text-violet-600 dark:text-violet-400' },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3 text-center">
              <div className={`w-8 h-8 rounded-lg ${s.bg} border ${s.border} flex items-center justify-center mb-2 mx-auto`}>
                <Icon size={16} className={s.iconColor} />
              </div>
              <p className="text-lg font-bold text-gray-800 dark:text-white">{s.v}</p>
              <p className="text-[10px] text-gray-400 dark:text-slate-500">{s.l}</p>
            </div>
          );
        })}
      </div>

      {/* C. Chart Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-gray-800 dark:text-white">Tren keberangkatan</span>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/40">pax/tahun</span>
        </div>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.items} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={yFmt} tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} width={35} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="pax" radius={[4, 4, 0, 0]} maxBarSize={32}>
                {data.items.map((_, index) => (
                  <Cell key={index} fill={['#065f46','#0d9488','#10b981','#34d399','#6ee7b7','#059669','#047857','#0f766e','#14b8a6','#2dd4bf'][index % 10]} />
                ))}
                <LabelList dataKey="pax" position="inside" style={{ fontSize: 9, fontWeight: 600, fill: 'white' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* D. Export Button */}
      <button
        onClick={onExport}
        className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
      >
        <Download size={16} /> Export Infografis
      </button>

      {/* E. Table Detail */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50">
          <span className="text-xs font-bold text-gray-800 dark:text-white">Detail per tahun</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 dark:bg-slate-700/30">
              <th className="text-left px-4 py-2 font-semibold text-gray-500 dark:text-slate-400">Tahun</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-500 dark:text-slate-400">Jumlah</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-500 dark:text-slate-400">vs prev</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, i) => {
              const prev = i > 0 ? data.items[i - 1].pax : null;
              const pctChange = prev ? ((item.pax - prev) / prev * 100) : null;
              const isCurrent = item.year === currentYear;
              return (
                <tr key={item.year} className={`border-t border-gray-50 dark:border-slate-700/30 ${isCurrent ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''}`}>
                  <td className="px-4 py-2.5 font-semibold text-gray-700 dark:text-white flex items-center gap-1.5">
                    {item.year}
                    {isCurrent && <span className="bg-emerald-500 text-white text-[9px] px-1.5 rounded font-bold">NOW</span>}
                  </td>
                  <td className="text-right px-4 py-2.5 font-bold text-gray-800 dark:text-white">{fmt(item.pax)}</td>
                  <td className="text-right px-4 py-2.5 font-bold">
                    {pctChange !== null ? (
                      <span className={pctChange >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                        {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-gray-300 dark:text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* F. Sync indicator */}
      <p className="text-[10px] text-gray-400 dark:text-slate-600 text-center mt-3">
        Sumber: alhijazindowisata.com · Terakhir sync: {(() => {
          const diff = Date.now() - new Date(data.synced_at).getTime();
          const mins = Math.floor(diff / 60000);
          if (mins < 60) return `${mins} menit lalu`;
          const hrs = Math.floor(mins / 60);
          if (hrs < 24) return `${hrs} jam lalu`;
          return `${Math.floor(hrs / 24)} hari lalu`;
        })()}
      </p>

    </div>
      )}
    </div>
  );
}
