import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasSuspiciousAwapiPayment,
  normalizeAwapiHajiRow,
  normalizeAwapiRow,
  parseAwapiResponseText,
  preserveExistingPaymentForSuspiciousAwapiRow,
  preserveLegacyUmrohRawData,
} from '../awapi-client.js';

function jakartaYear() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
  }).formatToParts(new Date());
  return Number(parts.find(p => p.type === 'year')?.value);
}

function rawRow(overrides = {}) {
  return {
    id_umrah: 'AIW0028902',
    id_jamaah: 'JM999999990000063096',
    nama: 'NANA RUKMANA',
    kelamin: 'laki-laki',
    hp: '62996093769',
    tgl_lahir: `${jakartaYear() - 48}-05-12`,
    paket: 'HEMAT',
    bayar: '5000000',
    bayar_sisa: 21500000,
    tgl_berangkat: `${jakartaYear()}-08-15`,
    tgl_daftar: `${jakartaYear()}-05-12 09:38:07`,
    paspor_nomor: '0',
    paspor_expired: '0000-00-00',
    ...overrides,
  };
}

function rawHajiRow(overrides = {}) {
  return {
    id_haji: 'HAJ20270001',
    id_jamaah: 'JM999999990000099001',
    nomor_porsi: '3000123456',
    nomor_spph: 'SPPH-123',
    nama: 'AHMAD HAJI',
    kelamin: 'Laki-laki',
    tgl_lahir: `${jakartaYear() - 55}-01-20`,
    hp: '628123456789',
    paspor_nomor: '0',
    paspor_expired: '0000-00-00',
    paket: 'RAHMAH Quard',
    paket_harga: '120000000',
    diskon_marketing: '500000',
    diskon_kantor: '250000',
    bayar: '4500000',
    bayar_sisa: '115500000',
    bayar_status: 'CICILAN',
    tgl_daftar: `${jakartaYear()}-04-15 10:12:30`,
    tgl_berangkat: `${jakartaYear() + 1}-06-01`,
    thn_berangkat_masehi: String(jakartaYear() + 1),
    thn_berangkat_hijriyah: '1448',
    staff: 'STAFF HAJI',
    dokumen: { ktp: true },
    dokumen_bpih: 'http://115.124.86.220/aiw/staff/pages/dokumen/bpih.pdf',
    ...overrides,
  };
}

test('parseAwapiResponseText tolerates PHP warning before JSON payload', () => {
  const parsed = parseAwapiResponseText('<br><b>Warning</b>: Undefined variable $cek<br>{"status":"true","aaData":[{"id_haji":"HAJ1"}]}');

  assert.equal(parsed.status, 'true');
  assert.deepEqual(parsed.aaData, [{ id_haji: 'HAJ1' }]);
});

test('normalizeAwapiHajiRow maps official haji API row without legacy-only null overwrites', () => {
  const norm = normalizeAwapiHajiRow(rawHajiRow(), { agentId: 'agent-id' });

  assert.equal(norm.agent_id, 'agent-id');
  assert.equal(norm.id_haji, 'HAJ20270001');
  assert.equal(norm.id_jamaah, 'JM999999990000099001');
  assert.equal(norm.nomor_porsi, '3000123456');
  assert.equal(norm.nomor_spph, 'SPPH-123');
  assert.equal(norm.nama, 'AHMAD HAJI');
  assert.equal(norm.jk, 'L');
  assert.equal(norm.telp, '628123456789');
  assert.equal(norm.tgl_lahir, `${jakartaYear() - 55}-01-20`);
  assert.equal(norm.no_paspor, null);
  assert.equal(norm.paspor_expired, null);
  assert.equal(norm.paket, 'RAHMAH Quard');
  assert.equal(norm.paket_detail, 'RAHMAH Quard');
  assert.equal(norm.paket_harga, 120000000);
  assert.equal(norm.diskon_marketing, 500000);
  assert.equal(norm.diskon_kantor, 250000);
  assert.equal(norm.bayar, 4500000);
  assert.equal(norm.sisa, 115500000);
  assert.equal(norm.status_bayar, 'CICILAN');
  assert.equal(norm.tgl_daftar, `${jakartaYear()}-04-15`);
  assert.equal(norm.tgl_berangkat, `${jakartaYear() + 1}-06-01`);
  assert.equal(norm.thn_masehi, String(jakartaYear() + 1));
  assert.equal(norm.thn_hijriyah, '1448');
  assert.equal(norm.staff, 'STAFF HAJI');
  assert.deepEqual(norm.dokumen, { ktp: true });
  assert.equal(norm.bpih_url, 'http://115.124.86.220/aiw/staff/pages/dokumen/bpih.pdf');
  assert.ok(norm.synced_at);
  assert.equal(Object.hasOwn(norm, 'alamat'), false);
  assert.equal(Object.hasOwn(norm, 'perwakilan'), false);
  assert.equal(Object.hasOwn(norm, 'marketing'), false);
  assert.equal(Object.hasOwn(norm, 'jenis'), false);
  assert.equal(Object.hasOwn(norm, 'status_berangkat'), false);
  assert.equal(Object.hasOwn(norm, 'surat_pernyataan_url'), false);
});

