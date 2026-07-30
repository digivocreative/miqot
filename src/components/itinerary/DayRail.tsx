import {
  Users, Megaphone, BadgeCheck, PlaneTakeoff, PlaneLanding, BedDouble,
  Utensils, Camera, Landmark, CircleDot, type LucideIcon,
} from 'lucide-react';
import { classifyActivity, activityIconName, cityKeyForLocation } from '../../../lib/itinerary-view.js';
import { CITY_HEX, DEFAULT_CITY, railColor, type CityKey } from './cityTheme';

const ICONS: Record<string, LucideIcon> = {
  'users': Users, 'megaphone': Megaphone, 'badge-check': BadgeCheck,
  'plane-takeoff': PlaneTakeoff, 'plane-landing': PlaneLanding, 'bed-double': BedDouble,
  'utensils': Utensils, 'camera': Camera, 'landmark': Landmark, 'circle-dot': CircleDot,
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
  const dayNum = day.dayNumber?.match(/\d[\d\-–]*/)?.[0] || String(dayIndex + 1);

  return (
    <section>
      {/* Header hari — full-bleed, sticky */}
      <div className="sticky top-0 z-10 flex items-center gap-2.5 border-y border-itin-line bg-white px-4 py-3">
        <span className="h-[26px] w-[3px] shrink-0 rounded-full" style={{ backgroundColor: c }} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="shrink-0 font-mono text-[9.5px] font-bold tracking-[0.04em]" style={{ color: c }}>
              HARI {dayNum}
            </span>
            <span className="truncate text-[13px] font-semibold text-itin-ink">{day.title}</span>
          </div>
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
            const Icon = ICONS[activityIconName(kind, act.text)] || CircleDot;
            const showTime = act.time && act.time !== '-';
            return (
              <div key={i} className="pb-4 last:pb-3">
                <div className="flex items-center gap-2">
                  <Icon
                    size={13}
                    className={highlight ? 'shrink-0' : 'shrink-0 text-itin-ink3'}
                    style={highlight ? { color: c } : undefined}
                  />
                  {showTime && (highlight ? (
                    <span className="font-mono text-[11px] font-bold" style={{ color: c }}>{act.time}</span>
                  ) : (
                    <span className="font-mono text-[11px] font-bold text-itin-ink3">{act.time}</span>
                  ))}
                  {highlight && (
                    <span
                      className="rounded px-1.5 py-px text-[7.5px] font-bold uppercase tracking-[0.05em] text-white"
                      style={{ backgroundColor: c }}
                    >
                      {BADGE_TEXT[kind]}
                    </span>
                  )}
                </div>
                <p className={`mt-1 text-[12.5px] leading-[1.45] ${highlight ? 'font-medium text-itin-ink' : 'text-itin-ink2'}`}>
                  {act.text}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
