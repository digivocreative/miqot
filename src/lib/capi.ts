/**
 * Meta Conversion API (CAPI) — Frontend Utility
 * 
 * Helper functions for triggering CAPI events from the client.
 * All actual API calls to Meta are done server-side to protect access tokens.
 */

// ── Types ──

export type CapiEventKey = 'pageView' | 'search' | 'viewContent' | 'contact';

// ── Cookie Helpers ──

/** Read _fbc and _fbp cookies set by Meta Pixel */
export function getMetaCookies(): { fbc: string; fbp: string } {
  const cookies = document.cookie.split(';').reduce((acc, c) => {
    const [key, ...val] = c.trim().split('=');
    acc[key] = val.join('=');
    return acc;
  }, {} as Record<string, string>);

  return {
    fbc: cookies['_fbc'] || '',
    fbp: cookies['_fbp'] || '',
  };
}

// ── Event ID Generator ──

/** Generate a unique event ID for deduplication with browser pixel */
export function generateEventId(eventName: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  return `${eventName}-${ts}-${rand}`;
}

// ── Send CAPI Event ──

/**
 * Fire-and-forget: send a CAPI event to the server endpoint.
 * Never blocks UI and swallows errors silently (logs to console only).
 */
export function sendCapiEvent(
  slug: string,
  eventKey: CapiEventKey,
  sourceUrl?: string
): void {
  try {
    const { fbc, fbp } = getMetaCookies();
    const eventId = generateEventId(eventKey);

    const body = {
      eventKey,
      eventId,
      sourceUrl: sourceUrl || window.location.href,
      userAgent: navigator.userAgent,
      fbc,
      fbp,
      timestamp: Math.floor(Date.now() / 1000),
    };

    console.log(`[CAPI] 🔵 ${eventKey}`, { slug, sourceUrl: body.sourceUrl });

    // Use sendBeacon for reliability on page unload, fallback to fetch
    const url = `/api/capi/${slug}/event`;
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, blob);
    } else {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('[CAPI] Failed to send event:', err);
  }
}
