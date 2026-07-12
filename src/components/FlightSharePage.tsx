import { useState, useEffect, useMemo } from 'react';
import {
  Plane, Check, MapPin, ArrowRight, ArrowLeft,
  Sun, Cloud, CloudRain, CloudSun, CloudLightning, CloudSnow,
  Share2,
} from 'lucide-react';
import { MapContainer, TileLayer, Polyline, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import logoWhite from '@/logo-alhijaz-white.png';
import FlightRouteLine from './FlightRouteLine';
import { getFlightStatusPresentation, normalizeFlightStatus } from '../lib/flightStatusPresentation';

// ── Types ──

interface FlightSharePageProps {
  code: string;
}

interface FlightData {
  flight_number: string;
  flight_date: string;
  dep_iata: string;
  arr_iata: string;
  dep_city: string | null;
  arr_city: string | null;
  dep_time: string | null;
  arr_time: string | null;
  duration: string | null;
  group_number: string | null;
  pax: number | null;
  tour_leader: string | null;
  airline_code: string | null;
  flight_status: string;
  progress?: number;
  created_at: string | null;
}

interface ShareData {
  flight: FlightData;
  agent: {
    name: string;
    phone: string;
    email: string;
    photo: string;
    website: string;
    slug: string;
  } | null;
}

interface WeatherData {
  temp: number;
  desc: string;
  high: number;
  low: number;
  humidity: number | null;
  weatherCode: number;
}

// ── Airport Coordinates ──

const AIRPORT_COORDS: Record<string, [number, number]> = {
  CGK: [-6.1256, 106.6558],
  SUB: [-7.3798, 112.7868],
  SOC: [-7.5161, 110.7568],
  UPG: [-5.0614, 119.5540],
  KNO: [3.6422, 98.8853],
  BPN: [-1.2683, 116.8945],
  JED: [21.6796, 39.1565],
  MED: [24.5534, 39.7051],
  DXB: [25.2532, 55.3657],
  DOH: [25.2609, 51.6138],
  KUL: [2.7456, 101.7099],
  SIN: [1.3644, 103.9915],
  IST: [41.2753, 28.7519],
  AUH: [24.4330, 54.6511],
};

const CITY_COORDS: Record<string, { lat: number; lon: number; name: string }> = {
  CGK: { lat: -6.125, lon: 106.655, name: 'Jakarta' },
  SUB: { lat: -7.250, lon: 112.750, name: 'Surabaya' },
  JED: { lat: 21.485, lon: 39.193, name: 'Jeddah' },
  MED: { lat: 24.553, lon: 39.705, name: 'Madinah' },
  DXB: { lat: 25.253, lon: 55.365, name: 'Dubai' },
  IST: { lat: 41.275, lon: 28.751, name: 'Istanbul' },
  KUL: { lat: 3.139, lon: 101.687, name: 'Kuala Lumpur' },
  SIN: { lat: 1.352, lon: 103.820, name: 'Singapore' },
  DOH: { lat: 25.286, lon: 51.534, name: 'Doha' },
};

// ── Airline names ──

const AIRLINE_NAMES: Record<string, string> = {
  GA: 'Garuda Indonesia',
  SV: 'Saudia',
  EK: 'Emirates',
  QR: 'Qatar Airways',
  TK: 'Turkish Airlines',
  SQ: 'Singapore Airlines',
  MH: 'Malaysia Airlines',
  OD: 'Batik Air',
  JT: 'Lion Air',
  QG: 'Citilink',
  ID: 'Super Air Jet',
  IW: 'Wings Air',
  IN: 'NAM Air',
  KD: 'Kal Star Aviation',
};

// ── Helpers ──

const FLIGHT_SHARE_REFRESH_MS = 30 * 60 * 1000;

function generateArc(start: [number, number], end: [number, number], points = 50): [number, number][] {
  const arc: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    const lat = start[0] + (end[0] - start[0]) * t;
    const lng = start[1] + (end[1] - start[1]) * t;
    const arcOffset = Math.sin(t * Math.PI) * 3;
    arc.push([lat + arcOffset, lng]);
  }
  return arc;
}

