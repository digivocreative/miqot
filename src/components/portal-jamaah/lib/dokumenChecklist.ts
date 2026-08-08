import type { PortalJamaah } from '../hooks/usePortalMe';

/**
 * SATU sumber kebenaran status dokumen wajib per jamaah.
 * Dipakai DokumenPage (checklist detail) dan portalActions (deteksi dokumen
 * kurang) agar status yang tampil di dua tempat tidak pernah berbeda.
 */
export type DocStatus = 'lengkap' | 'diproses' | 'belum';

export interface DocSpec {
  key: string;
  label: string;
  matchKeys: string[];
}

export const DOKUMEN_WAJIB: DocSpec[] = [
  { key: 'paspor', label: 'Paspor', matchKeys: ['paspor', 'passport'] },
  { key: 'ktp', label: 'KTP', matchKeys: ['ktp'] },
  { key: 'vaksin', label: 'Vaksin Meningitis', matchKeys: ['vaksin', 'vaksin_meningitis', 'meningitis', 'icv'] },
  { key: 'foto_46', label: 'Foto 4x6 latar putih', matchKeys: ['foto_46', 'foto_4x6', 'foto', 'pas_foto'] },
  { key: 'buku_nikah', label: 'Buku Nikah', matchKeys: ['buku_nikah', 'nikah', 'buku nikah'] },
];

const READY_STATUSES = new Set(['lengkap', 'verified', 'uploaded', 'checked', 'diambil', 'ready', 'selesai']);
const PROCESSING_STATUSES = new Set(['diproses', 'proses', 'processing', 'pending', 'menunggu_verifikasi', 'dikirim']);
const MISSING_STATUSES = new Set(['belum', 'belum_siap', 'missing', 'false', '0']);

function normalizeDocKey(value: string) {
  return value.trim().toLocaleLowerCase('id-ID').replace(/[\s-]+/g, '_');
}

export function docValueStatus(value: unknown): DocStatus {
  if (value === true || value === 1) return 'lengkap';
  if (value === false || value === 0 || value === null || value === undefined) return 'belum';

  if (typeof value === 'string') {
    const normalized = normalizeDocKey(value);
    if (!normalized || MISSING_STATUSES.has(normalized)) return 'belum';
    if (PROCESSING_STATUSES.has(normalized)) return 'diproses';
    if (READY_STATUSES.has(normalized)) return 'lengkap';
    // A non-empty filename or URL is treated as an uploaded document.
    return 'lengkap';
  }

  if (typeof value === 'object') {
    const entry = value as Record<string, unknown>;
    if (entry.verified === true || entry.uploaded === true || entry.checked === true || entry.ready === true) {
      return 'lengkap';
    }
    if (entry.processing === true || entry.diproses === true || entry.pending === true) return 'diproses';
    if (entry.status !== undefined) return docValueStatus(entry.status);
    if (entry.url || entry.file || entry.path || entry.filename) return 'lengkap';
  }

  return 'belum';
}

export function docStatus(jamaah: PortalJamaah | undefined, spec: DocSpec): DocStatus {
  if (!jamaah) return 'belum';
  if (spec.key === 'paspor' && String(jamaah.no_paspor || '').trim()) return 'lengkap';

  const aliases = new Set(spec.matchKeys.map(normalizeDocKey));
  let bestStatus: DocStatus = 'belum';
  for (const [rawKey, value] of Object.entries(jamaah.dokumen || {})) {
    const key = normalizeDocKey(rawKey);
    if (!aliases.has(key)) continue;
    const status = docValueStatus(value);
    if (status === 'lengkap') return 'lengkap';
    if (status === 'diproses') bestStatus = 'diproses';
  }
  return bestStatus;
}

export function countCompletedDocs(jamaah: PortalJamaah | undefined): { completed: number; total: number } {
  const total = DOKUMEN_WAJIB.length;
  if (!jamaah) return { completed: 0, total };
  const completed = DOKUMEN_WAJIB.filter((spec) => docStatus(jamaah, spec) === 'lengkap').length;
  return { completed, total };
}
