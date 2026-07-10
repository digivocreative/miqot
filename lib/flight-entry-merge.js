function cleanText(value) {
  return String(value || '').replace(/[•·]/g, ' ').replace(/\s+/g, ' ').trim();
}

function leaderKey(value) {
  const cleaned = cleanText(value);
  return cleaned && cleaned !== '-' ? cleaned.toUpperCase() : '';
}

function uniqueOrdered(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const cleaned = cleanText(value);
    if (!cleaned || cleaned === '-') continue;
    const key = cleaned.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function publicEntry(entry) {
  const {
    _mergeSourceKey,
    _mergeCardKey,
    _mergeTlKey,
    _segmentIndex,
    _segmentCount,
    _depUTC,
    _arrUTC,
    _stopoverCity,
    _stopoverCityName,
    ...rest
  } = entry;
  return rest;
}

function publicSegment(entry) {
  const {
    jamaah,
    group,
    pax,
    tourLeader,
    _mergeSourceKey,
    _mergeCardKey,
    _mergeTlKey,
    _segmentIndex,
    _segmentCount,
    _depUTC,
    _arrUTC,
    _stopoverCity,
    _stopoverCityName,
    ...rest
  } = entry;
  return rest;
}

function mergeKey(entry) {
  if (entry._mergeCardKey) {
    return `card:${entry._mergeCardKey}`;
  }
  const count = Number(entry._segmentCount || 1);
  if (count > 1 && entry._mergeSourceKey) {
    return `journey:${entry._mergeSourceKey}`;
  }
  const tlKey = entry._mergeTlKey || leaderKey(entry.tourLeader);
  if (tlKey) {
    return `flight-tl:${entry.eventDate || ''}:${entry.flightNumber || ''}:${tlKey}`;
  }
  return `single:${entry.id || Math.random()}`;
}

function sortSegments(entries) {
  return [...entries].sort((a, b) => {
    const byIndex = (Number(a._segmentIndex) || 0) - (Number(b._segmentIndex) || 0);
    if (byIndex !== 0) return byIndex;
    const byTime = (Number(a._depUTC) || 0) - (Number(b._depUTC) || 0);
    if (byTime !== 0) return byTime;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

function activeSegmentForEntries(entries) {
  if (!entries.length) return null;
  return entries.find(entry => entry.status === 'en-route')
    || entries.find(entry => entry.status === 'delayed')
    || entries.find(entry => entry.status === 'scheduled' || entry.status === 'unverified')
    || [...entries].reverse().find(entry => entry.status === 'landed')
    || entries.find(entry => entry.status !== 'cancelled')
    || entries[0];
}

function dedupeJamaah(entries) {
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    for (const j of entry.jamaah || []) {
      const key = `${j.wa || ''}|${j.nama || ''}`.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(j);
    }
  }
  out.sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || '')));
  return out;
}

function sumPaxOncePerSource(entries) {
  const bySource = new Map();
  for (const entry of entries) {
    const source = entry._mergeSourceKey || entry.id || '';
    const pax = Number(entry.pax);
    if (!Number.isFinite(pax) || pax <= 0) continue;
    if (!bySource.has(source)) bySource.set(source, pax);
  }
  let total = 0;
  for (const pax of bySource.values()) total += pax;
  return total;
}

function formatTransitDuration(minutes) {
  const value = Math.round(Number(minutes));
  if (!Number.isFinite(value) || value <= 0) return null;
  const h = Math.floor(value / 60);
  const m = value % 60;
  if (h === 0) return `${m} menit`;
  if (m === 0) return `${h} jam`;
  return `${h} jam ${m} menit`;
}

function formatTourDuration(minutes) {
  const value = Math.round(Number(minutes));
  if (!Number.isFinite(value) || value < 24 * 60) return null;
  const days = Math.floor(value / (24 * 60));
  const hours = Math.floor((value % (24 * 60)) / 60);
  if (hours === 0) return `${days} hari`;
  return `${days} hari ${hours} jam`;
}

