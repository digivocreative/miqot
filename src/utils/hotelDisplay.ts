import { getDistance } from '@/data/hotelService';
import { lookupHotelMetadata } from '@/data/hotelMetadata';

/**
 * Jarak hotel ke masjid: payload menang, lalu metadata lokal, lalu tabel hotel.
 * Dipakai bersama halaman Bandingkan Paket dan dokumen PDF-nya supaya angka
 * di layar dan di berkas yang dikirim ke jamaah tidak pernah berbeda.
 */
export function hotelDistance(name: string, distance?: string): string {
  return String(distance || '').trim() || lookupHotelMetadata(name).distance || getDistance(name);
}

export interface CompareCity {
  /** Kunci kota mentah: `mekkah` → `mekkah_hotel`/`mekkah_bintang`/`mekkah_jarak`. */
  key: string;
  label: string;
  /** Selalu ditampilkan walau hotelnya kosong; kota tur hanya bila ada datanya. */
  always?: boolean;
}

/**
 * Semua kota yang bisa muncul di `paket_hotel`, urut mengikuti perjalanan:
 * dua kota suci dulu, lalu kota tur. Daftar ini pernah ketinggalan `dubai` dan
 * `haikou` sehingga hotel dan suhu kedua kota itu tidak pernah tampil di
 * perbandingan, padahal datanya ada di API dan di temperatureData.
 */
export const COMPARE_CITIES: CompareCity[] = [
  { key: 'mekkah', label: 'Mekkah', always: true },
  { key: 'madinah', label: 'Madinah', always: true },
  { key: 'cairo', label: 'Cairo' },
  { key: 'dubai', label: 'Dubai' },
  { key: 'istanbul', label: 'Istanbul' },
  { key: 'bursa', label: 'Bursa' },
  { key: 'cappadocia', label: 'Cappadocia' },
  { key: 'ankara', label: 'Ankara' },
  { key: 'haikou', label: 'Haikou' },
];
