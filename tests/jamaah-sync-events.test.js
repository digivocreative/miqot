import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeJamaahSyncEvents,
  dedupeJamaahSyncEvents,
  jamaahRowKey,
} from '../lib/jamaah-sync-events.js';

// Skenario nyata AIW0030233 (2026-08-16): booking UHUD 5 pax, DP Rp1jt/pax,
// berangkat 19 Des. Sebagian pax masuk DB di siklus lebih awal dengan bayar=0
// (data entry hulu bertahap), sisanya muncul belakangan bersama pembayaran.
const NOW = new Date('2026-08-16T03:44:00Z');
const BERANGKAT = '2026-12-19';

function pax(nama, jmId, over = {}) {
  return {
    nama,
    id_umroh: 'AIW0030233',
    jm_id: jmId,
    paket: 'UHUD',
    bayar: 1000000,
    sisa: 37900000,
    tgl_berangkat: BERANGKAT,
    tgl_daftar: '2026-08-16',
    ...over,
  };
}

function asExistingMap(rows) {
  const map = new Map();
  for (const row of rows) map.set(jamaahRowKey(row), row);
  return map;
}

test('siklus B AIW0030233: pax lama tak ternotifikasi + pembayaran masuk → SEMUA diumumkan sebagai jamaah baru', () => {
  // Siklus A menulis 3 pax dengan bayar=0 tanpa notifikasi (gate lama).
  const existing = asExistingMap([
    pax('TANTI DWI HARTANTI', 'JM66977', { bayar: 0, sisa: 38900000, notif_new_sent_at: null, notif_last_bayar: null }),
    pax('ERWINA KHANSA RAMADHANI', 'JM66979', { bayar: 0, sisa: 38900000, notif_new_sent_at: null, notif_last_bayar: null }),
    pax('DANISH RANIA HARTYASTOMO', 'JM66980', { bayar: 0, sisa: 38900000, notif_new_sent_at: null, notif_last_bayar: null }),
  ]);
  // Siklus B: pembayaran 1jt/pax tercatat + Yeti muncul sebagai pax baru.
  const incoming = [
    pax('TANTI DWI HARTANTI', 'JM66977'),
    pax('ERWINA KHANSA RAMADHANI', 'JM66979'),
    pax('DANISH RANIA HARTYASTOMO', 'JM66980'),
    pax('YETI SUCIATI', 'JM66981'),
  ];

  const events = computeJamaahSyncEvents({
    incomingRows: incoming,
    existingByKey: existing,
    watermarkEnabled: true,
    now: NOW,
  });

  const namaBaru = events.jamaahBaru.map(e => e.nama).sort();
  assert.deepEqual(namaBaru, [
    'DANISH RANIA HARTYASTOMO',
    'ERWINA KHANSA RAMADHANI',
    'TANTI DWI HARTANTI',
    'YETI SUCIATI',
  ]);
  // Pax yang baru diumumkan tidak dobel sebagai event pembayaran di siklus sama.
  assert.equal(events.pembayaranCicilan.length, 0);
  assert.equal(events.pembayaranPelunasan.length, 0);
});

test('tanpa watermark (migrasi belum jalan): pax lama tetap bukan "baru", tapi cicilan saudara se-booking TIDAK runtuh jadi satu', () => {
  const existing = asExistingMap([
    pax('TANTI DWI HARTANTI', 'JM66977', { bayar: 0, sisa: 38900000 }),
    pax('ERWINA KHANSA RAMADHANI', 'JM66979', { bayar: 0, sisa: 38900000 }),
    pax('DANISH RANIA HARTYASTOMO', 'JM66980', { bayar: 0, sisa: 38900000 }),
  ]);
  const incoming = [
    pax('TANTI DWI HARTANTI', 'JM66977'),
    pax('ERWINA KHANSA RAMADHANI', 'JM66979'),
    pax('DANISH RANIA HARTYASTOMO', 'JM66980'),
    pax('YETI SUCIATI', 'JM66981'),
  ];

  const events = computeJamaahSyncEvents({
    incomingRows: incoming,
    existingByKey: existing,
    watermarkEnabled: false,
    now: NOW,
  });

  assert.deepEqual(events.jamaahBaru.map(e => e.nama), ['YETI SUCIATI']);
  // Regresi 2026-08-16: dedup lama pakai id_umroh (booking) sehingga 3 DP
  // identik Rp1jt runtuh jadi 1. Harus 3 event terpisah.
  assert.equal(events.pembayaranCicilan.length, 3);
  assert.deepEqual(
    events.pembayaranCicilan.map(e => e.nama).sort(),
    ['DANISH RANIA HARTYASTOMO', 'ERWINA KHANSA RAMADHANI', 'TANTI DWI HARTANTI'],
  );
  for (const e of events.pembayaranCicilan) assert.equal(e.jumlah, 1000000);
});

