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

// Isi textarea disuntik APA ADANYA, jadi validator ini harus membaca HTML-nya
// minimal seketat browser — setiap beda tafsir adalah celah. Karena itu semua
// pola di bawah sengaja lebih sempit dari HTML sungguhan: bentuk yang ragu
// ditolak, bukan ditebak (audit 22 Okt 2026: `onerror=`, `data-src=` yang
// terbaca sebagai src, dan komentar `--!>` dulu lolos).
//
// Tag penutup hanya `</script>` persis: browser TIDAK menutup script pada
// `</ script>`, jadi bentuk longgar membuat validator dan browser berbeda
// pendapat soal di mana tag berakhir.
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
// Komentar polos saja: tanpa `<`, `>`, atau `--` di dalamnya. Komentar lain
// (`<!-->`, `--!>`, komentar yang membungkus tag) diakhiri browser di tempat
// berbeda dari regex mana pun, jadi tidak diterima.
const PLAIN_COMMENT = /<!--(?:(?!--)[^<>])*-->/g;
// Satu atribut. Nama tanpa kutip/`<>/=`; nilai berkutip, atau tanpa kutip
// tanpa spasi/kutip/`=<>\``. Sisa yang tak cocok pola ini = ditolak.
const ATTR = /\s*([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;
const ATTR_TAIL = /^\s*\/?\s*$/;
// Atribut yang diterima: src (wajib, sekali), flag pemuatan, dan data-* untuk
// konfigurasi tracker (data-wzp-project dst.). on*, style, dan lainnya ditolak.
const BOOLEAN_ATTRS = new Set(['async', 'defer']);
const DATA_ATTR = /^data-[a-z0-9-]+$/;
// Referensi karakter di src (`&sol;`, `&#47;`) didekode browser SEBELUM URL
// di-parse — `https://evil.com&sol;.watzap.chat/` lolos cek host mentah tapi
// dimuat dari evil.com. `&` biasa di query (`?a=1&b=2`) dan `&amp;` tetap boleh.
const CHAR_REF = /&(?!amp;)(?:#|[a-z][a-z0-9]*;)/i;

const ERR_ATTR = 'Atribut tidak diperbolehkan — hanya src, async, defer, dan data-*';

/**
 * Atribut sebuah tag <script>, atau null kalau ada bagian yang tak terbaca
 * dengan pasti oleh pola di atas.
 * @returns {Array<[string, string | null]> | null}
 */
function parseAttrs(attrs) {
  const out = [];
  let pos = 0;
  while (pos < attrs.length) {
    if (ATTR_TAIL.test(attrs.slice(pos))) break;
    ATTR.lastIndex = pos;
    const m = ATTR.exec(attrs);
    if (!m || m[0].length === 0) return null;
    out.push([m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? null]);
    pos = ATTR.lastIndex;
  }
  return out;
}

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

  // Komentar polos dibuang dulu supaya <!-- LPWA Tracker --> yang menyertai
  // snippet resmi tidak terbaca sebagai teks asing. Isinya tidak pernah
  // dieksekusi, jadi aman diabaikan — dan tetap ikut tersuntik apa adanya.
  // Sisa `<!--` = komentar yang bentuknya tidak bisa dipastikan → ditolak.
  const scanned = trimmed.replace(PLAIN_COMMENT, ' ');
  if (scanned.includes('<!--')) return ERR_ONLY_WATZAP;

  let cursor = 0;
  let count = 0;
  let match;
  SCRIPT_TAG.lastIndex = 0;
  while ((match = SCRIPT_TAG.exec(scanned)) !== null) {
    // Apa pun di antara dua tag <script> (teks lepas, <img>, </body>) ditolak.
    if (scanned.slice(cursor, match.index).trim()) return ERR_ONLY_WATZAP;
    cursor = match.index + match[0].length;
    count += 1;

    const [, rawAttrs, body] = match;
    if (body.trim()) return ERR_INLINE;

    const attrs = parseAttrs(rawAttrs);
    if (!attrs) return ERR_ATTR;
    const names = attrs.map(([name]) => name);
    if (new Set(names).size !== names.length) return ERR_ATTR;
    for (const [name] of attrs) {
      if (name !== 'src' && !BOOLEAN_ATTRS.has(name) && !DATA_ATTR.test(name)) return ERR_ATTR;
    }

    const src = attrs.find(([name]) => name === 'src')?.[1] ?? '';
    if (!src.trim()) return ERR_INLINE;
    if (CHAR_REF.test(src)) return ERR_HOST;

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
