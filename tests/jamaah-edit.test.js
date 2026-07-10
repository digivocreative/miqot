import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/components/JamaahPage.tsx', import.meta.url), 'utf8');
const editPage = readFileSync(new URL('../src/components/JamaahEditPage.tsx', import.meta.url), 'utf8');
const editSkeleton = readFileSync(new URL('../src/components/JamaahEditSkeleton.tsx', import.meta.url), 'utf8');
const dashboardLayout = readFileSync(new URL('../src/components/DashboardLayout.tsx', import.meta.url), 'utf8');
const filterDropdown = readFileSync(new URL('../src/components/FilterDropdown.tsx', import.meta.url), 'utf8');
const laporanApi = readFileSync(new URL('../laporan-api.js', import.meta.url), 'utf8');

test('jamaah edit endpoint is agent-scoped, available to every agent, and stores manual biodata overrides', () => {
  assert.match(server, /app\.post\('\/api\/laporan\/jamaah\/update', authMiddleware/);
  assert.match(server, /\.eq\('id', rowId\)\s*\.eq\('agent_id', agentId\)/);
  assert.match(server, /isDashboardBelumDpJamaah\(existing\)/);
  assert.doesNotMatch(server, /canEditDashboardJamaah/);
  assert.doesNotMatch(server, /Edit data jamaah hanya tersedia untuk agent Nikita/);
  assert.match(server, /Edit data hanya tersedia untuk jamaah yang belum DP/);
  assert.match(server, /submitUmrahJamaahEditWithBrowser/);
  assert.match(server, /Gagal menyimpan data ke sistem internal/);
  assert.match(server, /internal_edit_updated_at/);
  assert.match(server, /manual_edit_fields/);
  assert.match(server, /legacyFields\.pekerjaan/);
  assert.match(server, /legacyFields\.pendamping/);
  assert.match(server, /legacyFields\.pengalaman/);
  assert.match(server, /legacyFields\.alamat/);
  assert.match(server, /legacyFields\.prov/);
  assert.match(server, /legacyFields\.kab/);
  assert.match(server, /legacyFields\.kec/);
  assert.match(server, /legacyFields\.kel/);
  assert.match(server, /manual_overrides:\s*manualOverrides/);
  assert.match(server, /normalizeDashboardJamaahPhone/);
});

test('jamaah edit form loader reads same legacy edit form options', () => {
  assert.match(server, /app\.get\('\/api\/laporan\/jamaah\/:rowId\/edit-form', authMiddleware/);
  assert.match(server, /fetchUmrahJamaahEditForm/);
  assert.match(laporanApi, /export async function fetchUmrahJamaahEditForm/);
  assert.match(laporanApi, /collectLegacyFormFields/);
  assert.match(laporanApi, /route=umrah&act=edaftar/);
});

test('jamaah dashboard lets every agent open compact edit pages only through Belum DP pencil icons', () => {
  assert.match(page, /showBelumDpEdit\s*=\s*paymentStatus === 'belum'/);
  assert.doesNotMatch(page, /canEditJamaah/);
  assert.doesNotMatch(page, /disabled=\{!canEditJamaah\}/);
  assert.doesNotMatch(page, /Edit data jamaah hanya tersedia untuk agent Nikita/);
  assert.match(page, /renderBelumDpEditIcon\(item/);
  assert.match(page, /Edit data jamaah belum DP/);
  assert.match(page, /goTo\(`\/dashboard\/jamaah\/edit\/\$\{encodeURIComponent\(item\.id\)\}`\)/);
  assert.doesNotMatch(page, /jamaah-edit-modal/);
  assert.match(page, /formatJamaahPhone/);
});

test('jamaah edit route renders a compact page with the same visible fields as new input', () => {
  assert.match(dashboardLayout, /JamaahEditPage/);
  assert.match(dashboardLayout, /jamaahSub === 'edit'/);
  assert.match(dashboardLayout, /\/dashboard\/jamaah\/edit\/:id/);
  assert.match(dashboardLayout, /jamaahEditHeader/);
  assert.match(dashboardLayout, /onHeaderTitle=\{setJamaahEditHeader\}/);
  assert.match(editPage, /fetch\(`\/api\/laporan\/jamaah\/\$\{encodeURIComponent\(rowId\)\}\/edit-form`/);
  assert.match(editPage, /fetch\('\/api\/laporan\/jamaah\/update'/);
  assert.match(editPage, /onHeaderTitle\?\.\(\{/);
  assert.match(editPage, /formatPhoneForInput/);
  assert.doesNotMatch(editPage, /formatWaDisplay/);
  assert.match(editPage, /key === 'wa' \? e\.target\.value\.replace\(\/\\s\+\/g, ''\)/);
  assert.match(editPage, /tpendaftar:\s*hidden\.tpendaftar \|\| form\.wa \|\| '1111111111'/);
  assert.match(editPage, /nama:\s*fullName/);
  assert.match(editPage, /Edit Data Jamaah/);
  assert.match(editPage, /Nama Depan/);
  assert.match(editPage, /Nama Tengah/);
  assert.match(editPage, /Nama Belakang/);
  assert.match(editPage, /Jenis Kelamin/);
  assert.match(editPage, /No\. KTP/);
  assert.match(editPage, /Nama Pendaftar/);
  assert.match(editPage, /No\. Telp\/HP Jamaah/);
  assert.match(editPage, /Tempat Lahir/);
  assert.match(editPage, /Tanggal Lahir/);
  assert.match(editPage, /Status Nikah/);
  assert.match(editPage, /Pekerjaan/);
  assert.match(editPage, /Alamat \(Sesuai KTP\)/);
  assert.match(editPage, /Pendamping \(Keberangkatan\)/);
  assert.match(editPage, /Pengalaman Umrah/);
  assert.match(editPage, /Remarks/);
  assert.match(editPage, /<Save size=\{16\}/);
  assert.match(editPage, /Menyimpan perubahan/);
  assert.match(editPage, /Data jamaah sedang diperbarui/);
  assert.doesNotMatch(editPage, /Menyimpan ke sistem internal/);
  assert.match(editPage, /FilterDropdown/);
  assert.match(editPage, /inputSkin/);
  assert.match(filterDropdown, /inputSkin\?: boolean/);
  assert.match(filterDropdown, /formInputSkin/);
  assert.match(editPage, /rounded-2xl/);
  assert.match(editPage, /rounded-xl/);
  assert.doesNotMatch(editPage, /rounded-md/);
  assert.doesNotMatch(editPage, /text-\[9px\]/);
  assert.doesNotMatch(editPage, /ChevronLeft/);
  assert.doesNotMatch(editPage, /title="Kembali"/);
  assert.doesNotMatch(editPage, /renderInput\('mahram'/);
  assert.doesNotMatch(editPage, /renderInput\('no_paspor'/);
  assert.doesNotMatch(editPage, /renderSelect\('prov'/);
  assert.doesNotMatch(editPage, /renderSelect\('kab'/);
  assert.doesNotMatch(editPage, /renderSelect\('kec'/);
  assert.doesNotMatch(editPage, /renderSelect\('kel'/);
});

test('jamaah edit route uses a layout-stable skeleton while its code and data load', () => {
  assert.match(dashboardLayout, /isJamaahEdit \? <JamaahEditSkeleton \/>/);
  assert.match(editPage, /if \(loading\) \{\s*return <JamaahEditSkeleton \/>/);
  assert.match(editSkeleton, /role="status"/);
  assert.match(editSkeleton, /animate-pulse/);
  assert.match(editSkeleton, /bg-gray-100 dark:bg-slate-900/);
  assert.match(editSkeleton, /rounded-2xl/);
  assert.match(editSkeleton, /h-\[42px\]/);
  assert.match(editSkeleton, /h-\[84px\]/);
});

test('jamaah edit write-back uses legacy browser form with recaptcha', () => {
  assert.match(laporanApi, /export async function submitUmrahJamaahEditWithBrowser/);
  assert.match(laporanApi, /route=umrah&act=edaftar/);
  assert.match(laporanApi, /submitCurrentLegacyBrowserFormWithRecaptcha/);
  assert.match(laporanApi, /aksi_umrah\.php/);
  assert.match(laporanApi, /route=dokumen&act=edit-dokumen/);
  assert.match(laporanApi, /prov:\s*'prov'/);
  assert.match(laporanApi, /kab:\s*'kab'/);
  assert.match(laporanApi, /kec:\s*'kec'/);
  assert.match(laporanApi, /kel:\s*'kel'/);
});
