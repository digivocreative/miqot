import type { KloterChecklistId, KloterTrip } from '@/lib/kloterLanding.js';

export const KLOTER_PREP_TABLE = 'booking_persiapan';
export const KLOTER_PREP_API_BASE = '/api/tour-leader-prep';
export const getKloterPrepApi = (trip: KloterTrip) => `${KLOTER_PREP_API_BASE}/${trip.slug}`;

export type KloterPrepItem = Partial<Record<KloterChecklistId, boolean>>
  & { phone?: string };
export type KloterPrepState = Record<number, KloterPrepItem>;

interface KloterPrepRow {
  jamaah_no: number;
  phone: string | null;
  wa_confirmed: boolean | null;
  nusuk_installed: boolean | null;
}

function rowToPrepItem(row: KloterPrepRow): KloterPrepItem {
  return {
    ...(row.phone !== null ? { phone: row.phone } : {}),
    wa: !!row.wa_confirmed,
    nusuk: !!row.nusuk_installed,
  };
}

function prepItemToRow(trip: KloterTrip, jamaahNo: number, item: KloterPrepItem) {
  const member = trip.jamaah.find((jamaah) => jamaah.no === jamaahNo);
  if (!member) throw new Error(`Unknown jamaah number: ${jamaahNo}`);
  const hasPhone = Object.prototype.hasOwnProperty.call(item, 'phone');

  return {
    trip_slug: trip.slug,
    jamaah_no: member.no,
    id_umrah: member.idUmrah,
    jamaah_name: member.name,
    phone: hasPhone ? item.phone ?? '' : member.phone,
    wa_confirmed: !!item.wa,
    nusuk_installed: !!item.nusuk,
  };
}

async function readApiJson(response: Response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Gagal menyimpan data jamaah');
  return result;
}

export async function fetchKloterPrepFromDb(trip: KloterTrip): Promise<KloterPrepState> {
  const response = await fetch(getKloterPrepApi(trip), {
    headers: { Accept: 'application/json' },
  });
  const result = await readApiJson(response);
  const rows = Array.isArray(result.data) ? result.data : [];

  return rows.reduce<KloterPrepState>((acc, row: KloterPrepRow) => {
    acc[row.jamaah_no] = rowToPrepItem(row);
    return acc;
  }, {});
}

export async function saveKloterPrepToDb(trip: KloterTrip, jamaahNo: number, item: KloterPrepItem) {
  const response = await fetch(`${getKloterPrepApi(trip)}/${jamaahNo}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(prepItemToRow(trip, jamaahNo, item)),
  });
  await readApiJson(response);
}
