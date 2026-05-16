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

function normalizeDays(content) {
  if (Array.isArray(content)) return content;
  if (content && typeof content === 'object' && Array.isArray(content.days)) return content.days;
  return [];
}

function dayText(day, includeActivities = false) {
  if (!day || typeof day !== 'object') return '';

  const fields = [
    day.location,
    day.title,
    day.judul,
  ];

  if (includeActivities && Array.isArray(day.activities)) {
    for (const activity of day.activities) {
      if (!activity || typeof activity !== 'object') continue;
      fields.push(activity.text, activity.activity, activity.kegiatan);
    }
  }

  return fields
    .filter(value => typeof value === 'string' && value.trim())
    .join(' ');
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

function firstMatchScore(days, patterns, includeActivities = false) {
  let best = null;
  days.forEach((day, dayIndex) => {
    const text = dayText(day, includeActivities);
    if (!text) return;
    const index = firstPatternIndex(text, patterns);
    if (index === null) return;
    const score = (dayIndex * 10000) + index;
    if (best === null || score < best) best = score;
  });
  return best;
}

export function inferSaudiJourneyOrderFromItinerary(content) {
  const days = normalizeDays(content);
  if (!days.length) return null;

  const madinahScore = firstMatchScore(days, MADINAH_PATTERNS);
  const mekkahLocationScore = firstMatchScore(days, MEKKAH_LOCATION_PATTERNS);
  const mekkahScore = mekkahLocationScore ?? firstMatchScore(days, MEKKAH_RITUAL_PATTERNS, true);

  if (madinahScore === null || mekkahScore === null || madinahScore === mekkahScore) {
    return null;
  }

  return madinahScore < mekkahScore
    ? ['Madinah', 'Umroh']
    : ['Umroh', 'Madinah'];
}
