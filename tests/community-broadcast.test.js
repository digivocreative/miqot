import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EVERYONE_TOKEN,
  hasEveryoneMention,
  jakartaDayStartIso,
  resolveBroadcastQuota,
  broadcastQuotaLabel,
} from '../lib/community-broadcast.js';
import { isReservedAgentSlug } from '../lib/agent-slug.js';

test('@semua dikenali hanya pada batas kata yang benar', () => {
  assert.equal(EVERYONE_TOKEN, 'semua');
  assert.equal(hasEveryoneMention('Halo @semua, besok kumpul'), true);
  assert.equal(hasEveryoneMention('@semua'), true);
  assert.equal(hasEveryoneMention('(@Semua) mohon perhatiannya'), true);
  assert.equal(hasEveryoneMention('Selesai @semua.'), true);
  // Bukan broadcast: kata lain yang kebetulan berawalan sama.
  assert.equal(hasEveryoneMention('@semuanya hadir ya'), false);
  assert.equal(hasEveryoneMention('kirim ke bagas@semua.com'), false);
  assert.equal(hasEveryoneMention('email: a.b@semua'), false);
  assert.equal(hasEveryoneMention('@semua-agent'), false);
  assert.equal(hasEveryoneMention(''), false);
  assert.equal(hasEveryoneMention(null), false);
});

test('awal hari WIB dihitung dari waktu yang disuntikkan, bukan jam sistem', () => {
  // 2026-07-20 07:00 WIB = 2026-07-20T00:00:00Z
  assert.equal(jakartaDayStartIso('2026-07-20T00:00:00.000Z'), '2026-07-19T17:00:00.000Z');
  // 23:59 WIB dan 00:01 WIB berada di dua hari kuota yang berbeda.
  assert.equal(jakartaDayStartIso('2026-07-20T16:59:00.000Z'), '2026-07-19T17:00:00.000Z');
  assert.equal(jakartaDayStartIso('2026-07-20T17:01:00.000Z'), '2026-07-20T17:00:00.000Z');
});

test('kuota: admin tanpa batas, agent satu kali sehari', () => {
  assert.deepEqual(resolveBroadcastQuota({ role: 'admin', usedToday: 5 }),
    { unlimited: true, allowed: true, remaining: Infinity });
  assert.deepEqual(resolveBroadcastQuota({ role: 'agent', usedToday: 0 }),
    { unlimited: false, allowed: true, remaining: 1 });
  assert.deepEqual(resolveBroadcastQuota({ role: 'agent', usedToday: 1 }),
    { unlimited: false, allowed: false, remaining: 0 });
  // Hitungan aneh dari DB tidak boleh membuat sisa jatah negatif.
  assert.deepEqual(resolveBroadcastQuota({ role: 'agent', usedToday: 4 }),
    { unlimited: false, allowed: false, remaining: 0 });
  // Peran tak dikenal diperlakukan seperti agent biasa, bukan admin.
  assert.equal(resolveBroadcastQuota({ role: undefined, usedToday: 1 }).allowed, false);
});

test('label picker menjelaskan aturan sebelum tombol kirim ditekan', () => {
  assert.equal(broadcastQuotaLabel({ unlimited: true, allowed: true, remaining: Infinity }), 'tanpa batas');
  assert.equal(broadcastQuotaLabel({ unlimited: false, allowed: true, remaining: 1 }), '1× sehari');
  assert.equal(broadcastQuotaLabel({ unlimited: false, allowed: false, remaining: 0 }), 'jatah hari ini habis');
});

test('slug "semua" tidak boleh diklaim agent', () => {
  assert.equal(isReservedAgentSlug('semua'), true);
  assert.equal(isReservedAgentSlug('SEMUA'), true);
  assert.equal(isReservedAgentSlug('semuanya'), false);
});

test('migrasi broadcast additive dan punya index untuk kuota serta lonceng', () => {
  const sql = readFileSync(new URL('../migrations/20260725000000_community_broadcast.sql', import.meta.url), 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS mentions_everyone BOOLEAN NOT NULL DEFAULT false/i);
  assert.match(sql, /community_posts_broadcast_quota_idx/);
  assert.match(sql, /community_posts_broadcast_feed_idx/);
  // Additive saja: kolom lama tidak boleh disentuh.
  assert.doesNotMatch(sql, /DROP\s+(COLUMN|TABLE)/i);
  assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
});

test('server memakai guard skema broadcast, bukan menembakkan galat mentah', () => {
  const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /function isCommunityBroadcastSchemaMissing\(error\)/,
    'guard skema broadcast harus ada');
  assert.match(source, /Migrasi @semua Teras belum diterapkan/,
    'pesan 503 pra-migrasi harus persis seperti spec');
});

test('POST kiriman menegakkan kuota @semua sebelum menyimpan', () => {
  const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  // Diawali \n supaya cocok ke deklarasi route sungguhan (kolom 0), bukan
  // komentar yang menyebut path route — server.js ~518 menulis
  // "app.post('/api/community/posts', ...)" sebagai contoh, dan komentar itu
  // yang tadinya tertangkap (uji ini hijau/merah karena alasan yang salah).
  const handlerStart = source.indexOf("\napp.post('/api/community/posts',");
  assert.ok(handlerStart > 0, 'handler POST kiriman harus ada');
  const afterHandlerStart = source.slice(handlerStart + 1);
  const nextRouteIndex = afterHandlerStart.search(/\napp\.(?:get|post|put|patch|delete)\(/);
  const handler = nextRouteIndex === -1
    ? afterHandlerStart
    : afterHandlerStart.slice(0, nextRouteIndex);

  assert.match(handler, /hasEveryoneMention\(body\)/,
    'token dibaca dari body server, bukan dari flag kiriman klien');
  assert.match(handler, /Jatah @semua hari ini sudah dipakai\. Coba lagi besok\./,
    'penolakan kuota memakai kalimat spec');

  // Insert-nya tinggal di helper createCommunityPostRow (dipakai berulang oleh
  // pembuat utas), jadi kolom tandanya dicari di sana — bukan di handler.
  const helperStart = source.indexOf('\nasync function createCommunityPostRow({');
  assert.ok(helperStart > 0, 'helper createCommunityPostRow harus ada');
  const helperEnd = source.indexOf('\n}\n', helperStart);
  assert.ok(helperEnd > helperStart, 'helper createCommunityPostRow harus punya akhir');
  const helper = source.slice(helperStart, helperEnd);
  assert.match(helper, /mentions_everyone/,
    'kolom tanda ikut disisipkan');
  assert.match(handler, /mentionsEveryone:/,
    'hasil deteksi server diteruskan ke helper insert, bukan diabaikan');

  const quotaCheck = handler.indexOf('Jatah @semua hari ini sudah dipakai');
  const insert = handler.indexOf('createCommunityPostRow(');
  assert.ok(quotaCheck > 0, 'penolakan kuota harus ada di dalam handler');
  assert.ok(insert > 0, 'handler harus menyimpan lewat createCommunityPostRow');
  assert.ok(quotaCheck < insert,
    'kuota diperiksa sebelum insert, bukan sesudah');
});

test('endpoint kuota broadcast tersedia untuk komposer', () => {
  const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /app\.get\('\/api\/community\/broadcast-quota'/);
  assert.match(source, /async function loadBroadcastQuota\(/);
});
