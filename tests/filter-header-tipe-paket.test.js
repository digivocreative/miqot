import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Wiring UI filter "Tipe Paket" di halaman jadwal publik. Perilaku predikatnya
// diuji di tests/package-type.test.js & tests/jadwal-filter-tipe-paket.test.js;
// di sini yang dijaga adalah sambungannya (source guard, seperti
// tests/filter-header-main-dropdown-full-list.test.js).

const root = new URL('..', import.meta.url).pathname;
const read = rel => readFileSync(join(root, rel), 'utf8');

const filterHeader = read('src/components/FilterHeader.tsx');
const filterLogic = read('src/utils/filter-logic.ts');
const app = read('src/App.tsx');
const brochurePage = read('src/components/BrochureSchedulePage.tsx');
const brochureTemplate = read('src/components/BrochureScheduleTemplate.tsx');
const filterDropdown = read('src/components/FilterDropdown.tsx');
// Kodek slug + label mode pindah ke lib/filter-slug.js (dipakai server.js juga).
const filterSlug = read('lib/filter-slug.js');

test('dropdown utama menawarkan TIPE PAKET dan tidak lagi 5 filter yang dihapus', () => {
  const optionsBlock = filterHeader.match(/const FILTER_MODE_OPTIONS[\s\S]*?\n\];/)?.[0] ?? '';
  assert.notEqual(optionsBlock, '', 'FILTER_MODE_OPTIONS tidak ditemukan — perbarui regex tes ini bersama kodenya');

  // Mode 'TIPE PAKET' tampil sebagai "JENIS PAKET"; nilainya tetap karena
  // terikat slug /tipe-paket, LEGACY_FILTER_SLUGS, dan filterPackages.
  assert.match(optionsBlock, /value: 'TIPE PAKET', label: filterModeLabel\('TIPE PAKET'\)/);
  // Peta labelnya ikut pindah ke kodek slug bersama; perilakunya diuji langsung
  // di tests/filter-slug.test.js.
  assert.match(filterSlug, /'TIPE PAKET': 'JENIS PAKET'/);
  // Urutan dropdown: Jenis Paket mendahului Landing Di.
  assert.ok(
    optionsBlock.indexOf("value: 'TIPE PAKET'") < optionsBlock.indexOf("value: 'LANDING DI'"),
    'TIPE PAKET harus di atas LANDING DI di dropdown utama',
  );
  for (const gone of [
    'UMROH CUTI 5 HARI',
    'UMROH PROMO',
    'UMROH REGULER',
    'UMROH MUSIM DINGIN',
    'UMROH BINTANG 5',
    'BINTANG 5',
  ]) {
    assert.ok(!optionsBlock.includes(gone), `${gone} masih ada di dropdown`);
  }
});

test('mode URL-saja tetap punya label di trigger dropdown utama', () => {
  // /cuti-5-hari dan /liburan-sekolah masih menyaring paket tapi tidak ada di
  // FILTER_MODE_OPTIONS; tanpa entri sintetis FilterDropdown menampilkan '—'.
  const memo = filterHeader.match(/const filterModeOptions = useMemo\([\s\S]*?\}, \[[^\]]*\]\);/)?.[0] ?? '';
  assert.notEqual(memo, '', 'memo filterModeOptions tidak ditemukan');
  assert.match(memo, /options\.some\(o => o\.value === filterMode\)/);
  assert.match(filterHeader, /options=\{filterModeOptions\}/);
});

test('sub-filter tipe paket: placeholder ala Jadwal, tanpa showAllOptions', () => {
  // Tidak boleh melewati `<FilterDropdown` lain, kalau tidak blok-nya menelan
  // dropdown utama (yang memang memakai showAllOptions).
  const block = filterHeader.match(
    /<FilterDropdown(?:(?!<FilterDropdown)[\s\S])*?ariaLabel="Pilih Jenis Paket"(?:(?!<FilterDropdown)[\s\S])*?\/>/,
  )?.[0] ?? '';
  assert.notEqual(block, '', 'dropdown Jenis Paket tidak ditemukan');
  assert.match(block, /value: '', label: '- Pilih Jenis -'/);
  assert.match(block, /\.\.\.packageTypeOptions/);
  // Scroll cap hanya dilepas untuk dropdown utama — dikunci juga oleh
  // tests/filter-header-main-dropdown-full-list.test.js.
  assert.ok(!block.includes('showAllOptions'));
  assert.match(filterHeader, /const showTypeDropdown = filterMode === 'TIPE PAKET'/);
});

test('opsi tipe dibangun dari roster yang sama dengan hasilnya', () => {
  const memo = filterHeader.match(/const packageTypeOptions = useMemo\([\s\S]*?\}, \[[^\]]*\]\);/)?.[0] ?? '';
  assert.notEqual(memo, '', 'memo packageTypeOptions tidak ditemukan');
  // `rosterPackages`, bukan `packages` mentah maupun daftar tersaring sendiri:
  // gerbang kursinya ikut tombol "hanya seat tersedia" (lihat
  // tests/jadwal-toggle-tersedia.test.js), jadi angka di label selalu sama
  // dengan jumlah kartu.
  assert.match(memo, /rosterPackages\.map\(umrohTypeSubject\)/);
  assert.match(memo, /listPackageTypeOptions/);
  // Berlaku untuk SEMUA roster sub-filter (bulan, durasi, landing, tipe): tidak
  // boleh ada yang menyaring kursi sendiri di luar rosterPackages.
  assert.doesNotMatch(filterHeader, /availablePackages/);
  const rogue = [...filterHeader.matchAll(/seatSisa > 0/g)];
  assert.equal(rogue.length, 1, 'gerbang kursi di FilterHeader harus tepat satu, di rosterPackages');
});

