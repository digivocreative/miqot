import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plane, PlaneTakeoff, PlaneLanding, Users, MapPin, ChevronDown, Clock, BaggageClaim, ArrowUp, Zap } from 'lucide-react';
import { getAuthHeaders } from './LoginPage';
import { trackEvent } from '../utils/analytics';

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
  depDate?: string;  // full ISO for date display (airport local time)
  lat?: number;
  lng?: number;
  alt?: number;
  speed?: number;
  progress: number;
  delayed: number;
  aircraftType?: string | null;
  aircraftReg?: string | null;
  duration?: number | null;
  depDelayed?: number;
  arrDelayed?: number;
  arrBaggage?: string | null;
}

// ── Status Config ──

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  'en-route':  { label: 'Terbang',     color: '#3b82f6', bg: 'bg-blue-500' },
  'scheduled': { label: 'Terjadwal',   color: '#6366f1', bg: 'bg-indigo-500' },
  'landed':    { label: 'Mendarat',    color: '#10b981', bg: 'bg-emerald-500' },
  'delayed':   { label: 'Delay',       color: '#ef4444', bg: 'bg-red-500' },
  'cancelled': { label: 'Dibatalkan',  color: '#dc2626', bg: 'bg-red-600' },
};

// ── Helpers ──

function formatTime(val?: string | null): string {
  if (!val) return '—';
  const s = String(val);
  // Already "HH:mm" format from server (timezone-converted)
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  // "07.50" → "07:50"
  if (/^\d{2}\.\d{2}$/.test(s)) return s.replace('.', ':');
  // ISO datetime → "HH:mm" (uses browser timezone as last resort)
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    }
  } catch { /* ignore */ }
  // Fallback: replace dots
  return s.replace(/\./g, ':');
}

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' });
  } catch {
    return '';
  }
}

function cleanTourLeader(tl?: string): string {
  if (!tl) return '';
  return tl.replace(/^[•·\-–—]\s*/, '').trim();
}

