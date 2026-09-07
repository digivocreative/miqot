/**
 * Logika murni rail itinerary — dipisah dari komponennya supaya jalur degradasi
 * bisa diuji tanpa jaringan dan tanpa render.
 *
 * Endpoint /api/itinerary/:jadwalId SAH mengembalikan 404 ("Itinerary belum
 * tersedia", paket tanpa sumber PDF) dan 503 ("sedang disinkronkan"). Keduanya
 * kondisi normal, bukan kegagalan — rail kiri harus tetap terisi lewat
 * pkg.journeyOrder, tidak boleh kosong-melompong.
 */

// splitDayTitleDate hidup di lib/ tapi BUKAN server-only — DayRail dan
// ItineraryDocument juga memakainya. Dari src/lib/ naik dua tingkat ke akar repo.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error modul JS tanpa deklarasi tipe
import { splitDayTitleDate } from '../../lib/itinerary-view.js';

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

/** Pemisah rute antar-kota yang dipakai sumber: en-dash, em-dash, atau hubung. */
const ROUTE_SEPARATOR = /\s*[–—-]\s*/;

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

/**
 * Kota tempat sebuah hari BERAKHIR — di situlah jamaah bermalam.
 * "Jakarta – Madinah" berakhir di Madinah, bukan dimulai di Jakarta.
 */
export function dayCityLabel(day: ItineraryDay | null | undefined): string | null {
  const raw = String(day?.location || '').trim();
  if (!raw) return null;
  const parts = raw.split(ROUTE_SEPARATOR).map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

/**
 * Malam per kota, urut kemunculan.
 *
 * Aturannya: satu malam untuk tiap hari yang BERAKHIR di kota itu, kecuali hari
 * terakhir (hari kepulangan — tidak ada malam sesudahnya) dan kota asal (kota
 * tempat hari pertama dimulai).
 *
 * Batasnya diketahui: paket yang terbang pulang larut dari kota transit akan
 * tercatat 1 malam di sana. Konsekuensinya kecil dan hanya di strip chip; yang
 * penting Makkah dan Madinah selalu benar.
 */
export function nightsByCity(days: ItineraryDay[]): Array<{ city: string; nights: number }> {
  if (!Array.isArray(days) || days.length === 0) return [];

  const originRaw = String(days[0]?.location || '').trim();
  const origin = originRaw ? originRaw.split(ROUTE_SEPARATOR)[0]?.trim() : null;

  const counts = new Map<string, number>();
  for (const day of days.slice(0, -1)) {
    const city = dayCityLabel(day);
    if (!city || city === origin) continue;
    counts.set(city, (counts.get(city) ?? 0) + 1);
  }

  return [...counts].map(([city, nights]) => ({ city, nights }));
}

/** Baris ringkas di bawah judul hari — aktivitas pertama, apa pun bentuknya. */
export function activitySummary(day: ItineraryDay | null | undefined): string {
  const first = day?.activities?.[0];
  if (!first) return '';
  if (typeof first === 'string') return first;
  const time = String(first.time || '').trim();
  const text = String(first.text || '').trim();
  return time && text ? `${time} · ${text}` : text || time;
}

/**
 * Dua baris judul satu hari di rail.
 *
 * PDF sumber sering menulis judul hari sebagai TANGGAL ("Sabtu, 03 Oktober
 * 2026") dan menaruh kotanya di `location`. Menampilkan tanggal sebagai baris
 * utama membuat rail terbaca seperti kalender, bukan rute — padahal yang
 * ditanya jamaah adalah "hari ketiga di mana?". Karena itu kota menang sebagai
 * baris utama dan tanggalnya turun ke baris kedua.
 */
export function dayHeadline(day: ItineraryDay | null | undefined): { primary: string; secondary: string } {
  const { rest, dateText } = splitDayTitleDate(day?.title) as { rest: string; dateText: string | null };
  const location = String(day?.location || '').trim();
  const primary = rest || location || dateText || '';
  const secondary = primary === location || !location ? dateText || '' : location;
  return { primary, secondary };
}
