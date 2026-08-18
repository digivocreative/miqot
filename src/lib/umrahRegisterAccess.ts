// Gate pendaftaran jamaah baru (Umrah register / "/dashboard/jamaah/daftar").
// SATU titik keputusan untuk membuka/menutup fitur.
//
// - Set KOSONG  → fitur DIBUKA untuk semua agent (kondisi saat ini).
// - Isi slug    → fitur DIBATASI hanya untuk slug tsb, mis. new Set(['nikita']),
//                 dipakai saat perlu menutup sementara (mis. submit ke Alhijaz
//                 sedang bermasalah — lihat memory register-unknown-false-negative).
const UMRAH_REGISTER_RESTRICTED_TO_SLUGS = new Set<string>();

export function isUmrahRegisterEnabledForAgent(slug?: string | null): boolean {
  if (UMRAH_REGISTER_RESTRICTED_TO_SLUGS.size === 0) return true; // dibuka untuk semua
  return UMRAH_REGISTER_RESTRICTED_TO_SLUGS.has(String(slug || '').trim().toLowerCase());
}

export const UMRAH_REGISTER_DISABLED_MESSAGE =
  'Mohon maaf, fitur pendaftaran jamaah baru sedang tidak dapat digunakan untuk sementara waktu. Silakan menunggu informasi selanjutnya.';
