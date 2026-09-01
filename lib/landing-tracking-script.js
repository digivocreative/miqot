/**
 * Validasi tracking script landing page agent.
 *
 * Dipakai DUA sisi — panel (src/components/LandingPagePage.tsx) dan endpoint
 * PUT /api/landing-config — supaya aturannya tidak pernah berbeda antara apa
 * yang divalidasi di layar dan apa yang benar-benar diterima server.
 *
 * Isi skripnya SENGAJA tidak disanitasi. Pixel yang berguna (Meta, Google Ads,
 * TikTok) memang butuh <script> inline, dan sanitasi separuh jalan hanya
 * memberi rasa aman palsu sambil merusak snippet yang sah. Yang dijaga di sini
 * cuma hal yang bisa merusak halaman, bukan isi skripnya.
 *
 * Konsekuensi keamanannya nyata dan disengaja: skrip berjalan di origin
 * alhijaz.co — origin yang sama dengan dashboard, tempat token login disimpan
 * di localStorage. Agent yang menempel snippet jahat bisa membaca sesi siapa
 * pun yang sedang login dan membuka landing page-nya.
 */

/** Batas panjang, ± cukup untuk beberapa pixel sekaligus. */
export const TRACKING_SCRIPT_LIMIT = 8000;

/**
 * @param {string} value isi textarea apa adanya
 * @returns {string | null} pesan galat berbahasa Indonesia, atau null kalau sah
 */
export function trackingScriptError(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > TRACKING_SCRIPT_LIMIT) {
    return `Melebihi batas ${TRACKING_SCRIPT_LIMIT} karakter`;
  }
  // Menutup <body>/<html> lebih awal akan memotong sisa halaman (sticky bar
  // agent, </html>) — dan titik suntiknya sendiri mencari '</body>' pertama.
  if (/<\/\s*(body|html)\b/i.test(trimmed)) {
    return 'Tidak boleh memuat </body> atau </html>';
  }
  return null;
}

/**
 * Bentuk siap-simpan untuk landing_config.
 * @returns {undefined | null | string}
 *   undefined = field tidak ada di body, jangan disentuh
 *   null      = dikosongkan, kembali ke default (tidak menyuntik apa pun)
 *   string    = isi yang sudah di-trim
 * @throws {Error} kalau isinya tidak sah (pesan siap tampil ke agent)
 */
export function normalizeTrackingScript(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const error = trackingScriptError(trimmed);
  if (error) throw new Error(`Tracking script: ${error}`);
  return trimmed;
}