test('daftar mode ber-sort hidup di satu tempat saja', () => {
  assert.match(filterHeader, /const showSortDropdown = MODES_WITH_SORT\.includes\(filterMode\)/);
  assert.match(app, /MODES_WITH_SORT\.includes\(/);
  // Dulu array literalnya ditulis dua kali di App.tsx dan sekali lagi sebagai
  // rantai === di FilterHeader — cukup satu yang lupa diperbarui untuk membuat
  // "masuk lewat URL" dan "ganti dropdown" berbeda perilaku.
  assert.doesNotMatch(app, /const modesWithSort/);
});

test('filter ikut ke URL lewat SATU penulis, bukan tiap handler', () => {
  // Perilaku encoding-nya diuji di tests/jadwal-filter-url.test.js; di sini
  // yang dijaga sambungannya di App.
  assert.match(app, /buildFilterSearch\(\{/);
  assert.match(app, /parseFilterSearch\(window\.location\.search\)/);
  // Penulisan URL HARUS terpusat di efek. Dulu tiap handler menulis sendiri dan
  // handler-nya melihat state basi: dropdown mode memanggil
  // onSecondaryValueChange('') di event yang sama persis setelah
  // onFilterModeChange, jadi pindah Tipe Paket → Landing menulis balik URL ke
  // /tipe-paket padahal modenya sudah bukan itu.
  const writers = [...app.matchAll(/window\.history\.replaceState\((null|window\.history\.state), '', (?:next|`\$\{path\})/g)];
  assert.equal(writers.length, 1, 'penulis URL filter harus tepat satu');
  // Penulisnya MEMPERTAHANKAN history.state. Sheet Filter menulis filter selagi
  // terbuka, dan entri riwayatnya (useBackToClose) menyimpan token di state:
  // null menghapus token → menutup sheet tak membuang entrinya → back berikutnya
  // "kosong" dan URL mundur ke filter lama.
  assert.equal(writers[0][1], 'window.history.state', 'penulis URL filter menghapus history.state');
  assert.match(app, /if \(!urlSyncReadyRef\.current\) return;/);
  const handler = app.match(/const handleSecondaryValueChange = [\s\S]*?\n  \};/)?.[0] ?? '';
  assert.notEqual(handler, '', 'handleSecondaryValueChange tidak ditemukan');
  assert.doesNotMatch(handler, /replaceState/);
  assert.match(handler, /filterModeRef\.current/);
  assert.match(app, /filterModeRef\.current = mode;/);
  // Slug lama (mis. /umroh-promo) membawa preset; sub-nilai dari query menang.
  assert.match(app, /resolveFilterSlug\(filterSlugFromUrl\)/);
  assert.match(app, /parsedUrl\.secondary\[resolved\.mode\] \|\| resolved\.secondaryValue/);
});

test('Brosur memakai roster bersama, bukan daftar tipe inline lagi', () => {
  assert.match(brochurePage, /from '@\/lib\/packageType'/);
  assert.match(brochurePage, /listPackageTypeOptions\(optionPackages\.map\(brochureTypeSubject\), musimDinginWindow\)/);
  // Predikat/roster tidak boleh punya salinan kedua di halaman Brosur.
  assert.doesNotMatch(brochurePage, /const PACKAGE_TYPES\b/);
  assert.doesNotMatch(brochurePage, /function derivePackageType\b/);
  assert.doesNotMatch(brochurePage, /function isMusimDinginPackage\b/);
  assert.doesNotMatch(brochurePage, /function isPromoPackage\b/);
  assert.doesNotMatch(brochureTemplate, /export const PACKAGE_TYPES\b/);
  assert.doesNotMatch(brochureTemplate, /export function derivePackageType\b/);
  // Pill "Kereta Cepat" tetap satu pola dengan filternya.
  assert.match(brochureTemplate, /import \{ KERETA_CEPAT_PATTERN \} from '@\/lib\/packageType'/);
});

test('sub-filter menyembul sendiri setelah modenya dipilih — pemicunya nonce, bukan filterMode', () => {
  // Nonce dinaikkan di TEPAT SATU tempat: onChange dropdown mode. Kalau ada
  // penaik kedua (mis. ikut dipasang di efek sinkronisasi URL), mode yang datang
  // dari link WhatsApp atau tombol Back akan memuntahkan dropdown terbuka begitu
  // halaman dimuat.
  const bumps = [...filterHeader.matchAll(/setAutoOpenNonce\(/g)];
  assert.equal(bumps.length, 1, 'penaik autoOpenNonce harus tepat satu');

  const modeDropdown = filterHeader.match(
    /<FilterDropdown(?:(?!<FilterDropdown)[\s\S])*?ariaLabel="Filter paket"(?:(?!<FilterDropdown)[\s\S])*?\/>/,
  )?.[0] ?? '';
  assert.notEqual(modeDropdown, '', 'dropdown mode tidak ditemukan');
  assert.match(modeDropdown, /setAutoOpenNonce\(n => n \+ 1\)/, 'nonce harus dinaikkan di onChange dropdown mode');

  // Efeknya bergantung HANYA pada nonce. Versi pertama memakai [filterMode] dan
  // gagal dua arah: memilih ulang mode yang sudah aktif tidak membuka apa pun,
  // dan flag-nya tertinggal menyala lalu meledak di perpindahan berikutnya.
  const effect = filterHeader.match(/useEffect\(\(\) => \{\s*if \(autoOpenNonce === 0\)[\s\S]*?\}, \[autoOpenNonce\]\);/)?.[0] ?? '';
  assert.notEqual(effect, '', 'efek auto-open harus ber-dep [autoOpenNonce] saja');
  assert.match(effect, /if \(subFilterOptionCount === 0\) return;/, 'jangan membuka dropdown tanpa opsi (jalan buntu)');
  assert.match(effect, /subFilterRef\.current\?\.open\(\)/);
});

test('ref auto-open menempel di keempat sub-filter nilai, TIDAK di dropdown Urutkan', () => {
  const withRef = [...filterHeader.matchAll(/ref=\{subFilterRef\}/g)];
  assert.equal(withRef.length, 4, 'tepat 4 sub-filter nilai: Jenis Paket, Landing, Bulan, Durasi');

  // Urutkan sengaja di luar: modenya sudah menampilkan hasil dengan urutan
  // bawaan, jadi panel yang menyembul di sana cuma menutupi daftar.
  const sortDropdown = filterHeader.match(
    /<FilterDropdown(?:(?!<FilterDropdown)[\s\S])*?ariaLabel="Urutkan"(?:(?!<FilterDropdown)[\s\S])*?\/>/,
  )?.[0] ?? '';
  assert.notEqual(sortDropdown, '', 'dropdown Urutkan tidak ditemukan');
  assert.ok(!sortDropdown.includes('subFilterRef'), 'dropdown Urutkan tidak boleh ikut dibuka otomatis');
});

test('FilterDropdown: satu-satunya jalan membuka panel, dan selalu mengukur dulu', () => {
  // Pengukuran sinkron SEBELUM setOpen itu yang mencegah panel ber-portal
  // berkedip di pojok kiri-atas saat buka pertama. Jalur kedua yang lupa
  // mengukur akan berkedip — jadi `setOpen(true)` wajib tunggal.
  const opens = [...filterDropdown.matchAll(/setOpen\(true\)/g)];
  assert.equal(opens.length, 1, 'setOpen(true) harus tepat satu, di dalam openNow');
  const openNow = filterDropdown.match(/const openNow = useCallback\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/)?.[0] ?? '';
  assert.notEqual(openNow, '', 'openNow tidak ditemukan');
  assert.match(openNow, /if \(disabled\) return;/);
  assert.match(openNow, /if \(portal\) measure\(\);/);
  assert.match(filterDropdown, /useImperativeHandle\(ref, \(\) => \(\{ open: openNow \}\)/);
  assert.match(filterDropdown, /onClick=\{\(\) => \{ if \(open\) setOpen\(false\); else openNow\(\); \}\}/);
});

test('sub-filter pendek tidak memakai kotak Cari — ia merebut fokus & menaikkan keyboard', () => {
  // Sejak sub-filter menyembul sendiri, kotak Cari yang auto-focus berarti
  // keyboard HP ikut naik menutupi opsinya. Keempat daftar ini pendek & urut.
  for (const label of ['Pilih Jenis Paket', 'Pilih Bulan', 'Pilih Durasi']) {
    const block = filterHeader.match(
      new RegExp(`<FilterDropdown(?:(?!<FilterDropdown)[\\s\\S])*?ariaLabel="${label}"(?:(?!<FilterDropdown)[\\s\\S])*?/>`),
    )?.[0] ?? '';
    assert.notEqual(block, '', `dropdown ${label} tidak ditemukan`);
    assert.match(block, /searchable=\{false\}/, `${label} masih memunculkan kotak Cari`);
  }
  // Brosur: satu kontrol yang isinya berganti ikut dimensi, jadi Cari dimatikan
  // untuk SEMUA dimensi — kalau tidak, kotaknya muncul-hilang sendiri.
  const brochureValue = brochurePage.match(
    /<FilterDropdown(?:(?!<FilterDropdown)[\s\S])*?ariaLabel=\{`Pilih \$\{FILTER_DIM_LABELS\[filterDim\]\}`\}(?:(?!<FilterDropdown)[\s\S])*?\/>/,
  )?.[0] ?? '';
  assert.notEqual(brochureValue, '', 'dropdown nilai Brosur tidak ditemukan');
  assert.match(brochureValue, /searchable=\{false\}/);
});
