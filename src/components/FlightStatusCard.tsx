import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plane, PlaneTakeoff, PlaneLanding, Users, MapPin, ChevronDown, Clock, BaggageClaim, ArrowUp, Zap, Calendar, Radio, Share2, Check, Lock } from 'lucide-react';
import { getAuthHeaders } from './LoginPage';
import { trackEvent } from '../utils/analytics';
import { normalizeWaNumber } from '../utils/phone';

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
  jamaah?: { nama: string; jk: string | null; wa: string | null }[];
  calendarDepTime?: string;  // calendar-derived dep time (if differs from airline schedule)
  calendarArrTime?: string;  // calendar-derived arr time (if differs from airline schedule)
}

// ── Status Config ──

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  'en-route':  { label: 'Terbang',      color: '#3b82f6', bg: 'bg-blue-500' },
  'scheduled': { label: 'Dijadwalkan',  color: '#d97706', bg: 'bg-amber-500' },
  'landed':    { label: 'Mendarat',     color: '#10b981', bg: 'bg-emerald-500' },
  'delayed':   { label: 'Delay',        color: '#ef4444', bg: 'bg-red-500' },
  'cancelled': { label: 'Dibatalkan',   color: '#dc2626', bg: 'bg-red-600' },
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
  // Strip all bullet/dot prefixes and normalize whitespace
  const stripped = tl.replace(/[•·]/g, '').replace(/\s+/g, ' ').trim();
  if (!stripped || stripped === '-') return '';
  // Convert to Title Case
  return stripped
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
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

// ── Grouping helper ──

function groupFlights(flights: FlightData[]): FlightData[][] {
  const map = new Map<string, FlightData[]>();
  for (const f of flights) {
    // Use depDate (airport-local ISO) or fall back to depScheduled for grouping key
    const dateKey = (f.depDate || f.depScheduled || '').slice(0, 10); // YYYY-MM-DD
    const key = `${f.flightNumber}__${dateKey}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }
  const grouped = Array.from(map.values());
  // Sort groups by departure date then time ascending
  grouped.sort((a, b) => {
    const dateA = `${(a[0].depDate || a[0].depScheduled || '').slice(0, 10)} ${formatTime(a[0].depActual || a[0].depScheduled)}`;
    const dateB = `${(b[0].depDate || b[0].depScheduled || '').slice(0, 10)} ${formatTime(b[0].depActual || b[0].depScheduled)}`;
    return dateA.localeCompare(dateB);
  });
  return grouped;
}

// ── Expanded detail panel for a single kloter ──

function KloterDetail({ flight, shareUrl, shareCopied, onShare, hasInternalAuth, onAuthRequired }: {
  flight: FlightData;
  shareUrl: string | null;
  shareCopied: boolean;
  onShare: () => void;
  hasInternalAuth: boolean;
  onAuthRequired: () => void;
}) {
  const tlClean = cleanTourLeader(flight.tourLeader);

  return (
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
          {flight.calendarDepTime && (
            <div className="flex items-center gap-0.5 mt-0.5">
              <Calendar size={7} className="text-amber-500" />
              <span className="text-[8px] text-amber-600 dark:text-amber-400">
                Jadwal internal: {formatTime(flight.calendarDepTime)}
              </span>
            </div>
          )}
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
          {flight.calendarArrTime && (
            <div className="flex items-center gap-0.5 mt-0.5">
              <Calendar size={7} className="text-amber-500" />
              <span className="text-[8px] text-amber-600 dark:text-amber-400">
                Jadwal internal: {formatTime(flight.calendarArrTime)}
              </span>
            </div>
          )}
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

      {/* Alt + Speed badges — en-route only */}
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

      {/* Share button — prominent, at bottom of detail */}
      <button
        onClick={hasInternalAuth ? onShare : onAuthRequired}
        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-bold transition-all active:scale-[0.97] ${
          shareCopied
            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40'
            : 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-200 dark:hover:border-emerald-800/40'
        }`}
      >
        {shareCopied ? (
          <><Check size={13} strokeWidth={2.5} />Berhasil copy link!</>
        ) : shareUrl ? (
          <><Share2 size={13} strokeWidth={2} />Share ke Jamaah</>
        ) : (
          <><Share2 size={13} strokeWidth={2} />Share ke Jamaah</>
        )}
      </button>

    </div>
  );
}


