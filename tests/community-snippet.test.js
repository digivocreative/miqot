import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  COMMUNITY_SNIPPET_MAX_CHARS,
  COMMUNITY_SNIPPET_MAX_TITLE_CHARS,
  COMMUNITY_SNIPPET_PREVIEW_CHARS,
  buildCommunitySnippetPreview,
  communitySnippetCardPayload,
  normalizeCommunitySnippetInput,
} from '../lib/community-snippet.js';

// Emoji di luar BMP: 1 code point, 2 unit UTF-16. Dipakai di seluruh berkas
// ini sebagai jebakan regresi `.length` vs `Array.from().length`.
const KABAH = '🕋';

test('normalizeCommunitySnippetInput: tanpa lampiran -> null tanpa error', () => {
  // Klien lama yang belum tahu fitur ini tetap boleh mengirim kiriman biasa.
  assert.deepEqual(normalizeCommunitySnippetInput(undefined), { snippet: null, error: null });
  assert.deepEqual(normalizeCommunitySnippetInput(null), { snippet: null, error: null });
});

test('normalizeCommunitySnippetInput: bentuk rusak ditolak', () => {
  for (const raw of ['x', 42, true, [], { body: null }, { body: 42 }, {}]) {
    assert.equal(
      normalizeCommunitySnippetInput(raw).error,
      'Format lampiran teks tidak valid',
      JSON.stringify(raw),
    );
  }
});

test('normalizeCommunitySnippetInput: body kosong setelah normalisasi ditolak', () => {
  for (const body of ['', '   ', '\n\n\n', ' \t \n   \n ']) {
    assert.equal(
      normalizeCommunitySnippetInput({ body }).error,
      'Lampiran teks masih kosong',
      JSON.stringify(body),
    );
  }
});

test('normalizeCommunitySnippetInput: CRLF dan CR tunggal dinormalisasi jadi LF', () => {
  const { snippet, error } = normalizeCommunitySnippetInput({ body: 'satu\r\ndua\rtiga' });
  assert.equal(error, null);
  assert.equal(snippet.body, 'satu\ndua\ntiga');
  assert.equal(snippet.body.includes('\r'), false);
  // charCount dihitung dari body yang SUDAH dinormalisasi (13, bukan 14).
  assert.equal(snippet.charCount, 13);
});

test('normalizeCommunitySnippetInput: baris kosong beruntun diciutkan jadi dua \\n', () => {
  // Lima `\n` (empat baris kosong) -> tepat dua `\n` = satu baris kosong.
  assert.equal(normalizeCommunitySnippetInput({ body: 'satu\n\n\n\n\ndua' }).snippet.body, 'satu\n\ndua');
  // Satu baris kosong antar paragraf DIPERTAHANKAN apa adanya.
  assert.equal(normalizeCommunitySnippetInput({ body: 'satu\n\ndua' }).snippet.body, 'satu\n\ndua');
  assert.equal(normalizeCommunitySnippetInput({ body: 'satu\ndua' }).snippet.body, 'satu\ndua');
  // Baris kosong di awal/akhir dibuang oleh trim penutup.
  assert.equal(normalizeCommunitySnippetInput({ body: '\n\n\nHalo\n\n\n' }).snippet.body, 'Halo');
});

test('normalizeCommunitySnippetInput: spasi di ujung baris dibuang tanpa memakan newline', () => {
  assert.equal(
    normalizeCommunitySnippetInput({ body: 'satu   \ndua\t\ntiga  ' }).snippet.body,
    'satu\ndua\ntiga',
  );
  // Baris kosong yang isinya spasi tetap jadi baris kosong — regresi klasik
  // kalau regexnya `/\s+$/gm`, yang ikut melahap `\n` dan merapatkan paragraf.
  assert.equal(
    normalizeCommunitySnippetInput({ body: 'satu  \n   \ndua' }).snippet.body,
    'satu\n\ndua',
  );
});

