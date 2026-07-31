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
    <div className="overflow-hidden rounded-2xl border border-[#EAE2D8] bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-[#F1EAE1] px-3.5 py-2.5">
        <span className="flex items-center gap-2 text-[13.5px] font-bold text-itin-ink">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gold-50 text-[#8A0F0A]">
            <BedDouble size={14} />
          </span>
          Hotel
        </span>
        {tiers.length === 1 ? (
          <span className="rounded-md bg-itin-canvas px-2 py-0.5 text-[10px] font-bold tracking-[0.03em] text-itin-ink2">
            PAKET {tiers[0].toUpperCase()}
          </span>
        ) : (
          <div className="flex flex-wrap justify-end gap-1">
            {tiers.map((t, i) => (
              <button
                key={t}
                type="button"
                onClick={() => setActive(i)}
                className={`rounded-md px-2 py-0.5 text-[10px] font-bold tracking-[0.03em] ${
                  i === active ? 'bg-itin-ink text-white' : 'bg-itin-canvas text-itin-ink2'}`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="px-3.5 py-0.5">
        {rows.map((row, i) => {
          const key = (cityKeyForLocation(row.city) || DEFAULT_CITY) as CityKey;
          const starCount = row.stars ? Math.min(parseInt(row.stars, 10) || 0, 5) : 0;
          return (
            <div
              key={row.city}
              className={`flex items-center justify-between gap-2.5 py-3 ${
                i < rows.length - 1 ? 'border-b border-[#F1EAE1]' : ''}`}
            >
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ backgroundColor: CITY_HEX[key] }} />
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-itin-ink3">{row.city}</span>
                </span>
                <span className="mt-0.5 block truncate text-[13.5px] font-semibold capitalize text-itin-ink">
                  {row.name.toLowerCase()}
                </span>
              </span>
              {starCount > 0 ? (
                <span className="flex shrink-0 items-center gap-0.5">
                  {Array.from({ length: starCount }, (_, s) => (
                    <Star key={s} size={12} fill="#D4AF37" className="text-[#D4AF37]" />
                  ))}
                </span>
              ) : row.stars ? (
                <span className="shrink-0 text-[11.5px] font-semibold text-itin-ink2">{row.stars}</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
