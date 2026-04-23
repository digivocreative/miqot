import { PlaneTakeoff, PlaneLanding } from 'lucide-react';
import type { UmrohPackage, HotelInfo } from '@/types';
import { getDistance } from '@/data/hotelService';

// ── Shared types ──
export interface VariantProps {
  pkg: UmrohPackage;
  hotelInfo: HotelInfo | undefined;
  absoluteMinPrice: number | null;
  formatHeaderPrice: (price: number | null) => string;
  isExpanded: boolean;
  SeatAndDateSection: React.ComponentType<{ isFooter?: boolean }>;
  formatDate: (dateStr: string) => string;
}

// ── Shared sub-components ──

const HotelIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
    <path d="M19.006 3.705a.75.75 0 1 0-.512-1.41L6 6.838V3a.75.75 0 0 0-.75-.75h-1.5A.75.75 0 0 0 3 3v4.93l-1.006.365a.75.75 0 0 0 .512 1.41l16.5-6Z" />
    <path fillRule="evenodd" d="M3.019 11.115 18 5.667V9.09l4.006 1.456a.75.75 0 1 1-.512 1.41l-.494-.18v8.475h.75a.75.75 0 0 1 0 1.5H2.25a.75.75 0 0 1 0-1.5H3v-9.129l.019-.006ZM18 20.25v-9.565l1.5.545v9.02H18Zm-9-6a.75.75 0 0 0-.75.75v4.5c0 .414.336.75.75.75h3a.75.75 0 0 0 .75-.75V15a.75.75 0 0 0-.75-.75H9Z" clipRule="evenodd" />
  </svg>
);

function Stars({ count, distance }: { count: string; distance?: string | null }) {
  const n = parseInt(count) || 0;
  const dist = distance || null;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className="text-[10px] text-amber-400">&#9733;</span>
      ))}
      {dist && <span className="text-[11px] font-semibold ml-2 text-emerald-600">{dist}</span>}
    </div>
  );
}

function FlightRow({ icon, code, date, time, formatDate: fd }: {
  icon: React.ReactNode; code: string; date: string; time: string; formatDate: (d: string) => string;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-5 h-5 flex items-center justify-center text-emerald-600 mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1">
          <span className="font-medium text-gray-700 dark:text-slate-200">{code}</span>
          <span>/</span>
          <span>{fd(date)}</span>
        </p>
        <p className="text-xs text-gray-600 dark:text-slate-300 whitespace-nowrap">{time} WIB</p>
      </div>
    </div>
  );
}

function HotelCell({ label, name, stars, distance }: {
  label: string; name: string; stars?: string; distance?: string | null;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-5 h-5 flex items-center justify-center text-emerald-600 mt-0.5"><HotelIcon /></div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-xs text-gray-700 dark:text-slate-300 font-medium line-clamp-1 text-ellipsis overflow-hidden break-all" title={name}>{name || '-'}</p>
        {stars && <Stars count={stars} distance={distance} />}
      </div>
    </div>
  );
}

function PromoBadge() {
  return <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 text-red-600 text-xs font-medium rounded">PROMO</span>;
}

function PackageName({ pkg }: { pkg: UmrohPackage }) {
  return (
    <h3 className={`font-bold text-sm leading-tight line-clamp-2 ${
      pkg.seatSisa <= 0
        ? 'line-through text-red-700 dark:text-red-500 decoration-red-700 dark:decoration-red-500'
        : 'text-gray-900 dark:text-slate-100'
    }`}>
      {pkg.nama}
    </h3>
  );
}

// ── Helpers ──
// Upstream only provides ONE time per leg (the departure/takeoff time).
// Landing times must never be fabricated from other legs' times.
function getFlightData(pkg: UmrohPackage) {
  return {
    depCode: (pkg.keberangkatan.kodePenerbangan || '').split('/')[0].trim(),
    depDate: pkg.keberangkatan.tgl,
    depTime: pkg.keberangkatan.jam.replace('.', ':'),
    retCode: (pkg.kepulangan.kodePenerbangan || '').split('/')[0].trim(),
    retDate: pkg.kepulangan.tgl,
    retTime: pkg.kepulangan.jam.replace('.', ':'),
  };
}

