export const MADINAH_PATTERNS = [
  /\bmadinah\b/i,
  /\bmedinah\b/i,
  /\bnabawi\b/i,
];

export const MEKKAH_LOCATION_PATTERNS = [
  /\bmakkah\b/i,
  /\bmekkah\b/i,
  /\bmekah\b/i,
  /masjidil\s+haram/i,
];

const MEKKAH_RITUAL_PATTERNS = [
  /masjidil\s+haram/i,
  /\bka'?bah\b/i,
  /\btawaf\b/i,
  /\bsa'?i\b/i,
  /\bsai\b/i,
  /\btahallul\b/i,
];

const TOUR_ACTION_PATTERNS = [
  /\bcity\s*tour\b/i,
  /\bcitytour\b/i,
  /\btour\b/i,
  /\bwisata\b/i,
  /\bvisit\b/i,
  /\bkunjungan\b/i,
  /\bjelajah\b/i,
  /\beksplor(?:asi|e)?\b/i,
  /\bdesert\s+safari\b/i,
  /\bziarah\b/i,
];

// A generic "City Tour" can be attributed to the destination in the day's
// location only when the activity does not name another city. This covers
// itinerary rows such as Haikou – Jakarta + "berkumpul untuk City Tour"
// without turning Dubai into a tour when the text says "City Tour Jeddah".
const GENERIC_TOUR_ACTION_PATTERNS = [
  /\bcity\s*tour\b/i,
  /\bcitytour\b/i,
  /\bdesert\s+safari\b/i,
];

const NON_TOUR_PLACE_PATTERNS = [
  /\bjakarta\b/i,
  /\bjeddah\b/i,
  /\bmadinah\b/i,
  /\bmedinah\b/i,
  /\bmakkah\b/i,
  /\bmekkah\b/i,
  /\bmekah\b/i,
];

export const TOUR_PHASES = [
  {
    label: 'Tur Dubai',
    patterns: [/\bdubai\b/i, /\babu\s*dhabi\b/i, /\babudhabi\b/i],
  },
  {
    label: 'Tur Turki',
    patterns: [
      /\bturki(?:ye)?\b/i,
      /\bturkey\b/i,
      /\bistanbul\b/i,
      /\bbursa\b/i,
      /\bankara\b/i,
      /\bcappadocia\b/i,
    ],
  },
  {
    label: 'Tur Mesir',
    patterns: [
      /\bmesir\b/i,
      /\begypt\b/i,
      /\bcairo\b/i,
      /\bkairo\b/i,
      /\balexandria\b/i,
      /\bgiza\b/i,
    ],
  },
  {
    label: 'Tur China',
    patterns: [
      /\bchina\b/i,
      /\btiongkok\b/i,
      /\bhaikou\b/i,
      /\bhaiko\b/i,
      /\bbeijing\b/i,
      /\bshanghai\b/i,
      /\bguangzhou\b/i,
    ],
  },
  {
    label: 'Tur Aqsha',
    patterns: [
      /\baqsha\b/i,
      /\baqsa\b/i,
      /\bal\s*aqsa\b/i,
      /\bamman\b/i,
      /\bpetra\b/i,
      /\bjordan\b/i,
      /\bpalestin(?:e|a)\b/i,
    ],
  },
  {
    label: 'Tur Taif',
    patterns: [/\btaif\b/i, /\bthaif\b/i],
  },
  {
    label: 'Ziarah Badar',
    patterns: [/\bbadar\b/i, /\bbadr\b/i],
  },
  {
    label: 'Tur Red Sea',
    patterns: [/\bred\s*sea\b/i, /\bredsea\b/i, /\blaut\s+merah\b/i],
  },
];

const ALL_KNOWN_PLACE_PATTERNS = [
  ...NON_TOUR_PLACE_PATTERNS,
  ...TOUR_PHASES.flatMap(phase => phase.patterns),
];

const DAY_SCORE_MULTIPLIER = 100000;
const TITLE_SCORE_OFFSET = 10000;
const ACTIVITY_SCORE_OFFSET = 20000;
const ACTIVITY_SCORE_MULTIPLIER = 1000;

function normalizeDays(content) {
  if (Array.isArray(content)) return content;
  if (content && typeof content === 'object' && Array.isArray(content.days)) return content.days;
  return [];
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function dayTitle(day) {
  return stringValue(day?.title) || stringValue(day?.judul);
}

function dayLocation(day) {
  return stringValue(day?.location);
}

function dayActivities(day) {
  if (!Array.isArray(day?.activities)) return [];
  return day.activities
    .map(activity => stringValue(activity?.text) || stringValue(activity?.activity) || stringValue(activity?.kegiatan))
    .filter(Boolean);
}

function firstPatternIndex(text, patterns) {
  let best = null;
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    if (best === null || match.index < best) best = match.index;
  }
  return best;
}

function matchesAny(text, patterns) {
  return firstPatternIndex(text, patterns) !== null;
}

