import { useState, useEffect, useCallback } from 'react';
import { X, TrendingUp, Calendar, Zap, UserCheck, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getAuthHeaders } from './LoginPage';

interface DrillDownData {
  agent: { slug: string; name: string; photo: string };
  summary: {
    totalEvents: number;
    logins: number;
    featureClicks: number;
    actionClicks: number;
    pageViews: number;
    waClicks: number;
    activeDays: number;
    uniqueFeatures: number;
  };
  timeline: {
    date: string; day: string; total: number;
    logins: number; features: number; actions: number; publicEvents: number;
  }[];
  heatmap: { date: string; day: string; hourCounts: number[] }[];
  featureBreakdown: { name: string; label: string; count: number }[];
  actionBreakdown: { name: string; label: string; count: number }[];
  funnel: {
    pageViews: number; inquirySubmitted: number;
    waClickPublic: number; newJamaah: number;
  };
  recentEvents: {
    eventType: string; eventName: string; label: string; createdAt: string;
  }[];
}

function getInitials(name: string | null | undefined) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

function getRelativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Baru saja';
  if (mins < 60) return `${mins}m lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}j lalu`;
  const days = Math.floor(hours / 24);
  return `${days}h lalu`;
}

function TimelineTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-800 dark:bg-slate-700 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg">
      {d.day} — {d.total} event
    </div>
  );
}

