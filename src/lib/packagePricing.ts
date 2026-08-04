/**
 * Harga "MULAI" di kepala kartu paket.
 *
 * Kartu punya dua gagasan tier yang mudah tertukar: tier TERMURAH (dipakai
 * sebagai default sebelum user menyentuh apa pun) dan tier AKTIF (yang tab-nya
 * sedang dipilih). Harga header dulu selalu memakai minimum lintas SEMUA tier,
 * jadi kartu yang tab-nya di RAHMAH tetap memasang angka UHUD di header —
 * selisihnya belasan juta. Di gambar hasil tombol "Simpan" tab tier ikut
 * dibuang (data-screenshot-ignore), sehingga angka tier lain itu jadi
 * satu-satunya harga yang terbaca.
 *
 * Kedua helper di bawah sengaja mempertahankan semantik lama: minimum di
 * antara Quard/Triple/Double lewat parseInt, mengabaikan nilai kosong dan
 * yang tidak positif. Bukan urutan prioritas kamar seperti tierPrice() di
 * lib/brochure-schedule.js — di sana kamar pertama yang tersedia yang menang,
 * dan menyamakannya di sini akan diam-diam mengubah harga yang tampil.
 */

/** Tipe kamar yang boleh jadi harga "mulai". Infant/Single sengaja di luar. */
const HEADER_ROOMS = ['Quard', 'Triple', 'Double'] as const;

/** Harga terendah di antara tipe kamar dalam SATU tier; null bila tak ada. */
export function minPriceInTier(tierPricing: unknown): number | null {
  if (!tierPricing || typeof tierPricing !== 'object') return null;
  const rooms = tierPricing as Record<string, unknown>;

  let min = Infinity;
  for (const room of HEADER_ROOMS) {
    const raw = rooms[room];
    if (!raw) continue;
    const value = parseInt(String(raw), 10);
    if (value > 0 && value < min) min = value;
  }
  return min === Infinity ? null : min;
}

/**
 * Nama tier yang memuat harga terendah paket — default tier aktif kartu.
 * Jatuh ke tier pertama bila tak ada satu pun harga terpakai, dan null bila
 * paket tak punya tier sama sekali.
 */
export function cheapestTierOf(harga: unknown): string | null {
  if (!harga || typeof harga !== 'object') return null;
  const tiers = Object.keys(harga as Record<string, unknown>);
  if (tiers.length === 0) return null;

  let cheapest = tiers[0];
  let min = Infinity;
  for (const tier of tiers) {
    const price = minPriceInTier((harga as Record<string, unknown>)[tier]);
    if (price !== null && price < min) {
      min = price;
      cheapest = tier;
    }
  }
  return cheapest;
}
