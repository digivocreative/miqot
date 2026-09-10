import {
  KLOTER45_JAMAAH,
  KLOTER45_SLUG,
  type Kloter45ChecklistId,
} from '@/lib/kloter45Landing.js';

export const KLOTER45_PREP_TABLE = 'booking_persiapan';
export const KLOTER45_PREP_API = `/api/tour-leader-prep/${KLOTER45_SLUG}`;

export type Kloter45ZamzamMethod = 'pickup' | 'delivery';
export type Kloter45PrepItem = Partial<Record<Kloter45ChecklistId, boolean>>
  & Partial<Record<
    'phone' | 'zamzamRecipientName' | 'zamzamRecipientPhone' | 'zamzamAddress',
    string
  >>
  & { zamzamMethod?: Kloter45ZamzamMethod };
export type Kloter45PrepState = Record<number, Kloter45PrepItem>;

interface Kloter45PrepRow {
  jamaah_no: number;
  phone: string | null;
  wa_confirmed: boolean | null;
  nusuk_installed: boolean | null;
  raudhah_reserved: boolean | null;
  zamzam_method: Kloter45ZamzamMethod | null;
  zamzam_recipient_name: string | null;
  zamzam_recipient_phone: string | null;
  zamzam_address: string | null;
}

function rowToPrepItem(row: Kloter45PrepRow): Kloter45PrepItem {
  return {
    ...(row.phone !== null ? { phone: row.phone } : {}),
    wa: !!row.wa_confirmed,
    nusuk: !!row.nusuk_installed,
    raudhah: !!row.raudhah_reserved,
    ...(row.zamzam_method ? { zamzamMethod: row.zamzam_method } : {}),
    ...(row.zamzam_recipient_name ? { zamzamRecipientName: row.zamzam_recipient_name } : {}),
    ...(row.zamzam_recipient_phone ? { zamzamRecipientPhone: row.zamzam_recipient_phone } : {}),
    ...(row.zamzam_address ? { zamzamAddress: row.zamzam_address } : {}),
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
    raudhah_reserved: !!item.raudhah,
    zamzam_method: item.zamzamMethod ?? null,
    zamzam_recipient_name: item.zamzamRecipientName?.trim() || null,
    zamzam_recipient_phone: item.zamzamRecipientPhone?.trim() || null,
    zamzam_address: item.zamzamAddress?.trim() || null,
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
