// Sambungan Lampiran Teks di server.js: unit murni + penjaga sumber.
//
// Fungsi yang diuji hidup DI DALAM server.js dan tidak diekspor (mengimpor
// server.js akan menghidupkan HTTP server, cron, dan koneksi Supabase), jadi
// tubuhnya diekstrak dari sumber lalu diinstansiasi dengan `new Function`
// beserta dependensinya. Dengan begitu perilakunya benar-benar DIJALANKAN,
// bukan sekadar dicocokkan regex seperti tes penjaga-sumber murni.
//
// Bagian penjaga sumber di bawah mengunci satu invariant yang tidak bisa
// dijaga tes perilaku: kolom `body` (10.000 karakter) tidak boleh ikut
// terbawa di jalur feed. Itu SELURUH alasan lampiran dipisah ke tabelnya
// sendiri — sekali `body` masuk ke select feed, desainnya batal tanpa satu
// pun error muncul.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { sanitizeLinkPreview } from '../lib/community-link-preview.js';

const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

/** Potong satu fungsi top-level UTUH: dari penanda sampai '}' di kolom 0. */
function sliceFunction(marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `penanda tidak ditemukan di server.js: ${marker}`);
  const end = source.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `akhir fungsi tidak ditemukan untuk penanda: ${marker}`);
  return source.slice(start, end + 2);
}

/** Instansiasi fungsi top-level server.js dengan dependensinya di-inject. */
function loadServerFunction(name, deps = {}) {
  const names = Object.keys(deps);
  const factory = new Function(...names, `'use strict';\n${sliceFunction(`function ${name}(`)}\nreturn ${name};`);
  return factory(...names.map(key => deps[key]));
}

/** Rentang [start, end) satu route, dibatasi oleh definisi app.* berikutnya. */
function routeRange(marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `route tidak ditemukan di server.js: ${marker}`);
  const end = source.indexOf('\napp.', start + 1);
  assert.ok(end > start, `akhir route tidak ditemukan: ${marker}`);
  return { start, end };
}

// ── Deteksi migrasi tertinggal ──────────────────────────────────────────────

const isCommunitySnippetSchemaMissing = loadServerFunction('isCommunitySnippetSchemaMissing');

test('isCommunitySnippetSchemaMissing: tabel lampiran hilang dikenali', () => {
  assert.equal(isCommunitySnippetSchemaMissing({
    code: '42P01',
    message: 'relation "community_post_snippets" does not exist',
  }), true);
  assert.equal(isCommunitySnippetSchemaMissing({
    code: 'PGRST205',
    message: "Could not find the table 'public.community_post_snippets' in the schema cache",
  }), true);
  assert.equal(isCommunitySnippetSchemaMissing({
    code: 'PGRST200',
    details: 'community_post_snippets',
  }), true);
  // 42P01 selalu berarti tabel hilang, sekalipun pesannya tidak menyebut nama.
  assert.equal(isCommunitySnippetSchemaMissing({ code: '42P01', message: '' }), true);
});

test('isCommunitySnippetSchemaMissing: galat kolom & tabel lain tidak diklaim', () => {
  // Pola KOLOM-hilang (42703/PGRST204) bukan urusan fungsi ini — lampiran
  // hilang sebagai TABEL, bukan sebagai kolom di community_posts.
  assert.equal(isCommunitySnippetSchemaMissing({
    code: '42703',
    message: 'column "body" does not exist',
  }), false);
  assert.equal(isCommunitySnippetSchemaMissing({
    code: 'PGRST204',
    message: "Could not find the 'preview' column of 'community_post_snippets' in the schema cache",
  }), false);
  // Tabel lain yang hilang tidak boleh disamarkan jadi "lampiran belum migrasi".
  assert.equal(isCommunitySnippetSchemaMissing({
    code: 'PGRST205',
    message: "Could not find the table 'public.community_polls' in the schema cache",
  }), false);
  assert.equal(isCommunitySnippetSchemaMissing({ code: '23505', message: 'duplicate key value' }), false);
  assert.equal(isCommunitySnippetSchemaMissing(null), false);
  assert.equal(isCommunitySnippetSchemaMissing(undefined), false);
});

// ── Prioritas link preview ──────────────────────────────────────────────────

const COMMUNITY_MAX_MEDIA_ITEMS = Number(source.match(/const COMMUNITY_MAX_MEDIA_ITEMS = (\d+)/)[1]);
const normalizeStoredCommunityMedia = loadServerFunction('normalizeStoredCommunityMedia', {
  COMMUNITY_MAX_MEDIA_ITEMS,
});
const communityLinkPreviewPayload = loadServerFunction('communityLinkPreviewPayload', {
  normalizeStoredCommunityMedia,
  sanitizeLinkPreview,
});

const PREVIEW = { url: 'https://alhijaz.co/paket-umroh', title: 'Paket Umroh Hemat' };
const plainRow = { media: [], photo_url: null, quoted_post_id: null, link_preview: PREVIEW };

test('communityLinkPreviewPayload: tanpa media/quote/lampiran preview tetap tampil', () => {
  // Perilaku lama, argumen kedua tidak dioper (default false).
  assert.deepEqual(communityLinkPreviewPayload(plainRow), PREVIEW);
  assert.deepEqual(communityLinkPreviewPayload(plainRow, false), PREVIEW);
});

test('communityLinkPreviewPayload: lampiran menekan preview', () => {
  assert.equal(communityLinkPreviewPayload(plainRow, true), null);
});

