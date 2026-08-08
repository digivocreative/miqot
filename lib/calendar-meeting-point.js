const TIME_RE = /^(\d{1,2}[.:]\d{2})\s*(?::|-)?\s*(.*)$/;
const DEPARTURE_START_DAY_RE = /\bhari\s*(?:ke[-\s]*)?[01]\b/i;
const NEXT_DAY_RE = /\bhari\s*(?:ke[-\s]*)?[1-9]\d*\b/i;
const DEPARTURE_RE = /\b(?:take\s*off|berangkat|terbang)\b.*\b(?:pesawat|airlines?|menuju)\b|\bdengan\s+pesawat\b.*\b(?:berangkat|menuju)\b|\bmenuju\b.*\bdengan\s+(?:pesawat|airlines?)\b/i;
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

function itineraryDayNumber(day) {
  const match = String(day?.dayNumber ?? '').match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}

function itineraryDepartureActivities(content) {
  let parsed = content;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }

  const days = Array.isArray(parsed?.days) ? parsed.days : [];
  if (days.length === 0) return [];

  // Hari 0 dapat berisi waktu kumpul malam sebelum penerbangan Hari 1. Baca
  // keduanya sebagai satu rangkaian, tetapi jangan pernah meluas ke hari-hari
  // berikutnya karena di sana banyak agenda "berkumpul di lobby".
  const numberedDepartureDays = days.filter((day) => {
    const number = itineraryDayNumber(day);
    return number === 0 || number === 1;
  });
  const departureDays = numberedDepartureDays.length > 0
    ? numberedDepartureDays
    : days.slice(0, 1);

  const activities = [];
  for (const day of departureDays) {
    for (const activity of Array.isArray(day?.activities) ? day.activities : []) {
      if (typeof activity === 'string') {
        activities.push(...timedActivities([activity]));
        continue;
      }

      const timeMatch = String(activity?.time || '').match(/\b(\d{1,2})[.:](\d{2})\b/);
      const text = String(activity?.text || '').replace(/\s+/g, ' ').trim();
      if (!timeMatch || !text) continue;

      const hours = Number.parseInt(timeMatch[1], 10);
      const minutes = Number.parseInt(timeMatch[2], 10);
      if (hours > 23 || minutes > 59) continue;
      activities.push({ time: `${timeMatch[1]}.${timeMatch[2]}`, text });
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
    .replace(/\bSoekarno\s*[-–—]?\s*Hatta\b/gi, 'Soekarno-Hatta');
}

// Cafe/lounge/hotel yang disebut pada lanjutan kalimat tetap merupakan anchor
// operasional titik kumpul. Contoh aktual: "berkumpul di Gate 5 Terminal 2F …
// lalu makan pagi di Cafe Zukavia" berarti Cafe Zukavia DAN Gate/Terminal perlu
// ditampilkan bersama, bukan saling menggantikan.
const COMPLEMENTARY_VENUE_RE = /\b(?:caf[eé]|lounge|hotel|resto|restaurant|lobby)\s+[A-Za-z][\w’'.]*(?:\s+\d+)?/i;

function withComplementaryVenue(raw) {
  const base = normalizeLocationLabels(raw);
  const venue = raw.match(COMPLEMENTARY_VENUE_RE)?.[0]
    ?.replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/, '')
    .trim() || '';
  if (venue && !base.toLowerCase().includes(venue.toLowerCase())) {
    return base ? `${venue}, ${base}` : venue;
  }
  return base;
}

function meetingLocation(text) {
  const explicit = text.match(/\b(?:berkumpul|kumpul)(?:\s+bersama)?\s+di\s*(.+)$/i)
    || text.match(/\b(?:berkumpul|kumpul)\s+((?:caf[eé]|lounge|hotel|resto|restaurant)(?=\s).+)$/i)
    || text.match(/\bmeeting\s+point(?:\s+di)?\s*[:\-]?\s*(.+)$/i);
  const raw = (explicit || text.match(/\b(?:tiba|hadir|datang)\s+di\s+(.+)$/i))?.[1];
  return raw ? withComplementaryVenue(raw) : null;
}

export function needsDepartureMeetingEnrichment(event) {
  return !String(event?.jam_kumpul || '').trim() || !String(event?.titik_kumpul || '').trim();
}

function departureMeetingInfoFromActivities(activities) {
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

/**
 * Extract the departure gathering time and full meeting point from itinerary
 * text. Only Hari 0/Hari 1 and activities before take-off are considered,
 * preventing a later "berkumpul di lobby" from being mistaken for the airport
 * meeting.
 */
export function extractDepartureMeetingInfoFromText(text) {
  return departureMeetingInfoFromActivities(timedActivities(firstDayLines(text)));
}

/**
 * Read the same structured itinerary cache used by the web itinerary view.
 * This lets Calendar prefer current itinerary data over stale enrichment
 * columns left behind after a source PDF is replaced.
 */
export function extractDepartureMeetingInfoFromItinerary(content) {
  return departureMeetingInfoFromActivities(itineraryDepartureActivities(content));
}

export function resolveCalendarDepartureMeetingInfo(event, itineraryMeetingInfo = null) {
  return {
    jamKumpul: String(itineraryMeetingInfo?.jamKumpul || '').trim()
      || String(event?.jam_kumpul || '').trim()
      || null,
    titikKumpul: String(itineraryMeetingInfo?.titikKumpul || '').trim()
      || String(event?.titik_kumpul || '').trim()
      || null,
  };
}