test('pax baru dalam booking yang belum bayar sama sekali → tetap senyap (anti-noise dipertahankan)', () => {
  const incoming = [
    pax('A', 'JM1', { bayar: 0, sisa: 0 }),
    pax('B', 'JM2', { bayar: 0, sisa: 0 }),
  ];
  const events = computeJamaahSyncEvents({
    incomingRows: incoming,
    existingByKey: new Map(),
    watermarkEnabled: true,
    now: NOW,
  });
  assert.equal(events.jamaahBaru.length, 0);
});

test('pax lama bayar=0 diumumkan ketika SAUDARA se-booking punya pembayaran (gate naik ke level booking)', () => {
  const existing = asExistingMap([
    pax('IBU', 'JM1', { bayar: 0, sisa: 38900000, notif_new_sent_at: null, notif_last_bayar: null }),
  ]);
  const incoming = [
    pax('IBU', 'JM1', { bayar: 0, sisa: 38900000 }),
    pax('ANAK', 'JM2', { bayar: 5000000, sisa: 33900000 }),
  ];
  const events = computeJamaahSyncEvents({
    incomingRows: incoming,
    existingByKey: existing,
    watermarkEnabled: true,
    now: NOW,
  });
  assert.deepEqual(events.jamaahBaru.map(e => e.nama).sort(), ['ANAK', 'IBU']);
});

test('watermark refire: notif pernah gagal terkirim (bayar DB sudah maju, watermark belum) → delta tetap terdeteksi', () => {
  const existing = asExistingMap([
    pax('TANTI DWI HARTANTI', 'JM66977', {
      bayar: 1000000, sisa: 37900000,               // DB sudah menyerap pembayaran
      notif_new_sent_at: '2026-08-10T00:00:00Z',
      notif_last_bayar: 0,                          // tapi belum pernah dinotifikasi
    }),
  ]);
  const incoming = [pax('TANTI DWI HARTANTI', 'JM66977')];

  const events = computeJamaahSyncEvents({
    incomingRows: incoming,
    existingByKey: existing,
    watermarkEnabled: true,
    now: NOW,
  });

  assert.equal(events.pembayaranCicilan.length, 1);
  assert.equal(events.pembayaranCicilan[0].jumlah, 1000000);
});

test('watermark sudah ter-commit → siklus berikutnya senyap (tidak dobel notif)', () => {
  const existing = asExistingMap([
    pax('TANTI DWI HARTANTI', 'JM66977', {
      bayar: 1000000, sisa: 37900000,
      notif_new_sent_at: '2026-08-16T03:44:00Z',
      notif_last_bayar: 1000000,
    }),
  ]);
  const incoming = [pax('TANTI DWI HARTANTI', 'JM66977')];

  const events = computeJamaahSyncEvents({
    incomingRows: incoming,
    existingByKey: existing,
    watermarkEnabled: true,
    now: NOW,
  });

  assert.equal(events.jamaahBaru.length, 0);
  assert.equal(events.pembayaranCicilan.length, 0);
  assert.equal(events.pembayaranPelunasan.length, 0);
});

test('DP pertama saat sisa sebelumnya 0/null → tetap event cicilan (gate sisaDecreased lama membuangnya)', () => {
  const existing = asExistingMap([
    pax('BARU BAYAR', 'JM9', {
      bayar: 0, sisa: 0,
      notif_new_sent_at: '2026-08-10T00:00:00Z',
      notif_last_bayar: 0,
    }),
  ]);
  const incoming = [pax('BARU BAYAR', 'JM9', { bayar: 1000000, sisa: 37900000 })];

  const events = computeJamaahSyncEvents({
    incomingRows: incoming,
    existingByKey: existing,
    watermarkEnabled: true,
    now: NOW,
  });

  assert.equal(events.pembayaranCicilan.length, 1);
});

