const MADINAH_PATTERNS = [
  /\bmadinah\b/i,
  /\bmedinah\b/i,
  /\bnabawi\b/i,
];

const MEKKAH_LOCATION_PATTERNS = [
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

const TOUR_PHASES = [
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
