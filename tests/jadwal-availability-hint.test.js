import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Coach mark tombol "hanya seat tersedia": tampil tiap kali tombol matanya
// MUNCUL (paling sering: pindah dari Jenis Paket → SEAT TERSEDIA ke filter
// lain), paling sering sekali per 4 jam.
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

const {
  AVAILABILITY_HINT_KEY,
  AVAILABILITY_HINT_INTERVAL_MS,
  shouldShowAvailabilityHint,
  markAvailabilityHintShown,
} = await bundle('src/lib/availability-hint.ts', 'availability-hint');

const T0 = Date.UTC(2026, 8, 24, 3, 0, 0);
const JAM = 60 * 60 * 1000;

const read = rel => readFileSync(join(root, rel), 'utf8');
const filterHeader = read('src/components/FilterHeader.tsx');
const coachMark = read('src/components/AvailabilityCoachMark.tsx');
const filterDropdown = read('src/components/FilterDropdown.tsx');

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

// ── Keputusan tampil: sekali per 4 jam ──

test('jedanya 4 jam', () => {
  assert.equal(AVAILABILITY_HINT_INTERVAL_MS, 4 * JAM);
});

test('browser yang belum pernah melihat: tampil', () => {
  assert.equal(shouldShowAvailabilityHint(fakeStorage(), T0), true);
});

test('sesudah tampil: diam 4 jam, lalu boleh tampil lagi', () => {
  const s = fakeStorage();
  markAvailabilityHintShown(s, T0);
  assert.equal(shouldShowAvailabilityHint(s, T0 + 1), false);
  assert.equal(shouldShowAvailabilityHint(s, T0 + 4 * JAM - 1), false);
  assert.equal(shouldShowAvailabilityHint(s, T0 + 4 * JAM), true);
  assert.equal(shouldShowAvailabilityHint(s, T0 + 30 * JAM), true);
});

test('stempel di masa depan (jam perangkat sempat maju) dianggap basi', () => {
  // Kalau tidak, gelembungnya tersandera sampai jam itu benar-benar lewat —
  // aturan yang sama dengan callout stiker Brosur (src/lib/stickerPromoGate.js).
  const s = fakeStorage();
  markAvailabilityHintShown(s, T0 + 10 * JAM);
  assert.equal(shouldShowAvailabilityHint(s, T0), true);
});

test('isi kunci rusak = belum pernah tampil', () => {
  assert.equal(shouldShowAvailabilityHint(fakeStorage({ [AVAILABILITY_HINT_KEY]: 'ngawur' }), T0), true);
});

test('kunci naik ke -v2: penanda "sudah lihat selamanya" dari v1 tidak membisukan lagi', () => {
  // v1 menyimpan '1' = tak pernah tampil lagi. Aturan baru wajib menjangkau
  // pengunjung lama juga, jadi kuncinya diganti, bukan ditafsir ulang.
  assert.equal(AVAILABILITY_HINT_KEY, 'jadwal-availability-hint-v2');
  assert.equal(shouldShowAvailabilityHint(fakeStorage({ 'jadwal-availability-hint-v1': '1' }), T0), true);
  const s = fakeStorage();
  markAvailabilityHintShown(s, T0);
  assert.deepEqual(Object.keys(s.data), [AVAILABILITY_HINT_KEY]);
  assert.equal(s.data[AVAILABILITY_HINT_KEY], String(T0));
});

test('storage yang menolak (Safari private): tidak melempar, jeda 4 jam tetap berlaku di memori', () => {
  // Tanpa cadangan memori, gelembung menyembul di SETIAP perpindahan filter.
  assert.equal(shouldShowAvailabilityHint(throwingStorage, T0), true);
  assert.doesNotThrow(() => markAvailabilityHintShown(throwingStorage, T0));
  assert.equal(shouldShowAvailabilityHint(throwingStorage, T0 + JAM), false);
  assert.equal(shouldShowAvailabilityHint(throwingStorage, T0 + 4 * JAM), true);
});

