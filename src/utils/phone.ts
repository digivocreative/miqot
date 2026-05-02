/**
 * WhatsApp / Indonesian phone number helpers.
 *
 * Legacy data often arrives malformed — most commonly the leading "8" of an
 * Indonesian mobile prefix is missing (e.g. "0812xxxx" stored as "0212xxxx",
 * which then becomes "62212xxxx" once converted to international form).
 *
 * `normalizeWaNumber` returns a canonical `628...` international form (no `+`,
 * no separators) suitable for `https://wa.me/` links, or `null` if the input
 * cannot be repaired into a plausible Indonesian mobile number.
 *
 * `formatWaDisplay` re-renders a canonical `628...` value back into a friendly
 * local format like `0812 8959 8476` for UI display.
 */

export function normalizeWaNumber(wa?: string | null): string | null {
  const raw = String(wa || '').trim();
  if (!raw) return null;

  // Pull the first plausible phone-shaped substring out of free-form input
  const candidate = raw.match(/(?:\+?62|0|8)[\d\s().-]{7,24}/)?.[0] || raw;
  let cleaned = candidate.replace(/[^0-9]/g, '');
  if (!cleaned) return null;

  // Already a valid international mobile — return as-is. Without this short-
  // circuit, the `^62[^8]` repair below would mis-treat "628..." as malformed
  // because the `[^8]` slot would match anything other than literal `8`.
  if (/^628\d{7,12}$/.test(cleaned)) return cleaned;

  // Repair common bad imports:
  // - 620812xxxx     → 62812xxxx     (extra "0" between country code & mobile)
  // - 6212xxxx       → 62812xxxx     (lost the "8" from 08xx — most common)
  // - 0812xxxx       → 62812xxxx     (local format)
  // - 812xxxx        → 62812xxxx     (no leading 0)
  if (cleaned.startsWith('620')) cleaned = '62' + cleaned.slice(3);
  else if (/^62[^8]\d{7,11}$/.test(cleaned)) cleaned = '628' + cleaned.slice(2);
  else if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
  else if (cleaned.startsWith('8')) cleaned = '62' + cleaned;

  // Final sanity check: must be a plausible Indonesian mobile in international form.
  if (!/^628\d{7,12}$/.test(cleaned)) return null;
  return cleaned;
}

export function formatWaDisplay(phoneE164: string): string {
  const local = phoneE164.startsWith('62') ? `0${phoneE164.slice(2)}` : phoneE164;
  return local.replace(/^(\d{4})(\d{4})(\d+)$/, '$1 $2 $3');
}
