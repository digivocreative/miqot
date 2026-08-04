import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BANI_SUGGESTION_POOL,
  BANI_SUGGESTION_GROUPS,
  BANI_SUGGESTION_MEMORY,
  pickBaniSuggestions,
  rememberBaniSuggestions,
} from '../src/lib/baniSuggestions.js';

const rootPath = new URL('..', import.meta.url).pathname;
const VISIBLE = 4;

// Generator acak deterministik supaya urutan undian bisa diperiksa tanpa flake.
function seededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const ICONS = new Set(['plane', 'clock', 'wallet', 'calculator', 'building', 'users', 'cake', 'calendar', 'calendar-range']);

test('pool: teks unik, grup & ikon valid, tiap grup punya cukup kandidat', () => {
  const texts = BANI_SUGGESTION_POOL.map((s) => s.text);
  assert.equal(new Set(texts).size, texts.length, 'teks saran harus unik');
  for (const s of BANI_SUGGESTION_POOL) {
    assert.ok(BANI_SUGGESTION_GROUPS.includes(s.group), `grup tidak dikenal: ${s.group}`);
    assert.ok(ICONS.has(s.icon), `ikon tidak dikenal: ${s.icon}`);
    assert.ok(s.text.trim().length > 10 && s.text.length <= 80, `panjang teks tidak wajar: ${s.text}`);
  }
  for (const group of BANI_SUGGESTION_GROUPS) {
    const size = BANI_SUGGESTION_POOL.filter((s) => s.group === group).length;
    // Undian mengambil 1 per grup dan mengingat 2 putaran terakhir; di bawah 5
    // kandidat, grup mulai kehabisan pilihan segar dan saran terasa berulang.
    assert.ok(size >= 5, `grup ${group} hanya punya ${size} saran`);
  }
});

test('pool: tanpa tanggal hardcoded — pertanyaan relatif supaya tidak basi', () => {
  const BULAN = /\b(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\b/i;
  for (const s of BANI_SUGGESTION_POOL) {
    assert.ok(!/\b(19|20)\d{2}\b/.test(s.text), `ada tahun hardcoded: ${s.text}`);
    assert.ok(!BULAN.test(s.text), `ada nama bulan hardcoded: ${s.text}`);
  }
});

test('pool: pertanyaan tentang jamaah selalu dari sudut pandang agent', () => {
  // Tanpa "saya", pertanyaan jamaah/pembayaran bisa dijawab dari angka nasional
  // (kuota grup di kalender), bukan data agent yang bertanya.
  for (const s of BANI_SUGGESTION_POOL.filter((i) => i.group === 'jamaah' || i.group === 'bayar')) {
    assert.match(s.text, /jamaah saya/i, `kurang sudut pandang agent: ${s.text}`);
  }
});

test('pick: 4 saran berbeda, satu per grup', () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    const picked = pickBaniSuggestions(VISIBLE, [], seededRandom(seed));
    assert.equal(picked.length, VISIBLE);
    assert.equal(new Set(picked.map((s) => s.text)).size, VISIBLE, 'saran tidak boleh kembar');
    assert.equal(new Set(picked.map((s) => s.group)).size, VISIBLE, 'tiap grup diwakili sekali');
  }
});

test('pick: urutan grup ikut berubah, bukan cuma isinya', () => {
  const orders = new Set(
    Array.from({ length: 25 }, (_, i) => (
      pickBaniSuggestions(VISIBLE, [], seededRandom(i + 1)).map((s) => s.group).join('>')
    )),
  );
  assert.ok(orders.size > 1, 'urutan grup selalu sama — daftar terasa statis');
});

test('pick: menghindari saran yang baru saja tampil', () => {
  const first = pickBaniSuggestions(VISIBLE, [], seededRandom(7));
  const recent = rememberBaniSuggestions([], first);
  const second = pickBaniSuggestions(VISIBLE, recent, seededRandom(7));
  const overlap = second.filter((s) => recent.includes(s.text));
  assert.deepEqual(overlap, [], 'undian berikutnya mengulang saran yang barusan tampil');
});

