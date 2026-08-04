import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  formatBaniTelegramMessage,
  BANI_TELEGRAM_MAX_LEN,
  BANI_TELEGRAM_MAX_CARDS,
  BANI_TELEGRAM_TITLE_MAX,
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

const NOW = new Date('2026-08-01T00:00:00Z');

test('pesan memuat pertanyaan, jawaban, dan kartu sebagai rincian', () => {
  const msg = formatBaniTelegramMessage({
    question: 'Paket terdekat yang masih ada seat apa saja?',
    answer: 'Ada **2 paket**:\n- UMRAH HEMAT 9HR\n- PLUS TURKEY 15HR',
    cards: [paketCard(), jamaahCard()],
    now: NOW,
  });

  // Baris pertama = yang terbaca di notifikasi kunci layar, jadi isinya
  // pertanyaan — bukan "🤖 Bani" yang selalu sama.
  assert.match(msg, /^🤖 <b>Paket terdekat yang masih ada seat apa saja\?<\/b>/);
  assert.match(msg, /<b>2 paket<\/b>/, '**tebal** harus jadi <b>');
  assert.match(msg, /• UMRAH HEMAT 9HR/, 'baris "- " harus jadi butir');
  // Kartu ikut dikirim: system prompt melarang model mengulang detailnya di
  // teks, jadi tanpa blok ini pesan kehilangan tanggal/seat/nominal.
  assert.match(msg, /<b>📦 1 paket<\/b>/);
  assert.match(msg, /22 Agu · 9 hari · sisa 2 · 31,9 jt/);
  assert.match(msg, /<b>👤 1 jamaah<\/b>/);
  assert.match(msg, /29 Agu · sisa bayar Rp24\.900\.000/);
});

// Baris detail dibaca di layar HP ±40 kolom. Yang melewatinya dilipat Telegram
// di tempat acak, dan daftar yang tiap barisnya patah di tempat berbeda itulah
// yang bikin pesan lama terasa berantakan.
test('baris detail kartu muat dalam 40 kolom', () => {
  const msg = formatBaniTelegramMessage({
    question: 'q',
    answer: 'a',
    cards: [
      paketCard({ nama: 'UMRAH HEMAT PLUS REDSEA 9HR', harga_mulai: 395000000, durasi_hari: 26, seat_sisa: 14 }),
      jamaahCard({ sisa: 124900000 }),
    ],
    now: NOW,
  });

  const detail = msg
    .split('\n')
    .filter((l) => /·/.test(l) && !/<b>/.test(l));
  assert.ok(detail.length >= 2, 'baris detail paket & jamaah harus ada');
  for (const line of detail) {
    assert.ok(line.length <= 40, `baris detail ${line.length} kolom, akan terlipat: ${line}`);
  }
});

// Tahun ditentukan sekali untuk SELURUH pesan — "11 Feb" bersanding dengan
// "12 Jul 25" membuat pembaca baris polos tak tahu tahunnya. Aturan yang sama
// dengan makeTanggalKolom di BaniResultTable.
test('tahun tanggal seragam sepesan: muncul hanya bila ada yang di luar tahun ini', () => {
  const seTahun = formatBaniTelegramMessage({
    answer: 'a', cards: [paketCard()], now: NOW,
  });
  assert.match(seTahun, /22 Agu ·/);
  assert.ok(!/22 Agu 26/.test(seTahun), 'tahun berjalan tidak perlu ditulis');

  const lintasTahun = formatBaniTelegramMessage({
    answer: 'a',
    cards: [paketCard(), paketCard({ nama: 'TAHUN DEPAN', berangkat_tgl: '2027-02-11' })],
    now: NOW,
  });
  assert.match(lintasTahun, /22 Agu 26 ·/, 'sekali ada tahun lain, semua baris ikut bertahun');
  assert.match(lintasTahun, /11 Feb 27 ·/);
});

// Daftar yang dipotong diam-diam terbaca seolah itulah seluruh hasilnya.
test('kartu yang tidak muat dihitung, bukan dibuang diam-diam', () => {
  const msg = formatBaniTelegramMessage({
    question: 'q',
    answer: 'a',
    cards: Array.from({ length: BANI_TELEGRAM_MAX_CARDS + 3 }, (_, i) => paketCard({ nama: `PAKET ${i}` })),
    now: NOW,
  });
  assert.match(msg, /\+3 lainnya, lihat di dashboard/);
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
  assert.ok(!/sisa bayar Rp0/.test(msg), 'jamaah lunas bukan "sisa bayar Rp0"');
  assert.match(msg, /lunas/, 'nol itu kabar baik yang berdiri sendiri');
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
  assert.match(msg, /🤖 <b>Bani<\/b>\n\nHanya jawaban\./, 'tanpa pertanyaan, judul jatuh ke nama bot');
  assert.ok(!msg.includes('<b></b>'));
});

