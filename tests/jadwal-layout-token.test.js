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
  assert.match(b, /--jadwal-rail-w:\s*0px/);
  assert.match(b, /--jadwal-rail-gap:\s*24px/);
  assert.match(b, /--jadwal-top-gap:\s*11px/);
});

test('1024px: kolom menyempit ke 380, rail 280', () => {
  const b = rootBlockAtWidth(1024);
  assert.match(b, /--jadwal-col-w:\s*380px/);
  assert.match(b, /--jadwal-rail-w:\s*280px/);
});

test('1280px: kolom kembali 512, rail 340', () => {
  const b = rootBlockAtWidth(1280);
  assert.match(b, /--jadwal-col-w:\s*512px/);
  assert.match(b, /--jadwal-rail-w:\s*340px/);
});

test('1440px: rail 400', () => {
  assert.match(rootBlockAtWidth(1440), /--jadwal-rail-w:\s*400px/);
});

/**
 * Kedua rail WAJIB selebar sama. Lebar berbeda membuat margin luar timpang —
 * terukur 132px di kiri lawan 198px di kanan pada viewport 1629px — dan itu
 * terbaca sebagai komposisi yang tidak rapi, bukan sebagai rail yang lebih
 * penting di satu sisi.
 */
test('kiri dan kanan selebar sama di tiap breakpoint', () => {
  for (const w of [1024, 1280, 1440]) {
    const b = rootBlockAtWidth(w);
    assert.doesNotMatch(b, /--jadwal-rail-left-w|--jadwal-rail-right-w/,
      `breakpoint ${w} masih memakai lebar rail terpisah`);
  }
});

/**
 * Rail + jarak + separuh kolom tidak boleh melebihi separuh viewport, kalau
 * tidak rail-nya tertindih kolom. Dihitung, bukan dikira-kira.
 */
test('rail muat di selokan pada tiap breakpoint', () => {
  for (const [vw, col, rail] of [[1024, 380, 280], [1280, 512, 340], [1440, 512, 400]]) {
    const gutter = (vw - col) / 2;
    assert.ok(rail + 24 < gutter, `rail ${rail}px + 24 tidak muat di selokan ${gutter}px pada ${vw}`);
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

/**
 * Rail membentang penuh dari atas viewport dan memberi jarak lewat PADDING,
 * bukan lewat `top` yang dipaku.
 *
 * Sebabnya: --filter-header-h SENGAJA dipaku ke tinggi header saat mengembang
 * (181px) karena <main> memakainya sebagai offset RUANG-DOKUMEN, dan menulis
 * nilai antara ke situ menggeser seluruh daftar — sumber "ngejedug" di iOS yang
 * sudah diperbaiki. Tapi rail `fixed` hidup di RUANG-VIEWPORT: begitu header
 * menyusut ke 55px saat digulir, rail yang ber-`top: 181px` meninggalkan celah
 * kosong 126px yang tidak pernah tertutup.
 *
 * Dengan top:0 + padding, isi rail lewat DI BAWAH header tembus-pandang persis
 * seperti kolom tengah — dan itulah yang membuatnya menyatu.
 */
test('rail membentang dari atas viewport, jarak lewat padding', () => {
  const body = rule('.jadwal-rail');
  assert.match(body, /top:\s*0/);
  assert.doesNotMatch(body, /top:\s*var\(--filter-header-h\)/, 'top yang dipaku meninggalkan celah saat header menyusut');
});

/**
 * Fallback-nya load-bearing: pada cat pertama FilterHeader belum sempat
 * menerbitkan tinggi hidupnya, dan tanpa fallback padding rail jadi 0 —
 * baris pertamanya tersembunyi di balik header.
 */
test('padding rail mengikuti tinggi header hidup, dengan fallback', () => {
  assert.match(rule('.jadwal-rail'), /var\(--filter-header-visible-h,\s*var\(--filter-header-h\)\)/);
});

/**
 * Header beranimasi 300ms saat menyusut/mengembang. Tanpa transisi yang sepadan,
 * isi rail meloncat 126px sekaligus sementara headernya meluncur halus.
 */
test('rail ikut beranimasi bersama header, bukan meloncat', () => {
  assert.match(rule('.jadwal-rail'), /transition:[^;]*padding-top/);
});

/**
 * Batas bawah rail dilarutkan, bukan dipotong. Tanpa ini isi rail terpenggal
 * mendadak di tepi viewport dan railnya terbaca sebagai panel yang ditempel —
 * keluhan "belum nge-blend". Dipasang dua-duanya karena Safari masih butuh
 * awalan -webkit-.
 */
test('tepi bawah rail memudar, tidak terpotong keras', () => {
  const body = rule('.jadwal-rail');
  assert.match(body, /-webkit-mask-image:\s*linear-gradient\(to bottom/);
  assert.match(body, /[^-]mask-image:\s*linear-gradient\(to bottom/);
  assert.match(body, /transparent 100%\)/);
});

/**
 * Kartu tengah dan kedua rail harus mulai di GARIS yang sama di bawah header.
 * Sebelumnya kartu turun 11px sementara rail 0px, jadi hotel di rail kanan
 * terlihat mepet ke header sementara kartu tidak — dan ketiganya tidak sebaris.
 * Satu token, bukan dua angka yang kebetulan sama.
 */
test('kartu dan rail memakai jarak-atas dari token yang sama', () => {
  assert.match(rule('.jadwal-list-main'), /padding-top:\s*calc\(var\(--filter-header-h\)\s*\+\s*var\(--jadwal-top-gap\)\)/);
  assert.match(rule('.jadwal-rail'), /padding-top:\s*calc\(var\(--filter-header-visible-h,\s*var\(--filter-header-h\)\)\s*\+\s*var\(--jadwal-top-gap\)\)/);
});
