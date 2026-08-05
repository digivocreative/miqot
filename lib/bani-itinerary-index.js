import {
  MADINAH_PATTERNS,
  MEKKAH_LOCATION_PATTERNS,
  TOUR_PHASES,
} from './journey-order.js';

const DAY_MS = 86_400_000;
const JAKARTA_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' });

function itineraryDays(content) {
  let parsed = content;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (Array.isArray(parsed)) return parsed;
  return parsed && typeof parsed === 'object' && Array.isArray(parsed.days) ? parsed.days : [];
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function activityText(activity) {
  if (typeof activity === 'string') return activity.trim();
  return cleanText(activity?.text) || cleanText(activity?.activity) || cleanText(activity?.kegiatan);
}

function labelsInText(text) {
  if (!text) return [];
  const hits = [];
  TOUR_PHASES.forEach((phase, phaseIndex) => {
    let firstIndex = null;
    for (const pattern of phase.patterns) {
      const index = text.search(pattern);
      if (index >= 0 && (firstIndex === null || index < firstIndex)) firstIndex = index;
    }
    if (firstIndex !== null) hits.push({ label: phase.label, index: firstIndex, phaseIndex });
  });
  return hits
    .sort((a, b) => a.index - b.index || a.phaseIndex - b.phaseIndex)
    .map((hit) => hit.label);
}

export function tourLabelsFromItinerary(content) {
  const labels = [];
  const seen = new Set();
  for (const day of itineraryDays(content)) {
    const texts = [
      cleanText(day?.location),
      cleanText(day?.title) || cleanText(day?.judul),
      ...(Array.isArray(day?.activities) ? day.activities.map(activityText) : []),
    ];
    for (const text of texts) {
      for (const label of labelsInText(text)) {
        if (seen.has(label)) continue;
        seen.add(label);
        labels.push(label);
      }
    }
  }
  return labels;
}

export function parseDayNumbers(dayNumber) {
  const match = /^(?:hari\s*)?(\d+)(?:\s*[-–—]\s*(\d+))?$/i.exec(String(dayNumber ?? '').trim());
  if (!match) return [];
  const start = Number(match[1]);
  const end = match[2] === undefined ? start : Number(match[2]);
  // Itinerary operasional tidak mungkin mencakup ratusan hari; rem ini juga
  // mencegah string rentang rusak mengalokasikan array yang sangat besar.
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start || end - start > 365) return [];
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function jakartaMidnight(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime()) || JAKARTA_DATE.format(date) !== raw) return null;
  return date;
}

export function cityOnDate(content, berangkatTgl, targetDate) {
  const days = itineraryDays(content);
  const departure = jakartaMidnight(berangkatTgl);
  const target = jakartaMidnight(targetDate);
  if (!days.length || !departure || !target) return null;

  const offset = (target.getTime() - departure.getTime()) / DAY_MS;
  if (!Number.isInteger(offset)) return null;
  const targetDay = offset + 1;
  for (const day of days) {
    if (!parseDayNumbers(day?.dayNumber).includes(targetDay)) continue;
    const location = typeof day?.location === 'string' ? day.location : '';
    if (location.trim()) return location;
  }
  return null;
}

export function isInCityOnDate(content, berangkatTgl, targetDate, kota) {
  const days = itineraryDays(content);
  if (!days.length) return null;
  const patterns = kota === 'mekkah'
    ? MEKKAH_LOCATION_PATTERNS
    : kota === 'madinah' ? MADINAH_PATTERNS : null;
  if (!patterns) return null;
  const location = cityOnDate(days, berangkatTgl, targetDate);
  if (!location) return false;
  return patterns.some((pattern) => location.search(pattern) >= 0);
}