test('normalizeAwapiHajiRow derives payment status when bayar_status is missing', () => {
  const belum = normalizeAwapiHajiRow(rawHajiRow({ bayar_status: '', bayar: '0', bayar_sisa: '120000000' }), { agentId: 'agent-id' });
  const lunas = normalizeAwapiHajiRow(rawHajiRow({ bayar_status: '', bayar: '120000000', bayar_sisa: '0' }), { agentId: 'agent-id' });

  assert.equal(belum.status_bayar, 'BELUM BAYAR');
  assert.equal(lunas.status_bayar, 'LUNAS');
});

test('normalizeAwapiHajiRow nulls zero-date placeholders with time portions', () => {
  const norm = normalizeAwapiHajiRow(rawHajiRow({
    tgl_lahir: '0000-00-00 00:00:00',
    paspor_expired: '0000-00-00 00:00:00',
    tgl_daftar: '0000-00-00 00:00:00',
    tgl_berangkat: '0000-00-00 00:00:00',
    thn_berangkat_masehi: '0',
    thn_berangkat_hijriyah: '0',
  }), { agentId: 'agent-id' });

  assert.equal(norm.tgl_lahir, null);
  assert.equal(norm.paspor_expired, null);
  assert.equal(norm.tgl_daftar, null);
  assert.equal(norm.tgl_berangkat, null);
  assert.equal(norm.thn_masehi, null);
  assert.equal(norm.thn_hijriyah, null);
});

test('normalizeAwapiRow keeps plausible birth dates', () => {
  const norm = normalizeAwapiRow(rawRow(), { agentId: 'agent-id' });
  assert.equal(norm.tgl_lahir, `${jakartaYear() - 48}-05-12`);
  assert.equal(norm.tgl_daftar, `${jakartaYear()}-05-12`);
  assert.equal(norm.tgl_berangkat, `${jakartaYear()}-08-15`);
});

test('normalizeAwapiRow nulls current-year birth dates from AWAPI placeholders', () => {
  const norm = normalizeAwapiRow(rawRow({ tgl_lahir: `${jakartaYear()}-05-12` }), { agentId: 'agent-id' });
  assert.equal(norm.tgl_lahir, null);
});

test('normalizeAwapiRow marks dokumen_pernyataan as a ready umroh document', () => {
  const norm = normalizeAwapiRow(rawRow({
    dokumen: { paspor: true },
    dokumen_pernyataan: 'surat/pernyataan/AIW0028902.pdf',
  }), { agentId: 'agent-id' });

  assert.equal(norm.raw_data.dokumen_pernyataan, 'surat/pernyataan/AIW0028902.pdf');
  assert.deepEqual(norm.dokumen, { paspor: true, pernyataan: true });
});

