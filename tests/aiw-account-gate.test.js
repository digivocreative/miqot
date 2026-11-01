import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  aiwGateStatus,
  hasAiwAccount,
  isAiwLockedPath,
  isAiwLockedTab,
} from '../lib/aiw-account.js';

// Gerbang Akun AIW: agent yang sudah login dashboard tapi belum menyimpan Akun AIW
// hanya bisa membuka Jamaah dan Settings. Tabel di bawah adalah kontraknya.

test('hasAiwAccount butuh username DAN password tersimpan', () => {
  assert.equal(hasAiwAccount({ jamaah_username: 'SM1', jamaah_password: 'enc' }), true);
  assert.equal(hasAiwAccount({ jamaah_username: 'SM1', jamaah_password: null }), false);
  assert.equal(hasAiwAccount({ jamaah_username: '', jamaah_password: 'enc' }), false);
  assert.equal(hasAiwAccount({}), false);
  assert.equal(hasAiwAccount(null), false);
});

test('aiwGateStatus: hanya agent dengan status false yang terkunci', () => {
  assert.equal(aiwGateStatus({ role: 'agent', has_aiw_account: false }), 'locked');
  assert.equal(aiwGateStatus({ role: 'agent', has_aiw_account: true }), 'open');
});

test('aiwGateStatus: admin tidak pernah dikunci', () => {
  assert.equal(aiwGateStatus({ role: 'admin', has_aiw_account: false }), 'open');
  assert.equal(aiwGateStatus({ role: 'admin' }), 'open');
});

test('aiwGateStatus: status belum diketahui tidak dianggap terkunci', () => {
  // Sesi lama dan server versi lama tidak membawa kolom ini.
  assert.equal(aiwGateStatus({ role: 'agent' }), 'unknown');
  assert.equal(aiwGateStatus({ role: 'agent', has_aiw_account: null }), 'unknown');
  assert.equal(aiwGateStatus(null), 'open');
});

test('isAiwLockedTab: hanya beranda, Jamaah, dan Settings yang terbuka', () => {
  for (const tab of ['home', 'jamaah', 'settings']) assert.equal(isAiwLockedTab(tab), false, tab);
  for (const tab of ['brosur', 'statistik', 'ai-tools', 'teras', 'hotel', 'hotels', 'calon-haji', 'agents', 'analytics']) {
    assert.equal(isAiwLockedTab(tab), true, tab);
  }
});

test('isAiwLockedTab: tab baru otomatis terkunci', () => {
  assert.equal(isAiwLockedTab('tab-yang-belum-ada'), true);
});

const PATHS = {
  '/bagas': true, '/bagas/': true, '/Bagas/Kalkulasi/': true,
  '/bagas/JBU1517': true, '/JBU1517': true, '/bagas/kalkulasi': true,
  '/compare': true, '/bagas/compare': true, '/bagas/umroh-ramadhan': true,
  '/bagas/hotel': true, '/bagas/umroh/x': true,
  '/': false, '/bagas/umroh': false, '/bagas/haji': false, '/bagas/bio': false,
  '/bagas/JBU1517/itinerary': false, '/bagas/JBU1517/ITINERARY': false,
  '/bagas/hotel/hilton': false, '/bagas/jamaah': false, '/bagas/jamaah/ABC/dashboard': false,
  '/bagas/capi': false, '/login': false, '/register': false, '/reset-password': false,
  '/dashboard': false, '/dashboard/brosur': false, '/f/ABC': false, '/j/ABC123': false,
  '/teras/abc': false, '/top-partner': false,
  // Kalkulasi dan Compare menang atas segmen lain, persis urutan src/main.tsx.
  '/bagas/kalkulasi/itinerary': true, '/bagas/compare/itinerary': true,
  '/login/compare': true, '/j/kalkulasi': true, '/dashboard/compare': false,
  // src/main.tsx membandingkan bio dan dashboard peka huruf: varian lain merender jadwal.
  '/bagas/BIO': true, '/bagas/Umroh': true, '/Dashboard': true,
  // Sebaliknya hotel dan itinerary dibaca tanpa peduli huruf.
  '/bagas/Hotel/hilton': false,
};

test('isAiwLockedPath mengikuti tabel kontrak', () => {
  for (const [path, expected] of Object.entries(PATHS)) {
    assert.equal(isAiwLockedPath(path), expected, path);
  }
});

test('isAiwLockedPath: halaman baru di bawah /:slug otomatis terkunci', () => {
  assert.equal(isAiwLockedPath('/bagas/halaman-baru'), true);
});

test('isAiwLockedPath mengabaikan query, hash, dan masukan bukan string', () => {
  assert.equal(isAiwLockedPath('/bagas?x=1#y'), true);
  assert.equal(isAiwLockedPath('/bagas/bio?x=1'), false);
  assert.equal(isAiwLockedPath(undefined), false);
});

test('teks untuk agent memakai Hubungkan, bukan Login, untuk Akun AIW', () => {
  const files = [
    'server.js', 'laporan-api.js', 'jamaah-api.js', 'telegram-notifier.js',
    'src/components/AiwAccountPrompts.tsx', 'src/components/DashboardLayout.tsx',
    'src/components/DashboardProfile.tsx', 'src/components/FlightStatusCard.tsx',
    'src/components/HajiPage.tsx', 'src/components/JamaahPage.tsx',
    'src/components/SettingsPage.tsx', 'src/components/AgentManagementPage.tsx',
  ];
  const banned = /Login Akun AIW|login ke Akun AIW|login ulang Akun AIW|login ulang ke Akun AIW|Login Sekarang|login sekarang|Login gagal|Login ulang via|'Login untuk |"Login untuk |>Login untuk /;
  for (const file of files) {
    const code = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      .split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
    assert.doesNotMatch(code, banned, file);
  }
});

test('login Akun AIW gagal bila kredensial tidak tersimpan', () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const route = server.slice(server.indexOf("app.post('/api/laporan/login'"));
  const body = route.slice(0, route.indexOf('\n});'));
  assert.match(body, /const \{ error: saveError \} = await supabase\.from\('agents'\)\.update\(updates\)/);
  assert.match(body, /if \(saveError\)[\s\S]*res\.status\(500\)/);
});

test('/api/auth/me melaporkan status Akun AIW tanpa membocorkan kredensial', () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const route = server.slice(server.indexOf("app.get('/api/auth/me'"));
  const body = route.slice(0, route.indexOf('\n});'));
  assert.match(body, /has_aiw_account: hasAiwAccount\(agent\)/);
  assert.doesNotMatch(body, /jamaah_password/);
  assert.doesNotMatch(body, /jamaah_username/);
});