function scoreStructuredOccurrence(days, patterns, includeActivities = false) {
  let best = null;

  days.forEach((day, dayIndex) => {
    const base = dayIndex * DAY_SCORE_MULTIPLIER;
    const locationIndex = firstPatternIndex(dayLocation(day), patterns);
    if (locationIndex !== null) {
      const score = base + locationIndex;
      if (best === null || score < best) best = score;
    }

    const titleIndex = firstPatternIndex(dayTitle(day), patterns);
    if (titleIndex !== null) {
      const score = base + TITLE_SCORE_OFFSET + titleIndex;
      if (best === null || score < best) best = score;
    }

    if (!includeActivities) return;
    dayActivities(day).forEach((activity, activityIndex) => {
      const index = firstPatternIndex(activity, patterns);
      if (index === null) return;
      const score = base + ACTIVITY_SCORE_OFFSET + (activityIndex * ACTIVITY_SCORE_MULTIPLIER) + index;
      if (best === null || score < best) best = score;
    });
  });

  return best;
}

function directTourEvidence(text, destinationPatterns) {
  return matchesAny(text, destinationPatterns) && matchesAny(text, TOUR_ACTION_PATTERNS);
}

function genericTourEvidence(text) {
  return matchesAny(text, GENERIC_TOUR_ACTION_PATTERNS)
    && !matchesAny(text, ALL_KNOWN_PLACE_PATTERNS);
}

function tourPhaseScore(days, destinationPatterns) {
  let best = null;

  days.forEach((day, dayIndex) => {
    const location = dayLocation(day);
    const title = dayTitle(day);
    const activities = dayActivities(day);
    const locationIndex = firstPatternIndex(location, destinationPatterns);
    const titleDirect = directTourEvidence(title, destinationPatterns);
    const directActivityIndex = activities.findIndex(activity => directTourEvidence(activity, destinationPatterns));
    const genericActivityIndex = activities.findIndex(genericTourEvidence);
    const genericTitle = genericTourEvidence(title);

    const hasTourEvidence = titleDirect
      || directActivityIndex >= 0
      || ((genericTitle || genericActivityIndex >= 0) && locationIndex !== null);
    if (!hasTourEvidence) return;

    const base = dayIndex * DAY_SCORE_MULTIPLIER;
    let score;
    if (locationIndex !== null) {
      // The route-like location preserves the order within a transition day,
      // e.g. Dubai – Madinah or Mekkah – Taif – Mekkah.
      score = base + locationIndex;
    } else if (titleDirect) {
      score = base + TITLE_SCORE_OFFSET + (firstPatternIndex(title, destinationPatterns) || 0);
    } else {
      const activityIndex = directActivityIndex >= 0 ? directActivityIndex : genericActivityIndex;
      const activity = activities[activityIndex] || '';
      score = base + ACTIVITY_SCORE_OFFSET
        + (activityIndex * ACTIVITY_SCORE_MULTIPLIER)
        + (firstPatternIndex(activity, destinationPatterns) || 0);
    }

    if (best === null || score < best) best = score;
  });

  return best;
}

export function inferJourneyOrderFromItinerary(content) {
  const days = normalizeDays(content);
  if (!days.length) return null;

  const madinahScore = scoreStructuredOccurrence(days, MADINAH_PATTERNS);
  const mekkahLocationScore = scoreStructuredOccurrence(days, MEKKAH_LOCATION_PATTERNS);
  const mekkahScore = mekkahLocationScore
    ?? scoreStructuredOccurrence(days, MEKKAH_RITUAL_PATTERNS, true);

  // A valid Umrah journey summary must contain both Saudi phases. Avoid
  // returning a plausible-looking partial sequence from incomplete parsing.
  if (madinahScore === null || mekkahScore === null || madinahScore === mekkahScore) {
    return null;
  }

  const scoredPhases = [
    { label: 'Madinah', score: madinahScore },
    { label: 'Umroh', score: mekkahScore },
  ];

  for (const phase of TOUR_PHASES) {
    const score = tourPhaseScore(days, phase.patterns);
    if (score !== null) scoredPhases.push({ label: phase.label, score });
  }

  return scoredPhases
    .sort((a, b) => a.score - b.score)
    .map(phase => phase.label);
}

export function inferSaudiJourneyOrderFromItinerary(content) {
  const order = inferJourneyOrderFromItinerary(content);
  if (!order) return null;
  return order.filter(label => label === 'Madinah' || label === 'Umroh');
}

function routeLegs(rute) {
  return String(rute || '')
    .split('/')
    .map(segment => {
      const parts = segment.split(/\s*[-–—]\s*/).map(part => part.trim().toUpperCase());
      return parts.length >= 2 && parts[0] && parts[parts.length - 1]
        ? { from: parts[0], to: parts[parts.length - 1] }
        : null;
    })
    .filter(Boolean);
}

