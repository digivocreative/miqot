import { useEffect, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { usePrayerTimes } from '../hooks/usePrayerTimes';
import type { PrayerCityId } from '../lib/prayerTimesApi';
import type { PortalBooking, PortalSchedule } from '../hooks/usePortalMe';
import {
  PRAYER_ORDER,
  PRAYER_LABELS,
  computeNextPrayer,
  formatCountdown,
  formatHHMM,
  getRiyadhNow,
} from '../../../../lib/prayer-times.js';
import { Card, IconTile } from '../ui';

const CITY_TABS: { id: PrayerCityId; label: string }[] = [
  { id: 'mekkah', label: 'Mekkah' },
  { id: 'madinah', label: 'Madinah' },
];

function useRiyadhMinutes(): number {
  const [minutes, setMinutes] = useState(() => getRiyadhNow(Date.now()).minutesOfDay);
  useEffect(() => {
    function tick() { setMinutes(getRiyadhNow(Date.now()).minutesOfDay); }
    const id = window.setInterval(tick, 30_000);
    window.addEventListener('focus', tick);
    return () => { window.clearInterval(id); window.removeEventListener('focus', tick); };
  }, []);
  return minutes;
}

export default function PrayerTimesCard({
  schedule,
  booking,
}: {
  schedule: PortalSchedule | null;
  booking: PortalBooking;
}) {
  const { primaryCity, cities } = usePrayerTimes(schedule, booking);
  const [activeCity, setActiveCity] = useState<PrayerCityId>(primaryCity);
  const nowMinutes = useRiyadhMinutes();

  const active = cities[activeCity];
  const next = useMemo(
    () => (active.data ? computeNextPrayer(active.data.timings, nowMinutes) : null),
    [active.data, nowMinutes],
  );

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-4">
        <IconTile tint="neutral" size="sm">
          <Clock className="h-4 w-4" strokeWidth={2} />
        </IconTile>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-ink">Waktu Solat</h2>
          <p className="truncate text-[11px] text-ink/60">
            {active.data?.hijriLabel ? `${active.data.hijriLabel} · ` : ''}Waktu Arab Saudi
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-1 px-4">
        {CITY_TABS.map((tab) => {
          const on = tab.id === activeCity;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveCity(tab.id)}
              aria-pressed={on}
              className={`min-h-9 flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                on
                  ? 'bg-gradient-burgundy text-white shadow-accent'
                  : 'bg-burgundy-700/5 text-burgundy-800/70 hover:bg-burgundy-700/10'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="p-4">
        {!active.data && active.status === 'error' ? (
          <PrayerError />
        ) : !active.data ? (
          <PrayerSkeleton />
        ) : (
          <>
            {next && (
              <div className="mb-4 rounded-xl bg-burgundy-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-burgundy-700">
                  Solat berikutnya{next.tomorrow ? ' (besok)' : ''}
                </p>
                <div className="mt-0.5 flex items-baseline justify-between gap-2">
                  <span className="text-lg font-bold text-ink">
                    {next.label} · <span className="font-mono tabular-nums">{next.timeLabel}</span>
                  </span>
                  <span className="flex-none font-mono text-xs font-semibold tabular-nums text-burgundy-700">
                    {formatCountdown(next.minutesUntil)}
                  </span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-5 gap-1">
              {PRAYER_ORDER.map((name) => {
                const isNext = next?.name === name && !next?.tomorrow;
                return (
                  <div
                    key={name}
                    className={`rounded-lg px-1 py-2 text-center ${
                      isNext
                        ? 'bg-gradient-burgundy text-white shadow-accent'
                        : 'bg-burgundy-700/5 text-burgundy-950/60'
                    }`}
                  >
                    <p className="text-[10px] font-semibold">{PRAYER_LABELS[name]}</p>
                    <p className={`mt-0.5 font-mono text-xs font-bold tabular-nums ${isNext ? 'text-white' : 'text-ink'}`}>
                      {formatHHMM(active.data!.timings[name])}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function PrayerSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-16 rounded-xl bg-burgundy-700/5" />
      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-burgundy-700/5" />
        ))}
      </div>
    </div>
  );
}

function PrayerError() {
  return (
    <div className="py-4 text-center">
      <Clock className="mx-auto h-7 w-7 text-burgundy-200" strokeWidth={2} />
      <p className="mt-2 text-sm font-semibold text-ink">Jadwal solat tak tersedia</p>
      <p className="mt-1 text-xs text-ink/60">Periksa koneksi lalu buka lagi Beranda.</p>
    </div>
  );
}
