import { useState, useEffect, useCallback, useRef } from 'react';
import { Download, RefreshCw, BarChart3 as BarChart3Icon, Calculator, Users, PlaneTakeoff, ExternalLink } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, LabelList } from 'recharts';
import { getAuthHeaders } from './LoginPage';
import { trackEvent } from '../utils/analytics';
import SimulasiHajiPlus from './SimulasiHajiPlus';
import { fetchHajiPlusStats, formatSyncedAt, type HajiPlusData, type HajiPlusSeries } from '../lib/fetchHajiPlusStats';

type HajiPlusTab = 'statistik' | 'simulasi';

interface HajiPlusPageProps {
  agent: { slug: string; name: string; phone: string; email?: string; photo: string; website: string; };
  onExport?: () => void;
  initialTab?: HajiPlusTab;
}

const SOURCE_URL = 'https://alhijazindowisata.com/jadwal/grafik-haji-khusus/alhijaz-indowisata';

const fmt = (n: number) => n.toLocaleString('id-ID');
const yFmt = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K` : String(v));

// Warna mengikuti grafik di halaman sumber: biru = terdaftar, hijau = berangkat.
// `soft` dipakai untuk tahun yang belum terjadi (alokasi keberangkatan 2027+),
// supaya proyeksi tidak terbaca sebagai realisasi.
const SERIES_STYLE = {
  terdaftar: {
    icon: Users,
    bar: '#2563eb',
    soft: '#bfdbfe',
    dot: 'bg-blue-500',
    tint: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-100 dark:border-blue-800/40',
    text: 'text-blue-600 dark:text-blue-400',
    note: 'Menurut tahun pendaftaran.',
  },
  berangkat: {
    icon: PlaneTakeoff,
    bar: '#0F6E56',
    soft: '#6ee7b7',
    dot: 'bg-emerald-500',
    tint: 'bg-emerald-50 dark:bg-emerald-900/20',
    border: 'border-emerald-100 dark:border-emerald-800/40',
    text: 'text-emerald-600 dark:text-emerald-400',
    note: 'Menurut tahun keberangkatan. Muda = alokasi.',
  },
} as const;

// Recharts menulis warna sebagai atribut SVG, jadi varian `dark:` Tailwind
// tidak berlaku — grid #f0f0f0 yang pas di kartu putih jadi garis putih
// menyilaukan di dark mode. Dibaca saat render seperti StatistikHajiSection;
// tombol tema ada di DashboardLayout sehingga pohon ini ikut re-render.
function chartPalette() {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  return isDark
    ? { grid: '#334155', tick: '#94a3b8', label: '#cbd5e1', cursor: 'rgba(148,163,184,0.14)' }
    : { grid: '#f1f5f9', tick: '#9ca3af', label: '#6b7280', cursor: 'rgba(148,163,184,0.12)' };
}

// ── Segmented control (Simulasi / Statistik) ──
function TabSwitcher({ active, onSwitch }: { active: HajiPlusTab; onSwitch: (tab: HajiPlusTab) => void }) {
  const tabs = [
    { id: 'simulasi' as const, label: 'Simulasi', icon: Calculator },
    { id: 'statistik' as const, label: 'Statistik', icon: BarChart3Icon },
  ];
  return (
    <div className="px-4 pt-3 pb-1">
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-slate-800 rounded-xl w-full">
        {tabs.map(tab => {
          const isActive = active === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onSwitch(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all duration-200 active:opacity-70 ${isActive ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-500 dark:text-emerald-400 font-semibold' : 'bg-transparent text-gray-400 dark:text-slate-500 font-medium'}`}
              style={isActive ? { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : undefined}
            >
              <Icon size={13} strokeWidth={2.2} />
              <span className="text-[11px]">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label, color }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-100 dark:border-slate-700 px-3 py-2">
      <p className="text-[11px] font-bold text-gray-800 dark:text-white">{label}</p>
      <p className="text-[11px] font-semibold" style={{ color }}>{fmt(payload[0].value)} jamaah</p>
    </div>
  );
}

