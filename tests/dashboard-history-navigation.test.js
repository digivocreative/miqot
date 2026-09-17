import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Audit PWA 2026-09-17: app terpasang tidak punya tombol back peramban, jadi gestur back
// Android dan tombol "Kembali" di app harus berjalan di atas riwayat yang sama.
//  1. Semua tulisan riwayat di halaman dashboard lewat src/lib/appHistory (pushAppState /
//     replaceAppState). pushState/replaceState polos membuang penanda kedalaman entri,
//     sehingga backOr() salah mengira layar dibuka langsung dan MENDORONG entri induk baru —
//     back berikutnya membuka lagi layar yang baru ditinggal.
//  2. history.back() polos keluar dari app bila layar dibuka langsung (deep link / app baru
//     diluncurkan). Setiap pemanggilan harus didahului pemeriksaan asal entri
//     (canGoBackInApp / backOr, atau penanda terasFromFeed milik Teras).

const FILES = [
  'src/components/DashboardLayout.tsx',
  'src/components/SettingsPage.tsx',
  'src/components/StatistikPage.tsx',
  'src/components/JamaahPage.tsx',
  'src/components/JamaahEditPage.tsx',
  'src/components/UmrahRegisterPage.tsx',
  'src/components/LandingPagePage.tsx',
  'src/components/FlightStatusCard.tsx',
  'src/components/DashboardProfile.tsx',
  'src/components/HotelKelolaPage.tsx',
];

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('halaman dashboard menulis riwayat lewat appHistory, bukan pushState/replaceState polos', () => {
  for (const path of FILES) {
    const source = read(path);
    const raw = source.match(/\bhistory\.(?:pushState|replaceState)\s*\(/g) || [];
    assert.equal(raw.length, 0, `${path}: ${raw.length}× history.pushState/replaceState polos — pakai pushAppState/replaceAppState`);
  }
});

test('history.back() hanya dipanggil setelah memastikan entri lahir dari navigasi dalam app', () => {
  const GUARD = /canGoBackInApp\(\)|state\?\.terasFromFeed/;
  const WINDOW_LINES = 30;
  let calls = 0;
  for (const path of FILES) {
    const lines = read(path).split('\n');
    lines.forEach((line, index) => {
      // Komentar yang MENYEBUT history.back() bukan pemanggilan.
      const code = line.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '');
      if (/^\s*\*/.test(code) || !/\bhistory\.back\(\)/.test(code)) return;
      calls += 1;
      const context = lines.slice(Math.max(0, index - WINDOW_LINES), index + 1).join('\n');
      assert.match(
        context,
        GUARD,
        `${path}:${index + 1} memanggil history.back() tanpa pemeriksaan asal entri — pakai backOr(fallback)`,
      );
    });
  }
  // Jangkar: pemeriksaan di atas tidak boleh lolos hampa karena pemanggilannya pindah
  // ke helper; kalau jumlahnya nol, pastikan Kembali memang lewat backOr.
  if (calls === 0) {
    assert.match(read('src/components/DashboardLayout.tsx'), /\bbackOr\(/);
  }
});

test('tombol Kembali header dashboard dan Kembali di gerbang PIN Statistik memakai backOr', () => {
  assert.match(read('src/components/DashboardLayout.tsx'), /\bbackOr\(\(\) => \{/);
  assert.match(read('src/components/StatistikPage.tsx'), /\bbackOr\(/);
});
