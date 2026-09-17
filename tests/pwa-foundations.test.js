import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeLoadError } from '../src/lib/loadError.ts';
import { themeColorFor } from '../src/lib/pwa/themeColor.ts';

// Audit 2026-09-17: pengguna melihat teks mentah "HTTP error! status: 503" dan
// "signal is aborted without reason" saat jaringan/server bermasalah.

test('offline atau fetch gagal jaringan → minta periksa koneksi', () => {
  const expected = 'Tidak ada koneksi internet. Periksa sinyal atau Wi-Fi, lalu coba lagi.';
  assert.equal(describeLoadError(new TypeError('Failed to fetch'), { online: true }), expected);
  assert.equal(describeLoadError(new TypeError('Load failed'), { online: true }), expected); // Safari
  assert.equal(describeLoadError(new TypeError('NetworkError when attempting to fetch resource.'), { online: true }), expected); // Firefox
  assert.equal(describeLoadError('HTTP error! status: 503', { online: false }), expected);
});

test('timeout / abort → server lambat', () => {
  const expected = 'Server terlalu lama merespons. Coba lagi sebentar lagi.';
  assert.equal(describeLoadError('signal is aborted without reason', { online: true }), expected);
  const abort = new Error('The operation was aborted.');
  abort.name = 'AbortError';
  assert.equal(describeLoadError(abort, { online: true }), expected);
  assert.equal(describeLoadError('Request timeout', { online: true }), expected);
});

test('status HTTP diterjemahkan tanpa membocorkan teks teknis', () => {
  assert.equal(describeLoadError('HTTP error! status: 503', { online: true }), 'Server sedang bermasalah. Coba lagi beberapa saat lagi.');
  assert.equal(describeLoadError(new Error('HTTP error! status: 500'), { online: true }), 'Server sedang bermasalah. Coba lagi beberapa saat lagi.');
  assert.equal(describeLoadError('HTTP error! status: 404', { online: true }), 'Data tidak ditemukan di server.');
  assert.equal(describeLoadError('HTTP error! status: 429', { online: true }), 'Terlalu banyak permintaan. Tunggu sebentar, lalu coba lagi.');
});

test('galat lain → pesan umum, tidak pernah teks mentah', () => {
  const message = describeLoadError(new Error('API returned error status'), { online: true });
  assert.equal(message, 'Data belum bisa dimuat. Coba lagi.');
  assert.equal(describeLoadError(undefined, { online: true }), 'Data belum bisa dimuat. Coba lagi.');
});

test('theme-color mengikuti warna header terang/gelap', () => {
  assert.equal(themeColorFor(false), '#ffffff');
  assert.equal(themeColorFor(true), '#0f172a');
});
