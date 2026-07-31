/**
 * Arah perjalanan sebuah kartu penerbangan: berangkat ke Tanah Suci, atau pulang.
 *
 * Sumber kebenarannya adalah `event_type` kalender ('keberangkatan'/'kepulangan')
 * yang dikirim server sebagai field `direction`. Kode bandara hanya dipakai
 * sebagai cadangan untuk payload yang memang tidak membawa arah (halaman share),
 * atau sebelum server terbaru ter-deploy.
 */

export type FlightDirection = 'pergi' | 'pulang';

/** Bandara pemulangan jamaah. Tambahkan di sini bila nanti ada rute pulang lain. */
export const HOME_IATA = new Set(['CGK']);

interface FlightDirectionInput {
  direction?: string | null;
  arrCode?: string | null;
  segments?: ({ arrCode?: string | null } | null | undefined)[] | null;
}

/** Kode bandara tujuan AKHIR — untuk multi-leg, segmen aktif bukan tujuan akhir. */
function finalArrivalCode(input: FlightDirectionInput): string {
  const segments = Array.isArray(input.segments) ? input.segments : [];
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const code = String(segments[i]?.arrCode || '').trim();
    if (code) return code.toUpperCase();
  }
  return String(input.arrCode || '').trim().toUpperCase();
}

export function isReturnFlight(input?: FlightDirectionInput | null): boolean {
  if (!input) return false;

  const direction = String(input.direction || '').trim().toLowerCase();
  if (direction === 'pulang' || direction === 'kepulangan') return true;
  if (direction === 'pergi' || direction === 'keberangkatan') return false;

  return HOME_IATA.has(finalArrivalCode(input));
}
