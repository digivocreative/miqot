import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recentRegistrationMonths, recentRowHijriahYear } from '../lib/umroh-recent-refresh.js';
import { getHijriahYearFromGregorian } from '../lib/hijriah-years.js';

test('recentRegistrationMonths pakai bulan WIB, angka tanpa nol di depan', () => {
  assert.deepEqual(recentRegistrationMonths(new Date('2026-09-15T05:00:00Z')), [{ tahun: 2026, bulan: 9 }]);
  // 30 Sep 18:00 UTC = 1 Okt 01:00 WIB → Oktober + September
  assert.deepEqual(recentRegistrationMonths(new Date('2026-09-30T18:00:00Z')), [
    { tahun: 2026, bulan: 10 },
    { tahun: 2026, bulan: 9 },
  ]);
});

test('recentRegistrationMonths tanggal 1 Januari ikut Desember tahun lalu', () => {
  assert.deepEqual(recentRegistrationMonths(new Date('2027-01-01T03:00:00Z')), [
    { tahun: 2027, bulan: 1 },
    { tahun: 2026, bulan: 12 },
  ]);
});

test('recentRowHijriahYear: tgl_berangkat dulu, lalu tgl_daftar, hanya tahun aktif', () => {
  const active = ['1449', '1448', '1447'];
  const year = (row) => recentRowHijriahYear(row, active, getHijriahYearFromGregorian);
  assert.equal(year({ tgl_berangkat: '2027-07-01', tgl_daftar: '2026-10-10' }), '1449');
  assert.equal(year({ tgl_berangkat: null, tgl_daftar: '2026-10-10' }), '1448');
  assert.equal(year({ tgl_berangkat: '2029-01-10', tgl_daftar: '2026-10-10' }), null);
  assert.equal(year({ tgl_berangkat: null, tgl_daftar: null }), null);
});

test('pendaftaran baru diarahkan ke refresh cepat, bukan sync penuh', () => {
  const register = readFileSync(new URL('../src/components/UmrahRegisterPage.tsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/components/JamaahPage.tsx', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(register, /\/dashboard\/jamaah\?refresh_recent=1/);
  assert.match(page, /params\.get\('refresh_recent'\)/);
  assert.match(page, /\/api\/laporan\/umrah\/refresh-recent/);
  assert.match(server, /app\.post\('\/api\/laporan\/umrah\/refresh-recent'/);
});
