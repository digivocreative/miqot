function normalizeSha256(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Status cache itinerary terhadap PDF yang saat ini tercatat di jadwal.
 *
 * `unverified` tetap boleh dipakai untuk kompatibilitas row lama yang belum
 * mempunyai fingerprint sumber. Begitu fingerprint sumber tersedia, cache
 * tanpa fingerprint atau dengan fingerprint berbeda wajib dianggap basi.
 */
export function itineraryCacheFreshness(cached, schedule) {
  if (!cached) return 'missing';

  const sourceSha = normalizeSha256(schedule?.itinerary_source_sha256);
  if (!sourceSha) return 'unverified';

  const cachedSha = normalizeSha256(cached?.source_sha256);
  return cachedSha === sourceSha ? 'fresh' : 'stale';
}

export function canServeItineraryCache(cached, schedule) {
  const freshness = itineraryCacheFreshness(cached, schedule);
  return freshness === 'fresh' || freshness === 'unverified';
}

/**
 * Satu jadwal_id kadang muncul di dua tahun aktif saat masa transisi. Pilih
 * row yang mempunyai fingerprint + salinan CDN paling lengkap agar pembanding
 * cache dan sumber deterministik.
 */
export function pickCurrentItinerarySchedule(rows = []) {
  return [...(rows || [])]
    .filter(row => row?.jadwal_id)
    .sort((a, b) => {
      const score = row => (
        (normalizeSha256(row?.itinerary_source_sha256) ? 4 : 0)
        + (row?.itinerary_cdn ? 2 : 0)
        + (row?.itinerary ? 1 : 0)
      );
      return score(b) - score(a);
    })[0] || null;
}
