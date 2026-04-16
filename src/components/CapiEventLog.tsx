import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight, Filter, Inbox, CheckCircle2, XCircle, ArrowUpRight } from 'lucide-react';

interface LogEntry {
  id: number;
  event_name: string;
  status: 'success' | 'error';
  value: number | null;
  error_message: string | null;
  source: string;
  created_at: string;
}

const EVENT_STYLE: Record<string, { bg: string; text: string; icon: string }> = {
  Purchase:    { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', icon: '💰' },
  Contact:     { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-600 dark:text-blue-400', icon: '💬' },
  PageView:    { bg: 'bg-slate-50 dark:bg-slate-800/50', text: 'text-slate-500 dark:text-slate-400', icon: '👁' },
  Search:      { bg: 'bg-slate-50 dark:bg-slate-800/50', text: 'text-slate-500 dark:text-slate-400', icon: '🔍' },
  ViewContent: { bg: 'bg-slate-50 dark:bg-slate-800/50', text: 'text-slate-500 dark:text-slate-400', icon: '📄' },
};

const EVENT_OPTIONS = ['', 'Purchase', 'Contact', 'PageView', 'Search', 'ViewContent'];

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 10) return 'baru saja';
  if (diff < 60) return `${diff}dtk lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)}mnt lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}jam lalu`;
  return `${Math.floor(diff / 86400)}hr lalu`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatValue(value: number | null): string {
  if (!value) return '';
  if (value >= 1_000_000) return `Rp${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}jt`;
  if (value >= 1_000) return `Rp${(value / 1_000).toFixed(0)}rb`;
  return `Rp${value.toLocaleString('id-ID')}`;
}

export default function CapiEventLog({ agentSlug }: { agentSlug: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async (p = page, event = filter) => {
    try {
      const params = new URLSearchParams({ page: String(p), limit: '20' });
      if (event) params.set('event', event);
      const res = await fetch(`/api/capi/${agentSlug}/logs?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [agentSlug, page, filter]);

  useEffect(() => {
    setLoading(true);
    fetchLogs(page, filter);
  }, [page, filter]);

  // Auto-refresh every 30s only when tab visible
  useEffect(() => {
    const tick = () => { if (!document.hidden) fetchLogs(page, filter); };
    intervalRef.current = setInterval(tick, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchLogs, page, filter]);

  const handleFilter = (event: string) => {
    setFilter(event);
    setPage(1);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-gray-700 dark:text-slate-200">Event Log</span>
          {total > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 font-medium">{total}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <select
              value={filter}
              onChange={e => handleFilter(e.target.value)}
              className="appearance-none text-[11px] pl-6 pr-5 py-1 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            >
              <option value="">Semua Event</option>
              {EVENT_OPTIONS.filter(Boolean).map(e => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
            <Filter size={9} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 pointer-events-none" />
          </div>
          <button
            onClick={() => { setLoading(true); fetchLogs(page, filter); }}
            className="p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading && logs.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-gray-400 dark:text-slate-500">
          <RefreshCw size={14} className="animate-spin mr-2" />
          <span className="text-xs">Memuat...</span>
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-slate-500">
          <Inbox size={24} className="mb-2 opacity-40" />
          <p className="text-xs font-medium">Belum ada event</p>
          <p className="text-[10px] mt-1 text-center leading-relaxed opacity-70">
            Event akan muncul saat pengunjung<br />berinteraksi atau jamaah di-sync.
          </p>
        </div>
      ) : (
        <>
          {/* Card list */}
          <div className="space-y-1.5">
            {logs.map(log => {
              const style = EVENT_STYLE[log.event_name] || EVENT_STYLE.PageView;
              return (
                <div
                  key={log.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${style.bg} transition-colors`}
                  title={log.error_message || undefined}
                >
                  {/* Status icon */}
                  <div className="flex-shrink-0">
                    {log.status === 'success' ? (
                      <CheckCircle2 size={16} className="text-emerald-500 dark:text-emerald-400" />
                    ) : (
                      <XCircle size={16} className="text-red-400 dark:text-red-400" />
                    )}
                  </div>

                  {/* Event info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[12px] font-semibold ${style.text}`}>
                        {log.event_name}
                      </span>
                      {log.source === 'sync' && (
                        <span className="text-[9px] px-1 py-px rounded bg-white/60 dark:bg-white/10 text-gray-400 dark:text-slate-500 font-medium">
                          sync
                        </span>
                      )}
                      {log.source === 'browser' && (
                        <ArrowUpRight size={10} className="text-gray-300 dark:text-slate-600" />
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 dark:text-slate-500" title={formatDate(log.created_at)}>
                      {timeAgo(log.created_at)}
                    </span>
                  </div>

                  {/* Value */}
                  {log.value ? (
                    <span className="text-[11px] font-semibold text-gray-700 dark:text-slate-200 tabular-nums">
                      {formatValue(log.value)}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-slate-700/50">
              <span className="text-[10px] text-gray-400 dark:text-slate-500">
                Hal {page} dari {totalPages}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-medium border border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400 disabled:opacity-25 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <ChevronLeft size={12} />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-medium border border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400 disabled:opacity-25 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