test('normalizeCommunitySnippetInput: batas 10.000 karakter', () => {
  const pas = normalizeCommunitySnippetInput({ body: 'a'.repeat(COMMUNITY_SNIPPET_MAX_CHARS) });
  assert.equal(pas.error, null);
  assert.equal(pas.snippet.charCount, COMMUNITY_SNIPPET_MAX_CHARS);

  const lebih = normalizeCommunitySnippetInput({ body: 'a'.repeat(COMMUNITY_SNIPPET_MAX_CHARS + 1) });
  assert.equal(lebih.snippet, null);
  assert.equal(lebih.error, 'Lampiran teks maksimal 10000 karakter');
});

test('normalizeCommunitySnippetInput: emoji di luar BMP dihitung 1 code point', () => {
  // 6.000 emoji = 12.000 unit UTF-16. Kalau validasi memakai `.length`, body
  // ini ditolak padahal CHECK `char_length` di Postgres menerimanya.
  const enamRibu = KABAH.repeat(6000);
  assert.equal(enamRibu.length, 12000);
  const ok = normalizeCommunitySnippetInput({ body: enamRibu });
  assert.equal(ok.error, null);
  assert.equal(ok.snippet.charCount, 6000);

  // Tepat di batas: 10.000 emoji lolos, 10.001 ditolak.
  assert.equal(normalizeCommunitySnippetInput({ body: KABAH.repeat(10000) }).error, null);
  assert.equal(
    normalizeCommunitySnippetInput({ body: KABAH.repeat(10001) }).error,
    'Lampiran teks maksimal 10000 karakter',
  );
});

test('normalizeCommunitySnippetInput: judul opsional, di-trim, batas 80 karakter', () => {
  assert.equal(normalizeCommunitySnippetInput({ body: 'isi' }).snippet.title, null);
  assert.equal(normalizeCommunitySnippetInput({ body: 'isi', title: null }).snippet.title, null);
  // Judul yang isinya cuma spasi = tidak ada judul.
  assert.equal(normalizeCommunitySnippetInput({ body: 'isi', title: '   ' }).snippet.title, null);
  assert.equal(
    normalizeCommunitySnippetInput({ body: 'isi', title: '  Panduan Manasik  ' }).snippet.title,
    'Panduan Manasik',
  );

  const pas = 'x'.repeat(COMMUNITY_SNIPPET_MAX_TITLE_CHARS);
  assert.equal(normalizeCommunitySnippetInput({ body: 'isi', title: pas }).snippet.title, pas);
  assert.equal(
    normalizeCommunitySnippetInput({ body: 'isi', title: `${pas}x` }).error,
    'Judul lampiran maksimal 80 karakter',
  );
  // Judul pun dihitung per code point: 80 emoji lolos, 81 ditolak.
  assert.equal(
    normalizeCommunitySnippetInput({ body: 'isi', title: KABAH.repeat(80) }).error,
    null,
  );
  assert.equal(
    normalizeCommunitySnippetInput({ body: 'isi', title: KABAH.repeat(81) }).error,
    'Judul lampiran maksimal 80 karakter',
  );

  for (const title of [42, {}, [], true]) {
    assert.equal(
      normalizeCommunitySnippetInput({ body: 'isi', title }).error,
      'Format lampiran teks tidak valid',
      JSON.stringify(title),
    );
  }
});

test('buildCommunitySnippetPreview: body pendek dikembalikan utuh', () => {
  assert.equal(buildCommunitySnippetPreview('Halo Teras'), 'Halo Teras');
  const pas = 'a'.repeat(COMMUNITY_SNIPPET_PREVIEW_CHARS);
  assert.equal(buildCommunitySnippetPreview(pas), pas);
});