export default function AgentDrillDownModal({
  slug,
  onClose,
}: {
  slug: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<DrillDownData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/agent/${slug}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Gagal memuat data agent');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Unknown error');
      setData(json.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 200);
  };

  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Max hour count for heatmap color scaling
  const maxHourCount = data
    ? Math.max(1, ...data.heatmap.flatMap(r => r.hourCounts))
    : 1;

  // Funnel rows — only show steps that have any value to avoid clutter on new agents
  const funnelRows = data ? [
    { key: 'pageViews', label: 'Page View', value: data.funnel.pageViews, icon: '👁️' },
    { key: 'waClickPublic', label: 'WA Click', value: data.funnel.waClickPublic, icon: '💬' },
    { key: 'inquirySubmitted', label: 'Inquiry', value: data.funnel.inquirySubmitted, icon: '📩' },
    { key: 'newJamaah', label: 'Jamaah Baru', value: data.funnel.newJamaah, icon: '🕋' },
  ] : [];
  const funnelMax = Math.max(1, ...funnelRows.map(r => r.value));

  return (
    <div className="fixed inset-0 z-[55]">
      <style>{`
        @keyframes add-slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes add-slideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
      `}</style>
      <div
        className={`absolute inset-0 ${closing ? 'dc-backdrop-exit' : 'dc-backdrop-enter'}`}
        style={{
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
        onClick={handleClose}
      />
      <div
        className="absolute inset-x-0 bottom-0 max-w-lg mx-auto bg-gray-50 dark:bg-slate-900 rounded-t-2xl border-t border-x border-gray-100 dark:border-slate-700 shadow-2xl flex flex-col max-h-[92vh]"
        style={{
          animation: closing
            ? 'add-slideDown 200ms ease-in forwards'
            : 'add-slideUp 250ms ease-out forwards',
        }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700/50 flex items-center justify-between flex-shrink-0 bg-white dark:bg-slate-800 rounded-t-2xl">
          <div className="flex items-center gap-2 min-w-0">
            {data?.agent.photo ? (
              <img
                src={data.agent.photo}
                alt={data.agent.name}
                className="w-9 h-9 rounded-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-[11px] font-bold text-gray-500 dark:text-slate-400">
                {getInitials(data?.agent.name)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-800 dark:text-white truncate">
                {data?.agent.name || 'Loading...'}
              </p>
              <p className="text-[10px] text-gray-400 dark:text-slate-500">Aktivitas 7 hari terakhir</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors active:scale-95 shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loading && (
            <div className="space-y-3">
              {[1,2,3,4].map(i => (
                <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-4">
                  <div className="h-4 w-32 bg-gray-100 dark:bg-slate-700 rounded animate-pulse mb-3" />
                  <div className="h-20 bg-gray-50 dark:bg-slate-900 rounded animate-pulse" />
                </div>
              ))}
            </div>
          )}

          {error && !loading && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 text-center">
              <AlertCircle size={24} className="text-red-500 mx-auto mb-2" />
              <p className="text-xs font-bold text-red-700 dark:text-red-300 mb-1">Gagal Memuat</p>
              <p className="text-[11px] text-red-600 dark:text-red-400 mb-3">{error}</p>
              <button
                onClick={fetchData}
                className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-[11px] font-medium hover:bg-red-700"
              >
                Coba Lagi
              </button>
            </div>
          )}

          {data && !loading && !error && (
            <>
              {/* Summary Stat Grid */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Total', value: data.summary.totalEvents, icon: <Zap size={14} />, color: 'cyan' },
                  { label: 'Hari Aktif', value: `${data.summary.activeDays}/7`, icon: <Calendar size={14} />, color: 'emerald' },
                  { label: 'Fitur', value: data.summary.uniqueFeatures, icon: <TrendingUp size={14} />, color: 'violet' },
                  { label: 'Login', value: data.summary.logins, icon: <UserCheck size={14} />, color: 'amber' },
                ].map(s => {
                  const colorBg: Record<string, string> = {
                    cyan: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400',
                    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
                    violet: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400',
                    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
                  };
                  return (
                    <div key={s.label} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-2.5">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-1.5 ${colorBg[s.color]}`}>
                        {s.icon}
                      </div>
                      <p className="text-[13px] font-extrabold text-gray-800 dark:text-white">{s.value}</p>
                      <p className="text-[8px] font-semibold text-gray-400 dark:text-slate-500 uppercase">{s.label}</p>
                    </div>
                  );
                })}
              </div>

              {/* Funnel (only if there's public traffic) */}
              {data.funnel.pageViews > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
                  <div className="px-4 pt-4 pb-2">
                    <p className="text-[10px] font-extrabold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Funnel Konversi</p>
                    <p className="text-[9px] text-gray-400 dark:text-slate-500 mt-0.5">Traffic publik → jamaah</p>
                  </div>
                  <div className="px-4 pb-4 space-y-1.5">
                    {funnelRows.map(r => {
                      const pct = Math.round((r.value / funnelMax) * 100);
                      const convertPct = r.key !== 'pageViews' && data.funnel.pageViews > 0
                        ? Math.round((r.value / data.funnel.pageViews) * 100)
                        : null;
                      return (
                        <div key={r.key}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[11px] font-semibold text-gray-700 dark:text-slate-200 flex items-center gap-1.5">
                              <span>{r.icon}</span>
                              {r.label}
                            </span>
                            <span className="text-[11px] font-bold text-gray-800 dark:text-white">
                              {r.value.toLocaleString()}
                              {convertPct !== null && <span className="text-[9px] text-gray-400 ml-1">({convertPct}%)</span>}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-100 dark:bg-slate-700">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
                <div className="px-4 pt-4 pb-2">
                  <p className="text-[10px] font-extrabold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Aktivitas Harian</p>
                  <p className="text-[9px] text-gray-400 dark:text-slate-500 mt-0.5">7 hari terakhir</p>
                </div>
                <div className="px-2 pb-3" style={{ height: 140 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.timeline} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 10, fill: '#9ca3af', fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<TimelineTooltip />} cursor={false} />
                      <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={32}>
                        {data.timeline.map((entry, i) => (
                          <Cell key={i} fill={entry.total > 0 ? '#06b6d4' : '#e5e7eb'} className="dark:opacity-90" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Heatmap */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
                <div className="px-4 pt-4 pb-2">
                  <p className="text-[10px] font-extrabold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Heatmap Jam Aktif</p>
                  <p className="text-[9px] text-gray-400 dark:text-slate-500 mt-0.5">WIB · 7 hari × 24 jam</p>
                </div>
                <div className="px-3 pb-3 overflow-x-auto">
                  <div className="min-w-[440px]">
                    {/* Hour labels (every 3h) */}
                    <div className="flex items-center gap-px pl-8 mb-1">
                      {Array.from({ length: 24 }, (_, h) => (
                        <div key={h} className="flex-1 text-[8px] text-gray-300 dark:text-slate-600 text-center">
                          {h % 3 === 0 ? h : ''}
                        </div>
                      ))}
                    </div>
                    {data.heatmap.map(row => (
                      <div key={row.date} className="flex items-center gap-px mb-0.5">
                        <div className="w-8 text-[9px] font-semibold text-gray-400 dark:text-slate-500 shrink-0">
                          {row.day}
                        </div>
                        {row.hourCounts.map((c, h) => {
                          const intensity = c === 0 ? 0 : Math.min(1, 0.2 + (c / maxHourCount) * 0.8);
                          return (
                            <div
                              key={h}
                              className="flex-1 aspect-square rounded-sm"
                              style={{
                                background: c === 0
                                  ? 'rgba(203,213,225,0.25)'
                                  : `rgba(16,185,129,${intensity})`,
                              }}
                              title={`${row.day} ${h.toString().padStart(2, '0')}:00 — ${c} event`}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Feature Breakdown */}
              {data.featureBreakdown.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
                  <div className="px-4 pt-4 pb-2">
                    <p className="text-[10px] font-extrabold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Fitur Dipakai</p>
                  </div>
                  <div className="px-4 pb-4 space-y-2">
                    {data.featureBreakdown.slice(0, 8).map((f, i) => {
                      const total = data.featureBreakdown.reduce((s, x) => s + x.count, 0) || 1;
                      const pct = Math.round((f.count / total) * 100);
                      return (
                        <div key={f.name}>
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded bg-gray-100 dark:bg-slate-700 text-[9px] font-extrabold text-gray-500 dark:text-slate-400 flex items-center justify-center">
                                {i + 1}
                              </span>
                              <span className="text-[11px] font-semibold text-gray-700 dark:text-slate-200">{f.label}</span>
                            </div>
                            <span className="text-[11px] font-bold text-gray-800 dark:text-white">{f.count}</span>
                          </div>
                          <div className="h-1 rounded-full bg-gray-100 dark:bg-slate-700">
                            <div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action Breakdown */}
              {data.actionBreakdown.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
                  <div className="px-4 pt-4 pb-2">
                    <p className="text-[10px] font-extrabold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Aksi Dilakukan</p>
                  </div>
                  <div className="px-4 pb-4 space-y-1">
                    {data.actionBreakdown.slice(0, 10).map(a => (
                      <div key={a.name} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-gray-50 dark:bg-slate-900">
                        <span className="text-[11px] font-medium text-gray-700 dark:text-slate-200">{a.label}</span>
                        <span className="text-[11px] font-extrabold text-gray-800 dark:text-white">{a.count}×</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Events */}
              {data.recentEvents.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
                  <div className="px-4 pt-4 pb-2">
                    <p className="text-[10px] font-extrabold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Event Terbaru</p>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
                    {data.recentEvents.map((e, i) => (
                      <div key={i} className="px-4 py-2 flex items-center justify-between">
                        <span className="text-[11px] text-gray-700 dark:text-slate-200 truncate">{e.label}</span>
                        <span className="text-[9px] text-gray-400 dark:text-slate-500 shrink-0 ml-2">
                          {getRelativeTime(e.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.summary.totalEvents === 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-8 text-center">
                  <TrendingUp size={28} className="mx-auto text-gray-300 dark:text-slate-600 mb-2" />
                  <p className="text-[12px] font-semibold text-gray-500 dark:text-slate-400">
                    Belum ada aktivitas 7 hari terakhir
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