function formatDuration(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} menit`;
  if (m === 0) return `${h} jam`;
  return `${h} jam ${m} menit`;
}

// ── RouteLine SVG ──

function RouteLine({ flight }: { flight: FlightData }) {
  const w = 100, h = 16;
  const x1 = 4, x2 = w - 4;
  const prog = flight.progress / 100;
  const px = x1 + (x2 - x1) * prog;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-shrink-0">

      {/* ===== TERJADWAL: Marching Ants ===== */}
      {flight.status === 'scheduled' && (
        <line
          x1={x1} y1={h/2} x2={x2} y2={h/2}
          stroke="#d1d5db" strokeWidth="2" strokeDasharray="4 4"
          className="dark:stroke-slate-600"
        >
          <animate attributeName="stroke-dashoffset" values="0;-16" dur="1s" repeatCount="indefinite" />
        </line>
      )}

      {/* ===== EN-ROUTE: Solid traveled + dashed remaining ===== */}
      {flight.status === 'en-route' && (
        <>
          {/* Remaining path (dashed, no animation) */}
          <line
            x1={x1} y1={h/2} x2={x2} y2={h/2}
            stroke="#e5e7eb" strokeWidth="1.5" strokeDasharray="3 2"
            className="dark:stroke-slate-600"
          />
          {/* Traveled path (solid blue) */}
          <line
            x1={x1} y1={h/2} x2={px} y2={h/2}
            stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round"
          />
        </>
      )}

      {/* ===== DELAYED: Same as scheduled but red ===== */}
      {flight.status === 'delayed' && (
        <line
          x1={x1} y1={h/2} x2={x2} y2={h/2}
          stroke="#fca5a5" strokeWidth="2" strokeDasharray="4 4"
          className="dark:stroke-red-800"
        >
          <animate attributeName="stroke-dashoffset" values="0;-16" dur="1s" repeatCount="indefinite" />
        </line>
      )}

      {/* ===== LANDED: Solid green line ===== */}
      {flight.status === 'landed' && (
        <line
          x1={x1} y1={h/2} x2={x2} y2={h/2}
          stroke="#10b981" strokeWidth="2.5" strokeLinecap="round"
        />
      )}

      {/* ===== CANCELLED: Gray dashed static ===== */}
      {flight.status === 'cancelled' && (
        <line
          x1={x1} y1={h/2} x2={x2} y2={h/2}
          stroke="#d1d5db" strokeWidth="1.5" strokeDasharray="3 3"
          className="dark:stroke-slate-600"
        />
      )}

      {/* ===== Departure dot (selalu hijau) ===== */}
      <circle cx={x1} cy={h/2} r="3" fill="#10b981" stroke="white" strokeWidth="1.5" />

      {/* ===== Arrival dot ===== */}
      {flight.status !== 'landed' && (
        <circle cx={x2} cy={h/2} r="3"
          fill={flight.status === 'cancelled' ? '#d1d5db' : '#cbd5e1'}
          stroke="white" strokeWidth="1.5"
          className="dark:fill-slate-500"
        />
      )}

      {/* ===== EN-ROUTE: Plane dot with pulse ===== */}
      {flight.status === 'en-route' && (
        <>
          <circle cx={px} cy={h/2} r="5" fill="#3b82f6" stroke="white" strokeWidth="1.5">
            <animate attributeName="r" values="4;6;4" dur="1.5s" repeatCount="indefinite" />
          </circle>
          <text
            x={px} y={h/2}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="7" fill="white"
          >✈</text>
        </>
      )}

      {/* ===== LANDED: Checkmark pop ===== */}
      {flight.status === 'landed' && (
        <g transform={`translate(${x2 - 5}, ${h/2 - 5})`}>
          <circle cx="5" cy="5" r="5" fill="#10b981" stroke="white" strokeWidth="1.5">
            <animate attributeName="r" values="3;6;5" dur="0.6s" fill="freeze" />
          </circle>
          <path
            d="M3 5.5 L4.5 7 L7.5 3.5"
            stroke="white" strokeWidth="1.5" fill="none"
            strokeLinecap="round" strokeLinejoin="round"
            opacity="0"
          >
            <animate attributeName="opacity" values="0;0;1" dur="0.6s" fill="freeze" />
          </path>
        </g>
      )}

    </svg>
  );
}


// ── Component ──

export default function FlightStatusCard({ onFlightCount }: { onFlightCount?: (count: number) => void }) {
  const [flights, setFlights] = useState<FlightData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notReady, setNotReady] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchFlights = useCallback(async () => {
    try {
      if (flights.length === 0) setLoading(true);
      const res = await fetch('/api/flights/status', {
        headers: getAuthHeaders(),
      });
      if (res.status === 404) {
        setNotReady(true);
        setFlights([]);
        return;
      }
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      if (data.success) {
        const list = data.data || [];
        setFlights(list);
        setNotReady(false);
        onFlightCount?.(list.length);
      }
    } catch {
      if (flights.length === 0) {
        setNotReady(true);
        onFlightCount?.(0);
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flights.length]);

  useEffect(() => {
    fetchFlights();
    refreshTimer.current = setInterval(() => fetchFlights(), 30 * 60 * 1000); // 30 minutes (reduced to save API quota)
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayCount = flights.length;

  // ── Skeleton ──
  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-3.5 py-3 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-slate-700 animate-pulse" />
          <div>
            <div className="h-3.5 w-28 rounded-md bg-gray-200 dark:bg-slate-700 animate-pulse" />
            <div className="h-2 w-28 rounded-md bg-gray-200 dark:bg-slate-700 animate-pulse mt-1" />
          </div>
        </div>
        <div className="p-2.5 space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-[72px] rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">

      {/* ── Header ── */}
      <div className="px-3.5 py-3 flex items-center justify-between" style={{ paddingBottom: 0 }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 flex items-center justify-center flex-shrink-0">
            <Plane size={16} className="text-blue-600 dark:text-blue-400" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex flex-col justify-center">
            <span className="text-sm font-bold text-gray-800 dark:text-white leading-none">Status Penerbangan</span>
          </div>
        </div>

        {/* Live badge */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 flex-shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Live</span>
        </div>
      </div>

      {/* ── Flight Cards ── */}
      {notReady || flights.length === 0 ? (
        <div className="py-8 text-center">
          <div className="w-11 h-11 mx-auto rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-3">
            <Plane size={20} strokeWidth={1.5} className="text-gray-300 dark:text-slate-500" />
          </div>
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">Tidak ada penerbangan</p>
          <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">di sekitar hari ini</p>
        </div>
      ) : (
        <div className="p-2.5 space-y-2">
          {flights.map(flight => {
            const sc = STATUS_CFG[flight.status] || STATUS_CFG.scheduled;
            const isExpanded = expandedId === flight.id;
            const depTime = formatTime(flight.depActual || flight.depScheduled);
            const arrTime = formatTime(flight.arrEstimated || flight.arrScheduled);
            const tlClean = cleanTourLeader(flight.tourLeader);
            const tlFirst = tlClean.split(' ')[0];

            return (
              <div
                key={flight.id}
                className={`rounded-2xl border overflow-hidden transition-all duration-200 ${
                  isExpanded
                    ? 'border-gray-200 dark:border-slate-600'
                    : 'border-gray-100 dark:border-slate-700 shadow-sm'
                } bg-white dark:bg-slate-800`}
              >
                {/* ── Collapsed row ── */}
                <button
                  onClick={() => { if (!isExpanded) trackEvent('action', 'view_flight_status', { flight: flight.flightNumber }); setExpandedId(isExpanded ? null : flight.id); }}
                  className="w-full px-3 py-2.5 flex items-center gap-2.5 text-left active:bg-gray-50 dark:active:bg-slate-700/50 transition-colors"
                >
                  {/* Time column */}
                  <div className="flex flex-col items-center justify-center flex-shrink-0 w-10 pt-0.5">
                    <span className="text-[11px] font-bold text-gray-800 dark:text-white leading-tight">
                      {depTime}
                    </span>
                    <div className="w-px h-3 my-0.5" style={{ backgroundColor: sc.color }} />
                    <span className="text-[10px] font-medium text-gray-400 dark:text-slate-500 leading-tight">
                      {arrTime}
                    </span>
                  </div>

                  {/* Flight info */}
                  <div className="flex-1 min-w-0">
                    {/* Row 1: flight number + status badge + delay */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-bold text-gray-800 dark:text-white">{flight.flightNumber}</span>
                      <span className={`text-[8px] font-bold uppercase px-1.5 py-[2px] rounded-md text-white tracking-wide ${sc.bg}`}>
                        {sc.label}
                      </span>
                      {flight.delayed > 0 && (
                        <span className="text-[9px] font-bold text-red-500 dark:text-red-400">+{flight.delayed}m</span>
                      )}
                    </div>

                    {/* Row 2: route visualization */}
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400">{flight.depCode || '—'}</span>
                      <RouteLine flight={flight} />
                      <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400">{flight.arrCode || '—'}</span>
                    </div>

                    {/* Row 3: meta */}
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[9px] text-gray-400 dark:text-slate-500 flex items-center gap-0.5">
                        <Users size={8} />{flight.pax} pax
                      </span>
                      {flight.group && (
                        <span className="text-[9px] text-gray-400 dark:text-slate-500">Grup {flight.group}</span>
                      )}
                      {tlFirst && (
                        <>
                          <span className="text-[9px] text-gray-300 dark:text-slate-600">•</span>
                          <span className="text-[9px] text-gray-400 dark:text-slate-500 truncate max-w-[100px]">TL: {tlFirst}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right info — date + terminal/gate */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[9px] font-semibold text-gray-400 dark:text-slate-500">
                      {formatDate(flight.depDate || flight.depScheduled)}
                    </span>
                    {(flight.depTerminal || flight.depGate) && (
                      <div className="flex items-center gap-1">
                        {flight.depTerminal && (
                          <span className="text-[8px] font-bold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 px-1.5 py-0.5 rounded">
                            T{flight.depTerminal}
                          </span>
                        )}
                        {flight.depGate && (
                          <span className="text-[8px] font-bold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 px-1.5 py-0.5 rounded">
                            {flight.depGate}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Chevron */}
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="text-gray-300 dark:text-slate-600 flex-shrink-0 mt-1"
                  >
                    <ChevronDown size={13} />
                  </motion.div>
                </button>

                {/* ── Expanded detail ── */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      key="expanded"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
                        opacity: { duration: 0.2, delay: 0.05, ease: 'easeInOut' },
                      }}
                      style={{ overflow: 'hidden', willChange: 'height' }}
                    >
                      <div className="border-t border-gray-50 dark:border-slate-700/50">
                        <div className="px-3 pb-3 pt-2 space-y-2.5">

                          {/* Map */}
                          {(flight.status === 'en-route' || flight.status === 'landed') && (
                            <Suspense fallback={
                              <div className="w-full h-36 rounded-xl bg-slate-100 dark:bg-slate-700/50 border border-gray-100 dark:border-slate-600 animate-pulse" />
                            }>
                              <FlightMap flight={flight} />
                            </Suspense>
                          )}

                          {/* Time grid */}
                          <div className="grid grid-cols-2 gap-2">
                            {/* Departure */}
                            <div className={`px-2.5 py-2 rounded-xl border ${
                              flight.depActual || flight.status === 'en-route' || flight.status === 'landed'
                                ? 'bg-emerald-50/60 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/30'
                                : 'bg-gray-50 dark:bg-slate-900/40 border-gray-100 dark:border-slate-700/50'
                            }`}>
                              <div className="flex items-center gap-1 mb-0.5">
                                <PlaneTakeoff size={9} className="text-gray-400 dark:text-slate-500" />
                                <span className="text-[7px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">Keberangkatan</span>
                              </div>
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-[15px] font-bold text-gray-800 dark:text-white">
                                  {formatTime(flight.depActual || flight.depScheduled)}
                                </span>
                                {flight.depActual && flight.depActual !== flight.depScheduled && (
                                  <span className="text-[9px] text-gray-400 line-through">{formatTime(flight.depScheduled)}</span>
                                )}
                              </div>
                              {flight.depCity && (
                                <div className="text-[9px] text-gray-500 dark:text-slate-400 font-medium mt-0.5">
                                  {flight.depCity}{flight.depCode ? ` (${flight.depCode})` : ''}
                                </div>
                              )}
                              {(flight.depTerminal || flight.depGate) && (
                                <div className="flex gap-1 mt-1">
                                  {flight.depTerminal && (
                                    <span className="text-[7px] font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 px-1 py-0.5 rounded text-gray-500 dark:text-slate-400 inline-flex items-center gap-0.5">
                                      <MapPin size={7} />Terminal {flight.depTerminal}
                                    </span>
                                  )}
                                  {flight.depGate && (
                                    <span className="text-[7px] font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 px-1 py-0.5 rounded text-gray-500 dark:text-slate-400">
                                      G{flight.depGate}
                                    </span>
                                  )}
                                </div>
                              )}
                              {(flight.depDelayed ?? 0) > 0 && (
                                <div className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-50 dark:bg-red-900/15 border border-red-100 dark:border-red-800/30 rounded-md">
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500 dark:text-red-400">
                                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                                  </svg>
                                  <span className="text-[8px] font-bold text-red-600 dark:text-red-400">+{flight.depDelayed} menit</span>
                                </div>
                              )}
                            </div>

                            {/* Arrival */}
                            <div className={`px-2.5 py-2 rounded-xl border ${
                              flight.status === 'landed'
                                ? 'bg-emerald-50/60 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/30'
                                : 'bg-gray-50 dark:bg-slate-900/40 border-gray-100 dark:border-slate-700/50'
                            }`}>
                              <div className="flex items-center gap-1 mb-0.5">
                                <PlaneLanding size={9} className="text-gray-400 dark:text-slate-500" />
                                <span className="text-[7px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">Kedatangan</span>
                              </div>
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-[15px] font-bold text-gray-800 dark:text-white">
                                  {formatTime(flight.arrEstimated || flight.arrScheduled)}
                                </span>
                                {flight.arrEstimated && flight.arrEstimated !== flight.arrScheduled && (
                                  <span className="text-[9px] text-gray-400 line-through">{formatTime(flight.arrScheduled)}</span>
                                )}
                              </div>
                              {flight.arrCity && (
                                <div className="text-[9px] text-gray-500 dark:text-slate-400 font-medium mt-0.5">
                                  {flight.arrCity}{flight.arrCode ? ` (${flight.arrCode})` : ''}
                                </div>
                              )}
                              {(flight.arrTerminal || flight.arrGate) && (
                                <div className="flex gap-1 mt-1">
                                  {flight.arrTerminal && (
                                    <span className="text-[7px] font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 px-1 py-0.5 rounded text-gray-500 dark:text-slate-400 inline-flex items-center gap-0.5">
                                      <MapPin size={7} />T{flight.arrTerminal}
                                    </span>
                                  )}
                                  {flight.arrGate && (
                                    <span className="text-[7px] font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 px-1 py-0.5 rounded text-gray-500 dark:text-slate-400">
                                      G{flight.arrGate}
                                    </span>
                                  )}
                                </div>
                              )}
                              {(flight.arrDelayed ?? 0) > 0 && (
                                <div className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-50 dark:bg-red-900/15 border border-red-100 dark:border-red-800/30 rounded-md">
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500 dark:text-red-400">
                                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                                  </svg>
                                  <span className="text-[8px] font-bold text-red-600 dark:text-red-400">+{flight.arrDelayed} menit</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Progress bar (en-route only) */}
                          {flight.status === 'en-route' && (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[8px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">Progress</span>
                                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">{flight.progress}%</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-500 transition-all duration-500"
                                  style={{ width: `${flight.progress}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Info strip — pesawat, durasi, bagasi */}
                          {(flight.aircraftType || flight.duration || (flight.status === 'landed' && flight.arrBaggage)) && (
                            <div className="px-2.5 py-2 bg-gray-50 dark:bg-slate-900/40 rounded-xl border border-gray-100 dark:border-slate-700/50 flex items-center gap-3 text-[9px]">
                              {flight.aircraftType && (
                                <div className="flex items-center gap-1">
                                  <Plane size={10} className="text-gray-400 dark:text-slate-500" />
                                  <span className="font-semibold text-gray-600 dark:text-slate-300">{flight.aircraftType}</span>
                                </div>
                              )}
                              {flight.aircraftType && flight.duration && (
                                <div className="w-px h-3.5 bg-gray-200 dark:bg-slate-700" />
                              )}
                              {flight.duration && (
                                <div className="flex items-center gap-1">
                                  <Clock size={10} className="text-gray-400 dark:text-slate-500" />
                                  <span className="font-semibold text-gray-600 dark:text-slate-300">{formatDuration(flight.duration)}</span>
                                </div>
                              )}
                              {flight.status === 'landed' && flight.arrBaggage && (
                                <>
                                  <div className="w-px h-3.5 bg-gray-200 dark:bg-slate-700" />
                                  <div className="flex items-center gap-1">
                                    <BaggageClaim size={10} className="text-gray-400 dark:text-slate-500" />
                                    <span className="font-semibold text-gray-600 dark:text-slate-300">Carousel {flight.arrBaggage}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          )}

                          {/* Alt + Speed badges — en-route only, biru */}
                          {flight.status === 'en-route' && (flight.alt || flight.speed) && (
                            <div className="flex items-center gap-1.5">
                              {flight.alt && (
                                <div className="flex items-center gap-1 px-2 py-1.5 bg-blue-50 dark:bg-blue-900/15 rounded-lg border border-blue-100 dark:border-blue-800/30">
                                  <ArrowUp size={10} className="text-blue-500 dark:text-blue-400" />
                                  <span className="text-[9px] font-semibold text-blue-600 dark:text-blue-400">{(flight.alt / 1000).toFixed(1)} km</span>
                                </div>
                              )}
                              {flight.speed && (
                                <div className="flex items-center gap-1 px-2 py-1.5 bg-blue-50 dark:bg-blue-900/15 rounded-lg border border-blue-100 dark:border-blue-800/30">
                                  <Zap size={10} className="text-blue-500 dark:text-blue-400" />
                                  <span className="text-[9px] font-semibold text-blue-600 dark:text-blue-400">{flight.speed} km/j</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Group info bar */}
                          <div className="px-2.5 py-2 bg-gray-50 dark:bg-slate-900/40 rounded-xl border border-gray-100 dark:border-slate-700/50 flex items-center">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {/* PAX */}
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <div className="w-5 h-5 rounded-md bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                                  <Users size={10} className="text-blue-500" />
                                </div>
                                <span className="text-[10px] font-bold text-gray-700 dark:text-slate-200">{flight.pax} pax</span>
                              </div>

                              {/* Separator + TL */}
                              {tlClean && (
                                <>
                                  <div className="w-px h-3.5 bg-gray-200 dark:bg-slate-700 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <span className="text-[7px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 block leading-none">Tour Leader</span>
                                    <span className="text-[9px] font-semibold text-gray-600 dark:text-slate-300 truncate block">{tlClean}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

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
    </div>
  );
}