test('buildCommunitySnippetPreview: potong 280 code point tanpa merusak emoji di batas', () => {
  const body = `${'a'.repeat(COMMUNITY_SNIPPET_PREVIEW_CHARS - 1)}${KABAH}${'b'.repeat(50)}`;
  const preview = buildCommunitySnippetPreview(body);

  assert.equal(Array.from(preview).length, COMMUNITY_SNIPPET_PREVIEW_CHARS);
  assert.equal(preview.endsWith(KABAH), true);
  // Bukti kenapa Array.from wajib: slice string mentah di indeks yang sama
  // berhenti di tengah pasangan surrogate dan menyisakan setengah karakter.
  const naif = body.slice(0, COMMUNITY_SNIPPET_PREVIEW_CHARS);
  assert.equal(naif.endsWith('\uD83D'), true);
  assert.equal(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(preview), false);
});

test('buildCommunitySnippetPreview: baris baru dipertahankan, tanpa elipsis', () => {
  const body = 'paragraf\n\n'.repeat(40).trim();
  const preview = buildCommunitySnippetPreview(body);

  assert.equal(Array.from(preview).length, COMMUNITY_SNIPPET_PREVIEW_CHARS);
  assert.equal(preview.includes('\n\n'), true);
  assert.equal(preview.endsWith('…'), false);
  assert.equal(preview.endsWith('...'), false);
  // Cuplikan pendek pun tidak kehilangan barisnya.
  assert.equal(buildCommunitySnippetPreview('satu\ndua'), 'satu\ndua');
});

test('normalizeCommunitySnippetInput: preview ikut hasil normalisasi body', () => {
  const { snippet } = normalizeCommunitySnippetInput({ body: 'satu   \r\n\r\n\r\n\r\ndua' });
  assert.equal(snippet.body, 'satu\n\ndua');
  assert.equal(snippet.preview, 'satu\n\ndua');
  assert.equal(snippet.preview, buildCommunitySnippetPreview(snippet.body));

  const panjang = normalizeCommunitySnippetInput({ body: 'z'.repeat(1000) });
  assert.equal(Array.from(panjang.snippet.preview).length, COMMUNITY_SNIPPET_PREVIEW_CHARS);
  assert.equal(panjang.snippet.charCount, 1000);
});

test('communitySnippetCardPayload: tidak pernah membocorkan body', () => {
  const row = {
    post_id: 'post-1',
    title: 'Panduan Manasik',
    body: 'RAHASIA-TEKS-PANJANG',
    preview: 'Panduan singkat manasik…',
    char_count: 4200,
    created_at: '2026-08-16T00:00:00.000Z',
  };
  const payload = communitySnippetCardPayload(row);

  assert.deepEqual(payload, {
    title: 'Panduan Manasik',
    preview: 'Panduan singkat manasik…',
    char_count: 4200,
  });
  assert.equal(Object.hasOwn(payload, 'body'), false);
  assert.equal(JSON.stringify(payload).includes('RAHASIA'), false);
});

test('communitySnippetCardPayload: baris tak layak render -> null', () => {
  assert.equal(communitySnippetCardPayload(null), null);
  assert.equal(communitySnippetCardPayload(undefined), null);
  assert.equal(communitySnippetCardPayload({}), null);
  assert.equal(communitySnippetCardPayload({ preview: '' }), null);
  assert.equal(communitySnippetCardPayload({ preview: '   ' }), null);
  assert.equal(communitySnippetCardPayload({ preview: 42 }), null);
});

test('communitySnippetCardPayload: nilai kolom tercemar dijinakkan', () => {
  assert.deepEqual(communitySnippetCardPayload({ preview: 'cuplikan', title: '', char_count: null }), {
    title: null,
    preview: 'cuplikan',
    char_count: 0,
  });
  assert.deepEqual(communitySnippetCardPayload({ preview: 'cuplikan', char_count: 'bukan-angka' }), {
    title: null,
    preview: 'cuplikan',
    char_count: 0,
  });
  // char_count numerik dalam bentuk string (PostgREST bigint) tetap terbaca.
  assert.equal(communitySnippetCardPayload({ preview: 'cuplikan', char_count: '900' }).char_count, 900);
  // Baris cuplikan multi-baris dilewatkan apa adanya.
  assert.equal(
    communitySnippetCardPayload({ preview: 'baris satu\nbaris dua', char_count: 20 }).preview,
    'baris satu\nbaris dua',
  );
});
