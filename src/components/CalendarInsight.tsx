import { useState, useEffect, useCallback } from 'react';
import { Sparkles, RefreshCw, Loader2, Plane, Calendar, Lightbulb } from 'lucide-react';
import { getAuthHeaders } from './LoginPage';

interface InsightData {
  today: string;
  weekly: string;
  talkingPoint: string;
  generatedAt: string;
}

/** Parse **bold** markdown to <strong> elements */
function renderBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold text-gray-700 dark:text-slate-200">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function formatInsightTime(iso: string) {
  try {
    const d = new Date(iso);
    const day = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' });
    const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${day}, ${time} WIB`;
  } catch {
    return '';
  }
}

export default function CalendarInsight() {
  const [insight, setInsight] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchInsight = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar/insight', { headers: getAuthHeaders() });
      const data = await res.json();
      console.log('[CalendarInsight] API response:', data);
      if (data.success && data.data) {
        setInsight(data.data);
        setError('');
      } else {
        setError(data.error || 'No data');
      }
    } catch (err) {
      console.error('[CalendarInsight] Fetch error:', err);
      setError('Fetch failed');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchInsight(); }, [fetchInsight]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError('');
    try {
      const res = await fetch('/api/calendar/insight/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      });
      const data = await res.json();
      if (res.status === 429) {
        setError(data.error || 'Tunggu beberapa menit');
      } else if (data.success && data.data) {
        setInsight(data.data);
      } else {
        setError(data.error || 'Gagal generate insight');
      }
    } catch {
      setError('Gagal menghubungi server');
    }
    setRefreshing(false);
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden mb-5">
        <div className="px-4 py-3 flex items-center gap-2">
          <div className="w-7 h-7 bg-gray-100 dark:bg-slate-700 rounded-lg animate-pulse" />
          <div className="h-3 w-20 bg-gray-200 dark:bg-slate-700 rounded animate-pulse" />
        </div>
        <div className="px-4 pb-4 space-y-2">
          <div className="bg-gray-50 dark:bg-slate-700/30 rounded-xl h-16 animate-pulse" />
          <div className="bg-gray-50 dark:bg-slate-700/30 rounded-xl h-16 animate-pulse" />
          <div className="bg-gray-50 dark:bg-slate-700/30 rounded-xl h-16 animate-pulse" />
        </div>
      </div>
    );
  }

  // No insight data — don't render anything
  if (!insight && !error) {
    return <div className="hidden" />;
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden mb-5">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 flex items-center justify-center">
            <Sparkles size={14} className="text-amber-500 dark:text-amber-400" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-gray-700 dark:text-slate-200">AI Insight</span>
            {insight?.generatedAt && (
              <p className="text-[9px] text-gray-400 dark:text-slate-500">{formatInsightTime(insight.generatedAt)}</p>
            )}
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors active:scale-95 disabled:opacity-50"
        >
          {refreshing ? (
            <><Loader2 size={12} className="animate-spin" /> Generating...</>
          ) : (
            <><RefreshCw size={12} /> Refresh</>
          )}
        </button>
      </div>

      {/* Error state */}
      {error && !insight && (
        <div className="px-4 pb-4">
          <div className="bg-gray-50 dark:bg-slate-700/30 rounded-xl px-3 py-4 text-center">
            <p className="text-[11px] text-gray-400 dark:text-slate-500">Insight belum tersedia. Coba refresh nanti.</p>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="mt-2 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 active:scale-95"
            >
              {refreshing ? 'Generating...' : 'Coba Lagi'}
            </button>
          </div>
        </div>
      )}

      {/* Rate limit message */}
      {error && insight && (
        <div className="px-4 pb-1">
          <p className="text-[9px] text-amber-500 dark:text-amber-400 text-center">{error}</p>
        </div>
      )}

      {/* 3 Mini Cards */}
      {insight && (
        <div className="px-4 pb-4 space-y-2">
          {/* Card 1 — Hari Ini (emerald) */}
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800/40 px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Plane size={12} className="text-emerald-500 dark:text-emerald-400" />
              <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">HARI INI</span>
            </div>
            <p className="text-[11px] text-gray-600 dark:text-slate-300 leading-relaxed">
              {renderBold(insight.today)}
            </p>
          </div>

          {/* Card 2 — 7 Hari ke Depan (blue) */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/40 px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Calendar size={12} className="text-blue-500 dark:text-blue-400" />
              <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">7 HARI KE DEPAN</span>
            </div>
            <p className="text-[11px] text-gray-600 dark:text-slate-300 leading-relaxed">
              {renderBold(insight.weekly)}
            </p>
          </div>

          {/* Card 3 — Talking Point (amber) */}
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800/40 px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Lightbulb size={12} className="text-amber-500 dark:text-amber-400" />
              <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">TALKING POINT</span>
            </div>
            <p className="text-[11px] text-gray-600 dark:text-slate-300 leading-relaxed">
              {renderBold(insight.talkingPoint)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
