import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';

interface LogEntry {
  id: number;
  event_name: string;
  status: 'success' | 'error';
  value: number | null;
  error_message: string | null;
  source: string;
  created_at: string;
}

const EVENT_OPTIONS = ['', 'Purchase', 'Contact', 'PageView', 'Search', 'ViewContent'];

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 10) return 'Baru saja';
  if (diff < 60) return `${diff}dtk`;
  if (diff < 3600) return `${Math.floor(diff / 60)}mnt`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}jam`;
  return `${Math.floor(diff / 86400)}hr`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function fmtRpShort(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}M`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}jt`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}rb`;
  return value.toLocaleString('id-ID');
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

  useEffect(() => {
    const tick = () => { if (!document.hidden) fetchLogs(page, filter); };
    intervalRef.current = setInterval(tick, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchLogs, page, filter]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-slate-300">Event Log</span>
          {total > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500">{total}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <select
            value={filter}
            onChange={e => { setFilter(e.target.value); setPage(1); }}
            className="h-7 text-[10px] font-bold text-gray-600 dark:text-slate-300 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-2 pr-6 outline-none appearance-none cursor-pointer"
          >
            <option value="">Semua</option>
            {EVENT_OPTIONS.filter(Boolean).map(e => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
          <button
            onClick={() => { setLoading(true); fetchLogs(page, filter); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading && logs.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-gray-400 dark:text-slate-500">
          <RefreshCw size={16} className="animate-spin mr-2" />
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
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-700">
                  <th className="text-left px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Waktu</th>
                  <th className="text-left px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Event</th>
                  <th className="text-left px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Status</th>
                  <th className="text-right px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Value</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr
                    key={log.id}
                    className={i < logs.length - 1 ? 'border-b border-gray-50 dark:border-slate-700/50' : ''}
                    title={log.error_message || formatDate(log.created_at)}
                  >
                    <td className="px-2.5 py-1.5 text-gray-400 dark:text-slate-500 whitespace-nowrap">
                      {timeAgo(log.created_at)}
                    </td>
                    <td className="px-2.5 py-1.5">
                      <span className="font-semibold text-gray-700 dark:text-slate-200">{log.event_name}</span>
                      {log.source === 'sync' && (
                        <span className="ml-1 text-[9px] font-bold uppercase px-1 py-px rounded bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500">sync</span>
                      )}
                    </td>
                    <td className="px-2.5 py-1.5">
                      {log.status === 'success' ? (
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">OK</span>
                      ) : (
                        <span className="text-[10px] font-bold text-red-500 dark:text-red-400">Error</span>
                      )}
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-semibold text-gray-700 dark:text-slate-200 tabular-nums whitespace-nowrap">
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
              <span className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">
                Hal {page}/{totalPages}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-xs font-bold border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 disabled:opacity-25 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors bg-white dark:bg-slate-800"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-xs font-bold border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 disabled:opacity-25 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors bg-white dark:bg-slate-800"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