test('tanpa storage sama sekali (SSR/prerender) tidak melempar', () => {
  assert.doesNotThrow(() => shouldShowAvailabilityHint(null));
  assert.doesNotThrow(() => markAvailabilityHintShown(null));
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

test('panah memakai warna yang sama persis dengan badan, di KEDUA mode', () => {
  // Panah yang warnanya melenceng = segitiga nyasar yang tidak menyatu dengan
  // balon. Paling gampang terjadi saat menambah varian gelap: satu diperbarui,
  // satunya lupa.
  const warna = /bg-slate-900 dark:bg-slate-50/g;
  assert.equal([...coachMark.matchAll(warna)].length, 2, 'badan & panah harus sewarna');
  // Teksnya ikut membalik, kalau tidak jadi putih-di-atas-putih saat mode gelap.
  assert.match(coachMark, /text-white dark:text-slate-900/);
});

test('badan & panah tidak boleh punya tepi atau bayangan sendiri', () => {
  // AKAR "panahnya seperti ada garis": `ring-1` dan `shadow-lg` milik badan
  // digambar tepat di garis tempat panah menyatu, jadi terlihat sebagai jahitan
  // dan panahnya seperti stiker yang ditempel.
  //
  // Bayangan harus pindah ke PEMBUNGKUS sebagai drop-shadow: filter itu
  // menelusuri siluet gabungan badan+panah, box-shadow hanya kotak badannya.
  assert.doesNotMatch(coachMark, /\bring-1\b/);
  assert.doesNotMatch(coachMark, /\bshadow-lg\b/);
  assert.match(coachMark, /drop-shadow-\[/);
  assert.match(coachMark, /dark:drop-shadow-\[/);
});

test('gelembung punya animasi KELUAR, bukan hilang mendadak', () => {
  // Kalau langsung unmount saat `open` jadi false, tidak ada satu frame pun
  // untuk memainkan fade-out — inilah kondisi sebelum perbaikan ini.
  assert.match(coachMark, /EXIT_MS/);
  assert.match(coachMark, /setShown\(false\)/);
  assert.match(coachMark, /setRender\(false\)/);
});

test('transisi TIDAK boleh menyentuh top/left', () => {
  // Posisinya diukur ulang saat header menciut/mengembang. Kalau top/left ikut
  // ditransisikan, gelembung berenang mengejar tombol alih-alih menempel.
  assert.doesNotMatch(coachMark, /transition-all/);
  assert.match(coachMark, /transition-\[opacity,transform\]/);
});

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

test('pemicunya tombol mata MUNCUL, bukan sekali per kunjungan', () => {
  // Efek ber-dep showAvailabilityToggle saja: tiap kali tombolnya muncul lagi
  // (Seat Tersedia → Landing, dst.) keputusan 4 jam diperiksa ulang. Kunci
  // sekali-per-mount yang lama (hintArmedRef) justru menahannya.
  assert.doesNotMatch(filterHeader, /hintArmedRef/);
  const effect = filterHeader.match(/useEffect\(\(\) => \{\s*if \(!showAvailabilityToggle\)[\s\S]*?\}, \[showAvailabilityToggle\]\);/)?.[0] ?? '';
  assert.notEqual(effect, '', 'efek petunjuk ber-dep [showAvailabilityToggle] tidak ditemukan');
  // Tombolnya hilang (balik ke Seat Tersedia) = tayangan itu selesai; muncul
  // lagi dalam 4 jam tidak menayangkannya ulang.
  assert.match(effect, /setHintOpen\(false\)/);
  assert.match(effect, /shouldShowAvailabilityHint\(\)/);
  // Jam 4 jam mulai saat gelembung BENAR-BENAR tampil (di dalam timer), jadi
  // pindah filter lagi sebelum 600 ms tidak menghabiskan jatahnya.
  const timer = effect.match(/setTimeout\(\(\) => \{[\s\S]*?\}, \d+\)/)?.[0] ?? '';
  assert.match(timer, /markAvailabilityHintShown\(\)/);
  assert.match(timer, /setHintOpen\(true\)/);
  // Menutup gelembung tidak lagi membisukan selamanya.
  assert.doesNotMatch(filterHeader, /markAvailabilityHintSeen/);
});

test('gelembung menunggu selama dropdown header terbuka, tidak menimpanya', () => {
  // Memilih mode dari dropdown utama langsung menyembulkan sub-filternya, dan
  // 600 ms kemudian gelembung terbit — tanpa gerbang ini ia menutupi opsi
  // panel yang baru terbuka (terlihat di "9 HARI / 10 HARI").
  const open = filterHeader.match(/open=\{[^}]*\}/)?.[0] ?? '';
  assert.match(open, /openMenuCount === 0/);

  // Setiap FilterDropdown di header melapor buka/tutup — satu yang lupa berarti
  // gelembung menimpa panel itu.
  // `\s` sesudah nama: jangan tertukar dengan `useRef<FilterDropdownHandle`.
  const dropdowns = [...filterHeader.matchAll(/<FilterDropdown\s(?:(?!<FilterDropdown\s)[\s\S])*?\/>/g)].map(m => m[0]);
  assert.ok(dropdowns.length >= 5, 'dropdown header tidak ditemukan');
  for (const block of dropdowns) {
    assert.match(block, /onOpenChange=\{handleMenuOpenChange\}/, block.match(/ariaLabel="[^"]*"/)?.[0]);
  }

  // Laporannya berpasangan: `true` saat buka, `false` saat tutup ATAU unmount
  // selagi terbuka (sub-filter hilang saat mode berganti). Tanpa cleanup itu
  // hitungannya tersangkut > 0 dan gelembung tak pernah tampil lagi.
  const effect = filterDropdown.match(/useEffect\(\(\) => \{\s*if \(!open\) return;\s*onOpenChangeRef\.current\?\.\(true\);[\s\S]*?\}, \[open\]\);/)?.[0] ?? '';
  assert.notEqual(effect, '', 'efek onOpenChange berpasangan tidak ditemukan');
  assert.match(effect, /return \(\) => onOpenChangeRef\.current\?\.\(false\);/);
  // Hitungan tidak boleh turun di bawah nol.
  assert.match(filterHeader, /Math\.max\(0, c \+ \(isOpen \? 1 : -1\)\)/);
});

test('menekan tombol matanya ikut membubarkan gelembung', () => {
  // User yang sudah menemukan tombolnya tidak perlu diberi tahu lagi.
  const blok = filterHeader.match(/onClick=\{\(\) => \{[^}]*onToggleAvailableOnly[\s\S]*?\}\}/)?.[0] ?? '';
  assert.notEqual(blok, '', 'handler tombol mata tidak ditemukan');
  assert.match(blok, /dismissAvailabilityHint/);
});
