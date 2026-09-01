/**
 * Validasi tracking script landing page agent.
 *
 * Dipakai DUA sisi — panel (src/components/LandingPagePage.tsx) dan endpoint
 * PUT /api/landing-config — supaya aturannya tidak pernah berbeda antara apa
 * yang divalidasi di layar dan apa yang benar-benar diterima server.
 *
 * SATU vendor saja yang diterima: tracker LPWA WatZap. Bentuk yang sah adalah
 * satu atau beberapa <script src="https://secure.watzap.chat/…"> dan tidak ada
 * yang lain — tanpa tag jenis lain, tanpa teks lepas, dan TANPA skrip inline.
 *
 * Kenapa skrip inline ditolak sama sekali: skrip berjalan di origin
 * alhijaz.co — origin yang sama dengan dashboard, tempat token login disimpan
 * di localStorage. Satu baris inline sudah cukup untuk membaca sesi siapa pun
 * yang sedang login lalu membuka landing page agent. Selama yang boleh masuk
 * hanya URL ke host WatZap, kepercayaannya berhenti di WatZap; begitu inline
 * diizinkan, whitelist ini tidak menahan apa-apa lagi (kode yang disamarkan
 * selalu lolos daftar-larangan kata kunci).
 */

/** Batas panjang, ± cukup untuk beberapa tag tracker sekaligus. */
export const TRACKING_SCRIPT_LIMIT = 8000;

/**
 * Host yang boleh memuat skrip. Cocok persis atau sebagai subdomain — tracker
 * LPWA yang beredar dimuat dari secure.watzap.chat. watzap.id ikut diterima
 * karena domain itu milik WatZap juga dan dipakai untuk toolkit lainnya.
 * Menambah vendor = menambah baris di sini, bukan melonggarkan aturan di bawah.
 */
export const TRACKER_HOSTS = ['watzap.chat', 'watzap.id'];

const ERR_ONLY_WATZAP =
  'Hanya tracker LPWA WatZap yang diperbolehkan — tempel <script src="https://secure.watzap.chat/…"></script>';
const ERR_INLINE = 'Skrip inline tidak diperbolehkan — hanya <script src> dari watzap.chat';
const ERR_HOST = 'Sumber skrip harus dari watzap.chat';

function isTrackerHost(hostname) {
  const host = hostname.toLowerCase();
  return TRACKER_HOSTS.some((allowed) => host === allowed || host.endsWith('.' + allowed));
}

/**
 * Hostname dari nilai atribut src, atau null kalau bukan URL absolut ber-http(s).
 * Base sengaja host yang mustahil ada: src relatif ('/t.js') ikut ke base itu,
 * jadi ketahuan bukan URL absolut. 'javascript:'/'data:' tersaring lewat protokol.
 */
function srcHostname(src) {
  try {
    const url = new URL(src.trim(), 'https://relative.invalid');
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.hostname === 'relative.invalid') return null;
    return url.hostname;
  } catch {
    return null;
  }
}

const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/\s*script\s*>/gi;
const SRC_ATTR = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

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

  // Komentar HTML dibuang dulu supaya <!-- LPWA Tracker --> yang menyertai
  // snippet resmi tidak terbaca sebagai teks asing. Isinya tidak pernah
  // dieksekusi, jadi aman diabaikan — dan tetap ikut tersuntik apa adanya.
  const scanned = trimmed.replace(/<!--[\s\S]*?-->/g, ' ');

  let cursor = 0;
  let count = 0;
  let match;
  SCRIPT_TAG.lastIndex = 0;
  while ((match = SCRIPT_TAG.exec(scanned)) !== null) {
    // Apa pun di antara dua tag <script> (teks lepas, <img>, </body>) ditolak.
    if (scanned.slice(cursor, match.index).trim()) return ERR_ONLY_WATZAP;
    cursor = match.index + match[0].length;
    count += 1;

    const [, attrs, body] = match;
    if (body.trim()) return ERR_INLINE;

    const srcMatch = SRC_ATTR.exec(attrs);
    const src = srcMatch ? (srcMatch[1] ?? srcMatch[2] ?? srcMatch[3] ?? '') : '';
    if (!src.trim()) return ERR_INLINE;

    const hostname = srcHostname(src);
    if (!hostname || !isTrackerHost(hostname)) return ERR_HOST;
  }
  if (scanned.slice(cursor).trim()) return ERR_ONLY_WATZAP;
  if (count === 0) return ERR_ONLY_WATZAP;

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
