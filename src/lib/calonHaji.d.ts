/**
 * Deklarasi tipe untuk src/lib/calonHaji.js — helper halaman "Calon Haji 2027".
 */
import type { CalonHajiRow } from '../../lib/calon-haji-parser';

export type { CalonHajiRow };
export type CalonHajiTab = 'semua' | 'berhak' | 'cadangan';
export type JknFilter = 'semua' | 'aktif' | 'belum_aktif' | 'tidak_ada';
export interface CalonHajiFilters {
  provinsi: string | null;
  kabKota: string | null;
  jkn: JknFilter;
}

export const EMPTY_FILTERS: Readonly<CalonHajiFilters>;
export function formatKabKota(raw: string): string;
export function formatKabKotaLengkap(raw: string): string;
export function formatProvinsi(raw: string): string;
export function jknBucket(raw: string | null): Exclude<JknFilter, 'semua'>;
export function isBerhakLunas(row: CalonHajiRow): boolean;
export function isLunas(row: CalonHajiRow): boolean;
export function rowStatus(row: CalonHajiRow): { label: 'Berhak Lunas' | 'Cadangan' | null; lunas: boolean };
export function countByTab(rows: CalonHajiRow[]): { semua: number; berhak: number; cadangan: number };
export function filterCalonHaji(
  rows: CalonHajiRow[],
  opts: { tab: CalonHajiTab; query: string; filters: CalonHajiFilters },
): CalonHajiRow[];
export function provinsiOptions(rows: CalonHajiRow[]): string[];
export function kabKotaOptions(rows: CalonHajiRow[], provinsi: string | null): string[];
export function withProvinsi(filters: CalonHajiFilters, provinsi: string | null, rows: CalonHajiRow[]): CalonHajiFilters;
export function activeFilterCount(filters: CalonHajiFilters): number;
