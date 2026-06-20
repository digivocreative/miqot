function norm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function normalizeCalendarPackageKey(paket) {
  return norm(paket)
    .replace(/^\d{2}\/\d{2}\/\d{4}/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function buildDepartureDateLookup(departureEvents) {
  const byJadwalId = new Map();
  const byGroupPackage = new Map();
  const groupDates = new Map();

  for (const event of departureEvents || []) {
    const eventDate = norm(event?.event_date).slice(0, 10);
    if (!eventDate) continue;

    const jadwalId = norm(event?.jadwal_id);
    if (jadwalId) byJadwalId.set(jadwalId, eventDate);

    const groupNumber = norm(event?.group_number);
    if (!groupNumber) continue;

    const paketKey = normalizeCalendarPackageKey(event?.paket);
    if (paketKey) byGroupPackage.set(`${groupNumber}__${paketKey}`, eventDate);

    if (!groupDates.has(groupNumber)) groupDates.set(groupNumber, new Set());
    groupDates.get(groupNumber).add(eventDate);
  }

  const byUniqueGroup = new Map();
  for (const [groupNumber, dates] of groupDates) {
    if (dates.size === 1) byUniqueGroup.set(groupNumber, [...dates][0]);
  }

  return { byJadwalId, byGroupPackage, byUniqueGroup };
}

export function departureDateForCalendarEvent(event, lookup) {
  if (!event || !lookup) return '';

  const jadwalId = norm(event.jadwal_id);
  if (jadwalId && lookup.byJadwalId?.has(jadwalId)) {
    return lookup.byJadwalId.get(jadwalId);
  }

  const groupNumber = norm(event.group_number);
  if (!groupNumber) return '';

  const paketKey = normalizeCalendarPackageKey(event.paket);
  const groupPackageKey = paketKey ? `${groupNumber}__${paketKey}` : '';
  if (groupPackageKey && lookup.byGroupPackage?.has(groupPackageKey)) {
    return lookup.byGroupPackage.get(groupPackageKey);
  }

  return lookup.byUniqueGroup?.get(groupNumber) || '';
}
