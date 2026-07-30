import { useState } from 'react';
import { BedDouble, Star } from 'lucide-react';
import type { PackageHotels } from '@/types';
import { cityKeyForLocation } from '../../../lib/itinerary-view.js';
import { CITY_HEX, DEFAULT_CITY, type CityKey } from './cityTheme';

// Runtime shape per tier (transformHotelInfo): kunci `<city>_hotel`, `<city>_bintang`, `<city>_jarak`.
function tierRows(tier: Record<string, string | undefined>) {
  return Object.entries(tier)
    .filter(([key, value]) => key.endsWith('_hotel') && !!value)
    .map(([key, value]) => {
      const city = key.replace(/_hotel$/, '');
      return {
        city,
        name: value as string,
        stars: tier[`${city}_bintang`] && tier[`${city}_bintang`] !== '0' ? tier[`${city}_bintang`] : null,
      };
    });
}

export default function HotelCard({ hotel }: { hotel: PackageHotels }) {
  const tiers = Object.keys(hotel || {}).filter(
    t => hotel[t] && tierRows(hotel[t] as Record<string, string | undefined>).length,
  );
  const [active, setActive] = useState(0);
  if (!tiers.length) return null;
  const activeTier = tiers[Math.min(active, tiers.length - 1)];
  const rows = tierRows(hotel[activeTier] as Record<string, string | undefined>);

  return (
    <div className="overflow-hidden rounded-2xl border border-itin-line bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-itin-line px-3.5 py-2.5">
        <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-itin-ink">
          <BedDouble size={14} className="text-itin-ink2" /> Hotel
        </span>
        {tiers.length === 1 ? (
          <span className="rounded-md bg-itin-canvas px-2 py-0.5 text-[9.5px] font-bold tracking-[0.03em] text-itin-ink2">
            PAKET {tiers[0].toUpperCase()}
          </span>
        ) : (
          <div className="flex flex-wrap justify-end gap-1">
            {tiers.map((t, i) => (
              <button
                key={t}
                type="button"
                onClick={() => setActive(i)}
                className={`rounded-md px-2 py-0.5 text-[9.5px] font-bold tracking-[0.03em] ${
                  i === active ? 'bg-itin-ink text-white' : 'bg-itin-canvas text-itin-ink2'}`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="px-3.5 py-1">
        {rows.map((row, i) => {
          const key = (cityKeyForLocation(row.city) || DEFAULT_CITY) as CityKey;
          return (
            <div
              key={row.city}
              className={`flex items-center justify-between gap-2.5 py-2.5 ${
                i < rows.length - 1 ? 'border-b border-itin-line' : ''}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ backgroundColor: CITY_HEX[key] }} />
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold capitalize text-itin-ink">{row.city}</span>
                  <span className="block truncate text-[10.5px] text-itin-ink3">{row.name}</span>
                </span>
              </span>
              {row.stars && (
                <span className="flex shrink-0 items-center gap-1 text-[10.5px] font-semibold text-itin-ink2">
                  <Star size={10} className="text-itin-ink3" /> {row.stars}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
