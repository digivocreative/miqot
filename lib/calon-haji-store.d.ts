import type { CalonHajiHeader, CalonHajiRow } from './calon-haji-parser';

export const CALON_HAJI_COLUMNS: string;

export function replaceCalonHaji(
  sb: unknown,
  input: { musim: number; header: CalonHajiHeader; rows: CalonHajiRow[]; sumber: string },
): Promise<{ importId: string; replacedImportId: string | null }>;

export function loadCalonHaji(sb: unknown, musim: number): Promise<{ rows: CalonHajiRow[] }>;
export interface HajiPersonal {
  id_haji: string;
  id_jamaah: string;
  nomor_porsi: string | null;
  nomor_spph: string | null;
  telp: string | null;
  staff: string | null;
  paket: string | null;
  paket_detail: string | null;
  paket_harga: number | string | null;
  bayar: number | string | null;
  sisa: number | string | null;
  tgl_daftar: string | null;
  no_paspor: string | null;
  bpih_url: string | null;
  surat_pernyataan_url: string | null;
}
export function loadAgentCalonHaji(sb: unknown, musim: number, agentId: string): Promise<{ rows: (CalonHajiRow & { haji: HajiPersonal[] })[] }>;
