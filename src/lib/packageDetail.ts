/**
 * Turunan data paket yang dipakai BERSAMA oleh kartu jadwal dan rail desktop.
 *
 * Sebelumnya keempat perhitungan ini hidup di dalam PackageCard.tsx. Rail harus
 * menghitung hal yang persis sama; kalau masing-masing punya salinannya sendiri,
 * hotel plus bisa muncul di kartu tapi hilang di rail tanpa ada yang menyadari.
 *
 * Murni dan tanpa React — bisa diuji langsung di node lewat tests/package-detail.test.js.
 */
import { getDistance } from '@/data/hotelService';
import { lookupHotelMetadata } from '@/data/hotelMetadata';
import type { PackagePricing } from '@/types';

export interface ExtraHotel {
  city: string;
  name: string;
  star: string;
}

/**
 * Kota transit/plus yang mungkin muncul di payload, dengan label bacanya.
 * Urutannya menentukan urutan tampil — sengaja tetap, bukan mengikuti urutan
 * kunci payload yang tidak dijamin.
 */
const PLUS_CITIES: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'istanbul', label: 'Istanbul' },
  { key: 'bursa', label: 'Bursa' },
  { key: 'ankara', label: 'Ankara' },
  { key: 'cappadocia', label: 'Cappadocia' },
  { key: 'cairo', label: 'Cairo' },
  { key: 'alexandria', label: 'Alexandria' },
  { key: 'dubai', label: 'Dubai' },
  { key: 'aqsha', label: 'Aqsha' },
  { key: 'amman', label: 'Amman' },
  { key: 'petra', label: 'Petra' },
  { key: 'haikou', label: 'Haikou' },
];

/**
 * Daftar tier paket (HEMAT, UHUD, RAHMAH, …).
 * "Hemat" selalu di-hoist ke posisi pertama; sisanya mempertahankan urutan asli
 * lewat sort yang stabil.
 */
export function tiersOf(harga: PackagePricing | null | undefined): string[] {
  if (!harga) return [];
  return Object.keys(harga).sort(
    (a, b) => Number(b.trim().toLowerCase() === 'hemat') - Number(a.trim().toLowerCase() === 'hemat'),
  );
}

/**
 * Hotel kota plus/transit untuk tier aktif.
 *
 * Kota-kota ini bersifat itinerary-wide, BUKAN per-tier — tier hanya membedakan
 * hotel Mekkah/Madinah. Upstream kadang hanya mengisi hotel kota ini di salah
 * satu tier (mis. UHUD), sehingga HEMAT/RAHMAH kosong. Karena itu ada fallback
 * ke tier lain, dengan tier aktif tetap menang bila punya nilai sendiri.
 *
 * @param hotelInfo blok hotel milik tier aktif (`pkg.hotel[activeTier]`)
 * @param allHotels seluruh blok hotel paket (`pkg.hotel`), sumber fallback
 */
export function extraHotelsOf(
  hotelInfo: unknown,
  allHotels: Record<string, unknown> | null | undefined,
): ExtraHotel[] {
  if (!hotelInfo) return [];

  const info = hotelInfo as Record<string, string | undefined>;
  const otherTiers = Object.values(allHotels || {}) as Array<Record<string, string | undefined> | null>;
  const extras: ExtraHotel[] = [];

  for (const city of PLUS_CITIES) {
    let hotelName = info[`${city.key}_hotel`];
    let hotelStar = info[`${city.key}_bintang`] || '0';

    if (!hotelName) {
      const fallback = otherTiers.find((tier) => tier && tier[`${city.key}_hotel`]);
      if (fallback) {
        hotelName = fallback[`${city.key}_hotel`];
        hotelStar = fallback[`${city.key}_bintang`] || '0';
      }
    }

    if (hotelName) extras.push({ city: city.label, name: hotelName, star: hotelStar });
  }

  return extras;
}

/** Bintang hotel — payload menang, "0" dianggap kosong lalu jatuh ke metadata lokal. */
export function hotelStarsOf(name?: string, stars?: string): string {
  const raw = String(stars || '').trim();
  if (raw && raw !== '0') return raw;
  return lookupHotelMetadata(name || '').stars || '';
}

/** Jarak ke pelataran masjid — payload menang, lalu metadata lokal, lalu tabel hotel. */
export function hotelDistanceOf(name?: string, distance?: string): string {
  return String(distance || '').trim() || lookupHotelMetadata(name || '').distance || getDistance(name || '');
}

/**
 * Sel tabel harga: "Rp 1.234.567" bila sah, "-" polos bila tidak.
 *
 * "-" sengaja TANPA prefix "Rp" — "Rp -" terbaca seperti harga nol, bukan
 * "harga tidak tersedia".
 */
export function formatHargaCell(price: string | undefined | null): string {
  if (!price) return '-';
  const num = parseInt(String(price), 10);
  if (!Number.isFinite(num)) return '-';
  return `Rp ${new Intl.NumberFormat('id-ID').format(num)}`;
}
