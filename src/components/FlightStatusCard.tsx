import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plane, RefreshCw, ChevronDown, Clock } from 'lucide-react';

const FlightMap = lazy(() => import('./FlightMap'));

// ── Types ──

interface FlightData {
  id: string;
  flightNumber: string;
  airline: string;
  airlineLogo?: string;
  group: string;
  status: 'en-route' | 'scheduled' | 'landed' | 'delayed' | 'cancelled';
  depCity: string;
  depCode: string;
  depTerminal?: string;
  depGate?: string;
  depScheduled: string;
  depActual?: string;
  arrCity: string;
  arrCode: string;
  arrTerminal?: string;
  arrGate?: string;
  arrScheduled: string;
  arrEstimated?: string;
  pax: number;
  tourLeader: string;
  lat?: number;
  lng?: number;
  alt?: number;
  speed?: number;
  progress: number;
  delayed: number;
}

type FilterType = 'all' | 'en-route' | 'scheduled' | 'delayed' | 'landed';

// ── Status Config ──

const STATUS_CONFIG: Record<string, {
  label: string; bg: string; text: string; border: string; dot: string; pulse: boolean;
}> = {
  'en-route': {
    label: 'Dalam Penerbangan',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-100 dark:border-blue-800/40',
    dot: 'bg-blue-500',
    pulse: true,
  },
  'scheduled': {
    label: 'Terjadwal',
    bg: 'bg-gray-50 dark:bg-slate-700/50',
    text: 'text-gray-600 dark:text-slate-300',
    border: 'border-gray-200 dark:border-slate-600',
    dot: 'bg-gray-400',
    pulse: false,
  },
  'landed': {
    label: 'Mendarat',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-100 dark:border-emerald-800/40',
    dot: 'bg-emerald-500',
    pulse: false,
  },
  'delayed': {
    label: 'Delay',
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-100 dark:border-red-800/40',
    dot: 'bg-red-500',
    pulse: true,
  },
  'cancelled': {
    label: 'Dibatalkan',
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-200 dark:border-red-800/40',
    dot: 'bg-red-600',
    pulse: false,
  },
};

const FILTER_PILLS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'en-route', label: 'Terbang' },
  { key: 'scheduled', label: 'Terjadwal' },
  { key: 'delayed', label: 'Delay' },
  { key: 'landed', label: 'Mendarat' },
];

// ── Helpers ──

function formatTime(iso?: string): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Arrow SVG ──

function ArrowRight() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="text-gray-300 dark:text-slate-600 mx-0.5 flex-shrink-0">
      <path d="M0 5h12M9 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Component ──

