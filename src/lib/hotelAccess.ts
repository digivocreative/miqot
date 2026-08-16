// Gate Direktori Hotel — kembaran klien dari lib/hotel-directory.js (server).
// SATU titik keputusan: membuka fitur untuk semua agent nanti cukup mengedit
// kedua file ini. Selama fase rilis terbatas hanya nikita (admin pengelola)
// dan bagas (user testing) yang melihat fitur ini.
const HOTEL_DIRECTORY_AGENT_SLUGS = new Set(['nikita', 'bagas']);

export function isHotelDirectoryEnabledForAgent(slug?: string | null): boolean {
  return HOTEL_DIRECTORY_AGENT_SLUGS.has(String(slug || '').trim().toLowerCase());
}
