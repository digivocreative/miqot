import {
  KLOTER45_JAMAAH,
  KLOTER45_SLUG,
  type Kloter45ChecklistId,
} from '@/lib/kloter45Landing.js';

export const KLOTER45_PREP_TABLE = 'booking_persiapan';
export const KLOTER45_PREP_API = `/api/tour-leader-prep/${KLOTER45_SLUG}`;

export type Kloter45PrepItem = Partial<Record<Kloter45ChecklistId, boolean>>
  & { phone?: string };
export type Kloter45PrepState = Record<number, Kloter45PrepItem>;

interface Kloter45PrepRow {
  jamaah_no: number;
  phone: string | null;
  wa_confirmed: boolean | null;
  nusuk_installed: boolean | null;
}

function rowToPrepItem(row: Kloter45PrepRow): Kloter45PrepItem {
  return {
    ...(row.phone !== null ? { phone: row.phone } : {}),
    wa: !!row.wa_confirmed,
    nusuk: !!row.nusuk_installed,
  };
}

function prepItemToRow(jamaahNo: number, item: Kloter45PrepItem) {
  const member = KLOTER45_JAMAAH.find((jamaah) => jamaah.no === jamaahNo);
  if (!member) throw new Error(`Unknown jamaah number: ${jamaahNo}`);
  const hasPhone = Object.prototype.hasOwnProperty.call(item, 'phone');

  return {
    trip_slug: KLOTER45_SLUG,
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

export async function fetchKloter45PrepFromDb(): Promise<Kloter45PrepState> {
  const response = await fetch(KLOTER45_PREP_API, {
    headers: { Accept: 'application/json' },
  });
  const result = await readApiJson(response);
  const rows = Array.isArray(result.data) ? result.data : [];

  return rows.reduce<Kloter45PrepState>((acc, row: Kloter45PrepRow) => {
    acc[row.jamaah_no] = rowToPrepItem(row);
    return acc;
  }, {});
}

export async function saveKloter45PrepToDb(jamaahNo: number, item: Kloter45PrepItem) {
  const response = await fetch(`${KLOTER45_PREP_API}/${jamaahNo}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(prepItemToRow(jamaahNo, item)),
  });
  await readApiJson(response);
}
