import { normalizeWaNumber } from './phone';

// Detect coarse pointer (touch-primary device): phones, tablets.
// Desktop with mouse → false, even on Chrome where navigator.share exists.
export function isTouchPrimary(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

// True only when native share with files is genuinely usable on this device.
// On desktop browsers we always prefer plain download.
export function canShareFiles(files: File[]): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return false;
  if (!isTouchPrimary()) return false;
  try {
    return navigator.canShare({ files });
  } catch {
    return false;
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Build a wa.me deep link. With a (normalizable) phone -> targeted chat;
 * otherwise -> broadcast share sheet (recipient chosen in WhatsApp).
 */
export function buildWaLink(text: string, phone?: string | null): string {
  const encoded = encodeURIComponent(text);
  const normalized = phone ? normalizeWaNumber(phone) : null;
  return normalized
    ? `https://wa.me/${normalized}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

/**
 * Share caption text: native share sheet on touch devices (so jamaah can be
 * picked from WhatsApp), falling back to opening wa.me on desktop.
 */
export async function shareCaption(text: string, phone?: string | null): Promise<void> {
  if (isTouchPrimary() && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return;
    } catch {
      /* user cancelled — fall through to wa.me */
    }
  }
  window.open(buildWaLink(text, phone), '_blank', 'noopener,noreferrer');
}

/**
 * Penanda yang ikut tersalin di depan URL saat agent menekan tombol "Link".
 *
 * Bukan hiasan: pesan WhatsApp yang isinya HANYA sebuah URL ditampilkan sebagai
 * kartu preview saja, jadi alamatnya sendiri tak terbaca penerima — dan pesannya
 * tampak kosong begitu preview-nya gagal dimuat. Sebaris teks di depan link
 * membuat pesan itu selalu punya isi.
 */
export const SHARE_LINK_COPY_PREFIX = '👉 ';

/** Teks yang benar-benar masuk clipboard untuk sebuah link share. */
export function shareLinkCopyText(url: string): string {
  return `${SHARE_LINK_COPY_PREFIX}${url}`;
}
