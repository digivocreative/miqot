import { isTerasShortCode } from '../../lib/teras-share.js';

export type TerasRoute =
  | { kind: 'share'; code: string }
  | { kind: 'profile'; slug: string };

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Split the `/teras/*` branch into its two meanings. The share link
 * (`/teras/<8-hex>`, see lib/teras-share.js) predates the profile page and is
 * already circulating in WhatsApp, so it wins whenever the segment has that
 * exact shape.
 */
export function parseTerasPath(pathname: string): TerasRoute | null {
  const segments = String(pathname || '')
    .split('/')
    .filter(Boolean);
  if (segments.length !== 2 || segments[0] !== 'teras') return null;

  let raw: string;
  try {
    raw = decodeURIComponent(segments[1]).trim().toLowerCase();
  } catch {
    return null;
  }
  if (!raw) return null;
  if (isTerasShortCode(raw)) return { kind: 'share', code: raw };
  if (!SLUG_REGEX.test(raw)) return null;
  return { kind: 'profile', slug: raw };
}

/** Path of an agent's Teras profile, e.g. "/teras/nila". */
export function terasProfilePath(slug: string): string {
  return `/teras/${String(slug || '').trim().toLowerCase()}`;
}

/**
 * True when a click on a real `<a href>` should be left to the browser's
 * native handling — Cmd/Ctrl/Shift/Alt held (open in new tab/window/background)
 * or a non-primary mouse button (e.g. middle-click) — rather than intercepted
 * for SPA navigation. Callers should bail out early on a modified click and
 * only `preventDefault`/`stopPropagation`/navigate for a plain primary click.
 */
export function isModifiedClick(event: {
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): boolean {
  return (
    (event.button != null && event.button !== 0) ||
    !!event.metaKey ||
    !!event.ctrlKey ||
    !!event.shiftKey ||
    !!event.altKey
  );
}
