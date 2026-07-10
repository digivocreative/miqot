export function formatCalendarPeople(value: string | null | undefined): string {
  const names = String(value || '')
    .split(/[•·]/)
    .map(name => name.trim())
    .filter(name => name && name !== '-');

  return [...new Set(names)].join(', ');
}

export function formatCalendarPrimaryPerson(
  value: string | null | undefined,
  maxWords = 2,
): string {
  const firstPerson = String(value || '')
    .split(/[•·]/)
    .map(name => name.trim())
    .find(name => name && name !== '-');

  if (!firstPerson) return '';
  return firstPerson.split(/\s+/).slice(0, Math.max(1, maxWords)).join(' ');
}

export function formatCalendarMeetingPoint(value: string | null | undefined): string {
  return String(value || '')
    .replace(/\bLounge\s+Palmeera\s+Gate\b/gi, 'Lounge Palmeera')
    .replace(/\s+/g, ' ')
    .trim();
}
