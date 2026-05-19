import type { PortalBooking } from '../hooks/usePortalMe';
import { daysUntilDate, formatLongDate } from '../utils/formatDate';

interface AirlineMeta {
  code: string;
  name: string;
  logoUrl: string;
}

function airlineFromCode(code?: string | null): AirlineMeta | null {
  const prefix = String(code || '').trim().slice(0, 2).toUpperCase();
  if (!prefix) return null;
  const airlines: Record<string, string> = {
    EK: 'Emirates',
    EY: 'Etihad',
    GA: 'Garuda Indonesia',
    JT: 'Lion Air',
    QR: 'Qatar Airways',
    SV: 'Saudia',
    WY: 'Oman Air',
  };
  return {
    code: prefix,
    name: airlines[prefix] || 'Maskapai',
    logoUrl: `https://images.kiwi.com/airlines/64/${prefix}.png`,
  };
}

function normalizeFlightCode(code?: string | null) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized || normalized === 'TBA') return null;
  return normalized;
}

export default function HeroCountdown({
  booking,
  flightCode,
  greetingName,
}: {
  booking: PortalBooking;
  flightCode: string;
  greetingName?: string;
}) {
  const daysFromApi = Number(booking.hari_ke_berangkat);
  const daysLeft = Number.isFinite(daysFromApi) ? daysFromApi : daysUntilDate(booking.tgl_berangkat) ?? 0;
  const safeDays = Math.max(0, daysLeft);
  const flightCodeText = normalizeFlightCode(flightCode);
  const airline = airlineFromCode(flightCodeText);
  const packageName = booking.jadwal?.jadwal_nama || booking.paket || 'Paket Umroh';

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-emerald-200/10 p-5 text-white shadow-lg shadow-emerald-950/15"
      style={{
        background:
          'radial-gradient(circle at 82% 72%, rgba(52,211,153,0.28) 0%, rgba(16,185,129,0.12) 26%, transparent 54%), radial-gradient(circle at 16% 6%, rgba(255,255,255,0.10) 0%, transparent 32%), linear-gradient(145deg, #022c22 0%, #064e3b 34%, #0f766e 68%, #065f46 100%)',
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 420 420"
        className="pointer-events-none absolute inset-0 h-full w-full text-white opacity-[0.10]"
        preserveAspectRatio="none"
      >
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <g transform="translate(356 58) scale(0.62)">
            <path d="M0 -72 18 -18 72 0 18 18 0 72 -18 18 -72 0 -18 -18Z" fill="currentColor" />
            <path d="M0 -58 16 -16 58 0 16 16 0 58 -16 16 -58 0 -16 -16Z" strokeWidth="4" />
            <path d="M0 -40 40 0 0 40 -40 0Z" strokeWidth="3" />
          </g>
          <g transform="translate(48 390) scale(0.72)">
            <path d="M-70 58v-126c0-46 29-82 70-96 41 14 70 50 70 96V58" strokeWidth="5" />
            <path d="M-43 58v-114c0-30 18-56 43-72 25 16 43 42 43 72V58" strokeWidth="3" />
            <path d="M0 -128V58" strokeWidth="2.5" />
          </g>
        </g>
      </svg>
      <div className="pointer-events-none absolute -right-16 bottom-20 h-20 w-56 -rotate-12 bg-gradient-to-r from-transparent via-amber-200/10 to-transparent opacity-[0.10] blur-xl" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 35%), linear-gradient(115deg, transparent 0%, rgba(251,191,36,0.08) 54%, transparent 82%)',
        }}
      />

      <div className="relative z-10">
        {greetingName && (
          <div className="mb-4 border-b border-white/20 pb-4">
            <p className="text-[12px] font-semibold text-emerald-50">Assalamualaikum,</p>
            <h1 className="mt-0.5 truncate text-xl font-bold tracking-tight text-white">{greetingName}</h1>
          </div>
        )}

        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-50">Menuju Tanah Suci</p>
          <span className="flex-none rounded-full border border-white/10 bg-white/20 px-3 py-1 text-[11px] font-bold tracking-wide text-white shadow-sm backdrop-blur-sm">
            {booking.id_umroh}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-6xl font-bold leading-none tracking-tight">{safeDays}</span>
              <span className="text-base font-semibold text-emerald-50">
                {safeDays === 0 ? 'hari keberangkatan' : 'hari lagi'}
              </span>
            </div>
            <p className="mt-2 min-w-0 truncate text-sm font-medium text-emerald-50">
              {formatLongDate(booking.tgl_berangkat)}
            </p>
          </div>

          {flightCodeText && airline ? (
            <div className="flex min-w-0 flex-col items-end text-right">
              <span className="relative mb-1 flex h-7 w-7 flex-none items-center justify-center overflow-hidden rounded-full bg-white p-1 text-[8px] font-bold text-emerald-700 shadow-sm">
                <span className="absolute inset-0 flex items-center justify-center">{airline.code}</span>
                <img
                  src={airline.logoUrl}
                  alt={`${airline.name} logo`}
                  className="relative h-full w-full object-contain"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              </span>
              <p className="max-w-[120px] truncate text-[10px] font-semibold leading-tight text-emerald-50">{airline.name}</p>
              <p className="mt-1 whitespace-nowrap text-sm font-bold leading-tight text-white">{flightCodeText}</p>
            </div>
          ) : (
            <p className="flex-none text-sm font-bold italic text-emerald-100/80">Belum dijadwalkan</p>
          )}
        </div>

        <div className="mt-4 border-t border-white/20 pt-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-100">Paket</p>
            <p className="mt-0.5 text-sm font-bold leading-snug">{packageName}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
