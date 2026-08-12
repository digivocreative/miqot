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
const app = read('src/App.tsx');
const brochurePage = read('src/components/BrochureSchedulePage.tsx');
const brochureTemplate = read('src/components/BrochureScheduleTemplate.tsx');

test('dropdown utama menawarkan TIPE PAKET dan tidak lagi 5 filter yang dihapus', () => {
  const optionsBlock = filterHeader.match(/const FILTER_MODE_OPTIONS[\s\S]*?\n\];/)?.[0] ?? '';
  assert.notEqual(optionsBlock, '', 'FILTER_MODE_OPTIONS tidak ditemukan — perbarui regex tes ini bersama kodenya');

  assert.match(optionsBlock, /value: 'TIPE PAKET', label: 'TIPE PAKET'/);
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
    /<FilterDropdown(?:(?!<FilterDropdown)[\s\S])*?ariaLabel="Pilih Tipe Paket"(?:(?!<FilterDropdown)[\s\S])*?\/>/,
  )?.[0] ?? '';
  assert.notEqual(block, '', 'dropdown Tipe Paket tidak ditemukan');
  assert.match(block, /value: '', label: '- Pilih Tipe -'/);
  assert.match(block, /\.\.\.packageTypeOptions/);
  // Scroll cap hanya dilepas untuk dropdown utama — dikunci juga oleh
  // tests/filter-header-main-dropdown-full-list.test.js.
  assert.ok(!block.includes('showAllOptions'));
  assert.match(filterHeader, /const showTypeDropdown = filterMode === 'TIPE PAKET'/);
});

test('opsi tipe dibangun dari paket yang masih punya kursi, lewat roster bersama', () => {
  const memo = filterHeader.match(/const packageTypeOptions = useMemo\([\s\S]*?\}, \[[^\]]*\]\);/)?.[0] ?? '';
  assert.notEqual(memo, '', 'memo packageTypeOptions tidak ditemukan');
  // Bukan `packages`: opsi dari seluruh data bisa berujung nol kartu (dead end).
  assert.match(memo, /availablePackages\.map\(umrohTypeSubject\)/);
  assert.match(memo, /listPackageTypeOptions/);
  assert.doesNotMatch(memo, /\bpackages\.map\b/);
});

test('daftar mode ber-sort hidup di satu tempat saja', () => {
  assert.match(filterHeader, /const showSortDropdown = MODES_WITH_SORT\.includes\(filterMode\)/);
  assert.match(app, /MODES_WITH_SORT\.includes\(/);
  // Dulu array literalnya ditulis dua kali di App.tsx dan sekali lagi sebagai
  // rantai === di FilterHeader — cukup satu yang lupa diperbarui untuk membuat
  // "masuk lewat URL" dan "ganti dropdown" berbeda perilaku.
  assert.doesNotMatch(app, /const modesWithSort/);
});

test('tipe paket ikut ke URL sebagai ?tipe= saat sub-filter diganti', () => {
  const handler = app.match(/const handleSecondaryValueChange = [\s\S]*?\n  \};/)?.[0] ?? '';
  assert.notEqual(handler, '', 'handleSecondaryValueChange tidak ditemukan');
  assert.match(handler, /\?tipe=\$\{packageTypeSlug\(value\)\}/);
  assert.match(handler, /replaceState/);
  // WAJIB lewat ref: dropdown mode memanggil onSecondaryValueChange('') di event
  // yang sama persis setelah onFilterModeChange, jadi `filterMode` di closure
  // masih mode LAMA. Dengan state, pindah Tipe Paket → Landing menulis balik URL
  // ke /tipe-paket padahal modenya sudah bukan itu.
  assert.match(handler, /filterModeRef\.current !== 'TIPE PAKET'/);
  assert.doesNotMatch(handler, /\bfilterMode !== 'TIPE PAKET'/);
  assert.match(app, /filterModeRef\.current = mode;/);
  // Slug lama (mis. /umroh-promo) membawa preset; tanpa penulisan ulang ini URL
  // yang di-share akan menjanjikan filter yang sudah tidak aktif.
  assert.match(app, /resolveFilterSlug\(filterSlugFromUrl\)/);
  assert.match(app, /packageTypeFromSlug\(/);
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
