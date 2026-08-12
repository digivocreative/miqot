export function hasValidPricing(paketHarga) {
  if (!paketHarga || typeof paketHarga !== 'object') return false;
  for (const hotelTier of Object.values(paketHarga)) {
    if (!hotelTier || typeof hotelTier !== 'object') continue;
    for (const [roomType, price] of Object.entries(hotelTier)) {
      if (!roomType) continue;
      const n = Number(price);
      if (Number.isFinite(n) && n > 0) return true;
    }
  }
  return false;
}

function hasAvailableSeat(row) {
  const n = Number(row?.seat_sisa);
  return Number.isFinite(n) && n > 0;
}

export function shouldKeepScheduleRow(row) {
  if (!row?.jadwal_id) return false;
  return hasValidPricing(row.paket_harga) || hasAvailableSeat(row);
}

function compareScheduleRows(a, b) {
  const aDate = a?.berangkat_tgl || '9999-12-31';
  const bDate = b?.berangkat_tgl || '9999-12-31';
  const byDate = String(aDate).localeCompare(String(bDate));
  if (byDate !== 0) return byDate;
  return String(a?.jadwal_id || '').localeCompare(String(b?.jadwal_id || ''));
}

export function appendUrlVersion(url, sha256) {
  const version = typeof sha256 === 'string' && sha256.length >= 8
    ? sha256.slice(0, 16)
    : '';
  if (!url || !version) return url;
  const separator = String(url).includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(version)}`;
}

function normalizeSha256(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[a-f0-9]{16,}$/.test(normalized) ? normalized : '';
}

/**
 * Content-addressed Bunny objects end in `-<sha16>.<ext>`.  When the database
 * hash and the object-name hash disagree, the row is between document
 * versions (or was only partially updated) and that CDN object must not win
 * over the current source URL.
 *
 * Legacy CDN objects did not carry a hash in their name.  They remain usable
 * only while no source fingerprint exists; once a current fingerprint is
 * known, readers fail closed to the source URL instead of trusting an object
 * whose provenance cannot be proven.
 */
export function cdnAssetMatchesSourceFingerprint(cdnUrl, sourceSha256, { requireFingerprint = false } = {}) {
  if (!cdnUrl) return false;

  const sourceSha = normalizeSha256(sourceSha256);
  if (!sourceSha) return !requireFingerprint;

  let pathname = '';
  try {
    pathname = new URL(String(cdnUrl), 'https://cdn.invalid').pathname;
  } catch {
    return !requireFingerprint;
  }

  const embedded = pathname.match(/-([a-f0-9]{16})(?:\.[a-z0-9]+)?$/i)?.[1]?.toLowerCase() || '';
  if (!embedded) return !requireFingerprint;
  return sourceSha.startsWith(embedded);
}

export function resolveScheduleBrochureUrl(row) {
  if (
    row?.brosur_cdn
    && cdnAssetMatchesSourceFingerprint(
      row.brosur_cdn,
      row.brosur_source_sha256,
      { requireFingerprint: true },
    )
  ) {
    return appendUrlVersion(row.brosur_cdn, row.brosur_source_sha256);
  }
  return row?.brosur || null;
}

export function resolveScheduleBrochureThumbUrl(row) {
  if (
    row?.brosur_thumb_cdn
    && cdnAssetMatchesSourceFingerprint(
      row.brosur_thumb_cdn,
      row.brosur_source_sha256,
      { requireFingerprint: true },
    )
  ) {
    return row.brosur_thumb_cdn;
  }
  return null;
}

export function buildScheduleRows(cachedRows = [], upstreamRows = null, yearCode = '') {
  if (!Array.isArray(upstreamRows)) {
    return [...(cachedRows || [])].sort(compareScheduleRows);
  }

  const cachedById = new Map(
    (cachedRows || [])
      .filter(row => row?.jadwal_id)
      .map(row => [row.jadwal_id, row])
  );

  return upstreamRows
    .filter(shouldKeepScheduleRow)
    .map(row => {
      const cached = cachedById.get(row.jadwal_id) || {};
      return {
        ...cached,
        ...row,
        year_code: yearCode || cached.year_code,
        brosur_cdn: cached.brosur_cdn || row.brosur_cdn,
        itinerary_cdn: cached.itinerary_cdn || row.itinerary_cdn,
        synced_at: cached.synced_at,
      };
    })
    .sort(compareScheduleRows);
}

export function serializeScheduleRows(rows = [], journeyOrderById = new Map()) {
  return (rows || []).map(row => {
    const out = { ...row };
    const journeyOrder = journeyOrderById.get(row.jadwal_id);
    if (journeyOrder) {
      out.journey_order = journeyOrder;
      out.journey_order_source = 'itinerary';
    }

    out.brosur = resolveScheduleBrochureUrl(out);
    if (out.itinerary_cdn) out.itinerary = appendUrlVersion(out.itinerary_cdn, out.itinerary_source_sha256);
    delete out.brosur_cdn;
    delete out.brosur_thumb_cdn;
    delete out.itinerary_cdn;
    delete out.brosur_source_sha256;
    delete out.brosur_source_bytes;
    delete out.brosur_source_content_type;
    delete out.brosur_cdn_synced_at;
    delete out.itinerary_source_sha256;
    delete out.itinerary_source_bytes;
    delete out.itinerary_source_content_type;
    delete out.itinerary_cdn_synced_at;
    delete out.synced_at;
    delete out.year_code;

    for (const key of Object.keys(out)) {
      if (out[key] === null && key !== 'paket_harga' && key !== 'paket_hotel') {
        out[key] = '';
      }
    }
    return out;
  });
}
