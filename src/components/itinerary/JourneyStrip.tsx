import { Plane } from 'lucide-react';
import { computeNightSegments } from '../../../lib/itinerary-view.js';
import { CITY_HEX, CITY_LABEL, type CityKey } from './cityTheme';

interface Props {
  days: Array<{ location?: string | null }>;
  routeText?: string | null; // "CGK → DXB → JED  ·  pulang JED → DXB → CGK"
}

export default function JourneyStrip({ days, routeText }: Props) {
  const segments = computeNightSegments(days) as Array<{ key: CityKey; nights: number }> | null;
  // Hitungan tak masuk akal → lebih baik hilang daripada salah (spec, bagian rawan #1)
  if (!segments) return null;
  const totalNights = segments.reduce((n, s) => n + s.nights, 0);

  return (
    <div className="mx-4 rounded-2xl bg-itin-canvas p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-itin-ink3">Alur Perjalanan</span>
        <span className="font-mono text-[10px] font-medium text-itin-ink2">
          {totalNights} malam · {days.length} hari
        </span>
      </div>
      <div className="mt-2.5 flex items-center gap-1">
        {segments.map((s, i) => (
          <div
            key={i}
            className="h-2 rounded-full"
            style={{ backgroundColor: CITY_HEX[s.key], flexGrow: s.nights, flexBasis: 0 }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex items-start justify-between gap-2">
        {segments.map((s, i) => (
          <div key={i} className="flex min-w-0 items-center gap-1.5">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ backgroundColor: CITY_HEX[s.key] }} />
            <span className="min-w-0">
              <span className="block truncate text-[11.5px] font-semibold text-itin-ink">{CITY_LABEL[s.key]}</span>
              <span className="block text-[10px] text-itin-ink3">{s.nights} malam</span>
            </span>
          </div>
        ))}
      </div>
      {routeText && (
        <div className="mt-2 flex items-center gap-1.5 pt-1">
          <Plane size={11} className="shrink-0 text-itin-ink3" />
          <span className="truncate font-mono text-[9.5px] text-itin-ink2">{routeText}</span>
        </div>
      )}
    </div>
  );
}
