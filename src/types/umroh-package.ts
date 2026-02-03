/**
 * Type definitions for Alhijaz Indowisata Umroh Package API
 * API Endpoint: https://jadwal.alhijazindowisata-travel.co.id/jadwal/api-get/1448
 */

// ============================================
// Price Types (per room type)
// ============================================

/**
 * Available room types for pricing
 * - Single: Single room occupancy
 * - Double: Double room occupancy
 * - Triple: Triple room occupancy
 * - Quard: Quad room occupancy (4 persons)
 * - Infant: Infant pricing (under 2 years)
 */
export interface RoomPricing {
  Single?: string;
  Double?: string;
  Triple?: string;
  Quard?: string; // Note: API uses "Quard" not "Quad"
  Infant?: string;
}

/**
 * Package pricing tiers (e.g., HEMAT, UHUD, RAHMAH)
 * Key is the tier name, value is the room pricing
 */
export type PackagePricing = Record<string, RoomPricing>;

// ============================================
// Hotel Types
// ============================================

/**
 * Base hotel information for Saudi Arabia cities
 */
export interface SaudiHotelInfo {
  mekkah_hotel: string;
  mekkah_bintang: string; // Star rating (e.g., "4", "5")
  mekkah_jarak?: string;  // Distance to Masjidil Haram (e.g., "100m", "300m")
  madinah_hotel: string;
  madinah_bintang: string;
  madinah_jarak?: string; // Distance to Masjid Nabawi
}

/**
 * Hotel info for packages with Cairo extension
 */
export interface CairoHotelInfo extends SaudiHotelInfo {
  cairo_hotel: string;
  cairo_bintang: string;
}

/**
 * Hotel info for packages with Turkey extension
 */
export interface TurkeyHotelInfo extends SaudiHotelInfo {
  bursa_hotel?: string;
  bursa_bintang?: string;
  istanbul_hotel?: string;
  istanbul_bintang?: string;
  cappadocia_hotel?: string;
  cappadocia_bintang?: string;
  ankara_hotel?: string;
  ankara_bintang?: string;
}

/**
 * Union type for all possible hotel configurations
 */
export type HotelInfo = SaudiHotelInfo | CairoHotelInfo | TurkeyHotelInfo;

/**
 * Package hotel tiers (e.g., HEMAT, UHUD, RAHMAH)
 * Key is the tier name, value is the hotel information
 */
export type PackageHotels = Record<string, HotelInfo>;

// ============================================
// Flight Types
// ============================================

export interface FlightInfo {
  /** Departure date (YYYY-MM-DD format) */
  tgl: string;
  /** Departure time (HH.MM format) */
  jam: string;
  /** Route (e.g., "CGK - JED", "CGK - MED") */
  rute: string;
  /** Flight code (e.g., "GA 990", "SV 819") */
  kodePenerbangan: string;
}

// ============================================
// Main Package Type
// ============================================

/**
 * Complete Umroh Package data structure
 */
export interface UmrohPackage {
  // ---- Basic Info ----
  /** Unique package ID (e.g., "JBU1500") */
  jadwalId: string;
  /** Package name (e.g., "PLUS CAIRO + ALEXANDRIA 12HR (KERETA CEPAT)") */
  nama: string;
  /** Whether this is a promo package ("0" = no, "1" = yes) */
  isPromo: boolean;

  // ---- Seat Availability ----
  /** Total seats available */
  seatTotal: number;
  /** Remaining seats */
  seatSisa: number;

  // ---- Airline ----
  /** Airline name (e.g., "GARUDA", "SAUDIA", "HAINAN") */
  maskapai: string;

  // ---- Flight Info ----
  /** Departure flight information */
  keberangkatan: FlightInfo;
  /** Return flight information */
  kepulangan: FlightInfo;

  // ---- Manasik (Pre-departure briefing) ----
  /** Manasik date (YYYY-MM-DD format) */
  manasikTanggal: string;
  /** Manasik time (HH:MM:SS format) */
  manasikJam: string;

  // ---- Documents ----
  /** Brochure URL (can be empty string) */
  brosurUrl: string;
  /** Itinerary URL (can be empty string) */
  itineraryUrl: string;

  // ---- Pricing ----
  /** Equipment/perlengkapan price (usually "0") */
  perlengkapanHarga: string;
  /** Package pricing by tier (e.g., HEMAT, UHUD, RAHMAH) */
  harga: PackagePricing;

  // ---- Hotels ----
  /** Hotel information by tier */
  hotel: PackageHotels;
}

// ============================================
// API Response Types
// ============================================

/**
 * Raw API response item (as received from API)
 */
export interface UmrohPackageRaw {
  jadwal_id: string;
  jadwal_nama: string;
  promo: string; // "0" or "1"
  seat_total: string;
  seat_sisa: string;
  maskapai: string;
  berangkat_tgl: string;
  berangkat_jam: string;
  berangkat_rute: string;
  berangkat_kode_penerbangan: string;
  pulang_tgl: string;
  pulang_jam: string;
  pulang_rute: string;
  pulang_kode_penerbangan: string;
  manasik_tgl: string;
  manasik_jam: string;
  brosur: string;
  itinerary: string;
  perlengkapan_harga: string;
  paket_harga: Record<string, RoomPricing>;
  paket_hotel: Record<string, Record<string, string>>;
}

/**
 * API Response structure
 */
export interface ApiResponse {
  status: 'ok' | 'error';
  iTotalDisplayRecords: number;
  aaData: UmrohPackageRaw[];
}

// ============================================
// Utility Types
// ============================================

/**
 * Available airline options from the API
 */
export type Airline = 'GARUDA' | 'SAUDIA' | 'HAINAN';

/**
 * Package tier types
 */
export type PackageTier = 'HEMAT' | 'UHUD' | 'RAHMAH';

/**
 * Room type options
 */
export type RoomType = 'Single' | 'Double' | 'Triple' | 'Quard' | 'Infant';
