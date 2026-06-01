import type { MediaAttachment } from './types';

export const MEDIA_UPLOAD_URL = '/api/admin/wa-copy/media';

// Keep in sync with lib/wa-copy-media.js (guarded by tests/wa-copy-media-wiring.test.js).
export const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp'];
export const DOC_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
export const ALLOWED_MIME = [...IMAGE_MIME, ...DOC_MIME];
export const ACCEPT_ATTR = [...ALLOWED_MIME, '.docx', '.xlsx'].join(',');

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

export function kindFromMime(mime: string): MediaAttachment['kind'] {
  return IMAGE_MIME.includes(mime) ? 'image' : 'file';
}

export function validateMediaFile(file: File): string | null {
  if (!ALLOWED_MIME.includes(file.type)) {
    return 'Format tidak didukung. Gunakan gambar (JPG/PNG/WebP) atau dokumen (PDF/Word/Excel).';
  }
  const cap = kindFromMime(file.type) === 'image' ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
  if (file.size > cap) {
    return `Ukuran maksimal ${Math.round(cap / (1024 * 1024))}MB.`;
  }
  return null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
