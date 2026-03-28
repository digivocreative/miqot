import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ── Types ──

interface FlightMapProps {
  flight: {
    depCode: string;
    depCity: string;
    arrCode: string;
    arrCity: string;
    lat?: number | null;
    lng?: number | null;
    alt?: number | null;
    speed?: number | null;
    progress: number;
    status: string;
    flightNumber: string;
  };
}

// ── Airport Coordinates ──

const AIRPORT_COORDS: Record<string, [number, number]> = {
  // Indonesia
  CGK: [-6.1256, 106.6558],
  SUB: [-7.3798, 112.7868],
  SOC: [-7.5161, 110.7568],
  UPG: [-5.0614, 119.5540],
  KNO: [3.6422, 98.8853],
  BPN: [-1.2683, 116.8945],
  // Saudi Arabia
  JED: [21.6796, 39.1565],
  MED: [24.5534, 39.7051],
  // Transit hubs
  DXB: [25.2532, 55.3657],
  DOH: [25.2609, 51.6138],
  KUL: [2.7456, 101.7099],
  SIN: [1.3644, 103.9915],
  IST: [41.2753, 28.7519],
  AUH: [24.4330, 54.6511],
};

// ── Tile URLs ──

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const TILE_URL_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

// ── Helpers ──

function airportIcon(code: string, isArrival: boolean) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:24px;height:24px;border-radius:50%;
      background:${isArrival ? '#3b82f6' : '#10b981'};
      border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.2);
      display:flex;align-items:center;justify-content:center;
    "><span style="color:white;font-size:8px;font-weight:800;">${code}</span></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function planeIcon(direction?: number) {
  const deg = direction || 45;
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:28px;height:28px;">
      <div style="
        position:absolute;inset:-6px;border-radius:50%;
        background:rgba(59,130,246,0.2);
        animation:planePulse 2s ease-in-out infinite;
      "></div>
      <div style="
        width:28px;height:28px;border-radius:50%;
        background:#3b82f6;
        box-shadow:0 4px 12px rgba(59,130,246,0.4);
        display:flex;align-items:center;justify-content:center;
        color:white;font-size:14px;
        transform:rotate(${deg}deg);
      ">✈</div>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

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

// ── Component ──

export default function FlightMap({ flight }: FlightMapProps) {
  const depCoord = AIRPORT_COORDS[flight.depCode];
  const arrCoord = AIRPORT_COORDS[flight.arrCode];
  const isDark = document.documentElement.classList.contains('dark');

  const hasPlane = flight.status === 'en-route' && flight.lat && flight.lng;
  const planePos: [number, number] | null = hasPlane ? [flight.lat!, flight.lng!] : null;

  // Generate arc path
  const arcPath = useMemo(() => {
    if (!depCoord || !arrCoord) return null;
    return generateArc(depCoord, arrCoord);
  }, [depCoord, arrCoord]);

  // Traveled portion of the arc
  const traveledArc = useMemo(() => {
    if (!arcPath) return null;
    const idx = Math.round((flight.progress / 100) * arcPath.length);
    return arcPath.slice(0, Math.max(1, idx));
  }, [arcPath, flight.progress]);

  // Calculate bounds
  const bounds = useMemo(() => {
    const pts: [number, number][] = [];
    if (depCoord) pts.push(depCoord);
    if (arrCoord) pts.push(arrCoord);
    if (planePos) pts.push(planePos);
    if (pts.length < 2) {
      // Fallback: center on whatever we have, or a default
      const center = pts[0] || [10, 80];
      return L.latLngBounds([center[0] - 10, center[1] - 20], [center[0] + 10, center[1] + 20]);
    }
    return L.latLngBounds(pts);
  }, [depCoord, arrCoord, planePos]);

  const isLanded = flight.status === 'landed';

  return (
    <div className="relative w-full h-36 rounded-xl overflow-hidden border border-gray-100 dark:border-slate-600">
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [30, 30] }}
        zoomControl={false}
        attributionControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer url={isDark ? TILE_URL_DARK : TILE_URL} />

        {/* Full path (dashed gray / solid green if landed) */}
        {arcPath && (
          isLanded ? (
            <Polyline positions={arcPath} pathOptions={{ color: '#10b981', weight: 3 }} />
          ) : (
            <Polyline positions={arcPath} pathOptions={{ color: '#cbd5e1', weight: 2, dashArray: '8 6' }} />
          )
        )}

        {/* Traveled path (solid blue, en-route only) */}
        {!isLanded && traveledArc && traveledArc.length > 1 && (
          <Polyline positions={traveledArc} pathOptions={{ color: '#3b82f6', weight: 3 }} />
        )}

        {/* Departure marker */}
        {depCoord && (
          <Marker position={depCoord} icon={airportIcon(flight.depCode, false)} />
        )}

        {/* Arrival marker */}
        {arrCoord && (
          <Marker position={arrCoord} icon={airportIcon(flight.arrCode, true)} />
        )}

        {/* Airplane marker (en-route only) */}
        {planePos && (
          <Marker position={planePos} icon={planeIcon()}>
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', lineHeight: 1.4, minWidth: 120 }}>
                <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: 4 }}>{flight.flightNumber}</div>
                <div>Alt: {flight.alt ? `${(flight.alt / 1000).toFixed(1)} km` : '—'}</div>
                <div>Speed: {flight.speed || '—'} km/h</div>
                <div>Progress: {flight.progress}%</div>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Info overlay (en-route only) */}
      {flight.status === 'en-route' && (
        <div className="absolute bottom-2 left-2 z-[1000] flex gap-1.5 pointer-events-none">
          <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm px-2 py-1 rounded-lg shadow-sm border border-gray-100 dark:border-slate-700">
            <span className="text-[8px] text-gray-400 uppercase font-bold block">Alt</span>
            <span className="text-[10px] font-bold text-gray-700 dark:text-slate-200">
              {flight.alt ? `${(flight.alt / 1000).toFixed(1)}km` : '—'}
            </span>
          </div>
          <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm px-2 py-1 rounded-lg shadow-sm border border-gray-100 dark:border-slate-700">
            <span className="text-[8px] text-gray-400 uppercase font-bold block">Speed</span>
            <span className="text-[10px] font-bold text-gray-700 dark:text-slate-200">
              {flight.speed || '—'} km/h
            </span>
          </div>
        </div>
      )}

      {/* Pulse animation for plane marker */}
      <style>{`
        @keyframes planePulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