test('pick: dua putaran berturut-turut pun tidak mengulang', () => {
  let recent = [];
  const seen = [];
  for (let round = 1; round <= 2; round += 1) {
    const picked = pickBaniSuggestions(VISIBLE, recent, seededRandom(round * 13));
    seen.push(...picked.map((s) => s.text));
    recent = rememberBaniSuggestions(recent, picked);
  }
  const third = pickBaniSuggestions(VISIBLE, recent, seededRandom(99));
  assert.equal(new Set(seen).size, seen.length, 'putaran 1 & 2 saling mengulang');
  assert.deepEqual(third.filter((s) => seen.includes(s.text)), [], 'putaran 3 mengulang 8 saran terakhir');
});

test('pick: tetap mengembalikan 4 saran walau semua kandidat baru saja tampil', () => {
  const semua = BANI_SUGGESTION_POOL.map((s) => s.text);
  const picked = pickBaniSuggestions(VISIBLE, semua, seededRandom(3));
  assert.equal(picked.length, VISIBLE);
  assert.equal(new Set(picked.map((s) => s.text)).size, VISIBLE);
});

test('pick: count di atas jumlah grup tetap menghasilkan saran unik', () => {
  const picked = pickBaniSuggestions(9, [], seededRandom(5));
  assert.equal(picked.length, 9);
  assert.equal(new Set(picked.map((s) => s.text)).size, 9);
});

test('remember: terbaru di depan, tanpa duplikat, dipotong batas ingatan', () => {
  const picked = BANI_SUGGESTION_POOL.slice(0, VISIBLE);
  const recent = rememberBaniSuggestions(['lama-1', 'lama-2'], picked);
  assert.deepEqual(recent.slice(0, VISIBLE), picked.map((s) => s.text));
  assert.deepEqual(recent.slice(VISIBLE), ['lama-1', 'lama-2']);

  const penuh = rememberBaniSuggestions(recent, BANI_SUGGESTION_POOL.slice(4, 8));
  assert.equal(penuh.length, BANI_SUGGESTION_MEMORY);
  assert.equal(new Set(penuh).size, penuh.length);

  const ulang = rememberBaniSuggestions(['a', 'b'], ['b']);
  assert.deepEqual(ulang, ['b', 'a'], 'teks yang tampil lagi harus naik ke depan, bukan ganda');
});

test('remember: input rusak dari localStorage tidak merusak daftar', () => {
  assert.deepEqual(rememberBaniSuggestions(null, [{ text: 'x' }, null, 42, { text: '' }]), ['x']);
  assert.deepEqual(rememberBaniSuggestions('bukan-array', []), []);
});

// Tombol "Tanya yang lain" dicabut 4 Agt 2026, diganti "Bersihkan percakapan"
// (percakapan kini bertahan 24 jam) plus chip pertanyaan lanjutan dari model.
test('BaniPage memakai pool bersama dan mengundi ulang saat percakapan dibersihkan', () => {
  const src = readFileSync(join(rootPath, 'src/components/bani/BaniPage.tsx'), 'utf8');
  assert.match(src, /from '@\/lib\/baniSuggestions'/, 'pool harus dari modul bersama');
  assert.ok(!/const SUGGESTION_POOL = \[/.test(src), 'jangan menghidupkan lagi pool lokal di komponen');
  const reset = src.match(/const clearConversation = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\);/);
  assert.ok(reset, 'clearConversation tidak ditemukan');
  assert.match(reset[0], /setSuggestions\(drawSuggestions\(\)\)/, 'bersihkan harus mengundi saran baru');
  assert.match(reset[0], /clearStoredConversation\(\)/, 'bersihkan harus menghapus percakapan tersimpan');
});

// Chip lanjutan datang dari model; kalau kosong, undian generik lebih berguna
// daripada ruang kosong di bawah jawaban.
test('BaniPage menjatuhkan saran lanjutan ke undian saat model tidak memberi', () => {
  const src = readFileSync(join(rootPath, 'src/components/bani/BaniPage.tsx'), 'utf8');
  assert.match(src, /if \(lastTurn\.followUps\.length\) return lastTurn\.followUps;/);
  assert.match(src, /pickBaniSuggestions\(3, turns\.map\(\(t\) => t\.question\)\)/);
});
