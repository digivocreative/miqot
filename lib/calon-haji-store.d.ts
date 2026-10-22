import type { CalonHajiHeader, CalonHajiRow } from './calon-haji-parser';

export const CALON_HAJI_COLUMNS: string;

export function replaceCalonHaji(
  sb: unknown,
  input: { musim: number; header: CalonHajiHeader; rows: CalonHajiRow[]; sumber: string },
): Promise<{ importId: string; replacedImportId: string | null }>;

export function loadCalonHaji(sb: unknown, musim: number): Promise<{ rows: CalonHajiRow[] }>;
