/**
 * Data Service for Alhijaz Indowisata Umroh Packages
 * Handles fetching and transforming package data from the API
 */

import type {
  ApiResponse,
  UmrohPackage,
  UmrohPackageRaw,
  PackagePricing,
  PackageHotels,
  HotelInfo,
} from '../types/umroh-package';

// ============================================
// Constants
// ============================================

// Always use proxy to bypass CORS (works in both dev and production)
const API_BASE_URL = '/api/schedules';
const DEFAULT_YEAR_CODE = '1448'; // Hijri year code

// ============================================
// Cache Constants
// ============================================

const PACKAGES_CACHE_PREFIX = 'umroh_packages_cache_v2_';
const PACKAGES_CACHE_TTL_MS = 30 * 60 * 1000; // 30 menit

// ============================================
// Cache Types & Helpers
// ============================================

interface PackagesCacheData {
  timestamp: number;
  apiResponse: ApiResponse;
}

/**
 * Save API response to localStorage cache
 */
function savePackagesToCache(yearCode: string, apiResponse: ApiResponse): void {
  try {
    const data: PackagesCacheData = {
      timestamp: Date.now(),
      apiResponse,
    };
    localStorage.setItem(PACKAGES_CACHE_PREFIX + yearCode, JSON.stringify(data));
    console.log(`[data-service] Cache saved for year ${yearCode}`);
  } catch {
    // localStorage penuh atau tidak tersedia — abaikan
    console.warn('[data-service] Failed to save cache (storage full?)');
  }
}

/**
 * Load API response from localStorage cache.
 * Returns null if cache doesn't exist or is expired.
 */
function loadPackagesFromCache(yearCode: string): { data: ApiResponse; age: number } | null {
  try {
    const raw = localStorage.getItem(PACKAGES_CACHE_PREFIX + yearCode);
    if (!raw) return null;

    const cached: PackagesCacheData = JSON.parse(raw);
    const age = Date.now() - cached.timestamp;

    if (age > PACKAGES_CACHE_TTL_MS) {
      // Cache expired — tapi tetap return data untuk stale-while-revalidate
      return { data: cached.apiResponse, age };
    }

    return { data: cached.apiResponse, age };
  } catch {
    return null;
  }
}

/**
 * Check if packages cache is still fresh (not expired)
 */
export function isPackagesCacheFresh(yearCode: string = DEFAULT_YEAR_CODE): boolean {
  try {
    const raw = localStorage.getItem(PACKAGES_CACHE_PREFIX + yearCode);
    if (!raw) return false;
    const cached: PackagesCacheData = JSON.parse(raw);
    return (Date.now() - cached.timestamp) < PACKAGES_CACHE_TTL_MS;
  } catch {
    return false;
  }
}

// ============================================
// Transform Functions
// ============================================

/**
 * Normalize URLs from the API that may use a raw IP address.
 * Replaces http(s)://115.124.86.220 with https://jadwal.alhijaz.co
 */
function normalizeApiUrl(url: string | undefined | null): string {
  if (!url) return '';
  return url.replace(/^https?:\/\/115\.124\.86\.220/i, 'https://jadwal.alhijaz.co');
}

/**
 * Parse a combined hotel string from the new API format.
 * e.g. "PULLMAN ZAMZAM/SETARAF (⭐5)" → { name: "PULLMAN ZAMZAM/SETARAF", star: "5" }
 */
function parseHotelString(value: string): { name: string; star: string } {
  // Match star character (★ U+2605 or ⭐ U+2B50) followed by a digit, e.g. (★5) or (⭐5)
  const starMatch = value.match(/\([★⭐](\d)\)\s*$/);
  const star = starMatch ? starMatch[1] : '0';
  const name = value.replace(/\s*\([★⭐]\d\)\s*$/, '').trim();
  return { name, star };
}

/**
 * Transform raw API hotel data to typed HotelInfo.
 * Handles both old format (mekkah_hotel, mekkah_bintang) and
 * new format (mekkah: "NAME (⭐N)").
 */
function transformHotelInfo(rawHotel: Record<string, string>): HotelInfo {
  // Detect new API format: keys are city names without _hotel suffix
  if ('mekkah' in rawHotel || 'madinah' in rawHotel) {
    const result: Record<string, string> = {};
    for (const [city, value] of Object.entries(rawHotel)) {
      const { name, star } = parseHotelString(value);
      result[`${city}_hotel`] = name;
      result[`${city}_bintang`] = star;
    }
    return result as unknown as HotelInfo;
  }
  // Old format: pass through as-is
  return rawHotel as unknown as HotelInfo;
}

/**
 * Transform raw API package data to typed UmrohPackage
 */
