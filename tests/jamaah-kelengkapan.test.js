import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseDokumenText,
  isPasporCollected,
  missingPerlengkapan,
  isPerlengkapanIncomplete,
} from '../lib/jamaah-kelengkapan.js';
import { normalizeAwapiRow } from '../awapi-client.js';

// Bentuk baris AIW per 11 Nov 2026: tanpa paspor_nomor, dokumen berupa teks,
// perlengkapan angka 1/0. Data rekaan — repo ini publik.
function awapiRaw(overrides = {}) {
  return {
    id_jadwal: 'JD0001',
    id_umrah: 'AIW0099001',
    id_jamaah: 'JM999999990000000001',
    nama: 'BUDI CONTOH',
    kelamin: 'L',
    tgl_lahir: '1980-01-01',
    hp: '081200000000',
    paspor_expired: '2031-10-29',
    paket: 'Paket Contoh',
    paket_harga: 30000000,
    diskon_marketing: 0,
    diskon_kantor: 0,
    bayar: 30000000,
    bayar_sisa: 0,
    bayar_status: 'LUNAS',
    tgl_daftar: '2026-08-01',
    tgl_berangkat: '2026-11-15',
    staff: 'Staf Contoh',
    perlengkapan: { koper: 1, batik: 1, mukena: 0, kerudung: 0, ikhram: 1, tasbih: 0, sabuk: 0 },
    dokumen: 'fc paspor, fc buku vaksin, fc ktp, foto, miningitis',
    dokumen_pernyataan: null,
    ...overrides,
  };
}

test('parseDokumenText: teks AIW jadi objek centang', () => {
  assert.deepEqual(parseDokumenText('fc paspor, fc buku vaksin, fc ktp, foto, miningitis'), {
    paspor: true, vaksin: true, ktp: true, kk: false, foto: true, meningitis: true,
  });
  assert.deepEqual(parseDokumenText('FC Kartu Keluarga, surat pernyataan'), {
    paspor: false, vaksin: false, ktp: false, kk: true, foto: false, pernyataan: true,
  });
});

test('parseDokumenText: teks kosong = belum ada dokumen; bukan teks = null', () => {
  assert.deepEqual(parseDokumenText(''), { paspor: false, vaksin: false, ktp: false, kk: false, foto: false });
  assert.equal(parseDokumenText(null), null);
  assert.equal(parseDokumenText({ paspor: true }), null);
});

test('parseDokumenText: token tak dikenal disimpan apa adanya, tidak memalsukan paspor', () => {
  const dokumen = parseDokumenText('medical check up');
  assert.equal(dokumen.medical_check_up, true);
  assert.equal(dokumen.paspor, false);
});

test('normalizeAwapiRow: "fc paspor" tanpa paspor_nomor tetap terhitung sudah kumpul', () => {
  const row = normalizeAwapiRow(awapiRaw(), { agentId: 'agent-1' });
  assert.equal(row.no_paspor, null);
  assert.equal(row.dokumen.paspor, true);
  assert.equal(isPasporCollected(row), true);
});

test('normalizeAwapiRow: dokumen tanpa paspor / dokumen null = belum kumpul', () => {
  const tanpa = normalizeAwapiRow(awapiRaw({ dokumen: 'fc ktp' }), { agentId: 'agent-1' });
  assert.equal(tanpa.dokumen.paspor, false);
  assert.equal(isPasporCollected(tanpa), false);

  const kosong = normalizeAwapiRow(awapiRaw({ dokumen: null }), { agentId: 'agent-1' });
  assert.equal(isPasporCollected(kosong), false);
});

test('normalizeAwapiRow: pernyataan dari teks dokumen tidak ditimpa dokumen_pernyataan kosong', () => {
  const row = normalizeAwapiRow(awapiRaw({ dokumen: 'fc paspor, surat pernyataan' }), { agentId: 'agent-1' });
  assert.equal(row.dokumen.pernyataan, true);
});

