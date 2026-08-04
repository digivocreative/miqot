import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  formatBaniTelegramMessage,
  BANI_TELEGRAM_MAX_LEN,
  BANI_TELEGRAM_MAX_CARDS,
} from '../lib/bani-telegram.js';
import {
  isComplexBaniAnswer,
  BANI_COMPLEX_MIN_CHARS,
  BANI_COMPLEX_MIN_BULLETS,
  BANI_COMPLEX_MIN_CARDS,
} from '../src/lib/baniAnswer.js';

const rootPath = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(rootPath, p), 'utf8');

const paketCard = (over = {}) => ({
  type: 'package',
  jadwal_id: 'JBU1529',
  nama: 'UMRAH HEMAT PLUS REDSEA 9HR',
  berangkat_tgl: '2026-08-22',
  durasi_hari: 9,
  seat_sisa: 2,
  sold_out: false,
  harga_mulai: 31900000,
  ...over,
});
const jamaahCard = (over = {}) => ({
  type: 'jamaah',
  jm_id: 'JM001',
  nama: 'SODIKIN MASUD',
  tgl_berangkat: '2026-08-29',
  sisa: 24900000,
  ...over,
});

// ── kapan tombol muncul ──────────────────────────────────────────────────────

test('jawaban satu kalimat TIDAK ditawarkan kirim', () => {
  // Bentuk paling sering pasca-perubahan gaya: satu angka, satu kalimat.
  assert.equal(isComplexBaniAnswer('Total outstanding jamaah Anda untuk **90 hari ke depan** adalah **Rp2,8 miliar**.'), false);
  assert.equal(isComplexBaniAnswer(''), false);
  assert.equal(isComplexBaniAnswer(null, null), false);
  assert.equal(isComplexBaniAnswer('   '), false);
});

test('jawaban panjang, berdaftar, atau berkartu banyak ditawarkan kirim', () => {
  assert.equal(isComplexBaniAnswer('x'.repeat(BANI_COMPLEX_MIN_CHARS)), true);
  assert.equal(isComplexBaniAnswer('x'.repeat(BANI_COMPLEX_MIN_CHARS - 1)), false);

  const daftar = ['Ada 3 paket:', ...Array.from({ length: BANI_COMPLEX_MIN_BULLETS }, (_, i) => `- baris ${i}`)].join('\n');
  assert.equal(isComplexBaniAnswer(daftar), true);
  assert.equal(isComplexBaniAnswer('Ada 2 paket:\n- satu\n- dua'), false, '2 baris daftar masih tergolong ringkas');

  const cards = Array.from({ length: BANI_COMPLEX_MIN_CARDS }, () => paketCard());
  assert.equal(isComplexBaniAnswer('Singkat saja.', cards), true);
  assert.equal(isComplexBaniAnswer('Singkat saja.', cards.slice(0, BANI_COMPLEX_MIN_CARDS - 1)), false);
});

test('kartu link tidak dihitung — isinya cuma pintasan navigasi', () => {
  const links = Array.from({ length: 4 }, () => ({ type: 'link', target: 'jamaah' }));
  assert.equal(isComplexBaniAnswer('Singkat saja.', links), false);
});

// ── isi pesan Telegram ───────────────────────────────────────────────────────

test('pesan memuat pertanyaan, jawaban, dan kartu sebagai rincian', () => {
  const msg = formatBaniTelegramMessage({
    question: 'Paket terdekat yang masih ada seat apa saja?',
    answer: 'Ada **2 paket**:\n- UMRAH HEMAT 9HR\n- PLUS TURKEY 15HR',
    cards: [paketCard(), jamaahCard()],
  });

  assert.match(msg, /^🤖 <b>Bani<\/b>/);
  assert.match(msg, /<i>Paket terdekat yang masih ada seat apa saja\?<\/i>/);
  assert.match(msg, /<b>2 paket<\/b>/, '**tebal** harus jadi <b>');
  assert.match(msg, /• UMRAH HEMAT 9HR/, 'baris "- " harus jadi butir');
  // Kartu ikut dikirim: system prompt melarang model mengulang detailnya di
  // teks, jadi tanpa blok ini pesan kehilangan tanggal/seat/nominal.
  assert.match(msg, /📦 <b>Paket<\/b>/);
  assert.match(msg, /22 Agu 2026 · 9 hari · sisa 2 seat · mulai Rp31\.900\.000/);
  assert.match(msg, /👤 <b>Jamaah<\/b>/);
  assert.match(msg, /brgkt 29 Agu 2026 · sisa Rp24\.900\.000/);
});