// Judul masuk ke dalam <b>. Kalau isinya ikut dikonversi markdown, "**tebal**"
// jadi <b> di dalam <b> dan Telegram menolak SELURUH pesan.
// Pertanyaan boleh 500 karakter; utuh di baris judul yang tebal, jawabannya
// baru mulai setelah dinding ±13 baris.
test('judul panjang dipangkas di batas kata', () => {
  const panjang = 'apakah ada paket umroh yang berangkat bulan September dengan harga terjangkau '
    + 'dan masih menyisakan seat untuk rombongan sepuluh orang dari Surabaya';
  const judul = formatBaniTelegramMessage({ question: panjang, answer: 'a' }).split('\n')[0];
  const teks = judul.replace(/^🤖 <b>|<\/b>$/g, '');
  assert.ok(teks.length <= BANI_TELEGRAM_TITLE_MAX + 1, `judul ${teks.length} karakter, terlalu panjang`);
  assert.match(teks, /…$/);
  assert.ok(!/\s…$/.test(teks), 'jangan sisakan spasi menggantung sebelum elipsis');
  assert.ok(panjang.startsWith(teks.slice(0, -1)), 'potongan harus persis awal pertanyaannya');
  // Batas kata: potongan tidak boleh berhenti di tengah kata.
  assert.ok(panjang[teks.length - 1] === ' ' || panjang.length === teks.length - 1, 'potong di batas kata');
});

test('judul tidak menyarangkan tag walau pertanyaannya memuat markdown', () => {
  const msg = formatBaniTelegramMessage({ question: 'paket **VIP** yang mana?', answer: 'a' });
  const judul = msg.split('\n')[0];
  assert.equal((judul.match(/<b>/g) || []).length, 1, '<b> tidak boleh bersarang di judul');
  assert.match(judul, /\*\*VIP\*\*/, 'markdown di pertanyaan tampil apa adanya');
});

// ── kontrak endpoint ─────────────────────────────────────────────────────────

