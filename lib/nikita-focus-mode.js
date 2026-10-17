// Mode khusus akun nikita (demo Alhijaz.co), 17–21 Okt 2026 WIB. Satu sumber
// jendela waktu untuk klien (src/lib/nikitaFocusMode.ts) dan server
// (penerbangan dummy di /api/flights/status).

export const NIKITA_FOCUS_SLUG = 'nikita';
export const NIKITA_FOCUS_START = Date.parse('2026-10-17T00:00:00+07:00');
export const NIKITA_FOCUS_END = Date.parse('2026-10-22T00:00:00+07:00');

export function isNikitaSlug(slug) {
  return String(slug || '').toLowerCase() === NIKITA_FOCUS_SLUG;
}

export function isNikitaFocusModeActive(slug, now = Date.now()) {
  return isNikitaSlug(slug) && now >= NIKITA_FOCUS_START && now < NIKITA_FOCUS_END;
}
