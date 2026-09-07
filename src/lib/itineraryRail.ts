/**
 * Logika murni rail itinerary — dipisah dari komponennya supaya jalur degradasi
 * bisa diuji tanpa jaringan dan tanpa render.
 *
 * Endpoint /api/itinerary/:jadwalId SAH mengembalikan 404 ("Itinerary belum
 * tersedia", paket tanpa sumber PDF) dan 503 ("sedang disinkronkan"). Keduanya
 * kondisi normal, bukan kegagalan — rail kiri meneruskannya sebagai `error` ke
 * WebItineraryView, yang menawarkan dokumen PDF sebagai jalan keluar.
 */

export interface ItineraryActivity {
  time: string;
  text: string;
}

export interface ItineraryDay {
  dayNumber?: string;
  title?: string;
  location?: string | null;
  activities?: Array<ItineraryActivity | string>;
}

/**
 * Daftar hari dari respons endpoint, atau `null` bila itinerary tidak tersedia.
 *
 * `null` sengaja dipakai untuk SEMUA bentuk ketidaktersediaan — 404, 503, badan
 * tak berbentuk, dan `days` kosong. Nol hari bukan itinerary; mengembalikan
 * array kosong akan membuat rail menampilkan kerangka tanpa isi, bukan jalur
 * degradasi yang benar.
 */
export function daysFromResponse(status: number, body: unknown): ItineraryDay[] | null {
  if (status !== 200) return null;
  const data = (body as { success?: boolean; data?: { days?: unknown } } | null)?.data;
  if (!(body as { success?: boolean } | null)?.success) return null;
  const days = data?.days;
  if (!Array.isArray(days) || days.length === 0) return null;
  return days as ItineraryDay[];
}
