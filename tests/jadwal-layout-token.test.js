import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Lebar kolom jadwal dan lebar rail hidup di SATU tempat: variabel CSS di
 * src/index.css. Sebelumnya empat pembungkus menulis `max-w-lg` sendiri-sendiri
 * (main, modal Tampilan Ringkas, header inner, bar agent); begitu kolom
 * menyempit di 1024px, header langsung meleset dari kartu.
 *
 * Tes ini menguji DEKLARASINYA, bukan pemakaiannya — nilai breakpoint adalah
 * kontrak antara CSS dan src/lib/wideLayout.ts, dan kalau keduanya berbeda rail
 * akan tampil tanpa pernah diisi.
 */

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

/** Isi blok `:root { ... }` di dalam @media dengan lebar minimum tertentu. */
function rootBlockAtWidth(minWidth) {
  const re = new RegExp(`@media\\s*\\(min-width:\\s*${minWidth}px\\)\\s*\\{\\s*:root\\s*\\{([^}]*)\\}`, 'm');
  const m = css.match(re);
  assert.ok(m, `tidak ada blok :root di @media (min-width: ${minWidth}px)`);
  return m[1];
}

/** Blok `:root` dasar — yang memuat token jadwal, bukan sekadar yang pertama. */
function baseRootBlock() {
  const blocks = [...css.matchAll(/^:root\s*\{([^}]*)\}/gm)].map((m) => m[1]);
  const withToken = blocks.find((b) => b.includes('--jadwal-col-w'));
  assert.ok(withToken, 'tidak ada blok :root dasar yang mendeklarasikan --jadwal-col-w');
  return withToken;
}

function rule(selector) {
  const re = new RegExp(`${selector.replace(/[.\-]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  const m = css.match(re);
  assert.ok(m, `tidak ada aturan ${selector}`);
  return m[1];
}

test('lebar kolom & rail dasar = 512px / 0', () => {
  const b = baseRootBlock();
  assert.match(b, /--jadwal-col-w:\s*512px/);
  assert.match(b, /--jadwal-rail-left-w:\s*0px/);
  assert.match(b, /--jadwal-rail-right-w:\s*0px/);
  assert.match(b, /--jadwal-rail-gap:\s*24px/);
});

test('1024px: kolom menyempit ke 420, kedua rail 250', () => {
  const b = rootBlockAtWidth(1024);
  assert.match(b, /--jadwal-col-w:\s*420px/);
  assert.match(b, /--jadwal-rail-left-w:\s*250px/);
  assert.match(b, /--jadwal-rail-right-w:\s*250px/);
});

test('1280px: kolom kembali 512; rail kiri lebih lebar dari kanan', () => {
  const b = rootBlockAtWidth(1280);
  assert.match(b, /--jadwal-col-w:\s*512px/);
  assert.match(b, /--jadwal-rail-left-w:\s*340px/);
  assert.match(b, /--jadwal-rail-right-w:\s*300px/);
});

test('1440px: rail kiri 400 (dokumen itinerary), kanan 340', () => {
  const b = rootBlockAtWidth(1440);
  assert.match(b, /--jadwal-rail-left-w:\s*400px/);
  assert.match(b, /--jadwal-rail-right-w:\s*340px/);
});

/**
 * Rail + jarak + separuh kolom tidak boleh melebihi separuh viewport, kalau
 * tidak rail-nya tertindih kolom. Dihitung, bukan dikira-kira.
 */
test('rail muat di selokan pada tiap breakpoint', () => {
  for (const [vw, col, left, right] of [[1024, 420, 250, 250], [1280, 512, 340, 300], [1440, 512, 400, 340]]) {
    const gutter = (vw - col) / 2;
    assert.ok(left + 24 < gutter, `rail kiri ${left}px + 24 tidak muat di selokan ${gutter}px pada ${vw}`);
    assert.ok(right + 24 < gutter, `rail kanan ${right}px + 24 tidak muat di selokan ${gutter}px pada ${vw}`);
  }
});

test('.jadwal-shell memakai token, bukan angka mati', () => {
  const body = rule('.jadwal-shell');
  assert.match(body, /max-width:\s*var\(--jadwal-col-w\)/);
  assert.doesNotMatch(body, /max-width:\s*\d/, 'lebar dipaku angka — token jadi tak berguna');
});

test('rail duduk di selokan, dihitung dari lebar kolom', () => {
  assert.match(
    rule('.jadwal-rail--left'),
    /right:\s*calc\(50%\s*\+\s*var\(--jadwal-col-w\)\s*\/\s*2\s*\+\s*var\(--jadwal-rail-gap\)\)/,
  );
  assert.match(
    rule('.jadwal-rail--right'),
    /left:\s*calc\(50%\s*\+\s*var\(--jadwal-col-w\)\s*\/\s*2\s*\+\s*var\(--jadwal-rail-gap\)\)/,
  );
});

test('rail tersembunyi di bawah 1024px dan tidak ikut menggulir daftar', () => {
  const body = rule('.jadwal-rail');
  assert.match(body, /display:\s*none/);
  assert.match(body, /position:\s*fixed/);
  assert.match(body, /overscroll-behavior:\s*contain/);
});

test('rail dijangkar ke tinggi header yang diukur, bukan angka mati', () => {
  assert.match(rule('.jadwal-rail'), /top:\s*var\(--filter-header-h\)/);
});