function transformPackage(raw: UmrohPackageRaw): UmrohPackage {
  // Transform hotel tiers
  const hotel: PackageHotels = {};
  for (const [tier, hotelData] of Object.entries(raw.paket_hotel)) {
    hotel[tier] = transformHotelInfo(hotelData);
  }

  return {
    // Basic Info
    jadwalId: raw.jadwal_id,
    nama: raw.jadwal_nama,
    isPromo: raw.promo === '1',

    // Seat Availability
    seatTotal: parseInt(raw.seat_total, 10),
    seatSisa: parseInt(raw.seat_sisa, 10),

    // Airline
    maskapai: raw.maskapai,

    // Departure Flight
    keberangkatan: {
      tgl: raw.berangkat_tgl,
      jam: raw.berangkat_jam,
      rute: raw.berangkat_rute,
      kodePenerbangan: raw.berangkat_kode_penerbangan,
    },

    // Return Flight
    kepulangan: {
      tgl: raw.pulang_tgl,
      jam: raw.pulang_jam,
      rute: raw.pulang_rute,
      kodePenerbangan: raw.pulang_kode_penerbangan,
    },

    // Manasik
    manasikTanggal: raw.manasik_tgl,
    manasikJam: raw.manasik_jam,

    // Documents
    brosurUrl: normalizeApiUrl(raw.brosur),
    itineraryUrl: normalizeApiUrl(raw.itinerary),

    // Pricing
    perlengkapanHarga: raw.perlengkapan_harga,
    harga: raw.paket_harga as PackagePricing,

    // Hotels
    hotel,

    // Journey order from parsed itinerary (preferred over flight-route inference)
    journeyOrder: Array.isArray(raw.journey_order) ? raw.journey_order : undefined,
  };
}

// ============================================
// API Functions
// ============================================

export interface GetPackagesOptions {
  /**
   * Hijri year code (default: "1448")
   */
  yearCode?: string;
  
  /**
   * Request timeout in milliseconds (default: 10000)
   */
  timeout?: number;
  
  /**
   * Custom fetch options
   */
  fetchOptions?: RequestInit;

  /**
   * Skip cache and force fetch from API (default: false)
   */
  forceRefresh?: boolean;

  /**
   * Silent mode — don't throw on error, used for background refresh (default: false)
   */
  silent?: boolean;
}

export interface GetPackagesResult {
  /** Whether the request was successful */
  success: boolean;
  /** List of transformed Umroh packages */
  packages: UmrohPackage[];
  /** Total number of records from API */
  totalRecords: number;
  /** Error message if request failed */
  error?: string;
  /** Whether data came from local cache */
  fromCache?: boolean;
  /** Age of cached data in milliseconds */
  cacheAge?: number;
}

/**
 * Fetch Umroh packages — cache-first with stale-while-revalidate.
 *
 * 1. If valid cache exists (< 1 hour) → return cached data immediately
 * 2. If stale cache exists (> 1 hour) → return cached data + flag fromCache
 * 3. If no cache → fetch from API
 * 
 * @example
 * ```typescript
 * const result = await getPackages();
 * if (result.success) {
 *   console.log(`Found ${result.packages.length} packages`);
 *   if (result.fromCache) console.log('Data dari cache');
 * }
 * ```
 */
export async function getPackages(
  options: GetPackagesOptions = {}
): Promise<GetPackagesResult> {
  const {
    yearCode = DEFAULT_YEAR_CODE,
    timeout = 10000,
    fetchOptions = {},
    forceRefresh = false,
    silent = false,
  } = options;

  // ── Step 1: Try cache first (unless forceRefresh) ──
  if (!forceRefresh) {
    const cached = loadPackagesFromCache(yearCode);
    if (cached) {
      const isFresh = cached.age < PACKAGES_CACHE_TTL_MS;
      const packages = cached.data.aaData.map(transformPackage);

      if (isFresh) {
        console.log(`[data-service] ⚡ Cache HIT (${Math.round(cached.age / 1000)}s old, fresh)`);
        return {
          success: true,
          packages,
          totalRecords: cached.data.iTotalDisplayRecords,
          fromCache: true,
          cacheAge: cached.age,
        };
      }

      // Stale cache — return it but caller should revalidate
      console.log(`[data-service] ⏳ Cache STALE (${Math.round(cached.age / 60000)}min old)`);
      return {
        success: true,
        packages,
        totalRecords: cached.data.iTotalDisplayRecords,
        fromCache: true,
        cacheAge: cached.age,
      };
    }
  }

  // ── Step 2: Fetch from API ──
  return fetchFromApi(yearCode, timeout, fetchOptions, silent);
}

/**
 * Force fetch from API, bypassing cache. Updates cache on success.
 */
