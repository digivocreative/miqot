// Weather cache helpers — pure & unit-tested.
//
// Cuaca 6 kota di-fetch HANYA oleh server production (shouldRunBackgroundJobs)
// tiap 3 jam via cron, lalu dipersist ke tabel `weather_cache` (1 baris,
// id='cities'). Endpoint /api/weather/cities murni baca dari DB/memory —
// local dev tidak pernah memanggil Open-Meteo otomatis. Lihat
// docs/superpowers/specs/2026-06-04-weather-db-cache-design.md.

export function isWeatherRefreshDue(syncedAt, now, intervalMs) {
  if (!syncedAt) return true;
  const t = new Date(syncedAt).getTime();
  if (Number.isNaN(t)) return true;
  return now - t >= intervalMs;
}

// fresh = hasil fetch run ini; previous = array kota dari cache sebelumnya;
// cityKeys = urutan kanonik WEATHER_CITIES. Kota yang gagal di-fetch diisi
// dari previous; kota tanpa data sama sekali di-skip.
export function mergeWeatherResults(fresh, previous, cityKeys) {
  const freshByKey = new Map((fresh || []).map((c) => [c.key, c]));
  const prevByKey = new Map((previous || []).map((c) => [c.key, c]));
  const merged = [];
  for (const key of cityKeys) {
    const entry = freshByKey.get(key) || prevByKey.get(key);
    if (entry) merged.push(entry);
  }
  return merged;
}