function dedupeSegmentEntries(entries) {
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    const key = `${entry.flightNumber || ''}|${entry.depCode || ''}|${entry.arrCode || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

function segmentDestinationLabel(entry) {
  const city = cleanText(entry?.arrCity || entry?.arrCode);
  return city ? `Menuju ${city}` : null;
}

function transitLabelForSegments(entries) {
  const activeOrNext = activeSegmentForEntries(entries);
  const destinationLabel = segmentDestinationLabel(activeOrNext);
  if (activeOrNext && ['en-route', 'scheduled', 'delayed', 'unverified'].includes(activeOrNext.status) && destinationLabel) {
    return destinationLabel;
  }

  const stops = [];
  for (let i = 0; i < entries.length - 1; i += 1) {
    const current = entries[i];
    const next = entries[i + 1];
    const city = cleanText(current._stopoverCityName || current.arrCity || next.depCity || current.arrCode || next.depCode);
    const isTourStopover = Boolean(current._stopoverCity || current._stopoverCityName);
    const arrUTC = Number(current._arrUTC);
    const nextDepUTC = Number(next._depUTC);
    const minutes = Number.isFinite(arrUTC) && Number.isFinite(nextDepUTC) && nextDepUTC > arrUTC
      ? Math.round((nextDepUTC - arrUTC) / 60000)
      : null;
    if (city || minutes || isTourStopover) stops.push({ city, minutes, isTourStopover });
  }

  if (stops.length === 0) return null;
  if (stops.length > 1) {
    const cities = uniqueOrdered(stops.map(stop => stop.city));
    const prefix = stops.some(stop => stop.isTourStopover) ? 'Tour' : 'Transit';
    return cities.length > 0 ? `${prefix} ${stops.length}x: ${cities.join(', ')}` : `${prefix} ${stops.length}x`;
  }

  const stop = stops[0];
  if (stop.isTourStopover) {
    const tourDuration = formatTourDuration(stop.minutes);
    if (tourDuration && stop.city) return `Tour ${tourDuration} di ${stop.city}`;
    if (tourDuration) return `Tour ${tourDuration}`;
    return stop.city ? `Tour di ${stop.city}` : 'Tour';
  }

  const duration = formatTransitDuration(stop.minutes);
  if (duration && stop.city) return `Transit ${duration} di ${stop.city}`;
  if (duration) return `Transit ${duration}`;
  return stop.city ? `Transit di ${stop.city}` : 'Transit';
}

function mergeEntries(entries) {
  const ordered = sortSegments(entries);
  if (ordered.length === 1) return publicEntry(ordered[0]);

  const first = ordered[0];
  const groups = uniqueOrdered(ordered.map(e => e.group));
  const leaders = uniqueOrdered(ordered.map(e => e.tourLeader));
  const isTransit = ordered.some(e => Number(e._segmentCount || 1) > 1);
  const segmentEntries = isTransit ? dedupeSegmentEntries(ordered) : [];
  const active = activeSegmentForEntries(segmentEntries.length > 0 ? segmentEntries : ordered) || first;

  return publicEntry({
    ...active,
    id: `${first.id || 'flight'}_combo`,
    cardKey: mergeKey(first),
    group: groups.join(', '),
    pax: sumPaxOncePerSource(ordered),
    tourLeader: leaders.join(', '),
    jamaah: dedupeJamaah(ordered),
    transitLabel: isTransit ? transitLabelForSegments(segmentEntries) : null,
    segments: isTransit ? segmentEntries.map(publicSegment) : undefined,
  });
}

export function mergeFlightEntriesByTourLeader(flights) {
  const groups = new Map();
  for (const flight of flights || []) {
    const key = mergeKey(flight);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(flight);
  }

  return Array.from(groups.values()).map(mergeEntries);
}
