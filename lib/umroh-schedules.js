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

function compareScheduleRows(a, b) {
  const aDate = a?.berangkat_tgl || '9999-12-31';
  const bDate = b?.berangkat_tgl || '9999-12-31';
  const byDate = String(aDate).localeCompare(String(bDate));
  if (byDate !== 0) return byDate;
  return String(a?.jadwal_id || '').localeCompare(String(b?.jadwal_id || ''));
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
    .filter(row => row?.jadwal_id && hasValidPricing(row.paket_harga))
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
    if (journeyOrder) out.journey_order = journeyOrder;

    if (out.brosur_cdn) out.brosur = out.brosur_cdn;
    if (out.itinerary_cdn) out.itinerary = out.itinerary_cdn;
    delete out.brosur_cdn;
    delete out.itinerary_cdn;
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
