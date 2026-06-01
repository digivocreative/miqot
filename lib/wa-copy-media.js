// Authoritative WA Copy media validation + path helpers. Pure functions, no I/O.
// Imported by server.js for the /api/admin/wa-copy/media route. The frontend keeps
// a mirror in src/components/wa-copy/lib/media.ts, kept in sync by a parity test.

export const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp'];
export const DOC_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
];
export const ALLOWED_MIME = [...IMAGE_MIME, ...DOC_MIME];

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6 MB
export const MAX_DOC_BYTES = 10 * 1024 * 1024;  // 10 MB

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

export function kindFromMime(mime) {
  return IMAGE_MIME.includes(mime) ? 'image' : 'file';
}

export function extFromMime(mime) {
  return EXT_BY_MIME[mime] || 'bin';
}

// Returns an Indonesian error string, or null when valid. `size` is the decoded byte length.
export function validateMedia({ mime, size }) {
  if (!ALLOWED_MIME.includes(mime)) {
    return 'Format tidak didukung. Gunakan gambar (JPG/PNG/WebP) atau dokumen (PDF/Word/Excel).';
  }
  if (!Number.isFinite(size) || size <= 0) {
    return 'Berkas kosong atau tidak terbaca.';
  }
  const cap = kindFromMime(mime) === 'image' ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
  if (size > cap) {
    return `Ukuran maksimal ${Math.round(cap / (1024 * 1024))}MB.`;
  }
  return null;
}

// Slugify a filename base (extension dropped) into a safe Bunny path segment.
export function safeBaseName(name) {
  const base = String(name || '').replace(/\.[^.]+$/, '');
  const slug = base
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'media';
}
