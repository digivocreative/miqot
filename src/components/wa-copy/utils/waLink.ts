import { normalizeWaNumber } from '@/utils/phone';
import { isTouchPrimary } from '@/utils/share';

/**
 * Copy text to the clipboard with a textarea+execCommand fallback for
 * insecure contexts / older Safari. Returns true on success.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
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