test('pelunasan: sisa jatuh ke 0 → event pelunasan, bukan cicilan', () => {
  const existing = asExistingMap([
    pax('LUNAS', 'JM8', {
      bayar: 5000000, sisa: 33900000,
      notif_new_sent_at: '2026-08-10T00:00:00Z',
      notif_last_bayar: 5000000,
    }),
  ]);
  const incoming = [pax('LUNAS', 'JM8', { bayar: 38900000, sisa: 0 })];

  const events = computeJamaahSyncEvents({
    incomingRows: incoming,
    existingByKey: existing,
    watermarkEnabled: true,
    now: NOW,
  });

  assert.equal(events.pembayaranPelunasan.length, 1);
  assert.equal(events.pembayaranPelunasan[0].isLunas, true);
  assert.equal(events.pembayaranCicilan.length, 0);
});

test('allowNewJamaah=false (baseline agent baru) → tidak ada event jamaah baru', () => {
  const incoming = [pax('YETI SUCIATI', 'JM66981')];
  const events = computeJamaahSyncEvents({
    incomingRows: incoming,
    existingByKey: new Map(),
    watermarkEnabled: true,
    allowNewJamaah: false,
    now: NOW,
  });
  assert.equal(events.jamaahBaru.length, 0);
});

test('jamaah dengan keberangkatan sudah lewat → tidak diumumkan sebagai baru', () => {
  const incoming = [pax('TELAT', 'JM7', { tgl_berangkat: '2026-08-01' })];
  const events = computeJamaahSyncEvents({
    incomingRows: incoming,
    existingByKey: new Map(),
    watermarkEnabled: true,
    now: NOW,
  });
  assert.equal(events.jamaahBaru.length, 0);
});

test('pembayaran H-3 sebelum berangkat → TETAP dinotifikasi (buffer lama +7 hari membuang pembayaran minggu terakhir)', () => {
  const existing = asExistingMap([
    pax('PELUNASAN AKHIR', 'JM6', {
      bayar: 5000000, sisa: 33900000, tgl_berangkat: '2026-08-19',
      notif_new_sent_at: '2026-08-10T00:00:00Z',
      notif_last_bayar: 5000000,
    }),
  ]);
  const incoming = [pax('PELUNASAN AKHIR', 'JM6', { bayar: 38900000, sisa: 0, tgl_berangkat: '2026-08-19' })];

  const events = computeJamaahSyncEvents({
    incomingRows: incoming,
    existingByKey: existing,
    watermarkEnabled: true,
    now: NOW,
  });

  assert.equal(events.pembayaranPelunasan.length, 1);
});

test('pembayaran untuk keberangkatan > 7 hari yang lalu → diabaikan (buffer pasca-berangkat)', () => {
  const existing = asExistingMap([
    pax('SUDAH PULANG', 'JM5', {
      bayar: 0, sisa: 38900000, tgl_berangkat: '2026-08-01',
      notif_new_sent_at: '2026-08-01T00:00:00Z',
      notif_last_bayar: 0,
    }),
  ]);
  const incoming = [pax('SUDAH PULANG', 'JM5', { bayar: 38900000, sisa: 0, tgl_berangkat: '2026-08-01' })];

  const events = computeJamaahSyncEvents({
    incomingRows: incoming,
    existingByKey: existing,
    watermarkEnabled: true,
    now: NOW,
  });

  assert.equal(events.pembayaranPelunasan.length, 0);
  assert.equal(events.pembayaranCicilan.length, 0);
});

test('dedupeJamaahSyncEvents: pax yang sama dari dua fase legacy tidak dobel di satu notifikasi', () => {
  const dup = {
    jamaahBaru: [
      { nama: 'A', idUmroh: 'AIW1', jmId: 'JM1', bayar: 0 },
      { nama: 'A', idUmroh: 'AIW1', jmId: 'JM1', bayar: 1000000 },
    ],
    pembayaranCicilan: [
      { nama: 'B', idUmroh: 'AIW1', jmId: 'JM2', jumlah: 500000, totalBayar: 500000, sisa: 100 },
      { nama: 'B', idUmroh: 'AIW1', jmId: 'JM2', jumlah: 1000000, totalBayar: 1000000, sisa: 0 },
    ],
    pembayaranPelunasan: [],
  };
  const clean = dedupeJamaahSyncEvents(dup);
  assert.equal(clean.jamaahBaru.length, 1);
  assert.equal(clean.jamaahBaru[0].bayar, 1000000); // keep-last: data terbaru menang
  assert.equal(clean.pembayaranCicilan.length, 1);
  assert.equal(clean.pembayaranCicilan[0].jumlah, 1000000);
});
