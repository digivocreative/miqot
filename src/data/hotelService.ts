/**
 * Hotel Distance Service
 *
 * Modul terpusat untuk mengelola data jarak hotel.
 * - Data diambil dari API paket Alhijaz (field mekkah_jarak, madinah_jarak).
 * - Di-cache di localStorage selama 24 jam, lalu auto-refresh.
 * - Fallback ke data hardcoded jika API belum pernah di-fetch.
 *
 * Cukup edit FALLBACK_DISTANCES jika ada perubahan data manual.
 */

import type { UmrohPackage } from '../types/umroh-package';
import { HOTEL_METADATA, lookupHotelMetadata, normalizeHotelName } from './hotelMetadata';

// ─── Config ───
const CACHE_KEY = 'hotel_distances_cache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 jam

// ─── Fallback (dipakai jika belum ada data dari API) ───
const FALLBACK_DISTANCES: Record<string, string> = Object.fromEntries(
  Object.entries(HOTEL_METADATA)
    .filter(([, meta]) => Boolean(meta.distance))
    .map(([name, meta]) => [name, meta.distance || ''])
);

// ─── In-memory database (populated from cache or API) ───
let DATABASE_HOTEL: Record<string, string> = { ...FALLBACK_DISTANCES };

// ─── Cache Helpers ───

interface CachedData {
  timestamp: number;
  distances: Record<string, string>;
}

/** Simpan data ke localStorage */
function saveToCache(distances: Record<string, string>): void {
  try {
    const data: CachedData = {
      timestamp: Date.now(),
      distances,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // localStorage penuh atau tidak tersedia — abaikan
  }
}

/** Ambil data dari localStorage, return null jika expired atau tidak ada */
function loadFromCache(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const data: CachedData = JSON.parse(raw);
    const age = Date.now() - data.timestamp;

    if (age > CACHE_TTL_MS) {
      // Cache expired
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    return data.distances;
  } catch {
    return null;
  }
}

/** Cek apakah cache masih valid (belum expired) */
export function isCacheValid(): boolean {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const data: CachedData = JSON.parse(raw);
    return (Date.now() - data.timestamp) < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

// ─── Normalisasi ───

function normalize(name: string): string {
  return normalizeHotelName(name);
}

// ─── Core Functions ───

/**
 * Extract semua nama hotel + jarak dari daftar paket API.
 * Dipanggil setelah `getPackages()` berhasil.
 */
export function buildDatabaseFromPackages(packages: UmrohPackage[]): void {
  const distances: Record<string, string> = { ...FALLBACK_DISTANCES };

  for (const pkg of packages) {
    for (const hotelInfo of Object.values(pkg.hotel)) {
      // Mekkah hotel
      if (hotelInfo.mekkah_hotel) {
        const key = normalize(hotelInfo.mekkah_hotel);
        const distance = hotelInfo.mekkah_jarak?.trim() || lookupHotelMetadata(hotelInfo.mekkah_hotel).distance || '';
        if (key && distance) {
          distances[key] = distance;
        }
      }

      // Madinah hotel
      if (hotelInfo.madinah_hotel) {
        const key = normalize(hotelInfo.madinah_hotel);
        const distance = hotelInfo.madinah_jarak?.trim() || lookupHotelMetadata(hotelInfo.madinah_hotel).distance || '';
        if (key && distance) {
          distances[key] = distance;
        }
      }
    }
  }

  // Update in-memory DB dan cache
  DATABASE_HOTEL = distances;
  saveToCache(distances);

  console.log(`[hotelService] Database updated: ${Object.keys(distances).length} hotels cached`);
}

/**
 * Inisialisasi database dari cache (panggil saat app startup).
 * Return true jika cache valid ditemukan, false jika perlu refresh dari API.
 */
export function initFromCache(): boolean {
  const cached = loadFromCache();
  if (cached) {
    DATABASE_HOTEL = cached;
    console.log(`[hotelService] Loaded ${Object.keys(cached).length} hotels from cache`);
    return true;
  }
  return false;
}

/**
 * Cari jarak hotel berdasarkan nama.
 * Normalisasi otomatis + partial matching.
 * @returns string jarak (misal "±450m") atau "" jika tidak ditemukan.
 */
export function getDistance(hotelName: string): string {
  const key = normalize(hotelName);

  // 1. Exact match
  if (DATABASE_HOTEL[key]) return DATABASE_HOTEL[key];

  // 2. Partial match
  for (const [dbKey, distance] of Object.entries(DATABASE_HOTEL)) {
    if (key.includes(dbKey) || dbKey.includes(key)) {
      return distance;
    }
  }

  return '';
}

/**
 * Otomatis inject info jarak ke dalam elemen card.
 * Mencari elemen teks hotel dan menambahkan badge jarak.
 */
export function injectDistancesToCard(cardElement: HTMLElement): void {
  const textElements = cardElement.querySelectorAll('span, div, p');

  textElements.forEach(el => {
    const text = el.textContent?.trim() || '';
    if (!text || text.length < 4) return;

    const distance = getDistance(text);
    if (!distance) return;

    // Hindari duplikasi
    const parent = el.parentElement;
    if (parent?.querySelector('[data-hotel-distance]')) return;

    const badge = document.createElement('span');
    badge.setAttribute('data-hotel-distance', 'true');
    badge.textContent = ` ${distance}`;
    Object.assign(badge.style, {
      fontSize: '10px',
      fontWeight: '600',
      color: '#059669',
      backgroundColor: '#ECFDF5',
      padding: '1px 6px',
      borderRadius: '4px',
      marginLeft: '6px',
      whiteSpace: 'nowrap',
    });

    el.appendChild(badge);
  });
}

/**
 * Dapatkan seluruh database hotel (untuk debugging/testing).
 */
export function getAllHotels(): Record<string, string> {
  return { ...DATABASE_HOTEL };
}