// ── Satu kartu per seri: header + 3 angka ringkas + grafik batang ──
function SeriesCard({ series, currentYear }: { series: HajiPlusSeries; currentYear: number }) {
  const style = SERIES_STYLE[series.key];
  const palette = chartPalette();
  const Icon = style.icon;
  const hasFuture = series.lastYear > currentYear;

  // 22 tahun tidak muat di lebar HP. Beri tiap tahun jatah lebar tetap lalu
  // biarkan kartunya yang menggulir horizontal, jangan dipadatkan sampai
  // label tahunnya hilang.
  const chartWidth = Math.max(280, series.items.length * 42);

  const stats = [
    { l: `Tahun ini (${currentYear})`, v: series.current ? fmt(series.current.pax) : '—' },
    { l: `Puncak ${series.peak.year}`, v: fmt(series.peak.pax) },
    hasFuture
      ? { l: `Terjadwal ${currentYear + 1}+`, v: fmt(series.scheduled) }
      : { l: 'Rata-rata/tahun', v: fmt(series.average) },
  ];

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-lg ${style.tint} border ${style.border} flex items-center justify-center flex-shrink-0`}>
            <Icon size={15} className={style.text} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-800 dark:text-white truncate">{series.label}</p>
            <p className="text-[10px] text-gray-400 dark:text-slate-500">{series.firstYear}–{series.lastYear} · {series.yearCount} tahun</p>
          </div>
        </div>
        <div className="text-right flex-shrink-0 pl-2">
          <p className="text-xl font-bold text-gray-800 dark:text-white leading-none">{fmt(series.total)}</p>
          <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">total pax</p>
        </div>
      </div>

      <div className="grid grid-cols-3 border-y border-gray-50 dark:border-slate-700/50">
        {stats.map((s, i) => (
          <div key={i} className={`px-3 py-2.5 text-center ${i > 0 ? 'border-l border-gray-50 dark:border-slate-700/50' : ''}`}>
            <p className="text-sm font-bold text-gray-800 dark:text-white">{s.v}</p>
            <p className="text-[9px] text-gray-400 dark:text-slate-500 mt-0.5 leading-tight">{s.l}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto chart-scroll px-2 pt-3">
        <div style={{ width: chartWidth, height: 190 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series.items} margin={{ top: 14, right: 6, bottom: 0, left: -14 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 9, fill: palette.tick }} axisLine={false} tickLine={false} interval={0} />
              <YAxis tickFormatter={yFmt} tick={{ fontSize: 9, fill: palette.tick }} axisLine={false} tickLine={false} width={38} />
              <Tooltip cursor={{ fill: palette.cursor }} content={<ChartTooltip color={style.bar} />} />
              <Bar dataKey="pax" radius={[3, 3, 0, 0]} maxBarSize={26}>
                {series.items.map(item => (
                  <Cell key={item.year} fill={item.year > currentYear ? style.soft : style.bar} />
                ))}
                <LabelList dataKey="pax" position="top" formatter={(v: unknown) => (Number(v) > 0 ? fmt(Number(v)) : '')} style={{ fontSize: 8, fontWeight: 600, fill: palette.label }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="px-4 pt-2 pb-4 text-[10px] leading-relaxed text-gray-400 dark:text-slate-500">{style.note}</p>
    </div>
  );
}

// ═══════════════════════════════════════
// Main Page
// ═══════════════════════════════════════
export default function HajiPlusPage({ agent: _agent, onExport, initialTab }: HajiPlusPageProps) {
  const mountTracked = useRef(false);
  useEffect(() => { if (!mountTracked.current) { trackEvent('feature', 'open_haji_plus'); mountTracked.current = true; } }, []);

  const [activeTab, setActiveTab] = useState<HajiPlusTab>(initialTab || 'simulasi');
  const [data, setData] = useState<HajiPlusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchHajiPlusStats(getAuthHeaders());
      if (result.ok) setData(result.data);
      else { setData(null); setError(result.error); }
    } catch { setData(null); setError('Gagal terhubung ke server'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const currentYear = new Date().getFullYear();

  const switchTab = (tab: HajiPlusTab) => {
    setActiveTab(tab);
    window.history.pushState(null, '', `/dashboard/ai-tools/haji-plus/${tab}`);
  };

  const shell = (children: React.ReactNode) => (
    <div>
      <TabSwitcher active={activeTab} onSwitch={switchTab} />
      {children}
    </div>
  );

  if (activeTab === 'simulasi') return shell(<SimulasiHajiPlus agent={_agent} />);

  if (loading) {
    return shell(
      <div className="px-4 pt-3 pb-8 space-y-3">
        <div className="h-[104px] rounded-2xl bg-gray-100 dark:bg-slate-800 animate-pulse" />
        <div className="h-[340px] rounded-2xl bg-gray-100 dark:bg-slate-800 animate-pulse" />
        <div className="h-[340px] rounded-2xl bg-gray-100 dark:bg-slate-800 animate-pulse" />
        <div className="h-12 rounded-xl bg-gray-100 dark:bg-slate-800 animate-pulse" />
      </div>,
    );
  }

  if (error || !data) {
    return shell(
      <div className="px-4 pt-6 pb-8">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
            <BarChart3Icon size={20} className="text-red-500" />
          </div>
          <p className="text-sm font-bold text-gray-800 dark:text-white mb-1">{error || 'Data tidak tersedia'}</p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mb-4">Rekap ditarik dari halaman grafik haji khusus Alhijaz. Coba lagi sebentar.</p>
          <button onClick={fetchData} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors active:scale-95">
            <RefreshCw size={14} /> Coba Lagi
          </button>
        </div>
      </div>,
    );
  }

  const { terdaftar, berangkat } = data.series;

  return shell(
    <div className="px-4 pt-4 pb-8 space-y-4">

      {/* A. Hero — dua seri berdampingan */}
      <div className="rounded-2xl p-4 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #064e3b, #0F6E56, #065f46)' }}>
        <div className="absolute top-[-40px] right-[-30px] w-[120px] h-[120px] rounded-full bg-white/5" />
        <div className="absolute bottom-[-20px] left-[-40px] w-[80px] h-[80px] rounded-full bg-white/[0.03]" />
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
        <div className="relative">
          <p className="text-[10px] text-emerald-200/70 font-semibold uppercase tracking-wide">Rekap Haji Khusus</p>
          <p className="text-[10px] text-emerald-200/50 mt-0.5">PT Alhijaz Indowisata · {data.firstYear}–{data.lastYear}</p>
          <div className="grid grid-cols-2 gap-3 mt-3">
            {[terdaftar, berangkat].map(s => (
              <div key={s.key} className="rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur-sm">
                <p className="text-[9px] text-emerald-100/70 font-semibold uppercase tracking-wide">{s.label.replace('Jamaah ', '')}</p>
                <p className="text-2xl font-bold leading-tight mt-0.5">{fmt(s.total)}</p>
                <p className="text-[9px] text-emerald-200/60">
                  {currentYear}: {s.current ? fmt(s.current.pax) : '—'} pax
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* B. Satu kartu per seri */}
      <SeriesCard series={terdaftar} currentYear={currentYear} />
      <SeriesCard series={berangkat} currentYear={currentYear} />

      {/* C. Export */}
      <button
        onClick={onExport}
        className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
      >
        <Download size={16} /> Export Infografis
      </button>

      {/* D. Tabel gabungan */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center gap-3">
          <span className="text-xs font-bold text-gray-800 dark:text-white">Detail per tahun</span>
          <span className="flex items-center gap-1 text-[9px] text-gray-400 dark:text-slate-500">
            <span className={`w-1.5 h-1.5 rounded-full ${SERIES_STYLE.terdaftar.dot}`} /> Terdaftar
          </span>
          <span className="flex items-center gap-1 text-[9px] text-gray-400 dark:text-slate-500">
            <span className={`w-1.5 h-1.5 rounded-full ${SERIES_STYLE.berangkat.dot}`} /> Berangkat
          </span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 dark:bg-slate-700/30">
              <th className="text-left px-4 py-2 font-semibold text-gray-500 dark:text-slate-400">Tahun</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-500 dark:text-slate-400">Terdaftar</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-500 dark:text-slate-400">Berangkat</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map(row => {
              const isCurrent = row.year === currentYear;
              // Di luar rentang aktif seri terdaftar, "0" itu artinya belum ada
              // pendaftaran sama sekali — tampilkan strip, bukan angka nol.
              const beyondTerdaftar = row.year > terdaftar.lastYear;
              return (
                <tr key={row.year} className={`border-t border-gray-50 dark:border-slate-700/30 ${isCurrent ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''}`}>
                  <td className="px-4 py-2.5 font-semibold text-gray-700 dark:text-white">
                    <span className="flex items-center gap-1.5">
                      {row.year}
                      {isCurrent && <span className="bg-emerald-500 text-white text-[9px] px-1.5 rounded font-bold">NOW</span>}
                    </span>
                  </td>
                  <td className={`text-right px-4 py-2.5 font-bold ${beyondTerdaftar ? 'text-gray-300 dark:text-slate-600' : 'text-gray-800 dark:text-white'}`}>
                    {beyondTerdaftar ? '—' : fmt(row.terdaftar)}
                  </td>
                  <td className={`text-right px-4 py-2.5 font-bold ${row.year > currentYear ? 'text-emerald-500/70 dark:text-emerald-400/70' : 'text-gray-800 dark:text-white'}`}>
                    {fmt(row.berangkat)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* E. Sumber + sync */}
      <div className="text-center space-y-1">
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-gray-400 dark:text-slate-500 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"
        >
          Sumber: grafik haji khusus alhijazindowisata.com <ExternalLink size={9} />
        </a>
        <p className="text-[10px] text-gray-400 dark:text-slate-600">Terakhir sync: {formatSyncedAt(data.synced_at)}</p>
      </div>

    </div>,
  );
}
