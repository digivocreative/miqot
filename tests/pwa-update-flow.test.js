import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideVersionAction } from '../src/lib/pwa/versionCheck.ts';
import { whenWorkerInstalled } from '../src/lib/pwa/installingWorker.ts';
import { getUpdateState, subscribeUpdate, markUpdateReady, dismissUpdate, applyUpdate } from '../src/lib/pwa/updateStore.ts';
import { shouldResumeSessionOnLogin } from '../src/lib/pwa/launch.ts';

// Audit 2026-09-17: setiap deploy, escape hatch menghapus SEMUA cache + unregister SW
// lalu reload paksa saat user kembali ke tab (17,9 MB diunduh ulang, teks ketikan hilang),
// dan autoUpdate me-reload semua tab tanpa peringatan.

const base = { runningEntry: 'index-a.js', deployedEntry: 'index-b.js', swWaiting: false, swInstalling: false, repairedFor: null };

test('build sama atau data versi tidak lengkap → tidak melakukan apa pun', () => {
  assert.equal(decideVersionAction({ ...base, deployedEntry: 'index-a.js' }), 'none');
  assert.equal(decideVersionAction({ ...base, deployedEntry: '' }), 'none');
  assert.equal(decideVersionAction({ ...base, runningEntry: '' }), 'none');
});

test('SW baru sudah menunggu → tawarkan muat ulang (tanpa reload paksa)', () => {
  assert.equal(decideVersionAction({ ...base, swWaiting: true }), 'prompt');
});

test('SW baru sedang dipasang → tunggu (onNeedRefresh yang akan menawarkan)', () => {
  assert.equal(decideVersionAction({ ...base, swInstalling: true }), 'wait');
});

test('build berbeda tapi tak ada SW baru sama sekali → SW macet, perbaiki sekali', () => {
  assert.equal(decideVersionAction(base), 'repair');
  // Sudah diperbaiki untuk build ini di sesi tab ini: cukup tawarkan muat ulang.
  assert.equal(decideVersionAction({ ...base, repairedFor: 'index-b.js' }), 'prompt');
  // Perbaikan untuk build LAMA tidak menghalangi perbaikan build baru.
  assert.equal(decideVersionAction({ ...base, repairedFor: 'index-old.js' }), 'repair');
});

// Registrasi SW ditunda sampai load+idle (main.tsx), sedangkan checkBuildVersion memanggil
// registration.update() ±4 dtk setelah eksekusi. Bila update() menang, SW baru sudah
// `installing` saat workbox register() — workbox tidak pernah melacaknya (register() hanya
// menangani `.waiting` + listener `updatefound` yang dipasang sesudahnya), jadi onNeedRefresh
// tak pernah dipanggil. Alur 'wait' memantau sendiri lewat `statechange`.
function fakeWorker(state = 'installing') {
  const sw = new EventTarget();
  sw.state = state;
  // Peramban memicu statechange di setiap transisi (installing → installed → activating → …).
  sw.setState = (next) => { sw.state = next; sw.dispatchEvent(new Event('statechange')); };
  return sw;
}

test("alur 'wait': SW yang sedang installing ditawarkan SEKALI begitu terpasang (menunggu)", () => {
  const sw = fakeWorker('installing');
  let offered = 0;
  whenWorkerInstalled(sw, () => { offered += 1; });
  assert.equal(offered, 0, 'belum terpasang → belum ditawarkan');
  sw.setState('installed');
  assert.equal(offered, 1);
  // Transisi berikutnya (setelah SKIP_WAITING) tidak menawarkan lagi.
  sw.setState('activating');
  sw.setState('activated');
  assert.equal(offered, 1);
});

test("alur 'wait': install yang gagal (redundant) tidak menawarkan muat ulang", () => {
  const sw = fakeWorker('installing');
  let offered = 0;
  whenWorkerInstalled(sw, () => { offered += 1; });
  sw.setState('redundant');
  assert.equal(offered, 0);
  // Listener sudah dilepas: transisi palsu sesudahnya pun tidak memicu.
  sw.setState('installed');
  assert.equal(offered, 0);
});

test("alur 'wait': SW yang sudah installed ditawarkan langsung; yang sudah lewat diabaikan", () => {
  let offered = 0;
  whenWorkerInstalled(fakeWorker('installed'), () => { offered += 1; });
  assert.equal(offered, 1);
  whenWorkerInstalled(fakeWorker('activated'), () => { offered += 1; });
  whenWorkerInstalled(fakeWorker('redundant'), () => { offered += 1; });
  assert.equal(offered, 1);
});

test('store update: pelanggan diberi tahu, abaikan menyembunyikan, apply memanggil aksi terakhir', () => {
  const seen = [];
  const unsubscribe = subscribeUpdate(() => seen.push(getUpdateState()));
  assert.deepEqual(getUpdateState(), { ready: false, dismissed: false });
  let applied = 0;
  markUpdateReady(() => { applied += 1; });
  assert.deepEqual(getUpdateState(), { ready: true, dismissed: false });
  dismissUpdate();
  assert.deepEqual(getUpdateState(), { ready: true, dismissed: true });
  // Kesiapan baru (mis. SW lain menunggu) menampilkan lagi tawaran yang sempat diabaikan.
  markUpdateReady(() => { applied += 10; });
  assert.equal(getUpdateState().dismissed, false);
  applyUpdate();
  assert.equal(applied, 10);
  assert.equal(seen.length, 3);
  unsubscribe();
  markUpdateReady(() => {});
  assert.equal(seen.length, 3);
});

// Aplikasi yang dulu dipasang dari /login (start_url lama manifest blob) membuka /login
// setiap diluncurkan, dan LoginRouter menghapus sesi. Peluncuran app = standalone tanpa
// referrer; navigasi ke /login dari dalam app (logout, 401) selalu ber-referrer / tanpa sesi.
test('LoginRouter melanjutkan sesi hanya pada peluncuran app terpasang', () => {
  assert.equal(shouldResumeSessionOnLogin({ standalone: true, referrer: '', hasSession: true }), true);
  assert.equal(shouldResumeSessionOnLogin({ standalone: false, referrer: '', hasSession: true }), false);
  assert.equal(shouldResumeSessionOnLogin({ standalone: true, referrer: 'https://alhijaz.co/dashboard', hasSession: true }), false);
  assert.equal(shouldResumeSessionOnLogin({ standalone: true, referrer: '', hasSession: false }), false);
});