test('teks model di-escape sebelum penanda diterapkan', () => {
  const msg = formatBaniTelegramMessage({
    question: '<script>alert(1)</script>',
    answer: 'Harga < Rp30 juta & seat > 5. Coba <b>tebal palsu</b>.',
  });
  assert.ok(!msg.includes('<script>'), 'tag dari input tidak boleh lolos');
  assert.match(msg, /&lt;script&gt;/);
  assert.match(msg, /Harga &lt; Rp30 juta &amp; seat &gt; 5/);
  assert.match(msg, /&lt;b&gt;tebal palsu&lt;\/b&gt;/, 'tag yang ditulis model tampil literal');
});

test('kartu sold out & tanpa nominal tetap terformat wajar', () => {
  const msg = formatBaniTelegramMessage({
    question: 'q',
    answer: 'a',
    cards: [
      paketCard({ seat_sisa: 0, sold_out: true, harga_mulai: null, durasi_hari: null }),
      jamaahCard({ sisa: 0, tgl_berangkat: null }),
      { type: 'link', target: 'jamaah' },
    ],
  });
  assert.match(msg, /sold out/);
  assert.ok(!msg.includes('null'), 'field kosong tidak boleh bocor sebagai "null"');
  assert.ok(!/sisa Rp0/.test(msg), 'jamaah lunas tidak perlu baris sisa');
  assert.ok(!/link/i.test(msg), 'kartu link tidak dikirim ke Telegram');
});

test('kartu dibatasi dan pesan panjang dipotong tanpa merusak tag', () => {
  const banyak = Array.from({ length: BANI_TELEGRAM_MAX_CARDS + 5 }, (_, i) => paketCard({ nama: `PAKET ${i}` }));
  const msg = formatBaniTelegramMessage({
    question: 'q',
    answer: Array.from({ length: 400 }, (_, i) => `- baris **${i}** dengan teks panjang supaya pesannya melewati batas`).join('\n'),
    cards: banyak,
  });

  assert.ok(msg.length <= BANI_TELEGRAM_MAX_LEN + 1, `pesan ${msg.length} melewati batas Telegram`);
  // Telegram menolak SELURUH pesan bila entity-nya tidak seimbang.
  assert.equal((msg.match(/<b>/g) || []).length, (msg.match(/<\/b>/g) || []).length, 'tag <b> tidak seimbang');
  assert.equal((msg.match(/<i>/g) || []).length, (msg.match(/<\/i>/g) || []).length, 'tag <i> tidak seimbang');
  assert.ok(!/<[^>]*$/.test(msg), 'pesan berakhir dengan tag terpotong');
  assert.ok(!msg.includes('PAKET 12'), 'kartu di atas batas tidak boleh ikut');
});

test('pertanyaan/jawaban kosong tidak menghasilkan blok kosong', () => {
  const msg = formatBaniTelegramMessage({ answer: 'Hanya jawaban.' });
  assert.match(msg, /🤖 <b>Bani<\/b>\n\nHanya jawaban\./);
  assert.ok(!msg.includes('<i></i>'));
});

// ── kontrak endpoint ─────────────────────────────────────────────────────────

test('endpoint kirim-Telegram ter-gate dan tujuannya tidak pernah dari klien', () => {
  const src = read('server.js');
  const route = src.slice(src.indexOf("app.post('/api/bani/telegram'"), src.indexOf("// API: Tanya AI"));
  assert.ok(route.length > 200, 'route /api/bani/telegram tidak ditemukan');

  assert.match(route, /authMiddleware/);
  assert.match(route, /requireBaniAccess\(agent, res\)/, 'gate pilot Bani harus ditegakkan');
  assert.match(route, /sendTelegramMessageDirect\(agent\.telegram_chat_id/, 'tujuan wajib chat id milik pemegang JWT');
  assert.ok(!/req\.body[^\n]*chat_id/.test(route), 'chat id tidak boleh datang dari body klien');
  assert.match(route, /telegram_not_connected/, 'kasus belum terhubung harus punya kode sendiri');
  assert.match(route, /baniTelegramRateLimit/, 'kirim ulang harus punya rate limit sendiri');
  assert.ok(!/baniRateLimit\(/.test(route), 'jangan memakai kuota tanya untuk mengirim');
});

test('UI hanya menawarkan kirim untuk jawaban kompleks', () => {
  const src = read('src/components/bani/BaniPage.tsx');
  assert.match(src, /isComplexBaniAnswer\(answer, cards\)/);
  assert.match(src, /canSendTelegram && \(/, 'tombol harus bergantung pada penilaian kompleksitas');
  assert.match(src, /\/api\/bani\/telegram/);
  assert.match(src, /telegram_not_connected/, 'klien harus menangani Telegram belum terhubung');
});
