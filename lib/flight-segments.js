const SPACES = /\s+/g;

const AIRLINE_NAMES = {
  EK: 'EMIRATES',
  GA: 'GARUDA INDONESIA',
  ID: 'BATIK AIR',
  SV: 'SAUDIA',
};

function extractCalendarParts(pesawat) {
  if (!pesawat) return { airline: '', codePart: '' };
  const raw = String(pesawat).trim();
  const match = raw.match(/^(.+?)\s*[-~]\s*(.+)$/);
  if (!match) return { airline: '', codePart: raw };
  return { airline: match[1].trim(), codePart: match[2].trim() };
}

function normalizeFlightIata(code, fallbackAirlineCode = '') {
  if (!code) return '';
  const compact = String(code).replace(SPACES, '').toUpperCase();
  const full = compact.match(/^([A-Z]{2})(\d{2,4})$/);
  if (full) return `${full[1]}${full[2]}`;
  const numberOnly = compact.match(/^(\d{2,4})$/);
  if (numberOnly && fallbackAirlineCode) return `${fallbackAirlineCode}${numberOnly[1]}`;
  return '';
}

export function parseFlightCodeList(rawCode) {
  if (!rawCode) return [];
  const text = String(rawCode).toUpperCase();
  const out = [];
  let currentAirlineCode = '';
  const re = /([A-Z]{2})?\s*(\d{2,4})/g;
  let match;
  while ((match = re.exec(text))) {
    const airlineCode = match[1] || currentAirlineCode;
    if (!airlineCode) continue;
    currentAirlineCode = airlineCode;
    const flightIata = normalizeFlightIata(`${airlineCode}${match[2]}`);
    if (flightIata) out.push(flightIata);
  }
  return [...new Set(out)];
}

export function flightCodeForEventType(schedule, eventType) {
  if (!schedule) return '';
  return eventType === 'kepulangan'
    ? schedule.pulang_kode_penerbangan || ''
    : schedule.berangkat_kode_penerbangan || '';
}

export function routeStringForEventType(schedule, eventType) {
  if (!schedule) return '';
  return eventType === 'kepulangan'
    ? schedule.pulang_rute || ''
    : schedule.berangkat_rute || '';
}

export function parseRouteLegs(routeString) {
  return String(routeString || '')
    .toUpperCase()
    .split('/')
    .map(part => {
      const match = part.match(/\b([A-Z]{3})\b\s*(?:[-–—>]|→)\s*\b([A-Z]{3})\b/);
      return match ? { dep: match[1], arr: match[2] } : null;
    })
    .filter(Boolean);
}

export function parseFlightSegmentsFromCalendar(pesawat, { eventType, schedule } = {}) {
  const { airline: calendarAirline, codePart } = extractCalendarParts(pesawat);
  const scheduleCode = flightCodeForEventType(schedule, eventType);
  const scheduleCodes = parseFlightCodeList(scheduleCode);
  const codes = scheduleCodes.length ? scheduleCodes : parseFlightCodeList(codePart);

  return codes.map((flightIata, segmentIndex) => {
    const codeMatch = flightIata.match(/^([A-Z]{2})(\d+)$/);
    const airlineCode = codeMatch?.[1] || '';
    const flightNumber = codeMatch?.[2] || '';
    const airline = calendarAirline || schedule?.maskapai || AIRLINE_NAMES[airlineCode] || airlineCode;
    return {
      airline,
      airlineCode,
      flightNumber,
      flightIata,
      segmentIndex,
    };
  });
}