test('endpoint kirim-Telegram ter-gate dan tujuannya tidak pernah dari klien', () => {
  const src = read('server.js');
  const route = src.slice(src.indexOf("app.post('/api/bani/telegram'"), src.indexOf("// API: Tanya AI"));
  assert.ok(route.length > 200, 'route /api/bani/telegram tidak ditemukan');

  assert.match(route, /authMiddleware/);
  assert.match(route, /requireBaniAccess\(agent, res\)/, 'gate akses Bani harus ditegakkan');
  assert.match(route, /sendTelegramMessageDirect\(agent\.telegram_chat_id/, 'tujuan wajib chat id milik pemegang JWT');
  assert.ok(!/req\.body[^\n]*chat_id/.test(route), 'chat id tidak boleh datang dari body klien');
  assert.match(route, /telegram_not_connected/, 'kasus belum terhubung harus punya kode sendiri');
  assert.match(route, /baniTelegramRateLimit/, 'kirim ulang harus punya rate limit sendiri');
  assert.ok(!/baniRateLimit\(/.test(route), 'jangan memakai kuota tanya untuk mengirim');
  // Tautan balik sebagai tombol inline, pola yang sama dengan notifikasi Teras
  // — URL telanjang di badan pesan bikin pesan makin panjang dan berantakan.
  assert.match(route, /buildTelegramUrlKeyboard/, 'tautan balik harus jadi tombol');
  assert.match(route, /\$\{TELEGRAM_APP_BASE_URL\}\/dashboard\/bani/);
  assert.match(route, /sendTelegramMessageDirect\([^)]*\{ reply_markup/, 'tombolnya harus benar-benar ikut terkirim');
});

// Brosur & itinerary ikut terkirim, tapi alamatnya TIDAK boleh datang dari
// klien: endpoint yang meneruskan url kiriman klien ke Telegram bisa disuruh
// mengirim berkas mana pun dari internet ke chat agent.
test('media dikirim dari URL yang disusun server, bukan dari klien', () => {
  const src = read('server.js');
  const route = src.slice(src.indexOf("app.post('/api/bani/telegram'"), src.indexOf('// API: Tanya AI'));

  assert.match(route, /resolveBaniMediaFiles\(req\.body\?\.media\)/, 'media klien harus lewat resolver');
  assert.match(route, /sendTelegramFileDirect\(agent\.telegram_chat_id/, 'berkas wajib ke chat id pemegang JWT');
  assert.ok(!/(photo|document):\s*[^\n]*req\.body/.test(route), 'url berkas tidak boleh langsung dari body klien');

  const resolver = src.slice(src.indexOf('async function resolveBaniMediaFiles'), src.indexOf("app.post('/api/bani/telegram'"));
  assert.ok(resolver.length > 200, 'resolveBaniMediaFiles tidak ditemukan');
  assert.match(resolver, /serializeScheduleRows/, 'url disusun dari kolom cdn + sha, sama seperti saat jawabannya dibuat');
  assert.ok(!/item\.url/.test(resolver), 'url dari klien tidak boleh dipakai');
});

// PDF yang dikirim lewat sendPhoto ditolak Telegram — bentuknya harus berbeda.
test('brosur jadi foto, itinerary jadi dokumen', () => {
  const src = read('server.js');
  const resolver = src.slice(src.indexOf('async function resolveBaniMediaFiles'), src.indexOf("app.post('/api/bani/telegram'"));

  assert.match(resolver, /itinerary_cdn/, 'kolom itinerary harus ikut di-select');
  assert.match(resolver, /type === 'brosur' \? 'photo' : 'document'/);
  assert.match(resolver, /type === 'brosur' \? row\?\.brosur : row\?\.itinerary/);

  const sender = src.slice(src.indexOf('async function sendTelegramFileDirect'), src.indexOf('const TELEGRAM_APP_BASE_URL'));
  assert.match(sender, /isDocument \? 'sendDocument' : 'sendPhoto'/);
  assert.match(sender, /\[isDocument \? 'document' : 'photo'\]/);
  assert.ok(!/parse_mode/.test(sender), 'caption teks polos — tanpa parse_mode tidak ada urusan escape');
});

test('klien mengirim penunjuk media, bukan alamatnya', () => {
  const src = read('src/components/bani/BaniPage.tsx');
  const badan = src.slice(src.indexOf("'/api/bani/telegram'"), src.indexOf("'/api/bani/telegram'") + 1000);
  assert.match(badan, /\.map\(\(m\) => \(\{ type: m\.type, jadwal_id: m\.jadwal_id \}\)\)/);
  // Dicek pada KODE-nya, bukan sekadar kata "url" yang juga muncul di komentar.
  assert.doesNotMatch(badan, /\burl:/, 'alamat berkas tidak boleh ikut dikirim');
  assert.doesNotMatch(badan, /m\.url/, 'alamat dari klien tidak boleh dibaca sama sekali');
  // Brosur jadwal bukan berkas melainkan pintasan ke /dashboard/brosur — tidak
  // ada yang bisa dilampirkan, jadi ia disaring keluar sebelum dikirim.
  assert.match(badan, /m\.type === 'brosur' \|\| m\.type === 'itinerary'/);
});

test('UI hanya menawarkan kirim untuk jawaban kompleks', () => {
  const src = read('src/components/bani/BaniPage.tsx');
  // Bani kini bertahap: yang ditawarkan untuk dikirim adalah giliran TERAKHIR.
  assert.match(src, /isComplexBaniAnswer\(lastTurn!\.answer, lastTurn!\.cards\)/);
  assert.match(src, /canSendTelegram && \(/, 'tombol harus bergantung pada penilaian kompleksitas');
  assert.match(src, /\/api\/bani\/telegram/);
  assert.match(src, /telegram_not_connected/, 'klien harus menangani Telegram belum terhubung');
});

// Kirim keluar aplikasi lewat konfirmasi dulu (permintaan agent 4 Agt 2026) —
// pola yang sama dengan BaniWaConfirm untuk klik nama jamaah → WhatsApp.
test('kirim ke Telegram melewati dialog konfirmasi, bukan langsung terkirim', () => {
  const src = read('src/components/bani/BaniPage.tsx');
  assert.match(src, /function BaniTelegramConfirm/);
  assert.match(src, /onClick=\{\(\) => setTelegramConfirm\(true\)\}/, 'tombol hanya membuka konfirmasi');
  // Satu-satunya jalur ke sendToTelegram adalah tombol Kirim di dalam dialog.
  const calls = src.match(/sendToTelegram\(\)/g) || [];
  assert.equal(calls.length, 1, 'sendToTelegram hanya dipanggil dari konfirmasi');
  assert.match(src, /setTelegramConfirm\(false\);\s*\n\s*sendToTelegram\(\);/);
});