export async function refreshPackages(
  options: GetPackagesOptions = {}
): Promise<GetPackagesResult> {
  return getPackages({ ...options, forceRefresh: true });
}

/**
 * Internal: fetch data from the real API and update cache
 */
async function fetchFromApi(
  yearCode: string,
  timeout: number,
  fetchOptions: RequestInit,
  silent: boolean,
): Promise<GetPackagesResult> {
  const url = `${API_BASE_URL}/${yearCode}`;

  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
      signal: controller.signal,
      ...fetchOptions,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: ApiResponse = await response.json();

    if (data.status !== 'ok') {
      throw new Error('API returned error status');
    }

    // Save to cache
    savePackagesToCache(yearCode, data);

    // Transform raw data to typed packages
    const packages = data.aaData.map(transformPackage);

    console.log(`[data-service] ✅ API fetch success — ${packages.length} packages cached`);

    return {
      success: true,
      packages,
      totalRecords: data.iTotalDisplayRecords,
      fromCache: false,
      cacheAge: 0,
    };
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Unknown error occurred';

    if (!silent) {
      console.error('[data-service] Error fetching packages:', errorMessage);
    }

    return {
      success: false,
      packages: [],
      totalRecords: 0,
      error: errorMessage,
    };
  }
}

/**
 * Fetch a single package by its ID
 * 
 * @example
 * ```typescript
 * const pkg = await getPackageById('JBU1500');
 * if (pkg) {
 *   console.log(pkg.nama);
 * }
 * ```
 */
export async function getPackageById(
  jadwalId: string,
  options: GetPackagesOptions = {}
): Promise<UmrohPackage | null> {
  const result = await getPackages(options);
  
  if (!result.success) {
    return null;
  }

  return result.packages.find(pkg => pkg.jadwalId === jadwalId) || null;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Filter packages by promo status
 */
export function filterPromoPackages(packages: UmrohPackage[]): UmrohPackage[] {
  return packages.filter(pkg => pkg.isPromo);
}

/**
 * Filter packages by airline
 */
export function filterByAirline(
  packages: UmrohPackage[], 
  airline: string
): UmrohPackage[] {
  return packages.filter(pkg => 
    pkg.maskapai.toLowerCase() === airline.toLowerCase()
  );
}

/**
 * Filter packages with available seats
 */
export function filterAvailable(packages: UmrohPackage[]): UmrohPackage[] {
  return packages.filter(pkg => pkg.seatSisa > 0);
}

/**
 * Get minimum price from a package (Double room, lowest tier)
 */
export function getMinimumPrice(pkg: UmrohPackage): number | null {
  let minPrice: number | null = null;

  for (const tierPricing of Object.values(pkg.harga)) {
    const prices = [
      tierPricing.Quard, // Note: The API/Type uses 'Quard' instead of 'Quad'
      tierPricing.Triple,
      tierPricing.Double
    ];

    for (const priceStr of prices) {
      if (priceStr) {
        const price = parseInt(priceStr, 10);
        if (price > 0 && (minPrice === null || price < minPrice)) {
          minPrice = price;
        }
      }
    }
  }

  return minPrice;
}

/**
 * Format price to Indonesian Rupiah
 */
export function formatPrice(price: number | string): string {
  const numPrice = typeof price === 'string' ? parseInt(price, 10) : price;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numPrice);
}

/**
 * Calculate trip duration in days
 */
export function calculateDuration(pkg: UmrohPackage): number {
  // Primary: extract from package name (e.g. "PLUS TURKEY 15HR (KERETA CEPAT)")
  // This is the most reliable source — date-based calculation can be wrong
  // for multi-leg packages (Turkey, Cairo) where keberangkatan/kepulangan
  // only cover the Saudi Arabia flight leg.
  const match = pkg.nama.match(/(\d+)\s*HR\b/i);
  if (match) return parseInt(match[1], 10);

  // Fallback: calculate from departure/return dates
  const departure = new Date(pkg.keberangkatan.tgl);
  const returnDate = new Date(pkg.kepulangan.tgl);
  const diffTime = Math.abs(returnDate.getTime() - departure.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays + 1; // Include both departure and return days
}

/**
 * Sort packages by departure date (ascending)
 */
export function sortByDepartureDate(packages: UmrohPackage[]): UmrohPackage[] {
  return [...packages].sort((a, b) => 
    new Date(a.keberangkatan.tgl).getTime() - new Date(b.keberangkatan.tgl).getTime()
  );
}

/**
 * Sort packages by minimum price (ascending)
 */
export function sortByPrice(packages: UmrohPackage[]): UmrohPackage[] {
  return [...packages].sort((a, b) => {
    const priceA = getMinimumPrice(a) || Infinity;
    const priceB = getMinimumPrice(b) || Infinity;
    return priceA - priceB;
  });
}
