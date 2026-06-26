import {
  RAHMAH_JULI_JAMAAH,
  RAHMAH_JULI_SLUG,
  type RahmahJuliChecklistId,
  type RahmahJuliRoomFieldId,
} from '@/lib/rahmahJuliLanding.js';

export const RAHMAH_JULI_PREP_TABLE = 'booking_persiapan';
export const RAHMAH_JULI_PREP_API = `/api/tour-leader-prep/${RAHMAH_JULI_SLUG}`;

export type RahmahJuliPrepItem = Partial<Record<RahmahJuliChecklistId, boolean>>
  & Partial<Record<RahmahJuliRoomFieldId | 'phone', string>>;
export type RahmahJuliPrepState = Record<number, RahmahJuliPrepItem>;

interface RahmahJuliPrepRow {
  jamaah_no: number;
  phone: string | null;
  wa_confirmed: boolean | null;
  nusuk_installed: boolean | null;
  raudhah_reserved: boolean | null;
  room_mekkah: string | null;
  room_madinah: string | null;
}

function sanitizeRahmahJuliRoomNumber(value: string | undefined) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 4);
  return digits || null;
}

function rowToPrepItem(row: RahmahJuliPrepRow): RahmahJuliPrepItem {
  return {
    ...(row.phone !== null ? { phone: row.phone } : {}),
    wa: !!row.wa_confirmed,
    nusuk: !!row.nusuk_installed,
    raudhah: !!row.raudhah_reserved,
    ...(row.room_mekkah ? { roomMekkah: row.room_mekkah } : {}),
    ...(row.room_madinah ? { roomMadinah: row.room_madinah } : {}),
  };
}

function prepItemToRow(jamaahNo: number, item: RahmahJuliPrepItem) {
  const member = RAHMAH_JULI_JAMAAH.find((jamaah) => jamaah.no === jamaahNo);
  if (!member) throw new Error(`Unknown jamaah number: ${jamaahNo}`);
  const hasPhone = Object.prototype.hasOwnProperty.call(item, 'phone');

  return {
    trip_slug: RAHMAH_JULI_SLUG,
    jamaah_no: member.no,
    id_umrah: member.idUmrah,
    jamaah_name: member.name,
    phone: hasPhone ? item.phone ?? '' : member.phone,
    wa_confirmed: !!item.wa,
    nusuk_installed: !!item.nusuk,
    raudhah_reserved: !!item.raudhah,
    room_mekkah: sanitizeRahmahJuliRoomNumber(item.roomMekkah),
    room_madinah: sanitizeRahmahJuliRoomNumber(item.roomMadinah),
  };
}

async function readApiJson(response: Response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Gagal menyimpan data jamaah');
  return result;
}

export async function fetchRahmahJuliPrepFromDb(): Promise<RahmahJuliPrepState> {
  const response = await fetch(RAHMAH_JULI_PREP_API, {
    headers: { Accept: 'application/json' },
  });
  const result = await readApiJson(response);
  const rows = Array.isArray(result.data) ? result.data : [];

  return rows.reduce<RahmahJuliPrepState>((acc, row: RahmahJuliPrepRow) => {
    acc[row.jamaah_no] = rowToPrepItem(row);
    return acc;
  }, {});
}

export async function saveRahmahJuliPrepToDb(jamaahNo: number, item: RahmahJuliPrepItem) {
  const response = await fetch(`${RAHMAH_JULI_PREP_API}/${jamaahNo}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(prepItemToRow(jamaahNo, item)),
  });
  await readApiJson(response);
}
