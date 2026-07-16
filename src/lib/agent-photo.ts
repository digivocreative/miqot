// Shared <img onError> handler for agent / profile photos.
//
// Without this, a single transient failure (an HTTP/3 hiccup on mobile, a slow
// network, a brief 5xx, or one stale `no-cache` fetch) permanently swaps the photo
// to an initials avatar until the page is reloaded — the "foto tiba-tiba jadi
// inisial" symptom. We retry the original source a couple of times (with backoff +
// cache-bust) before giving up and falling back to an initials avatar.

const MAX_RETRY = 2;

export function handleAgentPhotoError(
  img: HTMLImageElement,
  name: string | null | undefined,
  size?: number,
  // Fallback kustom setelah retry habis (mis. inisial bergaya desain di kartu
  // nama); tanpa ini fallback default adalah ui-avatars.
  onFallback?: () => void,
): void {
  // Already fell back — never loop on the ui-avatars URL itself.
  if (img.dataset.fellBack === '1') return;

  const tries = Number(img.dataset.retry || 0);
  if (tries < MAX_RETRY) {
    // Capture the canonical source on the first failure (strip any prior _r= buster).
    if (!img.dataset.origSrc) {
      img.dataset.origSrc = img.src
        .replace(/([?&])_r=\d+(?=&|$)/, '$1')
        .replace(/[?&]$/, '');
    }
    const orig = img.dataset.origSrc;
    if (orig) {
      img.dataset.retry = String(tries + 1);
      const sep = orig.includes('?') ? '&' : '?';
      const next = `${orig}${sep}_r=${tries + 1}`;
      // Small backoff, then re-request. The cache-bust forces the browser/SW to
      // actually hit the network instead of replaying the failed response.
      window.setTimeout(() => {
        if (img.dataset.fellBack !== '1') img.src = next;
      }, 350 * (tries + 1));
      return;
    }
  }

  img.dataset.fellBack = '1';
  if (onFallback) {
    onFallback();
    return;
  }
  const sizeParam = size ? `&size=${size}` : '';
  img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name || 'Agent',
  )}&background=random${sizeParam}`;
}