test('preserveLegacyUmrohRawData keeps legacy staff when AWAPI refresh omits it', () => {
  const norm = normalizeAwapiRow(rawRow({
    perlengkapan: { koper: true },
  }), { agentId: 'agent-id' });

  const merged = preserveLegacyUmrohRawData(norm, {
    raw_data: {
      staf: 'BU ANITA',
      id_jadwal: 'JADWAL-1448-01',
    },
  });

  assert.equal(merged.raw_data.staf, 'BU ANITA');
  assert.equal(merged.raw_data.id_jadwal, 'JADWAL-1448-01');
  assert.deepEqual(merged.perlengkapan, { koper: true });
});

test('preserveLegacyUmrohRawData exposes AWAPI staff as staf when present', () => {
  const norm = normalizeAwapiRow(rawRow({
    staff: 'PAK RIZAL',
  }), { agentId: 'agent-id' });

  const merged = preserveLegacyUmrohRawData(norm, {
    raw_data: {
      staf: 'BU ANITA',
    },
  });

  assert.equal(merged.raw_data.staf, 'PAK RIZAL');
});

test('preserveLegacyUmrohRawData keeps existing surat pernyataan markers when incoming rows omit them', () => {
  const norm = normalizeAwapiRow(rawRow({
    dokumen: { paspor: true },
  }), { agentId: 'agent-id' });

  const merged = preserveLegacyUmrohRawData(norm, {
    raw_data: {
      dokumen_pernyataan: 'http://115.124.86.220/dok/pernyataan/SM01078-token',
    },
    dokumen: {
      paspor: true,
      pernyataan: true,
    },
  });

  assert.equal(merged.raw_data.dokumen_pernyataan, 'http://115.124.86.220/dok/pernyataan/SM01078-token');
  assert.deepEqual(merged.dokumen, {
    paspor: true,
    pernyataan: true,
  });
});

test('hasSuspiciousAwapiPayment flags negative sisa from inflated AWAPI bayar', () => {
  const norm = normalizeAwapiRow(rawRow({
    bayar: '101700000',
    bayar_sisa: -64300000,
  }), { agentId: 'agent-id' });

  assert.equal(hasSuspiciousAwapiPayment(norm), true);
});

test('hasSuspiciousAwapiPayment allows normal cicilan and lunas rows', () => {
  const cicilan = normalizeAwapiRow(rawRow({
    bayar: '4000000',
    bayar_sisa: 29300000,
  }), { agentId: 'agent-id' });
  const lunas = normalizeAwapiRow(rawRow({
    bayar: '33900000',
    bayar_sisa: 0,
  }), { agentId: 'agent-id' });

  assert.equal(hasSuspiciousAwapiPayment(cicilan), false);
  assert.equal(hasSuspiciousAwapiPayment(lunas), false);
});

test('preserveExistingPaymentForSuspiciousAwapiRow keeps verified DB payment during refresh', () => {
  const norm = normalizeAwapiRow(rawRow({
    hp: '6281234567890',
    bayar: '101700000',
    bayar_sisa: -64300000,
    diskon_kantor: '0',
    diskon_marketing: '0',
    paspor_nomor: 'A1234567',
  }), { agentId: 'agent-id' });

  const guarded = preserveExistingPaymentForSuspiciousAwapiRow(norm, {
    bayar: 33900000,
    sisa: 0,
    diskon_kantor: 500000,
    diskon_marketing: 250000,
    raw_data: { payment_source: 'legacy_detail' },
  });

  assert.equal(guarded.bayar, 33900000);
  assert.equal(guarded.sisa, 0);
  assert.equal(guarded.diskon_kantor, 500000);
  assert.equal(guarded.diskon_marketing, 250000);
  assert.equal(guarded.wa, '6281234567890');
  assert.equal(guarded.no_paspor, 'A1234567');
  assert.equal(guarded.raw_data.payment_source, 'legacy_detail');
  assert.equal(guarded.raw_data.payment_guard, 'preserved_existing_after_awapi_anomaly');
  assert.deepEqual(guarded.raw_data.preserved_payment_snapshot, {
    bayar: 33900000,
    sisa: 0,
    diskon_kantor: 500000,
    diskon_marketing: 250000,
  });
  assert.equal(guarded.raw_data.suspicious_awapi_payment_snapshot.bayar, 101700000);
  assert.equal(guarded.raw_data.suspicious_awapi_payment_snapshot.sisa, -64300000);
});
