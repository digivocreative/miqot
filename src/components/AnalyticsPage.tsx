import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Users, Activity, Eye, RefreshCw, ChevronDown } from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getAuthHeaders } from './LoginPage';

interface AnalyticsData {
  period: string;
  overview: {
    totalLogins: number;
    activeAgents: number;
    totalAgents: number;
    totalPageViews: number;
    totalWAClicks: number;
  };
  dailyLogins: { date: string; day: string; count: number }[];
  agentActivity: {
    slug: string;
    name: string;
    photo: string;
    lastActive: string | null;
    logins: number;
    featureClicks: number;
    pageViews: number;
    waClicks: number;
    status: 'active' | 'inactive' | 'dormant' | 'never';
  }[];
  featureUsage: { feature: string; label: string; count: number }[];
  actionTracking: { action: string; label: string; count: number }[];
  recentActivity: {
    agentSlug: string;
    agentName: string;
    eventName: string;
    label: string;
    createdAt: string;
  }[];
}

type TabId = 'overview' | 'agents' | 'features';

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const ACTION_ICONS: Record<string, string> = {
  sync_jamaah: '🔄', generate_pdf: '📄', share_screenshot: '📸',
  download_brosur: '📥', download_itinerary: '📋', wa_click_jamaah: '💬',
  save_capi_config: '⚙️', update_profil: '👤', change_password: '🔑',
  generate_script: '✍️', generate_voice: '🎙️',
  download_mp3: '🎵', download_wav: '🎵',
  generate_business_card: '💳', download_business_card: '💳',
  export_haji_infographic: '📊',
  sync_jamaah_haji: '🔄', view_bpih_doc: '📄', view_pernyataan_doc: '📄',
  wa_click_haji: '💬', wa_click_lead: '💬',
  update_lead_status: '📝', delete_lead: '🗑️',
  connect_telegram: '🔗', disconnect_telegram: '🔌',
  update_notif_prefs: '🔔',
  forgot_password: '🔐', reset_password: '🔐',
  view_web_itinerary: '🌐', view_flight_status: '✈️',
  share_flight: '🔗',
};

const WA_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

function getRelativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return `${Math.floor(days / 7)} minggu lalu`;
}

function getInitials(name: string | null | undefined) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

// Custom tooltip for bar chart
function LoginTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-800 dark:bg-slate-700 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg">
      {d.day} — {d.count} login
    </div>
  );
}