test('communityLinkPreviewPayload: media & quote tetap menang (tidak berubah)', () => {
  assert.equal(
    communityLinkPreviewPayload({ ...plainRow, media: [{ type: 'image', url: 'https://cdn.example.com/a.jpg' }] }),
    null,
  );
  assert.equal(communityLinkPreviewPayload({ ...plainRow, photo_url: 'https://cdn.example.com/a.jpg' }), null);
  assert.equal(communityLinkPreviewPayload({ ...plainRow, quoted_post_id: 'a0000000-0000-4000-8000-000000000000' }), null);
});

test('communityLinkPreviewPayload: baris kosong -> null', () => {
  assert.equal(communityLinkPreviewPayload(null, true), null);
  assert.equal(communityLinkPreviewPayload(undefined), null);
});

// ── Penjaga sumber ──────────────────────────────────────────────────────────

const SNIPPET_TABLE = ".from('community_post_snippets')";

/** Setiap query ke community_post_snippets beserta daftar kolom select-nya. */
function snippetSelects() {
  const found = [];
  let index = source.indexOf(SNIPPET_TABLE);
  while (index !== -1) {
    // Dibatasi sampai `.from(` berikutnya supaya sebuah query tidak
    // "meminjam" select milik query lain di bawahnya.
    const nextFrom = source.indexOf(".from('", index + SNIPPET_TABLE.length);
    const region = source.slice(index, nextFrom === -1 ? source.length : nextFrom);
    const match = region.match(/\.select\('([^']*)'/);
    assert.ok(match, `query community_post_snippets tanpa .select() di indeks ${index}`);
    found.push({ index, columns: match[1].split(',').map(part => part.trim()) });
    index = source.indexOf(SNIPPET_TABLE, index + SNIPPET_TABLE.length);
  }
  return found;
}

test('guard sumber: kolom body hanya keluar lewat route /snippet', () => {
  const queries = snippetSelects();
  assert.ok(queries.length >= 3, 'penjaga tidak menemukan query community_post_snippets — penanda berubah?');

  const withBody = queries.filter(query => query.columns.includes('body'));
  assert.equal(withBody.length, 1, 'tepat SATU select yang boleh mengambil kolom body');

  const snippetRoute = routeRange("app.get('/api/community/posts/:id/snippet'");
  assert.ok(
    withBody[0].index > snippetRoute.start && withBody[0].index < snippetRoute.end,
    'select berkolom body wajib berada di dalam GET /api/community/posts/:id/snippet',
  );
});

test('guard sumber: loadCommunitySnippetMaps tidak pernah menyentuh kolom body', () => {
  const fn = sliceFunction('async function loadCommunitySnippetMaps(');
  assert.match(fn, /\.select\('post_id, title, preview, char_count'\)/);
  assert.doesNotMatch(
    fn,
    /\bbody\b/,
    'jalur feed harus bebas kolom body — itu seluruh alasan tabel lampiran dipisah',
  );
});

test('guard sumber: feed & detail membawa snippet, segmen thread tidak', () => {
  assert.match(source, /snippet: snippets\.get\(post\.id\) \|\| null,/);
  assert.match(source, /snippet: detailSnippets\.get\(post\.id\) \|\| null,/);

  const threadStart = source.indexOf('thread = threadRows.map(row => {');
  assert.notEqual(threadStart, -1, 'blok pemetaan thread tidak ditemukan');
  const threadEnd = source.indexOf('const media = normalizeStoredCommunityMedia(', threadStart);
  assert.ok(threadEnd > threadStart, 'akhir blok pemetaan thread tidak ditemukan');
  assert.doesNotMatch(
    source.slice(threadStart, threadEnd),
    /snippet/,
    'lampiran milik segmen PERTAMA saja — item di array thread tidak membawanya',
  );
});

test('guard sumber: kedua pemanggil link preview mengoper status lampiran', () => {
  assert.match(source, /communityLinkPreviewPayload\(post, snippets\.has\(post\.id\)\)/);
  assert.match(source, /communityLinkPreviewPayload\(post, detailSnippets\.has\(post\.id\)\)/);
  assert.doesNotMatch(
    source,
    /communityLinkPreviewPayload\(post\)/,
    'pemanggil satu-argumen berarti ada jalur yang lupa menekan preview saat ada lampiran',
  );
});

test('guard sumber: hanya POST /api/community/posts yang naik ke 256kb', () => {
  // Parser path-scoped inilah batas yang BERLAKU; parser di app.post(...)
  // tidak pernah tereksekusi (jebakan yang sudah dicatat di server.js).
  assert.match(source, /const communityCreatePostJson = express\.json\(\{ limit: '256kb' \}\);/);
  assert.match(source, /req\.method === 'POST' && \(req\.path === '\/' \|\| req\.path === ''\)/);
  // Sub-path (poll-vote, PATCH edit, dst.) tetap di 96kb seperti sebelumnya.
  assert.match(source, /app\.use\('\/api\/community\/posts', express\.json\(\{ limit: '96kb' \}\)\);/);
});

test('guard sumber: tulis menolak 503, baca degradasi 404, lampiran+poll ditolak', () => {
  assert.match(source, /res\.status\(503\)\.json\(\{ error: 'Migrasi lampiran teks Teras belum diterapkan' \}\)/);
  assert.match(source, /res\.status\(404\)\.json\(\{ error: 'Lampiran teks tidak ditemukan' \}\)/);
  assert.match(source, /error: 'Lampiran teks tidak bisa digabung dengan polling'/);
  // Media & kutipan SENGAJA boleh berdampingan dengan lampiran.
  assert.doesNotMatch(source, /Lampiran teks tidak bisa digabung dengan (media|kutipan)/);
});
