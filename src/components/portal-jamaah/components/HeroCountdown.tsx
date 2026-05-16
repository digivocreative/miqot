import type { PortalBooking } from '../hooks/usePortalMe';
import { daysUntilDate, formatLongDate } from '../utils/formatDate';

function airlineFromCode(code?: string | null) {
  const prefix = String(code || '').trim().slice(0, 2).toUpperCase();
  const airlines: Record<string, string> = {
    SV: 'Saudia',
    GA: 'Garuda Indonesia',
    QR: 'Qatar Airways',
    EK: 'Emirates',
    EY: 'Etihad',
    WY: 'Oman Air',
    JT: 'Lion Air',
  };
  return airlines[prefix] || null;
}

function flightLabel(code?: string | null) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized || normalized === 'TBA') return null;
  const airline = airlineFromCode(normalized);
  return airline ? `${normalized} · ${airline}` : normalized;
}

export default function HeroCountdown({
  booking,
  flightCode,
}: {
  booking: PortalBooking;
  flightCode: string;
}) {
  const daysFromApi = Number(booking.hari_ke_berangkat);
  const daysLeft = Number.isFinite(daysFromApi) ? daysFromApi : daysUntilDate(booking.tgl_berangkat) ?? 0;
  const safeDays = Math.max(0, daysLeft);
  const flight = flightLabel(flightCode);

  return (
    <section
      className="rounded-2xl p-5 text-white shadow-sm"
      style={{ background: 'linear-gradient(135deg, #064e3b 0%, #0F6E56 50%, #065f46 100%)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">Menuju Tanah Suci</p>
        <span className="flex-none rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold tracking-wide text-white backdrop-blur-sm">
          {booking.id_umroh}
        </span>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-6xl font-bold leading-none tracking-tight">{safeDays}</span>
        <span className="text-base font-semibold text-emerald-100">
          {safeDays === 0 ? 'hari keberangkatan' : 'hari lagi'}
        </span>
      </div>

      <p className="mt-2 text-sm font-medium text-emerald-100">Berangkat {formatLongDate(booking.tgl_berangkat)}</p>

      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-white/20 pt-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">Paket</p>
          <p className="mt-0.5 truncate text-sm font-bold">{booking.paket || 'Paket Umroh'}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">Penerbangan</p>
          <p className={`mt-0.5 truncate text-sm font-bold ${flight ? '' : 'italic text-emerald-200/80'}`}>
            {flight || 'Belum dijadwalkan'}
          </p>
        </div>
      </div>
    </section>
  );
}
