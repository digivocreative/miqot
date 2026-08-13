import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Coach mark sekali-tampil untuk tombol "hanya seat tersedia".
//
// Keputusan tampil/tidak sengaja ditarik keluar jadi fungsi murni supaya bisa
// diuji tanpa DOM; sisanya (posisi portal, jalur pembubaran) dijaga sebagai
// source guard — sepola tests/filter-header-tipe-paket.test.js.

const root = new URL('..', import.meta.url).pathname;

async function bundle(entry, name) {
  const dir = await mkdtemp(join(tmpdir(), `${name}-`));
  const outfile = join(dir, `${name}.mjs`);
  await build({
    entryPoints: [join(root, entry)],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    alias: { '@': join(root, 'src') },
    logLevel: 'silent',
  });
  return import(pathToFileURL(outfile).href);
}

const { AVAILABILITY_HINT_KEY, shouldShowAvailabilityHint, markAvailabilityHintSeen } =
  await bundle('src/lib/availability-hint.ts', 'availability-hint');

const read = rel => readFileSync(join(root, rel), 'utf8');
const filterHeader = read('src/components/FilterHeader.tsx');
const coachMark = read('src/components/AvailabilityCoachMark.tsx');

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

const throwingStorage = {
  getItem() { throw new Error('storage ditolak'); },
  setItem() { throw new Error('storage ditolak'); },
};

// ── Keputusan sekali-tampil ──

test('browser yang belum pernah melihat: tampil', () => {
  assert.equal(shouldShowAvailabilityHint(fakeStorage()), true);
});

test('sesudah ditandai: tidak pernah tampil lagi', () => {
  const s = fakeStorage();
  markAvailabilityHintSeen(s);
  assert.equal(shouldShowAvailabilityHint(s), false);
});

test('kunci bersufiks versi supaya teks baru bisa ditayangkan ulang', () => {
  // Naikkan ke -v2 = semua orang melihat versi barunya sekali lagi.
  assert.equal(AVAILABILITY_HINT_KEY, 'jadwal-availability-hint-v1');
  const s = fakeStorage();
  markAvailabilityHintSeen(s);
  assert.deepEqual(Object.keys(s.data), [AVAILABILITY_HINT_KEY]);
});

test('storage yang menolak (Safari private) tidak menjatuhkan halaman', () => {
  // Gagal baca → tetap tampil: hint yang muncul dua kali jauh lebih murah
  // daripada halaman jadwal yang blank karena localStorage melempar.
  assert.equal(shouldShowAvailabilityHint(throwingStorage), true);
  assert.doesNotThrow(() => markAvailabilityHintSeen(throwingStorage));
});

test('tanpa storage sama sekali (SSR/prerender) tidak melempar', () => {
  assert.doesNotThrow(() => shouldShowAvailabilityHint(null));
  assert.doesNotThrow(() => markAvailabilityHintSeen(null));
});

// ── Gelembung: posisi & pembubaran ──

test('gelembung dirender lewat portal, bukan di dalam header', () => {
  // Baris filter hidup di pembungkus overflow-hidden yang menciut saat digulir
  // — anak biasa akan TERPOTONG. Alasan yang sama dipakai FilterDropdown.
  assert.match(coachMark, /createPortal/);
  assert.match(coachMark, /getBoundingClientRect\(\)/);
  assert.match(coachMark, /position: 'fixed'|position:'fixed'/);
});

test('gelembung TIDAK pernah bubar sendiri', () => {
  // Keputusan produk: hanya dua klik yang boleh menutupnya (tombol mata &
  // tombol ×). Tidak ada timer, tidak ada guliran, tidak ada resize.
  assert.doesNotMatch(coachMark, /AUTO_DISMISS/);
  // onDismiss tidak boleh dipanggil dari kode mana pun...
  assert.doesNotMatch(coachMark, /onDismiss\(\)/);
  // ...maupun diserahkan ke timer, yang lolos dari pemeriksaan di atas karena
  // dioper sebagai referensi: `setTimeout(onDismiss, 6000)`.
  assert.doesNotMatch(coachMark, /(setTimeout|setInterval)\(\s*onDismiss/);
  // Satu-satunya jalinannya: klik tombol ×.
  assert.match(coachMark, /onClick=\{onDismiss\}/);
});

test('scroll & resize hanya mengukur ulang, tidak menutup', () => {
  // Header itu `fixed`, tapi barisnya menciut/mengembang saat digulir — posisi
  // jangkar berubah, jadi gelembung harus MENGIKUTI, bukan menyerah.
  const measure = coachMark.match(/const measure = \(\) => \{[\s\S]*?\n {4}\};/)?.[0] ?? '';
  assert.notEqual(measure, '', 'fungsi measure tidak ditemukan');
  assert.doesNotMatch(measure, /dismiss/i);
  assert.match(measure, /measureFrom/);
  // Listener-nya memang menunjuk measure, bukan sesuatu yang membubarkan.
  assert.match(coachMark, /addEventListener\('scroll', measure, true\)/);
  assert.match(coachMark, /addEventListener\('resize', measure\)/);
});

// ── Sambungan di FilterHeader ──

test('gelembung berjangkar ke tombol matanya sendiri', () => {
  assert.match(filterHeader, /<AvailabilityCoachMark/);
  assert.match(filterHeader, /ref=\{availabilityBtnRef\}/);
  assert.match(filterHeader, /anchorRef=\{availabilityBtnRef\}/);
});

test('gelembung ikut sembunyi saat tombolnya sendiri tidak ada', () => {
  // Kalau `open` lepas dari showAvailabilityToggle, gelembung bisa melayang
  // menunjuk tombol yang sudah tidak dirender.
  const open = filterHeader.match(/open=\{[^}]*\}/)?.[0] ?? '';
  assert.notEqual(open, '', 'prop open tidak ditemukan');
  assert.match(open, /showAvailabilityToggle/);
});

test('menekan tombol matanya ikut membubarkan gelembung', () => {
  // User yang sudah menemukan tombolnya tidak perlu diberi tahu lagi.
  const blok = filterHeader.match(/onClick=\{\(\) => \{[^}]*onToggleAvailableOnly[\s\S]*?\}\}/)?.[0] ?? '';
  assert.notEqual(blok, '', 'handler tombol mata tidak ditemukan');
  assert.match(blok, /dismissAvailabilityHint/);
});
