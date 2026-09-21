// Cache in-memory respons GET /api/schedules/:yearCode.
//
// Endpoint itu dipanggil ~830x/hari dan tiap request menjalankan 2 query
// PostgREST berurutan + inferensi urutan perjalanan dari itinerary (~160–180 ms
// server). Datanya sendiri hanya berubah saat ScheduleSync / BunnySync menulis
// ke umroh_schedules, jadi payload yang sudah dibangun aman dipakai ulang
// sebentar. TTL pendek (60 dtk) membatasi jendela basi untuk penulis lain
// (ItinerarySync, cleanup) yang tidak memanggil invalidate().
//
// Dipisah dari server.js supaya bisa diuji tanpa memuat server (pola lib/*.js).

export const SCHEDULE_RESPONSE_CACHE_TTL_MS = 60 * 1000;

/**
 * @param {{ ttlMs?: number, now?: () => number }} [options]
 *   now: sumber waktu (bisa disuntik di tes).
 */
export function createScheduleResponseCache({ ttlMs = SCHEDULE_RESPONSE_CACHE_TTL_MS, now = Date.now } = {}) {
  /** @type {Map<string, { body: unknown, ts: number }>} */
  const entries = new Map();

  return {
    /** Payload yang masih segar, atau null bila tidak ada / sudah lewat TTL. */
    get(yearCode) {
      const entry = entries.get(yearCode);
      if (!entry) return null;
      if (now() - entry.ts >= ttlMs) {
        entries.delete(yearCode);
        return null;
      }
      return entry.body;
    },
    /** Simpan payload sukses apa adanya (referensi yang sama dikembalikan get()). */
    set(yearCode, body) {
      entries.set(yearCode, { body, ts: now() });
    },
    /** Buang semua tahun sekaligus — dipanggil di akhir siklus sync. */
    invalidate() {
      entries.clear();
    },
    get size() {
      return entries.size;
    },
  };
}
