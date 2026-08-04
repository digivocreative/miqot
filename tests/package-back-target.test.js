// Tombol kembali di halaman Detail Paket (/:slug/:jadwalId) dulu SELALU menuju
// daftar jadwal. Dari Bani itu terasa salah: ketuk baris tabel → baca paket →
// kembali → mendarat di daftar jadwal, bukan di percakapan yang ditinggalkan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePackageBackTarget, PACKAGE_BACK_TARGETS } from '../src/lib/packageBackTarget.js';

const rootPath = new URL('..', import.meta.url).pathname;
const read = (path) => readFileSync(join(rootPath, path), 'utf8');

const FALLBACK = '/nikita';

test('token yang dikenal mengarahkan kembali ke halaman asalnya', () => {
  const target = resolvePackageBackTarget('bani', FALLBACK);
  assert.equal(target.href, '/dashboard/bani');
  assert.match(target.label, /Bani/);
});

test('token tidak peka huruf besar & spasi berlebih', () => {
  assert.equal(resolvePackageBackTarget('  BANI ', FALLBACK).href, '/dashboard/bani');
});

test('tanpa token, tujuan bawaan pemanggil yang dipakai', () => {
  for (const kosong of [null, undefined, '', '   ', 42, {}, []]) {
    const target = resolvePackageBackTarget(kosong, FALLBACK);
    assert.equal(target.href, FALLBACK, `nilai ${JSON.stringify(kosong)} harus jatuh ke fallback`);
    assert.equal(target.label, 'Kembali');
  }
});

// Inti keamanannya: `from` adalah TOKEN, bukan path. Tujuan tidak pernah
// dirangkai dari isi URL, jadi tidak ada jalan menyuntik tujuan luar.
test('path atau URL sembarang tidak pernah jadi tujuan kembali', () => {
  const jahat = [
    '//evil.com',
    'https://evil.com',
    '/dashboard/bani',          // path yang benar pun tetap ditolak sebagai token
    'javascript:alert(1)',
    '../../etc',
    '__proto__',
    'constructor',
    'toString',
  ];
  for (const nilai of jahat) {
    assert.equal(resolvePackageBackTarget(nilai, FALLBACK).href, FALLBACK, `"${nilai}" tidak boleh lolos`);
  }
});

test('semua tujuan terdaftar adalah path internal satu garis miring', () => {
  for (const [token, target] of Object.entries(PACKAGE_BACK_TARGETS)) {
    assert.match(target.href, /^\/(?!\/)/, `tujuan "${token}" harus path internal`);
    assert.ok(target.label && typeof target.label === 'string', `tujuan "${token}" harus punya label`);
  }
});

test('halaman Detail Paket memakai tujuan hasil resolusi, bukan daftar jadwal saja', () => {
  const app = read('src/App.tsx');
  assert.match(app, /resolvePackageBackTarget\(backFrom, backHref\)/);
  assert.match(app, /window\.location\.href = backTarget\.href/);
  assert.match(app, /title=\{backTarget\.label\}/);
  // Penanda asal dibaca sekali saat mount — URL sempat ditulis ulang saat
  // membersihkan param expand/transition.
  assert.match(app, /useState\(\(\) => \{[\s\S]{0,200}searchParams[\s\S]{0,80}\}\)|new URLSearchParams\(window\.location\.search\)\.get\('from'\)/);
});

test('Bani membuka paket di tab yang sama dengan penanda asal', () => {
  const page = read('src/components/bani/BaniPage.tsx');
  assert.match(page, /window\.location\.href = `\/\$\{slug\}\/\$\{jadwalId\}\?from=bani`/);
  // Tab baru membuat tombol kembali halaman paket tak punya jalan pulang.
  assert.doesNotMatch(page, /window\.open\(`\/\$\{slug\}\/\$\{jadwalId\}/);
});
