import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';

import { extractPdfText, parseCalonHajiText } from '../lib/calon-haji-parser.js';

// Fixture SINTETIS (nama/NIK karangan) yang meniru keanehan teks pdf-parse dari
// PDF "LAMPIRAN ESTIMASI" kantor. Data jamaah asli tidak boleh masuk repo.
const fixture = readFileSync(new URL('./fixtures/calon-haji-sample.txt', import.meta.url), 'utf8');
const REAL_PDF = process.env.CALON_HAJI_PDF ?? `${homedir()}/Downloads/LAMPIRAN ESIMASI 20 OCT.pdf`;

const row = (rows, no) => rows.find((r) => r.no_urut === no);

test('parse fixture: header + 8 baris berurutan', () => {
  const { header, rows } = parseCalonHajiText(fixture);
  assert.deepEqual(header, { tanggalData: '2027-03-03', jumlah: 8 });
  assert.deepEqual(rows.map((r) => r.no_urut), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(row(rows, 1), {
    no_urut: 1, tahap: 1, no_porsi: '3000000001', nik: '3175010101800001', nama: 'BUDI SANTOSO',
    keterangan: 'URUT PORSI', status_cadangan: 'NON CADANGAN', kepesertaan_jkn: null,
    status_jemaah: 'AKTIF', usia: 45, kab_kota: 'KOTA JAKARTA TIMUR', provinsi: 'DKI JAKARTA',
  });
});

test('nama, kab/kota, JKN yang terbungkus digabung satu spasi', () => {
  const { rows } = parseCalonHajiText(fixture);
  assert.equal(row(rows, 2).nama, 'NAMA DUA BARIS');
  assert.equal(row(rows, 1).kab_kota, 'KOTA JAKARTA TIMUR');
  assert.equal(row(rows, 3).kepesertaan_jkn, 'TERDAFTAR, BELUM AKTIF');
  assert.equal(row(rows, 6).provinsi, 'SUMATERA SELATAN');
});

test('provinsi dinormalisasi: B A N T E N → BANTEN; tempelan dipisah', () => {
  const { rows } = parseCalonHajiText(fixture);
  assert.deepEqual([row(rows, 2).kab_kota, row(rows, 2).provinsi], ['KOTA TANGERANG', 'BANTEN']);
  assert.deepEqual([row(rows, 3).kab_kota, row(rows, 3).provinsi], ['KAB. BANTUL', 'D.I. YOGYAKARTA']);
  assert.deepEqual([row(rows, 4).kab_kota, row(rows, 4).provinsi], ['KOTA JAMBI', 'JAMBI']);
  assert.deepEqual([row(rows, 7).kab_kota, row(rows, 7).provinsi], ['KAB. BANGKA BARAT', 'BANGKA BELITUNG']);
});

test('JKN "-" → null; BELUM TERDAFTAR apa adanya; NIK 15 & 17 digit utuh', () => {
  const { rows } = parseCalonHajiText(fixture);
  assert.equal(row(rows, 6).kepesertaan_jkn, null);
  assert.equal(row(rows, 5).kepesertaan_jkn, 'BELUM TERDAFTAR');
  assert.equal(row(rows, 3).nik, '317501010180003');
  assert.equal(row(rows, 4).nik, '31750101018000044');
});

test('keterangan LANSIA diterima; status_jemaah LUNAS', () => {
  const { rows } = parseCalonHajiText(fixture);
  assert.equal(row(rows, 3).keterangan, 'LANSIA');
  assert.equal(row(rows, 2).status_jemaah, 'LUNAS');
  assert.equal(row(rows, 6).status_jemaah, 'LUNAS');
  assert.equal(row(rows, 5).status_cadangan, 'CADANGAN');
});

test('nilai keterangan tak dikenal → throw menyebut "baris 3"', () => {
  const mutated = fixture.replace('SITI AMINAH LANSIA', 'SITI AMINAH PRIORITAS');
  assert.throws(() => parseCalonHajiText(mutated), /baris 3/);
});

test('nilai JKN tak dikenal (mis. "AKTIF PBI") → throw, tidak tertelan status jemaah', () => {
  const mutated = fixture.replace('AHMAD FAUZI URUT PORSI NON CADANGAN AKTIF AKTIF 38', 'AHMAD FAUZI URUT PORSI NON CADANGAN AKTIF PBI AKTIF 38');
  assert.throws(() => parseCalonHajiText(mutated), /baris 4/);
});

test('provinsi tak dikenal → throw', () => {
  const mutated = fixture.replace('KOTA BEKASI JAWA BARAT', 'KOTA ATLANTIS NEGERI ANTAH');
  assert.throws(() => parseCalonHajiText(mutated), /baris 8/);
});

test('nomor urut bolong → throw', () => {
  const mutated = fixture.replace('6 1 3000000006', '9 1 3000000006');
  assert.throws(() => parseCalonHajiText(mutated));
});

test('jumlah baris ≠ header Jumlah jemaah → throw', () => {
  const mutated = fixture.replace('Jumlah jemaah: 8', 'Jumlah jemaah: 9');
  assert.throws(() => parseCalonHajiText(mutated), /9/);
});

test('PDF asli (lokal saja)', { skip: !existsSync(REAL_PDF) }, async () => {
  const { header, rows } = parseCalonHajiText(await extractPdfText(readFileSync(REAL_PDF)));
  assert.equal(header.jumlah, 1416);
  assert.equal(rows.length, 1416);
  assert.equal(rows.filter((r) => r.status_cadangan === 'NON CADANGAN').length, 155);
  assert.equal(rows.filter((r) => r.status_cadangan === 'CADANGAN').length, 1261);
  assert.equal(rows.filter((r) => r.status_jemaah === 'LUNAS').length, 8);
  assert.equal(rows.filter((r) => r.kepesertaan_jkn === 'BELUM TERDAFTAR').length, 19);
  assert.equal(rows.filter((r) => r.kepesertaan_jkn === 'TERDAFTAR, BELUM AKTIF').length, 81);
});
