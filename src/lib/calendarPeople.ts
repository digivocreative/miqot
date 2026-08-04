function isCalendarPersonName(value: string): boolean {
  return value !== '-' && /[\p{L}\p{N}]/u.test(value);
}

export function formatCalendarPeople(value: string | null | undefined): string {
  const names = String(value || '')
    .split(/[•·]/)
    .map(name => name.trim())
    .filter(isCalendarPersonName);

  return [...new Set(names)].join(', ');
}

export function formatCalendarPrimaryPerson(
  value: string | null | undefined,
  maxWords = 2,
): string {
  const firstPerson = String(value || '')
    .split(/[•·]/)
    .map(name => name.trim())
    .find(isCalendarPersonName);

  if (!firstPerson) return '';
  return firstPerson.split(/\s+/).slice(0, Math.max(1, maxWords)).join(' ');
}

export function formatCalendarMeetingPoint(value: string | null | undefined): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';

  // Terminal, e.g. "Terminal 2F" / "Terminal 3".
  const terminal = text.match(/\bTerminal\s+[A-Z0-9]+\b/i)?.[0]
    ?.replace(/^terminal/i, 'Terminal') || '';

  // Named venue (café/lounge/hotel/…) up to the next gate/terminal/airport token.
  const namedPlace = text.match(
    /\b(?:caf[eé]|lounge|hotel|resto|restaurant|lobby)\s+.+?(?=\s+(?:gate|terminal|bandara|airport)\b|,|$)/i,
  )?.[0] || '';
  // Fallback: leading descriptive text before the first gate/terminal/airport token.
  const fallbackPlace = text
    .replace(/\bGate\s+[A-Z0-9]+(?:\s+tiang\s+[A-Z0-9]+)?\b/gi, '')
    .replace(/\bTerminal\s+[A-Z0-9]+\b/gi, '')
    .replace(/\b(?:Bandara|Airport)\b.*$/i, '')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Title-case the venue (keyword + name) so mixed-case sources like
  // "cafe zukavia" or "café Zukavia" all render as "Cafe Zukavia" / "Café Zukavia".
  // Only the leading letter of each word is raised, preserving codes like "13".
  const venue = (namedPlace || fallbackPlace)
    .split(' ')
    .map(word => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');

  // Venue → terminal. Gate is intentionally omitted — the named venue is the
  // meaningful gathering spot; the terminal keeps it oriented.
  return [venue, terminal].filter(Boolean).join(', ');
}
