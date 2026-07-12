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
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';

  const terminal = text.match(/\bTerminal\s+[A-Z0-9]+\b/i)?.[0]
    ?.replace(/^terminal/i, 'Terminal') || '';
  const namedPlace = text.match(
    /\b(?:caf[eé]|lounge|hotel|resto|restaurant|lobby)\s+.+?(?=\s+(?:gate|terminal|bandara|airport)\b|,|$)/i,
  )?.[0] || '';
  const fallbackPlace = text
    .replace(/\bGate\s+[A-Z0-9]+(?:\s+tiang\s+[A-Z0-9]+)?\b/gi, '')
    .replace(/\bTerminal\s+[A-Z0-9]+\b/gi, '')
    .replace(/\b(?:Bandara|Airport)\b.*$/i, '')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const place = (namedPlace || fallbackPlace)
    .replace(/^café(?=\s)/i, 'Café')
    .replace(/^cafe(?=\s)/i, 'Cafe')
    .replace(/^lounge\b/i, 'Lounge')
    .replace(/^hotel\b/i, 'Hotel')
    .replace(/^resto\b/i, 'Resto')
    .replace(/^restaurant\b/i, 'Restaurant')
    .replace(/^lobby\b/i, 'Lobby');

  return [place, terminal].filter(Boolean).join(', ');
}
