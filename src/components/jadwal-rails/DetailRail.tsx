import { CloudSun, FileText, Footprints, Star, Sun, Thermometer } from 'lucide-react';
import { useState } from 'react';

import { getTemperature } from '@/data/temperatureData';
import {
  extraHotelsOf,
  formatHargaCell,
  hotelDistanceOf,
  hotelStarsOf,
  tiersOf,
} from '@/lib/packageDetail';
import { cheapestTierOf } from '@/lib/packagePricing';
import type { RoomPricing, UmrohPackage } from '@/types';
import { trackPublicEvent } from '@/utils/analytics';

interface Props {
  pkg: UmrohPackage;
  /** Slug agent untuk event publik. Null = jadwal umum tanpa agent. */
  agentSlug?: string | null;
}

type TabId = 'hotel' | 'biaya' | 'brosur';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'hotel', label: 'Hotel' },
  { id: 'biaya', label: 'Biaya' },
  { id: 'brosur', label: 'Brosur' },
];

const CARD = 'rounded-2xl bg-white shadow-[0_6px_22px_-8px_rgba(58,42,31,0.15)] dark:bg-slate-900 dark:shadow-black/40';

/**
 * Jarak DITULIS PENUH di rail, tidak disingkat seperti di kartu.
 * Kartu punya ruang 512px untuk enam blok; rail punya satu kolom untuk satu
 * hotel, dan "±300 m ke pelataran Masjidil Haram" itulah yang sebenarnya
 * dijual — bukan "±300m" yang harus dijelaskan lagi oleh agent.
 */
function distanceSentence(city: string, distance: string): string | null {
  if (!distance) return null;
  const spaced = distance.replace(/(\d)\s*m$/i, '$1 m').replace(/(\d)\s*km$/i, '$1 km');
  const masjid =
    city === 'MEKKAH' ? 'Masjidil Haram' : city === 'MADINAH' ? 'Masjid Nabawi' : null;
  return masjid ? `${spaced} ke pelataran ${masjid}` : spaced;
}