test('normalizeAwapiRow: objek centang jalur lama tetap dipakai apa adanya', () => {
  const row = normalizeAwapiRow(awapiRaw({ dokumen: { paspor: true, ktp: false } }), { agentId: 'agent-1' });
  assert.equal(row.dokumen.paspor, true);
  assert.equal(row.dokumen.ktp, false);
});

test('isPasporCollected: nomor paspor saja sudah cukup', () => {
  assert.equal(isPasporCollected({ no_paspor: 'X0000000', dokumen: null }), true);
  assert.equal(isPasporCollected({ no_paspor: '  ', dokumen: { paspor: false } }), false);
  assert.equal(isPasporCollected({}), false);
});

test('missingPerlengkapan: angka 0 = belum diambil, item gender lain tidak dihitung', () => {
  const pria = { jk: 'L', perlengkapan: { koper: 1, batik: 0, mukena: 0, kerudung: 0, ikhram: 0, 'tas paspor': 1 } };
  assert.deepEqual(missingPerlengkapan(pria), ['batik', 'ikhram']);

  const wanita = { jk: 'perempuan', perlengkapan: { koper: 1, mukena: 0, kerudung: 1, ikhram: 0, buku_doa: 0 } };
  assert.deepEqual(missingPerlengkapan(wanita), ['mukena', 'buku doa']);
});

test('missingPerlengkapan: tasbih/sabuk/syal/bergo diabaikan; false lama tetap terbaca', () => {
  const row = { jk: 'L', perlengkapan: { koper: true, tasbih: 0, sabuk: 0, syal: false, bergo: false, ikhram: true } };
  assert.deepEqual(missingPerlengkapan(row), []);
  assert.equal(isPerlengkapanIncomplete(row), false);
  assert.deepEqual(missingPerlengkapan({ jk: 'L', perlengkapan: { koper: false } }), ['koper']);
});

test('missingPerlengkapan: gender tak dikenal → item bergender dilewati', () => {
  assert.deepEqual(missingPerlengkapan({ jk: null, perlengkapan: { ikhram: 0, mukena: 0, koper: 0 } }), ['koper']);
});

test('perlengkapan tanpa catatan = null dan terhitung belum lengkap', () => {
  assert.equal(missingPerlengkapan({ perlengkapan: null }), null);
  assert.equal(missingPerlengkapan({ perlengkapan: {} }), null);
  assert.equal(isPerlengkapanIncomplete({ perlengkapan: null }), true);
});

// ── Pesan & tanggal di telegram-notifier.js ──
import { addCalendarDays, buildPassportMessage, buildPerlengkapanMessage } from '../telegram-notifier.js';

test('addCalendarDays: H+N tepat, tidak kurang sehari, lintas bulan/tahun', () => {
  assert.equal(addCalendarDays('2026-11-11', 1), '2026-11-12');
  assert.equal(addCalendarDays('2026-11-11', 3), '2026-11-14');
  assert.equal(addCalendarDays('2026-11-11', 30), '2026-12-11');
  assert.equal(addCalendarDays('2026-12-30', 3), '2027-01-02');
});

test('buildPassportMessage: tanpa jamaah bermasalah tidak ada pesan', () => {
  assert.equal(buildPassportMessage('Agen Contoh', [], [], '2026-11-11'), null);
});

test('buildPerlengkapanMessage: menyebut item yang kurang sesuai gender', () => {
  const pesan = buildPerlengkapanMessage('Agen Contoh', [
    { nama: 'BUDI CONTOH', jk: 'L', tgl_berangkat: '2026-11-15', perlengkapan: { koper: 0, mukena: 0, ikhram: 1, tasbih: 0 } },
    { nama: 'SITI CONTOH', jk: 'P', tgl_berangkat: '2026-11-15', perlengkapan: null },
  ], '2026-11-11');
  assert.match(pesan, /Budi Contoh<\/b> \(4 hari lagi\)\n\s+Kurang: koper\n/);
  assert.match(pesan, /Siti Contoh<\/b> \(4 hari lagi\)\n\s+Kurang: semua/);
  assert.doesNotMatch(pesan, /mukena|tasbih/);
});
