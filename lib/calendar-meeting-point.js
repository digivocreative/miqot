const TIME_RE = /^(\d{1,2}[.:]\d{2})\s*(?::|-)?\s*(.*)$/;
const DEPARTURE_START_DAY_RE = /\bhari\s*(?:ke[-\s]*)?[01]\b/i;
const NEXT_DAY_RE = /\bhari\s*(?:ke[-\s]*)?[1-9]\d*\b/i;
const DEPARTURE_RE = /\b(?:take\s*off|berangkat|terbang)\b.*\b(?:pesawat|airlines?|menuju)\b|\bdengan\s+pesawat\b.*\b(?:berangkat|menuju)\b/i;
const EXPLICIT_MEETING_RE = /\b(?:berkumpul|kumpul\s+di|meeting\s+point)\b/i;
const ARRIVAL_AT_RE = /\b(?:tiba|hadir|datang)\s+di\b/i;
const LOCATION_HINT_RE = /\b(?:bandara|airport|terminal|gate|caf[eé]|hotel|lounge|resto|restaurant)\b/i;
const TRAILING_ACTIVITY_RE = /\s*,\s*(?:pembagian|pengarahan|makan|sarapan|kemudian|dilanjutkan|do['’]?a|foto|profiling|jamaah|rombongan|serah\s+terima|menyerahkan|menerima|istirahat)\b.*$/i;

function firstDayLines(text) {
  const lines = String(text || '')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const startDayIndex = lines.findIndex(line => DEPARTURE_START_DAY_RE.test(line));
  if (startDayIndex < 0) return lines;
  const nextDayOffset = lines.slice(startDayIndex + 1).findIndex(line => NEXT_DAY_RE.test(line));
  const endIndex = nextDayOffset < 0 ? lines.length : startDayIndex + 1 + nextDayOffset;
  return lines.slice(startDayIndex + 1, endIndex);
}

function timedActivities(lines) {
  const activities = [];
  for (const line of lines) {
    const match = line.match(TIME_RE);
    if (match) {
      activities.push({ time: match[1].replace(':', '.'), text: match[2].trim() });
    } else if (activities.length > 0) {
      activities[activities.length - 1].text += ` ${line}`;
    }
  }
  return activities;
}

function cleanLocation(value) {
  return String(value || '')
    .replace(TRAILING_ACTIVITY_RE, '')
    .replace(/[.;:]\s*$/, '')
    .replace(/\s+,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLocationLabels(value) {
  return cleanLocation(value)
    .replace(/\bgate\s+([a-z0-9]+)/gi, (_, gate) => `Gate ${String(gate).toUpperCase()}`)
    .replace(/\bterminal\s+([a-z0-9]+)/gi, (_, terminal) => `Terminal ${String(terminal).toUpperCase()}`)
    .replace(/\bBandara\s+International\b/gi, 'Bandara Internasional')
    .replace(/\bSoekarno\s*-?\s*Hatta\b/gi, 'Soekarno-Hatta');
}

function meetingLocation(text) {
  const explicit = text.match(/\b(?:berkumpul|kumpul)(?:\s+bersama)?\s+di\s*(.+)$/i)
    || text.match(/\b(?:berkumpul|kumpul)\s+((?:caf[eé]|lounge|hotel|resto|restaurant)(?=\s).+)$/i)
    || text.match(/\bmeeting\s+point(?:\s+di)?\s*[:\-]?\s*(.+)$/i);
  if (explicit) return normalizeLocationLabels(explicit[1]);

  const arrival = text.match(/\b(?:tiba|hadir|datang)\s+di\s+(.+)$/i);
  return arrival ? normalizeLocationLabels(arrival[1]) : null;
}

export function needsDepartureMeetingEnrichment(event) {
  return !String(event?.jam_kumpul || '').trim() || !String(event?.titik_kumpul || '').trim();
}

/**
 * Extract the departure gathering time and full meeting point from itinerary
 * text. Only Hari 0/Hari 1 and activities before take-off are considered,
 * preventing a later "berkumpul di lobby" from being mistaken for the airport
 * meeting.
 */
export function extractDepartureMeetingInfoFromText(text) {
  const activities = timedActivities(firstDayLines(text));
  if (activities.length === 0) return null;

  const departureIndex = activities.findIndex(activity => DEPARTURE_RE.test(activity.text));
  const candidates = departureIndex < 0 ? activities : activities.slice(0, departureIndex);
  const explicit = candidates.find(activity => EXPLICIT_MEETING_RE.test(activity.text));
  const fallback = candidates.find(activity => ARRIVAL_AT_RE.test(activity.text) && LOCATION_HINT_RE.test(activity.text));
  const selected = explicit || fallback;
  if (!selected) return null;

  const titikKumpul = meetingLocation(selected.text);
  if (!titikKumpul) return null;
  return { jamKumpul: selected.time, titikKumpul };
}