// Mendarat di MED berarti jamaah secara fisik memulai dari Madinah — urutan
// itinerary yang menaruh Umroh lebih dulu hanya mungkin bila konten cache
// bukan milik jadwal ini (mis. PDF sumber diganti setelah di-parse) ATAU bila
// field rute upstream-nya sendiri salah entri (JBU1600: "CGK-MED / JED-IST"
// padahal PDF-nya SV 819 mendarat King Abdulaziz Jeddah). Sinyal landing JED
// sengaja TIDAK dipakai: pola Madinah–Mekkah–Madinah (Jum'atain) membuat arah
// sebaliknya ambigu.
export function saudiOrderContradictsRoute(order, berangkatRute) {
  if (!Array.isArray(order)) return false;
  const saudi = order.filter(label => label === 'Madinah' || label === 'Umroh');
  if (saudi.length < 2 || saudi[0] !== 'Umroh') return false;

  const legs = routeLegs(berangkatRute);
  for (let i = legs.length - 1; i >= 0; i -= 1) {
    if (legs[i].to === 'MED') return true;
    if (legs[i].to === 'JED') return false;
  }
  return false;
}

const MONTH_BY_NAME = new Map(Object.entries({
  januari: 1, january: 1, jan: 1,
  februari: 2, february: 2, feb: 2,
  maret: 3, march: 3, mar: 3,
  april: 4, apr: 4,
  mei: 5, may: 5,
  juni: 6, june: 6, jun: 6,
  juli: 7, july: 7, jul: 7,
  agustus: 8, august: 8, agu: 8, ags: 8, agt: 8,
  september: 9, sep: 9,
  oktober: 10, october: 10, okt: 10, oct: 10,
  november: 11, nov: 11,
  desember: 12, december: 12, des: 12, dec: 12,
}));

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateFromText(text) {
  const value = String(text || '').toLowerCase();

  const textual = value.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (textual) {
    const day = Number(textual[1]);
    const month = MONTH_BY_NAME.get(textual[2]);
    if (month && day >= 1 && day <= 31) return Date.UTC(Number(textual[3]), month - 1, day);
  }

  const numeric = value.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return Date.UTC(Number(numeric[3]), month - 1, day);
    }
  }

  return null;
}

function parseIsoDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

// Kepemilikan konten terhadap jadwal, dinilai dari judul hari pertama yang
// bertanggal: harus jatuh pada berangkat_tgl + indeks harinya. Toleransi ±1
// hari — PDF keberangkatan lepas-tengah-malam menanggali hari-1 dengan hari
// kumpul di bandara, sehari sebelum tanggal berangkat resmi (pola JBU1565).
//
// Tri-state, karena "tak terbukti" dan "terbukti milik jadwal lain" menuntut
// perlakuan berbeda: mayoritas PDF Alhijaz menulis judul tanpa tanggal sama
// sekali ('Jakarta - Dubai'), dan itu bukan alasan mencurigai apa pun.
export function classifyItineraryDepartureDate(content, berangkatTgl) {
  const departure = parseIsoDate(berangkatTgl);
  if (departure === null) return 'undated';

  const days = normalizeDays(content);
  for (let i = 0; i < days.length; i += 1) {
    const dated = parseDateFromText(dayTitle(days[i]));
    if (dated === null) continue;
    return Math.abs(dated - (departure + i * DAY_MS)) <= DAY_MS ? 'match' : 'mismatch';
  }
  return 'undated';
}

export function itineraryMatchesDepartureDate(content, berangkatTgl) {
  return classifyItineraryDepartureDate(content, berangkatTgl) === 'match';
}

// Itinerary yang tanggalnya milik keberangkatan lain tidak boleh menyumbang
// urutan perjalanan sama sekali — kasus JBU1528 (13 Agt 2026): kantor sempat
// memasang PDF keberangkatan 29 Agt di URL paket 22 Agt, dan karena rutenya
// mendarat JED (sinyal yang sengaja diabaikan saudiOrderContradictsRoute)
// urutan Madinah-dulu dari dokumen asing itu lolos ke kartu.
export function itineraryBelongsToOtherSchedule(content, berangkatTgl) {
  return classifyItineraryDepartureDate(content, berangkatTgl) === 'mismatch';
}

// Kontradiksi rute vs itinerary punya dua akar yang penanganannya berlawanan:
// cache basi milik jadwal lain (JBU1513) → buang urutan itinerary; atau field
// rute upstream yang salah entri (JBU1600) → justru urutan itinerary yang
// benar. Pembedanya: itinerary bertanggal sesuai keberangkatan jadwal ini
// tidak mungkin milik jadwal lain, jadi ia menang atas rute.
export function shouldSuppressJourneyOrder({ order, berangkatRute, content, berangkatTgl }) {
  if (!saudiOrderContradictsRoute(order, berangkatRute)) return false;
  return !itineraryMatchesDepartureDate(content, berangkatTgl);
}