function HotelBlock({ city, name, stars, distance }: { city: string; name: string; stars: string; distance: string }) {
  const count = Number.parseInt(stars, 10);
  const sentence = distanceSentence(city, distance);
  return (
    <div className={`${CARD} p-4`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="rounded-[5px] bg-emerald-50 px-2 py-[3px] text-[8.5px] font-extrabold uppercase tracking-[0.09em] text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
          {city}
        </span>
        {Number.isFinite(count) && count > 0 && (
          <span className="flex gap-[2px]">
            {Array.from({ length: count }).map((_, i) => (
              // fill lewat ATRIBUT + currentColor, bukan kelas fill-amber-400:
              // kelas yang baru lahir bareng fitur tidak ada di CSS lama yang
              // masih dipegang service worker di perangkat user, dan bintangnya
              // hilang walau kodenya benar.
              <Star key={i} size={12} fill="currentColor" className="text-amber-400" />
            ))}
          </span>
        )}
      </div>
      <p className="text-[14.5px] font-bold leading-tight text-gray-900 dark:text-white">{name}</p>
      {sentence && (
        <p className="mt-2 flex items-start gap-1.5 text-[11.5px] font-semibold leading-snug text-emerald-700 dark:text-emerald-400">
          <Footprints size={13} className="mt-[1px] shrink-0" />
          {sentence}
        </p>
      )}
    </div>
  );
}

/**
 * Rail kanan — detail paket yang sedang dibahas, dibagi per tab.
 *
 * Bertab, bukan bertumpuk: bertumpuk cuma memindahkan gulir ±3.000px dari
 * tengah ke kanan. Satu tab = satu layar penuh, jadi agent tinggal menekan tab
 * yang sesuai pertanyaan jamaah.
 *
 * Tab "Rute" sengaja TIDAK ada — rutenya sudah jadi rail kiri.
 */
export default function DetailRail({ pkg, agentSlug }: Props) {
  const [tab, setTab] = useState<TabId>('hotel');

  const tiers = tiersOf(pkg.harga);
  const [tier, setTier] = useState<string>(() => cheapestTierOf(pkg.harga) ?? tiers[0] ?? '');
  const activeTier = pkg.harga?.[tier] ? tier : (cheapestTierOf(pkg.harga) ?? tiers[0] ?? '');

  // HotelInfo adalah union per-jenis paket (Saudi/Cairo/Turki); kolom kota plus
  // hanya ada di sebagian anggotanya. Diakses lewat unknown karena rail memang
  // membaca kolom opsional yang tidak dijamin ada di setiap anggota union.
  const hotelInfo = pkg.hotel?.[activeTier] as unknown as Record<string, string | undefined> | undefined;
  const pricing = pkg.harga?.[activeTier] as RoomPricing | undefined;
  const extras = extraHotelsOf(hotelInfo, pkg.hotel);

  const depMonth = new Date(pkg.keberangkatan.tgl).getMonth() + 1;
  const tempCities = [
    { key: 'mekkah', label: 'Mekkah' },
    { key: 'madinah', label: 'Madinah' },
    ...extras.map((h) => ({ key: h.city.toLowerCase(), label: h.city })),
  ]
    .filter((c, i, arr) => arr.findIndex((x) => x.key === c.key) === i)
    .map((c) => ({ ...c, temp: getTemperature(c.key, depMonth) }))
    .filter((c) => c.temp !== null);

  return (
    <div className="space-y-3">
      <div className="flex gap-[3px] rounded-[11px] bg-black/[0.07] p-1 dark:bg-white/[0.07]">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                // Tab mana yang dipakai agent = pertanyaan apa yang paling
                // sering datang dari jamaah. Publik, bukan trackEvent.
                if (agentSlug) trackPublicEvent(agentSlug, 'jadwal_rail_tab', { tab: t.id });
              }}
              aria-pressed={active}
              className={`h-[31px] flex-1 rounded-lg text-[12px] transition-colors ${
                active
                  ? 'bg-white font-bold text-gray-900 shadow-sm dark:bg-slate-800 dark:text-white'
                  : 'font-medium text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'hotel' && (
        <div className="space-y-3">
          <HotelBlock
            city="MEKKAH"
            name={hotelInfo?.mekkah_hotel || '—'}
            stars={hotelStarsOf(hotelInfo?.mekkah_hotel, hotelInfo?.mekkah_bintang)}
            distance={hotelDistanceOf(hotelInfo?.mekkah_hotel, hotelInfo?.mekkah_jarak)}
          />
          <HotelBlock
            city="MADINAH"
            name={hotelInfo?.madinah_hotel || '—'}
            stars={hotelStarsOf(hotelInfo?.madinah_hotel, hotelInfo?.madinah_bintang)}
            distance={hotelDistanceOf(hotelInfo?.madinah_hotel, hotelInfo?.madinah_jarak)}
          />
          {extras.map((h) => (
            <HotelBlock key={h.city} city={h.city.toUpperCase()} name={h.name} stars={h.star} distance="" />
          ))}
        </div>
      )}

      {tab === 'biaya' && (
        <div className="space-y-3">
          {tiers.length > 1 && (
            <div className="flex gap-1.5">
              {tiers.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(t)}
                  aria-pressed={t === activeTier}
                  className={`flex-1 rounded-[9px] py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                    t === activeTier
                      ? 'bg-orange-500 text-white'
                      : 'bg-white text-gray-600 shadow-sm hover:text-gray-900 dark:bg-slate-900 dark:text-slate-400'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          <div className={`${CARD} p-4`}>
            <p className="mb-3 text-[9px] font-extrabold uppercase tracking-[0.11em] text-gray-400 dark:text-slate-500">
              Rincian biaya
            </p>
            {(
              [
                ['Quad (sekamar 4)', pricing?.Quard],
                ['Triple (sekamar 3)', pricing?.Triple],
                ['Double (sekamar 2)', pricing?.Double],
                ['Single (1 orang)', pricing?.Single],
                ['Infant (<2 tahun)', pricing?.Infant],
              ] as Array<[string, string | undefined]>
            )
              .filter(([, value]) => Boolean(value))
              .map(([label, value], idx) => (
                <div
                  key={label}
                  className="flex items-center justify-between border-b border-gray-100 py-2 last:border-0 dark:border-slate-800"
                >
                  <span className={`text-[12px] ${idx === 0 ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-slate-300'}`}>
                    {label}
                  </span>
                  <span className={`text-[12.5px] font-bold ${idx === 0 ? 'text-orange-600' : 'text-gray-800 dark:text-slate-100'}`}>
                    {formatHargaCell(value)}
                  </span>
                </div>
              ))}
          </div>

          {tempCities.length > 0 && (
            <div className={`${CARD} p-4`}>
              <p className="mb-3 flex items-center gap-2 text-[9px] font-extrabold uppercase tracking-[0.11em] text-gray-400 dark:text-slate-500">
                <Thermometer size={12} />
                Suhu saat keberangkatan
              </p>
              <div className="grid grid-cols-2 gap-3">
                {tempCities.map((c) => {
                  const hot = (c.temp as { high: number }).high > 28;
                  const Icon = hot ? Sun : CloudSun;
                  return (
                    <div key={c.key} className="flex items-center gap-2.5">
                      <span className={`rounded-xl p-2 ${hot ? 'bg-orange-50 dark:bg-orange-950/30' : 'bg-teal-50 dark:bg-teal-950/30'}`}>
                        <Icon size={15} className={hot ? 'text-orange-500' : 'text-teal-500'} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[9px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                          {c.label}
                        </span>
                        <span className="block text-[12.5px] font-bold text-gray-900 dark:text-white">
                          {(c.temp as { high: number }).high}° / {(c.temp as { low: number }).low}°
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'brosur' && (
        <div className={`${CARD} overflow-hidden`}>
          {pkg.brosurUrl ? (
            <>
              <img
                src={pkg.brosurUrl}
                alt={`Brosur ${pkg.nama}`}
                loading="lazy"
                className="w-full"
              />
              <a
                href={pkg.brosurUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 border-t border-gray-100 py-3 text-[12px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <FileText size={13} />
                Buka brosur ukuran penuh
              </a>
            </>
          ) : (
            <p className="p-6 text-center text-[12px] text-gray-500 dark:text-slate-400">
              Brosur belum tersedia untuk paket ini.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
