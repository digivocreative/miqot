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
const API_BASE_URL = '/api/api-get';
const DEFAULT_YEAR_CODE = '1448'; // Hijri year code

// ============================================
// Transform Functions
// ============================================

/**
 * Transform raw API hotel data to typed HotelInfo
 */
function transformHotelInfo(rawHotel: Record<string, string>): HotelInfo {
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
    brosurUrl: raw.brosur,
    itineraryUrl: raw.itinerary,

    // Pricing
    perlengkapanHarga: raw.perlengkapan_harga,
    harga: raw.paket_harga as PackagePricing,

    // Hotels
    hotel,
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
}

/**
 * Fetch Umroh packages from the Alhijaz API
 * 
 * @example
 * ```typescript
 * const result = await getPackages();
 * if (result.success) {
 *   console.log(`Found ${result.packages.length} packages`);
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
  } = options;

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

    // Transform raw data to typed packages
    const packages = data.aaData.map(transformPackage);

    return {
      success: true,
      packages,
      totalRecords: data.iTotalDisplayRecords,
    };
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Unknown error occurred';

    console.error('[getPackages] Error fetching packages:', errorMessage);

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