function getHotelData(hotelInfo: HotelInfo | undefined) {
  return {
    mekkahName: hotelInfo?.mekkah_hotel || '-',
    mekkahStars: hotelInfo?.mekkah_bintang || '',
    mekkahDist: hotelInfo?.mekkah_jarak || getDistance(hotelInfo?.mekkah_hotel || ''),
    madinahName: hotelInfo?.madinah_hotel || '-',
    madinahStars: hotelInfo?.madinah_bintang || '',
    madinahDist: hotelInfo?.madinah_jarak || getDistance(hotelInfo?.madinah_hotel || ''),
  };
}

// ════════════════════════════════════════════════
// 1. SPLIT LAYOUT — collapsed content only
// ════════════════════════════════════════════════

export function SplitLayout(props: VariantProps) {
  const { pkg, hotelInfo, absoluteMinPrice, formatHeaderPrice, isExpanded, SeatAndDateSection } = props;
  const f = getFlightData(pkg);
  const h = getHotelData(hotelInfo);
  const depDate = new Date(pkg.keberangkatan.tgl);

  return (
    <>
      <div className="flex">
        {/* Left emerald panel */}
        <div className="w-[72px] shrink-0 bg-gradient-to-b from-emerald-500 to-emerald-600 text-white flex flex-col items-center justify-center py-3 px-1.5 gap-1.5">
          <div className="text-center">
            <p className="text-2xl font-black leading-none">{depDate.getDate()}</p>
            <p className="text-[10px] uppercase font-bold mt-0.5">{depDate.toLocaleDateString('id-ID', { month: 'short' })}</p>
            <p className="text-[10px] font-medium opacity-80">{depDate.getFullYear()}</p>
          </div>
          <div className="w-7 border-t border-white/30" />
          <div className="text-center">
            <p className="text-sm font-black leading-tight">{formatHeaderPrice(absoluteMinPrice)}<span className="text-[9px]"> Jt</span></p>
          </div>
          <div className="w-7 border-t border-white/30" />
          <div className="text-center">
            <p className="text-[9px] font-bold leading-tight">{pkg.maskapai || '-'}</p>
          </div>
        </div>

        {/* Right content */}
        <div className="flex-1 py-3 px-3 min-w-0">
          <div className="mb-2.5">
            <PackageName pkg={pkg} />
            {pkg.isPromo && <PromoBadge />}
          </div>

          {/* Flights — compact: icon code time */}
          <div className="space-y-1 mb-2.5">
            <div className="flex items-center gap-1.5 text-xs">
              <PlaneTakeoff size={13} className="text-emerald-600 shrink-0" />
              <span className="font-medium text-gray-700 dark:text-slate-200 shrink-0">{f.depCode}</span>
              <span className="text-gray-300 dark:text-slate-600 shrink-0">&middot;</span>
              <span className="text-gray-500 dark:text-slate-400 whitespace-nowrap">{f.depTime} WIB</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <PlaneLanding size={13} className="text-emerald-600 shrink-0" />
              <span className="font-medium text-gray-700 dark:text-slate-200 shrink-0">{f.retCode}</span>
              <span className="text-gray-300 dark:text-slate-600 shrink-0">&middot;</span>
              <span className="text-gray-500 dark:text-slate-400 whitespace-nowrap">{f.retTime} WIB</span>
            </div>
          </div>

          {/* Hotels — two rows, name + stars only */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs min-w-0">
              <div className="w-3.5 h-3.5 flex items-center justify-center text-emerald-600 shrink-0"><HotelIcon /></div>
              <span className="text-gray-700 dark:text-slate-300 font-medium truncate" title={h.mekkahName}>{h.mekkahName}</span>
              {h.mekkahStars && <span className="text-amber-400 shrink-0 text-[10px] ml-auto">{'★'.repeat(parseInt(h.mekkahStars) || 0)}</span>}
            </div>
            <div className="flex items-center gap-1.5 text-xs min-w-0">
              <div className="w-3.5 h-3.5 flex items-center justify-center text-emerald-600 shrink-0"><HotelIcon /></div>
              <span className="text-gray-700 dark:text-slate-300 font-medium truncate" title={h.madinahName}>{h.madinahName}</span>
              {h.madinahStars && <span className="text-amber-400 shrink-0 text-[10px] ml-auto">{'★'.repeat(parseInt(h.madinahStars) || 0)}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Seat bar — full width below the flex, inside card */}
      {!isExpanded && (
        <div className="px-4 pb-1">
          <SeatAndDateSection isFooter={false} />
        </div>
      )}
    </>
  );
}

// ════════════════════════════════════════════════
// 2. SPOTLIGHT LAYOUT — collapsed content only
// ════════════════════════════════════════════════

export function SpotlightLayout(props: VariantProps) {
  const { pkg, hotelInfo, absoluteMinPrice, formatHeaderPrice, isExpanded, SeatAndDateSection, formatDate } = props;
  const f = getFlightData(pkg);
  const h = getHotelData(hotelInfo);

  return (
    <>
      {/* Emerald banner */}
      <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-3 text-white">
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm leading-tight line-clamp-2">{pkg.nama}</h3>
            {pkg.isPromo && <span className="inline-block mt-1 px-2 py-0.5 bg-white/20 text-white text-xs font-medium rounded">PROMO</span>}
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] font-medium opacity-80">MULAI</p>
            <p className="text-lg font-bold">Rp {formatHeaderPrice(absoluteMinPrice)} <span className="text-sm">Jt</span></p>
          </div>
        </div>
      </div>

      {/* White body */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <FlightRow icon={<PlaneTakeoff size={16} />} code={f.depCode} date={f.depDate} time={f.depTime} formatDate={formatDate} />
          <FlightRow icon={<PlaneLanding size={16} />} code={f.retCode} date={f.retDate} time={f.retTime} formatDate={formatDate} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <HotelCell label="Mekkah" name={h.mekkahName} stars={h.mekkahStars} distance={h.mekkahDist} />
          <HotelCell label="Madinah" name={h.madinahName} stars={h.madinahStars} distance={h.madinahDist} />
        </div>
        {!isExpanded && <SeatAndDateSection isFooter={false} />}
      </div>
    </>
  );
}

// ════════════════════════════════════════════════
// 3. TICKET LAYOUT — collapsed content only
// ════════════════════════════════════════════════

export function TicketLayout(props: VariantProps) {
  const { pkg, hotelInfo, absoluteMinPrice, formatHeaderPrice, isExpanded, SeatAndDateSection, formatDate } = props;
  const f = getFlightData(pkg);
  const h = getHotelData(hotelInfo);

  const route = pkg.keberangkatan.rute || '';
  const airportCodes = route.match(/[A-Z]{3}/g) || [];
  const origin = airportCodes[0] || 'CGK';
  const dest = airportCodes.length > 1 ? airportCodes[airportCodes.length - 1] : 'JED';

  return (
    <>
      {/* Route hero */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-slate-900/60 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-center">
            <p className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">{origin}</p>
            <p className="text-xl font-black text-gray-800 dark:text-white leading-none">{f.depTime}</p>
          </div>
          <div className="flex-1 flex items-center gap-1 px-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <div className="flex-1 border-t-2 border-dashed border-emerald-300 dark:border-emerald-700 relative">
              <PlaneTakeoff size={14} className="absolute -top-[7px] left-1/2 -translate-x-1/2 text-emerald-500" />
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          </div>
          <div className="text-center">
            <p className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">{dest}</p>
            <p className="text-xl font-black text-gray-300 dark:text-slate-600 leading-none">&mdash;</p>
          </div>
        </div>
        <p className="text-center text-[10px] text-gray-400 dark:text-slate-500 mt-1.5">{f.depCode} / {formatDate(f.depDate)}</p>
      </div>

      {/* Body */}
      <div className="p-4">
        <div className="flex justify-between items-start gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <PackageName pkg={pkg} />
            {pkg.isPromo && <PromoBadge />}
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
              Rp {formatHeaderPrice(absoluteMinPrice)} <span className="text-sm">Jt</span>
            </p>
          </div>
        </div>

        {/* Return flight — compact inline */}
        <div className="flex items-center gap-2 mb-3 text-xs text-gray-500 dark:text-slate-400">
          <PlaneLanding size={14} className="text-emerald-600 shrink-0" />
          <span className="font-medium text-gray-600 dark:text-slate-300">Pulang</span>
          <span>{f.retCode} / {formatDate(f.retDate)} &middot; {f.retTime} WIB</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <HotelCell label="Mekkah" name={h.mekkahName} stars={h.mekkahStars} distance={h.mekkahDist} />
          <HotelCell label="Madinah" name={h.madinahName} stars={h.madinahStars} distance={h.madinahDist} />
        </div>
        {!isExpanded && <SeatAndDateSection isFooter={false} />}
      </div>
    </>
  );
}

// ════════════════════════════════════════════════
// 4. TILED LAYOUT — collapsed content only
// ════════════════════════════════════════════════

export function TiledLayout(props: VariantProps) {
  const { pkg, hotelInfo, absoluteMinPrice, formatHeaderPrice, isExpanded, SeatAndDateSection, formatDate } = props;
  const f = getFlightData(pkg);
  const h = getHotelData(hotelInfo);

  return (
    <div className="p-4">
      <div className="flex justify-between items-start gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <PackageName pkg={pkg} />
          {pkg.isPromo && <PromoBadge />}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-gray-500 dark:text-slate-400">MULAI</p>
          <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
            Rp {formatHeaderPrice(absoluteMinPrice)} <span className="text-sm">Jt</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <FlightRow icon={<PlaneTakeoff size={16} />} code={f.depCode} date={f.depDate} time={f.depTime} formatDate={formatDate} />
        <FlightRow icon={<PlaneLanding size={16} />} code={f.retCode} date={f.retDate} time={f.retTime} formatDate={formatDate} />
      </div>

      {/* Hotels as colored tiles */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-emerald-50/60 dark:bg-emerald-900/20 border border-emerald-100/60 dark:border-emerald-800/40 p-2.5">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 flex items-center justify-center text-emerald-600 mt-0.5"><HotelIcon /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wide font-semibold">Mekkah</p>
              <p className="text-xs text-gray-700 dark:text-slate-300 font-medium line-clamp-1 text-ellipsis overflow-hidden break-all" title={h.mekkahName}>{h.mekkahName}</p>
              {h.mekkahStars && <Stars count={h.mekkahStars} distance={h.mekkahDist} />}
            </div>
          </div>
        </div>
        <div className="rounded-lg bg-blue-50/60 dark:bg-blue-900/20 border border-blue-100/60 dark:border-blue-800/40 p-2.5">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 flex items-center justify-center text-blue-600 dark:text-blue-400 mt-0.5"><HotelIcon /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-blue-600 dark:text-blue-400 uppercase tracking-wide font-semibold">Madinah</p>
              <p className="text-xs text-gray-700 dark:text-slate-300 font-medium line-clamp-1 text-ellipsis overflow-hidden break-all" title={h.madinahName}>{h.madinahName}</p>
              {h.madinahStars && <Stars count={h.madinahStars} distance={h.madinahDist} />}
            </div>
          </div>
        </div>
      </div>

      {!isExpanded && <SeatAndDateSection isFooter={false} />}
    </div>
  );
}

// ════════════════════════════════════════════════
// 5. MAGAZINE LAYOUT — collapsed content only
// ════════════════════════════════════════════════

export function MagazineLayout(props: VariantProps) {
  const { pkg, hotelInfo, absoluteMinPrice, formatHeaderPrice, isExpanded, SeatAndDateSection, formatDate } = props;
  const f = getFlightData(pkg);
  const h = getHotelData(hotelInfo);

  return (
    <>
      {/* Dark hero */}
      <div className="bg-gradient-to-br from-slate-800 via-slate-700 to-emerald-900 px-4 pt-5 pb-10 relative overflow-hidden">
        <div className="absolute top-2 right-3 w-16 h-16 rounded-full border border-white/10" />
        <div className="absolute -bottom-4 -left-4 w-20 h-20 rounded-full border border-white/5" />
        <div className="absolute top-8 right-12 w-8 h-8 rounded-full bg-white/5" />
        <div className="relative z-10 flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm leading-tight line-clamp-2 text-white">{pkg.nama}</h3>
            {pkg.isPromo && <span className="inline-block mt-1 px-2 py-0.5 bg-white/15 text-white text-xs font-medium rounded">PROMO</span>}
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-white/60 font-medium">MULAI</p>
            <p className="text-lg font-bold text-white">
              Rp {formatHeaderPrice(absoluteMinPrice)} <span className="text-sm">Jt</span>
            </p>
          </div>
        </div>
      </div>

      {/* White body overlapping hero */}
      <div className="bg-white dark:bg-slate-800 -mt-6 rounded-t-2xl relative z-10 p-4 pt-5">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <FlightRow icon={<PlaneTakeoff size={16} />} code={f.depCode} date={f.depDate} time={f.depTime} formatDate={formatDate} />
          <FlightRow icon={<PlaneLanding size={16} />} code={f.retCode} date={f.retDate} time={f.retTime} formatDate={formatDate} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <HotelCell label="Mekkah" name={h.mekkahName} stars={h.mekkahStars} distance={h.mekkahDist} />
          <HotelCell label="Madinah" name={h.madinahName} stars={h.madinahStars} distance={h.madinahDist} />
        </div>
        {!isExpanded && <SeatAndDateSection isFooter={false} />}
      </div>
    </>
  );
}