export default function FlightStatusCard({ onFlightCount }: { onFlightCount?: (count: number) => void }) {
  const [flights, setFlights] = useState<FlightData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFlight, setExpandedFlight] = useState<string | null>(null);
  const [copiedFlight, setCopiedFlight] = useState<string | null>(null);
  const [hasInternalAuth, setHasInternalAuth] = useState(false);
  const [showAuthAlert, setShowAuthAlert] = useState(false);
  const [authAlertClosing, setAuthAlertClosing] = useState(false);
  const [jamaahPopup, setJamaahPopup] = useState<string | null>(null);
  const [jamaahPopupClosing, setJamaahPopupClosing] = useState(false);

  // Pre-generated share URL cache: flightKey → url
  const shareCache = useRef<Record<string, string>>({});
  const [shareReady, setShareReady] = useState<Record<string, boolean>>({});

  // Pre-generate share link when a flight card is expanded
  const preGenerateShare = useCallback(async (flight: FlightData, group: FlightData[]) => {
    const flightKey = `${flight.flightNumber}_${(flight.depDate || flight.depScheduled || '').slice(0, 10)}`;
    if (shareCache.current[flightKey]) {
      setShareReady(prev => ({ ...prev, [flightKey]: true }));
      return; // Already cached
    }
    try {
      const firstKloter = group[0] || flight;
      // depDate is a UTC ISO string — parse to local Date to get correct YYYY-MM-DD
      const depDateRaw = flight.depDate || flight.depScheduled || '';
      const depParsed = new Date(depDateRaw);
      const depDateStr = !isNaN(depParsed.getTime())
        ? `${depParsed.getFullYear()}-${String(depParsed.getMonth() + 1).padStart(2, '0')}-${String(depParsed.getDate()).padStart(2, '0')}`
        : depDateRaw.slice(0, 10);
      const airlineCode = flight.airline ? flight.airline.split(' ')[0]?.slice(0, 2) : (flight.flightNumber?.split(' ')[0]?.slice(0, 2) || null);
      const durationStr = flight.duration ? formatDuration(flight.duration) : null;
      const res = await fetch('/api/flight-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          flight_number: flight.flightNumber,
          flight_date: depDateStr,
          dep_iata: flight.depCode,
          arr_iata: flight.arrCode,
          dep_city: flight.depCity || null,
          arr_city: flight.arrCity || null,
          dep_time: formatTime(flight.depActual || flight.depScheduled),
          arr_time: formatTime(flight.arrEstimated || flight.arrScheduled),
          duration: durationStr,
          group_number: firstKloter.group || null,
          pax: firstKloter.pax || null,
          tour_leader: firstKloter.tourLeader || null,
          airline_code: airlineCode,
          flight_status: flight.status || 'scheduled',
        }),
      });
      const data = await res.json();
      if (data.success) {
        shareCache.current[flightKey] = data.data.url;
        setShareReady(prev => ({ ...prev, [flightKey]: true }));
      }
    } catch (err) {
      console.error('[FlightShare] Pre-generate error:', err);
    }
  }, []);

  // Instant copy from cache
  const handleShareCopy = useCallback(async (flight: FlightData) => {
    const flightKey = `${flight.flightNumber}_${(flight.depDate || flight.depScheduled || '').slice(0, 10)}`;
    const url = shareCache.current[flightKey];
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedFlight(flightKey);
      setTimeout(() => setCopiedFlight(null), 2500);
      trackEvent('action', 'share_flight', { flight: flight.flightNumber });
    } catch (err) {
      console.error('Copy error:', err);
    }
  }, []);
  const [notReady, setNotReady] = useState(false);
  const [nextFlight, setNextFlight] = useState<{ pesawat: string; label: string } | null>(null);
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

  // Check internal system auth status (for share button gating)
  useEffect(() => {
    fetch('/api/laporan/status', { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) {
          setHasInternalAuth(!!(d.data.hasCredentials || d.data.lastSync));
        }
      })
      .catch(() => {});
  }, []);

  // ── Fetch next upcoming flight (for empty state tag) ──
  useEffect(() => {
    if (flights.length > 0) {
      setNextFlight(null);
      return;
    }

    const fetchNextFlight = async () => {
      try {
        const headers = getAuthHeaders();
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        const [res1, res2] = await Promise.all([
          fetch(`/api/calendar/events?month=${month}&year=${year}`, { headers }),
          fetch(`/api/calendar/events?month=${month === 12 ? 1 : month + 1}&year=${month === 12 ? year + 1 : year}`, { headers }),
        ]);

        const [data1, data2] = await Promise.all([
          res1.ok ? res1.json() : { data: [] },
          res2.ok ? res2.json() : { data: [] },
        ]);

        const allEvents = [...(data1.data || []), ...(data2.data || [])];
        const today = new Date().toISOString().split('T')[0];

        const upcoming = allEvents
          .filter(
            (e: { event_type: string; event_date: string }) =>
              e.event_type === 'keberangkatan' && e.event_date >= today
          )
          .sort((a: { event_date: string }, b: { event_date: string }) =>
            a.event_date.localeCompare(b.event_date)
          );

        if (upcoming.length > 0) {
          const next = upcoming[0] as { pesawat?: string; group_number?: string; event_date: string };
          const pesawat = next.pesawat
            ? next.pesawat.split(' - ').pop()?.trim() || next.pesawat
            : next.group_number || '';

          const d = new Date(next.event_date + 'T00:00:00');
          const label = d.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
          });

          setNextFlight({ pesawat, label });
        }
      } catch {
        // Silent fail — tag tidak tampil
      }
    };

    fetchNextFlight();
  }, [flights.length]);

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

  // ── Group flights by flightNumber + departureDate ──
  const grouped = groupFlights(flights);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">

      {/* ── Header ── */}
      <div className="px-3.5 py-3 flex items-center justify-between" style={flights.length > 0 && !notReady ? { paddingBottom: 0 } : undefined}>
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

      {/* ── Flight Cards (grouped) ── */}
      {notReady || flights.length === 0 ? (
        <div className="p-5 flex items-center gap-4">
          {/* Icon box */}
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gray-50 dark:bg-slate-800/80 border border-gray-100 dark:border-slate-700 flex items-center justify-center">
            <Radio size={20} strokeWidth={1.5} className="text-gray-300 dark:text-slate-600" />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">
              Belum ada penerbangan aktif
            </p>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5 leading-relaxed">
              Flight tracking dimulai otomatis H-1 sebelum keberangkatan group.
            </p>

            {nextFlight && (
              <div className="inline-flex items-center gap-1 mt-2 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-md px-2 py-0.5">
                <Calendar size={10} strokeWidth={2.5} />
                <span>Berikutnya: {nextFlight.pesawat} · {nextFlight.label}</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-2.5 space-y-2">
          {grouped.map((group) => {
            const first = group[0];
            const sc = STATUS_CFG[first.status] || STATUS_CFG.scheduled;
            const totalPax = group.reduce((sum, f) => sum + (f.pax ?? 0), 0);
            const depTime = formatTime(first.depActual || first.depScheduled);
            const arrTime = formatTime(first.arrEstimated || first.arrScheduled);
            const groupKey = `${first.flightNumber}-${(first.depDate || first.depScheduled || '').slice(0, 10)}`;
            const flightKey = `${first.flightNumber}_${(first.depDate || first.depScheduled || '').slice(0, 10)}`;
            const isExpanded = expandedFlight === groupKey;

            return (
              <div
                key={groupKey}
                className={`rounded-2xl border overflow-hidden transition-all duration-200 ${
                  isExpanded
                    ? 'border-gray-200 dark:border-slate-600'
                    : 'border-gray-100 dark:border-slate-700 shadow-sm'
                } bg-white dark:bg-slate-800`}
              >
                {/* ── Flight Header (clickable, with chevron) ── */}
                <button
                  onClick={() => {
                    const willExpand = !isExpanded;
                    if (willExpand) {
                      trackEvent('action', 'view_flight_status', { flight: first.flightNumber });
                      preGenerateShare(first, group);
                    }
                    setExpandedFlight(willExpand ? groupKey : null);
                  }}
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
                    {/* Row 1: flight number + status badge + total pax */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-bold text-gray-800 dark:text-white">{first.flightNumber}</span>
                      <span className={`text-[8px] font-bold uppercase px-1.5 py-[2px] rounded-md text-white tracking-wide ${sc.bg}`}>
                        {sc.label}
                      </span>
                      {first.delayed > 0 && (
                        <span className="text-[9px] font-bold text-red-500 dark:text-red-400">+{first.delayed}m</span>
                      )}
                    </div>

                    {/* Row 2: route visualization */}
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400">{first.depCode || '—'}</span>
                      <RouteLine flight={first} />
                      <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400">{first.arrCode || '—'}</span>
                    </div>
                  </div>

                  {/* Right info — date + chevron */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[9px] font-semibold text-gray-400 dark:text-slate-500">
                      {formatDate(first.depDate || first.depScheduled)}
                    </span>
                    {(first.depTerminal || first.depGate) && (
                      <div className="flex items-center gap-1">
                        {first.depTerminal && (
                          <span className="text-[8px] font-bold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 px-1.5 py-0.5 rounded">
                            T{first.depTerminal}
                          </span>
                        )}
                        {first.depGate && (
                          <span className="text-[8px] font-bold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 px-1.5 py-0.5 rounded">
                            {first.depGate}
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

                {/* ── Kloter sub-list (always visible, static) ── */}
                <div className="border-t border-gray-50 dark:border-slate-700/50 px-2.5 pb-2 pt-1.5 flex flex-col gap-1">
                  {group.map((kloter) => {
                    const tlClean = cleanTourLeader(kloter.tourLeader);

                    return (
                      <div
                        key={kloter.id}
                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-slate-900 rounded-lg"
                      >
                        {/* Grup badge */}
                        {kloter.group && (
                          <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-md px-2 py-0.5 flex-shrink-0">
                            {kloter.group}
                          </span>
                        )}

                        {/* Pax + Name */}
                        <span className="flex-1 text-[11px] text-gray-500 dark:text-slate-400 truncate">
                          <span className="font-semibold text-gray-600 dark:text-slate-300">{kloter.pax}</span> pax
                          {tlClean && <> · {tlClean}</>}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* ── Jamaah Saya (agent's pilgrims on this flight) ── */}
                {(() => {
                  const jamaahList = first.jamaah;
                  if (!jamaahList || jamaahList.length === 0) return null;

                  const JAMAAH_PREVIEW = 2;
                  const previewList = jamaahList.slice(0, JAMAAH_PREVIEW);
                  const hasMore = jamaahList.length > JAMAAH_PREVIEW;

                  return (
                    <div className="border-t border-gray-50 dark:border-slate-700/50 px-2.5 pb-2 pt-1.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Users size={10} className="text-amber-500 dark:text-amber-400" />
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                          Jamaah Saya
                        </span>
                        <span className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">
                          ({jamaahList.length})
                        </span>
                      </div>
                      <div className="relative">
                        <div className="flex flex-col">
                          {previewList.map((j, idx) => {
                            const initials = (j.nama || '')
                              .split(' ').filter(Boolean).slice(0, 2)
                              .map(w => w[0]).join('').toUpperCase();
                            const isFemale = j.jk === 'P';
                            const waNumber = normalizeWaNumber(j.wa);

                            return (
                              <div
                                key={idx}
                                className="flex items-center gap-2 px-1 py-[5px]"
                              >
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[7px] font-bold ring-[1.5px] ${
                                  isFemale
                                    ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 ring-pink-300'
                                    : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 ring-blue-300'
                                }`}>
                                  {initials}
                                </div>
                                <span className="flex-1 text-[11px] font-medium text-gray-600 dark:text-slate-300 truncate">
                                  {j.nama}
                                </span>
                                {waNumber && (
                                  <a
                                    href={`https://wa.me/${waNumber}?text=${encodeURIComponent('Assalamualaikum,\n')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors active:scale-95 flex-shrink-0"
                                  >
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.118.553 4.107 1.519 5.834L.037 23.786l6.121-1.46A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818c-1.9 0-3.715-.5-5.32-1.442l-.382-.227-3.96.945.993-3.856-.248-.395A9.77 9.77 0 012.182 12C2.182 6.583 6.583 2.182 12 2.182S21.818 6.583 21.818 12 17.417 21.818 12 21.818z"/></svg>
                                    <span className="text-[9px] font-bold">Chat</span>
                                  </a>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {/* Gradient fade overlay */}
                        {hasMore && (
                          <div
                            className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none"
                            style={{ background: 'linear-gradient(rgba(255,255,255,0) 0%, var(--jamaah-fade, white) 90%)' }}
                          />
                        )}
                      </div>
                      {hasMore && (
                        <button
                          onClick={() => setJamaahPopup(groupKey)}
                          className="w-full text-[10px] font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 pt-0.5 pb-0.5 text-center transition-colors active:scale-95"
                        >
                          +{jamaahList.length - JAMAAH_PREVIEW} lainnya
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/* ── Expanded flight detail ── */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      key="flight-detail"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
                        opacity: { duration: 0.2, delay: 0.05, ease: 'easeInOut' },
                      }}
                      style={{ overflow: 'hidden', willChange: 'height' }}
                    >
                      <div className="border-t border-gray-100 dark:border-slate-700/50">
                        <KloterDetail
                          flight={first}
                          shareUrl={shareCache.current[flightKey] || null}
                          shareCopied={copiedFlight === flightKey}
                          onShare={() => handleShareCopy(first)}
                          hasInternalAuth={hasInternalAuth}
                          onAuthRequired={() => setShowAuthAlert(true)}
                        />
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

      {/* ── Share copied toast ── */}
      {copiedFlight && (
        <div
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50
            bg-slate-800 dark:bg-slate-700 text-white text-xs font-semibold
            px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2"
          style={{ animation: 'shareToastIn 0.3s ease-out' }}
        >
          <Check size={14} strokeWidth={2.5} />
          Berhasil copy link
        </div>
      )}

      {/* ── Auth Required Alert ── */}
      {showAuthAlert && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center px-6`}
          onClick={() => {
            setAuthAlertClosing(true);
            setTimeout(() => { setShowAuthAlert(false); setAuthAlertClosing(false); }, 200);
          }}
          style={{
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            animation: authAlertClosing ? 'authFadeOut 0.2s ease forwards' : 'authFadeIn 0.2s ease',
          }}
        >
          <div
            className="w-full max-w-xs bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
            style={{ animation: authAlertClosing ? 'authCardOut 0.2s ease forwards' : 'authCardIn 0.25s cubic-bezier(0.16,1,0.3,1)' }}
          >
            <div className="px-5 pt-5 pb-3 text-center">
              <div className="w-11 h-11 mx-auto mb-3 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 flex items-center justify-center">
                <Lock size={18} className="text-amber-500" />
              </div>
              <p className="text-sm font-bold text-gray-800 dark:text-white">Login Sistem Internal</p>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                Login sistem internal untuk menggunakan fitur Flight Share.
              </p>
            </div>
            <div className="flex border-t border-gray-100 dark:border-slate-700">
              <button
                onClick={() => {
                  setAuthAlertClosing(true);
                  setTimeout(() => { setShowAuthAlert(false); setAuthAlertClosing(false); }, 200);
                }}
                className="flex-1 py-3 text-sm font-semibold text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                Batal
              </button>
              <div className="w-px bg-gray-100 dark:bg-slate-700" />
              <button
                onClick={() => {
                  setAuthAlertClosing(true);
                  setTimeout(() => {
                    setShowAuthAlert(false);
                    setAuthAlertClosing(false);
                    window.history.pushState({ tab: 'jamaah' }, '', '/dashboard/jamaah');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  }, 200);
                }}
                className="flex-1 py-3 text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
              >
                Login Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Jamaah Popup ── */}
      {jamaahPopup && (() => {
        const popupGroup = grouped.find(g => {
          const f = g[0];
          return `${f.flightNumber}-${(f.depDate || f.depScheduled || '').slice(0, 10)}` === jamaahPopup;
        });
        const popupFlight = popupGroup?.[0];
        const jamaahList = popupFlight?.jamaah || [];
        if (jamaahList.length === 0) return null;

        const closePopup = () => {
          setJamaahPopupClosing(true);
          setTimeout(() => { setJamaahPopup(null); setJamaahPopupClosing(false); }, 200);
        };

        return (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center"
            onClick={closePopup}
            style={{
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              animation: jamaahPopupClosing ? 'authFadeOut 0.2s ease forwards' : 'authFadeIn 0.2s ease',
            }}
          >
            <div
              className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-t-2xl border-t border-x border-gray-100 dark:border-slate-700 shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
              style={{ animation: jamaahPopupClosing ? 'jamaahSheetOut 0.2s ease forwards' : 'jamaahSheetIn 0.3s cubic-bezier(0.16,1,0.3,1)', maxHeight: '70vh' }}
            >
              {/* Handle bar */}
              <div className="flex justify-center pt-2.5 pb-1">
                <div className="w-8 h-1 rounded-full bg-gray-200 dark:bg-slate-600" />
              </div>

              {/* Header */}
              <div className="px-4 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 flex items-center justify-center">
                    <Users size={15} className="text-amber-500 dark:text-amber-400" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-gray-800 dark:text-white">Jamaah Saya</span>
                    <span className="text-[10px] text-gray-400 dark:text-slate-500 ml-1.5 font-semibold">{jamaahList.length} orang</span>
                  </div>
                </div>
                <button
                  onClick={closePopup}
                  className="w-8 h-8 rounded-xl bg-gray-100/80 dark:bg-slate-700 flex items-center justify-center text-gray-400 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors active:scale-95"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              {/* List */}
              <div className="px-4 pb-5 overflow-y-auto" style={{ maxHeight: 'calc(70vh - 100px)' }}>
                <div className="flex flex-col">
                  {jamaahList.map((j, idx) => {
                    const initials = (j.nama || '')
                      .split(' ').filter(Boolean).slice(0, 2)
                      .map(w => w[0]).join('').toUpperCase();
                    const isFemale = j.jk === 'P';
                    const waNumber = normalizeWaNumber(j.wa);
                    const waText = encodeURIComponent(`Assalamualaikum,\n`);

                    return (
                      <div
                        key={idx}
                        className={`flex items-center gap-2.5 px-1 py-2.5 ${idx !== jamaahList.length - 1 ? 'border-b border-gray-50 dark:border-slate-700/50' : ''}`}
                      >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[8px] font-bold ring-[1.5px] ${
                          isFemale
                            ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 ring-pink-300'
                            : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 ring-blue-300'
                        }`}>
                          {initials}
                        </div>
                        <span className="flex-1 text-[12px] font-medium text-gray-700 dark:text-slate-300 truncate">
                          {j.nama}
                        </span>
                        {waNumber && (
                          <a
                            href={`https://wa.me/${waNumber}?text=${waText}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors active:scale-95 flex-shrink-0"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.118.553 4.107 1.519 5.834L.037 23.786l6.121-1.46A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818c-1.9 0-3.715-.5-5.32-1.442l-.382-.227-3.96.945.993-3.856-.248-.395A9.77 9.77 0 012.182 12C2.182 6.583 6.583 2.182 12 2.182S21.818 6.583 21.818 12 17.417 21.818 12 21.818z"/></svg>
                            <span className="text-[9px] font-bold">Chat</span>
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`
        @keyframes shareToastIn {
          from { opacity: 0; transform: translate(-50%, 10px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes authFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes authFadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes authCardIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        @keyframes authCardOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.9); } }
        @keyframes jamaahSheetIn { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes jamaahSheetOut { from { transform: translateY(0); } to { transform: translateY(100%); } }
        :root { --jamaah-fade: #ffffff; }
        .dark { --jamaah-fade: #1e293b; }
      `}</style>
    </div>
  );
}
