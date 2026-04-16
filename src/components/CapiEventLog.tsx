import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight, Filter, Inbox } from 'lucide-react';

interface LogEntry {
  id: number;
  event_name: string;
  status: 'success' | 'error';
  value: number | null;
  error_message: string | null;
  source: string;
  created_at: string;
}

const EVENT_COLORS: Record<string, string> = {
  Purchase: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  Contact: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  PageView: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300',
  Search: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300',
  ViewContent: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300',
};

const EVENT_OPTIONS = ['', 'Purchase', 'Contact', 'PageView', 'Search', 'ViewContent'];

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff} detik lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return `${Math.floor(diff / 86400)} hari lalu`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
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

  // Auto-refresh every 30s
  useEffect(() => {
    intervalRef.current = setInterval(() => fetchLogs(page, filter), 30000);
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
        <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200">
          Event Log
          {total > 0 && <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-slate-500">({total})</span>}
        </h3>
        <div className="flex items-center gap-2">
          {/* Filter */}
          <div className="relative">
            <select
              value={filter}
              onChange={e => handleFilter(e.target.value)}
              className="appearance-none text-[11px] pl-6 pr-6 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            >
              <option value="">Semua Event</option>
              {EVENT_OPTIONS.filter(Boolean).map(e => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
            <Filter size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 pointer-events-none" />
          </div>
          {/* Refresh */}
          <button
            onClick={() => { setLoading(true); fetchLogs(page, filter); }}
            className="p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Table */}
      {loading && logs.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-gray-400 dark:text-slate-500">
          <RefreshCw size={16} className="animate-spin mr-2" /> Memuat...
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-slate-500">
          <Inbox size={28} className="mb-2 opacity-50" />
          <p className="text-xs">Belum ada event.</p>
          <p className="text-[10px] mt-0.5">Event akan muncul saat pengunjung berinteraksi atau jamaah di-sync.</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-100 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-slate-400">
                  <th className="text-left px-3 py-2 font-medium">Waktu</th>
                  <th className="text-left px-3 py-2 font-medium">Event</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-right px-3 py-2 font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-3 py-2 text-gray-500 dark:text-slate-400 whitespace-nowrap" title={formatDate(log.created_at)}>
                      {timeAgo(log.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${EVENT_COLORS[log.event_name] || EVENT_COLORS.PageView}`}>
                        {log.event_name}
                      </span>
                      {log.source === 'sync' && (
                        <span className="ml-1 text-[9px] text-gray-400 dark:text-slate-500">sync</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {log.status === 'success' ? (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                          OK
                        </span>
                      ) : (
                        <span
                          className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 cursor-help"
                          title={log.error_message || 'Error'}
                        >
                          Error
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600 dark:text-slate-300 font-mono whitespace-nowrap">
                      {log.value ? `Rp${log.value.toLocaleString('id-ID')}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <span className="text-[10px] text-gray-400 dark:text-slate-500">
                Hal {page}/{totalPages}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <ChevronLeft size={12} />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
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
