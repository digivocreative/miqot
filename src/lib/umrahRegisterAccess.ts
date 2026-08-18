// Gate pendaftaran jamaah baru (Umrah register / "/dashboard/jamaah/daftar").
// Sementara submit ke Alhijaz sedang diperbaiki (reCAPTCHA v3 menolak browser
// server — lihat memory register-unknown-false-negative), fitur ini dibatasi
// hanya untuk agent nikita (pilot). SATU titik keputusan: membuka untuk semua
// agent nanti cukup mengedit set ini (atau mengosongkannya).
const UMRAH_REGISTER_AGENT_SLUGS = new Set(['nikita']);

export function isUmrahRegisterEnabledForAgent(slug?: string | null): boolean {
  return UMRAH_REGISTER_AGENT_SLUGS.has(String(slug || '').trim().toLowerCase());
}

export const UMRAH_REGISTER_DISABLED_MESSAGE =
  'Mohon maaf, fitur pendaftaran jamaah baru sedang tidak dapat digunakan untuk sementara waktu. Silakan menunggu informasi selanjutnya.';
