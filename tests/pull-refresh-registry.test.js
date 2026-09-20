/**
 * Tumpukan penyegar halaman aktif (src/lib/pwa/refresh-registry.js).
 *
 * Yang dijaga: halaman anak yang mendaftar belakangan MENANG, dan giliran
 * kembali ke pendaftar sebelumnya begitu ia lepas — termasuk saat urutan
 * lepasnya tidak rapi. React tidak menjamin urutan unmount antar-komponen, jadi
 * "buang yang teratas" akan membuang milik orang lain, dan gestur di halaman
 * yang masih tampil diam-diam berhenti bekerja.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getRefreshAvailability,
  pushRefreshHandler,
  resetRefreshHandlers,
  runActiveRefresh,
  subscribeRefreshHandlers,
} from '../src/lib/pwa/refresh-registry.js';

beforeEach(() => resetRefreshHandlers());

test('tanpa pendaftar: gestur tidak tersedia dan menjalankannya tidak meledak', async () => {
  assert.equal(getRefreshAvailability(), false);
  assert.equal(await runActiveRefresh(), false);
});

test('pendaftar terakhir yang dipakai; giliran kembali setelah ia lepas', async () => {
  const dipanggil = [];
  const lepasShell = pushRefreshHandler(() => dipanggil.push('shell'));
  const lepasHalaman = pushRefreshHandler(() => dipanggil.push('halaman'));

  await runActiveRefresh();
  assert.deepEqual(dipanggil, ['halaman']);

  lepasHalaman();
  await runActiveRefresh();
  assert.deepEqual(dipanggil, ['halaman', 'shell']);

  lepasShell();
  assert.equal(getRefreshAvailability(), false);
});

test('lepas di tengah tumpukan hanya membuang miliknya sendiri', async () => {
  const dipanggil = [];
  pushRefreshHandler(() => dipanggil.push('a'));
  const lepasB = pushRefreshHandler(() => dipanggil.push('b'));
  pushRefreshHandler(() => dipanggil.push('c'));

  lepasB();
  await runActiveRefresh();
  assert.deepEqual(dipanggil, ['c'], 'yang teratas tetap c, bukan ikut terbuang bersama b');
});

test('melepas dua kali tidak menyeret pendaftar lain', async () => {
  const dipanggil = [];
  pushRefreshHandler(() => dipanggil.push('shell'));
  const lepas = pushRefreshHandler(() => dipanggil.push('halaman'));

  lepas();
  lepas();

  assert.equal(getRefreshAvailability(), true, 'pendaftaran shell harus selamat');
  await runActiveRefresh();
  assert.deepEqual(dipanggil, ['shell']);
});

test('ketersediaan diumumkan ke pelanggan saat berubah', () => {
  let ketukan = 0;
  const berhenti = subscribeRefreshHandlers(() => { ketukan += 1; });

  const lepas = pushRefreshHandler(() => {});
  assert.equal(ketukan, 1);
  assert.equal(getRefreshAvailability(), true);

  lepas();
  assert.equal(ketukan, 2);
  assert.equal(getRefreshAvailability(), false);

  berhenti();
  pushRefreshHandler(() => {});
  assert.equal(ketukan, 2, 'pelanggan yang berhenti tidak boleh diketuk lagi');
});

test('penangan sinkron maupun async sama-sama ditunggu', async () => {
  const urutan = [];
  const lepas = pushRefreshHandler(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    urutan.push('selesai');
  });

  await runActiveRefresh();
  assert.deepEqual(urutan, ['selesai'], 'runActiveRefresh harus menunggu penangan async');
  lepas();
});

test('penangan yang melempar diteruskan ke pemanggil, bukan ditelan', async () => {
  pushRefreshHandler(() => { throw new Error('gagal memuat'); });
  await assert.rejects(runActiveRefresh(), /gagal memuat/);
});
