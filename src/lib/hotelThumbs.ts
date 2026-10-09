import { normalizeHotelName } from '@/data/hotelMetadata';

/** Bentuk ramping yang dikembalikan GET /api/hotels/public. */
export interface PublicHotel {
  name: string;
  /** Nama lain seperti tertulis di jadwal ("ELIFIM RESOT"); diuji sama persis dengan name. */
  aliases?: string[];
  city?: string | null;
  stars?: string | number | null;
  distance_label?: string | null;
  walk_label?: string | null;
  area?: string | null;
  cover?: string | null;
  /** Seluruh foto hotel (maks 12), untuk galeri ketuk. cover = photos[0]. */
  photos?: string[];
}

/**
 * Nama hotel yang lebih pendek dari ini tidak pernah dipakai sebagai dasar
 * kecocokan "memuat". "AL" dan "EX" muncul di hampir semua nama hotel Saudi;
 * tanpa ambang ini satu entri direktori bernama "Al" akan memasang fotonya di
 * separuh paket.
 *
 * Nilainya 5, bukan 6: "Anjum" — hotel sungguhan di direktori — panjangnya
 * tepat 5. Menaikkannya satu saja membuat hotel itu tidak pernah dapat foto.
 */
const MIN_CONTAINMENT_LEN = 5;

/**
 * Cari entri Direktori Hotel untuk sebuah nama hotel di payload paket.
 *
 * Nama di payload ditulis manusia di admin Alhijaz ("PRESTIGE EX ELAF AL
 * MASHAER", "ANJUM / SETARAF"); direktori menyimpan nama kanoniknya. Pencocokan
 * yang terlalu longgar memasang FOTO HOTEL YANG SALAH — kesalahan yang tidak
 * menimbulkan galat apa pun dan baru ketahuan dari komplain jamaah. Karena itu
 * hanya dua aturan yang diterima, dan kalau ragu hasilnya null (tanpa foto).
 *
 * 1. Kecocokan penuh setelah normalisasi.
 * 2. Salah satu memuat yang lain, dengan nama direktori minimal
 *    MIN_CONTAINMENT_LEN karakter. Yang paling panjang kecocokannya menang,
 *    supaya "Al Ritz Al Madinah" mengalahkan "Al Ritz".
 *
 * Nama lain (aliases) entri direktori diuji dengan dua aturan yang sama persis
 * seperti namanya — alias hanya menambah ejaan, bukan melonggarkan aturan.
 */
export function matchHotelPhoto(
  packageHotelName: string | null | undefined,
  directory: PublicHotel[] | null | undefined,
): PublicHotel | null {
  if (!packageHotelName || !Array.isArray(directory) || directory.length === 0) return null;

  const needle = normalizeHotelName(packageHotelName);
  if (!needle) return null;

  let best: PublicHotel | null = null;
  let bestLen = 0;

  for (const entry of directory) {
    const names = [entry?.name, ...(Array.isArray(entry?.aliases) ? entry.aliases : [])];
    for (const name of names) {
      const candidate = normalizeHotelName(name || '');
      if (!candidate) continue;

      if (candidate === needle) return entry;

      if (candidate.length < MIN_CONTAINMENT_LEN) continue;
      if (!needle.includes(candidate) && !candidate.includes(needle)) continue;

      if (candidate.length > bestLen) {
        best = entry;
        bestLen = candidate.length;
      }
    }
  }

  return best;
}
