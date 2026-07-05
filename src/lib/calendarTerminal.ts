export type CalendarTerminalTab = 'keberangkatan' | 'kepulangan' | 'manasik';

export interface CalendarTerminalDetail {
  titik_kumpul?: string | null;
  departure_airport_code?: string | null;
  departure_terminal?: string | null;
  arrival_airport_code?: string | null;
  arrival_terminal?: string | null;
}

export function formatTerminal(value: string | null | undefined): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^terminal\b/i.test(text)) return text.replace(/^terminal/i, 'Terminal');
  const short = text.match(/^t\s*(.+)$/i);
  if (short) return `Terminal ${short[1].trim()}`;
  return `Terminal ${text}`;
}

function locationAlreadyMentionsTerminal(location: string | null | undefined, terminal: string | null | undefined): boolean {
  const text = String(location || '').toLowerCase();
  const raw = String(terminal || '').trim().toLowerCase();
  if (!text || !raw) return false;
  const normalized = raw
    .replace(/^terminal\s*/i, '')
    .replace(/^t\s*/i, '')
    .trim();
  if (!normalized) return false;
  return text.includes(`terminal ${normalized}`) || text.includes(`terminal${normalized}`);
}

export function airportTerminalLabel(detail: CalendarTerminalDetail, tab: CalendarTerminalTab): string | null {
  if (tab === 'kepulangan') {
    const arrival = formatTerminal(detail.arrival_terminal);
    if (arrival) {
      return [arrival, detail.arrival_airport_code].filter(Boolean).join(' ');
    }
    return null;
  }

  if (tab === 'keberangkatan') {
    if (locationAlreadyMentionsTerminal(detail.titik_kumpul, detail.departure_terminal)) return null;
    const departure = formatTerminal(detail.departure_terminal);
    if (departure) return [departure, detail.departure_airport_code].filter(Boolean).join(' ');
  }

  return null;
}
