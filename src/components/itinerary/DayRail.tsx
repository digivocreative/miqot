import { Users, PlaneTakeoff, PlaneLanding, CircleDot, type LucideIcon } from 'lucide-react';
import { classifyActivity, activityIconName, cityKeyForLocation } from '../../../lib/itinerary-view.js';
import { CITY_HEX, DEFAULT_CITY, railColor, type CityKey } from './cityTheme';

// Ikon HANYA untuk momen bermakna (kumpul/takeoff/landing/transit) — baris biasa
// tampil polos sebagai lembar jam+teks supaya highlight benar-benar menonjol.
const ICONS: Record<string, LucideIcon> = {
  'users': Users,
  'plane-takeoff': PlaneTakeoff,
  'plane-landing': PlaneLanding,
};

const BADGE_TEXT: Record<string, string> = {
  kumpul: 'TITIK KUMPUL', takeoff: 'TAKE OFF', landing: 'LANDING', transit: 'TRANSIT',
};

export interface ItineraryDayData {
  dayNumber: string;
  title: string;
  location?: string | null;
  activities: Array<{ time: string; text: string } | string>;
}

interface Props {
  day: ItineraryDayData;
  dayIndex: number;
  dateLabel?: string | null;
}

export default function DayRail({ day, dayIndex, dateLabel }: Props) {
  const cityKey = (cityKeyForLocation(day.location || '') || DEFAULT_CITY) as CityKey;
  const c = CITY_HEX[cityKey];
  const rawNum = day.dayNumber?.match(/\d[\d\-–]*/)?.[0] || String(dayIndex + 1);
  // "3" → "03" (jangkar tipografis); rentang "3-5" dibiarkan apa adanya
  const dayNum = /^\d+$/.test(rawNum) ? rawNum.padStart(2, '0') : rawNum;

  return (
    <section>
      {/* Header hari — angka Calistoga berwarna kota sebagai jangkar, sticky */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-y border-itin-line bg-white px-4 py-2.5">
        <span className="shrink-0 font-display text-[26px] leading-none" style={{ color: c }}>
          {dayNum}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold text-itin-ink">{day.title}</div>
          <div className="truncate text-[10.5px] text-itin-ink3">
            {[day.location, dateLabel].filter(Boolean).join('  ·  ')}
          </div>
        </div>
      </div>
      {/* Rail aktivitas — border-left, BUKAN dot berposisi absolut (spec D4) */}
      <div className="px-4 pb-1 pt-3.5">
        <div className="border-l-[1.5px] pl-4" style={{ borderColor: railColor(cityKey) }}>
          {day.activities.map((raw, i) => {
            const act = typeof raw === 'string' ? { time: '-', text: raw } : raw;
            const kind = classifyActivity(act.text, { dayIndex, activityIndex: i });
            const highlight = kind !== 'regular';
            const showTime = act.time && act.time !== '-';

            if (!highlight) {
              // Lembar dua kolom yang tenang: jam mono + teks, tanpa ornamen
              return (
                <div key={i} className="flex gap-3 pb-4 last:pb-3">
                  <span className="w-[42px] shrink-0 pt-px font-mono text-[11px] font-semibold text-itin-ink3">
                    {showTime ? act.time : ''}
                  </span>
                  <p className="min-w-0 text-[12.5px] leading-[1.5] text-itin-ink2">{act.text}</p>
                </div>
              );
            }

            const Icon = ICONS[activityIconName(kind, act.text)] || CircleDot;
            return (
              <div key={i} className="pb-4 last:pb-3">
                <div className="flex items-center gap-2">
                  <Icon size={13} className="shrink-0" style={{ color: c }} />
                  {showTime && (
                    <span className="font-mono text-[11px] font-bold" style={{ color: c }}>{act.time}</span>
                  )}
                  <span
                    className="rounded px-1.5 py-px text-[7.5px] font-bold uppercase tracking-[0.05em] text-white"
                    style={{ backgroundColor: c }}
                  >
                    {BADGE_TEXT[kind]}
                  </span>
                </div>
                <p className="mt-1 text-[12.5px] font-medium leading-[1.45] text-itin-ink">{act.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
