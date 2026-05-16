const TIME_ZONE = 'Asia/Jakarta';

export function parsePortalDate(value?: string | null): Date | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+07:00` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatLongDate(value?: string | null): string {
  const date = parsePortalDate(value);
  if (!date) return 'Tanggal menyusul';
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TIME_ZONE,
  }).format(date);
}

export function formatShortDate(value?: string | null): string {
  const date = parsePortalDate(value);
  if (!date) return 'Tanggal menyusul';
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    timeZone: TIME_ZONE,
  }).format(date);
}

export function formatPortalTime(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return 'Jam menyusul';
  if (/WIB$/i.test(raw)) return raw;
  return `${raw} WIB`;
}

function startOfJakartaDay(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || '1970';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  return new Date(`${year}-${month}-${day}T00:00:00+07:00`).getTime();
}

export function daysUntilDate(value?: string | null): number | null {
  const date = parsePortalDate(value);
  if (!date) return null;
  const diff = startOfJakartaDay(date) - startOfJakartaDay(new Date());
  return Math.ceil(diff / 86_400_000);
}

export function addDays(value: string | null | undefined, days: number): string | null {
  const date = parsePortalDate(value);
  if (!date) return null;
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function tripDurationDays(start?: string | null, end?: string | null): number | null {
  const from = parsePortalDate(start);
  const to = parsePortalDate(end);
  if (!from || !to) return null;
  const diff = startOfJakartaDay(to) - startOfJakartaDay(from);
  return Math.max(1, Math.round(diff / 86_400_000) + 1);
}
