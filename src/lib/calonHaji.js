// Helper murni halaman "Calon Haji 2027" (src/components/CalonHajiPage.tsx):
// format tampilan, pemetaan JKN, cari & filter di klien. Baris = CalonHajiRow
// (lib/calon-haji-parser.d.ts), nilai mentah kapital dari PDF kantor.

/** @type {{ provinsi: string|null, kabKota: string|null, jkn: 'semua'|'aktif'|'belum_aktif'|'tidak_ada' }} */
export const EMPTY_FILTERS = Object.freeze({ provinsi: null, kabKota: null, jkn: 'semua' });

const KEEP_UPPER = new Set(['DKI', 'D.I.']);

function titleCase(raw) {
  return String(raw || '')
    .split(' ')
    .filter(Boolean)
    .map((w) => (KEEP_UPPER.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(' ');
}

export function formatKabKota(raw) {
  return titleCase(String(raw || '').replace(/^KOTA /, ''));
}

export function formatProvinsi(raw) {
  return titleCase(raw);
}

/** Kab/kota apa adanya (dengan "Kota"), untuk panel detail. */
export function formatKabKotaLengkap(raw) {
  return titleCase(raw);
}

export function jknBucket(raw) {
  if (raw === 'AKTIF') return 'aktif';
  if (raw === 'TERDAFTAR, BELUM AKTIF') return 'belum_aktif';
  return 'tidak_ada';
}

export function isBerhakLunas(row) {
  return row.status_cadangan === 'NON CADANGAN';
}

export function isLunas(row) {
  return row.status_jemaah === 'LUNAS';
}

/** Label status baris tabel: Berhak Lunas yang sudah LUNAS cukup lencana LUNAS. */
export function rowStatus(row) {
  const lunas = isLunas(row);
  if (isBerhakLunas(row)) return { label: lunas ? null : 'Berhak Lunas', lunas };
  return { label: 'Cadangan', lunas };
}

export function countByTab(rows) {
  const berhak = rows.filter(isBerhakLunas).length;
  return { semua: rows.length, berhak, cadangan: rows.length - berhak };
}

function matchesQuery(row, needle) {
  if (!needle) return true;
  // NIK/porsi sering diketik berkelompok ("3671 0526 …") — buang pemisahnya.
  if (/^[\d\s.-]+$/.test(needle)) {
    const digits = needle.replace(/\D/g, '');
    return digits !== '' && (row.no_porsi.includes(digits) || row.nik.includes(digits));
  }
  return row.nama.includes(needle);
}

export function filterCalonHaji(rows, { tab, query, filters }) {
  const needle = String(query || '').trim().replace(/\s+/g, ' ').toUpperCase();
  return rows.filter((row) => {
    if (tab === 'berhak' && !isBerhakLunas(row)) return false;
    if (tab === 'cadangan' && isBerhakLunas(row)) return false;
    if (filters.provinsi && row.provinsi !== filters.provinsi) return false;
    if (filters.kabKota && row.kab_kota !== filters.kabKota) return false;
    if (filters.jkn !== 'semua' && jknBucket(row.kepesertaan_jkn) !== filters.jkn) return false;
    return matchesQuery(row, needle);
  });
}

const uniqSorted = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b));

export function provinsiOptions(rows) {
  return uniqSorted(rows.map((r) => r.provinsi));
}

export function kabKotaOptions(rows, provinsi) {
  return uniqSorted(rows.filter((r) => !provinsi || r.provinsi === provinsi).map((r) => r.kab_kota));
}

export function withProvinsi(filters, provinsi, rows) {
  const keep = filters.kabKota && kabKotaOptions(rows, provinsi).includes(filters.kabKota);
  return { ...filters, provinsi, kabKota: keep ? filters.kabKota : null };
}

export function activeFilterCount(filters) {
  return (filters.provinsi ? 1 : 0) + (filters.kabKota ? 1 : 0) + (filters.jkn !== 'semua' ? 1 : 0);
}
