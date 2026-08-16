/**
 * Lampiran Teks Teras — helper murni (tanpa Supabase) supaya bisa diuji
 * langsung. Lampiran adalah blok teks panjang (maks 10.000 karakter) yang
 * menempel pada segmen PERTAMA sebuah utas: di feed ia tampil sebagai kartu
 * cuplikan (`preview`), teks penuhnya (`body`) baru diambil saat sheet
 * fullscreen dibuka.
 *
 * Body sengaja disimpan di tabel terpisah (community_post_snippets), bukan di
 * community_posts — lihat migrations/20260816000000_community_snippet.sql.
 *
 * Aturan yang berlaku di SELURUH berkas ini: panjang teks SELALU dihitung
 * dengan `Array.from(x).length` (code point), tidak pernah `x.length` (unit
 * UTF-16). Itu yang membuat batas di sini identik dengan CHECK `char_length`
 * di Postgres; kalau dicampur, emoji di luar BMP (mis. 🕋) dihitung 2 di satu
 * sisi dan 1 di sisi lain, dan batasnya jadi berbeda diam-diam.
 */

export const COMMUNITY_SNIPPET_MAX_CHARS = 10000;
export const COMMUNITY_SNIPPET_MAX_TITLE_CHARS = 80;
/**
 * Panjang cuplikan yang disimpan (dan dipakai kartu feed). Lebih pendek dari
 * batas CHECK kolom `preview` (400) supaya ambang ini bisa dinaikkan sedikit
 * tanpa migrasi susulan.
 */
export const COMMUNITY_SNIPPET_PREVIEW_CHARS = 280;

function fail(error) {
  return { snippet: null, error };
}

/**
 * Rapikan body lampiran sebelum disimpan. Urutan langkahnya penting dan tidak
 * boleh ditukar:
 *   1. `\r\n` / `\r` → `\n` (tempelan dari Windows & sebagian editor iOS),
 *      supaya langkah berikutnya cuma perlu mengenal satu jenis pemisah baris.
 *   2. buang spasi di ujung TIAP baris. Regex-nya `[^\S\n]+` (whitespace selain
 *      newline), BUKAN `\s+$/gm` — yang terakhir ikut melahap `\n` di baris
 *      kosong sehingga jarak antar paragraf hilang.
 *   3. tiga `\n` beruntun atau lebih diciutkan jadi tepat dua, jadi paling
 *      banyak SATU baris kosong antar paragraf (tempelan dari Word/Notes sering
 *      membawa lusinan baris kosong yang bikin kartu cuplikan kosong melompong).
 *   4. trim seluruh string, membuang baris kosong di awal/akhir.
 */
function normalizeSnippetBody(raw) {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Validasi input lampiran teks dari klien (`body.snippet`). Menerima
 * `{ body, title? }`, mengembalikan `{ snippet: { title, body, preview,
 * charCount }, error: null }` atau `{ snippet: null, error: string }` dengan
 * pesan yang bisa langsung dipakai sebagai respons 400.
 *
 * `raw` absen (undefined/null) BUKAN error: klien lama yang belum tahu fitur
 * ini tetap bisa mengirim kiriman biasa — hasilnya `{ snippet: null, error:
 * null }`, artinya "tidak ada lampiran", bukan "lampiran ditolak".
 *
 * `preview` dihitung di sini (bukan di pemanggil) supaya nilai yang masuk DB
 * selalu berasal dari body yang SUDAH dinormalisasi — kalau tidak, kartu feed
 * bisa menampilkan cuplikan dengan CRLF/baris kosong yang sudah dibuang dari
 * teks penuhnya.
 */
export function normalizeCommunitySnippetInput(raw) {
  if (raw === undefined || raw === null) return { snippet: null, error: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) return fail('Format lampiran teks tidak valid');
  if (typeof raw.body !== 'string') return fail('Format lampiran teks tidak valid');

  const body = normalizeSnippetBody(raw.body);
  if (!body) return fail('Lampiran teks masih kosong');
  const charCount = Array.from(body).length;
  if (charCount > COMMUNITY_SNIPPET_MAX_CHARS) {
    return fail(`Lampiran teks maksimal ${COMMUNITY_SNIPPET_MAX_CHARS} karakter`);
  }

  let title = null;
  if (raw.title !== undefined && raw.title !== null) {
    if (typeof raw.title !== 'string') return fail('Format lampiran teks tidak valid');
    const trimmed = raw.title.trim();
    if (Array.from(trimmed).length > COMMUNITY_SNIPPET_MAX_TITLE_CHARS) {
      return fail(`Judul lampiran maksimal ${COMMUNITY_SNIPPET_MAX_TITLE_CHARS} karakter`);
    }
    // Judul yang isinya cuma spasi = tidak ada judul. Disamakan jadi null
    // supaya kolom `title` cuma punya satu representasi untuk keadaan itu
    // (CHECK di DB menolak string kosong).
    title = trimmed.length > 0 ? trimmed : null;
  }

  return {
    snippet: { title, body, preview: buildCommunitySnippetPreview(body), charCount },
    error: null,
  };
}

/**
 * Potong body jadi cuplikan kartu feed.
 *
 * Pemotongan lewat `Array.from(...).slice(...)`, JANGAN `body.slice(280)` pada
 * string mentah: slice string memotong per unit UTF-16, jadi kalau batas 280
 * jatuh tepat di tengah pasangan surrogate (emoji di luar BMP) cuplikan
 * berakhir dengan setengah karakter — tampil sebagai kotak rusak "�" di kartu.
 *
 * Baris baru DIPERTAHANKAN: kartu feed merender cuplikan multi-baris lalu
 * memangkasnya dengan clamp CSS. Elipsis juga sengaja TIDAK ditambahkan di
 * sini — klien yang tahu berapa baris yang benar-benar muat, jadi klien pula
 * yang memutuskan cara menandai potongan.
 */
export function buildCommunitySnippetPreview(body) {
  const text = typeof body === 'string' ? body : '';
  const chars = Array.from(text);
  if (chars.length <= COMMUNITY_SNIPPET_PREVIEW_CHARS) return text;
  return chars.slice(0, COMMUNITY_SNIPPET_PREVIEW_CHARS).join('');
}

/**
 * Susun payload kartu cuplikan untuk klien dari baris `community_post_snippets`.
 *
 * Fungsi ini TIDAK PERNAH mengembalikan `body`, sekalipun baris yang masuk
 * kebetulan membawanya: teks penuh hanya boleh keluar lewat endpoint detail
 * khusus. Itu yang menjaga janji "feed tidak menyeret ratusan KB teks" tetap
 * berlaku walau kelak ada pemanggil yang menyodorkan baris hasil `select('*')`.
 *
 * Kembalikan null bila baris tidak layak render — jangan 500 hanya karena satu
 * baris tercemar; kartu cuplikan cukup absen dari kiriman itu.
 */
export function communitySnippetCardPayload(row) {
  if (!row) return null;
  const preview = typeof row.preview === 'string' ? row.preview : '';
  if (!preview.trim()) return null;
  return {
    title: row.title || null,
    preview,
    char_count: Number(row.char_count) || 0,
  };
}
