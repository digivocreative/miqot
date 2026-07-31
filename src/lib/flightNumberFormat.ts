/**
 * Nomor penerbangan untuk TAMPILAN saja: spasi dibuang agar tidak memakan
 * lebar baris kartu yang sudah berebut ruang dengan badge status dan "Pulang".
 * "GA 991" → "GA991", "SV 275/278/818" → "SV275/278/818".
 *
 * Jangan pakai di luar titik render. Nilai mentah `flightNumber` juga menjadi
 * kunci pengelompokan kartu, kunci share, dan payload analitik — memadatkannya
 * di sana akan memecah pengelompokan dan membuat data analitik lama tak
 * sepadan dengan yang baru.
 */
export function formatFlightNumberCompact(flightNumber?: string | null): string {
  return String(flightNumber ?? '').replace(/\s+/g, '');
}
