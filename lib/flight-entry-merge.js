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
    _mergeTlKey,
    _segmentIndex,
    _segmentCount,
    _depUTC,
    _arrUTC,
    ...rest
  } = entry;
  return rest;
}

function mergeKey(entry) {
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

function statusOf(entries) {
  const statuses = entries.map(e => e.status);
  if (statuses.includes('en-route')) return 'en-route';
  if (statuses.includes('delayed')) return 'delayed';
  if (statuses.includes('scheduled')) return 'scheduled';
  if (statuses.length > 0 && statuses.every(s => s === 'cancelled')) return 'cancelled';
  if (statuses.includes('landed')) return 'landed';
  return entries[0]?.status || 'scheduled';
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

function sumUniqueDuration(entries) {
  const seen = new Set();
  let total = 0;
  for (const entry of entries) {
    const key = `${entry.flightNumber || ''}|${entry.depCode || ''}|${entry.arrCode || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const duration = Number(entry.duration);
    if (Number.isFinite(duration) && duration > 0) total += duration;
  }
  return total > 0 ? total : null;
}

function progressFor(status, first, last) {
  if (status === 'landed') return 100;
  if (status !== 'en-route') return first.progress || 0;
  const depUTC = Number(first._depUTC);
  const arrUTC = Number(last._arrUTC);
  if (!depUTC || !arrUTC || arrUTC <= depUTC) return first.progress || 0;
  const elapsed = Date.now() - depUTC;
  return Math.min(99, Math.max(1, Math.round((elapsed / (arrUTC - depUTC)) * 100)));
}

function mergeEntries(entries) {
  const ordered = sortSegments(entries);
  if (ordered.length === 1) return publicEntry(ordered[0]);

  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const flightNumbers = uniqueOrdered(ordered.map(e => e.flightNumber));
  const routeLabels = uniqueOrdered(
    ordered.map(e => e.routeLabel || (e.depCode && e.arrCode ? `${e.depCode}-${e.arrCode}` : ''))
  );
  const groups = uniqueOrdered(ordered.map(e => e.group));
  const leaders = uniqueOrdered(ordered.map(e => e.tourLeader));
  const status = statusOf(ordered);

  return publicEntry({
    ...first,
    id: `${first.id || 'flight'}_combo`,
    flightNumber: flightNumbers.join(' / ') || first.flightNumber,
    group: groups.join(', '),
    status,
    depCity: first.depCity,
    depCode: first.depCode,
    depTerminal: first.depTerminal,
    depGate: first.depGate,
    depScheduled: first.depScheduled,
    depActual: first.depActual,
    depDate: first.depDate,
    arrCity: last.arrCity,
    arrCode: last.arrCode,
    arrTerminal: last.arrTerminal,
    arrGate: last.arrGate,
    arrScheduled: last.arrScheduled,
    arrEstimated: last.arrEstimated,
    pax: sumPaxOncePerSource(ordered),
    tourLeader: leaders.join(', '),
    jamaah: dedupeJamaah(ordered),
    progress: progressFor(status, first, last),
    delayed: Math.max(...ordered.map(e => Number(e.delayed) || 0)),
    duration: sumUniqueDuration(ordered),
    depDelayed: first.depDelayed || 0,
    arrDelayed: last.arrDelayed || 0,
    arrBaggage: last.arrBaggage || null,
    calendarDepTime: first.calendarDepTime,
    calendarArrTime: last.calendarArrTime,
    routeLabel: routeLabels.length > 1 ? routeLabels.join(' / ') : null,
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