export default function FlightStatusCard() {
  const [flights, setFlights] = useState<FlightData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(0);
  const [notReady, setNotReady] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchFlights = useCallback(async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      else if (flights.length === 0) setLoading(true);
      const token = localStorage.getItem('auth_token');
      const res = await fetch('/api/flights/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) {
        setNotReady(true);
        setFlights([]);
        return;
      }
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      if (data.success) {
        setFlights(data.data || []);
        setNotReady(false);
        // Auto-expand first en-route flight
        if (!expandedId) {
          const enRoute = (data.data || []).find((f: FlightData) => f.status === 'en-route');
          if (enRoute) setExpandedId(enRoute.id);
        }
      }
    } catch {
      if (flights.length === 0) setNotReady(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLastRefresh(Date.now());
    }
  }, [expandedId, flights.length]);

  // Initial fetch + auto-refresh every 60s
  useEffect(() => {
    fetchFlights();
    refreshTimer.current = setInterval(() => fetchFlights(), 60000);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManualRefresh = useCallback(() => {
    if (Date.now() - lastRefresh < 10000) return; // 10s cooldown
    fetchFlights(true);
  }, [fetchFlights, lastRefresh]);

  // Filter
  const filtered = filter === 'all' ? flights : flights.filter(f => f.status === filter);

  // Counts
  const counts: Record<FilterType, number> = {
    all: flights.length,
    'en-route': flights.filter(f => f.status === 'en-route').length,
    scheduled: flights.filter(f => f.status === 'scheduled').length,
    delayed: flights.filter(f => f.status === 'delayed').length,
    landed: flights.filter(f => f.status === 'landed').length,
  };

  const enRouteCount = counts['en-route'];
  const delayCount = counts.delayed;

  // ── Skeleton ──
  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gray-200 dark:bg-slate-700 animate-pulse" />
          <div className="h-3.5 w-28 rounded-md bg-gray-200 dark:bg-slate-700 animate-pulse" />
        </div>
        <div className="px-4 py-2 flex gap-1.5 border-b border-gray-50 dark:border-slate-700/50">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-6 w-16 rounded-lg bg-gray-200 dark:bg-slate-700 animate-pulse" />
          ))}
        </div>
        <div className="p-3 space-y-2.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
      {/* ── Header ── */}
      <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 flex items-center justify-center">
            <Plane size={14} className="text-blue-600 dark:text-blue-400" strokeWidth={2} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-gray-800 dark:text-white">Flight Status</span>
            {enRouteCount > 0 && (
              <span className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 rounded-md px-1.5 py-0.5 text-[9px] font-bold text-blue-600 dark:text-blue-400">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                {enRouteCount} aktif
              </span>
            )}
            {delayCount > 0 && (
              <span className="flex items-center gap-1 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40 rounded-md px-1.5 py-0.5 text-[9px] font-bold text-red-600 dark:text-red-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                {delayCount} delay
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-gray-400 dark:text-slate-500">Live</span>
        </div>
      </div>

      {/* ── Filter Pills ── */}
      {!notReady && flights.length > 0 && (
        <div className="px-4 py-2 flex gap-1.5 overflow-x-auto no-scrollbar border-b border-gray-50 dark:border-slate-700/50">
          {FILTER_PILLS.map(pill => (
            <button
              key={pill.key}
              onClick={() => setFilter(pill.key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all active:scale-95 ${
                filter === pill.key
                  ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20'
                  : 'bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-700'
              }`}
            >
              {pill.label}
              <span className={`text-[8px] ${filter === pill.key ? 'text-white/70' : 'text-gray-400 dark:text-slate-500'}`}>
                {counts[pill.key]}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Flight Cards ── */}
      {notReady ? (
        <div className="py-10 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-3">
            <Plane size={22} strokeWidth={1.5} className="text-gray-300 dark:text-slate-500" />
          </div>
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">Fitur segera hadir</p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Flight tracking akan tersedia dalam update mendatang</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-3">
            <Plane size={22} strokeWidth={1.5} className="text-gray-300 dark:text-slate-500" />
          </div>
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">Tidak ada penerbangan</p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">dengan status ini</p>
        </div>
      ) : (
        <div className="p-3 space-y-2.5">
          {filtered.map(flight => {
            const sc = STATUS_CONFIG[flight.status] || STATUS_CONFIG.scheduled;
            const isExpanded = expandedId === flight.id;

            return (
              <div
                key={flight.id}
                className={`bg-white dark:bg-slate-800 rounded-2xl border shadow-sm overflow-hidden transition-all duration-200 ${
                  isExpanded
                    ? 'border-blue-200 dark:border-blue-800/40 shadow-md shadow-blue-500/5'
                    : 'border-gray-100 dark:border-slate-700'
                }`}
              >
                {/* Collapsed */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : flight.id)}
                  className="w-full flex items-center gap-3 px-3.5 py-3 text-left active:bg-gray-50 dark:active:bg-slate-700/50 transition-colors"
                >
                  {/* Airline icon */}
                  <div className="relative flex-shrink-0">
                    <div className={`w-10 h-10 rounded-xl ${sc.bg} border ${sc.border} flex items-center justify-center overflow-hidden`}>
                      {flight.airlineLogo ? (
                        <img
                          src={flight.airlineLogo}
                          alt={flight.airline}
                          className="w-7 h-7 object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).parentElement!.innerText = flight.flightNumber.split(' ')[0];
                          }}
                        />
                      ) : (
                        <span className={`text-[10px] font-bold ${sc.text}`}>{flight.flightNumber.split(' ')[0]}</span>
                      )}
                    </div>
                    {(flight.status === 'en-route' || flight.status === 'delayed') && (
                      <div className="absolute -top-0.5 -right-0.5">
                        <span className={`flex w-2.5 h-2.5 relative`}>
                          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${sc.dot} opacity-75`} />
                          <span className={`relative inline-flex rounded-full w-2.5 h-2.5 ${sc.dot}`} />
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Flight info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-gray-800 dark:text-white">{flight.flightNumber}</span>
                      <span className="text-[10px] text-gray-400 dark:text-slate-500">•</span>
                      <span className="text-[10px] text-gray-400 dark:text-slate-500">Grup {flight.group}</span>
                    </div>
                    <div className="flex items-center mt-0.5">
                      <span className="text-[11px] font-semibold text-gray-600 dark:text-slate-300">{flight.depCode}</span>
                      <ArrowRight />
                      <span className="text-[11px] font-semibold text-gray-600 dark:text-slate-300">{flight.arrCode}</span>
                      <span className="text-[11px] text-gray-300 dark:text-slate-600 mx-1.5">|</span>
                      <span className="text-[11px] text-gray-400 dark:text-slate-500">{formatTime(flight.depScheduled)}</span>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md ${sc.bg} ${sc.text} border ${sc.border}`}>
                      {sc.label}
                    </span>
                    {flight.delayed > 0 && (
                      <span className="text-[9px] font-bold text-red-500">+{flight.delayed}m delay</span>
                    )}
                  </div>

                  {/* Chevron */}
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="text-gray-300 dark:text-slate-600 flex-shrink-0"
                  >
                    <ChevronDown size={14} />
                  </motion.div>
                </button>

                {/* Expanded content */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      key="expanded"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
                        opacity: { duration: 0.2, ease: 'easeInOut' },
                      }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div className="border-t border-gray-50 dark:border-slate-700/50">
                        <div className="px-3.5 pb-3.5 pt-2 space-y-3">

                          {/* Flight Map */}
                          {(flight.status === 'en-route' || flight.status === 'landed') && (
                            <Suspense fallback={
                              <div className="w-full h-36 rounded-xl bg-slate-100 dark:bg-slate-700/50 border border-gray-100 dark:border-slate-600 animate-pulse" />
                            }>
                              <FlightMap flight={flight} />
                            </Suspense>
                          )}

                          {/* Time details */}
                          <div className="grid grid-cols-2 gap-2.5">
                            {/* Departure */}
                            <div className={`px-3 py-2.5 rounded-xl border ${
                              flight.depActual || flight.status === 'en-route' || flight.status === 'landed'
                                ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/30'
                                : 'bg-gray-50 dark:bg-slate-700/30 border-gray-100 dark:border-slate-600/50'
                            }`}>
                              <div className="flex items-center gap-1 mb-1.5">
                                <Clock size={9} className="text-gray-400 dark:text-slate-500" />
                                <span className="text-[9px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Keberangkatan</span>
                              </div>
                              <div>
                                <span className="text-lg font-bold text-gray-800 dark:text-white">
                                  {formatTime(flight.depActual || flight.depScheduled)}
                                </span>
                                {flight.depActual && flight.depActual !== flight.depScheduled && (
                                  <span className="text-[10px] text-gray-400 line-through ml-1.5">{formatTime(flight.depScheduled)}</span>
                                )}
                              </div>
                              <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5">{flight.depCity} ({flight.depCode})</p>
                              <div className="flex gap-1 mt-1.5">
                                {flight.depTerminal && (
                                  <span className="text-[9px] font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 px-1.5 py-0.5 rounded-md text-gray-500 dark:text-slate-400">
                                    T{flight.depTerminal}
                                  </span>
                                )}
                                {flight.depGate && (
                                  <span className="text-[9px] font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 px-1.5 py-0.5 rounded-md text-gray-500 dark:text-slate-400">
                                    Gate {flight.depGate}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Arrival */}
                            <div className={`px-3 py-2.5 rounded-xl border ${
                              flight.status === 'landed'
                                ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/30'
                                : 'bg-gray-50 dark:bg-slate-700/30 border-gray-100 dark:border-slate-600/50'
                            }`}>
                              <div className="flex items-center gap-1 mb-1.5">
                                <Clock size={9} className="text-gray-400 dark:text-slate-500" />
                                <span className="text-[9px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Kedatangan</span>
                              </div>
                              <div>
                                <span className="text-lg font-bold text-gray-800 dark:text-white">
                                  {formatTime(flight.arrEstimated || flight.arrScheduled)}
                                </span>
                                {flight.arrEstimated && flight.arrEstimated !== flight.arrScheduled && (
                                  <span className="text-[10px] text-gray-400 line-through ml-1.5">{formatTime(flight.arrScheduled)}</span>
                                )}
                              </div>
                              <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5">{flight.arrCity} ({flight.arrCode})</p>
                              <div className="flex gap-1 mt-1.5">
                                {flight.arrTerminal && (
                                  <span className="text-[9px] font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 px-1.5 py-0.5 rounded-md text-gray-500 dark:text-slate-400">
                                    T{flight.arrTerminal}
                                  </span>
                                )}
                                {flight.arrGate && (
                                  <span className="text-[9px] font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 px-1.5 py-0.5 rounded-md text-gray-500 dark:text-slate-400">
                                    Gate {flight.arrGate}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Group info */}
                          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-100 dark:border-slate-700">
                            <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400">
                              {flight.pax} jamaah
                            </span>
                            <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400">
                              TL: {flight.tourLeader}
                            </span>
                            <span className="text-[10px] text-gray-400 dark:text-slate-500">
                              {formatDate(flight.depScheduled)}
                            </span>
                          </div>

                          {/* Progress bar (en-route only) */}
                          {flight.status === 'en-route' && (
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[9px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">
                                  Progress Penerbangan
                                </span>
                                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                                  {flight.progress}%
                                </span>
                              </div>
                              <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-500 transition-all duration-500"
                                  style={{ width: `${flight.progress}%` }}
                                />
                              </div>
                            </div>
                          )}

                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="px-4 py-2 border-t border-gray-50 dark:border-slate-700/50 flex items-center justify-between">
        <span className="text-[10px] text-gray-400 dark:text-slate-500">Update 30-60 detik</span>
        <button
          onClick={handleManualRefresh}
          disabled={refreshing || (Date.now() - lastRefresh < 10000)}
          className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>
    </div>
  );
}