export default function AnalyticsPage({ onHeaderRight }: { onHeaderRight?: (node: React.ReactNode) => void }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const fetchData = useCallback(async (m: number, y: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/summary?month=${m}&year=${y}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Gagal memuat data analytics');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Unknown error');
      setData(json.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(selectedMonth, selectedYear);
  }, [selectedMonth, selectedYear, fetchData]);

  // Month picker in header
  useEffect(() => {
    if (!onHeaderRight) return;
    onHeaderRight(
      <div className="relative">
        <button
          onClick={() => setShowMonthPicker(p => !p)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-slate-800 text-[10px] font-semibold text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
        >
          {MONTHS[selectedMonth - 1]} {selectedYear}
          <ChevronDown size={12} />
        </button>
      </div>
    );
  }, [onHeaderRight, selectedMonth, selectedYear]);

  // Month picker dropdown (rendered in body)
  const monthPickerDropdown = showMonthPicker && (
    <div
      className="fixed inset-0 z-50"
      onClick={() => setShowMonthPicker(false)}
    >
      <div
        className="absolute right-4 top-14 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 p-2 w-48 max-h-64 overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].reverse().map(m => {
          const mo = m + 1;
          const yr = selectedYear;
          const isCurrent = mo === selectedMonth && yr === selectedYear;
          return (
            <button
              key={m}
              onClick={() => { setSelectedMonth(mo); setSelectedYear(yr); setShowMonthPicker(false); }}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                isCurrent
                  ? 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400'
                  : 'text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              {MONTHS[m]} {yr}
            </button>
          );
        })}
        {/* Previous year months */}
        <div className="border-t border-gray-100 dark:border-slate-700 mt-1 pt-1">
          <p className="px-3 py-1 text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase">{selectedYear - 1}</p>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].reverse().map(m => (
            <button
              key={`prev-${m}`}
              onClick={() => { setSelectedMonth(m + 1); setSelectedYear(selectedYear - 1); setShowMonthPicker(false); }}
              className="w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              {MONTHS[m]} {selectedYear - 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'agents', label: 'Per Agent' },
    { id: 'features', label: 'Fitur' },
  ];

  // ── Loading Skeleton ──
  if (loading) {
    return (
      <div className="px-4 pt-4 pb-8 space-y-4">
        {monthPickerDropdown}
        {/* Tab skeleton */}
        <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-1 flex gap-1">
          {[1,2,3].map(i => <div key={i} className="flex-1 h-8 rounded-lg bg-gray-200/60 dark:bg-slate-800 animate-pulse" />)}
        </div>
        {/* Stat cards skeleton */}
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
              <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 animate-pulse mb-2" />
              <div className="h-6 w-16 bg-gray-100 dark:bg-slate-700 rounded animate-pulse mb-1" />
              <div className="h-3 w-20 bg-gray-50 dark:bg-slate-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
        {/* Chart skeleton */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4">
          <div className="h-4 w-32 bg-gray-100 dark:bg-slate-700 rounded animate-pulse mb-3" />
          <div className="h-[140px] bg-gray-50 dark:bg-slate-900 rounded-xl animate-pulse" />
        </div>
        {/* Activity skeleton */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4">
          <div className="h-4 w-36 bg-gray-100 dark:bg-slate-700 rounded animate-pulse mb-3" />
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex items-center gap-3 py-2.5">
              <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-slate-700 animate-pulse" />
              <div className="flex-1">
                <div className="h-3 w-3/4 bg-gray-100 dark:bg-slate-700 rounded animate-pulse mb-1" />
                <div className="h-2.5 w-1/3 bg-gray-50 dark:bg-slate-800 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="px-4 pt-4 pb-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-3 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <TrendingUp size={24} className="text-red-500" />
          </div>
          <p className="text-sm font-bold text-red-700 dark:text-red-300 mb-1">Gagal Memuat Analytics</p>
          <p className="text-xs text-red-600 dark:text-red-400 mb-4">{error}</p>
          <button
            onClick={() => fetchData(selectedMonth, selectedYear)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 active:scale-95 transition-all"
          >
            <RefreshCw size={14} />
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { overview, dailyLogins, agentActivity, featureUsage, actionTracking, recentActivity } = data;

  // Feature usage percentage
  const totalFeatureClicks = featureUsage.reduce((s, f) => s + f.count, 0) || 1;

  return (
    <div className="px-4 pt-4 pb-8">
      {monthPickerDropdown}

      {/* ── Tabs ── */}
      <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-1 flex gap-1 mb-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all ${
              activeTab === tab.id
                ? 'bg-white dark:bg-slate-800 text-gray-800 dark:text-white shadow-sm'
                : 'text-gray-400 dark:text-slate-500 hover:text-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════ */}
      {/* TAB 1: OVERVIEW */}
      {/* ════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Stat Cards */}
          <div className="grid grid-cols-2 gap-3">
            {/* Total Login */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center border border-emerald-100 dark:border-emerald-800/40 mb-2">
                <Users size={18} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-xl font-extrabold text-gray-800 dark:text-white">{overview.totalLogins.toLocaleString()}</p>
              <p className="text-[9px] font-semibold text-gray-400 dark:text-slate-500 uppercase mt-0.5">Total Login · bulan ini</p>
            </div>
            {/* Agent Aktif */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center border border-blue-100 dark:border-blue-800/40 mb-2">
                <Activity size={18} className="text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-xl font-extrabold text-gray-800 dark:text-white">{overview.activeAgents}<span className="text-sm font-bold text-gray-400 dark:text-slate-500">/{overview.totalAgents}</span></p>
              <p className="text-[9px] font-semibold text-gray-400 dark:text-slate-500 uppercase mt-0.5">Agent Aktif · minggu ini</p>
            </div>
            {/* Page Views */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
              <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center border border-violet-100 dark:border-violet-800/40 mb-2">
                <Eye size={18} className="text-violet-600 dark:text-violet-400" />
              </div>
              <p className="text-xl font-extrabold text-gray-800 dark:text-white">{overview.totalPageViews.toLocaleString()}</p>
              <p className="text-[9px] font-semibold text-gray-400 dark:text-slate-500 uppercase mt-0.5">Page Views · halaman publik</p>
            </div>
            {/* WA Clicks */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
              <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center border border-amber-100 dark:border-amber-800/40 mb-2 text-amber-600 dark:text-amber-400">
                {WA_ICON}
              </div>
              <p className="text-xl font-extrabold text-gray-800 dark:text-white">{overview.totalWAClicks.toLocaleString()}</p>
              <p className="text-[9px] font-semibold text-gray-400 dark:text-slate-500 uppercase mt-0.5">WA Clicks · klik tombol WA</p>
            </div>
          </div>

          {/* Login per Hari */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
            <div className="px-4 pt-4 pb-2">
              <p className="text-[10px] font-extrabold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Login per Hari</p>
              <p className="text-[9px] text-gray-400 dark:text-slate-500 mt-0.5">Minggu ini</p>
            </div>
            <div className="px-2 pb-3" style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyLogins} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: '#9ca3af', fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<LoginTooltip />} cursor={false} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={32}>
                    {dailyLogins.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.count > 0 ? '#10b981' : '#e5e7eb'}
                        className="dark:opacity-90"
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Aktivitas Terbaru */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
            <div className="px-4 pt-4 pb-2">
              <p className="text-[10px] font-extrabold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Aktivitas Terbaru</p>
              <p className="text-[9px] text-gray-400 dark:text-slate-500 mt-0.5">Hari ini</p>
            </div>
            {recentActivity.length === 0 ? (
              <div className="px-4 pb-4">
                <p className="text-xs text-gray-400 dark:text-slate-500 text-center py-6">Belum ada aktivitas hari ini</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
                {recentActivity.map((item, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-[9px] font-bold text-gray-500 dark:text-slate-400 shrink-0">
                      {getInitials(item.agentName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-gray-700 dark:text-slate-200 truncate">
                        <span className="font-bold">{item.agentName}</span>
                        <span className="text-gray-400 dark:text-slate-500"> — {item.label}</span>
                      </p>
                    </div>
                    <span className="text-[9px] text-gray-400 dark:text-slate-500 shrink-0">
                      {new Date(item.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════ */}
      {/* TAB 2: PER AGENT */}
      {/* ════════════════════════════════════════ */}
      {activeTab === 'agents' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
            <div className="px-4 pt-4 pb-2">
              <p className="text-[10px] font-extrabold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Aktivitas Agent</p>
              <p className="text-[9px] text-gray-400 dark:text-slate-500 mt-0.5">{agentActivity.length} agent · {MONTHS[selectedMonth - 1]} {selectedYear}</p>
            </div>

            {/* Legend */}
            <div className="flex gap-3 px-4 pb-2 flex-wrap">
              {[
                { color: 'bg-emerald-500', label: 'Aktif' },
                { color: 'bg-amber-500', label: 'Kurang aktif' },
                { color: 'bg-red-500', label: 'Jarang login' },
                { color: 'bg-gray-300 dark:bg-slate-600', label: 'Belum pernah' },
              ].map(s => (
                <span key={s.label} className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${s.color}`} />
                  <span className="text-[9px] text-gray-400 dark:text-slate-500">{s.label}</span>
                </span>
              ))}
            </div>

            <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
              {agentActivity.map(agent => {
                const statusColors: Record<string, string> = {
                  active: 'bg-emerald-500',
                  inactive: 'bg-amber-500',
                  dormant: 'bg-red-500',
                  never: 'bg-gray-300 dark:bg-slate-600',
                };
                const statusLabels: Record<string, string> = {
                  active: 'Aktif',
                  inactive: 'Kurang aktif',
                  dormant: 'Jarang',
                  never: 'Belum pernah',
                };
                const statusTextColors: Record<string, string> = {
                  active: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
                  inactive: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
                  dormant: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
                  never: 'text-gray-400 dark:text-slate-500 bg-gray-50 dark:bg-slate-900',
                };

                return (
                  <div key={agent.slug} className="px-4 py-3">
                    {/* Row 1: Avatar + name + status */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="relative shrink-0">
                          {agent.photo ? (
                            <img
                              src={agent.photo}
                              alt={agent.name}
                              className="w-8 h-8 rounded-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-gray-500 dark:text-slate-400">
                              {getInitials(agent.name)}
                            </div>
                          )}
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-800 ${statusColors[agent.status]}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-gray-800 dark:text-white truncate">{agent.name}</p>
                          <p className="text-[9px] text-gray-400 dark:text-slate-500">
                            {agent.lastActive ? `Terakhir: ${getRelativeTime(agent.lastActive)}` : 'Belum pernah login'}
                          </p>
                        </div>
                      </div>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${statusTextColors[agent.status]}`}>
                        {statusLabels[agent.status]}
                      </span>
                    </div>

                    {/* Row 2: Mini stat boxes */}
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { label: 'Login', value: agent.logins },
                        { label: 'Fitur', value: agent.featureClicks },
                        { label: 'Views', value: agent.pageViews },
                        { label: 'WA', value: agent.waClicks },
                      ].map(stat => (
                        <div key={stat.label} className="bg-gray-50 dark:bg-slate-900 rounded-lg py-1.5 text-center">
                          <p className="text-[11px] font-extrabold text-gray-700 dark:text-slate-200">{stat.value.toLocaleString()}</p>
                          <p className="text-[8px] font-semibold text-gray-400 dark:text-slate-500 uppercase">{stat.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {agentActivity.length === 0 && (
              <div className="px-4 pb-4">
                <p className="text-xs text-gray-400 dark:text-slate-500 text-center py-6">Belum ada data agent untuk bulan ini</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════ */}
      {/* TAB 3: FITUR */}
      {/* ════════════════════════════════════════ */}
      {activeTab === 'features' && (
        <div className="space-y-4">
          {/* Feature Usage Ranking */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
            <div className="px-4 pt-4 pb-3">
              <p className="text-[10px] font-extrabold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Fitur Paling Sering Dipakai</p>
              <p className="text-[9px] text-gray-400 dark:text-slate-500 mt-0.5">Total klik bulan ini</p>
            </div>

            {featureUsage.length === 0 ? (
              <div className="px-4 pb-4">
                <p className="text-xs text-gray-400 dark:text-slate-500 text-center py-6">Belum ada data fitur untuk bulan ini</p>
              </div>
            ) : (
              <div className="px-4 pb-4 space-y-2.5">
                {featureUsage.map((f, i) => {
                  const pct = Math.round((f.count / totalFeatureClicks) * 100);
                  return (
                    <div key={f.feature}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-gray-100 dark:bg-slate-700 text-[10px] font-extrabold text-gray-500 dark:text-slate-400 flex items-center justify-center">
                            {i + 1}
                          </span>
                          <span className="text-[11px] font-semibold text-gray-700 dark:text-slate-200">{f.label}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold text-gray-800 dark:text-white">{f.count.toLocaleString()}</span>
                          <span className="text-[9px] text-gray-400">{pct}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-slate-700">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action Tracking */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
            <div className="px-4 pt-4 pb-3">
              <p className="text-[10px] font-extrabold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Action Tracking</p>
              <p className="text-[9px] text-gray-400 dark:text-slate-500 mt-0.5">Aksi spesifik bulan ini</p>
            </div>

            {actionTracking.length === 0 ? (
              <div className="px-4 pb-4">
                <p className="text-xs text-gray-400 dark:text-slate-500 text-center py-6">Belum ada data aksi untuk bulan ini</p>
              </div>
            ) : (
              <div className="px-4 pb-4 space-y-1.5">
                {actionTracking.map(a => (
                  <div key={a.action} className="flex items-center justify-between py-2 px-3 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{ACTION_ICONS[a.action] || '📊'}</span>
                      <span className="text-[11px] font-medium text-gray-700 dark:text-slate-200">{a.label}</span>
                    </div>
                    <span className="text-[11px] font-extrabold text-gray-800 dark:text-white">{a.count.toLocaleString()}×</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state for no data */}
      {data && !loading && !error && 
        overview.totalLogins === 0 && 
        overview.totalPageViews === 0 && 
        overview.totalWAClicks === 0 && 
        featureUsage.length === 0 && 
        actionTracking.length === 0 && (
        <div className="text-center py-8 mt-4">
          <TrendingUp size={32} className="mx-auto text-gray-300 dark:text-slate-600 mb-3" />
          <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">Belum ada data analytics untuk bulan ini</p>
          <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">Data akan muncul saat agent mulai menggunakan app</p>
        </div>
      )}
    </div>
  );
}
