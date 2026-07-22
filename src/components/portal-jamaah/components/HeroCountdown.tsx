import type { PortalBooking } from '../hooks/usePortalMe';
import { daysUntilDate, formatLongDate } from '../utils/formatDate';
import { InvertedPanel, GradientText } from '../ui';

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
    <InvertedPanel glow texture className="p-4">
      <svg
        aria-hidden="true"
        viewBox="0 0 420 420"
        className="pointer-events-none absolute inset-0 h-full w-full text-gold opacity-[0.12]"
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

      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {greetingName && (
              <>
                <p className="text-[11px] font-semibold text-gold-100">Assalamualaikum,</p>
                <h1 className="truncate font-display text-base leading-tight text-white">{greetingName}</h1>
              </>
            )}
          </div>
          <span className="flex-none rounded-full border border-white/15 bg-white/15 px-2.5 py-1 font-mono text-[10px] font-bold tracking-wide text-white shadow-sm backdrop-blur-sm">
            {booking.id_umroh}
          </span>
        </div>

        <div className="mt-3 flex items-end justify-between gap-3 border-t border-white/15 pt-3">
          <div className="flex-none">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-gold-100">Berangkat</p>
            <div className="mt-1 flex items-end gap-1.5">
              <GradientText tone="gold" className="font-display text-[34px] leading-none tracking-tight">
                {safeDays}
              </GradientText>
              <span className="pb-0.5 text-[13px] font-semibold text-gold-100">
                {safeDays === 0 ? 'hari keberangkatan' : 'hari lagi'}
              </span>
            </div>
          </div>
          <div className="min-w-0 rounded-xl border border-white/10 bg-white/10 px-2.5 py-2 text-right backdrop-blur-sm">
            <p className="text-[9px] font-bold uppercase tracking-wider text-gold-100">Tanggal</p>
            <p className="mt-0.5 font-mono text-[11px] font-semibold leading-snug tabular-nums text-white">
              {formatLongDate(booking.tgl_berangkat)}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/15 pt-3">
          <div className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-2.5 py-2 backdrop-blur-sm">
            {flightCodeText && airline && (
              <span className="relative flex h-7 w-7 flex-none items-center justify-center overflow-hidden rounded-full bg-white p-1 text-[8px] font-bold text-burgundy-700 shadow-sm">
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
            )}
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-wider text-gold-100">Penerbangan</p>
              <p className="mt-0.5 truncate font-mono text-xs font-bold tabular-nums text-white">
                {flightCodeText || 'Belum dijadwalkan'}
              </p>
            </div>
          </div>
          <div className="min-w-0 rounded-xl border border-white/10 bg-white/10 px-2.5 py-2 backdrop-blur-sm">
            <p className="text-[9px] font-bold uppercase tracking-wider text-gold-100">Paket</p>
            <p className="mt-0.5 line-clamp-2 text-[11px] font-bold leading-snug text-white">{packageName}</p>
          </div>
        </div>
      </div>
    </InvertedPanel>
  );
}
