import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJamaahSearchNeedle,
  matchesUmrohJamaahSearch,
  buildJamaahSearchOrFilter,
} from '../lib/jamaah-search.js';

const scheduleMap = new Map([['J1', 'UMROH RAHMAH 12 HARI']]);

function umrohRow(overrides = {}) {
  return {
    nama: 'AHMAD FAUZI',
    id_umroh: 'UM2026001',
    jm_id: 'JM123456',
    wa: '62812345678',
    no_paspor: 'C1234567',
    paket: 'UMROH REGULER',
    raw_data: { id_jadwal: 'J1' },
    ...overrides,
  };
}

function matches(input, row = umrohRow()) {
  return matchesUmrohJamaahSearch(row, buildJamaahSearchNeedle(input), scheduleMap);
}

// ── Nomor telepon: akar keluhan aslinya ──────────────────────────────────────
// Produksi menyimpan 5.185 baris `62…` dan 196 baris `0…`, digit murni tanpa
// pemisah. Mengetik format mana pun harus menemukan keduanya.

test('semua varian format menemukan baris yang tersimpan sebagai 62…', () => {
  for (const input of ['0812345678', '62812345678', '+62 812-345-678', '812345678']) {
    assert.equal(matches(input), true, `gagal untuk input ${JSON.stringify(input)}`);
  }
});

test('baris yang tersimpan sebagai 0… ditemukan saat mengetik 62…', () => {
  const row = umrohRow({ wa: '0812345678' });
  for (const input of ['62812345678', '0812345678', '812345678']) {
    assert.equal(matches(input, row), true, `gagal untuk input ${JSON.stringify(input)}`);
  }
});

test('input nomor pendek tidak mengaktifkan term nomor', () => {
  // Tanpa ambang ini, "8" mencocokkan hampir semua baris dan mengubur hasil nama.
  for (const input of ['8', '81', '812']) {
    assert.equal(buildJamaahSearchNeedle(input).phone, null, `input ${input} tak boleh jadi term nomor`);
  }
  assert.equal(buildJamaahSearchNeedle('8123').phone, '8123');
});

test('input bercampur huruf tidak mengaktifkan term nomor', () => {
  assert.equal(buildJamaahSearchNeedle('JM123456').phone, null);
  assert.equal(buildJamaahSearchNeedle('C1234567').phone, null);
});

test('nomor asing tetap ditemukan apa adanya', () => {
  // 971…/601… tak berawalan 62 maupun 0, jadi tak ada yang dilepas dan
  // nomornya dicocokkan utuh.
  const row = umrohRow({ wa: '971501234567' });
  assert.equal(matches('971501234567', row), true);
  assert.equal(matches('+971 50 123 4567', row), true);
});

test('nomor yang tidak cocok tidak mengembalikan baris', () => {
  assert.equal(matches('62899999999'), false);
});

// ── Field teks baru ──────────────────────────────────────────────────────────

test('cocok pada nama, kode jamaah, paspor, dan paket tanpa peduli besar-kecil huruf', () => {
  assert.equal(matches('fauzi'), true);
  assert.equal(matches('jm123456'), true);
  assert.equal(matches('c1234567'), true);
  assert.equal(matches('reguler'), true);
  assert.equal(matches('um2026001'), true);
});

test('cocok pada nama jadwal yang berasal dari scheduleMap, bukan kolom baris', () => {
  assert.equal(matches('rahmah'), true);
  // Tanpa scheduleMap, istilah yang sama tak boleh cocok — membuktikan
  // sumbernya memang enrich jadwal dan bukan kolom paket.
  assert.equal(
    matchesUmrohJamaahSearch(umrohRow(), buildJamaahSearchNeedle('rahmah'), new Map()),
    false,
  );
});

test('input multi-kata diperlakukan apa adanya sebagai satu potongan', () => {
  assert.equal(matches('ahmad fauzi'), true);
  assert.equal(matches('fauzi ahmad'), false);
});

test('baris dengan field kosong tidak melempar', () => {
  const row = { nama: null, id_umroh: null, jm_id: null, wa: null, no_paspor: null, paket: null, raw_data: null };
  assert.equal(matches('fauzi', row), false);
});

test('istilah yang tak cocok di mana pun mengembalikan false', () => {
  assert.equal(matches('zulkarnain'), false);
});

// ── Needle kosong ────────────────────────────────────────────────────────────

test('input kosong atau hanya spasi menghasilkan needle null', () => {
  for (const input of ['', '   ', null, undefined]) {
    assert.equal(buildJamaahSearchNeedle(input), null, `input ${JSON.stringify(input)} harus null`);
  }
});

test('needle null meloloskan semua baris', () => {
  assert.equal(matchesUmrohJamaahSearch(umrohRow(), null, scheduleMap), true);
});

// ── Builder .or() untuk Haji ─────────────────────────────────────────────────

test('buildJamaahSearchOrFilter menyusun term teks dan nomor', () => {
  const filter = buildJamaahSearchOrFilter('62812345678', {
    textColumns: ['nama', 'id_haji'],
    phoneColumns: ['telp'],
  });
  assert.equal(filter, 'nama.ilike.%62812345678%,id_haji.ilike.%62812345678%,telp.ilike.%812345678%');
});

test('buildJamaahSearchOrFilter melewati term nomor saat input bukan nomor', () => {
  const filter = buildJamaahSearchOrFilter('fauzi', {
    textColumns: ['nama'],
    phoneColumns: ['telp'],
  });
  assert.equal(filter, 'nama.ilike.%fauzi%');
});

test('buildJamaahSearchOrFilter meng-escape metakarakter PostgREST', () => {
  const filter = buildJamaahSearchOrFilter('a,b(c)*d%e', {
    textColumns: ['nama'],
    phoneColumns: ['telp'],
  });
  assert.equal(filter, 'nama.ilike.%a\\,b\\(c\\)\\*d\\%e%');
});

test('buildJamaahSearchOrFilter mengembalikan null untuk input kosong', () => {
  assert.equal(buildJamaahSearchOrFilter('  ', { textColumns: ['nama'], phoneColumns: ['telp'] }), null);
});