function airportIcon(code: string, isArrival: boolean) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:${isArrival ? '#3b82f6' : '#10b981'};
      border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.25);
      display:flex;align-items:center;justify-content:center;
    "><span style="color:white;font-size:9px;font-weight:800;">${code}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function planeIcon(bearing?: number | null) {
  // Icon pesawat (path lucide Plane) menghadap NE (45°) — offset agar `bearing` = arah kompas
  const deg = (bearing ?? 90) - 45;
  return L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;transform:rotate(${deg}deg);filter:drop-shadow(0 1px 3px rgba(0,0,0,0.4));">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="#facc15" stroke="black" stroke-width="1" stroke-linejoin="round" style="animation:planePulse 2s ease-in-out infinite;transform-origin:center;">
        <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
      </svg>
    </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function bearingDeg(a: [number, number], b: [number, number]): number {
  const dLat = b[0] - a[0];
  const dLng = (b[1] - a[1]) * Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180);
  return (Math.atan2(dLng, dLat) * 180) / Math.PI;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return dateStr; }
}

function formatTime(val?: string | null): string {
  if (!val) return '—';
  if (/^\d{2}:\d{2}$/.test(val)) return val;
  if (/^\d{2}\.\d{2}$/.test(val)) return val.replace('.', ':');
  return val;
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function cleanTourLeader(tl?: string | null): string {
  if (!tl) return '';
  const stripped = tl.replace(/[•·]/g, '').replace(/\s+/g, ' ').trim();
  if (!stripped || stripped === '-') return '';
  return stripped.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith('62') ? '0' + digits.slice(2) : digits;
  if (local.startsWith('0') && local.length >= 10) {
    return `${local.slice(0, 4)}-${local.slice(4, 8)}-${local.slice(8)}`;
  }
  return phone;
}

function displayFlightNum(fn: string): string {
  return fn.replace(/^([A-Z]{2})(\d+)$/, '$1 $2');
}

function flightPageTitle(groupNumber: string | null, flightNumber: string, agentName: string): string {
  const kloterValue = String(groupNumber || '').trim();
  const kloterName = kloterValue
    ? (/^kloter\b/i.test(kloterValue) ? kloterValue : `Kloter ${kloterValue}`)
    : 'Kloter';
  return `Lacak Penerbangan ${kloterName} | ${flightNumber} | ${agentName}`;
}

function getWeatherDesc(code: number): string {
  if (code <= 1) return 'Cerah';
  if (code <= 3) return 'Cerah berawan';
  if (code <= 48) return 'Berawan';
  if (code <= 67) return 'Hujan Ringan';
  if (code <= 77) return 'Hujan Salju';
  if (code <= 82) return 'Hujan';
  if (code <= 86) return 'Hujan Salju Lebat';
  return 'Hujan Badai';
}

function WeatherIcon({ code, size = 20 }: { code: number; size?: number }) {
  const cls = 'text-gray-600';
  if (code <= 1) return <Sun size={size} className="text-amber-500" />;
  if (code <= 3) return <CloudSun size={size} className="text-amber-400" />;
  if (code <= 48) return <Cloud size={size} className={cls} />;
  if (code <= 77) return <CloudSnow size={size} className="text-blue-400" />;
  if (code <= 82) return <CloudRain size={size} className="text-blue-500" />;
  return <CloudLightning size={size} className="text-purple-500" />;
}

async function loadDestinationWeather(iata: string): Promise<WeatherData | null> {
  const city = CITY_COORDS[iata];
  if (!city) return null;

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,weather_code,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`
    );
    const data = await res.json();
    if (!data.current) return null;

    return {
      temp: Math.round(data.current.temperature_2m),
      desc: getWeatherDesc(data.current.weather_code),
      weatherCode: data.current.weather_code,
      high: Math.round(data.daily.temperature_2m_max[0]),
      low: Math.round(data.daily.temperature_2m_min[0]),
      humidity: data.current.relative_humidity_2m
        ? Math.round(data.current.relative_humidity_2m)
        : null,
    };
  } catch {
    return null;
  }
}

// ── Component ──

export default function FlightSharePage({ code }: FlightSharePageProps) {
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let disposed = false;
    let initialRequestComplete = false;

    const loadFlight = async () => {
      const isInitialRequest = !initialRequestComplete;
      try {
        const response = await fetch(`/api/flight-share/${code}`, { cache: 'no-store' });
        const result = await response.json();
        if (disposed) return;

        if (result.success) {
          setData(result.data);
          setNotFound(false);

          if (isInitialRequest) {
            void loadDestinationWeather(result.data.flight.arr_iata).then(nextWeather => {
              if (!disposed && nextWeather) setWeather(nextWeather);
            });
          }
        } else if (isInitialRequest) {
          setNotFound(true);
        }
      } catch {
        if (!disposed && isInitialRequest) setNotFound(true);
      } finally {
        if (isInitialRequest) {
          initialRequestComplete = true;
          if (!disposed) setLoading(false);
        }
      }
    };

    void loadFlight();
    const refreshTimer = window.setInterval(() => {
      void loadFlight();
    }, FLIGHT_SHARE_REFRESH_MS);

    return () => {
      disposed = true;
      window.clearInterval(refreshTimer);
    };
  }, [code]);

  // ── Map data ──
  const depCoord = data ? AIRPORT_COORDS[data.flight.dep_iata] : null;
  const arrCoord = data ? AIRPORT_COORDS[data.flight.arr_iata] : null;

  const arcPath = useMemo(() => {
    if (!depCoord || !arrCoord) return null;
    return generateArc(depCoord, arrCoord);
  }, [depCoord, arrCoord]);

  const mapBounds = useMemo(() => {
    const pts: [number, number][] = [];
    if (depCoord) pts.push(depCoord);
    if (arrCoord) pts.push(arrCoord);
    if (pts.length < 2) return null;
    return L.latLngBounds(pts);
  }, [depCoord, arrCoord]);

  // Pesawat di titik progress sepanjang arc, menghadap searah rute (en-route saja)
  const flightProgress = data?.flight.progress ?? 0;
  const currentFlightStatus = normalizeFlightStatus(data?.flight.flight_status);
  const isEnRoute = currentFlightStatus === 'en-route';
  const { planePos, planeBearing } = useMemo((): { planePos: [number, number] | null; planeBearing: number | null } => {
    if (!isEnRoute || !arcPath) return { planePos: null, planeBearing: null };
    const idx = Math.min(arcPath.length - 1, Math.max(0, Math.round((flightProgress / 100) * (arcPath.length - 1))));
    const prev = arcPath[Math.max(0, idx - 1)];
    const next = arcPath[Math.min(arcPath.length - 1, idx + 1)];
    return { planePos: arcPath[idx], planeBearing: bearingDeg(prev, next) };
  }, [isEnRoute, arcPath, flightProgress]);

  // Bagian rute yang sudah ditempuh (solid, sisanya tetap dashed)
  const traveledArc = useMemo(() => {
    if (!planePos || !arcPath) return null;
    const idx = Math.round((flightProgress / 100) * (arcPath.length - 1));
    return arcPath.slice(0, Math.max(1, idx) + 1);
  }, [planePos, arcPath, flightProgress]);

  // Set document title — matches server-side OG injection format
  useEffect(() => {
    if (!data) return;
    const dfn = displayFlightNum(data.flight.flight_number);
    const agentName = data.agent?.name || 'Agent';
    document.title = flightPageTitle(data.flight.group_number, dfn, agentName);
    return () => { document.title = 'Jadwal Umroh - Alhijaz Indowisata'; };
  }, [data]);

  // Native share handler
  const handleNativeShare = async () => {
    if (!data) return;
    const dfn = displayFlightNum(data.flight.flight_number);
    const url = window.location.href;
    const title = flightPageTitle(data.flight.group_number, dfn, data.agent?.name || 'Agent');
    const text = `Cek status penerbangan ${dfn} (${data.flight.dep_iata} → ${data.flight.arr_iata}) di sini:`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ── Loading Skeleton ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
        {/* Header skeleton */}
        <div className="max-w-lg mx-auto w-full" style={{ background: 'linear-gradient(135deg, #450a0a, #7f1d1d, #991b1b)' }}>
          <div className="px-5 pt-4 pb-4 flex items-center justify-between">
            <div className="h-7 w-28 rounded bg-white/15 animate-pulse" />
            <div className="h-4 w-32 rounded bg-white/10 animate-pulse" />
          </div>
          <div className="px-5 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-5 w-16 rounded bg-white/15 animate-pulse" />
              <div className="h-4 w-20 rounded bg-white/10 animate-pulse" />
            </div>
            <div className="h-7 w-16 rounded-full bg-white/10 animate-pulse" />
          </div>
        </div>

        {/* Hero card skeleton */}
        <div className="max-w-lg mx-auto px-4 mt-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="h-3 w-24 rounded bg-gray-200 animate-pulse" />
                <div className="h-4 w-36 rounded bg-gray-200 animate-pulse mt-2" />
              </div>
              <div className="h-6 w-20 rounded-lg bg-gray-200 animate-pulse" />
            </div>
            <div className="flex items-center mb-3">
              <div className="h-10 w-14 rounded bg-gray-200 animate-pulse" />
              <div className="flex-1 flex items-center px-3">
                <div className="flex-1 h-[3px] bg-gray-200 rounded-full animate-pulse" />
                <div className="w-7 h-7 rounded-full bg-gray-200 mx-1 animate-pulse" />
                <div className="flex-1 h-[3px] bg-gray-200 rounded-full animate-pulse" />
              </div>
              <div className="h-10 w-14 rounded bg-gray-200 animate-pulse" />
            </div>
            <div className="flex items-center justify-between">
              <div className="h-3 w-16 rounded bg-gray-200 animate-pulse" />
              <div className="h-5 w-16 rounded-md bg-gray-200 animate-pulse" />
              <div className="h-3 w-16 rounded bg-gray-200 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Map skeleton */}
        <div className="mt-4">
          <div className="h-52 bg-gray-200 animate-pulse" />
        </div>

        {/* Boarding pass skeleton */}
        <div className="max-w-lg mx-auto px-4 mt-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-stretch p-4">
              <div className="flex-1 pr-4 border-r border-dashed border-gray-100">
                <div className="h-3 w-16 rounded bg-gray-200 animate-pulse mb-2" />
                <div className="h-8 w-20 rounded bg-gray-200 animate-pulse" />
                <div className="h-3 w-14 rounded bg-gray-200 animate-pulse mt-2" />
                <div className="h-5 w-10 rounded bg-gray-200 animate-pulse mt-1" />
              </div>
              <div className="flex flex-col items-center justify-center px-3 gap-1">
                <div className="w-6 h-6 rounded-full bg-gray-200 animate-pulse" />
                <div className="h-3 w-12 rounded bg-gray-200 animate-pulse" />
                <div className="h-2 w-10 rounded bg-gray-200 animate-pulse" />
              </div>
              <div className="flex-1 pl-4 border-l border-dashed border-gray-100 flex flex-col items-end">
                <div className="h-3 w-10 rounded bg-gray-200 animate-pulse mb-2" />
                <div className="h-8 w-20 rounded bg-gray-200 animate-pulse" />
                <div className="h-3 w-14 rounded bg-gray-200 animate-pulse mt-2" />
                <div className="h-5 w-10 rounded bg-gray-200 animate-pulse mt-1" />
              </div>
            </div>
            <div className="bg-gray-50 border-t border-dashed border-gray-100 px-4 py-2.5 flex items-center justify-between">
              <div className="h-3 w-32 rounded bg-gray-200 animate-pulse" />
              <div className="h-3 w-24 rounded bg-gray-200 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Weather skeleton */}
        <div className="max-w-lg mx-auto px-4 mt-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
            <div>
              <div className="h-2 w-32 rounded bg-gray-200 animate-pulse mb-2" />
              <div className="h-8 w-20 rounded bg-gray-200 animate-pulse" />
              <div className="flex items-center gap-2 mt-2">
                <div className="h-3 w-10 rounded bg-gray-200 animate-pulse" />
                <div className="h-3 w-10 rounded bg-gray-200 animate-pulse" />
              </div>
            </div>
            <div className="w-[52px] h-[52px] rounded-2xl bg-gray-200 animate-pulse" />
          </div>
        </div>

        {/* Agent card skeleton */}
        <div className="max-w-lg mx-auto px-4 mt-3">
          <div className="rounded-2xl bg-gray-200 animate-pulse h-48" />
        </div>

        {/* Footer skeleton */}
        <div className="mt-6 pb-8 flex flex-col items-center gap-2">
          <div className="h-4 w-40 rounded bg-gray-200 animate-pulse" />
          <div className="h-3 w-48 rounded bg-gray-200 animate-pulse" />
        </div>
      </div>
    );
  }

  // ── 404 ──
  if (notFound || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Plane size={24} className="text-gray-400" />
          </div>
          <h1 className="text-lg font-bold text-gray-800 mb-1">Link tidak ditemukan</h1>
          <p className="text-sm text-gray-500">Link penerbangan ini tidak valid atau sudah kadaluarsa.</p>
        </div>
      </div>
    );
  }

  const { flight, agent } = data;
  const tlClean = cleanTourLeader(flight.tour_leader);
  const arrCityName = flight.arr_city || CITY_COORDS[flight.arr_iata]?.name || flight.arr_iata;
  const status = getFlightStatusPresentation(currentFlightStatus);
  const airlineName = AIRLINE_NAMES[flight.airline_code || ''] || null;
  const dfn = displayFlightNum(flight.flight_number);


  // WhatsApp handler
  const handleWhatsApp = () => {
    if (!agent) return;
    const phone = agent.phone.startsWith('0')
      ? '62' + agent.phone.slice(1)
      : agent.phone.startsWith('62')
        ? agent.phone
        : '62' + agent.phone;
    const cleanPhone = phone.replace(/\D/g, '');
    const flightDate = new Date(flight.flight_date).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    const message = encodeURIComponent(
      `Assalamualaikum kak ${agent.name.split(' ')[0]}, saya mau tanya tentang penerbangan ${dfn} tanggal ${flightDate} (${flight.dep_city || flight.dep_iata} → ${flight.arr_city || flight.arr_iata})`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">

      {/* ── 1. Top Bar — Two Layers ── */}
      <div className="max-w-lg mx-auto w-full relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #450a0a, #7f1d1d, #991b1b)' }}>
        {/* Decorative motif overlay */}
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0L60 30L30 60L0 30Z' fill='none' stroke='white' stroke-width='1'/%3E%3Ccircle cx='30' cy='30' r='8' fill='none' stroke='white' stroke-width='0.8'/%3E%3C/svg%3E")`,
          backgroundSize: '40px 40px',
        }} />
        {/* Radial glow accent */}
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #ef4444, transparent 70%)' }} />
        {/* Layer 1: Brand */}
        <div className="px-5 pt-4 pb-4 flex items-center justify-between relative z-10">
          <img src={logoWhite} alt="Alhijaz" className="h-7 w-auto" />
          <span className="text-white text-sm font-semibold tracking-wide inline-block mt-[-5px]">Status Penerbangan</span>
        </div>

        {/* Layer 2: Flight preview + controls */}
        <div className="px-5 pb-2 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-1.5">
            <span className="text-white text-lg font-extrabold">{dfn}</span>
            <span className="text-white/30 text-sm mx-0.5">/</span>
            <span className="text-white/50 text-sm font-semibold">
              {flight.dep_iata} → {flight.arr_iata}
            </span>
          </div>
          <button
            onClick={handleNativeShare}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition-transform"
          >
            <Share2 size={14} strokeWidth={2.5} className="text-white/70" />
          </button>
        </div>
      </div>

      {/* ── 2. Flight Hero Card — Compact ── */}
      <div className="max-w-lg mx-auto px-4">
        <div className="mt-4 pb-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          {/* Airline + date (left) + status badge (right) */}
          <div className="flex items-start justify-between mb-3">
            <div>
              {airlineName && (
                <div className="text-xs text-gray-400 font-medium">{airlineName}</div>
              )}
              <div className="text-sm text-gray-500 mt-1">
                {formatDate(flight.flight_date)}
              </div>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wide flex-shrink-0 ${status.badge}`}>
              {currentFlightStatus === 'en-route' && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              )}
              {status.label}
            </span>
          </div>

          {/* Route status — shared with the Dashboard card */}
          <div className="flex items-center mb-1">
            <div className="text-4xl font-extrabold text-gray-800 tracking-tight leading-none flex-shrink-0">
              {flight.dep_iata}
            </div>
            <div className="flex-1 min-w-0 px-2">
              <FlightRouteLine
                flight={{ status: currentFlightStatus, progress: flight.progress }}
                className="w-full h-auto"
              />
            </div>
            <div className="text-4xl font-extrabold text-gray-800 tracking-tight leading-none text-right flex-shrink-0">
              {flight.arr_iata}
            </div>
          </div>

          {/* City names + duration pill */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-gray-400">{flight.dep_city || flight.dep_iata}</span>
            {flight.duration && (
              <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-md">
                {flight.duration}
              </span>
            )}
            <span className="text-xs text-gray-400 text-right">{flight.arr_city || flight.arr_iata}</span>
          </div>

          {/* Group info — pax (20%) & tour leader (80%) */}
          {(flight.pax || tlClean) && (
            <div className="flex items-center pt-3 border-t border-gray-50 text-xs text-gray-500">
              {flight.pax && (
                <span className="w-1/5 flex-shrink-0">{flight.pax} pax</span>
              )}
              {tlClean && (
                <span className="flex-1 truncate text-right">TL: {tlClean}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 3. Peta — full-width, no section label ── */}
      {mapBounds && arcPath && (
        <div className="mt-4">
          <div className="h-52 overflow-hidden">
            <MapContainer
              bounds={mapBounds}
              boundsOptions={{ padding: [30, 30] }}
              zoomControl={false}
              attributionControl={false}
              dragging={false}
              scrollWheelZoom={false}
              doubleClickZoom={false}
              touchZoom={false}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
              {/* Style garis = FlightMap dashboard: dashed abu sisa rute,
                  solid biru tertempuh, solid hijau penuh saat landed */}
              {currentFlightStatus === 'landed' ? (
                <Polyline positions={arcPath} pathOptions={{ color: '#10b981', weight: 3 }} />
              ) : (
                <Polyline positions={arcPath} pathOptions={{ color: '#cbd5e1', weight: 2, dashArray: '8 6' }} />
              )}
              {traveledArc && traveledArc.length > 1 && (
                <Polyline positions={traveledArc} pathOptions={{ color: '#3b82f6', weight: 3 }} />
              )}
              {depCoord && (
                <Marker position={depCoord} icon={airportIcon(flight.dep_iata, false)} />
              )}
              {arrCoord && (
                <Marker position={arrCoord} icon={airportIcon(flight.arr_iata, true)} />
              )}
              {planePos && (
                <Marker position={planePos} icon={planeIcon(planeBearing)} />
              )}
            </MapContainer>
          </div>
        </div>
      )}

      {/* ===== Jadwal Penerbangan — Boarding Pass ===== */}
      <div className="max-w-lg mx-auto px-4 mt-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Main row — 3 columns */}
        <div className="flex items-stretch p-4">

          {/* Departure column — align left */}
          <div className="flex-1 pr-4 border-r border-dashed border-gray-200">
            <div className="flex items-center gap-1 mb-1.5">
              <ArrowRight size={10} strokeWidth={2.5} className="text-emerald-500" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-500">
                Berangkat
              </span>
            </div>
            <div className="text-3xl font-extrabold text-gray-900 tracking-tight leading-none">
              {formatTime(flight.dep_time)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1.5 font-medium">
              {flight.dep_city || flight.dep_iata}
            </div>
            <div className="text-xl font-extrabold text-gray-900 mt-0.5 tracking-tight">
              {flight.dep_iata}
            </div>
          </div>

          {/* Center — duration + plane */}
          <div className="flex flex-col items-center justify-center px-3 gap-1">
            <Plane size={16} className="text-gray-400" fill="currentColor" />
            {flight.duration && (
              <span className="text-[11px] font-bold text-gray-500">{flight.duration}</span>
            )}
            <span className="text-[9px] text-gray-400">Nonstop</span>
          </div>

          {/* Arrival column — align right */}
          <div className="flex-1 pl-4 border-l border-dashed border-gray-200 text-right">
            <div className="flex items-center justify-end gap-1 mb-1.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-blue-500">
                Tiba
              </span>
              <ArrowLeft size={10} strokeWidth={2.5} className="text-blue-500" />
            </div>
            <div className="text-3xl font-extrabold text-gray-900 tracking-tight leading-none">
              {formatTime(flight.arr_time)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1.5 font-medium">
              {flight.arr_city || flight.arr_iata}
            </div>
            <div className="text-xl font-extrabold text-gray-900 mt-0.5 tracking-tight">
              {flight.arr_iata}
            </div>
          </div>
        </div>

        {/* Bottom strip — date + airline */}
        <div className="bg-gray-50 border-t border-dashed border-gray-200 px-4 py-2.5 flex items-center justify-between">
          <span className="text-[10px] text-gray-400 font-medium">
            {formatDate(flight.flight_date)}
          </span>
          <span className="text-[10px] text-gray-400 font-medium">
            {airlineName || dfn}
          </span>
        </div>
      </div>
      </div>

      {/* ===== Cuaca di Destinasi — Banner Kontekstual ===== */}
      {weather && (
        <div className="max-w-lg mx-auto px-4 mt-3">
        <div
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, #fff 60%, #fefce8 100%)' }}
        >
          <div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">
              Cuaca di {arrCityName} saat tiba
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-3xl font-extrabold text-gray-900 tracking-tight">
                {weather.temp}°
              </span>
              <span className="text-sm text-gray-500">{weather.desc}</span>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[11px] font-semibold text-orange-500">
                H: {weather.high}°
              </span>
              <span className="text-gray-300">|</span>
              <span className="text-[11px] font-semibold text-blue-500">
                L: {weather.low}°
              </span>
              {weather.humidity != null && (
                <>
                  <span className="text-gray-300">|</span>
                  <span className="text-[11px] text-gray-400">
                    Kelembapan {weather.humidity}%
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="w-[52px] h-[52px] rounded-2xl bg-amber-100/60 border border-amber-200/50 flex items-center justify-center flex-shrink-0 ml-3">
            <WeatherIcon code={weather.weatherCode} size={26} />
          </div>
        </div>
        </div>
      )}

      {/* ===== SECTION: Agent Card — Red Branded Banner ===== */}
      {agent && (
        <div className="max-w-lg mx-auto px-4 mt-3">
        <div
          className="rounded-2xl overflow-hidden relative"
          style={{ background: 'linear-gradient(135deg, #450a0a, #7f1d1d, #991b1b)' }}
        >
          {/* Decorative circles — subtle depth */}
          <div className="absolute -right-5 -top-5 w-24 h-24 rounded-full bg-white/[0.03] pointer-events-none" />
          <div className="absolute right-5 -bottom-8 w-20 h-20 rounded-full bg-white/[0.02] pointer-events-none" />

          <div className="relative z-10 p-5">

            {/* --- Agent photo + name + WA --- */}
            <div className="flex items-center gap-3 mb-4">
              {/* Photo with verified badge */}
              <div className="relative flex-shrink-0">
                <img
                  src={agent.photo}
                  alt={agent.name}
                  className="w-[52px] h-[52px] rounded-[14px] object-cover border-2 border-white/10"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    const fallback = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                    if (fallback) fallback.classList.remove('hidden');
                  }}
                />
                {/* Fallback initials */}
                <div className="hidden w-[52px] h-[52px] rounded-[14px] bg-white/15 border-2 border-white/10 items-center justify-center text-white text-base font-bold">
                  {agent.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                {/* Verified badge */}
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-blue-500 border-2 border-[#7f1d1d] flex items-center justify-center">
                  <Check size={10} strokeWidth={3} className="text-white" />
                </div>
              </div>

              <div>
                <div className="text-base font-bold text-white">{agent.name}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  <svg width="13" height="13" viewBox="0 0 448 512" fill="rgba(255,255,255,0.45)" className="flex-shrink-0">
                    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.3-5-3.7-10.5-6.5z"/>
                  </svg>
                  <span className="text-[11px] text-white/60 font-medium">{formatPhone(agent.phone)}</span>
                </div>
              </div>
            </div>

            {/* --- Alamat kantor --- */}
            <div className="flex items-start gap-2 mb-4">
              <MapPin size={13} strokeWidth={2} className="text-white/40 flex-shrink-0 mt-0.5" />
              <span className="text-[11px] text-white/50 leading-relaxed">
                Graha Alhijaz, Jl. Dewi Sartika No.239A, Cawang, Kec. Kramat Jati, Jakarta Timur, Jakarta
              </span>
            </div>

            {/* --- CTA: WhatsApp (white button, inverted) --- */}
            <button
              onClick={handleWhatsApp}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white active:scale-[0.98] transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 448 512" fill="#25D366">
                <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.3-5-3.7-10.5-6.5z"/>
              </svg>
              <span className="text-gray-800 text-sm font-bold">Chat via WhatsApp</span>
            </button>

          </div>
        </div>
        </div>
      )}

      {/* ── 7. Footer ── */}
      <div className="mt-6 pb-8 text-center">
        <h3 className="text-sm font-bold text-gray-800 tracking-wide">PT ALHIJAZ INDOWISATA</h3>
        <p className="text-[11px] text-gray-500 mt-1">Travel Umrah & Haji Plus Akreditasi A</p>
      </div>

      {/* Copied toast */}
      {copied && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
            bg-slate-800 text-white text-xs font-semibold
            px-4 py-2.5 rounded-xl shadow-lg"
          style={{ animation: 'shareToastIn 0.3s ease-out' }}
        >
          Berhasil copy link
        </div>
      )}

      {/* Leaflet CSS fixup */}
      <style>{`
        .leaflet-container { font-family: inherit; }
        .leaflet-control-attribution { display: none !important; }
        @keyframes shareToastIn {
          from { opacity: 0; transform: translate(-50%, 10px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes planePulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
