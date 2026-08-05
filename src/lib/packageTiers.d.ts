import type { PackageHotels, PackagePricing, RoomType } from '../types/umroh-package';

/** Bagian paket yang dipakai helper ini — `UmrohPackage` memenuhinya. */
export interface TieredPackage {
  harga: PackagePricing;
  hotel: PackageHotels;
}

/** Hotel satu kota-set: `mekkah_hotel`, `mekkah_bintang`, `mekkah_jarak`, dst. */
export type CityHotelMap = Record<string, string>;

/** Harga kamar termurah di satu tier; `Infant` tak ikut. 0 bila tier tak dijual. */
export function tierStartingPrice(pkg: TieredPackage | null | undefined, tier: string): number;

/** Nama tier yang punya minimal satu harga kamar terpakai, urut sesuai API. */
export function listPackageTiers(pkg: TieredPackage | null | undefined): string[];

/**
 * Tier dengan harga kamar terendah — default pilihan, sejalan dengan PackageCard
 * dan pickBrochurePackageDetails. Bila tak ada tier yang bisa dijual, jatuh ke
 * kunci pertama `harga` lalu `hotel` supaya kartunya tetap punya isi.
 */
export function cheapestPackageTier(pkg: TieredPackage | null | undefined): string;

/** Tier bila sah, selain itu yang termurah. Untuk parameter URL dan state basi. */
export function resolvePackageTier(
  pkg: TieredPackage | null | undefined,
  tier: string | null | undefined,
): string;

/** Hotel tier itu SAJA. `null` bila tiernya tak punya data hotel. */
export function tierHotelInfo(
  pkg: TieredPackage | null | undefined,
  tier: string,
): CityHotelMap | null;

/**
 * Gabungan hotel semua tier, nilai non-kosong pertama per kunci. Hanya untuk
 * yang berlaku sejadwal — suhu, bendera negara, teks pencarian — jangan dipakai
 * menampilkan nama hotel.
 */
export function packageCityHotels(pkg: TieredPackage | null | undefined): CityHotelMap;

/** Harga satu tipe kamar di satu tier. `'N/A'`, kosong, dan tier asing → 0. */
export function tierRoomPrice(
  pkg: TieredPackage | null | undefined,
  tier: string,
  roomType: RoomType,
): number;
